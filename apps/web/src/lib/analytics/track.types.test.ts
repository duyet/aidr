/**
 * Compile-time contract, checked by `check-types` (tsc covers test files).
 * Each `@ts-expect-error` fails the type check if its line compiles, so a
 * loosened registry type breaks the build, not just this file.
 */
import { describe, expectTypeOf, it } from "vitest";
import type { ReaderBg, ReaderDensity, TldrCount } from "../prefs";
import type { EventParams, PREF_VALUES } from "./events";
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
});
