#!/usr/bin/env tsx
/**
 * Pack apps/extension (unpacked MV3 tree) into public/aidr.zip so the
 * Worker can serve https://aidr.today/aidr.zip.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  defaultAidrZipDest,
  defaultExtensionRoot,
  writeAidrZip,
} from "../src/lib/aidr-zip";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const result = writeAidrZip({
  root: defaultExtensionRoot(webRoot),
  dest: defaultAidrZipDest(webRoot),
});
console.log(
  `aidr zip: ${result.dest} (${result.files} files, ${result.bytes} bytes)`
);
