import { registrySourceIds } from "../../worker/sources/catalog.js";
import { SITE_NAME, SITE_URL } from "./site";

/** Public HTML pages that also have a Markdown twin for agents. */
export const PAGE_MARKDOWN_PATHS = [
  "/about.md",
  "/subscribe.md",
  "/data.md",
  "/brand.md",
  "/release.md",
  "/privacy.md",
  "/terms.md",
  "/mcp.md",
  "/contribute.md",
] as const;

export type PageMarkdownPath = (typeof PAGE_MARKDOWN_PATHS)[number];

/** How many ingest sources the registry currently ships. */
export function ingestSourceCount(): number {
  return registrySourceIds().length;
}

/**
 * The one-line description agents should quote. The source count is the
 * live registry, not a number frozen in prose.
 */
export function rankedEditionLine(): string {
  return `AI news ranked and summary from ${ingestSourceCount()} sources. ${SITE_NAME} is a machine that reads the day's AI news and publishes one ranked edition.`;
}

const PAGES: Record<PageMarkdownPath, { title: string; body: string }> = {
  "/about.md": {
    title: "About",
    body: "What the site is, who it is for, and how an edition is produced.",
  },
  "/subscribe.md": {
    title: "Subscribe",
    body: "Email digest, Telegram, and the Chrome extension. No account is required to subscribe.",
  },
  "/data.md": {
    title: "Pipeline",
    body: "Operator view of ingest runs, sources, model use, and the ranking formula.",
  },
  "/brand.md": {
    title: "Brand",
    body: "Name, mark, and colors for AI;DR.",
  },
  "/release.md": {
    title: "Release notes",
    body: "Every release of the site, newest first: what shipped, screenshots, and the changelog. Each version has its own page at /release/vX.Y.Z.",
  },
  "/privacy.md": {
    title: "Privacy",
    body: "What the site stores about readers and subscribers.",
  },
  "/terms.md": {
    title: "Terms",
    body: "Terms for using aidr.today.",
  },
  "/mcp.md": {
    title: "MCP",
    body: "The read-only tools agents can call, and where operator tools require a token.",
  },
  "/contribute.md": {
    title: "Contribute",
    body: "Send a story or a correction on the site, or by email from a verified address.",
  },
};

export function pageMarkdown(path: string): string | null {
  if (!isPageMarkdownPath(path)) return null;
  const page = PAGES[path];
  const htmlPath = path.slice(0, -3);
  return `# ${page.title}

${rankedEditionLine()}

${page.body}

- [HTML](${SITE_URL}${htmlPath})
- [llms.txt](${SITE_URL}/llms.txt)
`;
}

export function isPageMarkdownPath(path: string): path is PageMarkdownPath {
  return (PAGE_MARKDOWN_PATHS as readonly string[]).includes(path);
}

export function pageMarkdownResponse(path: string): Response | null {
  const body = pageMarkdown(path);
  if (!body) return null;
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/markdown; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
