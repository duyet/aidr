import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  autoChecks,
  type CardInput,
  PNG_BYTE_BUDGET,
  pngSize,
  RUBRIC,
  scoreCard,
} from "../../scripts/review/card";

const FIXTURES = resolve(__dirname, "../../scripts/review/fixtures");

function fixture(name: string): CardInput {
  return JSON.parse(readFileSync(resolve(FIXTURES, name), "utf8"));
}

/** The good 2026-10-21 four-story card with one change applied to EN. */
function withEn(change: (en: CardInput["langs"][number]) => void): CardInput {
  const input = fixture("card-good.json");
  const en = input.langs.find((l) => l.lang === "en");
  if (!en) throw new Error("fixture has no en card");
  change(en);
  return input;
}

const LEAD = "8ed1599eb95bc766b10165793bb5e4e829601d1922e97e695a52da29fe369d68";
const THIRD =
  "3368e02f484edc23efd1c6136de01b0671f4745cace10562529ff1840597f7fe";

describe("card review", () => {
  it("weighs ten points across its rows", () => {
    expect(RUBRIC.reduce((sum, row) => sum + row.points, 0)).toBe(10);
  });

  it("passes every automatic row on a four-story day that shows all four", () => {
    const input = fixture("card-good.json");
    expect(input.langs.every((l) => l.tiles.length === 4)).toBe(true);
    for (const [id, why] of Object.entries(autoChecks(input))) {
      expect(why, id).toEqual([]);
    }
    const report = scoreCard(input);
    expect(report.earned).toBe(8);
    expect(report.open).toBe(2);
  });

  it("fails render-size on a card that is not 1200x630 or is over 5 MB", () => {
    const why = autoChecks(
      withEn((en) => {
        en.images[0].width = 800;
        en.images.push({
          ...en.images[0],
          width: 1200,
          url: "big",
          bytes: PNG_BYTE_BUDGET + 1,
        });
      })
    )["render-size"];
    expect(why.some((w) => w.includes("800x630"))).toBe(true);
    expect(why.some((w) => w.includes("big") && w.includes("bytes"))).toBe(
      true
    );
  });

  it("fails tile-count when a four-story day drops a story (#952)", () => {
    const why = autoChecks(withEn((en) => en.tiles.pop()))["tile-count"];
    expect(why[0]).toContain("3 tiles for 4 stories, want 4");
  });

  it("fails tile-count when tiles leave pickDayCardItems order", () => {
    const why = autoChecks(withEn((en) => en.tiles.reverse()))["tile-count"];
    expect(why.some((w) => w.includes(`gives ${LEAD}`))).toBe(true);
  });

  it("fails fit-320 on the real six-tile card whose tiles draw at 18 px", () => {
    const why = autoChecks(fixture("card-small-tiles.json"))["fit-320"];
    expect(why.some((w) => /under 6$/.test(w))).toBe(true);
    expect(why.some((w) => w.includes("cut to"))).toBe(true);
  });

  it("fails fit-320 when a headline is cut, naming the story", () => {
    const why = autoChecks(
      withEn((en) => {
        const h = en.headlines.find((x) => x.id === THIRD);
        if (h) h.text = "Expanding our…";
      })
    )["fit-320"];
    expect(why).toEqual([`en ${THIRD}: cut to "Expanding our…"`]);
  });

  it("fails no-repeat when one story takes two tiles", () => {
    const why = autoChecks(withEn((en) => (en.tiles[3] = LEAD)))["no-repeat"];
    expect(why).toContain(`en ${LEAD}: on two tiles`);
  });

  it("fails lang-copy when a VI tile has only its English headline", () => {
    const input = fixture("card-good.json");
    const vi = input.langs.find((l) => l.lang === "vi");
    const item = vi?.items.find((i) => i.id === THIRD);
    if (!item) throw new Error("fixture lost its third story");
    item.title_vi = null;
    expect(autoChecks(input)["lang-copy"][0]).toContain(`vi ${THIRD}`);
  });

  it("reads PNG dimensions from the IHDR chunk", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const view = new DataView(png.buffer);
    view.setUint32(16, 1200);
    view.setUint32(20, 630);
    expect(pngSize(png)).toEqual({ width: 1200, height: 630 });
    expect(pngSize(new Uint8Array(24))).toEqual({ width: 0, height: 0 });
  });
});
