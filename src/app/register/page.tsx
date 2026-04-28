"use client";

import { useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwörter stimmen nicht überein.");
      return;
    }
    if (password.length < 8) {
      setError("Passwort muss mindestens 8 Zeichen haben.");
      return;
    }
    setPending(true);
    const supabase = getSupabaseBrowserClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { display_name: name || undefined } },
    });
    setPending(false);
    if (error) { setError(error.message); return; }
    setDone(true);
  }

  if (done) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="glass-strong w-full max-w-sm p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#047857" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-stone-900">Registrierung eingereicht</h1>
          <p className="mt-2 text-sm text-stone-500">
            Dein Account wird von einem Administrator geprüft und freigeschaltet.
            Du erhältst eine Benachrichtigung sobald dein Zugang aktiviert ist.
          </p>
          <Link href="/login" className="mt-6 block text-xs text-stone-500 hover:text-stone-800">
            ← Zurück zur Anmeldung
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={onSubmit} className="glass-strong w-full max-w-sm p-8">
        <h1 className="text-xl font-semibold text-stone-900">Master Brand Monitor</h1>
        <p className="mt-1 text-sm text-stone-500">Neuen Account erstellen.</p>

        <label className="mt-6 block text-sm">
          <span className="text-xs uppercase tracking-wide text-stone-500">Name (optional)</span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Max Mustermann"
            className="mt-1 h-10 w-full rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm outline-none focus:border-stone-400"
          />
        </label>
        <label className="mt-4 block text-sm">
          <span className="text-xs uppercase tracking-wide text-stone-500">E-Mail</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 h-10 w-full rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm outline-none focus:border-stone-400"
          />
        </label>
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
        <label className="mt-4 block text-sm">
          <span className="text-xs uppercase tracking-wide text-stone-500">Passwort bestätigen</span>
          <input
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="mt-1 h-10 w-full rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm outline-none focus:border-stone-400"
          />
        </label>

        {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="mt-6 h-10 w-full rounded-full bg-stone-900 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Wird erstellt…" : "Account erstellen"}
        </button>

        <p className="mt-4 text-center text-xs text-stone-500">
          Bereits registriert?{" "}
          <Link href="/login" className="font-medium text-stone-800 hover:underline">
            Anmelden
          </Link>
        </p>
      </form>
    </main>
  );
}
