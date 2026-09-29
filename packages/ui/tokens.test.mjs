// The web look is the source of truth; the extension must paint with the same
// tokens. These tests fail when the two surfaces drift apart.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, rel), "utf8");
const tokensCss = read("tokens.css");

/** Custom properties declared directly in the first block after `selector`. */
function tokensOf(css, selector) {
  const start = css.indexOf(selector);
  assert.ok(start >= 0, `selector ${JSON.stringify(selector)} missing`);
  const open = css.indexOf("{", start);
  const body = css.slice(open + 1, css.indexOf("}", open));
  const out = {};
  for (const m of body.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) {
    out[m[1]] = m[2].replace(/\s+/g, " ").trim();
  }
  return out;
}

const light = tokensOf(tokensCss, ":root {");
const dark = tokensOf(tokensCss, 'html[data-theme="dark"] {');
const system = tokensOf(tokensCss, 'html[data-theme="system"] {');

test("extension ships a byte-identical copy of the shared tokens", () => {
  assert.equal(
    read("../../apps/extension/css/tokens.css"),
    tokensCss,
    "run `pnpm --filter @aidr/ui sync-tokens`"
  );
});

test("every extension page loads tokens.css before newtab.css", () => {
  for (const page of ["newtab", "options", "privacy"]) {
    const html = read(`../../apps/extension/${page}.html`);
    const tokens = html.indexOf('href="css/tokens.css"');
    const newtab = html.indexOf('href="css/newtab.css"');
    assert.ok(tokens >= 0, `${page}.html must link css/tokens.css`);
    assert.ok(tokens < newtab, `${page}.html: tokens.css must load first`);
  }
});

test("extension stylesheet does not redefine shared color tokens", () => {
  const newtab = read("../../apps/extension/css/newtab.css");
  const root = tokensOf(newtab, ":root {");
  const shared = Object.keys(light).filter((name) => name in root);
  assert.deepEqual(
    shared,
    [],
    "shared tokens belong in packages/ui/tokens.css"
  );
});

test("dark and OS-dark (system) blocks are identical", () => {
  assert.deepEqual(system, dark);
});

test("every themed light token has a dark value", () => {
  // Fonts and radius are theme-independent, and white-on-red stays white;
  // every other color must be declared for dark mode.
  const themeless =
    /^(editorial-font-|content-font-|radius$|destructive-foreground$)/;
  const missing = Object.keys(light).filter(
    (name) => !themeless.test(name) && !(name in dark)
  );
  assert.deepEqual(missing, []);
});

test("web styles.css tokens match the shared tokens", () => {
  // apps/web/src/styles.css still declares its own :root/.dark blocks;
  // they must stay value-identical to tokens.css until they are removed.
  const web = read("../../apps/web/src/styles.css");
  assert.deepEqual(tokensOf(web, ":root {"), light);
  assert.deepEqual(tokensOf(web, ":root.dark,\n.dark {"), dark);
});

test("font stacks resolve to the extension's bundled faces", () => {
  const newtab = read("../../apps/extension/css/newtab.css");
  for (const family of ["Source Sans 3", "EB Garamond"]) {
    assert.match(newtab, new RegExp(`font-family: "${family}";`));
  }
  assert.match(light["content-font-sans"], /"Source Sans 3"/);
  assert.match(light["editorial-font-serif"], /"EB Garamond"/);
});
