import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "newtab.html"), "utf8");
const css = readFileSync(join(root, "css/newtab.css"), "utf8");
const js = readFileSync(join(root, "js/newtab.js"), "utf8");

test("new tab matches site chrome copy and typefaces", () => {
  assert.match(html, /AI news ranked and summary/);
  assert.doesNotMatch(html, /translated hourly/);
  assert.doesNotMatch(html, />Blog</);
  assert.match(html, /https:\/\/duyet\.net/);
  assert.match(html, /https:\/\/aidr\.today\/extension/);
  assert.doesNotMatch(
    html,
    /chromewebstore\.google\.com\/detail\/aidr/
  );
  assert.match(css, /Source Sans 3/);
  assert.match(css, /EB Garamond/);
  assert.match(js, /story-host/);
  assert.match(js, /story-sources/);
});
