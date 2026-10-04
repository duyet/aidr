export interface Env {
  /** Static files from dist/client (`[assets] binding = "ASSETS"`). */
  ASSETS?: Fetcher;
  DB: D1Database;
  /** Rendered OG PNGs, the shared tier behind the edge cache. */
  OG_CACHE?: R2Bucket;
  /** Cloudflare Images: WebP → JPEG for OG photos the renderer cannot draw. */
  IMAGES?: ImagesBinding;
  NEWS_INGEST: Workflow;
  /** Singleton DO that arms a 30-minute alarm and coalesces ingest triggers.
   *  Optional so node tests can omit it; production wrangler always binds it. */
  NEWS_INGEST_SCHEDULER?: DurableObjectNamespace;
  ANYROUTER_BASE_URL: string;
  /** One model id, or a comma-separated fallback chain tried in order. */
  ANYROUTER_MODEL: string;
  /** Per-task overrides, same comma-separated semantics as ANYROUTER_MODEL.
   *  Fall back to ANYROUTER_MODEL when unset. */
  ANYROUTER_TRANSLATE_MODEL?: string;
  ANYROUTER_TLDR_MODEL?: string;
  /** Explicit generator chain for creating a real VI→EN candidate. */
  ANYROUTER_ENGLISH_TRANSLATE_MODEL?: string;
  /** Explicit independent reviewer chain for translation semantic QA. Missing
   *  or overlapping generator ids fail closed; never fall back to the generator. */
  ANYROUTER_REVIEW_MODEL?: string;
  /** Legacy translation-QA chain. Still honored when no review chain is set,
   *  but it never falls back to ANYROUTER_MODEL and must be model-independent. */
  ANYROUTER_QA_MODEL?: string;
  /** Jev System One model id (POST /api/v1/systemone — never a
   *  /chat/completions chain member). Score and review gates try it first;
   *  the chat chain is the backup. Defaults to typesafe/jev. The TypeSafe
   *  BYOK key lives in the AnyRouter dashboard, not in env. */
  ANYROUTER_JEV_MODEL?: string;
  ANYROUTER_DECISION_MODEL?: string;
  /** Master switch for the JEV review panel on the scoring path (#203). Unset
   *  or falsy keeps the pre-existing single-score behavior byte for byte. */
  JEV_PANEL_ENABLED?: string;
  /** Comma-separated model chain for the panel's `relevance` judge. Only the
   *  first id can produce a counted vote: a fallback to another model is an
   *  identity mismatch by design, never a second copy of the same opinion. */
  JEV_PANEL_RELEVANCE_MODEL?: string;
  /** Same, for the panel's `source_quality` judge. The two chains must name
   *  different models from different vendor families, or the panel is refused
   *  before any judge runs. */
  JEV_PANEL_SOURCE_QUALITY_MODEL?: string;
  /** Optional third scoring judge; a required seat on a translation panel.
   *  Must be a model distinct from every other seat. */
  JEV_PANEL_SAFETY_MODEL?: string;
  /** Model chain for the `translation_fidelity` judge. Only a translation
   *  panel seats it; the scoring panel ignores it. */
  JEV_PANEL_TRANSLATION_FIDELITY_MODEL?: string;
  /** Non-abstain valid votes required for a panel recommendation. Clamped to
   *  the judge's count. */
  JEV_PANEL_QUORUM?: string;
  /** "1" enables the single bounded cross-examination round. "0"/unset is
   *  the initial round only. The core caps debate at one replacement round. */
  JEV_PANEL_DEBATE?: string;
  /** What happens to an item the panel could not decide. "open" (default)
   *  keeps the primary score; "closed" forces relevance to 0. An unusable
   *  config always degrades open so a typo cannot reject a run. */
  JEV_PANEL_FAIL_MODE?: string;
  /** Wall-clock budget for one item's whole panel, all rounds included. */
  JEV_PANEL_BUDGET_MS?: string;
  /** "1" lets an unambiguous panel category replace the primary category.
   *  Off by default: unlike the relevance ceiling, a category is not
   *  monotonic, so a replay can churn it. */
  JEV_PANEL_APPLY_CATEGORY?: string;
  ANYROUTER_API_KEY: string;
  NEWS_ADMIN_TOKEN: string;
  /** Clerk secret used by /__clerk Frontend API proxy (and admin JWT verify). */
  CLERK_SECRET_KEY?: string;
  /** Absolute HTTPS public URL serving the Clerk proxy; set per environment.
   *  HTTP is allowed only for explicit loopback development. */
  CLERK_PROXY_URL?: string;
  /** Upstream fetch/body timeout in milliseconds (bounded by the handler). */
  CLERK_PROXY_TIMEOUT_MS?: string;
  /** Svix signing secret for POST /api/webhooks/clerk (Clerk Dashboard →
   *  Webhooks → Signing Secret, "whsec_…"). Without it the route fails
   *  closed with 503 rather than accepting unsigned user events. */
  CLERK_WEBHOOK_SECRET?: string;
  /** Clerk instance issuer (frontend API origin), e.g. "https://clerk.aidr.today".
   *  Derived from the VITE_CLERK_PUBLISHABLE_KEY domain. When set, admin
   *  Clerk-JWT verification rejects tokens whose `iss` doesn't match. */
  CLERK_ISSUER?: string;
  /** Comma-separated Clerk user ids (the token's `sub`) granted admin
   *  access, independent of any role claim. */
  NEWS_ADMIN_USER_IDS?: string;
  /** Telegram bot token for channel posting (secret). Required when a
   *  chat id is set — missing token fails loud. All unset disables the
   *  channels (local/dev). */
  TELEGRAM_BOT_TOKEN?: string;
  /** Vietnamese broadcast chat id. Replaces TELEGRAM_CHAT_ID. */
  TELEGRAM_VI_CHAT_ID?: string;
  /** English broadcast chat id, e.g. "@aidr_today". */
  TELEGRAM_EN_CHAT_ID?: string;
  /** @deprecated Read only when TELEGRAM_VI_CHAT_ID is unset. */
  TELEGRAM_CHAT_ID?: string;
  /** Optional JSON/Slack incoming webhook for the same AlertEvent fan-out. */
  NOTIFY_WEBHOOK_URL?: string;
  /** Page id for this install. Worker secret from .env.local. The channel
   *  stays off until this and FACEBOOK_PAGE_ACCESS_TOKEN are both set. */
  FACEBOOK_PAGE_ID?: string;
  /** Never-expiring Page access token from a long-lived user token, with
   *  pages_manage_posts, pages_read_engagement, and pages_show_list.
   *  Worker secret. Never logged. */
  FACEBOOK_PAGE_ACCESS_TOKEN?: string;
  /** Public Meta app id. Used with FACEBOOK_APP_SECRET to mint a new Page
   *  token. An app token cannot publish by itself. */
  FACEBOOK_APP_ID?: string;
  /** Worker secret. Never logged. Not used on the hourly post. */
  FACEBOOK_APP_SECRET?: string;
  /** Graph version for this install, for example v26.0. Unset uses v26.0. */
  FACEBOOK_GRAPH_VERSION?: string;
  /** Public origin of the links this Page posts. Unset uses SITE_URL. */
  SITE_URL?: string;
  /** Threads user id. Empty leaves the channel off. Not a wrangler var:
   *  nothing here is a committed id, and the notifier is not registered. */
  THREADS_USER_ID?: string;
  /** Threads user token (`threads_basic`, `threads_content_publish`).
   *  Empty leaves the channel off. This repo does not mint or refresh it. */
  THREADS_ACCESS_TOKEN?: string;
  /** Cloudflare Email Sending binding. Optional: absent until Email Sending
   *  is onboarded for aidr.today, so all use sites must guard for it. */
  EMAIL?: SendEmail;
  /** Override digest From address (default digest@aidr.today). */
  EMAIL_FROM?: string;
  /** Override notes From address (default notes@aidr.today). */
  EMAIL_NOTES_FROM?: string;
  EMAIL_FROM_NAME?: string;
  /** Override digest Reply-To. Unset: submit@aidr.today. */
  EMAIL_REPLY_TO?: string;
  /** HMAC secret for unsubscribe tokens. When unset, legacy UUID tokens are used. */
  NEWS_UNSUBSCRIBE_SECRET?: string;
  /** Owner address for new-subscriber pings. When unset, email ping is skipped. */
  OWNER_NOTIFY_EMAIL?: string;
  /** GA4 property id for the /data Audience tab (public config, not a secret).
   *  Accepts `123456` or `properties/123456`. */
  GA4_PROPERTY_ID?: string;
  /** Whole service-account key file, JSON-encoded, as a Worker secret. It is
   *  only ever used to sign a short-lived read-only assertion — the raw JSON
   *  is never logged, echoed, or returned by an endpoint. */
  GA4_SERVICE_ACCOUNT_JSON?: string;
  /** Sentry-compatible Bugsink DSN. Delivery failures are reported when set.
   *  A missing value skips the alert and never fails the pipeline. */
  SENTRY_DSN?: string;
  /** Owner's private chat id for health DMs (uses TELEGRAM_BOT_TOKEN). Unset: no DMs. */
  TELEGRAM_OWNER_CHAT_ID?: string;
  /** Fine-grained PAT (issues:write on duyet/aidr, duyet/anyrouter) for alert issues. Unset: no issues. */
  GITHUB_ALERT_TOKEN?: string;
}
