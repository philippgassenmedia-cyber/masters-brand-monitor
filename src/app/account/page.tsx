"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function AccountPage() {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();

  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwSuccess, setPwSuccess] = useState(false);
  const [pwPending, setPwPending] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwError(null);
    setPwSuccess(false);
    if (newPw !== confirmPw) { setPwError("Passwörter stimmen nicht überein."); return; }
    if (newPw.length < 8) { setPwError("Mindestens 8 Zeichen erforderlich."); return; }
    setPwPending(true);
    // Re-authenticate first to verify current password
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) { setPwError("Nicht eingeloggt."); setPwPending(false); return; }
    const { error: signInErr } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: currentPw,
    });
    if (signInErr) { setPwError("Aktuelles Passwort falsch."); setPwPending(false); return; }
    const { error } = await supabase.auth.updateUser({ password: newPw });
    setPwPending(false);
    if (error) { setPwError(error.message); return; }
    setPwSuccess(true);
    setCurrentPw(""); setNewPw(""); setConfirmPw("");
  }

  async function logout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm space-y-4">
        <div className="glass-strong p-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-base font-semibold text-stone-900">Mein Account</h1>
              <p className="text-xs text-stone-500">Passwort und Zugangsdaten</p>
            </div>
            <Link href="/" className="text-xs text-stone-400 hover:text-stone-700">← Dashboard</Link>
          </div>

          <form onSubmit={changePassword} className="space-y-4">
            <h2 className="text-sm font-semibold text-stone-700">Passwort ändern</h2>
            <label className="block text-sm">
              <span className="text-xs uppercase tracking-wide text-stone-500">Aktuelles Passwort</span>
              <input
                type="password"
                required
                value={currentPw}
                onChange={(e) => setCurrentPw(e.target.value)}
                className="mt-1 h-10 w-full rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm outline-none focus:border-stone-400"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs uppercase tracking-wide text-stone-500">Neues Passwort</span>
              <input
                type="password"
                required
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                className="mt-1 h-10 w-full rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm outline-none focus:border-stone-400"
              />
            </label>
            <label className="block text-sm">
              <span className="text-xs uppercase tracking-wide text-stone-500">Neues Passwort bestätigen</span>
              <input
                type="password"
                required
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                className="mt-1 h-10 w-full rounded-full border border-white/80 bg-orange-50/70 px-4 text-sm outline-none focus:border-stone-400"
              />
            </label>
            {pwError && <p className="text-sm text-rose-600">{pwError}</p>}
            {pwSuccess && <p className="text-sm text-emerald-700">Passwort erfolgreich geändert.</p>}
            <button
              type="submit"
              disabled={pwPending}
              className="h-10 w-full rounded-full bg-stone-900 text-sm font-semibold text-white disabled:opacity-50"
            >
              {pwPending ? "Wird geändert…" : "Passwort ändern"}
            </button>
          </form>
        </div>

        <div className="glass-strong px-8 py-4">
          <button
            onClick={logout}
            className="w-full text-center text-sm text-stone-500 hover:text-rose-700"
          >
            Abmelden
          </button>
        </div>
      </div>
    </main>
  );
}
