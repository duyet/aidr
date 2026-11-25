import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_THEME,
  DEFAULT_TLDR_VIEW,
  normalizeTldrView,
  TLDR_VIEW_ICONS,
  TLDR_VIEWS,
  tldrRows,
} from "./reader-view.js";

const here = dirname(fileURLToPath(import.meta.url));

test("extension ships a byte-identical copy of reader-view.js", () => {
  assert.equal(
    readFileSync(
      join(here, "../../apps/extension/js/shared/reader-view.js"),
      "utf8"
    ),
    readFileSync(join(here, "reader-view.js"), "utf8"),
    "run `pnpm --filter @aidr/libs sync-extension`"
  );
});

test("readers start light on the rows view", () => {
  assert.equal(DEFAULT_THEME, "light");
  assert.equal(DEFAULT_TLDR_VIEW, "rows2");
  assert.deepEqual(TLDR_VIEWS, ["image", "rows2", "rows3"]);
});

test("tldrRows clamps rows3 to three lines and everything else to two", () => {
  assert.equal(tldrRows("rows3"), 3);
  assert.equal(tldrRows("rows2"), 2);
  assert.equal(tldrRows("image"), 2);
});

test("normalizeTldrView maps the extension's old text value to rows2", () => {
  assert.equal(normalizeTldrView("text"), "rows2");
  assert.equal(normalizeTldrView(undefined), "rows2");
  for (const view of TLDR_VIEWS) assert.equal(normalizeTldrView(view), view);
});

test("every view has an icon", () => {
  for (const view of TLDR_VIEWS) assert.ok(TLDR_VIEW_ICONS[view].length > 0);
});
