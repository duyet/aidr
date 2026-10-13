import { useEffect } from "react";
import { afterLcpPaint } from "./after-lcp-paint";
import {
  installAnalyticsStubs,
  posthogArrayScriptUrl,
} from "./analytics-stubs";
import { resolveMeasurementId } from "./track";
import { reportWebVitals } from "./web-vitals";

export type { TrackChannel, TrackParams, TrackParamValue } from "./track";
export {
  DEFAULT_GA_MEASUREMENT_ID,
  resolveMeasurementId,
  track,
  trackChannelClick,
} from "./track";

const importMetaEnv =
  typeof import.meta !== "undefined"
    ? ((import.meta as unknown as Record<string, unknown>).env as
        | Record<string, string>
        | undefined)
    : undefined;

const GA_MEASUREMENT_ID = resolveMeasurementId(
  importMetaEnv?.VITE_MEASUREMENT_ID
);

/** PostHog loads only when the project token is configured (env, not code). */
const POSTHOG_PROJECT_TOKEN = importMetaEnv?.VITE_POSTHOG_PROJECT_TOKEN?.trim();
const POSTHOG_HOST =
  importMetaEnv?.VITE_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

const SELINE_TOKEN = importMetaEnv?.VITE_SELINE_TOKEN;

/*
 * The queue stubs go in at module init, before React hydrates, so the
 * landing page_view and one-shot campaign events PageViewTracker fires on
 * hydrate are queued rather than dropped. Only the network scripts wait
 * for the LCP paint below.
 */
installAnalyticsStubs({
  gaMeasurementId: GA_MEASUREMENT_ID,
  posthog: POSTHOG_PROJECT_TOKEN
    ? { token: POSTHOG_PROJECT_TOKEN, host: POSTHOG_HOST }
    : undefined,
});

function loadScript(
  src: string,
  attrs?: Record<string, string>
): HTMLScriptElement {
  const el = document.createElement("script");
  el.src = src;
  el.async = true;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k.startsWith("data-")) {
        el.dataset[k.slice(5)] = v;
      } else {
        el.setAttribute(k, v);
      }
    }
  }
  document.body.appendChild(el);
  return el;
}

/*
 * Every one of these is third-party script that contributes nothing to what
 * the visitor is looking at. Running them from a plain useEffect put them on
 * the same main-thread task as the LCP paint; the 2026-09-27 trace showed
 * j.duyet.net/p.js at 247 ms and gtag at 167 ms of scripting competing
 * with it. `afterLcpPaint` moves the whole set to idle
 * time after the paint.
 */
function bootstrapAnalytics(): void {
  if (GA_MEASUREMENT_ID) {
    loadScript(
      `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
    );
  }

  if (SELINE_TOKEN) {
    loadScript("https://cdn.seline.so/seline.js", {
      "data-token": SELINE_TOKEN,
    });
  }

  if (POSTHOG_PROJECT_TOKEN) {
    loadScript(posthogArrayScriptUrl(POSTHOG_HOST));
  }

  loadScript("https://j.duyet.net/p.js");
  void reportWebVitals();
}

export default function AnalyticWrapper() {
  useEffect(() => afterLcpPaint(bootstrapAnalytics), []);

  return null;
}
