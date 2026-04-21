"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
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

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <form onSubmit={onSubmit} className="glass-strong w-full max-w-sm p-8">
        <h1 className="text-xl font-semibold text-stone-900">Master Brand Monitor</h1>
        <p className="mt-1 text-sm text-stone-500">Bitte anmelden.</p>
        <label className="mt-6 block text-sm">
          <span className="text-xs uppercase tracking-wide text-stone-500">E-Mail</span>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-10 w-full rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm outline-none" />
        </label>
        <label className="mt-4 block text-sm">
          <span className="text-xs uppercase tracking-wide text-stone-500">Passwort</span>
          <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 h-10 w-full rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm outline-none" />
        </label>
        {error && <p className="mt-4 text-sm text-rose-600">{error}</p>}
        <button type="submit" disabled={pending} className="mt-6 h-10 w-full rounded-full bg-stone-900 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? "Anmelden…" : "Anmelden"}
        </button>
      </form>
    </main>
  );
}
