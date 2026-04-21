import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";

export async function PUT(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { itemId, status } = (await req.json()) as { itemId: string; status: string };
  const admin = getSupabaseAdminClient();

  const { error } = await admin
    .from("export_items")
    .update({
      lawyer_status: status,
      lawyer_status_updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
