/**
 * Plain-text handling: what the user wrote versus what they quoted or
 * forwarded, the links in each, and which story the message is about.
 * Fixed rules only.
 */

export const MAX_BODY_CHARS = 20_000;
export const MAX_OWN_TEXT_CHARS = 2000;
export const MAX_LINKS = 10;

const FORWARD_SUBJECT = /^\s*(fwd?|tr|wg|rv|chuyển tiếp)\s*:/i;
const REPLY_SUBJECT = /^\s*(re|aw|sv)\s*:/i;
const FORWARD_MARKER =
  /^\s*(-{2,}\s*(forwarded message|thư được chuyển tiếp)\s*-{2,}|begin forwarded message:)/i;
const QUOTE_HEADER =
  /^\s*(on .{3,200} wrote:|vào .{3,200} đã viết:|-{2,}\s*original message\s*-{2,}|from: .+@.+)$/i;
const SIGNATURE = /^-- ?$/;

export interface SplitBody {
  /** Lines the user wrote above any quote, signature or forward marker. */
  own: string;
  /** The quoted or forwarded part (empty for a plain message). */
  rest: string;
  isForward: boolean;
  isReply: boolean;
}

export function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\s[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, "$2 $1 ")
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h\d)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

export function splitBody(text: string, subject: string): SplitBody {
  const lines = text
    .slice(0, MAX_BODY_CHARS)
    .replace(/\r\n?/g, "\n")
    .split("\n");
  let isForward = FORWARD_SUBJECT.test(subject);
  const own: string[] = [];
  let cut = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FORWARD_MARKER.test(line)) {
      isForward = true;
      cut = i;
      break;
    }
    if (
      QUOTE_HEADER.test(line) ||
      line.startsWith(">") ||
      SIGNATURE.test(line)
    ) {
      cut = i;
      break;
    }
    own.push(line);
  }
  const restLines = lines.slice(cut);
  // A signature cut is not a quote: keep looking for a forward marker below
  // it so a signed forward still counts as a forward.
  if (!isForward && restLines.some((line) => FORWARD_MARKER.test(line))) {
    isForward = true;
  }
  return {
    own: own.join("\n").trim(),
    rest: restLines.join("\n").trim(),
    isForward,
    isReply: !isForward && REPLY_SUBJECT.test(subject),
  };
}

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi;
const OWN_HOST = /(^|\.)aidr\.today$/i;
const SKIP_PATH =
  /(unsubscribe|optout|opt-out|preferences|manage-subscription|\/track|\/click|\/open|beacon|pixel)/i;
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|ico|bmp)(\?|$)/i;
const TRACKING_PARAM = /^(utm_.+|fbclid|gclid|mc_cid|mc_eid|ref_src|igshid)$/i;

/** Drops tracking params and the fragment so the exact-URL dedupe in
 *  `submitStory` sees one story as one URL. */
export function canonicalizeUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.replace(/[.,;:!?]+$/, ""));
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  for (const key of [...url.searchParams.keys()]) {
    if (TRACKING_PARAM.test(key)) url.searchParams.delete(key);
  }
  url.hash = "";
  return url.toString();
}

/** Links worth submitting as a story, in order, without duplicates. */
export function storyLinks(text: string): string[] {
  const out: string[] = [];
  for (const match of text.match(URL_RE) ?? []) {
    const url = canonicalizeUrl(match);
    if (!url) continue;
    const parsed = new URL(url);
    if (OWN_HOST.test(parsed.hostname)) continue;
    if (SKIP_PATH.test(parsed.pathname + parsed.search)) continue;
    if (IMAGE_EXT.test(parsed.pathname)) continue;
    if (!out.includes(url)) out.push(url);
    if (out.length >= MAX_LINKS) break;
  }
  return out;
}

export interface StoryRef {
  idPrefix: string;
  lang: "vi" | "en" | null;
}

function refFromToken(token: string): StoryRef | null {
  const [id, lang] = token.toLowerCase().split(/[.:]/);
  if (!id || !/^[0-9a-f]{8,64}$/.test(id)) return null;
  return { idPrefix: id, lang: lang === "en" || lang === "vi" ? lang : null };
}

/** aidr.today story links (`/{id8}`, optional `?lang=en`) in `text`. */
function refsFromLinks(text: string): StoryRef[] {
  const refs: StoryRef[] = [];
  for (const match of text.match(URL_RE) ?? []) {
    let url: URL;
    try {
      url = new URL(match.replace(/[.,;:!?]+$/, ""));
    } catch {
      continue;
    }
    if (!OWN_HOST.test(url.hostname)) continue;
    const segment = url.pathname.split("/").filter(Boolean).pop() ?? "";
    const id = segment.match(/(?:^|-)([0-9a-f]{8,64})$/)?.[1];
    if (!id || refs.some((ref) => ref.idPrefix === id)) continue;
    const lang = url.searchParams.get("lang");
    refs.push({
      idPrefix: id,
      lang: lang === "en" || lang === "vi" ? lang : null,
    });
  }
  return refs;
}

/**
 * The story a message is about: the `submit+<id>` subaddress, then a
 * `[aidr:<id>]` subject marker (kept by "Re:" replies), then exactly one
 * story link in the user's own text. Quoted text is never used: a reply to
 * a digest quotes every story in it.
 */
export function findStoryRef(args: {
  to: string;
  subject: string;
  own: string;
}): StoryRef | null {
  const plus = args.to.toLowerCase().match(/^[^@+]+\+([^@]+)@/)?.[1];
  if (plus) {
    const ref = refFromToken(plus);
    if (ref) return ref;
  }
  const marker = args.subject.match(
    /\[aidr:([0-9a-f]{8,64}(?:[.:](?:en|vi))?)\]/i
  );
  if (marker) {
    const ref = refFromToken(marker[1]);
    if (ref) return ref;
  }
  const refs = refsFromLinks(args.own);
  return refs.length === 1 ? refs[0] : null;
}
