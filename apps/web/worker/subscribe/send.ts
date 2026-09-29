import { absoluteSiteUrl } from "../../src/lib/locale-url.js";
import { SITE_URL } from "../../src/lib/site.js";
import { storyPath } from "../../src/lib/slug.js";
import { reportDeliveryFailure } from "../bugsink.js";
import {
  type Edition,
  loadEdition,
  type TldrBulletLike,
  topBullets,
} from "../digest/edition.js";
import {
  digestSubjectLine,
  type MailFormat,
  normalizeMailFormat,
  renderDigestEmail,
  renderNoteEmail,
  settingsUrl,
  unsubscribeUrl,
} from "../mail/render.js";
import { ensureMailSchema } from "../mail/schema.js";
import { digestFrom, sendSubscriberEmail } from "../mail/send.js";
import { canonicalizeMediaImageUrl } from "../media.js";
import type { Env } from "../types.js";
import { DEFAULT_TIMEZONE, isValidTimezone } from "./handlers.js";

export type { TldrBulletLike } from "../digest/edition.js";
export {
  editionBullets,
  loadEdition,
  primaryItemId,
  topBullets,
} from "../digest/edition.js";

export interface SubscriberRow {
  email: string;
  lang: string;
  unsubscribe_token: string;
  timezone: string | null;
  last_sent_date: string | null;
  digest_size?: number | null;
  mail_format?: string | null;
}

export interface TldrSnapshotRow {
  date: string;
  bullets_en: string | null;
  bullets_vi: string | null;
  sent_at: number | null;
}

const MAX_BULLETS = 5;

export function digestSizeFor(value: unknown): 3 | 5 | 10 {
  if (value === 3 || value === 10 || value === 5) return value;
  return 5;
}
/** Digests only go out from this local hour onward — no 3am emails. */
export const DIGEST_LOCAL_HOUR = 7;

/** A snapshot is usable for a digest once it has bullets in at least one
 * language — no longer gated on `sent_at`, which is per-run/global and
 * can't express "has this specific subscriber, in their timezone, been
 * sent today's digest yet." That gate is now per-subscriber; see
 * `shouldSendForSubscriber`. `sent_at` is still stamped as a legacy
 * "this snapshot has been processed at least once" signal, but nothing
 * reads it to decide whether to send. */
export function snapshotHasBullets(
  snapshot: Pick<TldrSnapshotRow, "bullets_en" | "bullets_vi">
): boolean {
  return (
    topBullets(snapshot.bullets_en).length > 0 ||
    topBullets(snapshot.bullets_vi).length > 0
  );
}

/**
 * Computes a subscriber's current local hour (0-23) and local calendar
 * date (YYYY-MM-DD) for `nowMs`, in `timezone`. Falls back to
 * DEFAULT_TIMEZONE for an invalid/unrecognized timezone string.
 */
export function getLocalHourAndDate(
  nowMs: number,
  timezone: string | null | undefined
): { hour: number; date: string } {
  const tz = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(nowMs)).map((p) => [p.type, p.value])
  );
  // Some engines report midnight as hour "24" under hour12:false.
  const hour = Number(parts.hour) % 24;
  return { hour, date: `${parts.year}-${parts.month}-${parts.day}` };
}

/** A subscriber gets today's digest once it's at/after their local
 * DIGEST_LOCAL_HOUR and they haven't already received one for this local
 * date. */
export function shouldSendForSubscriber(
  sub: Pick<SubscriberRow, "last_sent_date">,
  localHour: number,
  localDate: string
): boolean {
  if (localHour < DIGEST_LOCAL_HOUR) return false;
  return sub.last_sent_date !== localDate;
}

/** Builds the plain-text and HTML bodies for a subscriber's daily digest email. */
export function buildDigestEmail(
  date: string,
  bullets: TldrBulletLike[],
  lang: string,
  unsubscribeToken: string,
  max = MAX_BULLETS,
  format: MailFormat = "design"
): { subject: string; html: string; text: string } {
  const mailLang = lang === "en" ? "en" : "vi";
  const items = bullets.slice(0, max);
  const subject = digestSubjectLine(date, items);
  return {
    subject,
    ...renderDigestEmail({
      subject,
      date,
      lang: mailLang,
      stories: items.map((b) => ({
        text: b.text,
        url: b.item_id
          ? absoluteSiteUrl(storyPath({ id: b.item_id }), mailLang)
          : absoluteSiteUrl("/", mailLang),
        imageUrl: b.image_url
          ? (canonicalizeMediaImageUrl(b.image_url) ?? undefined)
          : undefined,
      })),
      unsubscribeUrl: unsubscribeUrl(unsubscribeToken, mailLang),
      settingsUrl: settingsUrl(unsubscribeToken, mailLang),
      preheader: items[0]?.text,
      format,
    }),
  };
}

/**
 * Sends the TL;DR digest (top 5 bullets, per-subscriber language) to every
 * confirmed subscriber whose local time has reached DIGEST_LOCAL_HOUR and
 * who hasn't already received one for their current local date. Runs every
 * hour (called once per ingest run); each subscriber's own timezone
 * decides whether *this* run is their moment to send, so the same
 * function naturally fans a single daily send out across a whole day of
 * hourly runs as different timezones cross 7am. Each subscriber gets the
 * edition for their local date in their language. An empty column is not
 * filled from the other language; that subscriber is retried next hour.
 *
 * A per-subscriber failure is logged and swallowed without stamping
 * `last_sent_date`, so that subscriber is retried on the next hourly run.
 * No-ops entirely if the EMAIL binding isn't configured, or there's no
 * snapshot with bullets yet — this must never break the hourly ingest
 * workflow.
 */
export async function sendWelcomeEmail(
  env: Env,
  sub: { email: string; lang: string; unsubscribe_token: string }
): Promise<boolean> {
  const vi = sub.lang !== "en";
  const subject = vi
    ? "Bạn đã đăng ký AI;DR — aidr.today"
    : "You're subscribed to AI;DR — aidr.today";
  const bodyMd = vi
    ? "Cảm ơn bạn đã đăng ký.\n\nMỗi sáng (khoảng 7h theo giờ của bạn) chúng tôi gửi bản tin AI;DR — số tin theo cài đặt của bạn.\n"
    : "Thanks for subscribing.\n\nEach morning (around 7:00 in your timezone) we send the AI;DR digest — story count follows your settings.\n";
  const { html, text } = renderNoteEmail({
    subject,
    bodyMd,
    lang: vi ? "vi" : "en",
    unsubscribeUrl: unsubscribeUrl(sub.unsubscribe_token, vi ? "vi" : "en"),
    settingsUrl: settingsUrl(sub.unsubscribe_token, vi ? "vi" : "en"),
    cta: { label: vi ? "Mở aidr.today" : "Open aidr.today", url: SITE_URL },
  });
  return sendSubscriberEmail(env, {
    to: sub.email,
    from: digestFrom(env),
    subject,
    html,
    text,
    unsubscribeToken: sub.unsubscribe_token,
    lang: vi ? "vi" : "en",
  });
}

/** Snapshot bullets store text + item ids. The story image lives on `items`. */
export function digestBulletsWithImages(
  bullets: TldrBulletLike[],
  rows: Array<{ id: string; image_url?: string | null }>
): TldrBulletLike[] {
  const byId = new Map<string, string>();
  for (const row of rows) {
    const url = canonicalizeMediaImageUrl(row.image_url);
    if (row.id && url) byId.set(row.id, url);
  }
  return bullets.map((bullet) => {
    const ids = [
      ...(bullet.item_ids ?? []),
      ...(bullet.item_id ? [bullet.item_id] : []),
    ];
    for (const id of ids) {
      const url = byId.get(id);
      if (url) return { ...bullet, image_url: url };
    }
    return bullet;
  });
}

async function loadBulletImages(
  env: Env,
  bullets: TldrBulletLike[]
): Promise<TldrBulletLike[]> {
  const ids = [
    ...new Set(
      bullets.flatMap((bullet) => [
        ...(bullet.item_ids ?? []),
        ...(bullet.item_id ? [bullet.item_id] : []),
      ])
    ),
  ];
  if (ids.length === 0) return bullets;
  const placeholders = ids.map(() => "?").join(", ");
  const { results } = await env.DB.prepare(
    `SELECT id, image_url FROM items WHERE id IN (${placeholders})`
  )
    .bind(...ids)
    .all<{ id: string; image_url: string | null }>();
  return digestBulletsWithImages(bullets, results ?? []);
}

/** One email lane. `en` and `vi` are separate: a subscriber only receives
 *  the edition for `subscribers.lang`, in their digest size and mail format. */
export async function sendEmailLane(
  env: Env,
  lang: "en" | "vi",
  subscribers: SubscriberRow[],
  now: number,
  editions: Map<string, Edition | null>
): Promise<{ sent: number; failed: number; stampedDate: string | null }> {
  let sent = 0;
  let failed = 0;
  let stampedDate: string | null = null;
  for (const sub of subscribers) {
    if ((sub.lang === "en" ? "en" : "vi") !== lang) continue;
    const { hour, date: localDate } = getLocalHourAndDate(now, sub.timezone);
    if (!shouldSendForSubscriber(sub, hour, localDate)) continue;

    const size = digestSizeFor(sub.digest_size);
    const format = normalizeMailFormat(sub.mail_format);
    const cacheKey = `${localDate}:${lang}:${size}`;
    let edition = editions.get(cacheKey);
    if (edition === undefined) {
      edition = await loadEdition(env, localDate, lang, size);
      editions.set(cacheKey, edition);
    }
    if (!edition) continue;
    const bullets =
      format === "text"
        ? edition.bullets
        : await loadBulletImages(env, edition.bullets);

    const { subject, html, text } = buildDigestEmail(
      edition.date,
      bullets,
      lang,
      sub.unsubscribe_token,
      size,
      format
    );

    const ok = await sendSubscriberEmail(env, {
      to: sub.email,
      from: digestFrom(env),
      subject,
      html,
      text,
      unsubscribeToken: sub.unsubscribe_token,
      lang,
    });
    if (!ok) {
      failed++;
      continue;
    }

    await env.DB.prepare(
      "UPDATE subscribers SET last_sent_date = ? WHERE email = ?"
    )
      .bind(localDate, sub.email)
      .run();
    sent++;
    stampedDate = edition.date;
  }
  return { sent, failed, stampedDate };
}

export async function sendDailyTldr(env: Env): Promise<number> {
  if (!env.EMAIL) {
    console.error("EMAIL binding not configured; skipping daily digest");
    return 0;
  }
  await ensureMailSchema(env.DB);

  const { results: subscribers } = await env.DB.prepare(
    "SELECT email, lang, unsubscribe_token, timezone, last_sent_date, digest_size, mail_format FROM subscribers WHERE confirmed = 1"
  ).all<SubscriberRow>();

  if (!subscribers || subscribers.length === 0) return 0;

  const now = Date.now();
  const editions = new Map<string, Edition | null>();
  const en = await sendEmailLane(env, "en", subscribers, now, editions);
  const vi = await sendEmailLane(env, "vi", subscribers, now, editions);
  const emailsSent = en.sent + vi.sent;
  const failed = en.failed + vi.failed;
  const stampedDate = en.stampedDate ?? vi.stampedDate;
  console.info("email-digest", {
    en: en.sent,
    vi: vi.sent,
    failed,
  });
  if (failed > 0) {
    console.error(`email-digest failed for ${failed} subscriber(s)`);
    await reportDeliveryFailure(
      env,
      `email digest failed for ${failed} subscriber(s)`,
      { channel: "email", kind: "digest", failed: String(failed) }
    );
  }

  // Legacy signal only: marks that this snapshot has been mailed at least
  // once. Nothing reads this to decide whether to send anymore.
  if (stampedDate) {
    await env.DB.prepare(
      "UPDATE tldr_snapshots SET sent_at = COALESCE(sent_at, ?) WHERE date = ?"
    )
      .bind(now, stampedDate)
      .run();
  }

  return emailsSent;
}
