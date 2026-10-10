import { DEFAULT_LANG } from "../../src/lib/lang.js";
import { withSiteLang } from "../../src/lib/locale-url.js";
import type { Lang } from "../../src/lib/types.js";

/** UTM + locale tags for aidr.today links in outgoing mail. */

export type MailUtmKind = "digest" | "welcome" | "notes";

export interface MailUtmOptions {
  /** `utm_content`: which link in the mail was clicked (lead, s2, cta, …). */
  content?: string;
  /** Tag a non-aidr.today link too (YouTube, Telegram, Chrome Web Store).
   *  The locale param is still only added to aidr.today links. */
  external?: boolean;
}

export function withMailUtm(
  url: string,
  kind: MailUtmKind,
  lang: Lang = DEFAULT_LANG,
  opts: MailUtmOptions = {}
): string {
  try {
    const localized = withSiteLang(url, lang);
    const u = new URL(localized);
    const host = u.hostname.toLowerCase();
    const own = host === "aidr.today" || host === "www.aidr.today";
    if (!own && !opts.external) return url;
    if (u.protocol !== "https:" && u.protocol !== "http:") return url;
    u.searchParams.set("utm_source", "email");
    u.searchParams.set("utm_medium", kind);
    u.searchParams.set("utm_campaign", kind);
    if (opts.content) u.searchParams.set("utm_content", opts.content);
    return u.toString();
  } catch {
    return url;
  }
}
