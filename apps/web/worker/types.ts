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
  /** Cheaper chain for judging translation quality. Falls back to
   *  ANYROUTER_MODEL when unset. */
  ANYROUTER_QA_MODEL?: string;
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
}
