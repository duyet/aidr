import { DEFAULT_LANG } from "../../src/lib/lang.js";
import { withSiteLang } from "../../src/lib/locale-url.js";
import type { Lang } from "../../src/lib/types.js";

/** UTM + locale tags for aidr.today links in outgoing mail. */

export type MailUtmKind = "digest" | "welcome" | "notes";

export function withMailUtm(
  url: string,
  kind: MailUtmKind,
  lang: Lang = DEFAULT_LANG
): string {
  try {
    const localized = withSiteLang(url, lang);
    const u = new URL(localized);
    const host = u.hostname.toLowerCase();
    if (host !== "aidr.today" && host !== "www.aidr.today") return url;
    u.searchParams.set("utm_source", "email");
    u.searchParams.set("utm_medium", kind);
    u.searchParams.set("utm_campaign", kind);
    return u.toString();
  } catch {
    return url;
  }
}
