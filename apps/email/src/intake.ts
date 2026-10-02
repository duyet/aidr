import PostalMime, { type Email } from "postal-mime";
import { isAuthenticatedSender } from "./auth.js";
import {
  findStoryRef,
  htmlToText,
  MAX_OWN_TEXT_CHARS,
  splitBody,
  storyLinks,
} from "./body.js";
import { normalizeEmail, resolveSender } from "./identity.js";
import { isAutomatedMail } from "./loop.js";

/** Rejected at SMTP time, before the stream is read. */
export const MAX_RAW_BYTES = 1024 * 1024;
export const MAX_PER_USER_PER_DAY = 20;
/** Ignored rows are content-free, but a flood must still not fill D1. */
export const MAX_IGNORED_ROWS_PER_HOUR = 200;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export type IgnoreReason =
  | "parse"
  | "automated"
  | "from_mismatch"
  | "unauthenticated"
  | "unknown_sender"
  | "duplicate"
  | "rate_limited"
  | "empty";

export type IntakeOutcome =
  | { status: "pending"; id: string }
  | { status: "ignored"; reason: IgnoreReason };

export interface InboundEmail {
  /** SMTP envelope sender (MAIL FROM). */
  from: string;
  /** SMTP envelope recipient (RCPT TO), e.g. submit@aidr.today. */
  to: string;
  raw: ArrayBuffer | Uint8Array | string;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input)
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0")
  ).join("");
}

async function count(
  db: D1Database,
  sql: string,
  ...args: unknown[]
): Promise<number> {
  const row = await db
    .prepare(sql)
    .bind(...args)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

/** Records why a message was dropped: no content, no address, no reply. */
async function ignore(
  db: D1Database,
  senderHash: string,
  reason: IgnoreReason,
  now: number
): Promise<IntakeOutcome> {
  const recent = await count(
    db,
    "SELECT COUNT(*) AS c FROM inbound_emails WHERE status = 'ignored' AND received_at >= ?",
    now - HOUR_MS
  );
  if (recent < MAX_IGNORED_ROWS_PER_HOUR) {
    await db
      .prepare(
        "INSERT INTO inbound_emails (id, received_at, status, reason, sender_hash) VALUES (?, ?, 'ignored', ?, ?)"
      )
      .bind(crypto.randomUUID(), now, reason, senderHash)
      .run();
  }
  return { status: "ignored", reason };
}

/**
 * Validates one inbound message and stores its parsed fields as a `pending`
 * row for the hourly `inbound-email` step in the `aidr` Worker. Every check
 * fails closed. No LLM call, no review and no outgoing mail happen here, so
 * nothing the sender wrote can do more than become a pending row.
 */
export async function receiveEmail(
  db: D1Database,
  inbound: InboundEmail,
  now = Date.now()
): Promise<IntakeOutcome> {
  const envelopeFrom = normalizeEmail(inbound.from);
  const senderHash = (await sha256Hex(envelopeFrom)).slice(0, 16);

  let parsed: Email;
  try {
    parsed = await PostalMime.parse(inbound.raw, {
      attachmentEncoding: "arraybuffer",
    });
  } catch {
    return ignore(db, senderHash, "parse", now);
  }
  const header = (name: string) =>
    parsed.headers.find((h) => h.key === name)?.value ?? null;
  if (isAutomatedMail(inbound.from, header)) {
    return ignore(db, senderHash, "automated", now);
  }

  const headerFrom =
    parsed.from && "address" in parsed.from && parsed.from.address
      ? normalizeEmail(parsed.from.address)
      : null;
  if (!headerFrom || headerFrom !== envelopeFrom) {
    return ignore(db, senderHash, "from_mismatch", now);
  }
  if (!isAuthenticatedSender(parsed.headers, headerFrom)) {
    return ignore(db, senderHash, "unauthenticated", now);
  }
  const userId = await resolveSender(db, headerFrom);
  if (!userId) return ignore(db, senderHash, "unknown_sender", now);

  const messageId = parsed.messageId?.trim().slice(0, 998) || null;
  const messageIdHash = await sha256Hex(
    messageId ?? `${headerFrom}|${parsed.date ?? ""}|${parsed.subject ?? ""}`
  );
  if (
    await count(
      db,
      "SELECT COUNT(*) AS c FROM inbound_emails WHERE message_id_hash = ?",
      messageIdHash
    )
  ) {
    return ignore(db, senderHash, "duplicate", now);
  }
  if (
    (await count(
      db,
      "SELECT COUNT(*) AS c FROM inbound_emails WHERE user_id = ? AND received_at >= ?",
      userId,
      now - DAY_MS
    )) >= MAX_PER_USER_PER_DAY
  ) {
    return ignore(db, senderHash, "rate_limited", now);
  }

  const subject = (parsed.subject ?? "").slice(0, 300);
  const text = parsed.text?.trim()
    ? parsed.text
    : htmlToText(parsed.html ?? "");
  const body = splitBody(text, subject);
  const own = body.own.slice(0, MAX_OWN_TEXT_CHARS).trim();
  const links = storyLinks(body.own);
  // Only a forward's quoted part is content; a reply's quoted part is our
  // own mail and is never kept.
  const forwardedLinks = body.isForward ? storyLinks(body.rest) : [];
  const ref = findStoryRef({ to: inbound.to, subject, own: body.own });
  if (!own && links.length === 0 && forwardedLinks.length === 0) {
    return ignore(db, senderHash, "empty", now);
  }

  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT OR IGNORE INTO inbound_emails (
         id, received_at, status, sender_hash, user_id, sender_email,
         message_id, message_id_hash, subject, own_text, links,
         forwarded_links, is_forward, is_reply, story_ref, story_lang
       ) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      now,
      senderHash,
      userId,
      headerFrom,
      messageId,
      messageIdHash,
      subject,
      own,
      JSON.stringify(links),
      JSON.stringify(forwardedLinks),
      body.isForward ? 1 : 0,
      body.isReply ? 1 : 0,
      ref?.idPrefix ?? null,
      ref?.lang ?? null
    )
    .run();
  return { status: "pending", id };
}
