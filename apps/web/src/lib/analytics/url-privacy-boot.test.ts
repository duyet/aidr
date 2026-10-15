/** @vitest-environment happy-dom */

/**
 * The Cloudflare Google tag gateway inlines `gtag('config', …)` at the top
 * of <head>, and gtag.js sends that config's page_view with whatever the URL
 * was. The Worker puts the boot script ahead of the gateway (ssr-head.ts),
 * so the boot script moves a subscribe token out of the URL and queues a
 * sanitized page_location before that config. If the gateway still comes
 * first, the boot script patches the config already queued.
 */
import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gaHits, gatewaySnippet } from "../__fixtures__/gtag";
import { installAnalyticsStubs } from "./stubs";
import { track } from "./track";
import { URL_PRIVACY_BOOT_SCRIPT } from "./url-privacy";

const LEAK = /SECRET|john|salary/i;

type GtagWindow = Window & { dataLayer?: unknown[]; gtag?: unknown };
const w = window as GtagWindow;

function runBootScript(): void {
  new Function(URL_PRIVACY_BOOT_SCRIPT)();
}

const histories: { destroy: () => void }[] = [];

/**
 * A page load on the client: a fresh module (its per-load state) and a
 * router on the current history entry, handed the boot script's link the
 * way `getRouter` does.
 */
async function startRouter() {
  vi.resetModules();
  const privacy = await import("./url-privacy");
  const root = createRootRoute();
  const routeTree = root.addChildren([
    createRoute({ getParentRoute: () => root, path: "/" }),
    createRoute({ getParentRoute: () => root, path: "/subscribe" }),
  ]);
  const browserHistory = createBrowserHistory();
  // It wraps window.history's methods; unwrap after the test.
  histories.push(browserHistory);
  const router = createRouter({ routeTree, history: browserHistory });
  privacy.adoptSubscribeLink();
  await router.load();
  return { router, privacy };
}

beforeEach(() => {
  delete w.dataLayer;
  delete w.gtag;
});

afterEach(() => {
  for (const h of histories.splice(0).reverse()) h.destroy();
  history.replaceState(null, "", "/");
});

describe("GA4 never sees subscribe tokens or search text", () => {
  for (const path of [
    "/subscribe?unsubscribe=SECRET",
    "/subscribe?settings=SECRET&lang=vi",
    "/?q=john+salary",
  ]) {
    for (const gateway of ["after", "before", "without"] as const) {
      it(`${path}, ${gateway} the tag gateway`, () => {
        history.replaceState(null, "", path);
        if (gateway === "before") gatewaySnippet();
        runBootScript();
        if (gateway === "after") gatewaySnippet();
        installAnalyticsStubs({});
        track("page_view", { page_path: location.pathname, page_type: "home" });

        const hits = gaHits();
        expect(hits.map((h) => h.en)).toEqual(
          gateway === "without" ? ["page_view"] : ["page_view", "page_view"]
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
    it(`${kind}: the page still gets the token`, async () => {
      history.replaceState(null, "", path);
      runBootScript();
      expect(location.pathname + location.search).toBe(`/subscribe${search}`);
      const { router, privacy } = await startRouter();
      expect(
        privacy.subscribeLinkToRender(router.state.location.state, false)
      ).toEqual({ kind, token: "SECRET" });
    });
  }

  it("leaves the same params alone on other pages", async () => {
    history.replaceState(null, "", "/?settings=x");
    runBootScript();
    expect(location.search).toBe("?settings=x");
    const { router, privacy } = await startRouter();
    expect(
      privacy.subscribeLinkOf(router.state.location.state)
    ).toBeUndefined();
  });
});

describe("the subscribe link stays with the history entry it arrived on", () => {
  const link = { kind: "settings", token: "SECRET" };

  async function arrive() {
    history.replaceState(null, "", "/subscribe?settings=SECRET&lang=en");
    runBootScript();
    return startRouter();
  }

  it("a link to the same URL (the footer's Get AI;DR) opens the plain page", async () => {
    const { router, privacy } = await arrive();
    const length = history.length;
    await router.navigate({ to: "/subscribe", search: { lang: "en" } });
    expect(location.pathname + location.search).toBe("/subscribe?lang=en");
    expect(history.length).toBe(length + 1);
    expect(
      privacy.subscribeLinkOf(router.state.location.state)
    ).toBeUndefined();
  });

  it("a language switch keeps it", async () => {
    const { router, privacy } = await arrive();
    await router.navigate({
      href: "/subscribe?lang=vi",
      replace: true,
      state: true,
    });
    expect(privacy.subscribeLinkOf(router.state.location.state)).toEqual(link);
  });

  it("after a reload it shows once hydrated, as the server rendered the plain page", async () => {
    await arrive();
    // A reload keeps the entry's state; the URL no longer has the token.
    const { router, privacy } = await startRouter();
    const state = router.state.location.state;
    expect(privacy.subscribeLinkToRender(state, false)).toBeUndefined();
    expect(privacy.subscribeLinkToRender(state, true)).toEqual(link);
  });
});

describe("a dataLayer the boot script cannot use", () => {
  for (const [name, make] of [
    ["frozen", () => Object.freeze([])],
    ["a plain object", () => ({})],
    ["a number", () => 7],
  ] as const) {
    it(`${name}: the token still leaves the URL and nothing throws`, async () => {
      history.replaceState(null, "", "/subscribe?settings=SECRET&lang=vi");
      (w as { dataLayer?: unknown }).dataLayer = make();
      expect(runBootScript).not.toThrow();
      expect(location.search).toBe("?lang=vi");
      const { router, privacy } = await startRouter();
      expect(privacy.subscribeLinkOf(router.state.location.state)).toEqual({
        kind: "settings",
        token: "SECRET",
      });
    });
  }
});
