import { useEffect } from "react";
import { afterLcpPaint } from "./after-lcp-paint";
import { GA_MEASUREMENT_ID } from "./measurement-id";
import { installAnalyticsStubs, posthogArrayScriptUrl } from "./stubs";
import { sanitizedPage } from "./url-privacy";
import { reportWebVitals } from "./web-vitals";

const importMetaEnv =
  typeof import.meta !== "undefined"
    ? ((import.meta as unknown as Record<string, unknown>).env as
        | Record<string, string>
        | undefined)
    : undefined;

/** PostHog loads only when the project token is configured (env, not code). */
const POSTHOG_PROJECT_TOKEN = importMetaEnv?.VITE_POSTHOG_PROJECT_TOKEN?.trim();
const POSTHOG_HOST =
  importMetaEnv?.VITE_POSTHOG_HOST?.trim() || "https://us.i.posthog.com";

const SELINE_TOKEN = importMetaEnv?.VITE_SELINE_TOKEN;

/*
 * The queue stubs go in at module init, before React hydrates, so the
 * channel_landing and page_view PageViewTracker fires on hydrate are
 * queued rather than dropped. Only the network scripts wait
 * for the LCP paint below.
 */
installAnalyticsStubs({
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
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  }
  document.body.appendChild(el);
  return el;
}

type JitsuWindow = Window & {
  jitsuQ?: ((jitsu: { page: (properties: object) => void }) => void)[];
};

/*
 * p.js reads location.href for its automatic page event, so that event is
 * off (`data-init-only`) and the page event goes through its callback queue
 * with a sanitized URL instead. `context.page` is set as well: p.js fills it
 * from `properties.search || location.search`, so an empty sanitized search
 * on its own would fall back to the real one.
 */
function loadJitsu(): void {
  const w = window as JitsuWindow;
  w.jitsuQ = w.jitsuQ || [];
  w.jitsuQ.push((jitsu) => {
    const { url, path, search, referrer } = sanitizedPage();
    jitsu.page({
      url,
      path,
      search,
      hash: "",
      referrer,
      context: { page: { url, path, search, referrer } },
    });
  });
  loadScript("https://j.duyet.net/p.js", { "data-init-only": "true" });
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
  loadScript(
    `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
  );

  if (SELINE_TOKEN) {
    loadScript("https://cdn.seline.so/seline.js", {
      "data-token": SELINE_TOKEN,
    });
  }

  if (POSTHOG_PROJECT_TOKEN) {
    loadScript(posthogArrayScriptUrl(POSTHOG_HOST));
  }

  loadJitsu();
  void reportWebVitals();
}

export default function AnalyticWrapper() {
  useEffect(() => afterLcpPaint(bootstrapAnalytics), []);

  return null;
}
