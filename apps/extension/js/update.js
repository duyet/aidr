import "./preview-shim.js";
import { withExtRef } from "./ref.js";
import { normalizeApiBase } from "./settings.js";

export function extensionMetaUrl(apiBase) {
  return `${normalizeApiBase(apiBase)}/api/extension`;
}

/** Compare x.y.z only. Returns true when remote is strictly newer. */
export function isNewerVersion(remote, local) {
  const a = parseVersion(remote);
  const b = parseVersion(local);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return false;
}

export function parseVersion(value) {
  const match = String(value ?? "")
    .trim()
    .match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Chrome Web Store sets update_url to Google's update service.
 * Unpacked / sideload installs have no update_url — Chrome will not
 * auto-update those. Do not add a custom update_url; CWS rejects it.
 */
export function isChromeWebStoreInstall(manifest) {
  const url = manifest?.update_url;
  return typeof url === "string" && /google\.com/i.test(url);
}

export function installedVersion() {
  try {
    return globalThis.chrome?.runtime?.getManifest?.()?.version || "";
  } catch {
    return "";
  }
}

const FETCH_MS = 8000;

export async function fetchExtensionMeta(apiBase) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_MS);
  try {
    const response = await fetch(
      withExtRef(extensionMetaUrl(apiBase), "update_check"),
      {
        credentials: "omit",
        signal: controller.signal,
      }
    );
    if (!response.ok) throw new Error(`http ${response.status}`);
    const body = await response.json();
    if (!body || typeof body !== "object") throw new Error("not json");
    return body;
  } finally {
    clearTimeout(timer);
  }
}

/** CWS installs: apply a downloaded update as soon as Chrome has it. */
export function watchStoreUpdates() {
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.onUpdateAvailable) return;
  runtime.onUpdateAvailable.addListener(() => {
    runtime.reload();
  });
  try {
    runtime.requestUpdateCheck?.(() => {});
  } catch {
    // ignore — unpacked installs have nothing to check
  }
}
