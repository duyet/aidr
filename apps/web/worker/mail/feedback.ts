import { SITE_URL } from "../../src/lib/site.js";
import type { Env } from "../types.js";
import { escapeHtml } from "./markdown.js";
import type { MailLang } from "./render.js";

/** "Was today's edition useful?" votes (table `email_feedback`, 0054). */

export interface FeedbackVote {
  date: string;
  lang: MailLang;
  vote: 0 | 1;
  token: string;
}

/** Feedback link for one vote. `t` is the subscriber's unsubscribe token. */
export function feedbackUrl(
  date: string,
  lang: MailLang,
  vote: 0 | 1,
  token: string
): string {
  const params = new URLSearchParams({
    d: date,
    l: lang,
    v: String(vote),
    t: token,
  });
  return `${SITE_URL}/feedback?${params.toString()}`;
}

/** Parses `d`, `l`, `v`, `t`. Null when any is missing or malformed. */
export function parseFeedbackParams(
  params: URLSearchParams
): FeedbackVote | null {
  const date = params.get("d") ?? "";
  const lang = params.get("l");
  const v = params.get("v");
  const token = (params.get("t") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (lang !== "en" && lang !== "vi") return null;
  if (v !== "0" && v !== "1") return null;
  if (!token || token.length > 200) return null;
  return { date, lang, vote: v === "1" ? 1 : 0, token };
}

/**
 * Stores one vote, idempotent per subscriber and date: a repeat click
 * overwrites (last click wins). Tokens that match no subscriber are ignored,
 * so the endpoint cannot be used to fill the table. Returns whether a row
 * was written.
 */
export async function recordFeedback(
  env: Pick<Env, "DB">,
  vote: FeedbackVote,
  now = Date.now()
): Promise<boolean> {
  const sub = await env.DB.prepare(
    "SELECT 1 AS ok FROM subscribers WHERE unsubscribe_token = ? LIMIT 1"
  )
    .bind(vote.token)
    .first<{ ok: number }>();
  if (!sub) return false;
  await env.DB.prepare(
    `INSERT INTO email_feedback (date, subscriber_token, lang, vote, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (date, subscriber_token)
     DO UPDATE SET vote = excluded.vote, lang = excluded.lang, updated_at = excluded.updated_at`
  )
    .bind(vote.date, vote.token, vote.lang, vote.vote, now, now)
    .run();
  return true;
}

export interface FeedbackCount {
  date: string;
  lang: string;
  yes: number;
  no: number;
}

/** Votes per edition date and language, newest first. */
export async function feedbackCounts(
  env: Pick<Env, "DB">,
  days = 14
): Promise<FeedbackCount[]> {
  const limit = Math.min(Math.max(Math.trunc(days) || 14, 1), 90);
  const { results } = await env.DB.prepare(
    `SELECT date, lang, SUM(vote) AS yes, SUM(1 - vote) AS no
     FROM email_feedback
     WHERE date IN (SELECT DISTINCT date FROM email_feedback ORDER BY date DESC LIMIT ?)
     GROUP BY date, lang ORDER BY date DESC, lang`
  )
    .bind(limit)
    .all<FeedbackCount>();
  return (results ?? []).map((r) => ({
    date: r.date,
    lang: r.lang,
    yes: Number(r.yes) || 0,
    no: Number(r.no) || 0,
  }));
}

/** The small page a feedback click lands on. */
export function feedbackThankYouHtml(
  lang: MailLang,
  vote: 0 | 1 | null
): string {
  const vi = lang === "vi";
  const title = vi ? "Cảm ơn bạn" : "Thanks";
  const body =
    vote === null
      ? vi
        ? "Liên kết này không hợp lệ hoặc đã hết hạn."
        : "This link is not valid or has expired."
      : vote === 1
        ? vi
          ? "Rất vui vì bản tin hôm nay hữu ích. Chúng tôi đã ghi nhận."
          : "Glad today's edition was useful. Your vote is in."
        : vi
          ? "Cảm ơn bạn đã cho biết. Chúng tôi sẽ dùng ý kiến này để làm bản tin tốt hơn."
          : "Thanks for telling us. We use these votes to make the next edition better.";
  const back = vi ? "Về aidr.today" : "Back to aidr.today";
  const home = `${SITE_URL}/?lang=${lang}`;
  return `<!DOCTYPE html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><meta name="color-scheme" content="light dark"><title>${escapeHtml(title)} · AI;DR</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#efede6;color:#141413;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;padding:16px;box-sizing:border-box}main{max-width:420px;background:#fff;border:1px solid #e3e0d7;border-radius:14px;padding:28px}h1{margin:0 0 8px;font-family:Georgia,serif;font-size:26px}p{margin:0 0 16px;line-height:1.55;color:#34332e}a{color:#9a4a07;font-weight:600;text-decoration:none}@media (prefers-color-scheme:dark){body{background:#141413;color:#f2f0ea}main{background:#1f1e1b;border-color:#34332e}p{color:#d8d6cf}a{color:#f0a35e}}</style>
</head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p><a href="${escapeHtml(home)}">${escapeHtml(back)}</a></main></body></html>`;
}

/** `GET /feedback`: store the vote (if valid) and show the thank-you page. */
export async function handleFeedbackRequest(
  env: Pick<Env, "DB">,
  url: URL
): Promise<Response> {
  const vote = parseFeedbackParams(url.searchParams);
  const lang: MailLang =
    vote?.lang ?? (url.searchParams.get("l") === "en" ? "en" : "vi");
  if (vote) {
    try {
      await recordFeedback(env, vote);
    } catch (error) {
      // Table not migrated yet, or D1 down: the reader still gets thanked.
      console.error("email feedback write failed:", error);
    }
  }
  return new Response(feedbackThankYouHtml(lang, vote?.vote ?? null), {
    status: vote ? 200 : 400,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
