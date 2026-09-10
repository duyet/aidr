/** UTM tags for aidr.today links in outgoing mail. External hosts unchanged. */

export type MailUtmKind = "digest" | "welcome" | "notes";

export function withMailUtm(url: string, kind: MailUtmKind): string {
  try {
    const u = new URL(url);
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
