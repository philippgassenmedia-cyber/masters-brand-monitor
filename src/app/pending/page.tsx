"use client";

import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export default function PendingPage() {
  const router = useRouter();

  async function logout() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="glass-strong w-full max-w-sm p-8 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#92400e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-stone-900">Account wird geprüft</h1>
        <p className="mt-2 text-sm text-stone-500">
          Dein Account wurde erfolgreich erstellt und wartet auf Freischaltung
          durch einen Administrator. Bitte versuche es später erneut.
        </p>
        <button
          onClick={logout}
          className="mt-6 text-xs text-stone-400 hover:text-stone-700"
        >
          Abmelden
        </button>
      </div>
    </main>
  );
}
