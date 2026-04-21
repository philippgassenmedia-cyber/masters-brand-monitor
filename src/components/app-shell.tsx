import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { getGeminiUsageToday } from "@/lib/gemini-usage";

export async function AppShell({
  children,
  user,
}: {
  children: ReactNode;
  user?: { email?: string | null } | null;
}) {
  const usage = await Promise.race([
    getGeminiUsageToday(),
    new Promise<{ total: number; breakdown: Record<string, number>; limit: number }>((r) =>
      setTimeout(() => r({ total: 0, breakdown: {}, limit: 200 }), 2000),
    ),
  ]).catch(() => ({ total: 0, breakdown: {} as Record<string, number>, limit: 200 }));
  return (
    <div className="h-screen overflow-hidden p-5">
      <div className="glass-shell mx-auto flex h-full w-full max-w-[1500px] gap-5 p-5">
        <Sidebar
          userEmail={user?.email ?? null}
          usageCount={usage.total}
          usageLimit={usage.limit}
          usageBreakdown={usage.breakdown}
        />
        <div className="scroll-area min-w-0 flex-1 overflow-y-auto rounded-2xl px-1 pb-4 pt-1">
          {children}
        </div>
      </div>
    </div>
  );
}
