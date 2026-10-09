/** Canonical public origin. Share tags, sitemap, and robots all use this. */
export const SITE_URL = "https://aidr.today";

/** Inbound contributions address (Email Routing → aidr-email Worker). */
export const SUBMIT_EMAIL = "submit@aidr.today";

/**
 * THE site name — one constant, one brand.
 *
 * Consumed by `og:site_name` (`shareTags` in `seo.ts`), the JSON-LD
 * `WebSite`/`Organization` `name` and `NewsArticle` breadcrumb root, the
 * Telegram Instant View `site_name`, and the news sitemap. If a surface needs
 * the site's name, it reads this; it never re-types the string.
 *
 * **Decision: `AI;DR`, not `AI News`.** (`docs/decisions/telegram-instant-view.md`
 * § "Required page fields" carried this as an open conflict — `site_name: null`,
 * `site_name_status: "unresolved-verify-visible-brand-in-editor"` — that record
 * is now resolved and points here.)
 *
 * Evidence (measured 2026-09-27 against production with a Googlebot UA on the
 * SSR HTML a crawler already receives):
 *
 * - The visible header wordmark on every page is `AI;DR`
 *   (`<span class="font-serif …">AI;DR</span>` in the SSR body). In the
 *   homepage HTML the string `AI News` occurs **only inside `<head>`** — title,
 *   `og:site_name`, `og:title`, `og:description`, `twitter:title` — and nowhere
 *   a reader can see. The previous value was never the on-site name.
 * - The generated per-story card `/api/og/{id}.png` paints the same `AI;DR`
 *   wordmark (`story-og.tsx`), so the image beside a link preview is branded
 *   `AI;DR` too.
 * - `/brand` documents `AI;DR` as the official mark, and the install surfaces
 *   already ship "Get AI;DR".
 * - Telegram's Instant View checklist requires `site_name` to match the name
 *   shown on the website — which is what this constant now is.
 *
 * Deliberately **not** the brand field, and intentionally untouched by this
 * decision (so a later reader does not re-open it as an inconsistency):
 *
 * - `SITE_TITLE` is the homepage *document title* ("AI News | ranked AI
 *   digest | aidr.today"), i.e. SEO copy, not the site-name field. It feeds
 *   `<title>`/`og:title`/`twitter:title`, which the SEO brief forbids changing
 *   outside the brand resolution itself.
 * - `SITE_DESCRIPTION` is prose describing what the site does.
 * - The per-route document titles ("About | AI News") and the localized 404
 *   titles in `not-found.ts` are hand-written page copy owned by those routes.
 *
 * Never append the Telegram handle, `@aihomnay`, or any other suffix: the
 * checklist asks for the name shown on the website and nothing more.
 */
export const SITE_NAME = "AI;DR";
/** Homepage document title (SEO copy). See the `SITE_NAME` note above. */
export const SITE_TITLE = "AI News | ranked AI digest | aidr.today";
export const SITE_SLOGAN = "AI news ranked and summary";
export const SITE_DESCRIPTION =
  "AI News (aidr.today) ranks AI stories every 30 minutes from HN, HuggingNews, and more. LLM-scored AI;DR digest in English and Vietnamese — every item links to the source.";

/**
 * Brand mark, used as the JSON-LD `Organization.logo`. `public/logo-sm.png`
 * is served Worker-first (`wrangler.toml` `run_worker_first`), so the URL is
 * a real PNG response rather than the SPA HTML shell. 1:1, no crop.
 */
export const SITE_LOGO_PATH = "/logo-sm.png";
export const SITE_LOGO_URL = `${SITE_URL}${SITE_LOGO_PATH}`;

/** Default Open Graph / Twitter share image (1200×630, editorial brand). */
export const SITE_OG_IMAGE_PATH = "/og.jpg";
export const SITE_OG_IMAGE_URL = `${SITE_URL}${SITE_OG_IMAGE_PATH}`;
/** Homepage-only OG variant (masthead design). */
export const SITE_OG_HOME_IMAGE_PATH = "/og-home.jpg";
export const SITE_OG_HOME_IMAGE_URL = `${SITE_URL}${SITE_OG_HOME_IMAGE_PATH}`;
export const SITE_OG_IMAGE_WIDTH = 1200;
export const SITE_OG_IMAGE_HEIGHT = 630;

/** Public Vietnamese Telegram channel for digests / alerts. */
export const TELEGRAM_URL = "https://t.me/aihomnay";
export const TELEGRAM_HANDLE = "@aihomnay";
/** Public English Telegram channel. */
export const TELEGRAM_EN_URL = "https://t.me/aidr_today";
export const TELEGRAM_EN_HANDLE = "@aidr_today";

/** Public Facebook Page. Lives here beside the Telegram URLs so the header
 *  menu, the footer, and any future share surface cannot drift apart. */
export const FACEBOOK_URL = "https://www.facebook.com/aidr.today/";

/** Public GitHub repository. */
export const GITHUB_URL = "https://github.com/duyet/aidr";
/** Canonical ranking/ingest pipeline doc (not the old monorepo apps/news path). */
export const GITHUB_ALGORITHM_URL = `${GITHUB_URL}/blob/master/apps/web/ALGORITHM.md`;
export const GITHUB_ALGORITHM_PATH = "apps/web/ALGORITHM.md";

/** Author site (footer More). */
export const DUYET_URL = "https://duyet.net";

/** AnyRouter gateway. The `ref` param is the partner attribution link, so it
 *  lives here once: the footer, the /data attribution strip, the Algo tab, and
 *  /about all send readers to the same credited URL, and a per-surface copy
 *  would let the referral silently drop off one of them. */
export const ANYROUTER_URL = "https://anyrouter.dev/?ref=aidr.today";

/** Chrome Web Store listing — install CTA on /subscribe only, never header chrome. */
export const CHROME_WEB_STORE_URL =
  "https://chromewebstore.google.com/detail/aidr/cagjehdlblcobkghgbbilnpefelbmpcg";
/** In-app destination for the Chrome icon (install guide lives at /subscribe). */
export const EXTENSION_PATH = "/subscribe";
export const EXTENSION_URL = `${SITE_URL}${EXTENSION_PATH}`;

/**
 * Public syndication paths. These live here, not in the server-only builders,
 * so client components (/subscribe) and the Worker routes cannot drift on the
 * canonical URL. `/rss.xml` serves the identical document for readers that
 * hardcode it; `atom:link rel="self"` always advertises `/feed.xml`.
 */
export const RSS_FEED_PATH = "/feed.xml";
export const RSS_ALIAS_PATH = "/rss.xml";
/** Google News sitemap (`news:` namespace); language-neutral by design. */
export const NEWS_SITEMAP_PATH = "/news.xml";
