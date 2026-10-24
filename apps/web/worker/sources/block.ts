const CHALLENGE_BODY =
  /just a moment|attention required|cf-chl|verify you are human|captcha/i;

/**
 * Why a source host refused the Worker, or null for an ordinary error.
 * A refusal is a status the host uses to say "not you" (401, 403, 451, 429) or
 * a Cloudflare challenge, which answers with a status that looks normal (a 200
 * HTML page) and would otherwise read as an empty or unparseable feed.
 * `body` is only read for an HTML answer, and only its first 4 KB.
 */
export function blockedBy(
  status: number,
  headers: Headers,
  body = ""
): string | null {
  if (headers.get("cf-mitigated")) return "Cloudflare challenge";
  if (status === 429) return "rate limited";
  // GitHub answers an exhausted quota with 403 and `x-ratelimit-remaining: 0`.
  if (status === 403 && headers.get("x-ratelimit-remaining") === "0")
    return "rate limited";
  if (status === 401 || status === 403 || status === 451)
    return "access refused";
  const html = (headers.get("content-type") ?? "")
    .toLowerCase()
    .includes("html");
  if (html && CHALLENGE_BODY.test(body.slice(0, 4096))) return "challenge page";
  return null;
}
