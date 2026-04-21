import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ domain: string }> },
) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { domain } = await params;
  const decodedDomain = decodeURIComponent(domain);

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from("excluded_domains")
    .delete()
    .eq("domain", decodedDomain);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath("/");
  revalidatePath("/excluded");

  return NextResponse.json({ ok: true });
}
