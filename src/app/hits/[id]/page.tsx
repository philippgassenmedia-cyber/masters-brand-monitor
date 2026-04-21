import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { cleanAddress, cleanEmail, cleanPhone } from "@/lib/profile-cleanup";
import { canonicalKey, resolveCompany } from "@/lib/dedupe";
import { distance as levenshtein } from "fastest-levenshtein";
import type { Hit } from "@/lib/types";
import { StatusForm } from "./status-form";

export const dynamic = "force-dynamic";

export default async function HitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
    company: resolveCompany(hit),
    address: cleanAddress(hit.address),
    email: cleanEmail(hit.email),
    phone: cleanPhone(hit.phone),
  };

  const myKey = canonicalKey(hit);
  const groupHits = ((allRes.data ?? []) as Hit[])
    .filter((s) => canonicalKey(s) === myKey)
    .sort((a, b) => {
      if (a.id === hit.id) return -1;
      if (b.id === hit.id) return 1;
      return (b.ai_score ?? -1) - (a.ai_score ?? -1);
    });

  return (
    <AppShell user={auth.user}>
      <Link href="/" className="text-xs text-stone-500 hover:text-stone-800">
        ← Zurück zur Übersicht
      </Link>

      <h1 className="mt-4 text-2xl font-semibold text-stone-900">
        {profile.company ?? hit.domain}
      </h1>
      <a href={hit.url} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-sm text-orange-700 hover:underline">
        {hit.url}
      </a>

      <section className="glass mt-6 grid gap-4 p-6">
        <h2 className="text-lg font-semibold">KI-Bewertung</h2>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <Field label="Score" value={hit.ai_score !== null ? `${hit.ai_score} / 10` : "—"} />
          <Field label="Verletzung" value={hit.ai_is_violation === null ? "—" : hit.ai_is_violation ? "Ja" : "Nein"} />
          <Field label="Kategorie" value={hit.violation_category ?? "—"} />
          <Field label="Modell" value={hit.ai_model ?? "—"} />
        </dl>
        <div>
          <div className="text-xs uppercase tracking-wide text-stone-500">Begründung</div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{hit.ai_reasoning ?? "—"}</p>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wide text-stone-500">Empfehlung</div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{hit.ai_recommendation ?? "—"}</p>
        </div>
      </section>

      {/* Zugeordnete Domains */}
      <section className="glass mt-6 p-6">
        <h2 className="mb-4 text-lg font-semibold text-stone-900">
          Zugeordnete Domains <span className="ml-2 text-sm font-normal text-stone-500">· {groupHits.length}</span>
        </h2>
        <ul className="space-y-2">
          {groupHits.map((r) => (
            <li key={r.id}>
              {r.id === hit.id ? (
                <div className="flex items-center gap-3 rounded-xl border border-stone-300 bg-white px-4 py-3 ring-1 ring-stone-900/10">
                  <ScoreBadge score={r.ai_score} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate text-[13px] font-semibold text-stone-900">{r.domain}</div>
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

      {/* Verletzer-Profil */}
      <section className="glass mt-6 p-6">
        <h2 className="mb-4 text-lg font-semibold text-stone-900">Verletzer-Profil</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <ProfileTile label="Firmenname" value={profile.company} />
          <ProfileTile label="Adresse" value={profile.address} />
          <ProfileTile label="E-Mail" value={profile.email} href={profile.email ? `mailto:${profile.email}` : undefined} />
          <ProfileTile label="Telefon" value={profile.phone} href={profile.phone ? `tel:${profile.phone.replace(/[^+0-9]/g, "")}` : undefined} />
        </div>
        {hit.social_links && Object.keys(hit.social_links).length > 0 && (
          <div className="mt-5">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-wider text-stone-500">Social Media</div>
            <ul className="flex flex-wrap gap-2">
              {Object.entries(hit.social_links).map(([name, href]) => (
                <li key={name}>
                  <a href={href} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/70 bg-white/60 px-3 py-1 text-xs font-medium text-stone-700 hover:bg-white/90">{name}</a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="glass mt-6 p-6">
        <h2 className="text-lg font-semibold">Workflow</h2>
        <StatusForm hitId={hit.id} domain={hit.domain} initialStatus={hit.status} initialNotes={hit.notes} />
      </section>
    </AppShell>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-stone-500">{label}</dt>
      <dd className="mt-1 text-sm">{value}</dd>
    </div>
  );
}

function ScoreBadge({ score }: { score: number | null }) {
  const cls = score === null ? "bg-stone-200/70 text-stone-700" : score >= 7 ? "bg-rose-100 text-rose-900" : score >= 4 ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-900";
  return <span className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${cls}`}>{score ?? "—"}</span>;
}

function ProfileTile({ label, value, href }: { label: string; value: string | null; href?: string }) {
  const body = (
    <div className="flex items-start gap-3 rounded-xl border border-white/70 bg-white/60 p-4 transition hover:bg-white/80">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-medium uppercase tracking-wider text-stone-500">{label}</div>
        <div className="mt-0.5 break-words text-sm font-semibold text-stone-900">
          {value ?? <span className="font-normal text-stone-400">Nicht verfügbar</span>}
        </div>
      </div>
    </div>
  );
  return value && href ? <a href={href} className="block">{body}</a> : body;
}
