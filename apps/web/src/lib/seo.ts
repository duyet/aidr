import { withLang } from "./locale-url";
import {
  type RouteIndexabilityInput,
  routeIndexability,
} from "./route-indexability";
import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_OG_HOME_IMAGE_URL,
  SITE_OG_IMAGE_HEIGHT,
  SITE_OG_IMAGE_URL,
  SITE_OG_IMAGE_WIDTH,
  SITE_TITLE,
  SITE_URL,
} from "./site";
import { storyPath } from "./slug";
import type { Lang } from "./types";

export type HeadMeta =
  | { title: string }
  | { name: string; content: string }
  | { property: string; content: string };

export interface HeadLink {
  rel: string;
  href: string;
  type?: string;
  hrefLang?: string;
}

export interface HeadTags {
  meta: HeadMeta[];
  links: HeadLink[];
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

/** Marketing/static page share tags. Each URL must canonical to itself. */
export function pageHead(opts: {
  path: string;
  title: string;
  description?: string;
  imageUrl?: string;
  lang?: Lang;
}): HeadTags {
  const url = canonicalUrl(opts.path);
  const description = opts.description ?? SITE_DESCRIPTION;
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
    links: [...localizedHeadLinks(opts.path, opts.lang), SITEMAP_LINK],
  };
}

/** Homepage Open Graph / Twitter / canonical + hreflang tags. */
export function homepageHead(lang: Lang = "vi"): HeadTags {
  const head = pageHead({
    path: withLang("/", lang),
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    imageUrl: SITE_OG_HOME_IMAGE_URL,
    lang,
  });
  return {
    ...head,
    links: [...localizedHeadLinks("/", lang), SITEMAP_LINK],
  };
}

/**
 * Article share tags. `name=description` and OG/Twitter descriptions use
 * the item's own English summary/dek when present; otherwise the
 * site-wide blurb. Never invents a Vietnamese description.
 */
export function articleHead(
  item: {
    id: string;
    title: string;
    summary: string | null;
    image_url: string | null;
    category: string | null;
  },
  lang: Lang = "vi"
): HeadTags {
  const path = storyPath(item, lang);
  const url = `${SITE_URL}${path}`;
  const title = `${item.title} | ${SITE_NAME}`;
  const summary = item.summary?.trim() ?? "";
  const description = summary || SITE_DESCRIPTION;
  return {
    meta: shareTags({
      title,
      description,
      url,
      type: "article",
      // Always the generated branded card — upstream image_urls can 404.
      // Keep the locale in the image URL so the card title/labels match the
      // story page that the crawler is sharing.
      imageUrl: `${SITE_URL}${withLang(`/api/og/${item.id}.png`, lang)}`,
      lang,
      siteOgDimensions: true,
    }).map((tag) =>
      "property" in tag && tag.property === "og:title"
        ? { property: "og:title", content: item.title }
        : "name" in tag && tag.name === "twitter:title"
          ? { name: "twitter:title", content: item.title }
          : tag
    ),
    links: [...localizedHeadLinks(storyPath(item), lang), SITEMAP_LINK],
  };
}

export function notFoundHead(documentTitle: string): HeadTags {
  return {
    meta: [
      { title: documentTitle },
      { name: "robots", content: "noindex, follow" },
    ],
    links: [SITEMAP_LINK],
  };
}
