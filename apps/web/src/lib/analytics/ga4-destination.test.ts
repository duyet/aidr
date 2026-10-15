/** @vitest-environment happy-dom */

/**
 * #703: the Cloudflare tag gateway defines `gtag` and configures its own id
 * before the app runs. The stub used to return early when `gtag` existed, so
 * the app's id was never configured and every app event went to the
 * gateway's stream, the one with Enhanced Measurement on.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { gaHits, gatewaySnippet } from "../__fixtures__/gtag";
import { GA_MEASUREMENT_ID } from "./measurement-id";
import { installAnalyticsStubs } from "./stubs";
import { track } from "./track";
import { URL_PRIVACY_BOOT_SCRIPT } from "./url-privacy";

const GATEWAY_ID = "G-22PGCY4GEG";

type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: unknown };
const w = window as GtagWindow;

function configs(): unknown[][] {
  return (w.dataLayer ?? [])
    .map((entry) => Array.from(entry as ArrayLike<unknown>))
    .filter((args) => args[0] === "config");
}

function landing(): void {
  track("channel_landing", {
    channel: "telegram",
    page_type: "home",
    page_path: "/",
  });
  track("page_view", { page_path: "/", page_type: "home" });
}

beforeEach(() => {
  delete w.dataLayer;
  delete w.gtag;
  history.replaceState(null, "", "/?utm_source=telegram");
});

describe("app events reach the configured GA4 id, and only it", () => {
  it("with the tag gateway on the page first", () => {
    new Function(URL_PRIVACY_BOOT_SCRIPT)();
    gatewaySnippet();
    installAnalyticsStubs({});
    landing();

    const appHits = gaHits().filter((h) => h.en === "channel_landing");
    expect(appHits).toHaveLength(1);
    expect(appHits[0].tid).toEqual([GA_MEASUREMENT_ID]);
    expect(
      gaHits()
        .filter((h) => h.tid.includes(GATEWAY_ID))
        .map((h) => h.en)
    ).toEqual(["page_view"]);
  });

  it("without the gateway", () => {
    installAnalyticsStubs({});
    landing();
    expect(gaHits().map((h) => [h.en, h.tid])).toEqual([
      ["channel_landing", [GA_MEASUREMENT_ID]],
      ["page_view", [GA_MEASUREMENT_ID]],
    ]);
  });

  it("configures the app id once, without a second page_view", () => {
    gatewaySnippet();
    installAnalyticsStubs({});
    installAnalyticsStubs({});
    expect(configs()).toEqual([
      ["config", GATEWAY_ID],
      ["config", GA_MEASUREMENT_ID, { send_page_view: false }],
    ]);
  });
});
