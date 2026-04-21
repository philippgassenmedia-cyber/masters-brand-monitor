// DPMA-Pipeline: E-Mails abholen → parsen → matchen → klassifizieren → speichern.

import { getSupabaseAdminClient } from "../supabase/server";
import {
  getActiveImapConfig,
  fetchNewDpmaEmails,
  moveEmail,
  updateImapStatus,
} from "./imap-client";
import { parseDpmaEmail } from "./mail-parser";
import { matchAgainstStems } from "./matching";
import { classifyTrademark } from "./classifier";
import { resolveCompanyProfile } from "../resolve-company";
import type { DpmaKurierHit } from "./types";

export interface DpmaPipelineResult {
  emailsProcessed: number;
  hitsFound: number;
  newTrademarks: number;
  updated: number;
  errors: string[];
  deadLettered: number;
}

export async function runDpmaPipeline(): Promise<DpmaPipelineResult> {
  const db = getSupabaseAdminClient();
  const result: DpmaPipelineResult = {
    emailsProcessed: 0,
    hitsFound: 0,
    newTrademarks: 0,
    updated: 0,
    errors: [],
    deadLettered: 0,
  };

  // 1. IMAP-Konfiguration laden
  const imapConfig = await getActiveImapConfig();
  if (!imapConfig) {
    result.errors.push("Kein aktives IMAP-Konto konfiguriert");
    return result;
  }

  // 2. Aktive Markenstämme laden
  const { data: stemsData } = await db
    .from("brand_stems")
    .select("stamm")
    .eq("aktiv", true);
  const stems = (stemsData ?? []).map((s) => s.stamm as string);
  if (!stems.length) stems.push("master");

  // 3. E-Mails abholen
  let emails;
  try {
    emails = await fetchNewDpmaEmails(imapConfig);
    await updateImapStatus(imapConfig.id, "ok", `${emails.length} E-Mails abgerufen`);
  } catch (e) {
    const msg = (e as Error).message;
    await updateImapStatus(imapConfig.id, "error", msg);
    result.errors.push(`IMAP-Fehler: ${msg}`);
    return result;
  }

  if (!emails.length) return result;

  // 4. Jede E-Mail verarbeiten
  for (const email of emails) {
    try {
      // Prüfen ob bereits verarbeitet
      const { data: existing } = await db
        .from("processed_emails")
        .select("id")
        .eq("message_id", email.messageId)
        .maybeSingle();

      if (existing) {
        // Bereits verarbeitet — in processed-Ordner verschieben
        await moveEmail(email.uid, imapConfig.processedFolder, imapConfig).catch(() => {});
        continue;
      }

      // E-Mail parsen
      const body = email.htmlContent || email.textContent;
      const { hits, errors } = await parseDpmaEmail(body);

      if (errors.length > 0 && hits.length === 0) {
        // Dead Letter Queue: Parse komplett fehlgeschlagen
        await db.from("dead_letter_emails").insert({
          message_id: email.messageId,
          subject: email.subject,
          from_address: email.from,
          received_at: email.date.toISOString(),
          error_message: errors.join("; "),
          raw_body: body.slice(0, 50_000),
          imap_account_id: imapConfig.id,
        });
        result.deadLettered++;
        // In review-Ordner verschieben
        await moveEmail(email.uid, imapConfig.reviewFolder, imapConfig).catch(() => {});
        continue;
      }

      result.emailsProcessed++;
      result.hitsFound += hits.length;

      // Hits verarbeiten
      for (const hit of hits) {
        try {
          await processHit(db, hit, stems, email.messageId);
          result.newTrademarks++;
        } catch (e) {
          const msg = (e as Error).message;
          if (msg.includes("duplicate") || msg.includes("unique")) {
            // Duplikat → last_seen_at updaten
            await db
              .from("trademarks")
              .update({ last_seen_at: new Date().toISOString() })
              .eq("aktenzeichen", hit.aktenzeichen);
            result.updated++;
          } else {
            result.errors.push(`${hit.aktenzeichen}: ${msg.slice(0, 150)}`);
          }
        }
      }

      // Verarbeitete E-Mail protokollieren
      await db.from("processed_emails").insert({
        message_id: email.messageId,
        subject: email.subject,
        from_address: email.from,
        received_at: email.date.toISOString(),
        hits_found: hits.length,
        errors: errors,
        imap_account_id: imapConfig.id,
      });

      // E-Mail in processed-Ordner verschieben
      await moveEmail(email.uid, imapConfig.processedFolder, imapConfig).catch(() => {});
    } catch (e) {
      result.errors.push(`E-Mail ${email.messageId}: ${(e as Error).message.slice(0, 150)}`);
    }
  }

  return result;
}

async function processHit(
  db: ReturnType<typeof getSupabaseAdminClient>,
  hit: DpmaKurierHit,
  stems: string[],
  rawEmailId: string,
): Promise<void> {
  const match = matchAgainstStems(hit.markenname, stems);
  const classification = await classifyTrademark(hit, match);

  // Widerspruchsfrist berechnen
  const fristEnde = hit.veroeffentlichungstag
    ? (() => {
        const d = new Date(hit.veroeffentlichungstag);
        if (isNaN(d.getTime())) return null;
        d.setMonth(d.getMonth() + 3);
        return d.toISOString().slice(0, 10);
      })()
    : null;

  // Website automatisch suchen bei relevantem Treffer
  let resolvedWebsite: string | null = null;
  if (classification.score >= 5 || match.type === "exact" || match.type === "compound") {
    try {
      const searchName = hit.markenname + (hit.anmelder ? ` ${hit.anmelder}` : "");
      const { resolvedUrl } = await resolveCompanyProfile(searchName);
      resolvedWebsite = resolvedUrl;
    } catch {
      // Website-Suche ist optional
    }
  }

  await db.from("trademarks").insert({
    aktenzeichen: hit.aktenzeichen,
    markenname: hit.markenname,
    anmelder: hit.anmelder,
    anmeldetag: hit.anmeldetag,
    veroeffentlichungstag: hit.veroeffentlichungstag,
    widerspruchsfrist_ende: fristEnde,
    status: hit.status,
    nizza_klassen: hit.nizza_klassen,
    waren_dienstleistungen: hit.waren_dienstleistungen,
    inhaber_anschrift: hit.inhaber_anschrift,
    vertreter: hit.vertreter,
    markenform: hit.markenform,
    schutzdauer_bis: hit.schutzdauer_bis,
    quelle: "dpma_kurier",
    quelle_detail: rawEmailId,
    match_type: match.type,
    markenstamm: match.stem,
    register_url: `https://register.dpma.de/DPMAregister/marke/register/${hit.aktenzeichen}/DE`,
    relevance_score: classification.score,
    branchenbezug: classification.branchenbezug,
    prioritaet: classification.prioritaet,
    begruendung: classification.begruendung,
    raw_email_id: rawEmailId,
    resolved_website: resolvedWebsite,
  });
}
