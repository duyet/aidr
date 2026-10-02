import { nn } from "../d1-bind.js";
import { submitStory } from "../submissions.js";
import { submitSuggestion } from "../suggestions.js";
import type { Env } from "../types.js";
import { quote, sendAck } from "./ack.js";
import { classifyInbound, cleanSubject } from "./classify.js";
import { contributorName } from "./identity.js";

/** Rows handled per hourly run; the rest wait for the next run. */
export const INBOUND_BATCH = 25;
/** A `processing` claim older than this was cut off; hand it back. */
const STALE_CLAIM_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const IGNORED_RETENTION_MS = 30 * DAY_MS;
const COMMENT_RETENTION_MS = 90 * DAY_MS;
const ROW_RETENTION_MS = 365 * DAY_MS;

interface InboundRow {
  id: string;
  user_id: string;
  sender_email: string | null;
  message_id: string | null;
  subject: string | null;
  own_text: string | null;
  links: string | null;
  forwarded_links: string | null;
  is_forward: number;
  is_reply: number;
  story_ref: string | null;
  story_lang: string | null;
}

export interface InboundStats {
  processed: number;
  submissions: number;
  suggestions: number;
  comments: number;
}

type Outcome = {
  kind: "submission" | "suggestion" | "comment";
  outcomeId: string | null;
  itemId: string | null;
  reason: string | null;
  keepText: boolean;
  lines: string[];
};

function jsonList(value: string | null): string[] {
  try {
    const parsed = JSON.parse(value ?? "[]");
    return Array.isArray(parsed)
      ? parsed.filter((v): v is string => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

async function resolveItem(
  db: D1Database,
  prefix: string
): Promise<string | null> {
  const { results } = await db
    .prepare(
      "SELECT id FROM items WHERE id >= ? AND id < ? AND status = 'published' LIMIT 2"
    )
    .bind(nn(prefix), nn(`${prefix}￿`))
    .all<{ id: string }>();
  return results.length === 1 ? results[0].id : null;
}

function rowLang(row: InboundRow): "vi" | "en" | null {
  return row.story_lang === "en" || row.story_lang === "vi"
    ? row.story_lang
    : null;
}

function intentOf(row: InboundRow) {
  return classifyInbound({
    subject: row.subject ?? "",
    ownText: row.own_text ?? "",
    links: jsonList(row.links),
    forwardedLinks: jsonList(row.forwarded_links),
    isForward: row.is_forward === 1,
    isReply: row.is_reply === 1,
    storyRef: row.story_ref,
    storyLang: rowLang(row),
  });
}

async function decide(env: Env, row: InboundRow): Promise<Outcome> {
  const db = env.DB;
  const lang = rowLang(row);
  const intent = intentOf(row);
  const userName = await contributorName(db, row.user_id);
  const comment = (itemId: string | null, reason: string | null): Outcome => ({
    kind: "comment",
    outcomeId: null,
    itemId,
    reason,
    keepText: true,
    lines: [
      reason
        ? `We saved your message as a comment for the editors (${reason}).`
        : "Thanks. We saved your message as a comment for the editors.",
    ],
  });

  if (intent.kind === "submission") {
    const result = await submitStory(db, {
      url: intent.url,
      title: intent.title.length >= 5 ? intent.title.slice(0, 300) : "",
      note: intent.note || undefined,
      userId: row.user_id,
      userName,
    });
    return result.ok
      ? {
          kind: "submission",
          outcomeId: result.id,
          itemId: null,
          reason: null,
          keepText: false,
          lines: [
            `Thanks. We queued this link as a story submission: ${intent.url}`,
            "It is reviewed in the hourly run; the verdict shows on your contributions page.",
          ],
        }
      : {
          kind: "submission",
          outcomeId: null,
          itemId: null,
          reason: result.error,
          keepText: false,
          lines: [`We could not submit ${intent.url}: ${result.error}.`],
        };
  }

  const itemId = row.story_ref ? await resolveItem(db, row.story_ref) : null;
  if (intent.kind === "suggestion") {
    if (!itemId) return comment(null, "story not found");
    const result = await submitSuggestion(db, {
      itemId,
      field: intent.field,
      lang: lang ?? "vi",
      suggestion: intent.text,
      userId: row.user_id,
      userName,
    });
    if (!result.ok) return comment(itemId, result.error);
    return {
      kind: "suggestion",
      outcomeId: result.id,
      itemId,
      reason: null,
      keepText: false,
      lines: [
        `Your suggestion: "${quote(intent.text)}"`,
        "It is reviewed in this hourly run; the verdict shows on your contributions page.",
      ],
    };
  }
  return comment(itemId, null);
}

async function purge(db: D1Database, now: number): Promise<void> {
  await db.batch([
    db
      .prepare(
        "DELETE FROM inbound_emails WHERE status = 'ignored' AND received_at < ?"
      )
      .bind(nn(now - IGNORED_RETENTION_MS)),
    db
      .prepare(
        "UPDATE inbound_emails SET own_text = NULL WHERE own_text IS NOT NULL AND status = 'processed' AND received_at < ?"
      )
      .bind(nn(now - COMMENT_RETENTION_MS)),
    db
      .prepare("DELETE FROM inbound_emails WHERE received_at < ?")
      .bind(nn(now - ROW_RETENTION_MS)),
  ]);
}

const PENDING_SQL = `SELECT id, user_id, sender_email, message_id, subject, own_text, links,
              forwarded_links, is_forward, is_reply, story_ref, story_lang
       FROM inbound_emails WHERE status = 'pending' AND user_id IS NOT NULL
       ORDER BY received_at ASC LIMIT ?`;

/** Dry run: what the next batch would become, with no write and no mail.
 *  A story reference counts as a suggestion even if the item is gone. */
async function previewPending(db: D1Database): Promise<InboundStats> {
  const stats: InboundStats = {
    processed: 0,
    submissions: 0,
    suggestions: 0,
    comments: 0,
  };
  const { results } = await db
    .prepare(PENDING_SQL)
    .bind(nn(INBOUND_BATCH))
    .all<InboundRow>();
  for (const row of results ?? []) {
    const kind = intentOf(row).kind;
    stats.processed++;
    if (kind === "submission") stats.submissions++;
    else if (kind === "suggestion") stats.suggestions++;
    else stats.comments++;
  }
  return stats;
}

/**
 * The hourly `inbound-email` step: turns pending rows written by the
 * `aidr-email` Worker into submissions, suggestions or comments through
 * the same functions as the web forms (which never accept on their own),
 * marks each row processed with its outcome and acknowledges the sender.
 * Runs before review-suggestions/review-submissions so new rows are reviewed
 * in the same run. The address is cleared once the ack is sent.
 */
export async function processPendingInboundEmails(
  env: Env,
  siteUrl: string,
  options: { dryRun?: boolean; now?: number } = {}
): Promise<InboundStats> {
  const db = env.DB;
  const now = options.now ?? Date.now();
  const stats: InboundStats = {
    processed: 0,
    submissions: 0,
    suggestions: 0,
    comments: 0,
  };
  if (options.dryRun) return previewPending(db);
  await db
    .prepare(
      "UPDATE inbound_emails SET status = 'pending', processed_at = NULL WHERE status = 'processing' AND processed_at < ?"
    )
    .bind(nn(now - STALE_CLAIM_MS))
    .run();

  const { results } = await db
    .prepare(PENDING_SQL)
    .bind(nn(INBOUND_BATCH))
    .all<InboundRow>();

  for (const row of results ?? []) {
    const claimed = await db
      .prepare(
        "UPDATE inbound_emails SET status = 'processing', processed_at = ? WHERE id = ? AND status = 'pending'"
      )
      .bind(nn(now), nn(row.id))
      .run();
    if ((claimed.meta?.changes ?? 0) !== 1) continue;

    let outcome: Outcome;
    try {
      outcome = await decide(env, row);
    } catch (error) {
      console.error(
        "inbound-email row failed:",
        error instanceof Error ? error.message : String(error)
      );
      await db
        .prepare(
          "UPDATE inbound_emails SET status = 'pending', processed_at = NULL WHERE id = ?"
        )
        .bind(nn(row.id))
        .run();
      continue;
    }

    await db
      .prepare(
        `UPDATE inbound_emails
         SET status = 'processed', outcome_kind = ?, outcome_id = ?, item_id = ?,
             reason = ?, processed_at = ?, sender_email = NULL,
             own_text = CASE WHEN ? THEN own_text ELSE NULL END
         WHERE id = ?`
      )
      .bind(
        nn(outcome.kind),
        nn(outcome.outcomeId),
        nn(outcome.itemId),
        nn(outcome.reason),
        nn(now),
        outcome.keepText ? 1 : 0,
        nn(row.id)
      )
      .run();
    stats.processed++;
    if (outcome.kind === "submission") stats.submissions++;
    else if (outcome.kind === "suggestion") stats.suggestions++;
    else stats.comments++;

    if (row.sender_email) {
      const base = cleanSubject(row.subject ?? "") || "your contribution";
      await sendAck(env, {
        to: row.sender_email,
        subject: outcome.itemId
          ? `Re: ${base} [aidr:${outcome.itemId.slice(0, 8)}]`
          : `Re: ${base}`,
        inReplyTo: row.message_id,
        siteUrl,
        lines: outcome.lines,
      });
    }
  }
  await purge(db, now).catch((error) => {
    console.error(
      "inbound-email purge failed:",
      error instanceof Error ? error.message : String(error)
    );
  });
  return stats;
}
