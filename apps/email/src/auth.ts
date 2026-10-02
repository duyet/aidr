/**
 * Sender authentication. Email Routing rejects mail that fails both SPF and
 * DKIM, but a sender can DKIM-sign with their own domain and spoof `From:`
 * at any domain whose DMARC policy is `p=none` (gmail.com is). So we require
 * the header From domain to be aligned with a pass in Cloudflare's own
 * Authentication-Results. Fail closed on anything missing.
 */

/** authserv-id Cloudflare Email Routing writes. Verify against a real
 *  message before launch (docs/decisions/email-contributions.md). */
export const CLOUDFLARE_AUTHSERV = /(^|\.)(cloudflare\.net|cloudflare\.com)$/i;

export interface MailHeader {
  key: string;
  value: string;
}

export interface AuthResults {
  dkim: Array<{ result: string; domain: string | null }>;
  spf: { result: string; mailfromDomain: string | null } | null;
  dmarc: string | null;
}

export function domainOf(address: string): string | null {
  const at = address.lastIndexOf("@");
  if (at < 0) return null;
  const domain = address
    .slice(at + 1)
    .trim()
    .toLowerCase();
  return domain || null;
}

/** Parses one Authentication-Results value (RFC 8601), loosely. */
export function parseAuthResults(value: string): {
  authserv: string;
  results: AuthResults;
} {
  const unfolded = value.replace(/\r?\n[ \t]+/g, " ").replace(/\([^)]*\)/g, "");
  const parts = unfolded.split(";").map((part) => part.trim());
  const authserv = (parts.shift() ?? "").split(/\s+/)[0]?.toLowerCase() ?? "";
  const results: AuthResults = { dkim: [], spf: null, dmarc: null };
  for (const part of parts) {
    const method = part.match(/^(dkim|spf|dmarc)\s*=\s*([a-z]+)/i);
    if (!method) continue;
    const name = method[1].toLowerCase();
    const result = method[2].toLowerCase();
    const prop = (key: string) =>
      part
        .match(
          new RegExp(`${key.replace(".", "\\.")}\\s*=\\s*"?([^\\s";]+)`, "i")
        )?.[1]
        ?.toLowerCase() ?? null;
    if (name === "dkim") {
      results.dkim.push({ result, domain: prop("header.d") });
    } else if (name === "spf") {
      const mailfrom = prop("smtp.mailfrom");
      results.spf = {
        result,
        mailfromDomain: mailfrom
          ? mailfrom.includes("@")
            ? domainOf(mailfrom)
            : mailfrom
          : null,
      };
    } else {
      results.dmarc = result;
    }
  }
  return { authserv, results };
}

/** Relaxed alignment: equal, or one is a subdomain of the other. */
function aligned(a: string, b: string): boolean {
  return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
}

/**
 * True when Cloudflare's Authentication-Results header shows a pass aligned
 * with `fromAddress`. Headers are in message order (topmost first). Only
 * headers above the first `Received:` count: every relay prepends a
 * Received line, so anything below it (including an Authentication-Results
 * the sender wrote with Cloudflare's authserv-id) came from upstream.
 */
export function isAuthenticatedSender(
  headers: MailHeader[],
  fromAddress: string
): boolean {
  const fromDomain = domainOf(fromAddress);
  if (!fromDomain) return false;
  let parsed: ReturnType<typeof parseAuthResults> | null = null;
  for (const entry of headers) {
    const key = entry.key.toLowerCase();
    if (key === "received") break;
    if (key !== "authentication-results") continue;
    const candidate = parseAuthResults(entry.value);
    if (CLOUDFLARE_AUTHSERV.test(candidate.authserv)) {
      parsed = candidate;
      break;
    }
  }
  if (!parsed) return false;
  const { results } = parsed;
  if (results.dmarc === "fail") return false;
  const dkimOk = results.dkim.some(
    (entry) =>
      entry.result === "pass" &&
      entry.domain !== null &&
      aligned(entry.domain, fromDomain)
  );
  const spfOk =
    results.spf?.result === "pass" &&
    results.spf.mailfromDomain !== null &&
    aligned(results.spf.mailfromDomain, fromDomain);
  return dkimOk || spfOk;
}
