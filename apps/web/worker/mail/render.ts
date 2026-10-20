import { dayArchivePath } from "../../src/lib/day-archive.js";
import { youtubeThumbnailUrl } from "../../src/lib/day-video.js";
import { absoluteSiteUrl, withSiteLang } from "../../src/lib/locale-url.js";
import { type MailFont, normalizeMailFont } from "../../src/lib/mail-font.js";
import {
  type MailFormat,
  normalizeMailFormat,
} from "../../src/lib/mail-format.js";
import { SITE_URL } from "../../src/lib/site.js";
import { formatWeekRange, weekPath } from "../../src/lib/week.js";
import { isGeneratedOgCard } from "../media.js";
import { splitSentences } from "../sentences.js";
import { digestCampaign } from "../utm.js";
import { shiftDate } from "../weekly-digest.js";
import { feedbackUrl } from "./feedback.js";
import {
  escapeHtml,
  markdownToEmailHtml,
  markdownToPlainText,
  safeHref,
} from "./markdown.js";
import { type MailUtmKind, type MailUtmOptions, withMailUtm } from "./utm.js";

export const NOTES_FROM = {
  email: "notes@aidr.today",
  name: "AI;DR",
} as const;

export const NEWS_FROM = {
  email: "digest@aidr.today",
  name: "AI;DR",
} as const;

/** Square 128px PNG at site root (Worker ASSETS). The mail header now uses
 *  the text wordmark on a yellow marker (readable on light and dark), but
 *  the PNG stays the public brand asset other surfaces link to. */
export const MAIL_LOGO_URL = `${SITE_URL}/logo-icon.png`;

/** Channel links shown under the stories. */
export const TELEGRAM_URL: Record<MailLang, string> = {
  en: "https://t.me/aidr_today",
  vi: "https://t.me/aihomnay",
};
export const YOUTUBE_URL = "https://youtube.com/@_duyet";
export const CHROME_EXTENSION_URL =
  "https://chromewebstore.google.com/detail/aidr/cagjehdlblcobkghgbbilnpefelbmpcg";

/** Column width and side padding. 600 is the email standard. */
const WIDTH = 600;
const PAD = "24px";
const INNER_PX = WIDTH - 2 * 24;
const THUMB_PX = 64;

/** Editorial tokens (the redesign canvas). Six-digit hex only: Outlook and
 *  older clients ignore 8-digit alpha colours. */
const BG = "#ffffff";
const CARD = "#ffffff";
const FG = "#111111";
const BODY = "#333333";
const MUTED = "#6b6b6b";
const FAINT = "#b5b2a8";
const ACCENT = "#111111";
const ACCENT_FG = "#ffffff";
const HAIRLINE = "#eeeeee";
const SOFT = "#ffffff";
const PILL = "#d6d2c6";
const INK = "#141413";
/** Site families first, then system fallbacks.
 *  No double quotes — these are interpolated into style="font-family:…" and
 *  a " inside the value would terminate the HTML attribute (Gmail then
 *  paints blue underlined leftovers). Multi-word names take single quotes:
 *  an unquoted `Source Sans 3` is invalid CSS (3 is not an identifier) and
 *  makes the client drop the whole declaration. */
const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

/** Headline face per `MailFont`; running text always stays on SANS. The serif
 *  loads from Google Fonts where the client allows it and falls back to
 *  Georgia where it does not. */
const DISPLAY: Record<
  MailFont,
  {
    family: string;
    mark: number;
    lead: number;
    leadLh: number;
    row: number;
    rowLh: number;
    rowWeight: number;
  }
> = {
  sans: {
    family: SANS,
    mark: 18,
    lead: 18,
    leadLh: 1.3,
    row: 15,
    rowLh: 1.35,
    rowWeight: 600,
  },
  serif: {
    family: "'EB Garamond', Garamond, Georgia, 'Times New Roman', serif",
    mark: 20,
    lead: 21,
    leadLh: 1.2,
    row: 18,
    rowLh: 1.25,
    rowWeight: 700,
  },
};
const SERIF_FONT_HREF =
  "https://fonts.googleapis.com/css2?family=EB+Garamond:wght@700&display=swap";

export type MailLang = "en" | "vi";

export function normalizeMailLang(value: unknown): MailLang {
  return value === "en" ? "en" : "vi";
}

export interface NoteEmailInput {
  subject: string;
  preheader?: string;
  bodyMd: string;
  cta?: { label: string; url: string };
  unsubscribeUrl: string;
  settingsUrl: string;
  wordmark?: string;
  lang?: MailLang;
  /** UTM medium/campaign for aidr.today CTAs. Default welcome. */
  mailKind?: MailUtmKind;
  /** CAN-SPAM mailing address (env MAIL_POSTAL_ADDRESS). Line omitted when empty. */
  postalAddress?: string;
}

export interface DigestStory {
  /** The TL;DR bullet in the edition's language. */
  text: string;
  /** Link target (the story page on aidr.today). */
  url?: string;
  imageUrl?: string;
  /** `items.title` / `items.title_vi` for the edition's language. Never the
   *  other language's title: without it the bullet's first sentence is used. */
  headline?: string;
  /** Publisher host of the original article, e.g. `techcrunch.com`. */
  source?: string;
  category?: string;
}

export interface DigestVideo {
  /** The archive day (YYYY-MM-DD) the video covers. */
  date: string;
  /** YouTube video (or Short) id for this date and language. */
  youtubeId: string;
  title?: string | null;
}

export interface DigestEmailInput {
  date: string;
  stories: DigestStory[];
  lang: MailLang;
  unsubscribeUrl: string;
  settingsUrl: string;
  /** Overrides the computed subject (the `<title>`). */
  subject?: string;
  /** Overrides the computed preheader. */
  preheader?: string;
  /** See src/lib/mail-format.ts. Default `design`. */
  format?: MailFormat;
  /** See src/lib/mail-font.ts. Default `sans`. */
  font?: MailFont;
  /** The newest video in this language, for `date` or the day before;
   *  null/absent or an older date omits the block. */
  video?: DigestVideo | null;
  /** Weekly only: the window's videos in this language, oldest first. */
  weekVideos?: DigestVideo[];
  /** Stories on the day page, for "See all N stories". Absent: no number. */
  totalStories?: number;
  postalAddress?: string;
  /** Subscriber token for the Yes / Not really links. Absent: no feedback row. */
  feedbackToken?: string;
  /** Set for the weekly edition: links, header and copy follow the week
   *  instead of `date`, and the feedback row (keyed by day) is left out. */
  weekly?: WeeklyMailMeta;
}

export interface WeeklyMailMeta {
  /** `YYYY-Www` when the window is a whole ISO week (it then has an edition
   *  page and an issue number); null for a rolling 7-day digest. */
  week: string | null;
  issue: number | null;
  start_date: string;
  end_date: string;
  /** The edition's intro in this language only; null leaves it out. */
  intro: string | null;
}

function weeklyTag(meta: WeeklyMailMeta, lang: MailLang): string {
  const label = lang === "vi" ? "AI;DR Tuần" : "AI;DR Weekly";
  return meta.issue ? `${label} #${meta.issue}` : label;
}

/** `AI;DR Weekly #3 · Oct 5 – 11, 2026` (no number for a rolling digest). */
export function weeklyHeading(meta: WeeklyMailMeta, lang: MailLang): string {
  return `${weeklyTag(meta, lang)} · ${formatWeekRange(meta.start_date, meta.end_date, lang)}`;
}

/** Lead headline after the issue tag, trimmed to the inbox width. */
export function weeklySubjectLine(
  meta: WeeklyMailMeta,
  lang: MailLang,
  leadHeadline?: string
): string {
  const tag = weeklyTag(meta, lang);
  const head = leadHeadline?.trim();
  if (!head) return weeklyHeading(meta, lang);
  const room = SUBJECT_TARGET - tag.length - 3;
  const cut =
    head.length > room ? `${head.slice(0, room - 1).trimEnd()}…` : head;
  return `${tag} — ${cut}`;
}

/* ------------------------------------------------------------------ */
/* Copy                                                               */
/* ------------------------------------------------------------------ */

const WEEKDAYS: Record<MailLang, string[]> = {
  en: [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ],
  // Hard-coded: ICU output for `vi` differs between Node and Workers.
  vi: [
    "Chủ Nhật",
    "Thứ Hai",
    "Thứ Ba",
    "Thứ Tư",
    "Thứ Năm",
    "Thứ Sáu",
    "Thứ Bảy",
  ],
};

const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function parseIsoDate(
  date: string
): { y: number; m: number; d: number; wd: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const at = new Date(Date.UTC(y, m - 1, d));
  if (at.getUTCMonth() !== m - 1) return null;
  return { y, m, d, wd: at.getUTCDay() };
}

/** "Saturday, October 10, 2026" / "Thứ Bảy, 10 tháng 10, 2026". */
export function formatMailDate(date: string, lang: MailLang): string {
  const p = parseIsoDate(date);
  if (!p) return date;
  const weekday = WEEKDAYS[lang][p.wd];
  return lang === "vi"
    ? `${weekday}, ${p.d} tháng ${p.m}, ${p.y}`
    : `${weekday}, ${MONTHS_EN[p.m - 1]} ${p.d}, ${p.y}`;
}

function weekdayOf(date: string, lang: MailLang): string | null {
  const p = parseIsoDate(date);
  return p ? WEEKDAYS[lang][p.wd] : null;
}

/** How a daily mail labels its video. Day videos go up in the afternoon,
 *  after the morning send, so the mail usually carries yesterday's. */
export type VideoRecency = "today" | "yesterday";

/** Null for any other day, so an older video is never called yesterday's. */
function videoRecency(
  videoDate: string,
  editionDate: string
): VideoRecency | null {
  if (!parseIsoDate(editionDate)) return null;
  if (videoDate === editionDate) return "today";
  return videoDate === shiftDate(editionDate, -1) ? "yesterday" : null;
}

const VIDEO_COPY: Record<
  MailLang,
  Record<VideoRecency, { kicker: string; title: string; preheader: string }>
> = {
  en: {
    today: {
      kicker: "Today's video brief",
      title: "Today's stories in under two minutes",
      preheader: ", plus today's video brief",
    },
    yesterday: {
      kicker: "Yesterday's video brief",
      title: "Yesterday's stories in under two minutes",
      preheader: ", plus yesterday's video brief",
    },
  },
  vi: {
    today: {
      kicker: "Video tóm tắt hôm nay",
      title: "Tin hôm nay trong chưa tới hai phút",
      preheader: ", kèm video tóm tắt hôm nay",
    },
    yesterday: {
      kicker: "Video tóm tắt hôm qua",
      title: "Tin hôm qua trong chưa tới hai phút",
      preheader: ", kèm video tóm tắt hôm qua",
    },
  },
};

/** Reading time at ~200 words a minute, at least one. */
export function readMinutes(stories: DigestStory[]): number {
  const words = stories
    .map((s) => `${s.headline ?? ""} ${s.text}`)
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function countLine(n: number, minutes: number, lang: MailLang): string {
  return lang === "vi"
    ? `${n} tin · ${minutes} phút đọc`
    : `${n} ${n === 1 ? "story" : "stories"} · ${minutes} min read`;
}

/** Drops a trailing "(Bloomberg)"-style publisher tag from a title. */
function cleanHeadline(title: string): string {
  return title
    .trim()
    .replace(/\s*\((?:[^()\d]{2,30})\)$/u, "")
    .trim();
}

export function storyHeadline(story: DigestStory): string {
  const h = story.headline ? cleanHeadline(story.headline) : "";
  return h || splitSentences(story.text)[0] || story.text.trim();
}

/** One sentence under a headline. With a stored headline the bullet's first
 *  sentence carries the facts; without one the first sentence already is
 *  the headline, so the next sentence is used. */
function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFC")
    .split(/[^\p{L}\p{N}$%.]+/u)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 1);
}

/** Share of the first text's words that the second repeats (0..1). */
export function headlineOverlap(text: string, other: string): number {
  const head = new Set(tokens(text));
  if (head.size === 0) return 0;
  const said = new Set(tokens(other));
  let hit = 0;
  for (const t of head) if (said.has(t)) hit++;
  return hit / head.size;
}

/** Above this the sentence only restates the headline. */
export const SUMMARY_OVERLAP_MAX = 0.7;

/** One sentence under a headline: the first sentence of the bullet that does
 *  not restate the headline, or nothing. Both directions count: a long
 *  headline can contain a whole sentence while sharing few of its words. */
export function storySummary(story: DigestStory): string {
  const headline = storyHeadline(story);
  const parts = splitSentences(story.text);
  return (
    parts.find(
      (part) =>
        part !== headline &&
        Math.max(
          headlineOverlap(headline, part),
          headlineOverlap(part, headline)
        ) <= SUMMARY_OVERLAP_MAX
    ) ?? ""
  );
}

function cutAtWord(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/u, "")}…`;
}

/** Visible subject length the inbox shows before it truncates. */
export const SUBJECT_TARGET = 60;

function moreSuffix(n: number, lang: MailLang): string {
  if (n <= 0) return "";
  return lang === "vi" ? ` + ${n} tin` : ` + ${n} more`;
}

/**
 * Subject that leads with the news: the top one or two headlines plus
 * "+N more", about 60 visible characters. Two headlines only when both fit
 * whole; otherwise the first, cut at a word. With no headlines (no stories)
 * it falls back to a fixed dated title.
 */
export function digestSubjectLine(
  date: string,
  lang: MailLang,
  headlines: string[] = [],
  count = headlines.length
): string {
  const heads = headlines.map((h) => h.trim()).filter(Boolean);
  if (heads.length === 0) {
    const label = lang === "vi" ? "Tin AI hôm nay" : "Today in AI";
    return `AI;DR — ${date} · ${label}`;
  }
  if (heads.length >= 2) {
    const two = `${heads[0]}, ${heads[1]}${moreSuffix(count - 2, lang)}`;
    if (two.length <= SUBJECT_TARGET + 4) return two;
  }
  const suffix = moreSuffix(count - 1, lang);
  return `${cutAtWord(heads[0], SUBJECT_TARGET - suffix.length)}${suffix}`;
}

/** Inbox preview line, written on purpose rather than story 1's text. */
export function digestPreheader(
  date: string,
  lang: MailLang,
  count: number,
  minutes: number,
  video: VideoRecency | null
): string {
  const wd = weekdayOf(date, lang);
  const plus = video ? VIDEO_COPY[lang][video].preheader : "";
  if (lang === "vi") {
    const day = wd
      ? ` ${wd.charAt(0).toLowerCase()}${wd.slice(1)}`
      : " hôm nay";
    return `${count} tin AI${day} trong ${minutes} phút${plus}. Tiêu đề, nguồn và một câu tóm tắt cho mỗi tin.`;
  }
  const day = wd ? `${wd}'s` : "Today's";
  return `${day} ${count} AI ${count === 1 ? "story" : "stories"} in ${minutes} ${minutes === 1 ? "minute" : "minutes"}${plus}. Headline, source and one line each.`;
}

/** Hidden filler after the preheader so body text does not leak into the
 *  inbox preview. Raw markup — never pass it through escapeHtml. */
const PREHEADER_PAD = "&zwnj;&nbsp;".repeat(90);

/* ------------------------------------------------------------------ */
/* Shell                                                              */
/* ------------------------------------------------------------------ */

const HEAD_STYLE = `
  :root { color-scheme: light; supported-color-schemes: light; }
  body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; max-width: 100%; }
  a { text-decoration: none; }
  .mail-cta, .mail-cta span, .mail-cta font { color: ${ACCENT_FG} !important; text-decoration: none !important; border-bottom: 0 !important; }
  u + #body .mail-cta { color: ${ACCENT_FG} !important; text-decoration: none !important; }
  @media only screen and (max-width: 600px) {
    .m-wrap { padding: 12px 8px !important; }
    .m-pad { padding-left: 20px !important; padding-right: 20px !important; }
    .m-body { font-size: 14px !important; }
    .m-block { display: block !important; width: 100% !important; text-align: left !important; padding-left: 0 !important; }
    .m-block-gap { padding-top: 12px !important; }
    .m-stack { display: block !important; width: 100% !important; text-align: left !important; padding-left: 0 !important; padding-top: 10px !important; }
    .m-tap { display: inline-block !important; min-height: 44px !important; line-height: 44px !important; }
    .m-mast { font-size: 20px !important; }
    .m-hide { display: none !important; }
    img[width="${INNER_PX}"] { width: 100% !important; height: auto !important; }
    .m-thumb { display: none !important; }
  }
`;

function wrapHtml(opts: {
  lang: MailLang;
  subject: string;
  preheader: string;
  /** Rows inside the white card. */
  innerRows: string;
  /** Rows under the card, on the page background. */
  footerRows: string;
  font?: MailFont;
}): string {
  const preheader = escapeHtml(opts.preheader.trim());
  return `<!DOCTYPE html>
<html lang="${opts.lang}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<title>${escapeHtml(opts.subject)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
${opts.font === "serif" ? `<link rel="stylesheet" href="${escapeHtml(SERIF_FONT_HREF)}">\n` : ""}<style type="text/css">${HEAD_STYLE}</style>
</head>
<body id="body" class="m-bg" style="margin:0;padding:0;background:${BG}">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${preheader}${PREHEADER_PAD}</div>` : ""}
<div role="article" aria-roledescription="email" aria-label="${escapeHtml(opts.subject)}" lang="${opts.lang}">
<table role="presentation" class="m-bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG}">
  <tr>
    <td class="m-wrap" align="center" style="padding:16px 12px 32px">
      <table role="presentation" class="m-card" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${WIDTH}px;background:${CARD};color:${FG}">
        ${opts.innerRows}
      </table>
      <table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${WIDTH}px">
        ${opts.footerRows}
      </table>
    </td>
  </tr>
</table>
</div>
</body>
</html>`;
}

/* ------------------------------------------------------------------ */
/* Blocks                                                             */
/* ------------------------------------------------------------------ */

function link(
  href: string,
  label: string,
  style: string,
  cls = "m-link"
): string {
  return `<a class="${cls}" href="${escapeHtml(href)}" target="_blank" style="${style}">${escapeHtml(label)}</a>`;
}

function wordmark(font: MailFont): string {
  const d = DISPLAY[font];
  return `<span style="font-family:${d.family};font-size:${d.mark}px;line-height:1;font-weight:700;color:${INK}">AI;DR</span>`;
}

interface HeaderMeta {
  date: string;
  /** Replaces the formatted `date` (the weekly edition shows its range). */
  dateLabel?: string;
  count: number;
  minutes: number;
  switchHref: string;
}

/** Wordmark; the digest adds date, count and a language switch. */
export function headerBlock(
  lang: MailLang,
  homeHref: string,
  meta?: HeaderMeta,
  font: MailFont = "sans"
): string {
  const brand = `<a href="${escapeHtml(homeHref)}" target="_blank" style="text-decoration:none">${wordmark(font)}</a>`;
  if (!meta) {
    return `<tr>
      <td class="m-pad m-rule" style="padding:20px ${PAD} 12px">${brand}</td>
    </tr>`;
  }
  return `<tr>
      <td class="m-pad m-rule" style="padding:20px ${PAD} 12px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td class="m-block" valign="bottom" style="vertical-align:bottom">${brand}</td>
            <td class="m-block m-block-gap" align="right" valign="bottom" style="vertical-align:bottom;text-align:right;font-family:${SANS};padding-left:16px">
              <div class="m-fg" style="font-size:12px;line-height:1.4;font-weight:600;color:${FG}">${escapeHtml(meta.dateLabel ?? formatMailDate(meta.date, lang))}</div>
              ${lang === "vi" ? link(meta.switchHref, "Read in English", `font-family:${SANS};font-size:12px;line-height:1.6;font-weight:600;color:${ACCENT};text-decoration:none`, "m-link m-tap") : ""}
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function youtubeHref(
  id: string,
  lang: MailLang,
  content: string,
  campaign: string
): string {
  return withMailUtm(
    `https://youtu.be/${encodeURIComponent(id)}`,
    "digest",
    lang,
    { content, campaign, external: true }
  );
}

/** Dark card with the 16:9 YouTube thumbnail (mqdefault always exists;
 *  hqdefault is 4:3 with black bars), the recency kicker, the title and
 *  the day the video covers. */
export function videoBlock(
  video: DigestVideo,
  recency: VideoRecency,
  href: string,
  lang: MailLang,
  showImage: boolean
): string {
  const copy = VIDEO_COPY[lang][recency];
  const title = video.title?.trim() || copy.title;
  const safe = escapeHtml(href);
  const thumb = escapeHtml(
    youtubeThumbnailUrl(encodeURIComponent(video.youtubeId), "mq")
  );
  const media = showImage
    ? `<a href="${safe}" target="_blank" style="display:block;margin-bottom:8px;text-decoration:none;border:0"><img src="${thumb}" width="160" height="90" alt="${escapeHtml(title)}" style="display:block;width:160px;height:90px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;${ALT_STYLE}"></a>`
    : "";
  return `<tr>
      <td class="m-pad" style="padding:4px ${PAD} 8px;font-family:${SANS};font-size:13px;line-height:1.5">
        ${media}<a href="${safe}" target="_blank" style="color:${FG};text-decoration:underline"><font color="${FG}">&#9654; ${escapeHtml(copy.kicker)}: ${escapeHtml(title)}</font></a><span style="color:${MUTED}"> · YouTube · ${escapeHtml(formatMailDate(video.date, lang))}</span>
      </td>
    </tr>`;
}

interface WeekVideoLink {
  day: string;
  title: string;
  href: string;
}

const WEEK_VIDEOS_LABEL: Record<MailLang, string> = {
  en: "This week's video briefs",
  vi: "Video tóm tắt trong tuần",
};

/** Weekly: one text link per day video, no thumbnails. */
export function weekVideosBlock(
  videos: WeekVideoLink[],
  lang: MailLang
): string {
  const label = WEEK_VIDEOS_LABEL[lang];
  const rows = videos
    .map(
      (v) => `<tr>
            <td width="24" valign="top" class="m-link" style="width:24px;padding:5px 0;vertical-align:top;font-family:${SANS};font-size:12px;line-height:22px;color:${ACCENT}">&#9654;</td>
            <td valign="top" style="padding:5px 0;vertical-align:top;font-family:${SANS};font-size:13px;line-height:1.45"><span class="m-muted" style="font-size:12px;font-weight:700;color:${MUTED}">${escapeHtml(v.day)}</span><span style="color:${FAINT};padding:0 6px">·</span><a class="m-fg" href="${escapeHtml(v.href)}" target="_blank" style="color:${FG};text-decoration:none"><font class="m-fg" color="${FG}">${escapeHtml(v.title)}</font></a></td>
          </tr>`
    )
    .join("\n          ");
  return `<tr>
      <td class="m-pad" style="padding:18px ${PAD} 6px">
        <div class="m-muted m-rule" style="border-top:1px solid ${HAIRLINE};padding-top:12px;padding-bottom:6px;font-family:${SANS};font-size:11px;line-height:1.4;font-weight:600;color:${MUTED}">${escapeHtml(label)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${rows}
        </table>
      </td>
    </tr>`;
}

/** Vietnamese labels for the category taxonomy (worker/llm.ts CATEGORIES)
 *  in the mail. The site keeps categories in English (src/lib/lang.ts
 *  categoryLabel); the Vietnamese mail reads them as words. Unknown names
 *  pass through unchanged. */
const CATEGORY_VI: Record<string, string> = {
  Models: "Mô hình",
  Regulation: "Chính sách",
  Products: "Sản phẩm",
  Agents: "Agent",
  Agent: "Agent",
  Research: "Nghiên cứu",
  Industry: "Ngành",
  Infra: "Hạ tầng",
  Releases: "Phát hành",
  Chips: "Chip",
  Funding: "Gọi vốn",
  Safety: "An toàn",
  Tools: "Công cụ",
  Frameworks: "Framework",
  Data: "Dữ liệu",
  "Open Source": "Mã nguồn mở",
};

export function mailCategoryLabel(category: string, lang: MailLang): string {
  return lang === "vi" ? (CATEGORY_VI[category] ?? category) : category;
}

function metaLine(story: DigestStory, accent: boolean, lang: MailLang): string {
  const parts: string[] = [];
  if (story.category) {
    parts.push(
      `<span style="font-size:11px;color:${MUTED}" class="${accent ? "m-link" : "m-muted"}">${escapeHtml(mailCategoryLabel(story.category, lang))}</span>`
    );
  }
  if (story.source) {
    parts.push(
      `<span class="m-muted" style="font-size:11px;color:${MUTED}">${escapeHtml(story.source)}</span>`
    );
  }
  if (parts.length === 0) return "";
  return `<div style="font-family:${SANS};line-height:1.4">${parts.join(`<span style="color:${FAINT};padding:0 6px">·</span>`)}</div>`;
}

/** A real image for full-width use: http(s), not a generated OG card. */
function largeImageSrc(imageUrl: string | undefined): string | null {
  const safe = imageUrl ? safeHref(imageUrl) : null;
  return safe && !isGeneratedOgCard(safe) ? safe : null;
}

/** When an image fails, its alt text reads as a quiet grey caption, not a
 *  big blue serif link. */
const ALT_STYLE = `font-family:${SANS};font-size:11px;line-height:1.35;color:#6b6a64`;

function largeImage(src: string, alt: string, className: string): string {
  return `<img class="${className}" src="${escapeHtml(src)}" width="${INNER_PX}" alt="${escapeHtml(alt)}" style="display:block;width:100%;max-width:${INNER_PX}px;height:auto;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;${ALT_STYLE}">`;
}

/** Story 1: large image, category · source, big headline, its summary. */
export function leadStory(
  story: DigestStory,
  href: string,
  lang: MailLang,
  showImage: boolean,
  font: MailFont = "sans"
): string {
  const d = DISPLAY[font];
  const headline = storyHeadline(story);
  const image = showImage ? largeImageSrc(story.imageUrl) : null;
  const readLabel = lang === "vi" ? "Đọc tóm tắt →" : "Read the summary →";
  const safe = escapeHtml(href);
  return `<tr>
      <td class="m-pad" style="padding:12px ${PAD} 12px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="top" style="vertical-align:top">
              ${metaLine(story, true, lang)}
              <a class="m-fg" href="${safe}" target="_blank" style="display:block;padding-top:2px;font-family:${d.family};font-size:${d.lead}px;line-height:${d.leadLh};font-weight:700;color:${FG};text-decoration:none"><font class="m-fg" color="${FG}"><span class="m-head">${escapeHtml(headline)}</span></font></a>
              <div class="m-fg m-body" style="padding-top:6px;font-family:${SANS};font-size:14px;line-height:1.55;color:${BODY}">${escapeHtml(story.text.trim())}</div>
              ${link(href, readLabel, `display:inline-block;margin-top:8px;font-family:${SANS};font-size:13px;color:${MUTED};text-decoration:underline`, "m-link m-tap")}
            </td>
            ${image ? thumbCell(image, headline, href) : ""}
          </tr>
        </table>
      </td>
    </tr>`;
}

function thumbCell(
  imageUrl: string | undefined,
  alt: string,
  href: string
): string {
  const safe = imageUrl ? safeHref(imageUrl) : null;
  if (!safe) return "";
  return `<td class="m-thumb" width="${THUMB_PX}" valign="top" style="width:${THUMB_PX}px;vertical-align:top;padding-left:16px">
            <a href="${escapeHtml(href)}" target="_blank" style="display:block;text-decoration:none;border:0;overflow:hidden;background-color:${HAIRLINE};${ALT_STYLE}"><img src="${escapeHtml(safe)}" width="${THUMB_PX}" alt="${escapeHtml(alt)}" style="display:block;width:${THUMB_PX}px;height:auto;max-height:${THUMB_PX}px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;${ALT_STYLE}"></a>
          </td>`;
}

/** Compact row: source, linked headline, one sentence,
 *  a 64px thumbnail (`design`) or a full-width image above (`large`). */
export function storyRow(
  story: DigestStory,
  href: string,
  format: MailFormat,
  lang: MailLang,
  font: MailFont = "sans"
): string {
  const d = DISPLAY[font];
  const headline = storyHeadline(story);
  const summary = storySummary(story);
  const safe = escapeHtml(href);
  const large = format === "large" ? largeImageSrc(story.imageUrl) : null;
  const thumb =
    format === "design" ? thumbCell(story.imageUrl, headline, href) : "";
  const text = `${metaLine(story, false, lang)}
              <a class="m-fg" href="${safe}" target="_blank" style="display:block;padding-top:4px;font-family:${d.family};font-size:${d.row}px;line-height:${d.rowLh};font-weight:${d.rowWeight};color:${FG};text-decoration:none"><font class="m-fg" color="${FG}">${escapeHtml(headline)}</font></a>
              ${summary ? `<div class="m-fg m-body" style="padding-top:3px;font-family:${SANS};font-size:13px;line-height:1.5;color:${BODY}">${escapeHtml(summary)}</div>` : ""}`;
  return `<tr>
      <td class="m-pad" style="padding:0 ${PAD}">
        <div style="height:12px;line-height:12px;font-size:0">&nbsp;</div>
        ${large ? `<a href="${safe}" target="_blank" style="text-decoration:none;border:0">${largeImage(large, headline, "mail-large")}</a><div style="height:12px;line-height:12px;font-size:0">&nbsp;</div>` : ""}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td valign="top" style="vertical-align:top">
              ${text}
            </td>
            ${thumb}
          </tr>
        </table>
        <div style="height:12px;line-height:12px;font-size:0">&nbsp;</div>
      </td>
    </tr>`;
}

/** Weekly masthead: a dark band under the header with the issue number and
 *  the week range, so the weekly reads as its own edition. */
export function weeklyMasthead(
  meta: WeeklyMailMeta,
  lang: MailLang,
  font: MailFont = "sans"
): string {
  const kicker = lang === "vi" ? "Bản tin tuần" : "Weekly edition";
  // A rolling 7-day digest (any send day but Monday) has no issue number.
  const issue = meta.issue
    ? lang === "vi"
      ? `Số ${meta.issue}`
      : `Issue ${meta.issue}`
    : lang === "vi"
      ? "7 ngày qua"
      : "Last 7 days";
  const range = formatWeekRange(meta.start_date, meta.end_date, lang);
  return `<tr>
      <td class="m-pad" style="padding:12px ${PAD} 0">
        <div style="font-family:${SANS};font-size:11px;line-height:1.4;color:${MUTED}">${escapeHtml(kicker)} · ${escapeHtml(issue)}</div>
        <div class="m-mast" style="padding-top:2px;font-family:${DISPLAY[font].family};font-size:20px;line-height:1.2;font-weight:700;color:${FG}">${escapeHtml(range)}</div>
      </td>
    </tr>`;
}

/** The weekly edition's intro, set as a pull-quote under the masthead. */
function introBlock(intro: string): string {
  return `<tr>
      <td class="m-pad" style="padding:12px ${PAD} 6px">
        <div class="m-fg m-quote" style="border-left:2px solid ${HAIRLINE};padding:2px 0 2px 12px;font-family:${SANS};font-size:14px;line-height:1.55;color:${BODY}">${escapeHtml(intro)}</div>
      </td>
    </tr>`;
}

/** "In this issue": every headline as a link (anchors are unreliable in
 *  email, so each goes to the story). Weekly only, three or more stories. */
export function issueIndexBlock(
  items: { headline: string; href: string }[],
  lang: MailLang
): string {
  const label = lang === "vi" ? "Trong số này" : "In this issue";
  const rows = items
    .map(
      (it, i) => `<tr>
            <td width="28" valign="top" class="m-muted" style="width:28px;padding:5px 0;vertical-align:top;font-family:${SANS};font-size:13px;line-height:1.45;font-weight:700;color:${MUTED}">${i + 1}</td>
            <td valign="top" style="padding:5px 0;vertical-align:top"><a class="m-fg" href="${escapeHtml(it.href)}" target="_blank" style="font-family:${SANS};font-size:13px;line-height:1.45;color:${FG};text-decoration:none"><font class="m-fg" color="${FG}">${escapeHtml(it.headline)}</font></a></td>
          </tr>`
    )
    .join("\n          ");
  return `<tr>
      <td class="m-pad" style="padding:20px ${PAD} 6px">
        <div class="m-muted" style="padding-bottom:6px;font-family:${SANS};font-size:11px;line-height:1.4;font-weight:600;color:${MUTED}">${escapeHtml(label)}</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          ${rows}
        </table>
      </td>
    </tr>`;
}

/** Bulletproof button: VML roundrect for Outlook desktop, a padded <td> for
 *  everyone else. Padding lives on the <td>, not the <a> — Gmail otherwise
 *  shrinks the pill to the text box and paints a blue underline through the
 *  label. <font color> is the last colour Gmail still honours on links. */
export function ctaButton(
  label: string,
  url: string,
  fullWidth = false
): string {
  const safe = safeHref(url);
  if (!safe) return "";
  const href = escapeHtml(safe);
  const text = escapeHtml(label);
  const vmlWidth = fullWidth ? INNER_PX : 280;
  return `<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:38px;v-text-anchor:middle;width:${vmlWidth}px" arcsize="0%" stroke="f" fillcolor="${ACCENT}">
<w:anchorlock/>
<center style="color:${ACCENT_FG};font-family:Arial,sans-serif;font-size:13px;font-weight:bold">${text}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0"${fullWidth ? ' width="100%"' : ""} style="margin:8px 0">
  <tr>
    <td align="center" bgcolor="${ACCENT}" valign="middle" style="background-color:${ACCENT};padding:14px 28px;mso-padding-alt:14px 28px">
      <a class="mail-cta" href="${href}" target="_blank" style="font-family:${SANS};font-size:13px;font-weight:600;line-height:18px;color:${ACCENT_FG};text-decoration:none;display:inline-block;-webkit-text-size-adjust:none">
        <span style="color:${ACCENT_FG} !important;text-decoration:none !important;border-bottom:0 !important"><font color="${ACCENT_FG}">${text}</font></span>
      </a>
    </td>
  </tr>
</table>
<!--<![endif]-->`;
}

function ctaRow(label: string, url: string): string {
  const safe = safeHref(url);
  if (!safe) return "";
  return `<tr>
      <td class="m-pad" style="padding:4px ${PAD} 20px;font-family:${SANS};font-size:13px"><a class="m-fg" href="${escapeHtml(safe)}" target="_blank" style="color:${FG};text-decoration:underline"><font class="m-fg" color="${FG}">${escapeHtml(label)} →</font></a></td>
    </tr>`;
}

/** "Was today's edition useful?" with Yes / Not really pills. */
export function feedbackBlock(
  date: string,
  lang: MailLang,
  token: string
): string {
  const vi = lang === "vi";
  const pill = (vote: 0 | 1, label: string) =>
    `<td style="padding-right:8px"><a class="m-fg m-rule" href="${escapeHtml(feedbackUrl(date, lang, vote, token))}" target="_blank" style="display:inline-block;padding:4px 12px;border:1px solid ${PILL};border-radius:999px;font-family:${SANS};font-size:12px;line-height:18px;font-weight:400;color:${FG};text-decoration:none"><font class="m-fg" color="${FG}">${escapeHtml(label)}</font></a></td>`;
  return `<tr>
      <td class="m-pad m-soft m-rule" bgcolor="${SOFT}" style="padding:12px ${PAD};background:${SOFT};border-top:1px solid ${HAIRLINE}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td class="m-stack m-fg" valign="middle" style="vertical-align:middle;font-family:${SANS};font-size:12px;line-height:1.4;color:${FG}">${escapeHtml(vi ? "Bản tin hôm nay có hữu ích không?" : "Was today's edition useful?")}</td>
            <td class="m-stack" align="right" valign="middle" style="vertical-align:middle;text-align:right">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table"><tr>${pill(1, vi ? "Có" : "Yes")}${pill(0, vi ? "Chưa lắm" : "Not really")}</tr></table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

/** Telegram (per language), YouTube and the Chrome extension. */
export function channelsBlock(
  lang: MailLang,
  campaign: string = "digest"
): string {
  const vi = lang === "vi";
  const items = [
    {
      key: "telegram",
      url: TELEGRAM_URL[lang],
      label: vi ? "Telegram AI Hôm Nay" : "Telegram",
      sub: vi ? "Mỗi tin ngay khi có" : "Every story as it lands",
    },
    {
      key: "youtube",
      url: YOUTUBE_URL,
      label: "YouTube",
      sub: vi ? "Video tóm tắt mỗi ngày" : "The daily video brief",
    },
    {
      key: "chrome",
      url: CHROME_EXTENSION_URL,
      label: vi ? "Tiện ích Chrome" : "Chrome extension",
      sub: vi ? "AI;DR trong mỗi tab mới" : "AI;DR in every new tab",
    },
  ];
  const links = items
    .map((it) => {
      const href = escapeHtml(
        withMailUtm(it.url, "digest", lang, {
          content: `channel-${it.key}`,
          campaign,
          external: true,
        })
      );
      return `<a class="m-fg m-tap" href="${href}" target="_blank" style="color:${MUTED};text-decoration:underline"><font class="m-muted" color="${MUTED}">${escapeHtml(it.label)}</font></a>`;
    })
    .join(`<span style="color:${FAINT};padding:0 6px">·</span>`);
  return `<tr>
      <td class="m-pad" style="padding:4px ${PAD} 12px;font-family:${SANS};font-size:12px;line-height:1.6">${links}</td>
    </tr>`;
}

interface FooterOpts {
  lang: MailLang;
  unsubscribeUrl: string;
  settingsUrl: string;
  kind: MailUtmKind;
  /** `utm_campaign` for the footer links. Defaults to `kind`. */
  campaign?: string;
  /** Digest only: the day page. */
  viewInBrowserUrl?: string;
  postalAddress?: string;
  /** The weekly digest: "one email a week". */
  weekly?: boolean;
}

/** One line of links. */
export function footerBlock(o: FooterOpts): string {
  const vi = o.lang === "vi";
  const style = `color:${MUTED};text-decoration:underline`;
  const sep = `<span style="color:${FAINT};padding:0 6px">·</span>`;
  const parts = [
    o.viewInBrowserUrl
      ? link(
          o.viewInBrowserUrl,
          vi ? "Xem trên web" : "View in browser",
          style,
          "m-link m-tap"
        )
      : "",
    link(
      withSiteLang(o.settingsUrl, o.lang),
      vi ? "Cài đặt" : "Settings",
      style,
      "m-link m-tap"
    ),
    link(
      withSiteLang(o.unsubscribeUrl, o.lang),
      vi ? "Hủy đăng ký" : "Unsubscribe",
      style,
      "m-link m-tap"
    ),
  ].filter(Boolean);
  return `<tr>
      <td class="m-pad m-muted" style="padding:8px ${PAD} 0;font-family:${SANS};font-size:11px;line-height:1.6;color:${MUTED}">${parts.join(sep)}</td>
    </tr>`;
}

function footerText(o: FooterOpts): string {
  const vi = o.lang === "vi";
  const parts = [
    o.viewInBrowserUrl
      ? `${vi ? "Xem trên web" : "View in browser"}: ${o.viewInBrowserUrl}`
      : "",
    `${vi ? "Cài đặt" : "Settings"}: ${withSiteLang(o.settingsUrl, o.lang)}`,
    `${vi ? "Hủy đăng ký" : "Unsubscribe"}: ${withSiteLang(o.unsubscribeUrl, o.lang)}`,
  ];
  return parts.filter(Boolean).join("\n");
}

/* ------------------------------------------------------------------ */
/* Note mail (confirm, welcome, settings change, campaigns)           */
/* ------------------------------------------------------------------ */

export function renderNoteEmail(input: NoteEmailInput): {
  html: string;
  text: string;
} {
  const lang: MailLang = normalizeMailLang(input.lang);
  const mailKind: MailUtmKind = input.mailKind ?? "welcome";
  const tagBodyHref = (href: string) =>
    withMailUtm(href, mailKind, lang, { content: "body" });
  const body = markdownToEmailHtml(input.bodyMd, tagBodyHref);
  const ctaUrl =
    input.cta?.label && input.cta.url
      ? withMailUtm(input.cta.url, mailKind, lang, { content: "cta" })
      : null;
  const cta = ctaUrl ? ctaButton(input.cta!.label, ctaUrl) : "";
  const footer: FooterOpts = {
    lang,
    unsubscribeUrl: input.unsubscribeUrl,
    settingsUrl: input.settingsUrl,
    kind: mailKind,
    postalAddress: input.postalAddress,
  };
  const innerRows = `${headerBlock(lang, withMailUtm(SITE_URL, mailKind, lang, { content: "header" }))}
    <tr>
      <td class="m-pad m-fg m-body" style="padding:12px ${PAD} 20px;font-family:${SANS};font-size:14px;line-height:1.6;color:${FG}">
        ${body}
        ${cta}
      </td>
    </tr>`;

  const html = wrapHtml({
    lang,
    subject: input.subject,
    preheader: input.preheader ?? "",
    innerRows,
    footerRows: footerBlock(footer),
  });

  const safeCtaUrl = ctaUrl ? safeHref(ctaUrl) : null;
  const textParts = [
    markdownToPlainText(input.bodyMd, tagBodyHref),
    safeCtaUrl ? `${input.cta!.label}: ${safeCtaUrl}` : "",
    footerText(footer),
  ].filter(Boolean);

  return { html, text: textParts.join("\n\n") };
}

/* ------------------------------------------------------------------ */
/* Digest                                                             */
/* ------------------------------------------------------------------ */

const TEXT_RULE = "-".repeat(32);

/** Greedy word wrap at 76 columns; every line starts with `indent`. */
function wrapText(text: string, indent: string, width = 76): string {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    if (line && indent.length + line.length + 1 + word.length > width) {
      lines.push(`${indent}${line}`);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(`${indent}${line}`);
  return lines.join("\n");
}

function storyHref(
  story: DigestStory,
  lang: MailLang,
  content: string,
  campaign: string
): string {
  const opts: MailUtmOptions = { content, campaign };
  return (
    safeHref(withMailUtm(story.url ?? SITE_URL, "digest", lang, opts)) ??
    withMailUtm(SITE_URL, "digest", lang, opts)
  );
}

/** One campaign per edition, so GA4 can tell Monday's mail from Tuesday's. */
function digestMailCampaign(
  date: string,
  weekly: WeeklyMailMeta | null
): string {
  if (weekly) return `weekly-${weekly.week ?? weekly.end_date}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? digestCampaign(date) : "digest";
}

export function renderDigestEmail(input: DigestEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const lang = input.lang;
  const format = normalizeMailFormat(input.format);
  const font = normalizeMailFont(input.font);
  const stories = input.stories;
  const count = stories.length;
  const minutes = readMinutes(stories);
  const weekly = input.weekly ?? null;
  const campaign = digestMailCampaign(input.date, weekly);
  const video = !weekly && input.video?.youtubeId ? input.video : null;
  const recency = video ? videoRecency(video.date, input.date) : null;
  const dayVideo =
    video && recency
      ? {
          video,
          recency,
          url: youtubeHref(video.youtubeId, lang, "video", campaign),
        }
      : null;
  const weekVideos: WeekVideoLink[] = weekly
    ? (input.weekVideos ?? []).map((v) => ({
        day: weekdayOf(v.date, lang) ?? v.date,
        title:
          v.title?.trim() ||
          (lang === "vi"
            ? "Tin trong ngày, chưa tới hai phút"
            : "The day's stories in under two minutes"),
        href: youtubeHref(v.youtubeId, lang, `video-${v.date}`, campaign),
      }))
    : [];
  const intro = weekly?.intro?.trim() || null;
  const subject =
    input.subject ??
    (weekly
      ? weeklySubjectLine(weekly, lang, stories[0] && storyHeadline(stories[0]))
      : digestSubjectLine(
          input.date,
          lang,
          stories.slice(0, 2).map(storyHeadline),
          count
        ));
  const preheader =
    input.preheader ??
    (weekly
      ? (intro ?? weeklyHeading(weekly, lang)).slice(0, 140)
      : digestPreheader(
          input.date,
          lang,
          count,
          minutes,
          dayVideo?.recency ?? null
        ));
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(input.date);
  const pagePath = weekly
    ? weekly.week
      ? weekPath(weekly.week)
      : "/"
    : validDate
      ? dayArchivePath(input.date)
      : "/";
  const dayUrl = absoluteSiteUrl(pagePath, lang);
  const otherLang: MailLang = lang === "vi" ? "en" : "vi";
  const switchUrl = absoluteSiteUrl(pagePath, otherLang);
  const total =
    input.totalStories && input.totalStories >= count
      ? input.totalStories
      : null;
  const ctaLabel = weekly
    ? weekly.week
      ? lang === "vi"
        ? "Đọc cả số tuần trên aidr.today"
        : "Read the full week on aidr.today"
      : lang === "vi"
        ? "Xem tin mới nhất trên aidr.today"
        : "See the latest stories on aidr.today"
    : lang === "vi"
      ? total
        ? `Xem đủ ${total} tin trên aidr.today`
        : "Xem tất cả tin trên aidr.today"
      : total
        ? `See all ${total} stories on aidr.today`
        : "See all stories on aidr.today";
  const ctaUrl = withMailUtm(dayUrl, "digest", lang, {
    content: "cta",
    campaign,
  });
  const footer: FooterOpts = {
    lang,
    unsubscribeUrl: input.unsubscribeUrl,
    settingsUrl: input.settingsUrl,
    kind: "digest",
    campaign,
    viewInBrowserUrl: withMailUtm(dayUrl, "digest", lang, {
      content: "view-in-browser",
      campaign,
    }),
    postalAddress: input.postalAddress,
    weekly: Boolean(weekly),
  };

  const heading = weekly
    ? weeklyHeading(weekly, lang)
    : `AI;DR — ${formatMailDate(input.date, lang)}`;
  /** Plain text at a wrap width; the text-only layout shows it unwrapped
   *  so a phone reflows it instead of breaking each line twice. */
  const buildText = (width: number): string => {
    const numWidth = String(count).length;
    const indent = " ".repeat(numWidth + 2);
    const textStories = stories.map((st, i) => {
      const href = storyHref(
        st,
        lang,
        i === 0 ? "lead" : `s${i + 1}`,
        campaign
      );
      const summary = i === 0 ? st.text.trim() : storySummary(st);
      const meta = [
        st.category ? mailCategoryLabel(st.category, lang) : "",
        st.source ?? "",
      ]
        .filter(Boolean)
        .join(" · ");
      return [
        `${`${i + 1}.`.padStart(numWidth + 1)} ${storyHeadline(st)}`,
        meta ? `${indent}${meta}` : "",
        summary ? wrapText(summary, indent, width) : "",
        `${indent}${href}`,
      ]
        .filter(Boolean)
        .join("\n");
    });
    return [
      `${heading}\n${countLine(count, minutes, lang)}\n${TEXT_RULE}`,
      intro ? wrapText(intro, "", width) : "",
      textStories.join("\n\n"),
      TEXT_RULE,
      dayVideo
        ? `${VIDEO_COPY[lang][dayVideo.recency].kicker} (${formatMailDate(dayVideo.video.date, lang)}): ${dayVideo.url}`
        : "",
      weekVideos.length > 0
        ? [
            WEEK_VIDEOS_LABEL[lang],
            ...weekVideos.map((v) => `${v.day} · ${v.title}: ${v.href}`),
          ].join("\n")
        : "",
      `${ctaLabel}: ${ctaUrl}`,
      `${TEXT_RULE}\n${footerText(footer)}`,
    ]
      .filter(Boolean)
      .join("\n\n");
  };
  const text = buildText(76);

  const homeHref = withMailUtm(SITE_URL, "digest", lang, {
    content: "header",
    campaign,
  });
  const header = headerBlock(
    lang,
    homeHref,
    {
      date: input.date,
      dateLabel: weekly ? weeklyTag(weekly, lang) : undefined,
      count,
      minutes,
      switchHref: withMailUtm(switchUrl, "digest", otherLang, {
        content: "lang-switch",
        campaign,
      }),
    },
    font
  );

  if (format === "text") {
    return {
      subject,
      text,
      html: wrapHtml({
        lang,
        subject,
        preheader,
        innerRows: `${header}
    <tr><td class="m-pad m-fg" style="padding:16px ${PAD};font-family:${SANS};font-size:13px;line-height:1.5;color:${FG};white-space:pre-wrap;word-wrap:break-word;overflow-wrap:anywhere;word-break:break-word">${escapeHtml(buildText(Number.POSITIVE_INFINITY))}</td></tr>`,
        footerRows: "",
        font,
      }),
    };
  }

  const showImages = format === "design" || format === "large";
  const [lead, ...rest] = stories;
  const rows = [
    header,
    weekly ? weeklyMasthead(weekly, lang, font) : "",
    intro ? introBlock(intro) : "",
    weekly && count >= 3
      ? issueIndexBlock(
          stories.map((st, i) => ({
            headline: storyHeadline(st),
            href: storyHref(st, lang, i === 0 ? "lead" : `s${i + 1}`, campaign),
          })),
          lang
        )
      : "",
    lead
      ? leadStory(
          lead,
          storyHref(lead, lang, "lead", campaign),
          lang,
          showImages,
          font
        )
      : "",
    dayVideo
      ? videoBlock(
          dayVideo.video,
          dayVideo.recency,
          dayVideo.url,
          lang,
          showImages
        )
      : "",
    ...rest.map((s, i) =>
      storyRow(s, storyHref(s, lang, `s${i + 2}`, campaign), format, lang, font)
    ),
    weekVideos.length > 0 ? weekVideosBlock(weekVideos, lang) : "",
    ctaRow(ctaLabel, ctaUrl),
    !weekly && input.feedbackToken && validDate
      ? feedbackBlock(input.date, lang, input.feedbackToken)
      : "",
    channelsBlock(lang, campaign),
  ];

  const html = wrapHtml({
    lang,
    subject,
    preheader,
    innerRows: rows.filter(Boolean).join("\n    "),
    footerRows: footerBlock(footer),
    font,
  });

  return { subject, html, text };
}

export function unsubscribeUrl(token: string, lang: MailLang = "vi"): string {
  return withSiteLang(
    `${SITE_URL}/subscribe?unsubscribe=${encodeURIComponent(token)}`,
    lang
  );
}

export function settingsUrl(token: string, lang: MailLang = "vi"): string {
  return withSiteLang(
    `${SITE_URL}/subscribe?settings=${encodeURIComponent(token)}`,
    lang
  );
}

export function oneClickUnsubscribeUrl(token: string): string {
  return `${SITE_URL}/api/subscribe?token=${encodeURIComponent(token)}`;
}

export function listUnsubscribeHeaders(
  token: string,
  lang: MailLang = "vi"
): Record<string, string> {
  const click = oneClickUnsubscribeUrl(token);
  const page = unsubscribeUrl(token, lang);
  return {
    "List-Unsubscribe": `<${click}>, <${page}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
