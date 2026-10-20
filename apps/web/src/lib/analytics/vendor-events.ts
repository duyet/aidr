/**
 * Events a vendor script sends by itself. They are not registry rows because
 * app code does not call them and cannot change their params, but they reach
 * the same vendors, so docs/analytics-events.md lists them next to the
 * registry. `url-privacy.ts` scrubs the URLs they carry.
 */
export type VendorName = "ga4" | "posthog" | "jitsu";

export interface VendorEvent {
  vendor: VendorName;
  event: string;
  /** When the vendor script sends it. */
  fires: string;
  /** What we do about it. */
  handling: string;
}

export const VENDOR_EVENTS: readonly VendorEvent[] = [
  {
    vendor: "posthog",
    event: "$pageview",
    fires: "On load and on every history change.",
    handling:
      "Kept; this is why `page_view` goes to GA4 only. URL properties are sanitized in `before_send`.",
  },
  {
    vendor: "posthog",
    event: "$autocapture",
    fires: "Never. `autocapture: false` in `stubs.ts`.",
    handling:
      "Off since #704: it recorded clicks and form changes on every interactive element. `before_send` still sanitizes link hrefs if it is turned back on.",
  },
  {
    vendor: "posthog",
    event: "$exception",
    fires: "Never. `capture_exceptions: false` in `stubs.ts`.",
    handling:
      "Off since #704. Page URLs are sanitized in `before_send` if it is turned back on.",
  },
  {
    vendor: "posthog",
    event: "$snapshot",
    fires: "Never. `disable_session_recording: true` in `stubs.ts`.",
    handling:
      "Session replay is off in code, whatever the PostHog project setting says. The recording scrubbers stay for a future opt-in.",
  },
  {
    vendor: "ga4",
    event: "session_start, first_visit, user_engagement",
    fires: "Sent by gtag.js on its own for every session.",
    handling: "Kept. They carry the sanitized `page_location`.",
  },
  {
    vendor: "ga4",
    event: "scroll, click, view_search_results, form_start, form_submit",
    fires:
      "Enhanced Measurement: 90% scroll, outbound clicks, site search, form interactions.",
    handling:
      "Must be off in GA4 Admin, see GA4 Enhanced Measurement below. App code cannot change what they send.",
  },
  {
    vendor: "ga4",
    event: "page_view (history change)",
    fires: "Enhanced Measurement: page changes based on browser history.",
    handling:
      "Must be off in GA4 Admin. The app sends its own `page_view` on every route change.",
  },
  {
    vendor: "jitsu",
    event: "page",
    fires: "Once per full page load, queued through `jitsuQ`.",
    handling:
      "p.js runs with `data-init-only`, so only the app's call with a sanitized URL is sent.",
  },
];
