import { parseDayVideoRow } from "../../src/lib/feed-queries.js";
import { categoryLabel } from "../../src/lib/lang.js";
import { absoluteSiteUrl } from "../../src/lib/locale-url.js";
import { type MailFont, normalizeMailFont } from "../../src/lib/mail-font.js";
import {
  type MailFormat,
  normalizeMailFormat,
} from "../../src/lib/mail-format.js";
import {
  type MailFrequency,
  normalizeMailFrequency,
  normalizeWeeklyDay,
  type WeeklyDay,
  weekdayName,
} from "../../src/lib/mail-frequency.js";
import { SITE_URL } from "../../src/lib/site.js";
import { storyPath } from "../../src/lib/slug.js";
import { weekBounds } from "../../src/lib/week.js";
import { parseJsonArray, parseStoryLines } from "../../src/lib/week-model.js";
import { reportDeliveryFailure } from "../bugsink.js";
import {
  type Edition,
  loadEdition,
  type TldrBulletLike,
  topBullets,
} from "../digest/edition.js";
import {
  type DigestVideo,
  renderDigestEmail,
  renderNoteEmail,
  settingsUrl,
  unsubscribeUrl,
  type WeeklyMailMeta,
} from "../mail/render.js";
import { ensureMailSchema } from "../mail/schema.js";
import { digestFrom, sendSubscriberEmail } from "../mail/send.js";
import { recordMailStat } from "../mail/stats.js";
import { canonicalizeMediaImageUrl } from "../media.js";
import type { Env } from "../types.js";
import {
  digestWindow,
  isoWeekOfWindow,
  shiftDate,
  weekdayOf,
} from "../weekly-digest.js";
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
  mail_font?: string | null;
  /** `daily` (default) or `weekly`; see src/lib/mail-frequency.ts. */
  frequency?: string | null;
  /** End date (YYYY-MM-DD) of the last weekly digest mailed. */
  last_weekly_sent?: string | null;
  /** Local weekday for the weekly digest, 0 = Sunday; default Monday. */
  weekly_day?: number | null;
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

/** A title-only fallback digest (the LLM failed) waits until this local
 *  hour for the 6-hourly retry to upgrade it, then goes out as it is. */
export const WEEKLY_FALLBACK_HOUR = 13;

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000
  );
}

/** A new window may overlap the last one mailed by at most 3 days, so
 *  moving the send day earlier (Wed → Mon) still mails that week, while
 *  moving it later in the same week (Mon → Wed) waits for the next one. */
export const WEEKLY_MIN_GAP_DAYS = 4;

/** `last_weekly_sent` as an end date. Before send days existed it held the
 *  ISO week key (`YYYY-Www`), whose window ends on that week's Sunday. */
export function lastWeeklyEndDate(
  last: string | null | undefined
): string | null {
  if (!last) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(last)) return last;
  return weekBounds(last)?.end ?? null;
}

/** A weekly subscriber gets the digest on their chosen local weekday, from
 *  DIGEST_LOCAL_HOUR, once per window. `last_weekly_sent` is the end date of
 *  the last window mailed; see WEEKLY_MIN_GAP_DAYS for a changed send day. */
export function shouldSendWeeklyForSubscriber(
  sub: Pick<SubscriberRow, "last_weekly_sent" | "weekly_day">,
  localHour: number,
  localDate: string,
  digest?: { fallback?: boolean }
): boolean {
  if (localHour < DIGEST_LOCAL_HOUR) return false;
  if (weekdayOf(localDate) !== normalizeWeeklyDay(sub.weekly_day)) {
    return false;
  }
  const { end } = digestWindow(localDate);
  const last = lastWeeklyEndDate(sub.last_weekly_sent);
  if (last && daysBetween(last, end) < WEEKLY_MIN_GAP_DAYS) return false;
  return !digest?.fallback || localHour >= WEEKLY_FALLBACK_HOUR;
}

/** A snapshot bullet joined with its `items` row (see `loadBulletDetails`). */
export interface DigestBullet extends TldrBulletLike {
  /** `title` or `title_vi` for the edition's language; never the other one. */
  headline?: string;
  /** Publisher host, `www.` dropped. */
  source?: string;
  category?: string;
}

/** Extras the edition renderer loads beside the bullets. */
export interface DigestExtras {
  video?: DigestVideo | null;
  weekVideos?: DigestVideo[];
  postalAddress?: string;
  font?: MailFont;
  /** Renders the weekly edition instead of a day (see `renderWeeklyEmail`). */
  weekly?: WeeklyMailMeta;
}

/** Builds the plain-text and HTML bodies for a subscriber's daily digest email. */
export function buildDigestEmail(
  date: string,
  bullets: DigestBullet[],
  lang: string,
  unsubscribeToken: string,
  max = MAX_BULLETS,
  format: MailFormat = "design",
  extras: DigestExtras = {}
): { subject: string; html: string; text: string } {
  const mailLang = lang === "en" ? "en" : "vi";
  const items = bullets.slice(0, max);
  return renderDigestEmail({
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
      headline: b.headline,
      source: b.source,
      category: b.category,
    })),
    unsubscribeUrl: unsubscribeUrl(unsubscribeToken, mailLang),
    settingsUrl: settingsUrl(unsubscribeToken, mailLang),
    format,
    font: extras.font,
    video: extras.video,
    weekVideos: extras.weekVideos,
    postalAddress: extras.postalAddress,
    feedbackToken: unsubscribeToken,
    weekly: extras.weekly,
  });
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
 * A missing local-date row sends and stamps nothing; the subscriber gets
 * that edition on the first run after it exists.
 *
 * A per-subscriber failure is logged and swallowed without stamping
 * `last_sent_date`, so that subscriber is retried on the next hourly run.
 * No-ops entirely if the EMAIL binding isn't configured, or there's no
 * snapshot with bullets yet — this must never break the hourly ingest
 * workflow.
 */
export function confirmUrl(token: string): string {
  return `${SITE_URL}/api/subscribe/confirm?token=${encodeURIComponent(token)}`;
}

/** Double opt-in: nothing else is sent until this link is clicked. */
export async function sendConfirmEmail(
  env: Env,
  sub: { email: string; lang: string; unsubscribe_token: string }
): Promise<boolean> {
  const vi = sub.lang !== "en";
  const subject = vi
    ? "Xác nhận đăng ký AI;DR"
    : "Confirm your AI;DR subscription";
  const bodyMd = vi
    ? "Bấm nút bên dưới để xác nhận và bắt đầu nhận bản tin AI;DR.\n\nNếu bạn không đăng ký, cứ bỏ qua email này — bạn sẽ không nhận thêm gì.\n"
    : "Click the button below to confirm and start getting the AI;DR digest.\n\nIf you didn't sign up, ignore this email — you won't hear from us again.\n";
  const { html, text } = renderNoteEmail({
    subject,
    bodyMd,
    lang: vi ? "vi" : "en",
    unsubscribeUrl: unsubscribeUrl(sub.unsubscribe_token, vi ? "vi" : "en"),
    settingsUrl: settingsUrl(sub.unsubscribe_token, vi ? "vi" : "en"),
    postalAddress: env.MAIL_POSTAL_ADDRESS,
    cta: {
      label: vi ? "Xác nhận đăng ký" : "Confirm subscription",
      url: confirmUrl(sub.unsubscribe_token),
    },
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

export interface RequestedPrefs {
  lang: "en" | "vi";
  timezone: string;
  digest_size: number;
  mail_format: MailFormat;
  mail_font: MailFont;
  frequency: MailFrequency;
  weekly_day: WeeklyDay;
}

/** The confirm link plus the settings it applies once clicked. The params
 *  are `set_*` because mail rendering rewrites every link's `lang`. */
export function settingsChangeUrl(
  token: string,
  prefs: RequestedPrefs
): string {
  const params = new URLSearchParams({
    set_lang: prefs.lang,
    set_timezone: prefs.timezone,
    set_digest_size: String(prefs.digest_size),
    set_mail_format: prefs.mail_format,
    set_mail_font: prefs.mail_font,
    set_frequency: prefs.frequency,
    set_weekly_day: String(prefs.weekly_day),
  });
  return `${confirmUrl(token)}&${params.toString()}`;
}

/** A signup form re-submitted for an already-confirmed address. The new
 *  settings apply only when the mailbox owner clicks the link (#534). */
export async function sendSettingsChangeEmail(
  env: Env,
  sub: { email: string; lang: string; unsubscribe_token: string },
  prefs: RequestedPrefs
): Promise<boolean> {
  const vi = sub.lang !== "en";
  const subject = vi
    ? "Xác nhận thay đổi cài đặt AI;DR"
    : "Confirm your AI;DR settings change";
  const settingsList = vi
    ? `- Ngôn ngữ: ${prefs.lang}\n- Múi giờ: ${prefs.timezone}\n- Tần suất: ${prefs.frequency === "weekly" ? `hằng tuần (${weekdayName(prefs.weekly_day, "vi")})` : "hằng ngày"}\n- Số tin: ${prefs.digest_size}\n- Định dạng: ${prefs.mail_format}\n- Phông tiêu đề: ${prefs.mail_font === "serif" ? "có chân" : "không chân"}\n`
    : `- Language: ${prefs.lang}\n- Timezone: ${prefs.timezone}\n- Frequency: ${prefs.frequency === "weekly" ? `weekly (${weekdayName(prefs.weekly_day, "en")})` : "daily"}\n- Stories: ${prefs.digest_size}\n- Format: ${prefs.mail_format}\n- Headline font: ${prefs.mail_font}\n`;
  const bodyMd = vi
    ? `Có người vừa đăng ký lại địa chỉ này với các cài đặt sau:\n\n${settingsList}\nBấm nút bên dưới để áp dụng. Nếu không phải bạn, cứ bỏ qua email này — cài đặt hiện tại sẽ giữ nguyên.\n`
    : `Someone just signed up this address again with these settings:\n\n${settingsList}\nClick the button below to apply them. If this wasn't you, ignore this email — your current settings stay as they are.\n`;
  const { html, text } = renderNoteEmail({
    subject,
    bodyMd,
    lang: vi ? "vi" : "en",
    unsubscribeUrl: unsubscribeUrl(sub.unsubscribe_token, vi ? "vi" : "en"),
    settingsUrl: settingsUrl(sub.unsubscribe_token, vi ? "vi" : "en"),
    postalAddress: env.MAIL_POSTAL_ADDRESS,
    cta: {
      label: vi ? "Áp dụng cài đặt" : "Apply settings",
      url: settingsChangeUrl(sub.unsubscribe_token, prefs),
    },
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

export async function sendWelcomeEmail(
  env: Env,
  sub: {
    email: string;
    lang: string;
    unsubscribe_token: string;
    frequency?: string | null;
    weekly_day?: number | null;
  }
): Promise<boolean> {
  const vi = sub.lang !== "en";
  const weekly = normalizeMailFrequency(sub.frequency) === "weekly";
  const day = normalizeWeeklyDay(sub.weekly_day);
  const subject = vi
    ? "Bạn đã đăng ký AI;DR — aidr.today"
    : "You're subscribed to AI;DR — aidr.today";
  const bodyMd = weekly
    ? vi
      ? `Cảm ơn bạn đã đăng ký.\n\nMỗi sáng ${weekdayName(day, "vi")} (khoảng 7h theo giờ của bạn) chúng tôi gửi AI;DR Tuần — những tin AI đáng chú ý nhất của 7 ngày trước đó. Bạn có thể đổi ngày nhận hoặc chuyển sang bản tin hằng ngày trong phần cài đặt.\n`
      : `Thanks for subscribing.\n\nEvery ${weekdayName(day, "en")} morning (around 7:00 in your timezone) we send AI;DR Weekly — the stories that mattered most in the 7 days before. You can change the day or switch to the daily digest in your settings.\n`
    : vi
      ? "Cảm ơn bạn đã đăng ký.\n\nMỗi sáng (khoảng 7h theo giờ của bạn) chúng tôi gửi bản tin AI;DR — số tin theo cài đặt của bạn.\n"
      : "Thanks for subscribing.\n\nEach morning (around 7:00 in your timezone) we send the AI;DR digest — story count follows your settings.\n";
  const { html, text } = renderNoteEmail({
    subject,
    bodyMd,
    lang: vi ? "vi" : "en",
    unsubscribeUrl: unsubscribeUrl(sub.unsubscribe_token, vi ? "vi" : "en"),
    settingsUrl: settingsUrl(sub.unsubscribe_token, vi ? "vi" : "en"),
    postalAddress: env.MAIL_POSTAL_ADDRESS,
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

interface BulletItemRow {
  id: string;
  image_url?: string | null;
  title?: string | null;
  title_vi?: string | null;
  category?: string | null;
  url?: string | null;
}

function sourceHost(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).hostname.replace(/^www\./, "") || undefined;
  } catch {
    return undefined;
  }
}

/** Joins each bullet to its own item through `item_ids` (never by position):
 *  image, headline in `lang` only, category and source host. */
export function digestBulletsWithItems(
  bullets: TldrBulletLike[],
  rows: BulletItemRow[],
  lang: "en" | "vi"
): DigestBullet[] {
  const byId = new Map(rows.filter((r) => r.id).map((r) => [r.id, r]));
  return digestBulletsWithImages(bullets, rows).map((bullet) => {
    const ids = [
      ...(bullet.item_ids ?? []),
      ...(bullet.item_id ? [bullet.item_id] : []),
    ];
    const row = ids.map((id) => byId.get(id)).find(Boolean);
    if (!row) return bullet;
    const title = (lang === "en" ? row.title : row.title_vi)?.trim();
    const category = row.category?.trim();
    const source = sourceHost(row.url);
    return {
      ...bullet,
      ...(title ? { headline: title } : {}),
      ...(category ? { category: categoryLabel(category, lang) } : {}),
      ...(source ? { source } : {}),
    };
  });
}

async function loadBulletDetails(
  env: Pick<Env, "DB">,
  bullets: TldrBulletLike[],
  lang: "en" | "vi"
): Promise<DigestBullet[]> {
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
  // title_vi lives in translations, like the feed query (ITEM_SELECT_BASE).
  // A failed lookup must never block the send: fall back to the bare bullets.
  try {
    const { results } = await env.DB.prepare(
      `SELECT i.id, i.image_url, i.title, t.title AS title_vi, i.category, i.url
       FROM items i
       LEFT JOIN translations t ON t.item_id = i.id AND t.lang = 'vi'
       WHERE i.id IN (${placeholders})`
    )
      .bind(...ids)
      .all<BulletItemRow>();
    return digestBulletsWithItems(bullets, results ?? [], lang);
  } catch (error) {
    console.warn("digest: bullet details lookup failed", error);
    return digestBulletsWithItems(bullets, [], lang);
  }
}

/** Day videos from `start` to `end`, newest first, in `lang` only
 *  (`youtube_id`, else `short_id`); days without one in `lang` are skipped.
 *  A missing column or table reads as none. */
async function loadDigestVideos(
  env: Pick<Env, "DB">,
  start: string,
  end: string,
  lang: "en" | "vi"
): Promise<DigestVideo[]> {
  try {
    const { results } = await env.DB.prepare(
      `SELECT date, youtube_id, short_id, title, youtube_id_vi, short_id_vi, title_vi
       FROM day_videos WHERE date BETWEEN ? AND ? ORDER BY date DESC`
    )
      .bind(start, end)
      .all<{ date: string }>();
    return (results ?? []).flatMap((row) => {
      const video = parseDayVideoRow(row)[lang];
      const id = video?.youtube_id ?? video?.short_id;
      return id
        ? [{ date: row.date, youtubeId: id, title: video?.title ?? null }]
        : [];
    });
  } catch {
    return [];
  }
}

/** Day videos go up in the afternoon, after the morning send, so the daily
 *  mail takes the newest of its date and the day before. */
async function loadDailyVideo(
  env: Pick<Env, "DB">,
  date: string,
  lang: "en" | "vi"
): Promise<DigestVideo | null> {
  if (Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return null;
  const videos = await loadDigestVideos(env, shiftDate(date, -1), date, lang);
  return videos[0] ?? null;
}

/** The digest mail for one edition, exactly as it is sent: joins the
 *  bullets to their items and the day video, then renders. The subscribe
 *  and admin previews call this too, so the preview is the mail that arrives.
 *  `preloadedVideo` (null = none) skips the video lookup; the lanes load it
 *  once per edition. */
export async function renderEditionEmail(
  env: Pick<Env, "DB" | "MAIL_POSTAL_ADDRESS">,
  edition: Pick<Edition, "date" | "lang" | "bullets">,
  unsubscribeToken: string,
  size: number,
  format: MailFormat,
  preloadedVideo?: DigestVideo | null,
  font?: MailFont
): Promise<{ subject: string; html: string; text: string }> {
  const lang = edition.lang === "en" ? "en" : "vi";
  const [bullets, video] = await Promise.all([
    loadBulletDetails(env, edition.bullets, lang),
    preloadedVideo === undefined
      ? loadDailyVideo(env, edition.date, lang)
      : preloadedVideo,
  ]);
  return buildDigestEmail(
    edition.date,
    bullets,
    edition.lang,
    unsubscribeToken,
    size,
    format,
    {
      video,
      font,
      postalAddress: env.MAIL_POSTAL_ADDRESS?.trim() || undefined,
    }
  );
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
  const videos = new Map<string, DigestVideo | null>();
  for (const sub of subscribers) {
    if ((sub.lang === "en" ? "en" : "vi") !== lang) continue;
    if (normalizeMailFrequency(sub.frequency) === "weekly") continue;
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
    const videoKey = `${edition.date}:${lang}`;
    let video = videos.get(videoKey);
    if (video === undefined) {
      video = await loadDailyVideo(env, edition.date, lang);
      videos.set(videoKey, video);
    }
    const { subject, html, text } = await renderEditionEmail(
      env,
      edition,
      sub.unsubscribe_token,
      size,
      format,
      video,
      normalizeMailFont(sub.mail_font)
    );

    const ok = await sendSubscriberEmail(env, {
      to: sub.email,
      from: digestFrom(env),
      subject,
      html,
      text,
      unsubscribeToken: sub.unsubscribe_token,
      lang,
      replyTo: env.EMAIL_REPLY_TO?.trim() || undefined,
    });
    if (!ok) {
      failed++;
      await recordMailStat(env.DB, "failed", lang, now);
      continue;
    }

    // Count only when the stamp moves: a retry that finds it already set
    // (or a duplicate row) must not add a second `sent`.
    const stamp = await env.DB.prepare(
      "UPDATE subscribers SET last_sent_date = ? WHERE email = ? AND last_sent_date IS NOT ?"
    )
      .bind(localDate, sub.email, localDate)
      .run();
    if (stamp.meta?.changes) await recordMailStat(env.DB, "sent", lang, now);
    sent++;
    stampedDate = edition.date;
  }
  return { sent, failed, stampedDate };
}

/** One weekly digest in one language, as digest bullets. */
export interface WeeklyMail {
  meta: WeeklyMailMeta;
  fallback: boolean;
  bullets: TldrBulletLike[];
}

interface WeeklyRow {
  start_date: string;
  end_date: string;
  item_ids: string;
  intro_en: string | null;
  intro_vi: string | null;
  stories_en: string;
  stories_vi: string;
  fallback: number;
}

/** The digest whose window ends on `endDate`: the ISO-week edition
 *  (`weekly_snapshots`) when that is a Sunday, else the rolling
 *  `weekly_digests` row. A missing row or table reads as null. */
async function loadWeeklyRow(
  env: Pick<Env, "DB">,
  endDate: string
): Promise<WeeklyRow | null> {
  const iso = isoWeekOfWindow(endDate);
  try {
    return iso
      ? await env.DB.prepare(
          `SELECT start_date, end_date, item_ids, intro_en, intro_vi,
             stories_en, stories_vi, fallback
           FROM weekly_snapshots WHERE week = ? LIMIT 1`
        )
          .bind(iso.week)
          .first<WeeklyRow>()
      : await env.DB.prepare(
          `SELECT start_date, end_date, item_ids, intro_en, intro_vi,
             stories_en, stories_vi, fallback
           FROM weekly_digests WHERE end_date = ? LIMIT 1`
        )
          .bind(endDate)
          .first<WeeklyRow>();
  } catch {
    return null;
  }
}

/** The digest ending `endDate` in `lang`, cut to `size` stories. Null when
 *  there is no row or `lang` has no lines: the other language is never sent
 *  in its place. */
export async function loadWeeklyMail(
  env: Pick<Env, "DB">,
  endDate: string,
  lang: "en" | "vi",
  size: number
): Promise<WeeklyMail | null> {
  const row = await loadWeeklyRow(env, endDate);
  if (!row) return null;
  const lines = parseStoryLines(
    lang === "en" ? row.stories_en : row.stories_vi
  );
  const bullets = parseJsonArray(row.item_ids)
    .filter((id): id is string => typeof id === "string" && lines.has(id))
    .slice(0, size)
    .map((id) => ({ text: lines.get(id) ?? "", item_id: id, item_ids: [id] }));
  if (bullets.length === 0) return null;
  const iso = isoWeekOfWindow(endDate);
  return {
    meta: {
      week: iso?.week ?? null,
      issue: iso?.issue ?? null,
      start_date: row.start_date,
      end_date: row.end_date,
      intro: (lang === "en" ? row.intro_en : row.intro_vi)?.trim() || null,
    },
    fallback: row.fallback === 1,
    bullets,
  };
}

/** The newest digest of either kind, for previews. */
export async function latestWeeklyEndDate(
  env: Pick<Env, "DB">
): Promise<string | null> {
  let latest: string | null = null;
  for (const sql of [
    "SELECT MAX(end_date) AS d FROM weekly_digests",
    "SELECT MAX(end_date) AS d FROM weekly_snapshots",
  ]) {
    try {
      const row = await env.DB.prepare(sql).first<{ d: string | null }>();
      if (row?.d && (!latest || row.d > latest)) latest = row.d;
    } catch {
      // Table not migrated yet.
    }
  }
  return latest;
}

/** The weekly mail exactly as it is sent; the previews call this too. */
export async function renderWeeklyEmail(
  env: Pick<Env, "DB" | "MAIL_POSTAL_ADDRESS">,
  mail: WeeklyMail,
  lang: "en" | "vi",
  unsubscribeToken: string,
  format: MailFormat,
  preloadedVideos?: DigestVideo[],
  font?: MailFont
): Promise<{ subject: string; html: string; text: string }> {
  const [bullets, videos] = await Promise.all([
    loadBulletDetails(env, mail.bullets, lang),
    preloadedVideos ??
      loadDigestVideos(env, mail.meta.start_date, mail.meta.end_date, lang),
  ]);
  return buildDigestEmail(
    mail.meta.end_date,
    bullets,
    lang,
    unsubscribeToken,
    bullets.length,
    format,
    {
      postalAddress: env.MAIL_POSTAL_ADDRESS?.trim() || undefined,
      font,
      weekly: mail.meta,
      weekVideos: [...videos].reverse(),
    }
  );
}

/** Weekly subscribers, both languages. Each one due today (their weekday,
 *  local) reads the shared digest for the 7 days before their local date;
 *  digests are loaded once per (window, language, size), never built here.
 *  A missing digest or a failed send is not stamped and retries next run. */
export async function sendWeeklyLane(
  env: Env,
  subscribers: SubscriberRow[],
  now: number
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const mails = new Map<string, WeeklyMail | null>();
  const weekVideos = new Map<string, DigestVideo[]>();
  for (const sub of subscribers) {
    if (normalizeMailFrequency(sub.frequency) !== "weekly") continue;
    const { hour, date: localDate } = getLocalHourAndDate(now, sub.timezone);
    if (!shouldSendWeeklyForSubscriber(sub, hour, localDate)) continue;
    const lang = sub.lang === "en" ? "en" : "vi";
    const size = digestSizeFor(sub.digest_size);
    const { end } = digestWindow(localDate);
    const key = `${end}:${lang}:${size}`;
    let mail = mails.get(key);
    if (mail === undefined) {
      mail = await loadWeeklyMail(env, end, lang, size);
      mails.set(key, mail);
    }
    if (!mail) continue;
    if (
      !shouldSendWeeklyForSubscriber(sub, hour, localDate, {
        fallback: mail.fallback,
      })
    ) {
      continue;
    }
    // One subscriber's render or send error must not stop the others.
    let ok = false;
    try {
      let videos = weekVideos.get(key);
      if (videos === undefined) {
        videos = await loadDigestVideos(
          env,
          mail.meta.start_date,
          mail.meta.end_date,
          lang
        );
        weekVideos.set(key, videos);
      }
      const { subject, html, text } = await renderWeeklyEmail(
        env,
        mail,
        lang,
        sub.unsubscribe_token,
        normalizeMailFormat(sub.mail_format),
        videos,
        normalizeMailFont(sub.mail_font)
      );
      ok = await sendSubscriberEmail(env, {
        to: sub.email,
        from: digestFrom(env),
        subject,
        html,
        text,
        unsubscribeToken: sub.unsubscribe_token,
        lang,
        replyTo: env.EMAIL_REPLY_TO?.trim() || undefined,
      });
    } catch (error) {
      console.error("weekly digest send failed:", error);
    }
    if (!ok) {
      failed++;
      await recordMailStat(env.DB, "failed", lang, now);
      continue;
    }
    const stamp = await env.DB.prepare(
      "UPDATE subscribers SET last_weekly_sent = ? WHERE email = ? AND last_weekly_sent IS NOT ?"
    )
      .bind(end, sub.email, end)
      .run();
    if (stamp.meta?.changes) await recordMailStat(env.DB, "sent", lang, now);
    sent++;
  }
  return { sent, failed };
}

/** Admin preview: today's VI and EN digest mail to one address, rendered
 *  exactly as the lane sends it (design layout). Nothing is stamped. */
export async function previewDigestEmail(
  env: Env,
  to: string
): Promise<Record<string, string>> {
  const { date } = getLocalHourAndDate(Date.now(), DEFAULT_TIMEZONE);
  const out: Record<string, string> = {};
  for (const lang of ["vi", "en"] as const) {
    const size = digestSizeFor(null);
    const edition = await loadEdition(env, date, lang, size);
    if (!edition) {
      out[lang] = `no ${lang} edition for ${date}`;
      continue;
    }
    const { subject, html, text } = await renderEditionEmail(
      env,
      edition,
      "preview",
      size,
      normalizeMailFormat(null)
    );
    const ok = await sendSubscriberEmail(env, {
      to,
      from: digestFrom(env),
      subject: `[preview] ${subject}`,
      html,
      text,
      unsubscribeToken: "preview",
      lang,
      replyTo: env.EMAIL_REPLY_TO?.trim() || undefined,
    });
    out[lang] = ok ? "sent" : "failed";
  }
  return out;
}

export async function sendDailyTldr(env: Env): Promise<number> {
  if (!env.EMAIL) {
    console.error("EMAIL binding not configured; skipping daily digest");
    return 0;
  }
  await ensureMailSchema(env.DB);

  const { results: subscribers } = await env.DB.prepare(
    "SELECT email, lang, unsubscribe_token, timezone, last_sent_date, digest_size, mail_format, mail_font, frequency, last_weekly_sent, weekly_day FROM subscribers WHERE confirmed = 1"
  ).all<SubscriberRow>();

  if (!subscribers || subscribers.length === 0) return 0;

  const now = Date.now();
  const editions = new Map<string, Edition | null>();
  const en = await sendEmailLane(env, "en", subscribers, now, editions);
  const vi = await sendEmailLane(env, "vi", subscribers, now, editions);
  const weekly = await sendWeeklyLane(env, subscribers, now);
  const emailsSent = en.sent + vi.sent + weekly.sent;
  const failed = en.failed + vi.failed + weekly.failed;
  const stampedDate = en.stampedDate ?? vi.stampedDate;
  console.info("email-digest", {
    en: en.sent,
    vi: vi.sent,
    weekly: weekly.sent,
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
