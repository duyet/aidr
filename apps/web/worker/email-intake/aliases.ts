import { nn } from "../d1-bind.js";
import { sha256Hex } from "../hash.js";
import { notesFrom } from "../mail/send.js";
import { checkRateLimit, ONE_DAY_SEC } from "../rate-limit.js";
import type { Env } from "../types.js";
import { escapeHtml } from "./ack.js";
import { normalizeEmail } from "./identity.js";

export const MAX_ADDRESSES_PER_USER = 5;
export const MAX_CONFIRM_MAILS_PER_DAY = 5;
export const CONFIRM_TTL_MS = 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@<>"]{1,64}@[a-z0-9.-]{1,253}\.[a-z]{2,63}$/i;

export interface ContributorEmail {
  id: string;
  email: string;
  status: "pending" | "confirmed";
  created_at: number;
  confirmed_at: number | null;
}

export type AliasResult = { ok: true } | { ok: false; error: string };

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function listContributorEmails(
  db: D1Database,
  userId: string
): Promise<ContributorEmail[]> {
  const { results } = await db
    .prepare(
      `SELECT id, email, status, created_at, confirmed_at FROM contributor_emails
       WHERE user_id = ? ORDER BY created_at ASC`
    )
    .bind(nn(userId))
    .all<ContributorEmail>();
  return results ?? [];
}

/**
 * Adds an address for `userId` and mails a single-use confirmation link to
 * it. Only the token's hash is stored. Refuses another account's address and
 * caps addresses and confirmation mails per user, so this is not a way to
 * mail arbitrary people.
 */
export async function addContributorEmail(
  env: Env,
  userId: string,
  rawEmail: string,
  siteUrl: string,
  now = Date.now()
): Promise<AliasResult> {
  const email = normalizeEmail(rawEmail);
  if (!EMAIL_RE.test(email)) return { ok: false, error: "Enter a valid email" };
  if (/@(?:[a-z0-9-]+\.)*aidr\.today$/.test(email)) {
    return { ok: false, error: "Use your own address" };
  }
  const db = env.DB;

  await db
    .prepare(
      "DELETE FROM contributor_emails WHERE status = 'pending' AND expires_at < ?"
    )
    .bind(nn(now))
    .run();

  const clerk = await db
    .prepare(
      "SELECT id FROM clerk_users WHERE lower(email) = ? AND deleted_at IS NULL LIMIT 1"
    )
    .bind(nn(email))
    .first<{ id: string }>();
  if (clerk) {
    return clerk.id === userId
      ? { ok: false, error: "This is already your account email" }
      : { ok: false, error: "This address belongs to another account" };
  }
  const existing = await db
    .prepare("SELECT user_id FROM contributor_emails WHERE email = ?")
    .bind(nn(email))
    .first<{ user_id: string }>();
  if (existing) {
    return existing.user_id === userId
      ? { ok: false, error: "Already added; check that inbox for the link" }
      : { ok: false, error: "This address belongs to another account" };
  }

  const count = await db
    .prepare("SELECT COUNT(*) AS c FROM contributor_emails WHERE user_id = ?")
    .bind(nn(userId))
    .first<{ c: number }>();
  if ((count?.c ?? 0) >= MAX_ADDRESSES_PER_USER) {
    return { ok: false, error: `At most ${MAX_ADDRESSES_PER_USER} addresses` };
  }
  // Sends are logged in their own table, which removing an address does
  // not touch, so add/remove cycles stay under the daily cap.
  const overDaily = await checkRateLimit(db, {
    table: "contributor_email_sends",
    column: "user_id",
    key: userId,
    windowSec: ONE_DAY_SEC,
    limit: MAX_CONFIRM_MAILS_PER_DAY,
    now,
  });
  if (overDaily) return { ok: false, error: "Too many addresses added today" };

  if (!env.EMAIL) return { ok: false, error: "Email is not configured" };
  const token = randomToken();
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO contributor_emails (id, user_id, email, status, token_hash, created_at, expires_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?)`
    )
    .bind(
      nn(id),
      nn(userId),
      nn(email),
      nn(await sha256Hex(token)),
      nn(now),
      nn(now + CONFIRM_TTL_MS)
    )
    .run();

  await db
    .prepare(
      "INSERT INTO contributor_email_sends (id, user_id, created_at) VALUES (?, ?, ?)"
    )
    .bind(nn(crypto.randomUUID()), nn(userId), nn(now))
    .run();

  const link = `${siteUrl}/api/contribute-email/confirm?token=${token}`;
  try {
    await env.EMAIL.send({
      to: email,
      from: notesFrom(env),
      subject: "Confirm this address for AI;DR contributions",
      text: `Someone signed in to AI;DR asked to send contributions from this address.\n\nConfirm: ${link}\n\nIf this was not you, ignore this mail. The link expires in 24 hours.`,
      html: `<p>Someone signed in to AI;DR asked to send contributions from this address.</p><p><a href="${escapeHtml(link)}">Confirm this address</a></p><p>If this was not you, ignore this mail. The link expires in 24 hours.</p>`,
      headers: { "Auto-Submitted": "auto-generated" },
    });
  } catch (error) {
    await db
      .prepare("DELETE FROM contributor_emails WHERE id = ?")
      .bind(nn(id))
      .run();
    console.error(
      "contributor email confirm send failed:",
      error instanceof Error ? error.message : String(error)
    );
    return { ok: false, error: "Could not send the confirmation mail" };
  }
  return { ok: true };
}

/** Confirms the pending address the token was issued for. Single-use. */
export async function confirmContributorEmail(
  db: D1Database,
  token: string | null,
  now = Date.now()
): Promise<boolean> {
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return false;
  const result = await db
    .prepare(
      `UPDATE contributor_emails
       SET status = 'confirmed', confirmed_at = ?, token_hash = NULL, expires_at = NULL
       WHERE token_hash = ? AND status = 'pending' AND expires_at >= ?`
    )
    .bind(nn(now), nn(await sha256Hex(token)), nn(now))
    .run();
  return (result.meta?.changes ?? 0) === 1;
}

export async function removeContributorEmail(
  db: D1Database,
  userId: string,
  id: string
): Promise<boolean> {
  const result = await db
    .prepare("DELETE FROM contributor_emails WHERE id = ? AND user_id = ?")
    .bind(nn(id), nn(userId))
    .run();
  return (result.meta?.changes ?? 0) === 1;
}
