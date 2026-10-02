/**
 * Mail we must never act on: bounces, auto-replies, list traffic and anything
 * from our own domain. Acting on any of these risks a mail loop.
 */

const SYSTEM_LOCAL_PARTS =
  /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounces?|abuse)([+-].*)?$/i;
const OWN_DOMAIN = /@(?:[a-z0-9-]+\.)*aidr\.today$/i;

export function isAutomatedMail(
  envelopeFrom: string,
  header: (name: string) => string | null
): boolean {
  const from = envelopeFrom.trim().toLowerCase();
  if (!from || from === "<>") return true;
  if (OWN_DOMAIN.test(from)) return true;
  if (SYSTEM_LOCAL_PARTS.test(from.split("@")[0] ?? "")) return true;

  const autoSubmitted = header("auto-submitted")?.trim().toLowerCase();
  if (autoSubmitted && autoSubmitted !== "no") return true;
  const precedence = header("precedence")?.trim().toLowerCase();
  if (precedence && /^(bulk|list|junk|auto_reply)$/.test(precedence)) {
    return true;
  }
  for (const name of [
    "list-id",
    "list-unsubscribe",
    "x-autoreply",
    "x-autorespond",
    "x-auto-response-suppress",
  ]) {
    if (header(name)) return true;
  }
  const contentType = header("content-type")?.toLowerCase() ?? "";
  return contentType.startsWith("multipart/report");
}
