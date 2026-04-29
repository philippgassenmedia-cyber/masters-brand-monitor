import { createHash } from "crypto";
import { getSupabaseAdminClient } from "./supabase/server";

export async function verifyAdminPassword(password: string): Promise<boolean> {
  if (!password) return false;
  const db = getSupabaseAdminClient();
  const { data } = await db
    .from("settings")
    .select("value")
    .eq("key", "admin_console")
    .maybeSingle();
  if (!data) return false;
  const { password_hash, salt } = data.value as { password_hash: string; salt: string };
  const hash = createHash("sha256").update(salt + password).digest("hex");
  return hash === password_hash;
}
