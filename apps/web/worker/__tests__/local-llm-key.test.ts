import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  readEnvLocal,
  resolveLlmKey,
} from "../../../../videos/daily-news/scripts/local-llm-key.mjs";

const root = path.resolve(import.meta.dirname, "../../../..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

describe("resolveLlmKey (local run)", () => {
  it("refuses when only the production key is present", () => {
    const r = resolveLlmKey({ ANYROUTER_API_KEY: "prod-secret" }, {});
    expect(r.key).toBeUndefined();
    expect(r.error).toContain("ANYROUTER_LOCAL_API_KEY");
    expect(r.error).not.toContain("prod-secret");
  });

  it("refuses when the production key sits in .env.local", () => {
    const r = resolveLlmKey({}, { ANYROUTER_API_KEY: "prod-secret" });
    expect(r.key).toBeUndefined();
  });

  it("accepts the local key from the process env or .env.local", () => {
    expect(resolveLlmKey({ ANYROUTER_LOCAL_API_KEY: "local" }, {}).key).toBe(
      "local"
    );
    expect(
      resolveLlmKey({}, { ANYROUTER_LOCAL_API_KEY: "from-file" }).key
    ).toBe("from-file");
  });

  it("uses the local key even when the production key is also set", () => {
    const r = resolveLlmKey(
      { ANYROUTER_LOCAL_API_KEY: "local", ANYROUTER_API_KEY: "prod" },
      {}
    );
    expect(r.key).toBe("local");
  });
});

describe("resolveLlmKey (CI)", () => {
  it("keeps reading the production key", () => {
    const r = resolveLlmKey({ CI: "true", ANYROUTER_API_KEY: "ci-secret" }, {});
    expect(r.key).toBe("ci-secret");
  });

  it("does not take the local key in CI", () => {
    const r = resolveLlmKey(
      { CI: "true", ANYROUTER_LOCAL_API_KEY: "local" },
      {}
    );
    expect(r.key).toBeUndefined();
    expect(r.error).toContain("ANYROUTER_API_KEY");
  });
});

describe("readEnvLocal", () => {
  it("parses quoted and exported lines", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "llm-key-"));
    const file = path.join(dir, ".env.local");
    writeFileSync(file, 'export ANYROUTER_LOCAL_API_KEY="abc"\n# c\nOTHER=1\n');
    expect(readEnvLocal(file)).toEqual({
      ANYROUTER_LOCAL_API_KEY: "abc",
      OTHER: "1",
    });
  });
});

describe("requireLlmKey", () => {
  const run = (env: Record<string, string>) =>
    spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { requireLlmKey } from ${JSON.stringify(path.join(root, "videos/daily-news/scripts/local-llm-key.mjs"))};
         process.stdout.write(requireLlmKey(process.env, {}));`,
      ],
      { env: { PATH: process.env.PATH ?? "", ...env }, encoding: "utf8" }
    );

  it("exits 1 with a message when only the production key exists", () => {
    const r = run({ ANYROUTER_API_KEY: "prod-secret" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("ANYROUTER_LOCAL_API_KEY");
    expect(r.stdout + r.stderr).not.toContain("prod-secret");
  });

  it("returns the local key", () => {
    const r = run({ ANYROUTER_LOCAL_API_KEY: "local-key" });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("local-key");
  });
});

describe("local scripts cannot bypass the helper", () => {
  const dirs = ["apps/web/scripts", "videos/daily-news/scripts", "scripts"];
  const direct =
    /process\.env\.ANYROUTER_API_KEY|envVar\(["']ANYROUTER_API_KEY["']\)|out\.ANYROUTER_API_KEY/;

  it("reads the production key in no script", () => {
    const offenders: string[] = [];
    for (const dir of dirs) {
      for (const f of readdirSync(path.join(root, dir))) {
        if (!/\.(ts|mjs)$/.test(f) || /\.test\./.test(f)) continue;
        if (f === "local-llm-key.mjs") continue;
        if (direct.test(read(`${dir}/${f}`))) offenders.push(`${dir}/${f}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("wires every LLM script through the helper", () => {
    for (const f of [
      "apps/web/scripts/bench-env.ts",
      "apps/web/scripts/importance-eval.ts",
      "videos/daily-news/scripts/auto-script.mjs",
      "videos/daily-news/scripts/visub.mjs",
      "videos/daily-news/scripts/visub-screen.mjs",
    ]) {
      expect(read(f), f).toContain("requireLlmKey()");
    }
  });
});

describe("ANYROUTER_LOCAL_API_KEY stays local", () => {
  it("is documented in .env.example", () => {
    expect(read(".env.example")).toMatch(/^ANYROUTER_LOCAL_API_KEY=$/m);
  });

  it("is dropped by sync-env and listed in no allowlist", () => {
    const src = read("scripts/sync-env.ts");
    expect(src).toContain("delete env.ANYROUTER_LOCAL_API_KEY");
    expect(src).not.toMatch(/^\s*"ANYROUTER_LOCAL_API_KEY",/m);
  });
});
