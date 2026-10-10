/**
 * MV3 service worker: keeps the saved digest warm so a new tab paints from
 * chrome.storage with no network call. Uses the existing aidr.today host
 * permission; the only new permission is `alarms` (no install warning).
 */
import { prefetchDigest } from "./api.js";
import { uiLang } from "./i18n.js";
import { loadSettings } from "./settings.js";

export const PREFETCH_ALARM = "aidr-prefetch";
/** Matches the pipeline's 30-minute publish cadence. */
export const PREFETCH_PERIOD_MIN = 30;

export async function prefetchForSettings() {
  const settings = await loadSettings();
  try {
    return await prefetchDigest(settings.apiBase, uiLang(settings));
  } catch {
    return false; // offline; the next alarm or new tab retries
  }
}

export function ensurePrefetchAlarm(alarms = globalThis.chrome?.alarms) {
  // create() with the same name replaces the alarm, so this is idempotent.
  alarms?.create(PREFETCH_ALARM, {
    delayInMinutes: 1,
    periodInMinutes: PREFETCH_PERIOD_MIN,
  });
}

const runtime = globalThis.chrome?.runtime;
if (runtime?.onInstalled) {
  runtime.onInstalled.addListener(() => ensurePrefetchAlarm());
  runtime.onStartup.addListener(() => ensurePrefetchAlarm());
  globalThis.chrome.alarms?.onAlarm.addListener((alarm) => {
    if (alarm.name === PREFETCH_ALARM) void prefetchForSettings();
  });
}
