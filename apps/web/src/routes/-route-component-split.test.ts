/**
 * TanStack's code splitter leaves a route component in the entry chunk when
 * the route file also exports it. `/data` did that and shipped ~370 KB of
 * charts to every homepage visit (#863).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const routesDir = __dirname;
const routeFiles = readdirSync(routesDir).filter(
  (name) => name.endsWith(".tsx") && !name.startsWith("-")
);

describe("route components stay code-split", () => {
  it.each(routeFiles)("%s does not export its route component", (file) => {
    const src = readFileSync(join(routesDir, file), "utf8");
    const component = src.match(/\bcomponent:\s*([A-Za-z_$][\w$]*)\s*,/)?.[1];
    if (!component) return;
    const exported = new RegExp(
      `export\\s+(?:default\\s+)?(?:async\\s+)?(?:function|const|let|class)\\s+${component}\\b|export\\s*\\{[^}]*\\b${component}\\b[^}]*\\}`
    );
    expect(src).not.toMatch(exported);
  });
});
