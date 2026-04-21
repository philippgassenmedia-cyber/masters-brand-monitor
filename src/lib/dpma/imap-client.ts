import { ImapFlow } from "imapflow";
import { getSupabaseAdminClient } from "../supabase/server";

export interface RawEmail {
  uid: number;
  messageId: string;
  subject: string;
  from: string;
  date: Date;
  textContent: string;
  htmlContent: string;
}

interface ImapAccount {
  id: string;
  label: string;
  imap_host: string;
  imap_port: number;
  username: string;
  password_encrypted: string;
  use_ssl: boolean;
  inbox_folder: string;
  processed_folder: string;
  review_folder: string;
  is_active: boolean;
}

interface ImapConfig {
  id: string;
  host: string;
  port: number;
  username: string;
  password: string;
  secure: boolean;
  inboxFolder: string;
  processedFolder: string;
  reviewFolder: string;
}

/**
 * Gets the first active IMAP config from the database, decrypting the password.
 */
export async function getActiveImapConfig(): Promise<ImapConfig | null> {
  const db = getSupabaseAdminClient();

  const { data: accounts } = await db
    .from("imap_accounts")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1);

  if (!accounts || accounts.length === 0) return null;

  const account = accounts[0] as ImapAccount;
  const encKey = process.env.ENCRYPTION_KEY;
  if (!encKey) throw new Error("ENCRYPTION_KEY not configured");

  const { data: decrypted, error } = await db.rpc("decrypt_password", {
    cipher_text: account.password_encrypted,
    enc_key: encKey,
  });

  if (error) throw new Error(`Password decryption failed: ${error.message}`);

  const password = decrypted as string;

  // Check if password is an OAuth2 JSON token
  let auth: { user: string; pass?: string; accessToken?: string } = {
    user: account.username,
    pass: password,
  };

  try {
    const parsed = JSON.parse(password);
    if (parsed.type === "oauth2" && parsed.access_token) {
      auth = {
        user: account.username,
        accessToken: parsed.access_token,
      };
    }
  } catch {
    // Not JSON — plain password, which is fine
  }

  return {
    id: account.id,
    host: account.imap_host,
    port: account.imap_port,
    username: account.username,
    password: password,
    secure: account.use_ssl,
    inboxFolder: account.inbox_folder,
    processedFolder: account.processed_folder,
    reviewFolder: account.review_folder,
  };
}

/**
 * Fetches new DPMAkurier emails from the IMAP inbox.
 */
export async function fetchNewDpmaEmails(
  config?: ImapConfig | null,
): Promise<RawEmail[]> {
  const cfg = config ?? (await getActiveImapConfig());
  if (!cfg) throw new Error("Kein aktives IMAP-Konto konfiguriert");

  // Build auth object
  let authObj: Record<string, unknown> = {
    user: cfg.username,
    pass: cfg.password,
  };

  try {
    const parsed = JSON.parse(cfg.password);
    if (parsed.type === "oauth2" && parsed.access_token) {
      authObj = {
        user: cfg.username,
        accessToken: parsed.access_token,
      };
    }
  } catch {
    // plain password
  }

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: authObj as { user: string; pass?: string; accessToken?: string },
    logger: false,
  });

  const emails: RawEmail[] = [];

  try {
    await client.connect();
    const lock = await client.getMailboxLock(cfg.inboxFolder);

    try {
      // Search for DPMAkurier emails (unseen)
      const messages = client.fetch(
        { seen: false },
        {
          uid: true,
          envelope: true,
          source: true,
          bodyStructure: true,
        },
      );

      for await (const msg of messages) {
        const subject = msg.envelope?.subject ?? "";
        const from = msg.envelope?.from?.[0]?.address ?? "";

        // Only process DPMAkurier emails
        if (
          !subject.toLowerCase().includes("dpma") &&
          !from.toLowerCase().includes("dpma") &&
          !subject.toLowerCase().includes("marke") &&
          !from.toLowerCase().includes("kurier")
        ) {
          continue;
        }

        // Download the full message to get body
        const downloaded = await client.download(String(msg.uid), undefined, {
          uid: true,
        });

        let textContent = "";
        let htmlContent = "";

        if (downloaded?.content) {
          const chunks: Buffer[] = [];
          for await (const chunk of downloaded.content) {
            chunks.push(Buffer.from(chunk));
          }
          const raw = Buffer.concat(chunks).toString("utf-8");

          // Simple extraction of text content
          const textMatch = raw.match(
            /Content-Type: text\/plain[\s\S]*?\r\n\r\n([\s\S]*?)(?=--|\r\n\r\n)/i,
          );
          if (textMatch) textContent = textMatch[1].trim();

          const htmlMatch = raw.match(
            /Content-Type: text\/html[\s\S]*?\r\n\r\n([\s\S]*?)(?=--)/i,
          );
          if (htmlMatch) htmlContent = htmlMatch[1].trim();

          // If no multipart boundary, use the whole content
          if (!textContent && !htmlContent) {
            textContent = raw;
          }
        }

        emails.push({
          uid: msg.uid,
          messageId: msg.envelope?.messageId ?? "",
          subject,
          from,
          date: msg.envelope?.date ?? new Date(),
          textContent,
          htmlContent,
        });
      }
    } finally {
      lock.release();
    }

    await client.logout();
  } catch (e) {
    try {
      await client.logout();
    } catch {
      // already disconnected
    }
    throw e;
  }

  return emails;
}

/**
 * Moves an email from one folder to another.
 */
export async function moveEmail(
  uid: number,
  targetFolder: string,
  config?: ImapConfig | null,
): Promise<void> {
  const cfg = config ?? (await getActiveImapConfig());
  if (!cfg) throw new Error("Kein aktives IMAP-Konto konfiguriert");

  let authObj: Record<string, unknown> = {
    user: cfg.username,
    pass: cfg.password,
  };

  try {
    const parsed = JSON.parse(cfg.password);
    if (parsed.type === "oauth2" && parsed.access_token) {
      authObj = {
        user: cfg.username,
        accessToken: parsed.access_token,
      };
    }
  } catch {
    // plain password
  }

  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: authObj as { user: string; pass?: string; accessToken?: string },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(cfg.inboxFolder);
    try {
      await client.messageMove(String(uid), targetFolder, { uid: true });
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (e) {
    try {
      await client.logout();
    } catch {
      // already disconnected
    }
    throw e;
  }
}

/**
 * Updates the IMAP account status after a check.
 */
export async function updateImapStatus(
  accountId: string,
  status: "ok" | "error",
  message?: string,
): Promise<void> {
  const db = getSupabaseAdminClient();
  await db
    .from("imap_accounts")
    .update({
      last_check_at: new Date().toISOString(),
      last_check_status: status,
      last_check_message: message ?? null,
    })
    .eq("id", accountId);
}
