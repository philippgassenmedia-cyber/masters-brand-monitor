import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { MobileShell } from "./mobile-shell";
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

  const sidebar = (
    <Sidebar
      userEmail={user?.email ?? null}
      usageCount={usage.total}
      usageLimit={usage.limit}
      usageBreakdown={usage.breakdown}
    />
  );

  return (
    <div className="h-screen overflow-hidden p-2 md:p-5">
      <div className="glass-shell mx-auto flex h-full w-full max-w-[1500px] gap-0 p-2 md:gap-5 md:p-5">
        <MobileShell sidebar={sidebar}>
          {children}
        </MobileShell>
      </div>
    </div>
  );
}
