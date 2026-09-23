/** Canonical public origin. Share tags, sitemap, and robots all use this. */
export const SITE_URL = "https://aidr.today";
export const SITE_NAME = "AI News";
export const SITE_TITLE = "AI News | ranked AI digest | aidr.today";
export const SITE_SLOGAN = "AI news ranked and summary";
export const SITE_DESCRIPTION =
  "AI News (aidr.today) ranks AI stories hourly from HN, HuggingNews, and more. LLM-scored AI;DR digest in English and Vietnamese — every item links to the source.";

/** Default Open Graph / Twitter share image (1200×630, editorial brand). */
export const SITE_OG_IMAGE_PATH = "/og.jpg";
export const SITE_OG_IMAGE_URL = `${SITE_URL}${SITE_OG_IMAGE_PATH}`;
/** Homepage-only OG variant (masthead design). */
export const SITE_OG_HOME_IMAGE_PATH = "/og-home.jpg";
export const SITE_OG_HOME_IMAGE_URL = `${SITE_URL}${SITE_OG_HOME_IMAGE_PATH}`;
export const SITE_OG_IMAGE_WIDTH = 1200;
export const SITE_OG_IMAGE_HEIGHT = 630;

/** Public Telegram channel for digests / alerts. */
export const TELEGRAM_URL = "https://t.me/aihomnay";
export const TELEGRAM_HANDLE = "@aihomnay";

/** Public GitHub repository. */
export const GITHUB_URL = "https://github.com/duyet/aidr";
/** Canonical ranking/ingest pipeline doc (not the old monorepo apps/news path). */
export const GITHUB_ALGORITHM_URL = `${GITHUB_URL}/blob/master/apps/web/ALGORITHM.md`;
export const GITHUB_ALGORITHM_PATH = "apps/web/ALGORITHM.md";

/** Author site (footer More). */
export const DUYET_URL = "https://duyet.net";

/** Chrome Web Store listing — install CTA on /subscribe only, never header chrome. */
export const CHROME_WEB_STORE_URL =
  "https://chromewebstore.google.com/detail/aidr/cagjehdlblcobkghgbbilnpefelbmpcg";
/** In-app destination for the Chrome icon (install guide lives at /subscribe). */
export const EXTENSION_PATH = "/subscribe";
export const EXTENSION_URL = `${SITE_URL}${EXTENSION_PATH}`;
