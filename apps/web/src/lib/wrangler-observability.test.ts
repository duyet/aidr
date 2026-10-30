import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const toml = readFileSync(join(process.cwd(), "wrangler.toml"), "utf8");

/** Workers Logs bill per event and the quota is shared by every Worker on
 *  the account, so an unsampled invocation log on a busy Worker is a cost. */
const MAX_HEAD_SAMPLING_RATE = 0.05;

describe("wrangler.toml observability", () => {
  const section = /\[observability\.logs\]([^[]*)/.exec(toml)?.[1] ?? "";

  it("samples Workers Logs at or below the cap", () => {
    const rate = Number(/head_sampling_rate\s*=\s*([\d.]+)/.exec(section)?.[1]);
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThanOrEqual(MAX_HEAD_SAMPLING_RATE);
  });

  it("keeps logs and invocation logs enabled", () => {
    expect(section).toMatch(/enabled\s*=\s*true/);
    expect(section).toMatch(/invocation_logs\s*=\s*true/);
  });
});
