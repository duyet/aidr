// Copy packages/ui/tokens.css into the Chrome extension, which loads CSS
// straight from its folder (no bundler). tokens.test.mjs fails on drift.
import { copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const uiRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const dest = join(uiRoot, "../../apps/extension/css/tokens.css");
copyFileSync(join(uiRoot, "tokens.css"), dest);
console.log(`synced tokens.css -> ${dest}`);
