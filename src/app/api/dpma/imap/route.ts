import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";

const SaveSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().min(1),
  imap_host: z.string().min(1),
  imap_port: z.number().int().min(1).max(65535),
  username: z.string().min(1),
  password: z.string().min(1),
  use_ssl: z.boolean().default(true),
  inbox_folder: z.string().default("INBOX"),
  processed_folder: z.string().default("Processed"),
  review_folder: z.string().default("Review"),
});

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("imap_accounts")
    .select("id, label, imap_host, imap_port, username, use_ssl, inbox_folder, processed_folder, review_folder, is_active, last_check_at, last_check_status, last_check_message, created_at")
    .order("created_at", { ascending: false });

  return NextResponse.json({ accounts: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = SaveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const admin = getSupabaseAdminClient();
  const encKey = process.env.ENCRYPTION_KEY;
  if (!encKey) return NextResponse.json({ error: "ENCRYPTION_KEY not configured" }, { status: 500 });

  const { data: encrypted, error: encErr } = await admin.rpc("encrypt_password", {
    plain_text: parsed.data.password,
    enc_key: encKey,
  });
  if (encErr) return NextResponse.json({ error: encErr.message }, { status: 500 });

  const row = {
    label: parsed.data.label,
    imap_host: parsed.data.imap_host,
    imap_port: parsed.data.imap_port,
    username: parsed.data.username,
    password_encrypted: encrypted as string,
    use_ssl: parsed.data.use_ssl,
    inbox_folder: parsed.data.inbox_folder,
    processed_folder: parsed.data.processed_folder,
    review_folder: parsed.data.review_folder,
    is_active: true,
  };

  if (parsed.data.id) {
    const { error } = await admin.from("imap_accounts").update(row).eq("id", parsed.data.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, id: parsed.data.id });
  }

  const { data: inserted, error: insErr } = await admin
    .from("imap_accounts")
    .insert(row)
    .select("id")
    .single();
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, id: inserted.id });
}

export async function DELETE(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = (await req.json()) as { id: string };
  const admin = getSupabaseAdminClient();
  await admin.from("imap_accounts").update({ is_active: false }).eq("id", id);
  return NextResponse.json({ ok: true });
}
