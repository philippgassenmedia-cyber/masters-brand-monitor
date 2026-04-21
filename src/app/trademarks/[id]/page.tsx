import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { getNizzaBeschreibung, isImmobilienKlasse } from "@/lib/dpma/nizza-klassen";
import { distance as levenshtein } from "fastest-levenshtein";
import type { Trademark } from "@/lib/dpma/types";
import { WebsiteLookup } from "./website-lookup";
import { TrademarkExcludeButton } from "@/components/trademark-exclude-button";
import { FeedbackForm } from "@/components/feedback-form";

export const dynamic = "force-dynamic";

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / 86_400_000);
}

export default async function TrademarkDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [tmRes, webHitsRes] = await Promise.all([
    supabase.from("trademarks").select("*").eq("id", id).single(),
    supabase.from("hits").select("id, url, domain, company_name, ai_score, ai_reasoning").limit(500),
  ]);
  if (!tmRes.data) notFound();
  const tm = tmRes.data as Trademark;

  // Web-Hits matchen: strikter Abgleich Markenname ↔ Firmenname
  function normalizeForMatch(s: string): string {
    return s
      .toLowerCase()
      .replace(/\b(gmbh|ug|ag|kg|ohg|mbh|ltd|inc|e\.?k\.?|e\.?v\.?|&\s*co\.?\s*kg)\b/gi, "")
      .replace(/[^a-zäöüß0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const tmNorm = normalizeForMatch(tm.markenname);
  const tmWords = tmNorm.split(" ").filter((w) => w.length >= 3);

  const matchedWebHits = tmWords.length < 1
    ? []
    : (webHitsRes.data ?? [])
        .map((h) => {
          const hitName = normalizeForMatch(h.company_name ?? h.domain ?? "");
          if (!hitName) return null;

          // Exakt-Match (normalisiert)
          if (hitName === tmNorm) return { ...h, matchQuality: "exact" as const };

          // Levenshtein auf den ganzen Namen (nur bei ähnlicher Länge)
          if (Math.abs(hitName.length - tmNorm.length) <= 5) {
            const dist = levenshtein(hitName, tmNorm);
            if (dist <= 2) return { ...h, matchQuality: "fuzzy" as const };
          }

          // Compound: Markenname ist vollständig im Firmennamen enthalten
          // aber nur wenn Markenname mindestens 2 Wörter hat
          if (tmWords.length >= 2 && hitName.includes(tmNorm)) {
            return { ...h, matchQuality: "compound" as const };
          }

          // Wort-Match: alle Wörter des Markennamens (≥3 Zeichen) im Firmennamen
          // nur wenn mindestens 2 signifikante Wörter matchen
          if (tmWords.length >= 2) {
            const matched = tmWords.filter((w) => hitName.includes(w));
            if (matched.length === tmWords.length) {
              return { ...h, matchQuality: "words" as const };
            }
          }

          return null;
        })
        .filter((h): h is NonNullable<typeof h> => h !== null);
  const days = daysUntil(tm.widerspruchsfrist_ende);

  return (
    <AppShell user={auth.user}>
      <Link href="/trademarks" className="text-xs text-stone-500 hover:text-stone-800">
        ← Zurück zur Übersicht
      </Link>

      <div className="mt-4 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-stone-900">{tm.markenname}</h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-stone-600">
            <span>Aktenzeichen: {tm.aktenzeichen}</span>
            {tm.register_url && (
              <a
                href={tm.register_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-stone-500 hover:text-stone-800"
              >
                DPMAregister →
              </a>
            )}
          </div>
        </div>
        <TrademarkExcludeButton trademarkId={tm.id} markenname={tm.markenname} />
      </div>

      {/* Fristen-Countdown */}
      {days !== null && (
        <section className="glass mt-6 p-6">
          <h2 className="mb-3 text-lg font-semibold text-stone-900">Widerspruchsfrist</h2>
          <div className="flex items-center gap-6">
            <div
              className={`flex h-20 w-20 items-center justify-center rounded-2xl text-2xl font-bold ${
                days < 0
                  ? "bg-stone-200 text-stone-500 line-through"
                  : days <= 7
                    ? "bg-rose-100 text-rose-800"
                    : days <= 30
                      ? "bg-amber-100 text-amber-800"
                      : "bg-emerald-100 text-emerald-800"
              }`}
            >
              {days < 0 ? "0" : days}
            </div>
            <div>
              <div className="text-sm font-semibold text-stone-900">
                {days < 0
                  ? "Frist abgelaufen"
                  : days === 0
                    ? "Frist läuft HEUTE ab"
                    : days === 1
                      ? "Noch 1 Tag"
                      : `Noch ${days} Tage`}
              </div>
              <div className="mt-1 text-xs text-stone-600">
                Veröffentlichung: {tm.veroeffentlichungstag ?? "—"} · Fristende:{" "}
                {tm.widerspruchsfrist_ende ?? "—"}
              </div>
              {days > 0 && days <= 30 && (
                <div className="mt-2">
                  <div className="h-2 w-48 overflow-hidden rounded-full bg-stone-200/70">
                    <div
                      className={`h-full rounded-full ${
                        days <= 7 ? "bg-rose-500" : "bg-amber-500"
                      }`}
                      style={{ width: `${Math.max(4, 100 - (days / 90) * 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* KI-Bewertung */}
      <section className="glass mt-6 p-6">
        <h2 className="mb-4 text-lg font-semibold text-stone-900">Relevanz-Bewertung</h2>
        <div className="grid grid-cols-2 gap-4 text-sm md:grid-cols-4">
          <Field label="Score" value={tm.relevance_score !== null ? `${tm.relevance_score} / 10` : "—"} />
          <Field label="Priorität" value={tm.prioritaet ?? "—"} />
          <Field label="Match-Typ" value={tm.match_type ?? "—"} />
          <Field label="Markenstamm" value={tm.markenstamm ?? "—"} />
        </div>
        {tm.branchenbezug && (
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-wider text-stone-500">Branchenbezug</div>
            <p className="mt-1 text-sm">{tm.branchenbezug}</p>
          </div>
        )}
        {tm.begruendung && (
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-wider text-stone-500">Begründung</div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{tm.begruendung}</p>
          </div>
        )}
      </section>

      {/* Marken-Details */}
      <section className="glass mt-6 p-6">
        <h2 className="mb-4 text-lg font-semibold text-stone-900">Marken-Details</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <Field label="Anmelder / Inhaber" value={tm.anmelder ?? "—"} />
          <Field label="Status" value={tm.status ?? "—"} />
          <Field label="Markenform" value={tm.markenform ?? "—"} />
          <Field label="Anmeldetag" value={tm.anmeldetag ?? "—"} />
          <Field label="Veröffentlichung" value={tm.veroeffentlichungstag ?? "—"} />
          <Field label="Schutzdauer bis" value={tm.schutzdauer_bis ?? "—"} />
          <Field label="Quelle" value={tm.quelle ?? "—"} />
          <Field label="Match-Typ" value={tm.match_type ?? "—"} />
        </div>
        {tm.inhaber_anschrift && (
          <div className="mt-4">
            <div className="text-[10px] uppercase tracking-wider text-stone-500">Anschrift des Inhabers</div>
            <div className="mt-1 rounded-xl border border-white/70 bg-white/60 p-3 text-sm text-stone-800">
              {tm.inhaber_anschrift}
            </div>
          </div>
        )}
        {tm.vertreter && (
          <div className="mt-3">
            <div className="text-[10px] uppercase tracking-wider text-stone-500">Vertreter / Patentanwalt</div>
            <div className="mt-1 rounded-xl border border-white/70 bg-white/60 p-3 text-sm text-stone-800">
              {tm.vertreter}
            </div>
          </div>
        )}
      </section>

      {/* Waren/Dienstleistungen */}
      {tm.waren_dienstleistungen && (
        <section className="glass mt-6 p-6">
          <h2 className="mb-3 text-lg font-semibold text-stone-900">Verwendungszweck</h2>
          <div className="rounded-xl border border-white/70 bg-white/60 p-4 text-sm text-stone-800 leading-relaxed">
            {tm.waren_dienstleistungen}
          </div>
        </section>
      )}

      {/* Web-Treffer Cross-Match */}
      {matchedWebHits.length > 0 && (
        <section className="glass mt-6 p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-stone-900">
              Im Web gefunden
              <span className="ml-2 text-sm font-normal text-stone-500">· {matchedWebHits.length}</span>
            </h2>
            <div className="text-[11px] text-stone-500">
              Übereinstimmende Treffer aus der Web-Suche
            </div>
          </div>
          <div className="space-y-2">
            {matchedWebHits.map((h) => (
              <Link
                key={h.id}
                href={`/hits/${h.id}`}
                className="flex items-center gap-3 rounded-xl border border-white/70 bg-white/60 px-4 py-3 transition hover:bg-white/90"
              >
                <span
                  className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                    (h.ai_score ?? 0) >= 7
                      ? "bg-rose-100 text-rose-900"
                      : (h.ai_score ?? 0) >= 4
                        ? "bg-amber-100 text-amber-900"
                        : "bg-stone-200/70 text-stone-700"
                  }`}
                >
                  {h.ai_score ?? "—"}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] font-medium text-stone-900">
                    {h.company_name ?? h.domain}
                  </div>
                  <div className="truncate text-[11px] text-stone-500">{h.url}</div>
                </div>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-stone-400">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Web-Präsenz */}
      <WebsiteLookup
        trademarkId={tm.id}
        companyName={tm.markenname + (tm.anmelder ? ` ${tm.anmelder}` : "")}
        existingUrl={tm.resolved_website}
      />

      {/* Nizza-Klassen mit Beschreibung */}
      <section className="glass mt-6 p-6">
        <h2 className="mb-4 text-lg font-semibold text-stone-900">
          Waren- und Dienstleistungsklassen
          <span className="ml-2 text-sm font-normal text-stone-500">
            (Nizza-Klassifikation)
          </span>
        </h2>
        {tm.nizza_klassen && tm.nizza_klassen.length > 0 ? (
          <div className="space-y-2">
            {tm.nizza_klassen.map((k) => (
              <div
                key={k}
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
                  isImmobilienKlasse(k)
                    ? "border-amber-200/80 bg-amber-50/50"
                    : "border-white/70 bg-white/60"
                }`}
              >
                <span
                  className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                    isImmobilienKlasse(k)
                      ? "bg-amber-200/80 text-amber-900"
                      : "bg-stone-200/70 text-stone-700"
                  }`}
                >
                  {k}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-stone-900">
                    Klasse {k}
                    {isImmobilienKlasse(k) && (
                      <span className="ml-2 rounded-full bg-amber-200/70 px-2 py-0.5 text-[10px] font-semibold text-amber-900">
                        Immobilien-relevant
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-stone-600">
                    {getNizzaBeschreibung(k)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-sm text-stone-500">
            Keine Nizza-Klassen zugeordnet.
          </div>
        )}
      </section>

      <FeedbackForm itemType="trademark" itemId={tm.id} currentScore={tm.relevance_score} />
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] uppercase tracking-wider text-stone-500">{label}</dt>
      <dd className="mt-1 text-sm capitalize">{value}</dd>
    </div>
  );
}
