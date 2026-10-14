/**
 * Compile-time contract, checked by `check-types` (tsc covers test files).
 * Each `@ts-expect-error` fails the type check if its line compiles, so a
 * loosened registry type breaks the build, not just this file.
 */
import { describe, expectTypeOf, it } from "vitest";
import type { ReaderBg, ReaderDensity, TldrCount } from "../prefs";
import type { EventParams, PREF_VALUES } from "./events";
import { feedTag, parseSlug, type Slug } from "./schema";
import { track } from "./track";

describe("track() types", () => {
  it("accepts registry events with their exact params", () => {
    track("source_click", { item_id: "deadbeef", placement: "dialog" });
    track("media_open", { media: "thumb" });
    track("prefs_change", { pref: "bg", pref_value: "cream" });
    track("prefs_change", { pref: "reset" });
  });

  it("rejects an unknown or renamed event", () => {
    // @ts-expect-error renamed to source_click
    track("story_open", { item_id: "deadbeef" });
    // @ts-expect-error not an event
    track("made_up_event", {});
  });

  it("rejects a param outside the row", () => {
    // @ts-expect-error free text has no param
    track("search", { query_len: 3, query: "hi" });
  });

  it("rejects a missing required param", () => {
    // @ts-expect-error placement is required
    track("source_click", { item_id: "deadbeef" });
  });

  it("rejects an enum value outside the list", () => {
    // @ts-expect-error "modal" is not a calendar placement
    track("calendar_open", { placement: "modal" });
  });

  it("rejects a wrong value type", () => {
    // @ts-expect-error query_len is a count
    track("search", { query_len: "3" });
  });

  it("ties a pref value to its setting", () => {
    // @ts-expect-error "serif" is a font, not a background
    track("prefs_change", { pref: "bg", pref_value: "serif" });
    // @ts-expect-error fontSize has no enum value
    track("prefs_change", { pref: "fontSize", pref_value: "on" });
  });

  it("reports every value of the enum-valued reader settings", () => {
    expectTypeOf<
      (typeof PREF_VALUES)["bg"][number]
    >().toEqualTypeOf<ReaderBg>();
    expectTypeOf<
      (typeof PREF_VALUES)["density"][number]
    >().toEqualTypeOf<ReaderDensity>();
    expectTypeOf<
      (typeof PREF_VALUES)["tldrCount"][number]
    >().toEqualTypeOf<`${TldrCount}`>();
    expectTypeOf<EventParams<"lang_change">["lang"]>().toEqualTypeOf<
      "vi" | "en"
    >();
  });

  it("rejects free text for a label param, accepts a feed tag or UI label", () => {
    const query: string = "a reader's search text";
    // @ts-expect-error a plain string is not a FeedTag
    track("topic_filter", { tag: query, from: "search" });
    // @ts-expect-error a string literal that is not a UI label
    track("topic_filter", { tag: "Open Source", from: "nav" });
    track("topic_filter", { tag: "all", from: "nav" });
    const tag = feedTag(query, ["Open Source"]);
    if (tag) track("topic_filter", { tag, from: "search" });
  });

  it("rejects free text for a slug param, accepts a parsed slug", () => {
    const campaign: string = "digest-2026-10-14";
    track("channel_landing", {
      channel: "email",
      page_type: "home",
      page_path: "/",
      // @ts-expect-error a plain string is not a Slug
      utm_campaign: campaign,
    });
    const utm_campaign = parseSlug(campaign);
    if (utm_campaign) {
      track("channel_landing", {
        channel: "email",
        page_type: "home",
        page_path: "/",
        utm_campaign,
      });
    }
    expectTypeOf<EventParams<"web_vitals">["metric_id"]>().toEqualTypeOf<
      Slug | undefined
    >();
  });

  it("limits nav_click.to to the NAV_TARGETS list", () => {
    const href: string = "/search?q=jane doe";
    // @ts-expect-error a plain string is not a nav target
    track("nav_click", { to: href, placement: "header" });
    // @ts-expect-error not a listed target
    track("nav_click", { to: "/search", placement: "header" });
    track("nav_click", { to: "/data/runs", placement: "footer" });
  });
});
