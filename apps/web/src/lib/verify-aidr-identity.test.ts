import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SITE_NAME, SITE_TITLE } from "./site";

const cli = readFileSync(
  new URL(
    "../../../../.agents/skills/verify-aidr/bin/verify-aidr",
    import.meta.url
  ),
  "utf8"
);

function homeIdentity(): string[] {
  const block = /const HOME_IDENTITY = \[([\s\S]*?)\];/.exec(cli)?.[1];
  if (!block) throw new Error("HOME_IDENTITY not found in verify-aidr");
  return [...block.matchAll(/"([^"]*)"/g)].map((match) => match[1]);
}

// `verify-aidr doctor` fails when any identity string is missing from the
// live homepage. #1052 renamed the title and left the old one here, so
// doctor reported every healthy deploy as broken.
describe("verify-aidr homepage identity", () => {
  it("checks for the title the homepage serves", () => {
    expect(homeIdentity()).toContain(SITE_TITLE);
    expect(homeIdentity()).toContain(SITE_NAME);
  });

  it("checks no other ranked-digest title", () => {
    const titles = homeIdentity().filter((s) => s.includes("ranked AI digest"));
    expect(titles).toEqual([SITE_TITLE]);
  });
});
