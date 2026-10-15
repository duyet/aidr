import { afterEach, describe, expect, it, vi } from "vitest";
import { GA_MEASUREMENT_ID as GA } from "./measurement-id";
import { type FeedTag, feedTag } from "./schema";
import { track } from "./track";

function sinks() {
  const gtag = vi.fn();
  const capture = vi.fn();
  vi.stubGlobal("window", {
    gtag,
    posthog: { capture },
    location: { href: "https://aidr.today/" },
    document: { referrer: "" },
  });
  return { gtag, capture };
}

/** The `event` calls, without the `set` of page fields before each. */
function events(gtag: ReturnType<typeof vi.fn>): unknown[][] {
  return gtag.mock.calls.filter((c) => c[0] === "event");
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("track", () => {
  it("sends the registry params to GA4, and adds surface for PostHog", () => {
    const { gtag, capture } = sinks();
    track("source_click", { item_id: "deadbeef", placement: "row" });
    expect(gtag).toHaveBeenCalledWith("event", "source_click", {
      item_id: "deadbeef",
      placement: "row",
      send_to: GA,
    });
    expect(capture).toHaveBeenCalledWith("source_click", {
      item_id: "deadbeef",
      placement: "row",
      surface: "web",
    });
  });

  it("drops keys outside the event's row, so a spread cannot leak PII", () => {
    const { gtag } = sinks();
    const leaky = {
      query_len: 4,
      query: "secret search",
      email: "you@example.com",
      utm_source: "telegram",
    };
    track("search", leaky);
    expect(gtag).toHaveBeenCalledWith("event", "search", {
      query_len: 4,
      send_to: GA,
    });
  });

  it("drops values that fail their kind", () => {
    const { gtag } = sinks();
    track("media_open", {
      media: "image",
      item_id: "you@example.com",
      index: -1,
    });
    expect(gtag).toHaveBeenCalledWith("event", "media_open", {
      media: "image",
      send_to: GA,
    });
  });

  it("drops an enum value outside its list", () => {
    const { gtag } = sinks();
    // @ts-expect-error runtime guard: "modal" is not a placement
    track("calendar_open", { placement: "modal" });
    expect(gtag).toHaveBeenCalledWith("event", "calendar_open", {
      send_to: GA,
    });
  });

  it("cuts the query and hash off a path, which can carry ?q=", () => {
    const { gtag } = sinks();
    track("page_view", {
      page_path: "/date/2026-10-14?q=secret#x",
      page_type: "day",
    });
    expect(gtag).toHaveBeenCalledWith("event", "page_view", {
      page_path: "/date/2026-10-14",
      page_type: "day",
      send_to: GA,
    });
  });

  it("keeps a feed label with spaces and drops one that is not a label", () => {
    const { gtag } = sinks();
    const feed = ["Open Source"];
    track("topic_filter", {
      tag: feedTag("Open Source", feed) as FeedTag,
      from: "nav",
    });
    // Forged past the brand, as an `as` cast in a caller would: the runtime
    // guard is the second line of defense.
    track("topic_filter", { tag: "<script>" as FeedTag, from: "nav" });
    expect(events(gtag).map((c) => c[2])).toEqual([
      { tag: "Open Source", from: "nav", send_to: GA },
      { from: "nav", send_to: GA },
    ]);
  });

  it("sends page_view to GA4 only; PostHog captures its own $pageview", () => {
    const { gtag, capture } = sinks();
    track("page_view", { page_path: "/", page_type: "home" });
    expect(events(gtag)).toHaveLength(1);
    expect(capture).not.toHaveBeenCalled();
  });

  it("ignores a name outside the registry from an untyped caller", () => {
    const { gtag, capture } = sinks();
    // @ts-expect-error runtime guard
    track("story_open", { item_id: "deadbeef" });
    // @ts-expect-error runtime guard
    track("constructor", {});
    expect(gtag).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalled();
  });

  it("still sends to PostHog when GA4 is blocked", () => {
    const capture = vi.fn();
    vi.stubGlobal("window", { posthog: { capture } });
    track("search", { query_len: 1 });
    expect(capture).toHaveBeenCalledOnce();
  });

  it("never throws without a window or a sink", () => {
    expect(() => track("search", { query_len: 1 })).not.toThrow();
    vi.stubGlobal("window", {});
    expect(() => track("search", { query_len: 1 })).not.toThrow();
  });
});
