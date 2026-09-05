import { track } from "@aidr/ui/track";
import { describe, expect, it, vi, afterEach } from "vitest";
import {
  campaignTrackParams,
  isExtensionCampaign,
  loadPersistedCampaign,
  persistCampaign,
  readCampaign,
  resolveCampaign,
} from "./campaign";

describe("readCampaign", () => {
  it("reads ref and utm from a query string", () => {
    expect(
      readCampaign(
        "?ref=extension&utm_source=extension&utm_medium=newtab&utm_campaign=aidr_ext&utm_content=story"
      )
    ).toEqual({
      ref: "extension",
      utm_source: "extension",
      utm_medium: "newtab",
      utm_campaign: "aidr_ext",
      utm_content: "story",
    });
  });

  it("drops junk and empty values", () => {
    expect(readCampaign("?ref=<script>&utm_source=")).toBeNull();
    expect(readCampaign("")).toBeNull();
  });
});

describe("isExtensionCampaign", () => {
  it("matches ref or utm_source", () => {
    expect(isExtensionCampaign({ ref: "extension" })).toBe(true);
    expect(isExtensionCampaign({ utm_source: "extension" })).toBe(true);
    expect(isExtensionCampaign({ utm_source: "telegram" })).toBe(false);
    expect(isExtensionCampaign(null)).toBe(false);
  });
});

describe("campaignTrackParams", () => {
  it("sets traffic_source for extension landings", () => {
    expect(
      campaignTrackParams({
        ref: "extension",
        utm_content: "tldr",
      })
    ).toEqual({
      ref: "extension",
      utm_content: "tldr",
      traffic_source: "extension",
    });
  });
});

describe("resolveCampaign", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    try {
      sessionStorage.clear();
    } catch {
      // ignore
    }
  });

  it("persists URL campaign and reuses it later", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    });

    const first = resolveCampaign({
      search: "?ref=extension&utm_source=extension&utm_content=brand",
      pathname: "/",
    });
    expect(first?.utm_content).toBe("brand");
    expect(first?.landed_path).toBe("/");

    const second = resolveCampaign({ search: "", pathname: "/about" });
    expect(second?.ref).toBe("extension");
    expect(second?.utm_content).toBe("brand");
  });

  it("persist + load round-trip", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    });
    persistCampaign({ ref: "extension", utm_source: "extension" });
    expect(loadPersistedCampaign()?.ref).toBe("extension");
  });
});

describe("extension landing telemetry shape", () => {
  it("is a valid track event name and params", () => {
    const gtag = vi.fn();
    vi.stubGlobal("window", { gtag });
    const params = campaignTrackParams({
      ref: "extension",
      utm_source: "extension",
      utm_medium: "newtab",
      utm_campaign: "aidr_ext",
      utm_content: "story",
      landed_path: "/ai/deadbeef",
    });
    track("extension_landing", params);
    expect(gtag).toHaveBeenCalledWith(
      "event",
      "extension_landing",
      expect.objectContaining({
        ref: "extension",
        utm_source: "extension",
        traffic_source: "extension",
        surface: "web",
      })
    );
  });
});
