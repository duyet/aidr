import type { EventParams } from "./analytics/events";
import { track } from "./analytics/track";

export type SubscribeSource = EventParams<"subscribe_submit">["source"];

export const FALLBACK_TIMEZONE = "Asia/Ho_Chi_Minh";

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return FALLBACK_TIMEZONE;
  }
}

/** Maps the /api/subscribe POST statuses (worker/subscribe/handlers.ts). */
function errorReason(status: number): EventParams<"subscribe_error">["reason"] {
  if (status === 400) return "invalid";
  if (status === 429) return "rate_limited";
  return "server";
}

/** POST one signup to /api/subscribe and record submit, success and error
 *  events. Resolves true when the worker accepted it. `fields` carries the
 *  email, lang and any digest settings; source and the default timezone are
 *  added here. */
export async function postSubscribe(
  source: SubscribeSource,
  fields: { email: string; lang: string } & Record<string, unknown>
): Promise<boolean> {
  track("subscribe_submit", { source });
  try {
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ timezone: browserTimezone(), ...fields, source }),
    });
    if (res.ok) {
      track("subscribe_success", { source });
      return true;
    }
    track("subscribe_error", { source, reason: errorReason(res.status) });
  } catch {
    track("subscribe_error", { source, reason: "network" });
  }
  return false;
}
