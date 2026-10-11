import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("week-model", () => {
  it("imports nothing server-side, because WeeklyPaper ships it to the browser", () => {
    // worker/llm.ts runs `new AsyncLocalStorage()` at module load; reaching
    // it from a client chunk threw on every page and blocked hydration.
    const src = readFileSync(
      new URL("./week-model.ts", import.meta.url),
      "utf8"
    );
    const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(imports).toEqual(["./types"]);
  });
});
