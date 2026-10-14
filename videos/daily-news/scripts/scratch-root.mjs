// Test helper: a temp copy of the daily-news layout so tests never write under the tracked editions/ folder.
// build.mjs resolves its root from its own path, so the temp root links the real scripts, template and brand.
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const ROOT = resolve(import.meta.dirname, "..");

export function scratchRoot() {
  const tmp = mkdtempSync(join(tmpdir(), "dn-build-"));
  const dn = join(tmp, "daily-news");
  mkdirSync(join(dn, "editions"), { recursive: true });
  for (const f of ["scripts", "template", "config.json"])
    symlinkSync(join(ROOT, f), join(dn, f));
  symlinkSync(resolve(ROOT, "../brand"), join(tmp, "brand"));
  return { dn, cleanup: () => rmSync(tmp, { recursive: true, force: true }) };
}

export const runBuild = (dn, args) =>
  spawnSync(
    process.execPath,
    [
      "--preserve-symlinks",
      "--preserve-symlinks-main",
      join(dn, "scripts/build.mjs"),
      ...args,
    ],
    { cwd: dn, encoding: "utf8" }
  );
