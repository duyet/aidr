import { describe, expect, it } from "vitest";
import { highlightBulletText } from "../notify/day-card.js";
import {
  dedupReason,
  eventKey,
  type PostedEvent,
  postability,
  sameEvent,
} from "../notify/post-quality.js";
import { canonicalOf } from "../notify/posted-events.js";
import { hasSourceChrome, stripEmbeddedChrome } from "../translation-terms.js";

const GOOD_SUMMARY =
  "Nvidia is in early talks to acquire Reflection AI in a deal that may involve an acqui-hire to avoid full merger review.";

describe("postability", () => {
  it("accepts a plain summary of real length", () => {
    expect(postability({ title: "T", summary: GOOD_SUMMARY })).toEqual({
      ok: true,
    });
  });

  it("rejects a title-only story", () => {
    for (const summary of [null, undefined, "", "   "]) {
      expect(postability({ title: "T", summary })).toEqual({
        ok: false,
        reason: "missing",
      });
    }
  });

  it("rejects a summary that is source chrome, as msg 93 posted it", () => {
    expect(
      postability({
        title: "T",
        summary: `← Back to live feed · 1 stories across 1 day ${GOOD_SUMMARY}`,
      })
    ).toEqual({ ok: false, reason: "chrome" });
  });

  it("rejects the aggregator stub, as msg 89 posted it", () => {
    expect(
      postability({
        title: "T",
        summary: "From Bloomberg. View the full context on Techmeme.",
      })
    ).toEqual({ ok: false, reason: "chrome" });
  });

  it("rejects chrome that sits after the first sentence", () => {
    expect(
      postability({
        title: "T",
        summary: `${GOOD_SUMMARY} View the full context on Techmeme.`,
      })
    ).toEqual({ ok: false, reason: "chrome" });
  });

  it("rejects a stub below the length floor", () => {
    expect(postability({ title: "T", summary: "Raised $5M." })).toEqual({
      ok: false,
      reason: "short",
    });
  });

  it("does not mistake article prose for chrome", () => {
    expect(
      hasSourceChrome("Shares went back to top form after the report.")
    ).toBe(false);
    expect(
      hasSourceChrome("It is a 5 min read about how the context was lost.")
    ).toBe(false);
  });
});

describe("stripEmbeddedChrome", () => {
  it("removes chrome from the middle of a digest line", () => {
    expect(
      stripEmbeddedChrome(
        "Microsoft Launches Decision-1 — ← Back to live feed · 1 stories across 1 day Satya Nadella unveiled a tool."
      )
    ).toBe("Microsoft Launches Decision-1 — Satya Nadella unveiled a tool.");
  });

  it("leaves clean text alone", () => {
    expect(stripEmbeddedChrome("Anthropic bans cruelty toward Claude.")).toBe(
      "Anthropic bans cruelty toward Claude."
    );
  });
});

describe("sameEvent", () => {
  const key = eventKey;

  it("matches one deal reported by two outlets (audit pair, 0.21)", () => {
    expect(
      sameEvent(
        key("Nvidia in talks to acquire US 'open' model startup Reflection AI"),
        key("Nvidia Negotiates $25B Reflection AI Deal to Avoid Antitrust")
      )
    ).toBe(true);
  });

  it("matches the TypeSafe round when both headlines name the round (audit pair, 0.35)", () => {
    expect(
      sameEvent(
        key(
          "Jev developer TypeSafe AI raised ~$870M led by a16z at a $7.5B valuation with Sequoia and others participating (Bloomberg)"
        ),
        key(
          "The maker of non-text AI model Jev valued at $7.5B just weeks after launch, TypeSafe AI raised $870 million in a round led by a16Z"
        )
      )
    ).toBe(true);
  });

  it("keeps two different Nvidia stories apart", () => {
    expect(
      sameEvent(
        key("Nvidia Negotiates $25B Reflection AI Deal to Avoid Antitrust"),
        key(
          "Nvidia, Oracle, CoreWeave, and other AI stocks fell after OpenAI revenue report"
        )
      )
    ).toBe(false);
    expect(
      sameEvent(
        key("Nvidia launches Rubin GPU"),
        key("Nvidia stock falls on Rubin delay")
      )
    ).toBe(false);
  });

  it("needs a shared entity, not just shared filler words", () => {
    expect(
      sameEvent(
        key("Startup raises $500M to expand its agent platform worldwide"),
        key("Another startup raises $500M to expand its agent platform")
      )
    ).toBe(false);
  });
});

describe("dedupReason", () => {
  const posted = (
    itemId: string,
    canonicalId: string,
    title: string
  ): PostedEvent => ({
    channelGroup: "telegram-en",
    itemId,
    canonicalId,
    eventKey: eventKey(title),
    postedAt: 0,
    kind: "trending",
  });
  const candidate = (id: string, canonicalId: string, title: string) => ({
    itemId: id,
    canonicalId,
    eventKey: eventKey(title),
  });

  it("matches on the shared canonical id first", () => {
    expect(
      dedupReason(candidate("c", "root", "Unrelated headline about robots"), [
        posted("p", "root", "Totally different words about chips"),
      ])
    ).toBe("canonical");
  });

  it("falls back to the event key", () => {
    expect(
      dedupReason(
        candidate(
          "c",
          "c",
          "OpenAI's Navier-Stokes proof: mathematics mistranslated into code"
        ),
        [
          posted(
            "p",
            "p",
            "OpenAI mistranslated mathematics into code for its Navier-Stokes proof"
          ),
        ]
      )
    ).toBe("event");
  });

  it("lets an unrelated story through", () => {
    expect(
      dedupReason(
        candidate("c", "c", "Odyssey-3 is a new generative world model"),
        [posted("p", "p", "Nvidia Negotiates $25B Reflection AI Deal")]
      )
    ).toBeNull();
  });
});

describe("canonicalOf", () => {
  it("follows a duplicate_of chain to its root and survives a cycle", () => {
    const chain = new Map<string, string | null>([
      ["a", "b"],
      ["b", "c"],
      ["c", null],
    ]);
    expect(canonicalOf("a", chain)).toBe("c");
    expect(canonicalOf("c", chain)).toBe("c");
    const cycle = new Map<string, string | null>([
      ["a", "b"],
      ["b", "a"],
    ]);
    expect(["a", "b"]).toContain(canonicalOf("a", cycle));
  });
});

describe("digest line summary clause", () => {
  it("drops page chrome instead of using it as the clause", () => {
    const item = {
      title: "Microsoft Launches Decision-1 Model to Beat LLM Latency",
      title_vi: null,
      summary:
        "← Back to live feed · 1 stories across 1 day Satya Nadella unveiled a tool for rapid structured decisions.",
      summary_vi: null,
    };
    expect(highlightBulletText(item, "en")).toBe(
      "Microsoft Launches Decision-1 Model to Beat LLM Latency — Satya Nadella unveiled a tool for rapid structured decisions."
    );
  });
});
