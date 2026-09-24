export interface Env {
  /** Static files from dist/client (`[assets] binding = "ASSETS"`). */
  ASSETS?: Fetcher;
  DB: D1Database;
  NEWS_INGEST: Workflow;
  /** Singleton DO that arms an hourly alarm and coalesces ingest triggers.
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
  ANYROUTER_API_KEY: string;
  NEWS_ADMIN_TOKEN: string;
  /** Clerk secret used by /__clerk Frontend API proxy (and admin JWT verify). */
  CLERK_SECRET_KEY?: string;
  /** Clerk instance issuer (frontend API origin), e.g. "https://clerk.aidr.today".
   *  Derived from the VITE_CLERK_PUBLISHABLE_KEY domain. When set, admin
   *  Clerk-JWT verification rejects tokens whose `iss` doesn't match. */
  CLERK_ISSUER?: string;
  /** Comma-separated Clerk user ids (the token's `sub`) granted admin
   *  access, independent of any role claim. */
  NEWS_ADMIN_USER_IDS?: string;
  /** Telegram bot token for channel posting (secret). Required when
   *  TELEGRAM_CHAT_ID is set — missing token fails loud. Both unset
   *  disables the channel (local/dev). */
  TELEGRAM_BOT_TOKEN?: string;
  /** Telegram channel/chat id to post stories to, e.g. "-1004420104760". */
  TELEGRAM_CHAT_ID?: string;
  /** Optional JSON/Slack incoming webhook for the same AlertEvent fan-out. */
  NOTIFY_WEBHOOK_URL?: string;
  /** Cloudflare Email Sending binding. Optional: absent until Email Sending
   *  is onboarded for aidr.today, so all use sites must guard for it. */
  EMAIL?: SendEmail;
  /** Override digest From address (default digest@aidr.today). */
  EMAIL_FROM?: string;
  /** Override notes From address (default notes@aidr.today). */
  EMAIL_NOTES_FROM?: string;
  EMAIL_FROM_NAME?: string;
  /** HMAC secret for unsubscribe tokens. When unset, legacy UUID tokens are used. */
  NEWS_UNSUBSCRIBE_SECRET?: string;
  /** Owner address for new-subscriber pings. When unset, email ping is skipped. */
  OWNER_NOTIFY_EMAIL?: string;
}
