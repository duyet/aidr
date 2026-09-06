#!/usr/bin/env tsx
/**
 * Pack apps/extension with manifest.json at zip root for Chrome Web Store
 * upload. Does not overwrite public/aidr.zip (nested Load unpacked zip).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultCwsZipDest,
  defaultExtensionRoot,
  writeCwsZip,
} from "../src/lib/aidr-zip";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const result = writeCwsZip({
  root: defaultExtensionRoot(webRoot),
  dest: defaultCwsZipDest(webRoot),
});
console.log(
  `cws zip: ${result.dest} (${result.files} files, ${result.bytes} bytes)`
);
