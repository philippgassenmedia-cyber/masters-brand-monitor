import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";

const SubSchema = z.object({
  id: z.string().uuid().optional(),
  imap_account_id: z.string().uuid(),
  typ: z.enum(["classification", "applicant_name", "file_number"]),
  wert: z.string().min(1),
  frequenz: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  hinzugefuegt_am: z.string().nullable().optional(),
  notiz: z.string().nullable().optional(),
  aktiv: z.boolean().default(true),
});

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { data } = await supabase.from("monitoring_subscriptions").select("*").order("created_at");
  return NextResponse.json({ subscriptions: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const parsed = SubSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });
  const { id, ...row } = parsed.data;
  if (id) {
    await supabase.from("monitoring_subscriptions").update(row).eq("id", id);
  } else {
    await supabase.from("monitoring_subscriptions").insert(row);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = (await req.json()) as { id: string };
  await supabase.from("monitoring_subscriptions").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
