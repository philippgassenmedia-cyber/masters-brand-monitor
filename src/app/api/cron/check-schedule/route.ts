import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { runScheduledScan } from "@/lib/scheduled-runner";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: Request) {
  // Auth: Vercel Cron sendet einen Authorization-Header, oder wir prüfen CRON_SECRET
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const db = getSupabaseAdminClient();
  const now = new Date().toISOString();

  // 1. Einzel-Termine die fällig sind
  const { data: dueSingle } = await db
    .from("scheduled_scans")
    .select("*")
    .eq("status", "pending")
    .eq("recurring", false)
    .lte("scheduled_at", now)
    .order("scheduled_at")
    .limit(5);

  // 2. Wiederkehrende Scans prüfen (aus Settings)
  const { data: settingsData } = await db
    .from("settings")
    .select("value")
    .eq("key", "deep_scan_schedule")
    .maybeSingle();

  const schedule = settingsData?.value as {
    mode?: string;
    interval?: number;
    day_of_week?: number;
    hour?: number;
  } | null;

  let recurringDue = false;
  if (schedule) {
    const nowDate = new Date();
    const hour = nowDate.getUTCHours() + 1; // CET = UTC+1 (vereinfacht)
    const dayOfWeek = nowDate.getDay();

    if (schedule.hour === hour || schedule.hour === hour - 1) {
      switch (schedule.mode) {
        case "daily":
          recurringDue = true;
          break;
        case "weekly":
          recurringDue = dayOfWeek === (schedule.day_of_week ?? 1);
          break;
        case "every_n_days": {
          // Prüfe ob seit dem letzten Scan genug Tage vergangen sind
          const { data: lastRun } = await db
            .from("scheduled_scans")
            .select("completed_at")
            .eq("recurring", true)
            .eq("status", "completed")
            .order("completed_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (!lastRun) {
            recurringDue = true;
          } else {
            const daysSince = (Date.now() - new Date(lastRun.completed_at).getTime()) / 86_400_000;
            recurringDue = daysSince >= (schedule.interval ?? 7);
          }
          break;
        }
      }
    }
  }

  const triggered: string[] = [];

  // Einzel-Termine ausführen
  for (const scan of dueSingle ?? []) {
    triggered.push(`single:${scan.id}:${scan.scan_type}`);
    // Async starten, nicht warten (kann länger als 300s dauern)
    runScheduledScan(scan.id, scan.scan_type).catch((e) =>
      console.error("[Schedule]", scan.id, (e as Error).message),
    );
  }

  // Wiederkehrenden Scan erstellen + triggern
  if (recurringDue) {
    // Prüfe ob heute schon ein wiederkehrender Scan lief
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const { data: todayRun } = await db
      .from("scheduled_scans")
      .select("id")
      .eq("recurring", true)
      .gte("created_at", todayStart.toISOString())
      .limit(1)
      .maybeSingle();

    if (!todayRun) {
      const { data: newScan } = await db
        .from("scheduled_scans")
        .insert({
          scheduled_at: now,
          scan_type: "all",
          recurring: true,
          status: "pending",
          created_by: "cron:recurring",
          notes: `Automatischer ${schedule?.mode ?? "weekly"} Scan`,
        })
        .select("id")
        .single();

      if (newScan) {
        triggered.push(`recurring:${newScan.id}`);
        runScheduledScan(newScan.id, "all").catch((e) =>
          console.error("[Schedule]", newScan.id, (e as Error).message),
        );
      }
    }
  }

  return NextResponse.json({
    ok: true,
    checked_at: now,
    triggered: triggered.length,
    scans: triggered,
  });
}
