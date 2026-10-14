import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SITE_LINKS } from "../../components/header/lib";
import { EVENTS, NAV_TARGETS } from "./events";
import { readCampaign } from "./landing";
import { SLUG_RE } from "./schema";

const SRC = join(__dirname, "..", "..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [full]
      : [];
  });
}

const TRACK_CALL = /\btrack\(\s*"([a-z_]+)"\s*,\s*\{([^}]*)\}/g;

function literalSlugParams() {
  const found: { file: string; event: string; param: string; value: string }[] =
    [];
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    for (const [, event, body] of text.matchAll(TRACK_CALL)) {
      const spec = EVENTS[event as keyof typeof EVENTS];
      if (!spec) continue;
      for (const [param, kind] of Object.entries(spec.params)) {
        const isNavTarget = event === "nav_click" && param === "to";
        if (kind.kind !== "slug" && !isNavTarget) continue;
        const literal = body.match(new RegExp(`\\b${param}:\\s*"([^"]*)"`));
        if (literal) {
          found.push({
            file: file.slice(SRC.length + 1),
            event,
            param,
            value: literal[1],
          });
        }
      }
    }
  }
  return found;
}

describe("slug params written in source", () => {
  const found = literalSlugParams();

  it("finds the nav_click call sites it is meant to guard", () => {
    expect(found.filter((f) => f.event === "nav_click").length).toBeGreaterThan(
      5
    );
  });

  it("is a listed NAV_TARGET or passes SLUG_RE for every literal, so normalizeParams never drops it", () => {
    const rejected = found.filter(
      (f) =>
        !SLUG_RE.test(f.value) &&
        !(NAV_TARGETS as readonly string[]).includes(f.value)
    );
    expect(rejected).toEqual([]);
  });

  it("lists every SITE_LINKS id in NAV_TARGETS", () => {
    const listed: readonly string[] = NAV_TARGETS;
    expect(SITE_LINKS.filter((l) => !listed.includes(l.id))).toEqual([]);
  });

  it("keeps the two /data tab links distinguishable", () => {
    const tabs = found
      .filter(
        (f) =>
          f.file.endsWith("NewsFooter.tsx") ||
          f.file.endsWith("GetAIDRMenu.tsx")
      )
      .map((f) => f.value)
      .filter((v) => v.startsWith("/data/"));
    expect(tabs.sort()).toEqual(["/data/algo", "/data/runs"]);
  });
});

describe("campaign values vs SLUG_RE", () => {
  it.each([
    "digest-2026-10-14",
    "weekly-2026-W42",
    "story",
    "lead",
    "button",
    "link",
  ])("keeps the utm value %s that the Worker emits", (value) => {
    expect(SLUG_RE.test(value)).toBe(true);
    expect(readCampaign(`?utm_campaign=${value}&utm_content=${value}`)).toEqual(
      { utm_campaign: value, utm_content: value }
    );
  });

  it("drops a utm value SLUG_RE rejects, so landing never promises a param track() drops", () => {
    expect(SLUG_RE.test("a:b")).toBe(false);
    expect(readCampaign("?utm_campaign=a:b")).toBeNull();
  });
});
