import { DEFAULT_LANG } from "../../src/lib/lang.js";
import { withSiteLang } from "../../src/lib/locale-url.js";
import type { Lang } from "../../src/lib/types.js";
import { withUtm } from "../utm.js";

/** UTM + locale tags for aidr.today links in outgoing mail. */

export type MailUtmKind = "digest" | "welcome" | "notes";

export interface MailUtmOptions {
  /** `utm_content`: which link in the mail was clicked (lead, s2, cta, …). */
  content?: string;
  /** `utm_campaign`: the edition (`digest-2026-10-14`). Defaults to `kind`. */
  campaign?: string;
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
  return withUtm(
    withSiteLang(url, lang),
    {
      source: "email",
      medium: kind,
      campaign: opts.campaign ?? kind,
      content: opts.content,
    },
    { external: opts.external }
  );
}
