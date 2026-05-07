import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdminClient();
  const { data: hit } = await db
    .from("hits")
    .select("attachment_url")
    .eq("id", id)
    .single();

  if (!hit?.attachment_url) {
    return NextResponse.json({ error: "Kein Anhang vorhanden" }, { status: 404 });
  }

  const { data, error } = await db.storage
    .from("hit-attachments")
    .createSignedUrl(hit.attachment_url, 3600);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Anhang nicht abrufbar" }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}
