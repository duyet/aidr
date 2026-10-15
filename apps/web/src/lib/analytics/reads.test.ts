/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readChannelFor, recordRead } from "./reads";

const ITEM = "abcdef12deadbeef";

describe("readChannelFor", () => {
  it.each([
    [
      "?utm_source=telegram&utm_medium=social&utm_campaign=digest-2026-10-16",
      "telegram",
    ],
    ["?ref=extension", "extension"],
    ["", "web"],
    ["?utm_source=newsletterX", "other"],
  ])("%s is %s (defect: a telegram link counted as web)", (search, channel) => {
    expect(readChannelFor(search)).toBe(channel);
  });
});

describe("recordRead", () => {
  let beacon: ReturnType<typeof vi.fn>;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    sessionStorage.clear();
    beacon = vi.fn(() => true);
    fetchMock = vi.fn(() => Promise.resolve(new Response(null)));
    vi.stubGlobal("fetch", fetchMock);
    Object.defineProperty(navigator, "sendBeacon", {
      value: beacon,
      configurable: true,
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function sentBody(): Promise<unknown> {
    const blob = beacon.mock.calls[0][1] as Blob;
    return JSON.parse(await blob.text());
  }

  it("sends one beacon per story, kind and tab (defect: re-expanding a row inflates reads)", async () => {
    recordRead(ITEM, "open");
    recordRead(ITEM, "open");
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe("/api/read");
    expect(await sentBody()).toEqual({
      item_id: ITEM,
      kind: "open",
      channel: "web",
    });
    recordRead(ITEM, "outbound");
    expect(beacon).toHaveBeenCalledTimes(2);
  });

  it("falls back to a keepalive fetch when the beacon is refused", () => {
    beacon.mockReturnValue(false);
    recordRead(ITEM, "outbound");
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/read",
      expect.objectContaining({ method: "POST", keepalive: true })
    );
  });

  it("still counts when storage throws, and never throws itself", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    beacon.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => recordRead(ITEM, "open")).not.toThrow();
    expect(beacon).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
