"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setPending(false);
    if (error) { setError(error.message); return; }
    router.replace("/");
    router.refresh();
  }

  async function onReset(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/account/reset`,
    });
    setPending(false);
    if (error) { setError(error.message); return; }
    setResetSent(true);
  }

  if (resetSent) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="glass-strong w-full max-w-sm p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h1 className="text-base font-semibold text-stone-900">E-Mail gesendet</h1>
          <p className="mt-2 text-sm text-stone-500">
            Prüfe deinen Posteingang und klicke auf den Link zum Zurücksetzen des Passworts.
          </p>
          <button onClick={() => { setResetSent(false); setShowReset(false); }} className="mt-4 text-xs text-stone-500 hover:text-stone-800">
            ← Zurück zur Anmeldung
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={showReset ? onReset : onSubmit} className="glass-strong w-full max-w-sm p-8">
        <h1 className="text-xl font-semibold text-stone-900">Master Brand Monitor</h1>
        <p className="mt-1 text-sm text-stone-500">
          {showReset ? "Passwort zurücksetzen." : "Bitte anmelden."}
        </p>

        <label className="mt-6 block text-sm">
          <span className="text-xs uppercase tracking-wide text-stone-500">E-Mail</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 h-10 w-full rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm outline-none focus:border-stone-400"
          />
        </label>

        {!showReset && (
          <label className="mt-4 block text-sm">
            <span className="text-xs uppercase tracking-wide text-stone-500">Passwort</span>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 h-10 w-full rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm outline-none focus:border-stone-400"
            />
          </label>
        )}

        {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-6 h-10 w-full rounded-full bg-stone-900 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending
            ? (showReset ? "Wird gesendet…" : "Anmelden…")
            : (showReset ? "Link senden" : "Anmelden")}
        </button>

        <div className="mt-4 flex items-center justify-between text-xs text-stone-500">
          <button type="button" onClick={() => { setShowReset(!showReset); setError(null); }} className="hover:text-stone-800">
            {showReset ? "← Zurück" : "Passwort vergessen?"}
          </button>
          {!showReset && (
            <Link href="/register" className="hover:text-stone-800">
              Registrieren →
            </Link>
          )}
        </div>
      </form>
    </main>
  );
}
