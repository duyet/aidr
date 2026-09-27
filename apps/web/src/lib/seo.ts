import { localizedTitle } from "./display-title";
import { absoluteSiteUrl, withLang } from "./locale-url";
import { DEFAULT_PREFS } from "./prefs";
import { publisherHost } from "./publisher-host";
import {
  type RouteIndexabilityInput,
  routeIndexability,
} from "./route-indexability";
import {
  SITE_DESCRIPTION,
  SITE_LOGO_URL,
  SITE_NAME,
  SITE_OG_HOME_IMAGE_URL,
  SITE_OG_IMAGE_HEIGHT,
  SITE_OG_IMAGE_URL,
  SITE_OG_IMAGE_WIDTH,
  SITE_TITLE,
  SITE_URL,
} from "./site";
import { storyPath } from "./slug";
import { displayTldrBullets } from "./tldr-fallback";
import { tldrAnchorStoryPaths, tldrShownCount } from "./tldr-links";
import type { FeedResponse, ItemSource, Lang } from "./types";

export type HeadMeta =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string };

/**
 * A head `<script>` the router renders into `<head>` during SSR. Only the
 * JSON-LD emitter uses it today.
 */
export interface HeadScript {
  type: string;
  children?: string;
}

/** Any value that can appear inside a JSON-LD graph. */
export type JsonLdValue =
  | string
  | number
  | boolean
  | null
  | JsonLdNode
  | JsonLdRef
  | JsonLdValue[];

/** One schema.org node. `@type` is required by every node this file emits. */
export interface JsonLdNode {
  "@type": string;
  [key: string]: JsonLdValue;
}

/** An `@id` pointer at another node; resolves inside the same `@graph`. */
export interface JsonLdRef {
  "@id": string;
  "@type"?: string;
}

/**
 * The document-level JSON-LD object. One `@graph` per page rather than several
 * top-level nodes in separate scripts: `@id` references resolve inside a
 * single graph, and the extracted block stays one `JSON.parse`-able object
 * (the acceptance check for #224 greps a `ld+json` block and parses it).
 */
export interface JsonLdGraph {
  "@context": typeof SCHEMA_ORG_CONTEXT;
  "@graph": JsonLdNode[];
}

export interface HeadLink {
  rel: string;
  href: string;
  type?: string;
  hrefLang?: string;
  /** `title` on a `rel="alternate"` link is the feed name a reader shows. */
  title?: string;
}

export interface HeadTags {
  meta: HeadMeta[];
  links: HeadLink[];
  /**
   * The JSON-LD nodes this document publishes, in `@graph` order. Every
   * head-tag builder in this file fills it, so the test harness can assert on
   * the graph itself and not only on the rendered markup.
   *
   * Empty on a response that `routeIndexability()` refuses to index, and
   * empty for a 404. Structured data on a `noindex` page would tell a crawler
   * the opposite of what `X-Robots-Tag` and the robots meta say.
   */
  jsonLd: JsonLdNode[];
  /**
   * The single `<script type="application/ld+json">` emitter for `jsonLd`;
   * empty whenever `jsonLd` is. `HeadContent` renders it server-side, so the
   * block is in the initial HTML the crawler already fetches — not injected by
   * client JS — and a data-MIME `<script>` is never executed by the browser
   * nor re-appended on hydration.
   */
  scripts: HeadScript[];
}

const SCHEMA_ORG_CONTEXT = "https://schema.org";
const JSON_LD_MIME = "application/ld+json";

/**
 * JSON-escape a serialized graph for embedding in a `<script>` element.
 *
 * Every JSON-LD string is either aidr-authored or untrusted publisher text (a
 * story title, a digest bullet), and the router renders a head script with
 * `dangerouslySetInnerHTML`, so this is the boundary that keeps a title
 * containing `</script>`, `<!--` or `]]>` from terminating the element. The
 * replacements are JSON `\uXXXX` escapes rather than HTML entities, so the
 * block stays valid JSON and `JSON.parse` returns the original text. `>` and
 * `&` are escaped alongside `<` even though only `<` can open a tag: the cost
 * is nil and the "which character does an attacker need" question goes away.
 * U+2028/U+2029 are legal in JSON but are line terminators to a JS parser.
 */
const JSON_SCRIPT_ESCAPES: Record<string, string> = {
  "&": "\\u0026",
  "<": "\\u003c",
  ">": "\\u003e",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

export function jsonLdScriptBody(graph: JsonLdGraph): string {
  return JSON.stringify(graph).replace(
    /[&<>\u2028\u2029]/g,
    (char) => JSON_SCRIPT_ESCAPES[char] ?? char
  );
}

/**
 * The one head script for a graph set. One `<script>` per document: the
 * acceptance check extracts "the" `ld+json` block and `JSON.parse`s it, and a
 * single `@graph` is what lets the `WebSite` / `Organization` ids be resolved
 * by reference from the same document.
 */
function jsonLdScript(jsonLd: JsonLdNode[]): HeadScript[] {
  if (jsonLd.length === 0) return [];
  return [
    {
      type: JSON_LD_MIME,
      children: jsonLdScriptBody({
        "@context": SCHEMA_ORG_CONTEXT,
        "@graph": jsonLd,
      }),
    },
  ];
}

/** The two stable site-level entity ids every page can point at. */
export const SITE_WEBSITE_ID = `${SITE_URL}/#website`;
export const SITE_ORGANIZATION_ID = `${SITE_URL}/#organization`;

/**
 * `inLanguage` is the BCP-47 form of the same locale `og:locale` publishes
 * (`vi_VN` / `en_US`), so the two tags can never disagree about which
 * language a page is in.
 */
export function schemaLang(lang: Lang): string {
  return lang === "vi" ? "vi-VN" : "en-US";
}

function isIndexable(route: RouteIndexabilityInput): boolean {
  return routeIndexability(route).robots === "index, follow";
}

/**
 * The indexability gate, in one place: structured data is built only for a
 * route `routeIndexability()` marks `index, follow`, and is empty otherwise
 * (or when a caller declares no route at all). That is the same policy that
 * produces the robots meta tag and the Worker's `X-Robots-Tag`, so a `noindex`
 * response can never ship a graph inviting the opposite.
 */
function indexableGraph(
  route: RouteIndexabilityInput | undefined,
  build: () => JsonLdNode[]
): JsonLdNode[] {
  if (!route || !isIndexable(route)) return [];
  return build();
}

/** Absolute canonical story URL — the same string `og:url` and the canonical
 * link carry, so JSON-LD and Open Graph cannot diverge on it. */
export function storyUrl(item: { id: string }, lang: Lang): string {
  return absoluteSiteUrl(storyPath(item), lang);
}

/** The generated first-party story card, locale-suffixed like `og:image`. */
export function storyCardUrl(item: { id: string }, lang: Lang): string {
  return absoluteSiteUrl(`/api/og/${item.id}.png`, lang);
}

/** Robots meta for the active route and its search/facet state. */
export function routeRobotsMeta(target: RouteIndexabilityInput): HeadMeta {
  return {
    name: "robots",
    content: routeIndexability(target).robots,
  };
}

const SITEMAP_LINK: HeadLink = {
  rel: "sitemap",
  type: "application/xml",
  href: `${SITE_URL}/sitemap.xml`,
};

/**
 * Feed autodiscovery. `type` is what readers and browsers match on, and the
 * href is always the canonical `/feed.xml` with an explicit locale so a
 * subscriber never lands on the cookie-selected (private, no-store) variant.
 */
export function feedDiscoveryLink(lang: Lang): HeadLink {
  return {
    rel: "alternate",
    type: "application/rss+xml",
    title: lang === "vi" ? `${SITE_NAME} (aidr.today)` : SITE_TITLE,
    href: absoluteSiteUrl("/feed.xml", lang),
  };
}

function shareTags(opts: {
  title: string;
  description: string;
  url: string;
  type: "website" | "article";
  imageUrl?: string | null;
  lang?: Lang;
  /** When true, emit og:image width/height (1200×630 cards). */
  siteOgDimensions?: boolean;
}): HeadMeta[] {
  const twitterCard = opts.imageUrl ? "summary_large_image" : "summary";
  const meta: HeadMeta[] = [
    { title: opts.title },
    { name: "description", content: opts.description },
    { property: "og:type", content: opts.type },
    { property: "og:site_name", content: SITE_NAME },
    { property: "og:title", content: opts.title },
    { property: "og:description", content: opts.description },
    { property: "og:url", content: opts.url },
    { name: "twitter:card", content: twitterCard },
    { name: "twitter:title", content: opts.title },
    { name: "twitter:description", content: opts.description },
  ];
  if (opts.lang) {
    meta.push(
      {
        property: "og:locale",
        content: opts.lang === "vi" ? "vi_VN" : "en_US",
      },
      {
        property: "og:locale:alternate",
        content: opts.lang === "vi" ? "en_US" : "vi_VN",
      }
    );
  }
  if (opts.imageUrl) {
    meta.push({ property: "og:image", content: opts.imageUrl });
    meta.push({ name: "twitter:image", content: opts.imageUrl });
    if (opts.siteOgDimensions) {
      meta.push({
        property: "og:image:width",
        content: String(SITE_OG_IMAGE_WIDTH),
      });
      meta.push({
        property: "og:image:height",
        content: String(SITE_OG_IMAGE_HEIGHT),
      });
    }
  }
  return meta;
}

/** Absolute canonical URL for a site path (`/` → origin with trailing slash). */
export function canonicalUrl(path: string): string {
  if (path === "/" || path === "") return `${SITE_URL}/`;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

function localizedHeadLinks(path: string, lang: Lang): HeadLink[] {
  return [
    { rel: "canonical", href: canonicalUrl(withLang(path, lang)) },
    {
      rel: "alternate",
      hrefLang: "vi",
      href: canonicalUrl(withLang(path, "vi")),
    },
    {
      rel: "alternate",
      hrefLang: "en",
      href: canonicalUrl(withLang(path, "en")),
    },
    {
      rel: "alternate",
      hrefLang: "x-default",
      href: canonicalUrl(withLang(path, "vi")),
    },
  ];
}

// ---------------------------------------------------------------------------
// JSON-LD graphs (#224)
//
// Trust boundary: every string below is either aidr-authored (site name,
// titles we typed, our own og card URL) or untrusted publisher text (a story
// title, a digest bullet). `jsonLdScriptBody` rewrites `<`, `>` and `&` into
// JSON `\uXXXX` escapes before the block can reach the HTML, so hostile
// publisher text cannot terminate the script element. The same stance as
// `llms.txt` § "Story-text trust boundary": quoted, escaped, never executed and
// never treated as instructions.
//
// Deliberately absent, because aidr is an aggregator that summarizes and
// links out rather than an outlet that files its own reporting:
//   - `author`            — a story is not ours; we have no human author.
//   - `aggregateRating`   — never. No user rating exists in the data model.
//   - `review`            — no review content exists.
//   - `NewsMediaOrganization` / any Google News publisher claim — not
//     eligible original reporting, so never claimed anywhere in the markup.
//   - `WebSite.potentialAction` / `SearchAction` — there is no site-search
//     results page to point at.
// ---------------------------------------------------------------------------

/** aidr as the publisher of the *site* (not of any individual story). */
function siteOrganization(): JsonLdNode {
  return {
    "@type": "Organization",
    "@id": SITE_ORGANIZATION_ID,
    name: SITE_NAME,
    url: canonicalUrl("/"),
    logo: {
      "@type": "ImageObject",
      url: SITE_LOGO_URL,
    },
  };
}

function breadcrumbNode(
  id: string,
  items: { name: string; item: string }[]
): JsonLdNode {
  return {
    "@type": "BreadcrumbList",
    "@id": id,
    itemListElement: items.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: crumb.item,
    })),
  };
}

/**
 * `WebPage` + `BreadcrumbList` for one static page, each self-canonical.
 * The page's own canonical is the last crumb, per Google's breadcrumb
 * guidance; the root crumb is the language-matched homepage so a Vietnamese
 * page never links a Vietnamese reader to the English homepage.
 */
function staticPageGraph(opts: {
  url: string;
  title: string;
  description: string;
  lang?: Lang;
}): JsonLdNode[] {
  const home = opts.lang ? absoluteSiteUrl("/", opts.lang) : canonicalUrl("/");
  return [
    {
      "@type": "WebPage",
      "@id": opts.url,
      url: opts.url,
      name: opts.title,
      description: opts.description,
      inLanguage: schemaLang(opts.lang ?? "en"),
      isPartOf: { "@type": "WebSite", "@id": SITE_WEBSITE_ID },
      breadcrumb: { "@id": `${opts.url}#breadcrumb` },
    },
    breadcrumbNode(`${opts.url}#breadcrumb`, [
      { name: opts.lang === "vi" ? "Trang chủ" : "Home", item: home },
      { name: opts.title, item: opts.url },
    ]),
  ];
}

/** Root crumb label: the site name itself, which is language-neutral. */
function siteBreadcrumbItem(lang: Lang): { name: string; item: string } {
  return { name: SITE_NAME, item: absoluteSiteUrl("/", lang) };
}

/**
 * Homepage graph: `WebSite` + `Organization` + `WebPage` + `BreadcrumbList`
 * (+ `ItemList`).
 *
 * The `ItemList` holds exactly the story permalinks the AI;DR section paints
 * as `<a href>` in this same SSR response. `tldrAnchorStoryPaths` drops a
 * bullet with no primary item id for the same reason `TldrBulletList` does not
 * wrap that row in an anchor, so the list cannot contain a URL, position, or
 * count the HTML does not have. The count comes from the same default
 * preference the server render paints with (a browser that has raised its
 * stored count past 8 sees a longer list than the one the crawler read — the
 * JSON-LD describes the SSR HTML, which is the contract).
 */
function homepageGraph(opts: {
  lang: Lang;
  url: string;
  feed: FeedResponse | null | undefined;
}): JsonLdNode[] {
  const bullets = displayTldrBullets(opts.feed?.tldr ?? null, opts.lang);
  const shown = bullets.slice(
    0,
    tldrShownCount(bullets.length, DEFAULT_PREFS.tldrCount)
  );
  const paths = tldrAnchorStoryPaths(shown, opts.lang);
  const itemList =
    paths.length > 0
      ? [
          {
            "@type": "ItemList" as const,
            "@id": `${opts.url}#itemlist`,
            numberOfItems: paths.length,
            itemListElement: paths.map((path, index) => ({
              "@type": "ListItem" as const,
              position: index + 1,
              url: `${SITE_URL}${path}`,
              // The anchor wraps the whole digest row, so the bullet text is
              // what the reader sees on that link. Reusing it keeps `name`
              // honest instead of inventing a headline the HTML never shows.
              name: shown[index]?.text?.trim() ?? "",
            })),
          },
        ]
      : [];
  return [
    {
      "@type": "WebSite",
      "@id": SITE_WEBSITE_ID,
      url: opts.url,
      name: SITE_NAME,
      description: SITE_DESCRIPTION,
      inLanguage: schemaLang(opts.lang),
      publisher: { "@type": "Organization", "@id": SITE_ORGANIZATION_ID },
    },
    siteOrganization(),
    {
      "@type": "WebPage",
      "@id": opts.url,
      url: opts.url,
      name: SITE_TITLE,
      description: SITE_DESCRIPTION,
      inLanguage: schemaLang(opts.lang),
      isPartOf: { "@type": "WebSite", "@id": SITE_WEBSITE_ID },
      breadcrumb: { "@id": `${opts.url}#breadcrumb` },
    },
    breadcrumbNode(`${opts.url}#breadcrumb`, [siteBreadcrumbItem(opts.lang)]),
    ...itemList,
  ];
}

/**
 * The outlet that actually published the story, from `item_sources`.
 *
 * aidr is the *aggregator*: it summarizes and links out. Claiming `SITE_NAME`
 * as the `NewsArticle` publisher would be a false attribution for syndicated
 * vendor-blog content, and naming a person as `author` would be invented, so
 * neither happens. When a story has no usable source URL the `publisher`
 * property is omitted entirely — an absent, honest field beats a fabricated
 * one. Support links count; a discussion thread does not, because a comment
 * thread is not the outlet.
 */
function storyPublisher(
  sources: ItemSource[] | null | undefined,
  articleUrl: string | null | undefined
): JsonLdNode | null {
  const host = (url: string | null | undefined): string | null => {
    const safe = safeExternalUrl(url);
    if (!safe) return null;
    return publisherHost(safe);
  };
  const ordered = [
    ...(sources ?? []).filter((source) => source.kind === "source"),
    ...(sources ?? []).filter(
      (source) => source.kind !== "source" && source.kind !== "discussion"
    ),
  ];
  for (const source of ordered) {
    const name = host(source.url);
    if (name) return { "@type": "Organization", name, url: `https://${name}` };
  }
  const fallbackHost = host(articleUrl);
  return fallbackHost
    ? {
        "@type": "Organization",
        name: fallbackHost,
        url: `https://${fallbackHost}`,
      }
    : null;
}

/** Only absolute http(s) URLs; anything else is not a citable publisher. */
function safeExternalUrl(value: string | null | undefined): string | null {
  const clean = value?.trim();
  if (!clean) return null;
  try {
    const parsed = new URL(clean);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return null;
    }
    return parsed.hostname ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function isoFromEpochSeconds(
  seconds: number | null | undefined
): string | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  const date = new Date(seconds * 1000);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

/**
 * ISO-8601 `datePublished` / `dateModified`.
 *
 * `datePublished` is `published_at` — the epoch-seconds column the story permalink
 * already renders as its `<time>`.
 *
 * `dateModified` is the newest timestamp *this story carries*: the max of
 * `published_at` and every `item_sources.posted_at`. A source row is rendered
 * on the story page itself ("Key sources"), so a later source genuinely is a
 * later version of this page; and because a source's own post time is always
 * <= the moment we attached it, the value is a lower bound on the last write
 * rather than an overstatement of freshness.
 *
 * What the brief also lists is *not* used, deliberately:
 *  - `items.source_revision` (migration 0023) is a monotonic counter bumped by
 *    a trigger, not a clock, and `story-queries.ts` does not even select it.
 *    There is no time value in it to read.
 *  - a summary or media-manifest refresh writes no timestamp column at all.
 *  Inventing either would put a made-up modification date on a news article,
 *  which is the one field that must never be guessed. A real `items.updated_at`
 *  would be the follow-up; until it exists this is the truthful value.
 *
 * With no usable timestamp at all (a non-numeric `published_at` and no source
 * times) both fields are omitted rather than defaulted to "now".
 */
function storyDates(item: {
  published_at?: number | null;
  sources?: ItemSource[] | null;
}): { datePublished?: string; dateModified?: string } {
  const publishedAt = isoFromEpochSeconds(item.published_at);
  const latestSource = (item.sources ?? []).reduce<number | null>(
    (max, source) => {
      const iso = isoFromEpochSeconds(source.posted_at);
      if (!iso) return max;
      const time = Date.parse(iso);
      return max === null || time > max ? time : max;
    },
    null
  );
  if (publishedAt === null && latestSource === null) return {};
  // No `published_at` at all: the story is not really published yet, so the
  // source time is only ever a `dateModified`, never a `datePublished`.
  if (publishedAt === null) {
    return { dateModified: new Date(latestSource!).toISOString() };
  }
  const publishedTime = Date.parse(publishedAt);
  const modifiedTime =
    latestSource === null
      ? publishedTime
      : Math.max(publishedTime, latestSource);
  return {
    datePublished: publishedAt,
    dateModified: new Date(modifiedTime).toISOString(),
  };
}

/**
 * Marketing/static page share tags. Each URL must canonical to itself, and
 * each publishes `WebPage` + `BreadcrumbList` for itself.
 */
export function pageHead(opts: {
  path: string;
  title: string;
  description?: string;
  imageUrl?: string;
  lang?: Lang;
  /**
   * Route identity for the indexability gate. Omit it (or pass a route that
   * `routeIndexability()` refuses to index) and no JSON-LD is emitted, so
   * structured data can never contradict the robots meta or `X-Robots-Tag`.
   */
  route?: RouteIndexabilityInput;
}): HeadTags {
  const url = canonicalUrl(opts.path);
  const description = opts.description ?? SITE_DESCRIPTION;
  const graph = indexableGraph(opts.route, () =>
    staticPageGraph({ url, title: opts.title, description, lang: opts.lang })
  );
  return {
    meta: shareTags({
      title: opts.title,
      description,
      url,
      type: "website",
      imageUrl: opts.imageUrl ?? SITE_OG_IMAGE_URL,
      lang: opts.lang,
      siteOgDimensions: true,
    }),
    links: [{ rel: "canonical", href: url }, SITEMAP_LINK],
    jsonLd: graph,
    scripts: jsonLdScript(graph),
  };
}

export function localizedPageHead(
  opts: Parameters<typeof pageHead>[0] & { lang: Lang }
): HeadTags {
  const head = pageHead({
    ...opts,
    path: withLang(opts.path, opts.lang),
  });
  return {
    ...head,
    links: [
      ...localizedHeadLinks(opts.path, opts.lang),
      feedDiscoveryLink(opts.lang),
      SITEMAP_LINK,
    ],
  };
}

/**
 * Homepage Open Graph / Twitter / canonical + hreflang tags, plus the
 * `WebSite` / `Organization` / `ItemList` graph.
 */
export function homepageHead(
  lang: Lang = "vi",
  opts: {
    /** SSR feed payload; its digest bullets are the only link source. */
    feed?: FeedResponse | null;
    route?: RouteIndexabilityInput;
  } = {}
): HeadTags {
  const url = absoluteSiteUrl("/", lang);
  const graph = indexableGraph(opts.route, () =>
    homepageGraph({ lang, url, feed: opts.feed })
  );
  return {
    links: [
      ...localizedHeadLinks("/", lang),
      feedDiscoveryLink(lang),
      SITEMAP_LINK,
    ],
    jsonLd: graph,
    scripts: jsonLdScript(graph),
  };
}

/**
 * Article share tags. `name=description` and OG/Twitter descriptions use
 * the item's own English summary/dek when present; otherwise the
 * site-wide blurb. Never invents a Vietnamese description.
 *
 * The `NewsArticle` headline is the title the page actually renders for the
 * requested language (`localizedTitle`, the same call `StoryRow` paints into
 * the single `<h1>`), so the graph and the visible headline cannot drift. A
 * Vietnamese request with no `title_vi` emits the real English headline and
 * declares `inLanguage: en-US` rather than an invented translation — the
 * `en-US` on a `?lang=vi` URL is the machine-readable record of that
 * fallback, and it is a deliberate divergence from `og:locale` (which
 * describes the page chrome, not the article text).
 */
export function articleHead(
  item: {
    id: string;
    title: string;
    title_vi?: string | null;
    summary: string | null;
    image_url: string | null;
    category: string | null;
    url?: string | null;
    published_at?: number | null;
    sources?: ItemSource[] | null;
  },
  lang: Lang = "vi",
  opts: { route?: RouteIndexabilityInput } = {}
): HeadTags {
  // `storyUrl` is the one function that builds this string, and it is the same
  // one `og:url` and the canonical link carry, so the graph cannot drift.
  const url = storyUrl(item, lang);
  const title = `${item.title} | ${SITE_NAME}`;
  const summary = item.summary?.trim() ?? "";
  const description = summary || SITE_DESCRIPTION;
  const headline = localizedTitle(
    { title: item.title, title_vi: item.title_vi ?? null },
    lang
  );
  const publisher = storyPublisher(item.sources, item.url);
  const article: JsonLdNode = {
    "@type": "NewsArticle",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    headline: headline.text,
    description,
    image: {
      "@type": "ImageObject",
      url: storyCardUrl(item, lang),
      width: SITE_OG_IMAGE_WIDTH,
      height: SITE_OG_IMAGE_HEIGHT,
    },
    inLanguage: schemaLang(headline.fallbackFromEnglish ? "en" : lang),
    isPartOf: { "@type": "WebSite", "@id": SITE_WEBSITE_ID },
    ...(item.category ? { articleSection: item.category } : {}),
    ...(safeExternalUrl(item.url) && item.url !== url
      ? { isBasedOn: item.url }
      : {}),
    ...(publisher ? { publisher } : {}),
    ...storyDates(item),
  };
  const graph = indexableGraph(opts.route, () => [article]);
  return {
    meta: shareTags({
      title,
      description,
      url,
      type: "article",
      // Always the generated branded card — upstream image_urls can 404.
      // Keep the locale in the image URL so the card title/labels match the
      // story page that the crawler is sharing.
      imageUrl: storyCardUrl(item, lang),
      lang,
      siteOgDimensions: true,
    }).map((tag) =>
      "property" in tag && tag.property === "og:title"
        ? { property: "og:title", content: item.title }
        : "name" in tag && tag.name === "twitter:title"
          ? { name: "twitter:title", content: item.title }
          : tag
    ),
    links: [
      ...localizedHeadLinks(storyPath(item), lang),
      feedDiscoveryLink(lang),
      SITEMAP_LINK,
    ],
    jsonLd: graph,
    scripts: jsonLdScript(graph),
  };
}

/** A 404 publishes no structured data: it would invite indexing a dead URL. */
export function notFoundHead(documentTitle: string): HeadTags {
  return {
    meta: [
      { title: documentTitle },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [SITEMAP_LINK],
    jsonLd: [],
    scripts: [],
  };
}
