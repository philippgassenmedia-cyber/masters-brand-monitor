"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface WebsiteProfile {
  company: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  social: Record<string, string> | null;
}

export function WebsiteLookup({
  trademarkId,
  companyName,
  existingUrl,
}: {
  trademarkId: string;
  companyName: string;
  existingUrl: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    url: string;
    profile: WebsiteProfile | null;
  } | null>(existingUrl ? { url: existingUrl, profile: null } : null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const lookup = () => {
    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/dpma/website-lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trademarkId, companyName }),
      });
      const data = await res.json();
      if (data.ok) {
        setResult({ url: data.url, profile: data.profile });
        router.refresh();
      } else {
        setError(data.message ?? "Website nicht gefunden");
      }
    });
  };

  return (
    <section className="glass mt-6 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-stone-900">Web-Präsenz</h2>
        <button
          onClick={lookup}
          disabled={pending}
          className="h-9 rounded-full bg-stone-900 px-5 text-xs font-semibold text-white shadow-[0_4px_16px_rgba(68,64,60,0.2)] hover:bg-stone-800 disabled:opacity-60"
        >
          {pending ? "Suche…" : result ? "Erneut suchen" : "Website finden"}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-2 text-sm text-rose-800">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-white/70 bg-white/60 p-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-stone-900 text-white">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-wider text-stone-500">Website</div>
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block truncate text-sm font-semibold text-stone-900 hover:underline"
              >
                {result.url}
              </a>
            </div>
          </div>

          {result.profile && (
            <div className="grid gap-2 sm:grid-cols-2">
              {result.profile.company && (
                <ProfileField icon="🏢" label="Firma" value={result.profile.company} />
              )}
              {result.profile.address && (
                <ProfileField icon="📍" label="Adresse" value={result.profile.address} />
              )}
              {result.profile.email && (
                <ProfileField
                  icon="✉️"
                  label="E-Mail"
                  value={result.profile.email}
                  href={`mailto:${result.profile.email}`}
                />
              )}
              {result.profile.phone && (
                <ProfileField
                  icon="📞"
                  label="Telefon"
                  value={result.profile.phone}
                  href={`tel:${result.profile.phone.replace(/[^+0-9]/g, "")}`}
                />
              )}
            </div>
          )}

          {result.profile?.social && Object.keys(result.profile.social).length > 0 && (
            <div>
              <div className="mb-2 text-[10px] uppercase tracking-wider text-stone-500">
                Social Media
              </div>
              <div className="flex flex-wrap gap-2">
                {Object.entries(result.profile.social).map(([name, href]) => (
                  <a
                    key={name}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-full border border-white/70 bg-white/60 px-3 py-1 text-xs font-medium capitalize text-stone-700 hover:bg-white/90"
                  >
                    {name}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!result && !error && !pending && (
        <div className="text-xs text-stone-500">
          Sucht die offizielle Website und extrahiert Impressum-Daten der Firma.
        </div>
      )}
    </section>
  );
}

function ProfileField({
  icon,
  label,
  value,
  href,
}: {
  icon: string;
  label: string;
  value: string;
  href?: string;
}) {
  const inner = (
    <div className="flex items-start gap-2 rounded-xl border border-white/70 bg-white/60 px-3 py-2">
      <span className="mt-0.5 text-sm">{icon}</span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-stone-500">{label}</div>
        <div className="break-words text-xs font-medium text-stone-900">{value}</div>
      </div>
    </div>
  );
  return href ? (
    <a href={href} className="block">
      {inner}
    </a>
  ) : (
    inner
  );
}
