import { dayArchivePath } from "../../src/lib/day-archive.js";
import { absoluteSiteUrl, withSiteLang } from "../../src/lib/locale-url.js";
import {
  type MailFormat,
  normalizeMailFormat,
} from "../../src/lib/mail-format.js";
import { SITE_URL } from "../../src/lib/site.js";
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

const DATA_URL = `${SITE_URL}/data`;
const SUBSCRIBE_URL = `${SITE_URL}/subscribe`;
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
const PAD = "32px";
const INNER_PX = WIDTH - 2 * 32;
const THUMB_PX = 84;

/** Editorial tokens (the redesign canvas). Six-digit hex only: Outlook and
 *  older clients ignore 8-digit alpha colours. */
const BG = "#efede6";
const CARD = "#ffffff";
const FG = "#141413";
const BODY = "#34332e";
const MUTED = "#5f5e58";
const FAINT = "#b5b2a8";
const ACCENT = "#9a4a07";
const ACCENT_FG = "#ffffff";
const MARKER = "#f5c518";
const HAIRLINE = "#ece9e1";
const SOFT = "#f7f5ef";
const PILL = "#d6d2c6";
const BORDER = "#e3e0d7";
const INK = "#141413";
const INK_MUTED = "#c9c7bf";
/** Site families first, then system fallbacks.
 *  No double quotes — these are interpolated into style="font-family:…" and
 *  a " inside the value would terminate the HTML attribute (Gmail then
 *  paints blue underlined leftovers). Multi-word names take single quotes:
 *  an unquoted `Source Sans 3` is invalid CSS (3 is not an identifier) and
 *  makes the client drop the whole declaration. */
const SERIF = "'EB Garamond', Garamond, Georgia, 'Times New Roman', serif";
const SANS =
  "'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
/** Clients that ignore <link> use the stack. */
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,500;0,600;1,500&family=Source+Sans+3:wght@400;600;700&display=swap";

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
  /** The day's video in this language; null/absent omits the block. */
  video?: DigestVideo | null;
  /** Stories on the day page, for "See all N stories". Absent: no number. */
  totalStories?: number;
  postalAddress?: string;
  /** Subscriber token for the Yes / Not really links. Absent: no feedback row. */
  feedbackToken?: string;
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

/** Sentence split that keeps "$7.5B", "U.S." and "13x." intact enough. */
function sentences(text: string): string[] {
  return text
    .trim()
    .split(/(?<=[.!?])\s+(?=[\p{Lu}\d"“‘'])/u)
    .map((s) => s.trim())
    .filter(Boolean);
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
  return h || sentences(story.text)[0] || story.text.trim();
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

/** Share of the headline's words that the sentence repeats (0..1). */
export function headlineOverlap(headline: string, sentence: string): number {
  const head = new Set(tokens(headline));
  if (head.size === 0) return 0;
  const said = new Set(tokens(sentence));
  let hit = 0;
  for (const t of head) if (said.has(t)) hit++;
  return hit / head.size;
}

/** Above this the sentence only restates the headline. */
export const SUMMARY_OVERLAP_MAX = 0.7;

/** One sentence under a headline: the first sentence of the bullet that does
 *  not restate the headline, or nothing. */
export function storySummary(story: DigestStory): string {
  const headline = storyHeadline(story);
  const parts = sentences(story.text);
  return (
    parts.find(
      (part) =>
        part !== headline &&
        headlineOverlap(headline, part) <= SUMMARY_OVERLAP_MAX
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
  hasVideo: boolean
): string {
  const wd = weekdayOf(date, lang);
  if (lang === "vi") {
    const day = wd
      ? ` ${wd.charAt(0).toLowerCase()}${wd.slice(1)}`
      : " hôm nay";
    return `${count} tin AI${day} trong ${minutes} phút${hasVideo ? ", kèm video tóm tắt" : ""}. Tiêu đề, nguồn và một câu tóm tắt cho mỗi tin.`;
  }
  const day = wd ? `${wd}'s` : "Today's";
  return `${day} ${count} AI ${count === 1 ? "story" : "stories"} in ${minutes} ${minutes === 1 ? "minute" : "minutes"}${hasVideo ? ", plus the video brief" : ""}. Headline, source and one line each.`;
}

/** Hidden filler after the preheader so body text does not leak into the
 *  inbox preview. Raw markup — never pass it through escapeHtml. */
const PREHEADER_PAD = "&zwnj;&nbsp;".repeat(90);

/* ------------------------------------------------------------------ */
/* Shell                                                              */
/* ------------------------------------------------------------------ */

const HEAD_STYLE = `
  :root { color-scheme: light dark; supported-color-schemes: light dark; }
  a { text-decoration: none; }
  .mail-cta, .mail-cta span, .mail-cta font { color: ${ACCENT_FG} !important; text-decoration: none !important; border-bottom: 0 !important; }
  u + #body .mail-cta { color: ${ACCENT_FG} !important; text-decoration: none !important; }
  @media only screen and (max-width: 480px) {
    .m-wrap { padding: 12px 8px !important; }
    .m-pad { padding-left: 20px !important; padding-right: 20px !important; }
    .m-body { font-size: 16px !important; }
    .m-block { display: block !important; width: 100% !important; text-align: left !important; padding-left: 0 !important; }
    .m-block-gap { padding-top: 12px !important; }
    .m-stack { display: block !important; width: 100% !important; text-align: left !important; padding-left: 0 !important; padding-top: 10px !important; }
    .m-tap { display: inline-block !important; min-height: 44px !important; line-height: 44px !important; }
    .m-head { font-size: 22px !important; }
    .m-hide { display: none !important; }
  }
  @media (prefers-color-scheme: dark) {
    .m-bg { background: #141413 !important; }
    .m-card { background: #1f1e1b !important; border-color: #34332e !important; }
    .m-soft { background: #262520 !important; }
    .m-fg { color: #f2f0ea !important; }
    .m-muted { color: #b5b2a8 !important; }
    .m-link { color: #f0a35e !important; }
    .m-rule { border-color: #34332e !important; }
  }
  [data-ogsc] .m-bg { background: #141413 !important; }
  [data-ogsc] .m-card { background: #1f1e1b !important; }
  [data-ogsc] .m-fg { color: #f2f0ea !important; }
  [data-ogsc] .m-muted { color: #b5b2a8 !important; }
  [data-ogsc] .m-link { color: #f0a35e !important; }
`;

function wrapHtml(opts: {
  lang: MailLang;
  subject: string;
  preheader: string;
  /** Rows inside the white card. */
  innerRows: string;
  /** Rows under the card, on the page background. */
  footerRows: string;
}): string {
  const preheader = escapeHtml(opts.preheader.trim());
  return `<!DOCTYPE html>
<html lang="${opts.lang}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${escapeHtml(opts.subject)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<link rel="stylesheet" href="${escapeHtml(FONTS_HREF)}">
<style type="text/css">${HEAD_STYLE}</style>
</head>
<body id="body" class="m-bg" style="margin:0;padding:0;background:${BG}">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all">${preheader}${PREHEADER_PAD}</div>` : ""}
<table role="presentation" class="m-bg" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BG}">
  <tr>
    <td class="m-wrap" align="center" style="padding:24px 16px 40px">
      <table role="presentation" class="m-card" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${WIDTH}px;background:${CARD};color:${FG};border:1px solid ${BORDER};border-radius:14px">
        ${opts.innerRows}
      </table>
      <table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${WIDTH}px">
        ${opts.footerRows}
      </table>
    </td>
  </tr>
</table>
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

function wordmark(size: number): string {
  // A yellow marker behind dark text: Gmail drops linear-gradient, and dark
  // ink on yellow reads the same on a light or a dark background.
  return `<span style="font-family:${SERIF};font-size:${size}px;line-height:1;font-weight:600;letter-spacing:-0.01em;color:${INK};background-color:${MARKER};padding:0 4px">AI;DR</span>`;
}

function tagline(lang: MailLang): string {
  return lang === "vi"
    ? "Tin AI, xếp hạng và tóm tắt"
    : "AI news, ranked and summarized";
}

interface HeaderMeta {
  date: string;
  count: number;
  minutes: number;
  switchHref: string;
}

/** Wordmark and tagline; the digest adds date, count and a language switch. */
export function headerBlock(
  lang: MailLang,
  homeHref: string,
  meta?: HeaderMeta
): string {
  const brand = `<a href="${escapeHtml(homeHref)}" target="_blank" style="text-decoration:none">${wordmark(32)}</a>
          <div class="m-muted" style="padding-top:10px;font-family:${SANS};font-size:13px;line-height:1.35;color:${MUTED}">${escapeHtml(tagline(lang))}</div>`;
  if (!meta) {
    return `<tr>
      <td class="m-pad m-rule" style="padding:28px ${PAD} 20px;border-bottom:1px solid ${HAIRLINE}">${brand}</td>
    </tr>`;
  }
  const other = lang === "vi" ? "Read in English" : "Đọc bằng Tiếng Việt";
  return `<tr>
      <td class="m-pad m-rule" style="padding:28px ${PAD} 20px;border-bottom:1px solid ${HAIRLINE}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td class="m-block" valign="bottom" style="vertical-align:bottom">${brand}</td>
            <td class="m-block m-block-gap" align="right" valign="bottom" style="vertical-align:bottom;text-align:right;font-family:${SANS};padding-left:16px">
              <div class="m-fg" style="font-size:13px;line-height:1.4;font-weight:600;color:${FG}">${escapeHtml(formatMailDate(meta.date, lang))}</div>
              <div class="m-muted" style="font-size:12px;line-height:1.4;color:${MUTED}">${escapeHtml(countLine(meta.count, meta.minutes, lang))}</div>
              ${link(meta.switchHref, other, `font-family:${SANS};font-size:12px;line-height:1.6;font-weight:600;color:${ACCENT};text-decoration:none`, "m-link m-tap")}
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function youtubeThumb(id: string): string {
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
}

/** Dark card with the YouTube thumbnail and a play mark. The thumbnail is
 *  a cell background so the play mark sits on it; where backgrounds are
 *  dropped (Outlook desktop) the cell stays yellow with the mark. */
export function videoBlock(
  video: DigestVideo,
  href: string,
  lang: MailLang,
  showImage: boolean
): string {
  const kicker = lang === "vi" ? "Xem bản tin video" : "Watch the daily brief";
  const title =
    video.title?.trim() ||
    (lang === "vi"
      ? "Tin hôm nay trong chưa tới hai phút"
      : "Today's stories in under two minutes");
  const safe = escapeHtml(href);
  const thumb = escapeHtml(youtubeThumb(video.youtubeId));
  const play = `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"><tr><td width="38" height="38" align="center" valign="middle" bgcolor="${INK}" style="width:38px;height:38px;border-radius:19px;background:${INK};color:${ACCENT_FG};font-family:${SANS};font-size:14px;line-height:38px;text-align:center"><a href="${safe}" target="_blank" style="color:${ACCENT_FG};text-decoration:none">&#9654;</a></td></tr></table>`;
  const media = showImage
    ? `<td class="m-stack" width="150" height="84" align="center" valign="middle" background="${thumb}" bgcolor="${MARKER}" style="width:150px;height:84px;border-radius:8px;background-color:${MARKER};background-image:url(${thumb});background-size:cover;background-position:center">${play}</td>`
    : "";
  return `<tr>
      <td class="m-pad" style="padding:22px ${PAD} 6px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${INK}" style="background:${INK};border-radius:12px">
          <tr>
            <td style="padding:14px">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  ${media}
                  <td class="m-stack" valign="middle" style="vertical-align:middle;${showImage ? "padding-left:16px;" : ""}font-family:${SANS}">
                    <a href="${safe}" target="_blank" style="text-decoration:none;color:${ACCENT_FG}">
                      <div style="font-size:11px;line-height:1.4;letter-spacing:0.1em;text-transform:uppercase;font-weight:700;color:${MARKER}"><font color="${MARKER}">${escapeHtml(kicker)}</font></div>
                      <div style="padding-top:4px;font-family:${SERIF};font-size:19px;line-height:1.25;color:${ACCENT_FG}"><font color="${ACCENT_FG}">${escapeHtml(title)}</font></div>
                      <div style="padding-top:4px;font-size:12px;line-height:1.4;color:${INK_MUTED}"><font color="${INK_MUTED}">YouTube</font></div>
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
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
      `<span style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${accent ? ACCENT : MUTED}" class="${accent ? "m-link" : "m-muted"}">${escapeHtml(mailCategoryLabel(story.category, lang))}</span>`
    );
  }
  if (story.source) {
    parts.push(
      `<span class="m-muted" style="font-size:12px;color:${MUTED}">${escapeHtml(story.source)}</span>`
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

/** Lead images taller than this are cropped from the bottom (a portrait
 *  photo would otherwise fill a whole phone screen). The wrapper does the
 *  crop, so the image keeps its aspect ratio where overflow is ignored. */
const LEAD_MAX_H = 300;

function largeImage(src: string, alt: string, className: string): string {
  return `<img class="${className}" src="${escapeHtml(src)}" width="${INNER_PX}" alt="${escapeHtml(alt)}" style="display:block;width:100%;max-width:${INNER_PX}px;height:auto;border:0;outline:none;text-decoration:none;border-radius:10px;-ms-interpolation-mode:bicubic;${ALT_STYLE}">`;
}

function leadImage(src: string, alt: string): string {
  return `<div style="max-height:${LEAD_MAX_H}px;overflow:hidden;border-radius:10px;background-color:${HAIRLINE}">${largeImage(src, alt, "mail-lead-image")}</div>`;
}

/** Story 1: large image, category · source, big headline, its summary. */
export function leadStory(
  story: DigestStory,
  href: string,
  lang: MailLang,
  showImage: boolean
): string {
  const headline = storyHeadline(story);
  const image = showImage ? largeImageSrc(story.imageUrl) : null;
  const kicker = lang === "vi" ? "Tin chính" : "Lead story";
  const readLabel = lang === "vi" ? "Đọc tóm tắt →" : "Read the summary →";
  const safe = escapeHtml(href);
  return `<tr>
      <td class="m-pad" style="padding:22px ${PAD} 8px">
        <div class="m-muted" style="padding-bottom:12px;font-family:${SANS};font-size:11px;line-height:1.4;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;color:${MUTED}">${escapeHtml(kicker)}</div>
        ${image ? `<a href="${safe}" target="_blank" style="text-decoration:none;border:0">${leadImage(image, headline)}</a><div style="height:16px;line-height:16px;font-size:0">&nbsp;</div>` : ""}
        ${metaLine(story, true, lang)}
        <a class="m-fg" href="${safe}" target="_blank" style="display:block;padding-top:6px;font-family:${SERIF};font-size:27px;line-height:1.2;font-weight:600;color:${FG};text-decoration:none"><font class="m-fg" color="${FG}"><span class="m-head">${escapeHtml(headline)}</span></font></a>
        <div class="m-fg m-body" style="padding-top:8px;font-family:${SANS};font-size:15px;line-height:1.6;color:${BODY}">${escapeHtml(story.text.trim())}</div>
        ${link(href, readLabel, `display:inline-block;margin-top:12px;font-family:${SANS};font-size:14px;font-weight:600;color:${ACCENT};text-decoration:none`, "m-link m-tap")}
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
            <a href="${escapeHtml(href)}" target="_blank" style="display:block;text-decoration:none;border:0;border-radius:8px;overflow:hidden;background-color:${HAIRLINE};${ALT_STYLE}"><img src="${escapeHtml(safe)}" width="${THUMB_PX}" alt="${escapeHtml(alt)}" style="display:block;width:${THUMB_PX}px;height:auto;max-height:${THUMB_PX}px;border:0;outline:none;text-decoration:none;border-radius:8px;-ms-interpolation-mode:bicubic;${ALT_STYLE}"></a>
          </td>`;
}

/** Compact row: number, category · source, linked headline, one sentence,
 *  an 84px thumbnail (`design`) or a full-width image above (`large`). */
export function storyRow(
  story: DigestStory,
  n: number,
  href: string,
  format: MailFormat,
  lang: MailLang
): string {
  const headline = storyHeadline(story);
  const summary = storySummary(story);
  const safe = escapeHtml(href);
  const large = format === "large" ? largeImageSrc(story.imageUrl) : null;
  const thumb =
    format === "design" ? thumbCell(story.imageUrl, headline, href) : "";
  const text = `${metaLine(story, false, lang)}
              <a class="m-fg" href="${safe}" target="_blank" style="display:block;padding-top:4px;font-family:${SERIF};font-size:19px;line-height:1.25;font-weight:600;color:${FG};text-decoration:none"><font class="m-fg" color="${FG}">${escapeHtml(headline)}</font></a>
              ${summary ? `<div class="m-fg m-body" style="padding-top:4px;font-family:${SANS};font-size:14px;line-height:1.55;color:${BODY}">${escapeHtml(summary)}</div>` : ""}`;
  return `<tr>
      <td class="m-pad" style="padding:14px ${PAD}">
        ${large ? `<a href="${safe}" target="_blank" style="text-decoration:none;border:0">${largeImage(large, headline, "mail-large")}</a><div style="height:12px;line-height:12px;font-size:0">&nbsp;</div>` : ""}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td width="26" valign="top" class="m-link" style="width:26px;vertical-align:top;padding-top:2px;font-family:${SERIF};font-size:26px;line-height:1;color:${ACCENT}">${n}</td>
            <td valign="top" style="vertical-align:top">
              ${text}
            </td>
            ${thumb}
          </tr>
        </table>
      </td>
    </tr>`;
}

function sectionLabel(label: string): string {
  return `<tr>
      <td class="m-pad" style="padding:18px ${PAD} 4px">
        <div class="m-muted m-rule" style="border-top:1px solid ${HAIRLINE};padding-top:18px;font-family:${SANS};font-size:11px;line-height:1.4;letter-spacing:0.12em;text-transform:uppercase;font-weight:700;color:${MUTED}">${escapeHtml(label)}</div>
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
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:48px;v-text-anchor:middle;width:${vmlWidth}px" arcsize="17%" stroke="f" fillcolor="${ACCENT}">
<w:anchorlock/>
<center style="color:${ACCENT_FG};font-family:Arial,sans-serif;font-size:15px;font-weight:bold">${text}</center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<table role="presentation" cellpadding="0" cellspacing="0" border="0"${fullWidth ? ' width="100%"' : ""} style="margin:8px 0">
  <tr>
    <td align="center" bgcolor="${ACCENT}" valign="middle" style="background-color:${ACCENT};border-radius:8px;padding:14px 28px;mso-padding-alt:14px 28px">
      <a class="mail-cta" href="${href}" target="_blank" style="font-family:${SANS};font-size:15px;font-weight:600;line-height:20px;color:${ACCENT_FG};text-decoration:none;display:inline-block;-webkit-text-size-adjust:none">
        <span style="color:${ACCENT_FG} !important;text-decoration:none !important;border-bottom:0 !important"><font color="${ACCENT_FG}">${text}</font></span>
      </a>
    </td>
  </tr>
</table>
<!--<![endif]-->`;
}

function ctaRow(label: string, url: string): string {
  return `<tr>
      <td class="m-pad" style="padding:16px ${PAD} 28px">${ctaButton(label, url, true)}</td>
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
    `<td style="padding-right:8px"><a class="m-fg m-rule" href="${escapeHtml(feedbackUrl(date, lang, vote, token))}" target="_blank" style="display:inline-block;padding:10px 18px;border:1px solid ${PILL};border-radius:999px;font-family:${SANS};font-size:14px;line-height:20px;font-weight:600;color:${FG};text-decoration:none"><font class="m-fg" color="${FG}">${escapeHtml(label)}</font></a></td>`;
  return `<tr>
      <td class="m-pad m-soft m-rule" bgcolor="${SOFT}" style="padding:18px ${PAD};background:${SOFT};border-top:1px solid ${HAIRLINE}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td class="m-stack m-fg" valign="middle" style="vertical-align:middle;font-family:${SANS};font-size:14px;line-height:1.4;font-weight:600;color:${FG}">${escapeHtml(vi ? "Bản tin hôm nay có hữu ích không?" : "Was today's edition useful?")}</td>
            <td class="m-stack" align="right" valign="middle" style="vertical-align:middle;text-align:right">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="display:inline-table"><tr>${pill(1, vi ? "Có" : "Yes")}${pill(0, vi ? "Chưa lắm" : "Not really")}</tr></table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

/** Telegram (per language), YouTube and the Chrome extension. */
export function channelsBlock(lang: MailLang): string {
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
  const cells = items
    .map((it, i) => {
      const href = escapeHtml(
        withMailUtm(it.url, "digest", lang, {
          content: `channel-${it.key}`,
          external: true,
        })
      );
      return `<td class="m-stack" width="33%" valign="top" style="width:33%;vertical-align:top;${i > 0 ? "padding-left:12px;" : ""}font-family:${SANS}">
            <a class="m-fg m-tap" href="${href}" target="_blank" style="display:block;text-decoration:none;color:${FG}">
              <div class="m-fg" style="font-size:13px;line-height:1.4;font-weight:600;color:${FG}"><font class="m-fg" color="${FG}">${escapeHtml(it.label)} →</font></div>
              <div class="m-muted m-hide" style="font-size:12px;line-height:1.4;color:${MUTED}">${escapeHtml(it.sub)}</div>
            </a>
          </td>`;
    })
    .join("\n");
  return `<tr>
      <td class="m-pad m-rule" style="padding:20px ${PAD} 22px;border-top:1px solid ${HAIRLINE}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
          ${cells}
          </tr>
        </table>
      </td>
    </tr>`;
}

interface FooterOpts {
  lang: MailLang;
  unsubscribeUrl: string;
  settingsUrl: string;
  kind: MailUtmKind;
  /** Digest only: the day page. */
  viewInBrowserUrl?: string;
  postalAddress?: string;
}

/** Why you get this, the links, "Forwarded this?", the postal address. */
export function footerBlock(o: FooterOpts): string {
  const vi = o.lang === "vi";
  const style = `font-weight:600;color:${ACCENT};text-decoration:none`;
  const sep = `<span style="color:${FAINT};padding:0 6px">·</span>`;
  const links = [
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
    link(
      withMailUtm(DATA_URL, o.kind, o.lang, { content: "footer-data" }),
      vi ? "Cách xếp hạng" : "How we rank",
      style,
      "m-link m-tap"
    ),
  ].filter(Boolean);
  const why = vi
    ? "Bạn nhận email này vì đã đăng ký tại aidr.today. Mỗi ngày một email."
    : "You get this because you subscribed at aidr.today. One email a day.";
  const forwarded = `${escapeHtml(vi ? "Được chuyển tiếp?" : "Forwarded this?")} ${link(
    withMailUtm(SUBSCRIBE_URL, o.kind, o.lang, { content: "footer-subscribe" }),
    vi ? "Đăng ký" : "Subscribe",
    style,
    "m-link m-tap"
  )}`;
  const address = o.postalAddress?.trim();
  return `<tr>
      <td class="m-pad m-muted" align="center" style="padding:22px 48px 0;font-family:${SANS};font-size:13px;line-height:1.7;color:${MUTED};text-align:center">
        <div>${escapeHtml(why)}</div>
        <div style="padding-top:6px">${links.join(sep)}</div>
        <div style="padding-top:6px">${forwarded}</div>
        ${address ? `<div style="padding-top:6px">AI;DR · ${escapeHtml(address)}</div>` : ""}
      </td>
    </tr>`;
}

function footerText(o: FooterOpts): string {
  const vi = o.lang === "vi";
  const lines = [
    o.viewInBrowserUrl
      ? `${vi ? "Xem trên web" : "View in browser"}: ${o.viewInBrowserUrl}`
      : "",
    `${vi ? "Cài đặt" : "Settings"}: ${withSiteLang(o.settingsUrl, o.lang)}`,
    `${vi ? "Hủy đăng ký" : "Unsubscribe"}: ${withSiteLang(o.unsubscribeUrl, o.lang)}`,
    `${vi ? "Cách xếp hạng" : "How we rank"}: ${DATA_URL}`,
    `${vi ? "Được chuyển tiếp? Đăng ký" : "Forwarded this? Subscribe"}: ${SUBSCRIBE_URL}`,
    o.postalAddress?.trim() ? `AI;DR · ${o.postalAddress.trim()}` : "",
  ];
  return lines.filter(Boolean).join("\n");
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
  const body = markdownToEmailHtml(input.bodyMd);
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
      <td class="m-pad m-fg m-body" style="padding:28px ${PAD} 28px;font-family:${SANS};font-size:16px;line-height:1.65;color:${FG}">
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
    markdownToPlainText(input.bodyMd),
    safeCtaUrl ? `${input.cta!.label}: ${safeCtaUrl}` : "",
    footerText(footer),
  ].filter(Boolean);

  return { html, text: textParts.join("\n\n") };
}

/* ------------------------------------------------------------------ */
/* Digest                                                             */
/* ------------------------------------------------------------------ */

/** Generated social cards (text-on-card OG images) are not story images. */
export function isGeneratedOgCard(url: string): boolean {
  try {
    const parts = new URL(url).pathname.toLowerCase().split("/");
    return (
      parts.includes("og") ||
      parts.some((part) => /og[-_]?(image|card)/.test(part))
    );
  } catch {
    return false;
  }
}

function storyHref(
  story: DigestStory,
  lang: MailLang,
  content: string
): string {
  const opts: MailUtmOptions = { content };
  return (
    safeHref(withMailUtm(story.url ?? SITE_URL, "digest", lang, opts)) ??
    withMailUtm(SITE_URL, "digest", lang, opts)
  );
}

export function renderDigestEmail(input: DigestEmailInput): {
  subject: string;
  html: string;
  text: string;
} {
  const lang = input.lang;
  const format = normalizeMailFormat(input.format);
  const stories = input.stories;
  const count = stories.length;
  const minutes = readMinutes(stories);
  const video = input.video?.youtubeId ? input.video : null;
  const subject =
    input.subject ??
    digestSubjectLine(
      input.date,
      lang,
      stories.slice(0, 2).map(storyHeadline),
      count
    );
  const preheader =
    input.preheader ??
    digestPreheader(input.date, lang, count, minutes, Boolean(video));
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(input.date);
  const dayUrl = validDate
    ? absoluteSiteUrl(dayArchivePath(input.date), lang)
    : absoluteSiteUrl("/", lang);
  const otherLang: MailLang = lang === "vi" ? "en" : "vi";
  const switchUrl = validDate
    ? absoluteSiteUrl(dayArchivePath(input.date), otherLang)
    : absoluteSiteUrl("/", otherLang);
  const videoUrl = video
    ? withMailUtm(
        `https://youtu.be/${encodeURIComponent(video.youtubeId)}`,
        "digest",
        lang,
        {
          content: "video",
          external: true,
        }
      )
    : null;
  const total =
    input.totalStories && input.totalStories >= count
      ? input.totalStories
      : null;
  const ctaLabel =
    lang === "vi"
      ? total
        ? `Xem đủ ${total} tin trên aidr.today`
        : "Xem tất cả tin trên aidr.today"
      : total
        ? `See all ${total} stories on aidr.today`
        : "See all stories on aidr.today";
  const ctaUrl = withMailUtm(dayUrl, "digest", lang, { content: "cta" });
  const footer: FooterOpts = {
    lang,
    unsubscribeUrl: input.unsubscribeUrl,
    settingsUrl: input.settingsUrl,
    kind: "digest",
    viewInBrowserUrl: withMailUtm(dayUrl, "digest", lang, {
      content: "view-in-browser",
    }),
    postalAddress: input.postalAddress,
  };

  const heading = `AI;DR — ${formatMailDate(input.date, lang)}`;
  const textStories = stories.map((s, i) => {
    const href = storyHref(s, lang, i === 0 ? "lead" : `s${i + 1}`);
    const summary = i === 0 ? s.text.trim() : storySummary(s);
    return [
      `${i + 1}. ${storyHeadline(s)}`,
      summary ? `   ${summary}` : "",
      `   ${href}`,
    ]
      .filter(Boolean)
      .join("\n");
  });
  const text = [
    `${heading}\n${countLine(count, minutes, lang)}`,
    textStories.join("\n\n"),
    videoUrl
      ? `${lang === "vi" ? "Xem bản tin video" : "Watch the daily brief"}: ${videoUrl}`
      : "",
    `${ctaLabel}: ${ctaUrl}`,
    footerText(footer),
  ]
    .filter(Boolean)
    .join("\n\n");

  const homeHref = withMailUtm(SITE_URL, "digest", lang, { content: "header" });
  const header = headerBlock(lang, homeHref, {
    date: input.date,
    count,
    minutes,
    switchHref: withMailUtm(switchUrl, "digest", otherLang, {
      content: "lang-switch",
    }),
  });

  if (format === "text") {
    return {
      subject,
      text,
      html: wrapHtml({
        lang,
        subject,
        preheader,
        innerRows: `${header}
    <tr><td class="m-pad m-fg" style="padding:28px ${PAD};font-family:${SANS};font-size:15px;line-height:1.55;color:${FG};white-space:pre-wrap">${escapeHtml(text)}</td></tr>`,
        footerRows: "",
      }),
    };
  }

  const showImages = format === "design" || format === "large";
  const [lead, ...rest] = stories;
  const rows = [
    header,
    video && videoUrl ? videoBlock(video, videoUrl, lang, showImages) : "",
    lead
      ? leadStory(lead, storyHref(lead, lang, "lead"), lang, showImages)
      : "",
    rest.length > 0
      ? sectionLabel(lang === "vi" ? "Tin khác hôm nay" : "Also today")
      : "",
    ...rest.map((s, i) =>
      storyRow(s, i + 2, storyHref(s, lang, `s${i + 2}`), format, lang)
    ),
    ctaRow(ctaLabel, ctaUrl),
    input.feedbackToken && validDate
      ? feedbackBlock(input.date, lang, input.feedbackToken)
      : "",
    channelsBlock(lang),
  ];

  const html = wrapHtml({
    lang,
    subject,
    preheader,
    innerRows: rows.filter(Boolean).join("\n    "),
    footerRows: footerBlock(footer),
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
