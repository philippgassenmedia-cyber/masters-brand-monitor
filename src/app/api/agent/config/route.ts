import { NextResponse } from "next/server";
import { deriveAgentToken } from "@/lib/agent-token";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token") ?? "";

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!serviceKey) {
    return NextResponse.json({ error: "server misconfigured" }, { status: 500 });
  }

  const expected = deriveAgentToken(serviceKey);
  if (!token || token !== expected) {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  return NextResponse.json({
    SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    SUPABASE_SERVICE_ROLE_KEY: serviceKey,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? "",
  });
}
