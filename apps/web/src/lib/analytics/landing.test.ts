import { describe, expect, it } from "vitest";
import {
  landingChannel,
  landingFromUrl,
  pageType,
  readCampaign,
} from "./landing";

describe("landingFromUrl", () => {
  it("classifies a Facebook landing with its campaign slot", () => {
    expect(
      landingFromUrl(
        "?utm_source=facebook&utm_medium=social&utm_campaign=digest&utm_content=post",
        "/"
      )
    ).toEqual({
      channel: "facebook",
      page_type: "home",
      page_path: "/",
      utm_medium: "social",
      utm_campaign: "digest",
      utm_content: "post",
    });
  });

  it("classifies a YouTube landing", () => {
    expect(landingFromUrl("?utm_source=youtube&utm_medium=video", "/")).toEqual(
      {
        channel: "youtube",
        page_type: "home",
        page_path: "/",
        utm_medium: "video",
      }
    );
  });

  it("counts the extension's ref even when utm_source is absent", () => {
    expect(landingFromUrl("?ref=extension", "/")?.channel).toBe("extension");
  });

  it("buckets an unknown utm_source as other instead of dropping it", () => {
    expect(landingFromUrl("?utm_source=newsletter-x", "/")?.channel).toBe(
      "other"
    );
  });

  it("types a story permalink landing as a story", () => {
    expect(landingFromUrl("?utm_source=telegram", "/abcdef12")).toMatchObject({
      channel: "telegram",
      page_type: "story",
    });
  });

  it("is null without campaign params, so a plain visit is not a landing", () => {
    expect(landingFromUrl("", "/")).toBeNull();
    expect(landingFromUrl("?lang=en&q=agents", "/")).toBeNull();
  });

  it("is null when no ref or utm_source names a source to classify", () => {
    expect(landingFromUrl("?utm_medium=social", "/")).toBeNull();
  });
});

describe("landingChannel", () => {
  it("prefers a known channel in either ref or utm_source", () => {
    expect(landingChannel({ ref: "partner", utm_source: "email" })).toBe(
      "email"
    );
    expect(landingChannel(null)).toBeNull();
  });
});

describe("pageType", () => {
  it.each([
    ["/", "home"],
    ["/abcdef12", "story"],
    ["/some-title-abcdef12", "story"],
    ["/date/2026-10-01", "day"],
    ["/week/2026-W40", "week"],
    ["/weeks", "week"],
    ["/calendar", "calendar"],
    ["/data", "data"],
    ["/subscribe", "subscribe"],
    ["/about", "about"],
    ["/brand", "other"],
    ["/cat/abcdef12", "other"],
  ])("%s is %s", (path, expected) => {
    expect(pageType(path)).toBe(expected);
  });
});

describe("readCampaign", () => {
  it("drops junk and empty values", () => {
    expect(readCampaign("?ref=<script>&utm_source=")).toBeNull();
    expect(readCampaign("")).toBeNull();
  });
});
