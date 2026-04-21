import Link from "next/link";
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/app-shell";
import { ExportsClient } from "./exports-client";

export const dynamic = "force-dynamic";

interface ExportRow {
  id: string;
  exported_at: string;
  format: string;
  hit_count: number;
  trademark_count: number;
  exported_by: string | null;
}

interface ExportItem {
  id: string;
  export_id: string;
  item_type: string;
  item_id: string;
  lawyer_status: string;
  lawyer_notes: string | null;
  // joined data
  hit_company?: string | null;
  hit_domain?: string | null;
  hit_score?: number | null;
  tm_markenname?: string | null;
  tm_aktenzeichen?: string | null;
  tm_score?: number | null;
}

export default async function ExportsPage() {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const [exportsRes, itemsRes, hitsRes, tmRes] = await Promise.all([
    supabase
      .from("lawyer_exports")
      .select("*")
      .order("exported_at", { ascending: false })
      .limit(50),
    supabase
      .from("export_items")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("hits").select("id, company_name, domain, ai_score").limit(500),
    supabase.from("trademarks").select("id, markenname, aktenzeichen, relevance_score").limit(500),
  ]);

  const exports = (exportsRes.data ?? []) as ExportRow[];
  const rawItems = (itemsRes.data ?? []) as ExportItem[];
  const hitsMap = new Map((hitsRes.data ?? []).map((h) => [h.id, h]));
  const tmMap = new Map((tmRes.data ?? []).map((t) => [t.id, t]));

  // Items mit Hit/Trademark-Daten anreichern
  const items = rawItems.map((item) => {
    if (item.item_type === "hit") {
      const h = hitsMap.get(item.item_id);
      return { ...item, hit_company: h?.company_name, hit_domain: h?.domain, hit_score: h?.ai_score };
    }
    const t = tmMap.get(item.item_id);
    return { ...item, tm_markenname: t?.markenname, tm_aktenzeichen: t?.aktenzeichen, tm_score: t?.relevance_score };
  });

  return (
    <AppShell user={auth.user}>
      <ExportsClient exports={exports} items={items} />
    </AppShell>
  );
}
