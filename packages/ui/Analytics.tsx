import { useEffect } from "react";
import { afterLcpPaint } from "./after-lcp-paint";
import { resolveMeasurementId } from "./track";

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

const POSTHOG_API_KEY = importMetaEnv?.VITE_POSTHOG_KEY;

const SELINE_TOKEN = importMetaEnv?.VITE_SELINE_TOKEN;

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

function loadInlineScript(code: string): HTMLScriptElement {
  const el = document.createElement("script");
  el.textContent = code;
  document.body.appendChild(el);
  return el;
}

/*
 * Every one of these is third-party script that contributes nothing to what
 * the visitor is looking at. Running them from a plain useEffect put them on
 * the same main-thread task as the LCP paint; the 2026-09-27 trace showed
 * Clarity at 280 ms, j.duyet.net/p.js at 247 ms and gtag at 167 ms of
 * scripting competing with it. `afterLcpPaint` moves the whole set to idle
 * time after the paint.
 *
 * The Clarity vendor bootstrap also used to be injected as inline JS that
 * does `l.getElementsByTagName("script")[0].parentNode.insertBefore(t, y)`,
 * which throws on a document with no <script> yet. It is now a plain async
 * <script src> with the same tag id, which is what the snippet was building
 * anyway — so the tag id, the queue shim and the beacon URL are unchanged and
 * existing Clarity sessions keep working.
 */
function bootstrapAnalytics(): void {
  if (GA_MEASUREMENT_ID) {
    loadScript(
      `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`
    );
    loadInlineScript(`
      window.dataLayer = window.dataLayer || [];
      function gtag(){window.dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
    `);
  }

  if (SELINE_TOKEN) {
    loadScript("https://cdn.seline.so/seline.js", {
      "data-token": SELINE_TOKEN,
    });
  }

  loadInlineScript(`
    !function(e,n,t){e.onload=function(){
    let e=n.createElement("script");
    e.src=t,n.body.appendChild(e)}}
    (window,document,"//pageview.duyet.net/pageview.js");
  `);

  loadScript("https://www.clarity.ms/tag/h2lw6wemnl");

  if (POSTHOG_API_KEY) {
    loadInlineScript(`
      !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return this.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
      posthog.init('${POSTHOG_API_KEY}',{api_host:'https://app.posthog.com'})
    `);
  }

  loadScript("https://j.duyet.net/p.js");
}

export default function AnalyticWrapper() {
  useEffect(() => afterLcpPaint(bootstrapAnalytics), []);

  return null;
}
