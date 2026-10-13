import { afterEach, describe, expect, it, vi } from "vitest";
import { track } from "./track";

function sinks() {
  const gtag = vi.fn();
  const capture = vi.fn();
  vi.stubGlobal("window", { gtag, posthog: { capture } });
  return { gtag, capture };
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
    expect(gtag).toHaveBeenCalledWith("event", "search", { query_len: 4 });
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
    });
  });

  it("drops an enum value outside its list", () => {
    const { gtag } = sinks();
    // @ts-expect-error runtime guard: "modal" is not a placement
    track("calendar_open", { placement: "modal" });
    expect(gtag).toHaveBeenCalledWith("event", "calendar_open", {});
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
    });
  });

  it("keeps a feed label with spaces and drops one that is not a label", () => {
    const { gtag } = sinks();
    track("topic_filter", { tag: "Open Source", from: "nav" });
    track("topic_filter", { tag: "<script>", from: "nav" });
    expect(gtag.mock.calls.map((c) => c[2])).toEqual([
      { tag: "Open Source", from: "nav" },
      { from: "nav" },
    ]);
  });

  it("sends page_view to GA4 only; PostHog captures its own $pageview", () => {
    const { gtag, capture } = sinks();
    track("page_view", { page_path: "/", page_type: "home" });
    expect(gtag).toHaveBeenCalledOnce();
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
