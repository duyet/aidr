/** @vitest-environment happy-dom */

/**
 * The Cloudflare Google tag gateway puts `gtag('config', …)` at the top of
 * <head>, before any app code, and gtag.js sends that config's page_view
 * with whatever the URL was. Only the inline boot script runs early enough
 * to clean it up: it moves a subscribe token out of the URL and gives the
 * queued config a sanitized page_location.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gaHits, gatewaySnippet } from "../__fixtures__/gtag";
import { installAnalyticsStubs } from "./stubs";
import { track } from "./track";
import { bootSubscribeLink, URL_PRIVACY_BOOT_SCRIPT } from "./url-privacy";

const LEAK = /SECRET|john|salary/i;

type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: unknown };
const w = window as GtagWindow;

function runBootScript(): void {
  new Function(URL_PRIVACY_BOOT_SCRIPT)();
}

/** The history index TanStack Router stamps on each entry. */
function atEntry(index: number): void {
  history.replaceState({ __TSR_index: index }, "");
}

beforeEach(() => {
  delete w.dataLayer;
  delete w.gtag;
});

afterEach(() => {
  history.replaceState(null, "", "/");
});

describe("GA4 never sees subscribe tokens or search text", () => {
  for (const path of [
    "/subscribe?unsubscribe=SECRET",
    "/subscribe?settings=SECRET&lang=vi",
    "/?q=john+salary",
  ]) {
    for (const gateway of [true, false]) {
      it(`${path}, ${gateway ? "with" : "without"} the tag gateway`, () => {
        history.replaceState(null, "", path);
        if (gateway) gatewaySnippet();
        runBootScript();
        installAnalyticsStubs({ gaMeasurementId: "G-HXJPPQVYQN" });
        track("page_view", { page_path: location.pathname, page_type: "home" });

        const hits = gaHits();
        expect(hits.map((h) => h.en)).toEqual(
          gateway ? ["page_view", "page_view"] : ["page_view"]
        );
        expect(JSON.stringify(hits)).not.toMatch(LEAK);
      });
    }
  }

  it("keeps the params reports need on the gateway's page_view", () => {
    history.replaceState(
      null,
      "",
      "/?lang=vi&utm_source=telegram&tag=agents&q=john&email=a%40b.c#top"
    );
    gatewaySnippet();
    runBootScript();
    const [pageView] = gaHits();
    expect(pageView.dl).toBe(
      `${location.origin}/?lang=vi&utm_source=telegram&tag=agents`
    );
  });
});

describe("the subscribe token leaves the URL before any vendor loads", () => {
  for (const [path, kind, search] of [
    ["/subscribe?unsubscribe=SECRET", "unsubscribe", ""],
    ["/subscribe?settings=SECRET&lang=vi", "settings", "?lang=vi"],
  ] as const) {
    it(`${kind}: the page still gets the token`, () => {
      history.replaceState(null, "", path);
      runBootScript();
      expect(location.pathname + location.search).toBe(`/subscribe${search}`);
      atEntry(0);
      expect(bootSubscribeLink()).toEqual({ kind, token: "SECRET" });
    });
  }

  it("leaves the same params alone on other pages", () => {
    history.replaceState(null, "", "/?settings=x");
    runBootScript();
    expect(location.search).toBe("?settings=x");
    atEntry(99);
    expect(bootSubscribeLink()).toBeUndefined();
  });

  it("stays with the entry it arrived on, so a later visit starts clean", () => {
    history.replaceState(null, "", "/subscribe?unsubscribe=SECRET");
    runBootScript();
    const link = { kind: "unsubscribe", token: "SECRET" };
    atEntry(3);
    expect(bootSubscribeLink()).toEqual(link);
    // The tree remounts once Clerk loads, and back returns to the entry.
    expect(bootSubscribeLink()).toEqual(link);
    atEntry(4);
    expect(bootSubscribeLink()).toBeUndefined();
  });
});

describe("a dataLayer the boot script cannot use", () => {
  for (const [name, make] of [
    ["frozen", () => Object.freeze([])],
    ["a plain object", () => ({})],
    ["a number", () => 7],
  ] as const) {
    it(`${name}: the token still leaves the URL and nothing throws`, () => {
      history.replaceState(null, "", "/subscribe?settings=SECRET&lang=vi");
      (w as { dataLayer?: unknown }).dataLayer = make();
      expect(runBootScript).not.toThrow();
      expect(location.search).toBe("?lang=vi");
      atEntry(0);
      expect(bootSubscribeLink()).toEqual({
        kind: "settings",
        token: "SECRET",
      });
    });
  }
});
