import {
  escapeHtml,
  markdownToEmailHtml,
  markdownToPlainText,
  safeHref,
} from "./markdown.js";

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

/** Editorial tokens from apps/web/src/styles.css — hex so email clients stay honest. */
const BG = "#f7f7f5";
const FG = "#0a0a0a";
const MUTED = "#6b6b6b";
const ACCENT = "#b45309";
const HAIRLINE = "#0a0a0a14";
const SERIF = 'Georgia,"Times New Roman","EB Garamond",Garamond,ui-serif,serif';
const SANS =
  '"Source Sans 3",Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif';

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
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 28px">
  <tr>
    <td style="border-radius:8px;background:${ACCENT}">
      <a href="${href}" style="display:inline-block;padding:10px 16px;font-family:${SANS};font-size:14px;line-height:1.2;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${text}</a>
    </td>
  </tr>
</table>`;
}

function brandHeader(): string {
  return `<tr>
      <td style="padding:8px 8px 24px">
        <a href="${SITE_URL}" style="font-family:${SERIF};font-size:28px;line-height:1.1;font-weight:500;color:${FG};text-decoration:none">AI;DR</a>
        <div style="margin-top:6px;font-family:${SANS};font-size:13px;color:${MUTED}">AI news ranked and summary</div>
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
  return `<tr>
      <td style="padding:24px 8px 8px;border-top:1px solid ${HAIRLINE};font-family:${SANS};font-size:12px;line-height:1.6;color:${MUTED}">
        ${why}<br>
        <a href="${unsub}" style="color:${ACCENT};text-decoration:underline">${escapeHtml(unsubLabel)}</a>
        ·
        <a href="${settings}" style="color:${ACCENT};text-decoration:underline">${escapeHtml(settingsLabel)}</a>
        ·
        <a href="${DATA_URL}" style="color:${ACCENT};text-decoration:underline">${escapeHtml(dataLabel)}</a>
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
}): string {
  const preheader = escapeHtml(opts.preheader.trim());
  return `<!DOCTYPE html>
<html lang="${opts.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(opts.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${BG}">
${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</div>` : ""}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG}">
  <tr>
    <td align="center" style="padding:32px 16px">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:100%;max-width:520px;color:${FG}">
        ${brandHeader()}
        ${opts.innerRows}
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/**
 * Editorial digest/note: 520px column, serif wordmark, accent CTAs,
 * table-based for Gmail/Outlook.
 */
export function renderNoteEmail(input: NoteEmailInput): {
  html: string;
  text: string;
} {
  const lang: MailLang = input.lang === "vi" ? "vi" : "en";
  const body = markdownToEmailHtml(input.bodyMd);
  const cta =
    input.cta?.label && input.cta.url
      ? ctaButton(input.cta.label, input.cta.url)
      : "";
  const innerRows = `<tr>
      <td style="padding:0 8px 8px;font-family:${SANS};font-size:16px;line-height:1.6;color:${FG}">
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
  });

  const safeCtaUrl =
    input.cta?.label && input.cta.url ? safeHref(input.cta.url) : null;
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
  const heading =
    input.lang === "vi" ? `AI;DR — ${input.date}` : `AI;DR — ${input.date}`;
  const readMore =
    input.lang === "vi" ? "Đọc trên aidr.today" : "Read on aidr.today";

  const htmlItems = input.stories
    .map((story, i) => {
      const n = i + 1;
      const text = escapeHtml(story.text);
      const href = story.url ? safeHref(story.url) : null;
      const link = href
        ? `<a href="${escapeHtml(href)}" style="color:${FG};text-decoration:none">${text}</a>`
        : text;
      return `<tr>
      <td style="padding:0 8px 18px;font-family:${SANS};font-size:16px;line-height:1.55;color:${FG}">
        <span style="font-family:${SERIF};font-size:18px;color:${ACCENT};font-weight:500">${n}.</span>
        ${link}
      </td>
    </tr>`;
    })
    .join("\n");

  const innerRows = `<tr>
      <td style="padding:0 8px 20px;font-family:${SERIF};font-size:26px;line-height:1.2;font-weight:500;color:${FG}">${escapeHtml(heading)}</td>
    </tr>
    ${htmlItems}
    <tr>
      <td style="padding:8px 8px 24px">${ctaButton(readMore, SITE_URL)}</td>
    </tr>
    ${mailFooterHtml(input.lang, input.unsubscribeUrl, input.settingsUrl)}`;

  const html = wrapHtml({
    lang: input.lang,
    subject: input.subject,
    preheader: input.preheader ?? input.stories[0]?.text ?? "",
    innerRows,
  });

  const textLines = input.stories.map((s, i) => `${i + 1}. ${s.text}`);
  const text = `${heading}\n\n${textLines.join("\n")}\n\n${SITE_URL}\n\n${mailFooterText(input.lang, input.unsubscribeUrl, input.settingsUrl)}`;

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
