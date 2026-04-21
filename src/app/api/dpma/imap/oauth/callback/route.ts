import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseAdminClient } from "@/lib/supabase/server";

export async function GET(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/login", req.url));

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(
      new URL(`/settings/dpma?oauth_error=${encodeURIComponent(error ?? "no_code")}`, req.url),
    );
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const encKey = process.env.ENCRYPTION_KEY;
  if (!clientId || !clientSecret || !encKey) {
    return NextResponse.redirect(new URL("/settings/dpma?oauth_error=config_missing", req.url));
  }

  const redirectUri = `${url.origin}/api/dpma/imap/oauth/callback`;

  // Code gegen Tokens tauschen
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const errBody = await tokenRes.text();
    console.error("[OAuth] Token exchange failed:", errBody);
    return NextResponse.redirect(new URL("/settings/dpma?oauth_error=token_exchange", req.url));
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    token_type: string;
  };

  if (!tokens.refresh_token) {
    return NextResponse.redirect(new URL("/settings/dpma?oauth_error=no_refresh_token", req.url));
  }

  // E-Mail-Adresse aus dem Token holen
  const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const userInfo = (await userInfoRes.json()) as { email?: string };
  const email = userInfo.email ?? "unknown@gmail.com";

  // Token-Daten verschlüsselt speichern
  const admin = getSupabaseAdminClient();

  const tokenData = JSON.stringify({
    type: "oauth2",
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: Date.now() + tokens.expires_in * 1000,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const { data: encrypted } = await admin.rpc("encrypt_password", {
    plain_text: tokenData,
    enc_key: encKey,
  });

  // Bestehenden Account updaten oder neuen anlegen
  const { data: existing } = await admin
    .from("imap_accounts")
    .select("id")
    .eq("username", email)
    .maybeSingle();

  if (existing) {
    await admin
      .from("imap_accounts")
      .update({
        password_encrypted: encrypted as string,
        is_active: true,
        last_check_status: "ok",
        last_check_message: "OAuth2 verbunden",
      })
      .eq("id", existing.id);
  } else {
    await admin.from("imap_accounts").insert({
      label: `Gmail (${email})`,
      imap_host: "imap.gmail.com",
      imap_port: 993,
      username: email,
      password_encrypted: encrypted as string,
      use_ssl: true,
      is_active: true,
      last_check_status: "ok",
      last_check_message: "OAuth2 verbunden",
    });
  }

  return NextResponse.redirect(new URL("/settings/dpma?oauth_success=1", req.url));
}
