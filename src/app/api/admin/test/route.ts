import { NextResponse } from "next/server";
import { getSupabaseAdminClient, getSupabaseServerClient } from "@/lib/supabase/server";
import { verifyAdminPassword } from "@/lib/admin-auth";

type TestId =
  | "gemini_basic"
  | "gemini_grounding"
  | "gemini_dpma"
  | "supabase_read"
  | "supabase_write";

async function resolveKey(key: string): Promise<string> {
  const db = getSupabaseAdminClient();
  const { data } = await db.from("settings").select("value").eq("key", "api_key_overrides").maybeSingle();
  const overrides = (data?.value ?? {}) as Record<string, string>;
  return overrides[key] || process.env[key] || "";
}

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const password = req.headers.get("x-admin-password") ?? "";
  if (!await verifyAdminPassword(password)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { test } = await req.json() as { test: TestId };
  const t0 = Date.now();

  try {
    switch (test) {
      case "gemini_basic": {
        const key = await resolveKey("GEMINI_API_KEY");
        if (!key) return result(false, "GEMINI_API_KEY nicht gesetzt", 0);
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: 'Reply with exactly one word: "OK"' }] }],
              generationConfig: { maxOutputTokens: 10, temperature: 0 },
            }),
            signal: AbortSignal.timeout(10000),
          }
        );
        const ms = Date.now() - t0;
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          return result(false, `HTTP ${r.status}: ${(err as { error?: { message?: string } }).error?.message ?? r.statusText}`, ms);
        }
        const data = await r.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        return result(true, `Antwort: "${text.trim()}"`, ms);
      }

      case "gemini_grounding": {
        const key = await resolveKey("GEMINI_API_KEY");
        if (!key) return result(false, "GEMINI_API_KEY nicht gesetzt", 0);
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: "Suche: aktuelle Uhrzeit Deutschland. Antworte in einem Satz." }] }],
              tools: [{ google_search: {} }],
              generationConfig: { maxOutputTokens: 60, temperature: 0.1 },
            }),
            signal: AbortSignal.timeout(20000),
          }
        );
        const ms = Date.now() - t0;
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          const msg = (err as { error?: { message?: string } }).error?.message ?? r.statusText;
          const hint = r.status === 403 ? " → Paid Tier erforderlich (Billing aktivieren)" : "";
          return result(false, `HTTP ${r.status}: ${msg}${hint}`, ms);
        }
        const data = await r.json();
        const chunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks?.length ?? 0;
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        return result(true, `Grounding OK · ${chunks} Quellen · "${text.trim().slice(0, 80)}"`, ms);
      }

      case "gemini_dpma": {
        const key = await resolveKey("GEMINI_API_KEY");
        if (!key) return result(false, "GEMINI_API_KEY nicht gesetzt", 0);
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: 'Marke: MASTER Immobilien GmbH. JSON: {"score":8}' }] }],
              generationConfig: { responseMimeType: "application/json", maxOutputTokens: 30, temperature: 0 },
            }),
            signal: AbortSignal.timeout(15000),
          }
        );
        const ms = Date.now() - t0;
        if (!r.ok) {
          const err = await r.json().catch(() => ({}));
          return result(false, `HTTP ${r.status}: ${(err as { error?: { message?: string } }).error?.message ?? r.statusText}`, ms);
        }
        const data = await r.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
        return result(true, `gemini-2.5-flash OK · Antwort: ${text.trim().slice(0, 60)}`, ms);
      }

      case "supabase_read": {
        const db = getSupabaseAdminClient();
        const { data, error } = await db.from("settings").select("key").limit(3);
        const ms = Date.now() - t0;
        if (error) return result(false, error.message, ms);
        return result(true, `${data?.length ?? 0} Zeilen gelesen`, ms);
      }

      case "supabase_write": {
        const db = getSupabaseAdminClient();
        const testKey = `__admin_test_${Date.now()}`;
        const { error: insErr } = await db.from("settings").insert({ key: testKey, value: { test: true } });
        if (insErr) {
          const ms = Date.now() - t0;
          return result(false, `INSERT fehlgeschlagen: ${insErr.message}`, ms);
        }
        const { error: delErr } = await db.from("settings").delete().eq("key", testKey);
        const ms = Date.now() - t0;
        if (delErr) return result(false, `DELETE fehlgeschlagen: ${delErr.message}`, ms);
        return result(true, "INSERT + DELETE erfolgreich", ms);
      }

      default:
        return NextResponse.json({ ok: false, message: "Unbekannter Test", ms: 0 });
    }
  } catch (e) {
    return result(false, (e as Error).message, Date.now() - t0);
  }
}

function result(ok: boolean, message: string, ms: number) {
  return NextResponse.json({ ok, message, ms });
}
