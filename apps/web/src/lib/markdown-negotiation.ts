/**
 * `Accept: text/markdown` on a page URL gets that page's Markdown twin.
 *
 * Workers Cache keys variants on the response's `Vary`, verbatim, and serves
 * hits before this Worker runs. So both answers for a negotiable path carry
 * `Vary: Accept`: without it a cached HTML copy answers agents and a cached
 * Markdown copy answers browsers. Paths that do not negotiate never get it,
 * because every distinct Accept string becomes its own cache entry.
 */
import { HOME_MARKDOWN_PATH } from "./home-markdown";
import { langFromQuery } from "./lang";
import { absoluteSiteUrl } from "./locale-url";
import { SITE_URL } from "./site";

const STORY_PAGE_RE = /^\/([0-9a-f]{8,64})$/;
const STORY_MARKDOWN_ALIAS_RE = /^\/([0-9a-f]{8,64})\.md$/;
const DAY_PAGE_RE = /^\/date\/(\d{4}-\d{2}-\d{2})$/;
const WEEK_PAGE_RE = /^\/week\/(\d{4}-W\d{2})$/;

/** The Markdown twin's path for a negotiable page, else null. */
export function negotiableMarkdownPath(pathname: string): string | null {
  if (pathname === "/") return HOME_MARKDOWN_PATH;
  const story = STORY_PAGE_RE.exec(pathname);
  if (story) return `/api/story/${story[1]}.md`;
  const day = DAY_PAGE_RE.exec(pathname);
  if (day) return `/date/${day[1]}.md`;
  const week = WEEK_PAGE_RE.exec(pathname);
  if (week) return `/week/${week[1]}.md`;
  return null;
}

/** `/{id}.md` is the llms.txt-style alias of `/api/story/{id}.md`. */
export function storyMarkdownAliasPath(pathname: string): string | null {
  const story = STORY_MARKDOWN_ALIAS_RE.exec(pathname);
  return story ? `/api/story/${story[1]}.md` : null;
}

interface MediaRange {
  type: string;
  q: number;
}

function parseAccept(accept: string): MediaRange[] {
  return accept.split(",").flatMap((part) => {
    const [type, ...params] = part.split(";").map((s) => s.trim());
    if (!type) return [];
    let q = 1;
    for (const param of params) {
      const match = /^q=([0-9.]+)$/i.exec(param);
      if (match) q = Number(match[1]);
    }
    return Number.isFinite(q) ? [{ type: type.toLowerCase(), q }] : [];
  });
}

/** q of the most specific range matching `type` (exact, `major/*`, `*\/*`). */
function qualityOf(ranges: MediaRange[], type: string): number {
  const major = `${type.split("/")[0]}/*`;
  for (const candidate of [type, major, "*/*"]) {
    const hits = ranges.filter((range) => range.type === candidate);
    if (hits.length > 0) return Math.max(...hits.map((range) => range.q));
  }
  return 0;
}

/**
 * True when the client names `text/markdown` itself and ranks it at least
 * as high as HTML. Browsers never name it; `*\/*` alone stays HTML.
 */
export function prefersMarkdown(accept: string | null): boolean {
  if (!accept) return false;
  const ranges = parseAccept(accept);
  const markdown = ranges.filter((range) => range.type === "text/markdown");
  if (markdown.length === 0) return false;
  const q = Math.max(...markdown.map((range) => range.q));
  return q > 0 && q >= qualityOf(ranges, "text/html");
}

/** Response with `Accept` merged into its Vary, and an optional extra Link. */
export function withAcceptVary(response: Response, link?: string): Response {
  const out = new Response(response.body, response);
  const vary = out.headers.get("vary");
  const names = (vary ?? "").split(",").map((v) => v.trim().toLowerCase());
  if (!names.includes("accept")) {
    out.headers.set("Vary", vary ? `${vary}, Accept` : "Accept");
  }
  if (link) out.headers.append("Link", link);
  return out;
}

/** `Link` value advertising the Markdown twin, carrying an explicit `lang`. */
export function markdownAlternateLink(
  twinPath: string,
  search: string
): string {
  const lang = langFromQuery(search);
  const href = lang
    ? absoluteSiteUrl(twinPath, lang)
    : `${SITE_URL}${twinPath}`;
  return `<${href}>; rel="alternate"; type="text/markdown"`;
}
