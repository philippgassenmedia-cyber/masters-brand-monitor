import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";

export interface StorageFile {
  storagePath: string;
  name: string;
  size: number;
  createdAt: string;
  linkedCount: number;
}

export async function GET() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const db = getSupabaseAdminClient();

  // List all files under imports/ in hit-attachments bucket
  const { data: folders, error: listErr } = await db.storage
    .from("hit-attachments")
    .list("imports", { limit: 200, sortBy: { column: "created_at", order: "desc" } });

  if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

  const files: StorageFile[] = [];

  for (const folder of folders ?? []) {
    if (!folder.id) continue; // skip non-file entries

    // Each entry under imports/ might be a UUID folder — list its contents
    const { data: children } = await db.storage
      .from("hit-attachments")
      .list(`imports/${folder.name}`, { limit: 10 });

    const items = children ?? [];

    // If this is a direct file (not a folder)
    const directFile = folder.metadata ? [folder] : [];

    for (const item of items.length > 0 ? items : directFile) {
      if (!item.metadata) continue;
      const storagePath = items.length > 0
        ? `imports/${folder.name}/${item.name}`
        : `imports/${folder.name}`;

      const createdAt: string = (item.created_at as string | undefined) ?? (folder.created_at as string | undefined) ?? new Date().toISOString();

      // Count how many hits reference this path
      const { count } = await db
        .from("hits")
        .select("id", { count: "exact", head: true })
        .eq("attachment_url", storagePath);

      files.push({
        storagePath,
        name: item.name,
        size: (item.metadata as { size?: number }).size ?? 0,
        createdAt,
        linkedCount: count ?? 0,
      });
    }
  }

  return NextResponse.json({ files });
}
