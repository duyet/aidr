// Copy the shared plain-JS modules into the Chrome extension, which loads
// files straight from its folder (no bundler) and is zipped from there.
// reader-view.test.mjs fails on drift.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const libsRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const destDir = join(libsRoot, "../../apps/extension/js/shared");
mkdirSync(destDir, { recursive: true });
for (const file of ["reader-view.js"]) {
  copyFileSync(join(libsRoot, file), join(destDir, file));
  console.log(`synced ${file} -> ${destDir}`);
}
