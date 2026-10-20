import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  autoChecks,
  type EmailCase,
  type EmailEdition,
  type EmailInput,
  GMAIL_CLIP_BYTES,
  listRouteFiles,
  RUBRIC,
  renderEdition,
} from "../../scripts/review/email";
import { scoreRubric } from "../../scripts/review/rubric";

const fixture = (name: string): EmailEdition =>
  JSON.parse(
    readFileSync(
      new URL(`../../scripts/review/fixtures/${name}`, import.meta.url),
      "utf8"
    )
  );

const routeFiles = listRouteFiles();
const good = renderEdition(fixture("email-2026-10-21.json"));
const lead8 = good[0].storyIds[0].slice(0, 8);

/** The good edition with one mail changed. */
function withCase(
  lang: EmailCase["lang"],
  change: (c: EmailCase) => Partial<EmailCase>
): EmailInput {
  return {
    routeFiles,
    cases: good.map((c) => (c.lang === lang ? { ...c, ...change(c) } : c)),
  };
}

describe("email review", () => {
  it("passes every automatic row on the stored 2026-10-21 edition", () => {
    const result = autoChecks({ cases: good, routeFiles });
    for (const row of RUBRIC.filter((r) => r.auto)) {
      expect(result[row.id], row.id).toEqual([]);
    }
    expect(scoreRubric("email", RUBRIC, result).lost).toBe(0);
  });

  it("fails size when the HTML would be clipped by Gmail", () => {
    const result = autoChecks(
      withCase("en", (c) => ({
        html: c.html + " ".repeat(GMAIL_CLIP_BYTES),
      }))
    ).size;
    expect(result.join()).toMatch(/^en: HTML is \d+ bytes/);
  });

  it("fails unsubscribe when the link, its route or the header is gone", () => {
    const noLink = autoChecks(
      withCase("vi", (c) => ({
        html: c.html.replaceAll("unsubscribe=", "x="),
      }))
    ).unsubscribe;
    expect(noLink).toContain("vi: no unsubscribe link in the HTML");

    const noRoute = autoChecks({
      cases: good,
      routeFiles: routeFiles.filter((f) => f !== "api/subscribe.ts"),
    }).unsubscribe;
    expect(noRoute.join()).toContain("List-Unsubscribe /api/subscribe");

    const noHeader = autoChecks(
      withCase("en", () => ({ headers: {} }))
    ).unsubscribe;
    expect(noHeader).toContain("en: no List-Unsubscribe header");

    const down = autoChecks({
      cases: good,
      routeFiles,
      liveUnsubscribeStatus: 500,
    }).unsubscribe;
    expect(down).toContain("live GET /subscribe answered 500");
  });

  it("fails plain-text when a story link is missing or the part is empty", () => {
    const missing = autoChecks(
      withCase("en", (c) => ({ text: c.text.replaceAll(`/${lead8}`, "/") }))
    )["plain-text"];
    expect(missing).toContain(`en: story ${lead8} has no plain-text link`);

    const empty = autoChecks(withCase("vi", () => ({ text: "  " })))[
      "plain-text"
    ];
    expect(empty).toEqual(["vi: plain-text part is empty"]);
  });

  it("fails img-alt on an image with empty alt", () => {
    const result = autoChecks(
      withCase("en", (c) => ({
        html: c.html.replace(/(<img\b[^>]*?)alt="[^"]*"/, '$1alt=""'),
      }))
    )["img-alt"];
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/^en: <img> without alt/);
  });

  it("fails subject when the VI edition carries English titles", () => {
    const bad = renderEdition(fixture("email-vi-english-titles.json"));
    const result = autoChecks({ cases: bad, routeFiles }).subject;
    expect(result.join()).toContain("vi: subject has no Vietnamese");
    expect(result.some((r) => r.startsWith("en:"))).toBe(false);
  });

  it("fails subject when it does not lead with the top story", () => {
    const result = autoChecks(
      withCase("en", () => ({ subject: "Today in AI" }))
    ).subject;
    expect(result).toEqual([`en: subject does not lead with story ${lead8}`]);
  });

  it("fails utm on a story link without the digest tag", () => {
    const result = autoChecks(
      withCase("en", (c) => ({
        html: c.html.replace(
          /href="(https:\/\/aidr\.today\/[0-9a-f]{8})[^"]*"/,
          'href="$1"'
        ),
      }))
    ).utm;
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(/^en: \/[0-9a-f]{8} lacks the digest UTM/);
  });
});
