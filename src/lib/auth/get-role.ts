import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";

export type UserRole = "lawyer" | "viewer";

export async function getUserRole(): Promise<UserRole> {
  try {
    const supabase = await getSupabaseServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return "viewer";

    const db = getSupabaseAdminClient();
    const { data } = await db
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = data?.role as string | null;
    if (role === "viewer") return "viewer";
    return "lawyer"; // default: lawyer (full access)
  } catch {
    return "lawyer";
  }
}
