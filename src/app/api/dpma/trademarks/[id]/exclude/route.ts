import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = getSupabaseAdminClient();

  // Trademark laden
  const { data: tm } = await admin
    .from("trademarks")
    .select("id, markenname, aktenzeichen")
    .eq("id", id)
    .single();
  if (!tm) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Als eigene Marke markieren (workflow_status = 'dismissed' + notes)
  await admin
    .from("trademarks")
    .update({
      workflow_status: "dismissed",
      notes: "Als eigene Marke markiert",
    })
    .eq("id", id);

  revalidatePath("/trademarks");
  revalidatePath("/");

  return NextResponse.json({ ok: true, markenname: tm.markenname });
}
