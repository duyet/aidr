/** @vitest-environment happy-dom */

/**
 * Vendors read the page URL themselves, so whatever sits in the query string
 * reaches them unless the app hands them a clean one. Two kinds of query must
 * never leave the browser: the subscribe tokens (`/subscribe?unsubscribe=` and
 * `?settings=`), which authorize changes to a subscription, and free-text
 * search (`/?q=`). Each test builds the payload a vendor would send, using
 * that vendor's own rule for picking a URL, and searches it for the secret.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { gaHits } from "../__fixtures__/gtag";
import { installAnalyticsStubs, type PosthogStub } from "./stubs";
import { track } from "./track";
import AnalyticWrapper from "./vendors";

const LEAK = /SECRET|john|salary/i;

const CASES = [
  "/subscribe?unsubscribe=SECRET",
  "/subscribe?settings=SECRET&lang=vi",
  "/?q=john+salary",
];

type Jitsu = { page: (props?: object) => void };
type VendorWindow = Window & {
  dataLayer?: unknown[];
  gtag?: unknown;
  posthog?: PosthogStub;
  jitsuQ?: ((jitsu: Jitsu) => void)[];
};
const w = window as VendorWindow;

beforeEach(() => {
  delete w.dataLayer;
  delete w.gtag;
  delete w.posthog;
  delete w.jitsuQ;
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.unstubAllGlobals();
  history.replaceState(null, "", "/");
});

describe("GA4 app events never carry subscribe tokens or search text", () => {
  for (const path of CASES) {
    it(path, () => {
      history.replaceState(null, "", path);
      installAnalyticsStubs({ gaMeasurementId: "G-HXJPPQVYQN" });
      track("page_view", { page_path: location.pathname, page_type: "home" });
      track("search", { query_len: 11 });

      const hits = gaHits();
      expect(hits.map((h) => h.en)).toEqual(["page_view", "search"]);
      for (const h of hits) {
        expect(new URL(h.dl).pathname).toBe(location.pathname);
      }
      expect(JSON.stringify(hits)).not.toMatch(LEAK);
    });
  }
});

describe("PostHog never sees subscribe tokens or search text", () => {
  for (const path of CASES) {
    it(path, () => {
      const href = new URL(path, location.href).href;
      installAnalyticsStubs({
        gaMeasurementId: "",
        posthog: { token: "phc_test", host: "https://us.i.posthog.com" },
      });
      const config = w.posthog?._i[0]?.[1] as {
        before_send?: (event: object) => object | null;
      };
      const beforeSend = config.before_send ?? ((event: object) => event);
      const timestamp = new Date(0);
      const sent = beforeSend({
        event: "$autocapture",
        timestamp,
        properties: {
          $current_url: href,
          $pathname: new URL(href).pathname,
          $referrer: href,
          $session_entry_url: href,
          $elements_chain: `a.underline:attr__href="${path}"href="${path}"nth-child="2"`,
          $elements: [{ tag_name: "a", attr__href: path }],
        },
        $set: { $current_url: href },
        $set_once: { $initial_current_url: href, $initial_referrer: href },
      });
      expect(JSON.stringify(sent)).toContain(new URL(href).pathname);
      expect(JSON.stringify(sent)).not.toMatch(LEAK);
      expect((sent as { timestamp?: unknown }).timestamp).toBe(timestamp);
    });
  }
});

describe("the PostHog scrub rewrites only URLs of this site", () => {
  function beforeSend(): (event: object) => object {
    installAnalyticsStubs({
      gaMeasurementId: "",
      posthog: { token: "phc_test", host: "https://us.i.posthog.com" },
    });
    const config = w.posthog?._i[0]?.[1] as {
      before_send: (event: object) => object;
    };
    return config.before_send;
  }

  it("leaves free text that starts with a slash alone", () => {
    const props = {
      title: "/ 50% off",
      tag: "/tag/tiếng việt",
      note: "/subscribe?settings=is how the link looks",
    };
    const sent = beforeSend()({ event: "promo_click", properties: props });
    expect(sent).toEqual({ event: "promo_click", properties: props });
  });

  it("drops only the unsafe params and keeps the URL as written", () => {
    const origin = location.origin;
    const sent = beforeSend()({
      event: "$pageview",
      properties: {
        $current_url: `${origin}/story/abc?q=john&lang=vi#comments`,
        $pathname: "/tag/ti%E1%BA%BFng%20vi%E1%BB%87t",
        $referrer: `${origin}/tag/ti%E1%BA%BFng%20vi%E1%BB%87t?lang=vi`,
        $prev_pageview_url: "/?q=salary#top",
        $external_click_url: "https://example.com/?q=theirs",
        lookalike: `${origin}.evil.example/?q=john`,
      },
    });
    expect(sent).toEqual({
      event: "$pageview",
      properties: {
        $current_url: `${origin}/story/abc?lang=vi#comments`,
        $pathname: "/tag/ti%E1%BA%BFng%20vi%E1%BB%87t",
        $referrer: `${origin}/tag/ti%E1%BA%BFng%20vi%E1%BB%87t?lang=vi`,
        $prev_pageview_url: "/#top",
        $external_click_url: "https://example.com/?q=theirs",
        lookalike: `${origin}.evil.example/?q=john`,
      },
    });
  });

  it("scrubs objects without a prototype and URL-keyed maps", () => {
    const origin = location.origin;
    const properties = Object.assign(Object.create(null), {
      $current_url: `${origin}/?q=john`,
      $heatmap_data: { [`${origin}/?q=salary`]: [{ x: 1, y: 2 }] },
    });
    const sent = beforeSend()({ event: "$$heatmap", properties });
    expect(JSON.stringify(sent)).not.toMatch(LEAK);
    expect(JSON.stringify(sent)).toContain(`${origin}/`);
  });

  it("does not rewrite a session recording, apart from its page URL", () => {
    const origin = location.origin;
    const recorded = {
      type: 2,
      data: {
        node: {
          attributes: { href: "/?q=typed", title: "/ 50% off" },
          textContent: "/tag/tiếng việt",
        },
      },
    };
    const sent = beforeSend()({
      event: "$snapshot",
      properties: {
        $session_id: "s1",
        $snapshot_data: [
          { type: 4, data: { href: `${origin}/?q=john&lang=en`, width: 1 } },
          recorded,
        ],
      },
    });
    expect(sent).toEqual({
      event: "$snapshot",
      properties: {
        $session_id: "s1",
        $snapshot_data: [
          { type: 4, data: { href: `${origin}/?lang=en`, width: 1 } },
          recorded,
        ],
      },
    });
  });
});

describe("Jitsu never sees subscribe tokens or search text", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", (cb: () => void) => {
      cb();
      return 1;
    });
    vi.stubGlobal("cancelIdleCallback", () => {});
  });

  /**
   * p.js 2.15 sends one page event on load unless `data-init-only` is set,
   * after running the `jitsuQ` callbacks. The event's url is
   * `properties.url`, else location.href. `context.page.search` is
   * `properties.search || location.search`, so an empty search falls back
   * to the real one, and `properties.context` is merged over the context last.
   */
  function jitsuPages(): object[] {
    const el = document.querySelector<HTMLScriptElement>(
      'script[src="https://j.duyet.net/p.js"]'
    );
    expect(el).not.toBeNull();
    const calls: Record<string, unknown>[] = [];
    const jitsu: Jitsu = { page: (props = {}) => calls.push({ ...props }) };
    for (const cb of w.jitsuQ ?? []) cb(jitsu);
    if (el?.dataset.initOnly !== "true") jitsu.page();
    return calls.map((props) => {
      const context = (props.context ?? {}) as { page?: object };
      return {
        properties: {
          ...props,
          url: props.url ?? location.href,
          search: props.search ?? location.search,
        },
        context: {
          page: {
            url: props.url || location.href,
            search: props.search || location.search,
            referrer: document.referrer,
            ...context.page,
          },
        },
      };
    });
  }

  for (const path of CASES) {
    it(path, async () => {
      history.replaceState(null, "", path);
      render(<AnalyticWrapper />);
      await vi.advanceTimersByTimeAsync(5000);

      const pages = jitsuPages();
      expect(pages).toHaveLength(1);
      expect(JSON.stringify(pages)).toContain(location.pathname);
      expect(JSON.stringify(pages)).not.toMatch(LEAK);
    });
  }
});
