import { describe, expect, it } from "vitest";
import { SUBSCRIBE_SOURCES as WORKER_SUBSCRIBE_SOURCES } from "../../../worker/subscribe/handlers";
import { EVENTS, SUBSCRIBE_SOURCES } from "./events";
import { GA4_LIMITS, type Spec } from "./schema";

const NAME_RE = /^[a-z][a-z0-9_]*$/;

// https://support.google.com/analytics/answer/13316687 (web, 2026-10-14).
// page_view is on the list because gtag sends it; a manual page_view with
// send_page_view:false is the documented way to send it ourselves.
const GA4_RESERVED_EVENTS = new Set([
  "ad_impression",
  "app_remove",
  "app_store_refund",
  "app_store_subscription_cancel",
  "app_store_subscription_renew",
  "click",
  "error",
  "file_download",
  "first_open",
  "first_visit",
  "form_start",
  "form_submit",
  "in_app_purchase",
  "scroll",
  "session_start",
  "user_engagement",
  "view_complete",
  "video_progress",
  "video_start",
  "view_search_results",
]);
const GA4_RESERVED_EVENT_PREFIXES = ["query_id"];
const GA4_RESERVED_PARAMS = new Set([
  "cid",
  "currency",
  "customer_id",
  "customerid",
  "dclid",
  "gclid",
  "session_id",
  "sessionid",
  "sfmc_id",
  "sid",
  "srsltid",
  "uid",
  "user_id",
  "userid",
]);
const GA4_RESERVED_PARAM_PREFIXES = [
  "_",
  "firebase_",
  "ga_",
  "google_",
  "gtag.",
];

/** Names that would invite free text or identity into a param. */
const PII_PARAM_NAMES = new Set([
  "email",
  "name",
  "query",
  "q",
  "title",
  "text",
  "summary",
  "token",
  "password",
  "phone",
  "ip",
  "authorization",
]);

const rows = Object.entries(EVENTS);
const params = rows.flatMap(([event, row]) =>
  Object.entries(row.params as Record<string, Spec>).map(
    ([param, spec]) => [event, param, spec] as const
  )
);

describe("event registry", () => {
  it.each(rows)("%s has a GA4-valid, unreserved name", (event) => {
    expect(event).toMatch(NAME_RE);
    expect(event.length).toBeLessThanOrEqual(GA4_LIMITS.eventName);
    expect(GA4_RESERVED_EVENTS.has(event)).toBe(false);
    for (const prefix of GA4_RESERVED_EVENT_PREFIXES) {
      expect(event.startsWith(prefix)).toBe(false);
    }
  });

  it.each(rows)(
    "%s fits GA4's param count and states its question",
    (_, row) => {
      expect(Object.keys(row.params).length).toBeLessThanOrEqual(
        GA4_LIMITS.paramsPerEvent
      );
      expect(row.question).toMatch(/\?$/);
    }
  );

  it.each(params)(
    "%s.%s is a valid, non-reserved, non-PII param",
    (_, param, spec) => {
      expect(param).toMatch(NAME_RE);
      expect(param.length).toBeLessThanOrEqual(GA4_LIMITS.paramName);
      expect(GA4_RESERVED_PARAMS.has(param)).toBe(false);
      for (const prefix of GA4_RESERVED_PARAM_PREFIXES) {
        expect(param.startsWith(prefix)).toBe(false);
      }
      expect(PII_PARAM_NAMES.has(param)).toBe(false);
      // track() stamps `surface` on PostHog events itself.
      expect(param).not.toBe("surface");
      if (spec.kind === "enum") {
        expect(spec.values.length).toBeGreaterThan(0);
        for (const v of spec.values) {
          expect(v.length).toBeLessThanOrEqual(GA4_LIMITS.paramValue);
        }
      }
    }
  );

  it("gives each param name one kind across events (one GA4 dimension)", () => {
    const kinds = new Map<string, string>();
    for (const [event, param, spec] of params) {
      const seen = kinds.get(param);
      if (seen)
        expect(`${event}.${param}: ${spec.kind}`).toBe(
          `${event}.${param}: ${seen}`
        );
      else kinds.set(param, spec.kind);
    }
  });

  it("registers a dimension consistently for a shared param name", () => {
    const dims = new Map<string, boolean>();
    for (const [event, param, spec] of params) {
      const seen = dims.get(param);
      if (seen === undefined) dims.set(param, spec.dimension);
      else
        expect(`${event}.${param} dimension=${spec.dimension}`).toBe(
          `${event}.${param} dimension=${seen}`
        );
    }
  });

  it("keeps subscribe sources in step with the Worker's", () => {
    expect([...SUBSCRIBE_SOURCES]).toEqual([...WORKER_SUBSCRIBE_SOURCES]);
  });
});
