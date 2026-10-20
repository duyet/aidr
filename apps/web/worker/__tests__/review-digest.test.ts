import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  autoChecks,
  type DigestInput,
  numberMentions,
  RUBRIC,
  scoreDigest,
} from "../../scripts/review/digest";

const fixture = (name: string): DigestInput =>
  JSON.parse(
    readFileSync(
      resolve(
        __dirname,
        "../../scripts/review/fixtures",
        `digest-${name}.json`
      ),
      "utf8"
    )
  ) as DigestInput;

const sourceId = (input: DigestInput, bullet: number) =>
  input.bullets_en[bullet].item_ids[0].slice(0, 8);

describe("digest review rubric", () => {
  it("is a 10-point rubric with every automatic row scored", () => {
    expect(RUBRIC.reduce((sum, row) => sum + row.points, 0)).toBe(10);
    const report = scoreDigest(fixture("good"));
    expect(report.rows.filter((r) => r.auto).length).toBe(8);
    expect(report.lost).toBe(0);
  });

  it("passes every automatic row on a real edition", () => {
    const result = autoChecks(fixture("good"));
    for (const [row, reasons] of Object.entries(result)) {
      expect(reasons, row).toEqual([]);
    }
  });

  it("fails count when an edition has fewer bullets than its stories need", () => {
    const { count } = autoChecks(fixture("short"));
    expect(count.join("\n")).toMatch(/EN has 1 bullets, under the floor of 3/);
    expect(count.join("\n")).toMatch(/VI has 1 bullets/);
  });

  it("fails count at zero and over the 16 cap", () => {
    const good = fixture("good");
    const empty = autoChecks({ ...good, bullets_vi: [] }).count;
    expect(empty).toContain("VI has no bullets");
    const bullet = good.bullets_en[0];
    const over = autoChecks({
      ...good,
      bullets_en: Array.from({ length: 17 }, () => bullet),
    }).count;
    expect(over.join()).toMatch(/EN has 17 bullets, over 16/);
  });

  it("fails length for a headline-sized bullet and names it", () => {
    const input = fixture("length");
    const { length } = autoChecks(input);
    expect(length).toHaveLength(1);
    expect(length[0]).toContain("EN bullet 2");
    expect(length[0]).toContain(sourceId(input, 1));
  });

  it("fails ids for a bullet citing an unknown id and a story without a URL", () => {
    const input = fixture("ids");
    const { ids } = autoChecks(input);
    expect(ids.join("\n")).toMatch(
      /EN bullet 1 \(dddddddd\).*not in the edition/
    );
    expect(ids.join("\n")).toMatch(
      new RegExp(`${sourceId(input, 2)}, which has no URL`)
    );
  });

  it("fails dupes when two bullets cite the same story", () => {
    const input = fixture("dupes");
    const { dupes } = autoChecks(input);
    expect(dupes.join("\n")).toContain(
      `EN bullet 3 (${sourceId(input, 0)}) repeats item ${sourceId(input, 0)} from bullet 1`
    );
  });

  it("fails dupes when two ids share one URL", () => {
    const input = fixture("good");
    const [a, , c] = input.stories;
    const twin = { ...c, url: a.url };
    const { dupes } = autoChecks({
      ...input,
      stories: input.stories.map((s) => (s.id === c.id ? twin : s)),
      sources: input.sources.map((s) =>
        s.id === c.id ? { ...s, url: a.url } : s
      ),
    });
    expect(dupes.join("\n")).toMatch(/repeats the URL of/);
  });

  it("fails parity when VI cites the stories in another order", () => {
    const { parity } = autoChecks(fixture("parity"));
    expect(parity.join("\n")).toMatch(
      /bullet 1: EN cites \[980d4d8b\], VI cites \[d4a07755\]/
    );
  });

  it("fails language when a VI bullet is the English text", () => {
    const { language } = autoChecks(fixture("language"));
    expect(language.join("\n")).toMatch(/VI bullet 2 .*not Vietnamese/);
    expect(language.join("\n")).toMatch(/VI bullet 2 .*copy of the EN bullet/);
  });

  it("fails language for a VI column that is all English", () => {
    const good = fixture("good");
    const { language } = autoChecks({
      ...good,
      bullets_vi: good.bullets_en,
    });
    expect(language.join("\n")).toMatch(/no Vietnamese text at all/);
  });

  it("fails numbers for a figure absent from the source and a VI magnitude slip", () => {
    const input = fixture("numbers");
    const { numbers } = autoChecks(input);
    expect(numbers.join("\n")).toContain(
      `EN bullet 1 (${sourceId(input, 0)}): "17.3B" is not in its source items`
    );
    expect(numbers.join("\n")).toMatch(/VI bullet 3 .*"4,4 triệu"/);
  });

  it("passes VI numbers written the Vietnamese way", () => {
    const bad = fixture("numbers");
    expect(autoChecks(bad).numbers.join()).not.toMatch(
      /16,3 tỷ|2 nghìn tỷ|80,7 tỷ/
    );
  });

  it("fails voice for first person and page chrome, in both languages", () => {
    const { voice } = autoChecks(fixture("voice"));
    const text = voice.join("\n");
    expect(text).toMatch(/EN bullet 2 .*first person "We"/);
    expect(text).toMatch(/VI bullet 1 .*first person "Chúng tôi"/i);
    expect(text).toMatch(/VI bullet 1 .*chrome/);
  });

  it("does not flag a quoted first person or the country US", () => {
    const good = fixture("good");
    const en = good.bullets_en.map((b, i) =>
      i === 0
        ? { ...b, text: `${b.text} The CEO said "we will grow" in the US.` }
        : b
    );
    expect(autoChecks({ ...good, bullets_en: en }).voice).toEqual([]);
  });

  it("reads magnitude and separators the way both languages write them", () => {
    const values = (text: string) =>
      numberMentions(text).flatMap((m) => m.values);
    expect(values("$16.3B")).toContain(16.3e9);
    expect(values("16,3 tỷ USD")).toContain(16.3e9);
    expect(values("2 nghìn tỷ")).toContain(2e12);
    expect(values("300.000 ứng viên")).toContain(300000);
    expect(values("300,000 candidates")).toContain(300000);
    expect(numberMentions("S-1 filing, 3 labs")).toEqual([]);
  });
});
