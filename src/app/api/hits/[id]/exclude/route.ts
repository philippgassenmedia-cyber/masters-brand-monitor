import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = getSupabaseAdminClient();

  // Get the hit to find its domain
  const { data: hit, error: hitErr } = await admin
    .from("hits")
    .select("id, domain")
    .eq("id", id)
    .single();

  if (hitErr || !hit) {
    return NextResponse.json({ error: "Hit not found" }, { status: 404 });
  }

  const domain = hit.domain;

  // Insert into excluded_domains
  await admin
    .from("excluded_domains")
    .upsert({ domain }, { onConflict: "domain" });

  // Delete this hit
  await admin.from("hits").delete().eq("id", id);

  // Sweep all other hits with the same domain
  if (domain) {
    await admin.from("hits").delete().eq("domain", domain);
  }

  revalidatePath("/");
  revalidatePath("/hits");
  revalidatePath("/excluded");

  return NextResponse.json({ ok: true, domain });
}
