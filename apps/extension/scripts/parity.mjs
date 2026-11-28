#!/usr/bin/env node
/**
 * Visual parity lever: screenshots live aidr.today and the unpacked new tab
 * with the same digest, same language and same window, back to back, then
 * writes side-by-side, overlay and per-band diff images (parity-diff.py).
 *
 *   node apps/extension/scripts/parity.mjs --out /tmp/aidr-parity
 *   node apps/extension/scripts/parity.mjs --langs vi --widths 1280
 *
 * Live counts and "Xm ago" strings keep the diff above zero. Read the
 * side-by-side and the band report, not a single number.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadDigest, runChrome, startServer } from "./verify-newtab.mjs";

const SITE = "https://aidr.today";
const here = dirname(fileURLToPath(import.meta.url));

function argValue(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

const outDir = argValue("--out", "/tmp/aidr-parity");
const langs = argValue("--langs", "vi,en").split(",");
const widths = argValue("--widths", "1280,390").split(",");
const height = argValue("--height", "2400");
mkdirSync(outDir, { recursive: true });

const digest = await loadDigest();
const { server, port } = await startServer(digest);
try {
  for (const lang of langs) {
    for (const width of widths) {
      const size = `${width},${height}`;
      const name = `${lang}-${width}`;
      await runChrome(
        [`--screenshot=${join(outDir, `${name}-site.png`)}`, `${SITE}/?lang=${lang}`],
        size
      );
      await runChrome(
        [
          `--screenshot=${join(outDir, `${name}-newtab.png`)}`,
          `http://127.0.0.1:${port}/newtab.html?lang=${lang}`,
        ],
        size
      );
    }
  }
} finally {
  server.close();
}

const diff = spawnSync("python3", [join(here, "parity-diff.py"), outDir], {
  stdio: "inherit",
});
process.exitCode = diff.status ?? 1;
