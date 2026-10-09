import { dayArchiveOgPath, dayArchivePath } from "../../src/lib/day-archive.js";
import { highlightTitle, TITLE_KEYWORDS } from "../../src/lib/highlight.js";
import { absoluteSiteUrl, withSiteLang } from "../../src/lib/locale-url.js";
import {
  type MailFormat,
  normalizeMailFormat,
} from "../../src/lib/mail-format.js";
import { SITE_URL } from "../../src/lib/site.js";
import { topicColor } from "../../src/lib/topic-color.js";
import {
  escapeHtml,
  markdownToEmailHtml,
  markdownToPlainText,
  safeHref,
} from "./markdown.js";
import { type MailUtmKind, withMailUtm } from "./utm.js";

export const NOTES_FROM = {
  email: "notes@aidr.today",
  name: "aidr",
} as const;

export const NEWS_FROM = {
  email: "digest@aidr.today",
  name: "aidr",
} as const;

const DATA_URL = `${SITE_URL}/data`;
/**
 * Square 128px PNG at site root (Worker ASSETS). Displayed 36px with
 * width/height 72 so retina/Gmail proxy stay sharp. Do not wrap this
 * <img> in the same <a> as the wordmark — Gmail collapses that to a
 * blue text link and drops the image.
 */
export const MAIL_LOGO_URL = `${SITE_URL}/logo-icon.png`;
const LOGO_SRC_PX = 72;
const LOGO_CSS_PX = 36;
const PAD = "32px";

/** Editorial tokens from apps/web/src/styles.css — hex so email clients stay honest. */
const BG = "#f7f7f5";
const CARD = "#ffffff";
const FG = "#0a0a0a";
const MUTED = "#474747";
const ACCENT = "#b45309";
const ACCENT_FG = "#fffefb";
const HAIRLINE = "#0a0a0a14";
/** Site families first (--editorial-font-serif / --content-font-sans in
 *  apps/web/src/styles.css), then system fallbacks.
 *  No double quotes — these are interpolated into style="font-family:…" and
 *  a " inside the value would terminate the HTML attribute (Gmail then
 *  paints blue underlined leftovers). Multi-word names take single quotes:
 *  an unquoted `Source Sans 3` is invalid CSS (3 is not an identifier) and
 *  makes the client drop the whole declaration. */
const SERIF = "'EB Garamond', Garamond, Georgia, 'Times New Roman', serif";
const SANS =
  "'Source Sans 3', -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
/** The site self-hosts these under hashed /assets names, so mail loads the
 *  same families from Google Fonts. Clients that ignore <link> use the stack. */
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=EB+Garamond:wght@500&family=Source+Sans+3:wght@400;500;600&display=swap";

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
}

export interface DigestStory {
  text: string;
  url?: string;
  imageUrl?: string;
}

export interface DigestEmailInput {
  subject: string;
  date: string;
  stories: DigestStory[];
  lang: MailLang;
  unsubscribeUrl: string;
  settingsUrl: string;
  preheader?: string;
  /** See src/lib/mail-format.ts. Default `design`. */
  format?: MailFormat;
}

function ctaButton(label: string, url: string): string {
  const safe = safeHref(url);
  if (!safe) return "";
  const href = escapeHtml(safe);
  const text = escapeHtml(label);
  // Padding lives on the <td>, not the <a>. Gmail otherwise shrinks the
  // pill to the text box and paints a blue underline through the label.
  // <font color> is the last color Gmail still honors on links.
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px">
  <tr>
    <td align="center" bgcolor="${ACCENT}" valign="middle" style="background-color:${ACCENT};border-radius:8px;padding:14px 28px;mso-padding-alt:14px 28px">
      <a class="mail-cta" href="${href}" target="_blank" style="font-family:${SANS};font-size:15px;font-weight:600;line-height:20px;color:${ACCENT_FG};text-decoration:none;display:inline-block;-webkit-text-size-adjust:none">
        <span style="color:${ACCENT_FG} !important;text-decoration:none !important;border-bottom:0 !important"><font color="${ACCENT_FG}">${text}</font></span>
      </a>
    </td>
  </tr>
</table>`;
}

function brandHeader(lang: MailLang, kind: MailUtmKind): string {
  const tagline =
    lang === "vi" ? "Tin AI xếp hạng và tóm tắt" : "AI news ranked and summary";
  const home = escapeHtml(withMailUtm(SITE_URL, kind, lang));
  return `<tr>
      <td style="padding:32px ${PAD} 24px;border-bottom:1px solid ${HAIRLINE}">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="vertical-align:middle;padding-right:14px">
              <a href="${home}" style="text-decoration:none;border:0">
                <img src="${MAIL_LOGO_URL}" width="${LOGO_SRC_PX}" height="${LOGO_SRC_PX}" alt="AI;DR" style="display:block;width:${LOGO_CSS_PX}px;height:${LOGO_CSS_PX}px;border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic">
              </a>
            </td>
            <td style="vertical-align:middle">
              <div style="font-family:${SERIF};font-size:26px;line-height:1.15;font-weight:500;color:${FG}">AI;DR</div>
              <div style="margin-top:4px;font-family:${SANS};font-size:13px;line-height:1.35;color:${MUTED}">${escapeHtml(tagline)}</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function mailFooterHtml(
  lang: MailLang,
  unsubscribeUrl: string,
  settingsUrl: string
): string {
  const unsub = escapeHtml(withSiteLang(unsubscribeUrl, lang));
  const settings = escapeHtml(withSiteLang(settingsUrl, lang));
  const unsubLabel = lang === "vi" ? "Hủy đăng ký" : "Unsubscribe";
  const settingsLabel = lang === "vi" ? "Chỉnh cài đặt" : "Adjust settings";
  const dataLabel = lang === "vi" ? "Dữ liệu / pipeline" : "Data / Pipeline";
  const why =
    lang === "vi"
      ? "Bạn nhận email này vì đã đăng ký tại aidr.today."
      : "You are receiving this because you subscribed at aidr.today.";
  const linkStyle = `color:${ACCENT};text-decoration:none;font-weight:500`;
  return `<tr>
      <td style="padding:28px ${PAD} 48px;border-top:1px solid ${HAIRLINE};font-family:${SANS};font-size:12px;line-height:1.7;color:${MUTED}">
        ${why}<br>
        <a href="${unsub}" style="${linkStyle}">${escapeHtml(unsubLabel)}</a>
        <span style="color:${MUTED};padding:0 8px">·</span>
        <a href="${settings}" style="${linkStyle}">${escapeHtml(settingsLabel)}</a>
        <span style="color:${MUTED};padding:0 8px">·</span>
        <a href="${DATA_URL}" style="${linkStyle}">${escapeHtml(dataLabel)}</a>
      </td>
    </tr>`;
}

function mailFooterText(
  lang: MailLang,
  unsubscribeUrl: string,
  settingsUrl: string
): string {
  const unsub = withSiteLang(unsubscribeUrl, lang);
  const settings = withSiteLang(settingsUrl, lang);
  if (lang === "vi") {
    return `Hủy đăng ký: ${unsub}\nChỉnh cài đặt: ${settings}\nDữ liệu / pipeline: ${DATA_URL}`;
  }
  return `Unsubscribe: ${unsub}\nAdjust settings: ${settings}\nData / Pipeline: ${DATA_URL}`;
}

function wrapHtml(opts: {
  lang: MailLang;
  subject: string;
  preheader: string;
  innerRows: string;
  mailKind: MailUtmKind;
}): string {
  const preheader = escapeHtml(opts.preheader.trim());
  return `<!DOCTYPE html>
<html lang="${opts.lang}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(opts.subject)}</title>
<link rel="stylesheet" href="${escapeHtml(FONTS_HREF)}">
<style type="text/css">
  a { text-decoration: none; }
  a.mail-story { color: ${ACCENT} !important; text-decoration: underline !important; font-weight: 500; }
  .mail-cta, .mail-cta span, .mail-cta font { color: ${ACCENT_FG} !important; text-decoration: none !important; border-bottom: 0 !important; }
  u + #body .mail-cta { color: ${ACCENT_FG} !important; text-decoration: none !important; }
</style>
</head>
<body id="body" style="margin:0;padding:0;background:${BG}">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG}">
  <tr>
    <td align="center" style="padding:32px 16px">
      <table role="presentation" width="540" cellpadding="0" cellspacing="0" style="width:100%;max-width:540px;background:${CARD};color:${FG};border:1px solid ${HAIRLINE};border-radius:12px">
        ${brandHeader(opts.lang, opts.mailKind)}
        ${opts.innerRows}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Editorial digest/note: ~540px cream/white column, hosted logo,
 * serif wordmark, Gmail-proof accent CTAs, table-based for Outlook.
 */
export function renderNoteEmail(input: NoteEmailInput): {
  html: string;
  text: string;
} {
  const lang: MailLang = normalizeMailLang(input.lang);
  const mailKind: MailUtmKind = input.mailKind ?? "welcome";
  const body = markdownToEmailHtml(input.bodyMd);
  const cta =
    input.cta?.label && input.cta.url
      ? ctaButton(input.cta.label, withMailUtm(input.cta.url, mailKind, lang))
      : "";
  const innerRows = `<tr>
      <td style="padding:28px ${PAD} 28px;font-family:${SANS};font-size:16px;line-height:1.65;color:${FG}">
        ${body}
        ${cta}
      </td>
    </tr>
    ${mailFooterHtml(lang, input.unsubscribeUrl, input.settingsUrl)}`;

  const html = wrapHtml({
    lang,
    subject: input.subject,
    preheader: input.preheader ?? "",
    innerRows,
    mailKind,
  });

  const safeCtaUrl =
    input.cta?.label && input.cta.url
      ? safeHref(withMailUtm(input.cta.url, mailKind, lang))
      : null;
  const textParts = [
    markdownToPlainText(input.bodyMd),
    safeCtaUrl ? `${input.cta!.label}: ${safeCtaUrl}` : "",
    mailFooterText(lang, input.unsubscribeUrl, input.settingsUrl),
  ].filter(Boolean);

  return { html, text: textParts.join("\n\n") };
}

/** Keyword highlights mirroring the website (HighlightedText): tag-hash
 *  palette, light-mode shades (mail body is always light), escaped first
 *  so markup can never break out of a segment. */
export function highlightStoryHtml(text: string): string {
  const segments = highlightTitle(text, TITLE_KEYWORDS);
  return segments
    .map((s) => {
      const safe = escapeHtml(s.text);
      if (s.highlighted && s.tag) {
        const color = topicColor(s.tag).light;
        return `<span style="color:${color};font-weight:600">${safe}</span>`;
      }
      if (s.highlighted) {
        return `<span style="color:${ACCENT};font-weight:600">${safe}</span>`;
      }
      return safe;
    })
    .join("");
}

const THUMB_PX = 64;
const LARGE_PX = 476;

/** Short fixed title, used as the mail subject and the in-mail heading.
 *  Story text goes in the preheader, so nothing here is ever cut. */
export function digestSubjectLine(date: string, lang: MailLang): string {
  const label = lang === "vi" ? "Tin AI hôm nay" : "Today in AI";
  return `AI;DR — ${date} · ${label}`;
}

/** Generated social cards (text-on-card OG images) are not story thumbnails. */
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

/** A real image for full-width use: http(s), not a generated OG card. */
function largeImageSrc(imageUrl: string | undefined): string | null {
  const safe = imageUrl ? safeHref(imageUrl) : null;
  return safe && !isGeneratedOgCard(safe) ? safe : null;
}

function largeImage(src: string, className: string): string {
  return `<img class="${className}" src="${escapeHtml(src)}" width="${LARGE_PX}" alt="" style="display:block;width:100%;max-width:${LARGE_PX}px;height:auto;border:0;outline:none;text-decoration:none;border-radius:8px;-ms-interpolation-mode:bicubic">`;
}

/** The day card (`/api/og/date/…`, the day's top stories as a photo grid),
 *  linked to the day page. Same image as the Telegram digest and the day
 *  page's og:image, so every channel leads with one picture of the day. */
export function digestDayCardSrc(date: string, lang: MailLang): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return absoluteSiteUrl(dayArchiveOgPath(date), lang);
}

function heroRow(src: string, href: string, alt: string): string {
  return `<tr>
      <td style="padding:20px ${PAD} 4px">
        <a href="${escapeHtml(href)}" style="text-decoration:none;border:0">${largeImage(src, "mail-hero").replace('alt=""', `alt="${escapeHtml(alt)}"`)}</a>
      </td>
    </tr>`;
}

function thumbCell(imageUrl: string | undefined): string {
  const safe = imageUrl ? safeHref(imageUrl) : null;
  if (!safe) return "";
  const src = escapeHtml(safe);
  // Second cell in the row — the thumbnail sits on the right of the text.
  return `<td width="${THUMB_PX}" style="width:${THUMB_PX}px;vertical-align:top;padding-left:12px">
        <img src="${src}" width="${THUMB_PX}" alt="" style="display:block;width:${THUMB_PX}px;height:auto;border:0;outline:none;text-decoration:none;border-radius:8px;-ms-interpolation-mode:bicubic">
      </td>`;
}

export function renderDigestEmail(input: DigestEmailInput): {
  html: string;
  text: string;
} {
  const heading = digestSubjectLine(input.date, input.lang);
  const format = normalizeMailFormat(input.format);
  const home = withMailUtm(SITE_URL, "digest", input.lang);
  const textLines = input.stories.map((s, i) => `${i + 1}. ${s.text}`);
  const text = `${heading}\n\n${textLines.join("\n")}\n\n${home}\n\n${mailFooterText(input.lang, input.unsubscribeUrl, input.settingsUrl)}`;
  if (format === "text") {
    return {
      text,
      html: wrapHtml({
        lang: input.lang,
        subject: input.subject,
        preheader: input.preheader ?? input.stories[0]?.text ?? "",
        innerRows: `<tr><td style="padding:28px ${PAD};font-family:${SANS};font-size:15px;line-height:1.55;color:${FG};white-space:pre-wrap">${escapeHtml(text)}</td></tr>`,
        mailKind: "digest",
      }),
    };
  }
  // Image layouts lead with the day card; it is the whole day, so it never
  // repeats a story's own image.
  const hero =
    format === "design" || format === "large"
      ? digestDayCardSrc(input.date, input.lang)
      : null;
  const dayHref = withMailUtm(
    absoluteSiteUrl(dayArchivePath(input.date), input.lang),
    "digest",
    input.lang
  );
  const readMore =
    input.lang === "vi" ? "Đọc trên aidr.today" : "Read on aidr.today";
  const storyCta = input.lang === "vi" ? "Đọc thêm" : "Read more";

  const htmlItems = input.stories
    .map((story, i) => {
      const n = i + 1;
      const text = highlightStoryHtml(story.text);
      const href =
        safeHref(withMailUtm(story.url ?? SITE_URL, "digest", input.lang)) ??
        withMailUtm(SITE_URL, "digest", input.lang);
      const more = `<a class="mail-story" href="${escapeHtml(href)}" style="color:${ACCENT};text-decoration:underline;font-weight:500">${escapeHtml(storyCta)}</a>`;
      const rule =
        i < input.stories.length - 1
          ? `border-bottom:1px solid ${HAIRLINE};`
          : "";
      const body = `<div style="font-family:${SANS};font-size:14px;line-height:1.55;color:${FG}">
          <span style="font-family:${SERIF};font-size:15px;line-height:1.4;color:${ACCENT};font-weight:500">${n}.</span>
          ${text}
          <div style="margin-top:6px;font-family:${SANS};font-size:13px;line-height:1.4">${more}</div>
        </div>`;
      const thumb = format === "design" ? thumbCell(story.imageUrl) : "";
      const large = format === "large" ? largeImageSrc(story.imageUrl) : null;
      const inner = thumb
        ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td style="vertical-align:top">${body}</td>${thumb}</tr></table>`
        : large
          ? `<div style="padding-bottom:12px">${largeImage(large, "mail-large")}</div>${body}`
          : body;
      return `<tr>
      <td style="padding:12px ${PAD};${rule}">${inner}</td>
    </tr>`;
    })
    .join("\n");

  const innerRows = `<tr>
      <td style="padding:28px ${PAD} 12px;font-family:${SERIF};font-size:22px;line-height:1.3;font-weight:500;color:${FG}">${escapeHtml(heading)}</td>
    </tr>
    ${hero ? heroRow(hero, dayHref, heading) : ""}
    ${htmlItems}
    <tr>
      <td style="padding:16px ${PAD} 28px;font-family:${SANS};font-size:14px;line-height:1.4"><a href="${escapeHtml(hero ? dayHref : withMailUtm(SITE_URL, "digest", input.lang))}" style="color:${ACCENT};text-decoration:underline;font-weight:500">${escapeHtml(readMore)}</a></td>
    </tr>
    ${mailFooterHtml(input.lang, input.unsubscribeUrl, input.settingsUrl)}`;

  const html = wrapHtml({
    lang: input.lang,
    subject: input.subject,
    preheader: input.preheader ?? input.stories[0]?.text ?? "",
    innerRows,
    mailKind: "digest",
  });

  return { html, text };
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
