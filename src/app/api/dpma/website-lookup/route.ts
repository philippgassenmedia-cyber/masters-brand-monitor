import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";
import { resolveCompanyProfile } from "@/lib/resolve-company";
import { scrapeImpressum } from "@/lib/impressum-scraper";

const BodySchema = z.object({
  trademarkId: z.string().uuid(),
  companyName: z.string().min(1),
});

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const { trademarkId, companyName } = parsed.data;

  try {
    // 1. Website der Firma finden via Gemini Grounding
    const { profile, resolvedUrl } = await resolveCompanyProfile(companyName);

    if (!resolvedUrl) {
      return NextResponse.json({ ok: false, message: "Keine Website gefunden" });
    }

    // 2. Falls resolveCompanyProfile kein Impressum liefert, nochmal direkt scrapen
    let finalProfile = profile;
    if (!finalProfile && resolvedUrl) {
      finalProfile = await scrapeImpressum(resolvedUrl).catch(() => null);
    }

    // 3. Ergebnis in der Trademark-DB speichern
    const admin = getSupabaseAdminClient();
    const updateData: Record<string, unknown> = {
      resolved_website: resolvedUrl,
    };
    if (finalProfile) {
      if (finalProfile.company_name) updateData.anmelder = finalProfile.company_name;
      if (finalProfile.address) updateData.subject_company_address = finalProfile.address;
    }

    await admin.from("trademarks").update(updateData).eq("id", trademarkId);

    return NextResponse.json({
      ok: true,
      url: resolvedUrl,
      profile: finalProfile
        ? {
            company: finalProfile.company_name,
            address: finalProfile.address,
            email: finalProfile.email,
            phone: finalProfile.phone,
            social: finalProfile.social_links,
          }
        : null,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error).message }, { status: 500 });
  }
}
