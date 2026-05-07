import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const path = new URL(req.url).searchParams.get("path");
  if (!path || !path.startsWith("imports/")) {
    return NextResponse.json({ error: "Ungültiger Pfad" }, { status: 400 });
  }

  const db = getSupabaseAdminClient();
  const { data, error } = await db.storage
    .from("hit-attachments")
    .createSignedUrl(path, 3600);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "PDF nicht abrufbar" }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl);
}
