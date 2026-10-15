/** @vitest-environment happy-dom */

/**
 * Events fired before the vendor scripts load must be queued, not dropped.
 *
 * `vendors.tsx` defers gtag.js and PostHog's array.js past the LCP
 * paint (1 to 6 s after hydrate), while PageViewTracker fires the one-shot
 * channel_landing and the landing page_view from its first effect. Without
 * the vendors' queue stubs installed up front, both sinks lose those events
 * for good.
 */
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GA_MEASUREMENT_ID } from "./measurement-id";
import { installAnalyticsStubs, type PosthogStub } from "./stubs";
import { track } from "./track";
import { maskRecordedRequest, scrubPosthogEvent } from "./url-privacy";

type QueueWindow = Window & {
  dataLayer?: IArguments[];
  gtag?: unknown;
  posthog?:
    | PosthogStub
    | { __SV: number; capture: (...args: unknown[]) => void };
};

const w = () => window as QueueWindow;

function dataLayerCalls(): unknown[][] {
  return (w().dataLayer ?? []).map((entry) => Array.from(entry));
}

function posthogQueue(): unknown[][] {
  return Array.from(w().posthog as PosthogStub);
}

/**
 * What array.js does on load (`init_from_snippet`): read the queued
 * `_i` init calls, replay the method queue onto the real instance, and
 * replace `window.posthog` with that instance.
 */
function loadFakePosthog() {
  const stub = w().posthog as PosthogStub;
  const capture = vi.fn();
  // array.js marks the live instance with __SV too, which is what keeps a
  // later stub install from touching it.
  const instance = { __SV: 1, capture, inits: stub._i };
  for (const [method, ...args] of Array.from(stub)) {
    if (method === "capture") capture(...args);
  }
  w().posthog = instance;
  return instance;
}

beforeEach(() => {
  w().dataLayer = undefined;
  w().gtag = undefined;
  w().posthog = undefined;
});

afterEach(() => {
  cleanup();
  vi.doUnmock("@tanstack/react-router");
  vi.resetModules();
});

describe("track() before the vendor scripts load", () => {
  it("queues the gtag call in dataLayer behind js and config", () => {
    installAnalyticsStubs({});
    track("page_view", { page_path: "/", page_type: "home" });

    const calls = dataLayerCalls();
    expect(calls[0][0]).toBe("js");
    expect(calls[1]).toEqual([
      "config",
      GA_MEASUREMENT_ID,
      { send_page_view: false },
    ]);
    expect(calls[2]).toEqual([
      "set",
      { page_location: `${location.origin}/`, page_referrer: "" },
    ]);
    expect(calls[3]).toEqual([
      "event",
      "page_view",
      { page_path: "/", page_type: "home", send_to: GA_MEASUREMENT_ID },
    ]);
    expect(calls).toHaveLength(4);
  });

  it("queues the PostHog capture with the init the library replays", () => {
    installAnalyticsStubs({
      posthog: { token: "phc_test", host: "https://us.i.posthog.com" },
    });
    track("channel_landing", {
      channel: "telegram",
      page_type: "home",
      page_path: "/",
    });

    const stub = w().posthog as PosthogStub;
    expect(stub._i).toEqual([
      [
        "phc_test",
        {
          api_host: "https://us.i.posthog.com",
          defaults: "2026-05-30",
          capture_exceptions: true,
          before_send: scrubPosthogEvent,
          session_recording: {
            maskCapturedNetworkRequestFn: maskRecordedRequest,
          },
        },
        "posthog",
      ],
    ]);
    expect(posthogQueue()).toEqual([
      [
        "capture",
        "channel_landing",
        {
          channel: "telegram",
          page_type: "home",
          page_path: "/",
          surface: "web",
        },
      ],
    ]);
  });

  it("delivers each queued event once after the library loads", () => {
    installAnalyticsStubs({
      posthog: { token: "phc_test", host: "https://us.i.posthog.com" },
    });
    track("source_click", { item_id: "deadbeef", placement: "row" });

    const ph = loadFakePosthog();
    expect(ph.capture).toHaveBeenCalledTimes(1);

    // A remount re-runs the install; it must not reset or re-queue.
    installAnalyticsStubs({
      posthog: { token: "phc_test", host: "https://us.i.posthog.com" },
    });
    expect(w().posthog).toBe(ph);
    expect(dataLayerCalls().filter((c) => c[0] === "config")).toHaveLength(1);

    track("source_click", { item_id: "cafebabe", placement: "dialog" });
    expect(ph.capture).toHaveBeenCalledTimes(2);
    expect(ph.capture).toHaveBeenLastCalledWith("source_click", {
      item_id: "cafebabe",
      placement: "dialog",
      surface: "web",
    });
    expect(dataLayerCalls().filter((c) => c[0] === "event")).toHaveLength(2);
  });

  it("installs no PostHog stub when the token is unset", () => {
    installAnalyticsStubs({});
    track("page_view", { page_path: "/", page_type: "home" });
    expect(w().posthog).toBeUndefined();
    expect(dataLayerCalls().filter((c) => c[0] === "event")).toHaveLength(1);
  });
});

describe("PageViewTracker landing events at hydrate", () => {
  it("are queued before any vendor script is in the document", async () => {
    // Nothing is installed by hand here: importing the vendors module, as
    // __root.tsx does, must be enough. PostHog's stub needs the token from
    // import.meta.env at module init, which this test leaves unset, so only
    // the gtag queue is asserted; the PostHog queue is covered above.
    vi.doMock("@tanstack/react-router", () => ({
      useRouterState: ({
        select,
      }: {
        select: (s: {
          location: { pathname: string; searchStr: string };
        }) => unknown;
      }) =>
        select({
          location: { pathname: "/", searchStr: "?utm_source=telegram" },
        }),
    }));

    // Importing the vendors module is what installs the stubs in the app.
    await import("./vendors");
    const { PageViewTracker } = await import(
      "../../components/PageViewTracker"
    );
    render(<PageViewTracker />);

    expect(document.querySelectorAll("script")).toHaveLength(0);
    expect(dataLayerCalls().filter((c) => c[0] === "config")).toHaveLength(1);

    const gaEvents = dataLayerCalls()
      .filter((c) => c[0] === "event")
      .map((c) => c[1]);
    expect(gaEvents).toEqual(["channel_landing", "page_view"]);

    const landing = dataLayerCalls().find((c) => c[1] === "channel_landing");
    expect(landing?.[2]).toEqual({
      channel: "telegram",
      page_type: "home",
      page_path: "/",
      send_to: GA_MEASUREMENT_ID,
    });
  });
});
