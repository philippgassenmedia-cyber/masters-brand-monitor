import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";

const Body = z.object({
  storagePath: z.string().min(1),
  createdAt: z.string().min(1),
});

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = Body.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const { storagePath, createdAt } = parsed.data;

  const db = getSupabaseAdminClient();

  // Find imported hits without attachment_url within ±10 minutes of the file's createdAt
  const fileTime = new Date(createdAt).getTime();
  const windowMs = 10 * 60 * 1000;
  const from = new Date(fileTime - windowMs).toISOString();
  const to = new Date(fileTime + windowMs).toISOString();

  const { data: candidates, error: queryErr } = await db
    .from("hits")
    .select("id, url, created_at")
    .like("url", "imported://%")
    .is("attachment_url", null)
    .gte("created_at", from)
    .lte("created_at", to);

  if (queryErr) return NextResponse.json({ error: queryErr.message }, { status: 500 });

  if (!candidates || candidates.length === 0) {
    return NextResponse.json({ linked: 0, message: "Keine passenden Treffer im Zeitfenster gefunden" });
  }

  const ids = candidates.map((c) => c.id);

  const { error: updateErr } = await db
    .from("hits")
    .update({ attachment_url: storagePath })
    .in("id", ids);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ linked: ids.length });
}
