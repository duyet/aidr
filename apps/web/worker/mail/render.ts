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

const SITE_URL = "https://aidr.today";
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
const SERIF = 'Georgia,"Times New Roman","EB Garamond",Garamond,ui-serif,serif';
const SANS =
  'Inter,"Source Sans 3",-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif';

export type MailLang = "en" | "vi";

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
}

export interface DigestEmailInput {
  subject: string;
  date: string;
  stories: DigestStory[];
  lang: MailLang;
  unsubscribeUrl: string;
  settingsUrl: string;
  preheader?: string;
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
  const home = escapeHtml(withMailUtm(SITE_URL, kind));
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
  const unsub = escapeHtml(unsubscribeUrl);
  const settings = escapeHtml(settingsUrl);
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
  if (lang === "vi") {
    return `Hủy đăng ký: ${unsubscribeUrl}\nChỉnh cài đặt: ${settingsUrl}\nDữ liệu / pipeline: ${DATA_URL}`;
  }
  return `Unsubscribe: ${unsubscribeUrl}\nAdjust settings: ${settingsUrl}\nData / Pipeline: ${DATA_URL}`;
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
<style type="text/css">
  a { text-decoration: none !important; }
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
  const lang: MailLang = input.lang === "vi" ? "vi" : "en";
  const mailKind: MailUtmKind = input.mailKind ?? "welcome";
  const body = markdownToEmailHtml(input.bodyMd);
  const cta =
    input.cta?.label && input.cta.url
      ? ctaButton(input.cta.label, withMailUtm(input.cta.url, mailKind))
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
      ? safeHref(withMailUtm(input.cta.url, mailKind))
      : null;
  const textParts = [
    markdownToPlainText(input.bodyMd),
    safeCtaUrl ? `${input.cta!.label}: ${safeCtaUrl}` : "",
    mailFooterText(lang, input.unsubscribeUrl, input.settingsUrl),
  ].filter(Boolean);

  return { html, text: textParts.join("\n\n") };
}

export function renderDigestEmail(input: DigestEmailInput): {
  html: string;
  text: string;
} {
  const heading = input.date;
  const readMore =
    input.lang === "vi" ? "Đọc trên aidr.today" : "Read on aidr.today";

  const htmlItems = input.stories
    .map((story, i) => {
      const n = i + 1;
      const text = escapeHtml(story.text);
      const href = story.url
        ? safeHref(withMailUtm(story.url, "digest"))
        : null;
      const link = href
        ? `<a href="${escapeHtml(href)}" style="color:${FG};text-decoration:none;font-weight:500">${text}</a>`
        : text;
      const rule =
        i < input.stories.length - 1
          ? `border-bottom:1px solid ${HAIRLINE};`
          : "";
      return `<tr>
      <td style="padding:16px ${PAD};${rule}font-family:${SANS};font-size:16px;line-height:1.6;color:${FG}">
        <span style="font-family:${SERIF};font-size:18px;line-height:1.4;color:${ACCENT};font-weight:500">${n}.</span>
        ${link}
      </td>
    </tr>`;
    })
    .join("\n");

  const innerRows = `<tr>
      <td style="padding:28px ${PAD} 12px;font-family:${SERIF};font-size:22px;line-height:1.3;font-weight:500;color:${FG}">${escapeHtml(heading)}</td>
    </tr>
    ${htmlItems}
    <tr>
      <td style="padding:16px ${PAD} 28px">${ctaButton(readMore, withMailUtm(SITE_URL, "digest"))}</td>
    </tr>
    ${mailFooterHtml(input.lang, input.unsubscribeUrl, input.settingsUrl)}`;

  const html = wrapHtml({
    lang: input.lang,
    subject: input.subject,
    preheader: input.preheader ?? input.stories[0]?.text ?? "",
    innerRows,
    mailKind: "digest",
  });

  const home = withMailUtm(SITE_URL, "digest");
  const textLines = input.stories.map((s, i) => `${i + 1}. ${s.text}`);
  const text = `${heading}\n\n${textLines.join("\n")}\n\n${home}\n\n${mailFooterText(input.lang, input.unsubscribeUrl, input.settingsUrl)}`;

  return { html, text };
}

export function unsubscribeUrl(token: string): string {
  return `${SITE_URL}/subscribe?unsubscribe=${encodeURIComponent(token)}`;
}

export function settingsUrl(token: string): string {
  return `${SITE_URL}/subscribe?settings=${encodeURIComponent(token)}`;
}

export function oneClickUnsubscribeUrl(token: string): string {
  return `${SITE_URL}/api/subscribe?token=${encodeURIComponent(token)}`;
}

export function listUnsubscribeHeaders(token: string): Record<string, string> {
  const click = oneClickUnsubscribeUrl(token);
  const page = unsubscribeUrl(token);
  return {
    "List-Unsubscribe": `<${click}>, <${page}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}
