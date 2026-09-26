import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("AI;DR section", () => {
  it("links the updated timestamp to data analytics", () => {
    const source = readFileSync(
      join(here, "../components/TldrSection.tsx"),
      "utf8"
    );

    expect(source).toContain('from "@tanstack/react-router"');
    expect(source).toMatch(
      /<Link\s+to="\/data"\s+suppressHydrationWarning[\s\S]*?timeAgo\(/
    );
  });
});
