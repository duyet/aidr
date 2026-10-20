import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  autoChecks,
  type CopyInput,
  loadCopy,
  loadFixture,
  loadLiveMeta,
  metaDescriptions,
  parseBannedTerms,
  RUBRIC,
} from "../../scripts/review/copy";
import { scoreRubric } from "../../scripts/review/rubric";

const fixtures = resolve(__dirname, "../../scripts/review/fixtures");
const good = loadFixture(resolve(fixtures, "copy-good.json"));
const bad: CopyInput = {
  ...good,
  docs: [
    {
      file: "copy-bad.md",
      text: readFileSync(resolve(fixtures, "copy-bad.md"), "utf8"),
    },
  ],
};

const withText = (text: string, base: CopyInput = good): CopyInput => ({
  ...base,
  docs: [{ file: "x.md", text }],
});

describe("rubric", () => {
  it("sums to 10 and leaves every auto row a result", () => {
    expect(() => scoreRubric("copy", RUBRIC, autoChecks(good))).not.toThrow();
  });
});

describe("good copy", () => {
  it("passes every automatic row", () => {
    const report = scoreRubric("copy", RUBRIC, autoChecks(good));
    expect(report.lost).toBe(0);
    expect(report.earned + report.open).toBe(10);
  });
});

describe("banned.words", () => {
  const why = autoChecks(bad)["banned.words"] ?? [];

  it("names the file, line, and word of each hit", () => {
    expect(why).toContain(
      'copy-bad.md:1 banned "revolutionary" (found "revolutionary")'
    );
    expect(
      why.some((w) => w.startsWith("copy-bad.md:1 ") && w.includes("real-time"))
    ).toBe(true);
    expect(
      why.some(
        (w) => w.startsWith("copy-bad.md:3 ") && w.includes("human-curated")
      )
    ).toBe(true);
  });

  it("reads the list from positioning.md, not from code", () => {
    const positioning =
      'Words to avoid: foobar, bazzle. Do not say "quux", because no.\n\n## Proof points\n\n| A | B |\n';
    const input = withText("foobar and quux and revolutionary", {
      ...good,
      positioning,
    });
    const hits = autoChecks(input)["banned.words"] ?? [];
    expect(hits.map((h) => /banned "([^"]+)"/.exec(h)?.[1])).toEqual([
      "foobar",
      "quux",
    ]);
  });

  it("parses the real positioning.md", () => {
    const real = loadCopy([]).positioning;
    expect(parseBannedTerms(real)).toEqual(
      expect.arrayContaining([
        "leverage",
        "real-time",
        "human-curated",
        "all the ai news",
      ])
    );
  });

  it("fails loud when positioning.md lists nothing to enforce", () => {
    expect(() => parseBannedTerms("# Positioning\n\nNothing here.")).toThrow(
      /no "Words to avoid/
    );
  });
});

describe("brand.spelling", () => {
  const why = autoChecks(bad)["brand.spelling"] ?? [];

  it("flags each wrong spelling with its line", () => {
    for (const [line, found] of [
      [1, "AIDR"],
      [2, "Aidr.today"],
      [2, "AI News"],
      [3, "AI DR"],
    ] as const) {
      expect(
        why.some((w) => w.startsWith(`copy-bad.md:${line} "${found}"`))
      ).toBe(true);
    }
  });

  it("accepts the brand, the domain, and the handle", () => {
    const ok = withText(
      "AI;DR lives at https://aidr.today and @aidr_today and submit@aidr.today."
    );
    expect(autoChecks(ok)["brand.spelling"]).toEqual([]);
  });

  it("allows lowercase ai news as a plain noun", () => {
    expect(
      autoChecks(withText("It ranks AI news every 30 minutes."))[
        "brand.spelling"
      ]
    ).toEqual([]);
  });
});

describe("unslop.mechanical", () => {
  const why = autoChecks(bad)["unslop.mechanical"] ?? [];
  const has = (line: number, rule: number) =>
    why.some((w) => w.startsWith(`copy-bad.md:${line} unslop ${rule} `));

  it("cites the unslop rule for each mechanical hit", () => {
    expect(has(4, 13)).toBe(true);
    expect(has(5, 8)).toBe(true);
    expect(has(5, 3)).toBe(true);
    expect(has(6, 9)).toBe(true);
    expect(has(6, 7)).toBe(true);
    expect(has(7, 23)).toBe(true);
    expect(has(8, 19)).toBe(true);
    expect(has(8, 18)).toBe(true);
    expect(has(9, 14)).toBe(true);
  });

  it("lets a colon before a link, a handle, a list, or a time through", () => {
    const ok = withText(
      "Web: https://aidr.today\nTelegram: @aihomnay\nEmail from 07:00 in your timezone.\nRead tools are:\n- one"
    );
    expect(autoChecks(ok)["unslop.mechanical"]).toEqual([]);
  });

  it("does not read a dash inside a list marker or a code span as a long dash", () => {
    const ok = withText("- first\n  - nested\nRun `a - b` once.");
    expect(autoChecks(ok)["unslop.mechanical"]).toEqual([]);
  });

  it("flags en dash and a spaced hyphen used as a dash", () => {
    const hits =
      autoChecks(withText("A – B\nC - D"))["unslop.mechanical"] ?? [];
    expect(hits).toHaveLength(2);
  });
});

describe("claim.proof", () => {
  const why = autoChecks(bad)["claim.proof"] ?? [];

  it("flags a number that is not a proof point", () => {
    expect(
      why.some(
        (w) => w.startsWith("copy-bad.md:4 ") && w.includes('"45 minutes"')
      )
    ).toBe(true);
    expect(
      why.some(
        (w) => w.startsWith("copy-bad.md:4 ") && w.includes('"12 bullets"')
      )
    ).toBe(true);
  });

  it("flags a handle, an email, and a tool name that no evidence names", () => {
    expect(why.some((w) => w.includes('"@aidr_news"'))).toBe(true);
    expect(why.some((w) => w.includes('"hello@example.com"'))).toBe(true);
    expect(why.some((w) => w.includes('"get_everything"'))).toBe(true);
  });

  it("passes numbers and names the proof points list", () => {
    const ok = withText(
      "Every 30 minutes, up to 16 bullets, 6 when one is top-tier. Use `get_ai_digest` or email submit@aidr.today. Telegram @aihomnay from 08:00."
    );
    expect(autoChecks(ok)["claim.proof"]).toEqual([]);
  });

  it("ignores digits in placeholders, dates, urls, versions, list numbers, and product names", () => {
    const ok = withText(
      "1. <headline 1>\nhttps://aidr.today/date/2026-10-21\nVersion <x.y.z> on Cloudflare D1, and Show HN."
    );
    expect(autoChecks(ok)["claim.proof"]).toEqual([]);
  });

  it("accepts a number ALGORITHM.md backs with the same unit, and rejects the wrong unit", () => {
    const base: CopyInput = {
      docs: [],
      positioning:
        "Words to avoid: foo.\n\n## Proof points\n\n| Claim | Evidence |\n|---|---|\n| A | B |\n",
      algorithm: "The digest holds up to 16 bullets per language.",
    };
    expect(
      autoChecks(withText("Up to 16 bullets.", base))["claim.proof"]
    ).toEqual([]);
    expect(
      autoChecks(withText("Up to 16 hours.", base))["claim.proof"]
    ).toHaveLength(1);
  });
});

describe("live meta", () => {
  const html = `<head><meta name="description" content="AI;DR reads the day&#x27;s news. Also called AIDR."/>
<meta property="og:description" content="AI;DR reads the day&#x27;s news. Also called AIDR."/></head>`;

  it("decodes entities and de-duplicates the description and og tags", () => {
    const docs = metaDescriptions(html, "https://aidr.today/about");
    expect(docs).toEqual([
      {
        file: "live:https://aidr.today/about#meta-description",
        text: "AI;DR reads the day's news. Also called AIDR.",
      },
    ]);
  });

  it("scores the live copy like any other doc", () => {
    const docs = metaDescriptions(html, "https://aidr.today/about");
    const why = autoChecks({ ...good, docs })["brand.spelling"] ?? [];
    expect(why[0]).toContain(
      "live:https://aidr.today/about#meta-description:1"
    );
  });

  it("throws instead of scoring when the page cannot be fetched", async () => {
    const get = (async () =>
      new Response("nope", { status: 503 })) as typeof fetch;
    await expect(loadLiveMeta(["https://aidr.today"], get)).rejects.toThrow(
      /503/
    );
  });
});
