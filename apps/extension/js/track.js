/**
 * Best-effort telemetry using existing aidr.today endpoints + campaign params.
 * No analytics SDK (privacy policy). Events show up as GETs to /api/extension
 * with the same ref/utm tags website GA uses on extension landings.
 */
import { withExtRef } from "./ref.js";
import { normalizeApiBase } from "./settings.js";

const EVENT_NAME_RE = /^[a-z][a-z0-9_]{0,39}$/;

function token(value) {
  if (value == null || value === false) return "";
  if (value === true) return "1";
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, "")
    .slice(0, 32);
}

/** utm_content slug for a track event (matches web event names). */
export function trackContent(name, params = {}) {
  const bits = [name, params.source, params.pref, params.to, params.stale]
    .map(token)
    .filter(Boolean);
  return bits.join("_").slice(0, 64) || name;
}

export function trackUrl(apiBase, name, params = {}) {
  const base = normalizeApiBase(apiBase);
  return withExtRef(`${base}/api/extension`, trackContent(name, params));
}

/**
 * Fire-and-forget GET. Never throws. Noops on invalid names.
 * @param {string} name
 * @param {Record<string, unknown>} [params]
 * @param {string} [apiBase]
 */
export function track(name, params = {}, apiBase) {
  try {
    if (!EVENT_NAME_RE.test(name)) return;
    const url = trackUrl(apiBase, name, params);
    const fetchImpl = globalThis.fetch;
    if (typeof fetchImpl !== "function") return;
    void fetchImpl(url, { credentials: "omit", keepalive: true, method: "GET" });
  } catch {
    // never break the new tab
  }
}
