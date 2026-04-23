import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { cleanAddress, cleanEmail, cleanPhone, cleanCompany, parseGeschaeftsfuehrer } from "@/lib/profile-cleanup";
import { canonicalKey, resolveCompany } from "@/lib/dedupe";
import type { Hit } from "@/lib/types";
import { FeedbackForm } from "@/components/feedback-form";
import { StatusForm } from "./status-form";

export const dynamic = "force-dynamic";

const CATEGORY_LABELS: Record<string, string> = {
  clear_violation: "Klare Verletzung",
  suspected_violation: "Verdacht auf Verletzung",
  borderline: "Grenzwertig",
  generic_use: "Generische Nutzung",
  own_brand: "Eigene Marke",
  other_industry: "Andere Branche",
  not_relevant: "Nicht relevant",
};

function scoreConfig(score: number | null) {
  if (score === null) return { label: "—", color: "bg-stone-200 text-stone-600", ring: "ring-stone-300", banner: null };
  if (score >= 9) return { label: "Critical", color: "bg-rose-600 text-white", ring: "ring-rose-500", banner: "bg-rose-50 border-rose-200 text-rose-900" };
  if (score >= 7) return { label: "Hoch", color: "bg-rose-100 text-rose-900", ring: "ring-rose-300", banner: "bg-orange-50 border-orange-200 text-orange-900" };
  if (score >= 5) return { label: "Mittel", color: "bg-amber-100 text-amber-900", ring: "ring-amber-300", banner: null };
  return { label: "Niedrig", color: "bg-stone-200 text-stone-600", ring: "ring-stone-300", banner: null };
}

export default async function HitDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [hitRes, allRes] = await Promise.all([
    supabase.from("hits").select("*").eq("id", id).single(),
    supabase.from("hits").select("*").limit(500),
  ]);
  if (!hitRes.data) notFound();
  const hit = hitRes.data as Hit;

  const profile = {
    company: resolveCompany(hit) ?? cleanCompany(hit.company_name),
    address: cleanAddress(hit.address),
    email: cleanEmail(hit.email),
    phone: cleanPhone(hit.phone),
    gf: parseGeschaeftsfuehrer(hit.impressum_raw),
  };

  const myKey = canonicalKey(hit);
  const groupHits = ((allRes.data ?? []) as Hit[])
    .filter((s) => canonicalKey(s) === myKey)
    .sort((a, b) => {
      if (a.id === hit.id) return -1;
      if (b.id === hit.id) return 1;
      return (b.ai_score ?? -1) - (a.ai_score ?? -1);
    });

  const cfg = scoreConfig(hit.ai_score);

  return (
    <AppShell user={auth.user}>
      <div className="mx-auto max-w-4xl space-y-5 pb-16">
        {/* Back */}
        <Link href="/" className="text-xs text-stone-500 hover:text-stone-800">← Zurück zur Übersicht</Link>

        {/* Critical/High alert banner */}
        {cfg.banner && (
          <div className={`flex items-center gap-3 rounded-2xl border px-5 py-3 text-sm font-medium ${cfg.banner}`}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            {hit.ai_score !== null && hit.ai_score >= 9
              ? "Dringend: Diese Fundstelle ist ein klarer Markenrechtsverdacht — sofortige Anwaltskonsultation empfohlen."
              : "Hohe Relevanz: Diese Fundstelle sollte zeitnah rechtlich geprüft werden."}
          </div>
        )}

        {/* Header: Score + Title */}
        <div className="flex items-start gap-5">
          <div className={`flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl text-center ring-4 ${cfg.color} ${cfg.ring}`}>
            <span className="text-xl font-black leading-none">{hit.ai_score ?? "—"}</span>
            <span className="text-[9px] font-semibold uppercase tracking-wider opacity-80">{cfg.label}</span>
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold text-stone-900">{profile.company ?? hit.domain}</h1>
            <a href={hit.url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-sm text-orange-700 hover:underline">{hit.url}</a>
            {hit.violation_category && (
              <span className="mt-2 inline-block rounded-full bg-stone-100 px-3 py-0.5 text-[11px] font-semibold text-stone-700">
                {CATEGORY_LABELS[hit.violation_category] ?? hit.violation_category}
              </span>
            )}
          </div>
        </div>

        {/* Verletzer-Profil */}
        <section className="glass p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-500">Verletzer-Profil</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <DetailTile icon="building" label="Firmenname" value={profile.company} />
            <DetailTile icon="user" label="Geschäftsführer / Inhaber" value={profile.gf} />
            <DetailTile icon="map-pin" label="Anschrift" value={profile.address} />
            <DetailTile icon="globe" label="Domain" value={hit.domain} href={`https://${hit.domain}`} />
            <DetailTile icon="mail" label="E-Mail" value={profile.email} href={profile.email ? `mailto:${profile.email}` : undefined} />
            <DetailTile icon="phone" label="Telefon" value={profile.phone} href={profile.phone ? `tel:${profile.phone.replace(/[^+0-9]/g, "")}` : undefined} />
          </div>
          {hit.social_links && Object.keys(hit.social_links).length > 0 && (
            <div className="mt-4 border-t border-white/60 pt-4">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-stone-500">Social Media</div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(hit.social_links).map(([name, href]) => (
                  <a key={name} href={href} target="_blank" rel="noopener noreferrer"
                    className="rounded-full border border-white/70 bg-white/70 px-3 py-1 text-xs font-medium text-stone-700 hover:bg-white/90 capitalize">
                    {name}
                  </a>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* KI-Analyse */}
        <section className="glass p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-500">KI-Analyse</h2>
          <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Chip label="Score" value={hit.ai_score !== null ? `${hit.ai_score} / 10` : "—"} />
            <Chip label="Verletzung" value={hit.ai_is_violation === null ? "—" : hit.ai_is_violation ? "Ja" : "Nein"} highlight={!!hit.ai_is_violation} />
            <Chip label="Kategorie" value={CATEGORY_LABELS[hit.violation_category ?? ""] ?? hit.violation_category ?? "—"} />
            <Chip label="Modell" value={hit.ai_model ?? "Gemini"} />
          </div>
          <div className="space-y-4">
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-stone-500">Begründung</div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800">{hit.ai_reasoning ?? "—"}</p>
            </div>
            <div className="border-t border-white/60 pt-4">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-stone-500">Empfehlung</div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-stone-800">{hit.ai_recommendation ?? "—"}</p>
            </div>
          </div>
        </section>

        {/* Impressum-Auszug */}
        {hit.impressum_raw && (
          <details className="glass group p-6">
            <summary className="cursor-pointer select-none text-sm font-semibold text-stone-700 group-open:mb-4">
              Impressum-Rohtext anzeigen
            </summary>
            <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-stone-950 p-4 font-mono text-[11px] leading-relaxed text-stone-300">
              {hit.impressum_raw}
            </pre>
          </details>
        )}

        {/* Zugeordnete Domains */}
        {groupHits.length > 1 && (
          <section className="glass p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-500">
              Zugeordnete Domains <span className="ml-1 text-stone-400">· {groupHits.length}</span>
            </h2>
            <ul className="space-y-2">
              {groupHits.map((r) => (
                <li key={r.id}>
                  {r.id === hit.id ? (
                    <div className="flex items-center gap-3 rounded-xl border border-stone-300 bg-white px-4 py-3 ring-1 ring-stone-900/10">
                      <ScoreBadge score={r.ai_score} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-[13px] font-semibold text-stone-900">{r.domain}</span>
                          <span className="rounded-full bg-stone-900 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-white">Dieser Eintrag</span>
                        </div>
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="block truncate text-[11px] text-stone-500 hover:text-stone-800">{r.url}</a>
                      </div>
                    </div>
                  ) : (
                    <Link href={`/hits/${r.id}`} className="flex items-center gap-3 rounded-xl border border-white/70 bg-white/60 px-4 py-3 transition hover:bg-white/90">
                      <ScoreBadge score={r.ai_score} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-stone-900">{r.domain}</div>
                        <div className="truncate text-[11px] text-stone-500">{r.url}</div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-stone-400"><polyline points="9 18 15 12 9 6" /></svg>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        <FeedbackForm itemType="hit" itemId={hit.id} currentScore={hit.ai_score} />

        <section className="glass p-6">
          <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-stone-500">Workflow</h2>
          <StatusForm hitId={hit.id} domain={hit.domain} initialStatus={hit.status} initialNotes={hit.notes} />
        </section>
      </div>
    </AppShell>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  const cls = score === null ? "bg-stone-200/70 text-stone-700"
    : score >= 7 ? "bg-rose-100 text-rose-900"
    : score >= 4 ? "bg-amber-100 text-amber-900"
    : "bg-emerald-100 text-emerald-900";
  return <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${cls}`}>{score ?? "—"}</span>;
}

function Chip({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl border px-3 py-2 ${highlight ? "border-rose-200 bg-rose-50" : "border-white/70 bg-white/50"}`}>
      <div className="text-[9px] font-semibold uppercase tracking-wider text-stone-500">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold ${highlight ? "text-rose-800" : "text-stone-900"}`}>{value}</div>
    </div>
  );
}

const ICONS: Record<string, string> = {
  building: "M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10",
  user: "M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2 M12 11a4 4 0 100-8 4 4 0 000 8z",
  "map-pin": "M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0118 0z M12 10a1 1 0 100-2 1 1 0 000 2z",
  globe: "M12 2a10 10 0 100 20A10 10 0 0012 2z M2 12h20 M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z",
  mail: "M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z M22 6l-10 7L2 6",
  phone: "M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.63 2 2 0 012-2.18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 6c1.06 1.82 2.5 3.27 4.32 4.32l.82-.82a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z",
};

function DetailTile({ label, value, href, icon }: { label: string; value: string | null; href?: string; icon: string }) {
  const d = ICONS[icon] ?? "";
  const body = (
    <div className={`flex items-start gap-3 rounded-xl border border-white/70 bg-white/60 p-3.5 transition ${href && value ? "hover:bg-white/90" : ""}`}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-stone-400">
        {d.split(" M").map((seg, i) => <path key={i} d={i === 0 ? seg : "M" + seg} />)}
      </svg>
      <div className="min-w-0 flex-1">
        <div className="text-[9px] font-semibold uppercase tracking-wider text-stone-500">{label}</div>
        <div className="mt-0.5 break-words text-sm font-medium text-stone-900">
          {value ?? <span className="font-normal text-stone-400">—</span>}
        </div>
      </div>
    </div>
  );
  return value && href ? <a href={href} target="_blank" rel="noopener noreferrer" className="block">{body}</a> : body;
}
