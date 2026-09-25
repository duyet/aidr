import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { API } from "./endpoints";

/**
 * The API map is the contract between dashboard cards and the granular
 * /api/system/* routes. A stale or typo'd entry would 404 silently into a
 * skeleton card, so every advertised path must resolve to a real route
 * file (TanStack file routes: system.<section>.ts → /api/system/<section>).
 */

const ROUTES_DIR = fileURLToPath(new URL("../../routes/api", import.meta.url));

describe("system section endpoint map", () => {
  it("advertises exactly the seven granular sections", () => {
    expect(Object.keys(API).sort()).toEqual([
      "accounts",
      "activity",
      "llm",
      "models",
      "overview",
      "runs",
      "sources",
    ]);
    for (const path of Object.values(API)) {
      expect(path.startsWith("/api/system/")).toBe(true);
    }
  });

  it("maps every path to an existing route file", () => {
    const files = new Set(readdirSync(ROUTES_DIR));
    for (const [name, path] of Object.entries(API)) {
      const section = path.slice("/api/system/".length);
      const file = `system.${section}.ts`;
      expect(files.has(file), `${name} → ${file}`).toBe(true);
    }
  });
});
