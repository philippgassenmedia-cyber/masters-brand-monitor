"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const [newPw, setNewPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Supabase sets the session from the URL hash automatically
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPw !== confirm) { setError("Passwörter stimmen nicht überein."); return; }
    if (newPw.length < 8) { setError("Mindestens 8 Zeichen erforderlich."); return; }
    setPending(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPending(false);
    if (error) { setError(error.message); return; }
    router.replace("/");
  }

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center px-6">
        <div className="glass-strong w-full max-w-sm p-8 text-center text-sm text-stone-500">
          Link wird geprüft…
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={onSubmit} className="glass-strong w-full max-w-sm p-8">
        <h1 className="text-xl font-semibold text-stone-900">Neues Passwort</h1>
        <p className="mt-1 text-sm text-stone-500">Bitte wähle ein neues Passwort.</p>
        <label className="mt-6 block text-sm">
          <span className="text-xs uppercase tracking-wide text-stone-500">Neues Passwort</span>
          <input
            type="password"
            required
            value={newPw}
            onChange={(e) => setNewPw(e.target.value)}
            className="mt-1 h-10 w-full rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm outline-none focus:border-stone-400"
          />
        </label>
        <label className="mt-4 block text-sm">
          <span className="text-xs uppercase tracking-wide text-stone-500">Bestätigen</span>
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
          {pending ? "Wird gespeichert…" : "Passwort speichern"}
        </button>
      </form>
    </main>
  );
}
