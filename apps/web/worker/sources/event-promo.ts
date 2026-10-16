import type { FetchedItem } from "./types.js";

const SALE_WORD =
  /\b(?:save|savings|deals?|off|discounts?|early[- ]?bird|early booking|last chance|final chance|lock in|pay more|prices? (?:rise|go up)|secure your)\b/i;
const PASS_WORD = /\b(?:passes|pass|tickets?)\b/i;
const EXHIBIT = /\bexhibit(?:ing)? at\b/i;
const COUNTDOWN =
  /^\d+\s+(?:days?|hours?)\s+to\s+(?:techcrunch\s+)?(?:disrupt|founder summit|sessions|startup battlefield)\b/i;

function isTechCrunch(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "techcrunch.com" || host.endsWith(".techcrunch.com");
  } catch {
    return false;
  }
}

/** Ticket, pass and booth sales for a TechCrunch event, and its countdown
 *  posts. Scoped to techcrunch.com URLs: the same words in other outlets
 *  ("Tesla Registers 43 Cybercabs", "One Way Tickets to Saudi Arabia")
 *  are news. Speaker, agenda and recap posts pass: some announce a lab's
 *  news. */
export function isEventPromo(
  item: Pick<FetchedItem, "title" | "url">
): boolean {
  if (!isTechCrunch(item.url)) return false;
  if (new URL(item.url).pathname.startsWith("/events/")) return true;
  const { title } = item;
  return (
    (PASS_WORD.test(title) && SALE_WORD.test(title)) ||
    EXHIBIT.test(title) ||
    COUNTDOWN.test(title)
  );
}
