import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { ImapFlow } from "imapflow";

export const runtime = "nodejs";

const BodySchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  username: z.string().min(1),
  password: z.string().min(1),
  ssl: z.boolean().default(true),
});

export async function POST(req: Request) {
  const supabase = await getSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = await req.json();
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.format() }, { status: 400 });

  const { host, port, username, password, ssl } = parsed.data;

  const client = new ImapFlow({
    host,
    port,
    secure: ssl,
    auth: { user: username, pass: password },
    logger: false,
    tls: { rejectUnauthorized: false },
  });

  // Sammle alle Fehler-Details von imapflow
  const errorDetails: string[] = [];
  client.on("error", (err: Error) => {
    errorDetails.push(err.message);
  });

  try {
    await Promise.race([
      client.connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Timeout nach 15 Sekunden")), 15_000),
      ),
    ]);

    // Versuche die INBOX zu öffnen, um vollen Zugriff zu bestätigen
    const lock = await client.getMailboxLock("INBOX");
    const status = client.mailbox;
    lock.release();

    await client.logout();

    return NextResponse.json({
      ok: true,
      message: `Verbindung erfolgreich zu ${host}:${port} als ${username}. ${
        status ? `INBOX enthält ${status.exists ?? 0} Nachrichten.` : ""
      }`,
    });
  } catch (e) {
    try { await client.logout(); } catch {}

    const err = e as Error & { responseStatus?: string; responseText?: string; code?: string };
    const parts = [
      err.message,
      err.responseText ? `Server: ${err.responseText}` : "",
      err.responseStatus ? `Status: ${err.responseStatus}` : "",
      err.code ? `Code: ${err.code}` : "",
      ...errorDetails,
    ].filter(Boolean);
    const msg = parts.join(" | ");
    console.error("[IMAP-Test]", { host, port, username, error: parts });

    // Benutzerfreundliche Fehlermeldungen
    let hint = "";
    if (msg.includes("Invalid credentials") || msg.includes("AUTHENTICATIONFAILED") || msg.includes("LOGIN")) {
      hint = "Bitte prüfe Benutzername und Passwort. Bei Gmail wird ein App-Passwort benötigt (nicht das normale Gmail-Passwort). Erstelle es unter: myaccount.google.com/apppasswords";
    } else if (msg.includes("Timeout")) {
      hint = `Server ${host}:${port} antwortet nicht. Prüfe Host und Port.`;
    } else if (msg.includes("ENOTFOUND") || msg.includes("getaddrinfo")) {
      hint = `Server "${host}" nicht gefunden. Prüfe den Hostnamen.`;
    } else if (msg.includes("ECONNREFUSED")) {
      hint = `Verbindung abgelehnt auf ${host}:${port}. Prüfe Port und ob SSL korrekt eingestellt ist.`;
    }

    return NextResponse.json({
      ok: false,
      message: hint ? `${hint}\n\nFehler-Code: ${msg}` : `Verbindungsfehler: ${msg}`,
    });
  }
}
