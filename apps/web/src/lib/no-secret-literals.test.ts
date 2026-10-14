import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Secret-shaped literals in tracked files trip Gitleaks, GitGuardian and
// GitHub secret scanning after a push. Build fixtures at runtime instead, e.g.
// "AI" + "za" + "x".repeat(35). Every pattern below is assembled from parts so
// this file does not match the scanners it emulates.

const B64URL = "[A-Za-z0-9_-]";

const SECRET_PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  {
    name: "google-api-key",
    re: new RegExp("AI" + "za" + "[0-9A-Za-z_\\-]{35}"),
  },
  {
    name: "github-token",
    re: new RegExp("gh" + "[pousr]" + "_" + "[A-Za-z0-9]{36}"),
  },
  {
    name: "github-fine-grained-pat",
    re: new RegExp("github" + "_pat_" + "[A-Za-z0-9_]{22,}"),
  },
  {
    name: "jwt",
    re: new RegExp(
      "ey" + "J" + `${B64URL}{8,}\\.` + `${B64URL}{8,}\\.` + `${B64URL}{8,}`
    ),
  },
  { name: "aws-access-key-id", re: new RegExp("AK" + "IA" + "[0-9A-Z]{16}") },
  {
    name: "pem-private-key",
    re: new RegExp(
      "-----" + "BEGIN " + "(?:[A-Z]+ )?" + "PRIVATE " + "KEY-----"
    ),
  },
  { name: "sk-key", re: new RegExp("\\bsk" + "-" + "[A-Za-z0-9_\\-]{20,}") },
  {
    name: "slack-token",
    re: new RegExp("xo" + "x[bpars]" + "-" + "[A-Za-z0-9-]{10,}"),
  },
  {
    name: "telegram-bot-token",
    re: new RegExp("\\b[0-9]{8,10}" + ":" + "[A-Za-z0-9_-]{35}\\b"),
  },
  {
    name: "stripe-live-key",
    re: new RegExp("[sr]k" + "_live_" + "[A-Za-z0-9]{10,}"),
  },
];

const GENERIC_ASSIGNMENT = new RegExp(
  "(?:api[_-]?key|secret|token|passw(?:or)?d)[\"']?\\s*[:=]\\s*[\"']" +
    "([A-Za-z0-9+/_\\-=]{32,})[\"']",
  "i"
);

function looksHighEntropy(value: string): boolean {
  return (
    /[a-z]/.test(value) &&
    /[A-Z0-9]/.test(value) &&
    /[0-9]/.test(value) &&
    new Set(value).size >= 12
  );
}

function findSecretShapes(line: string): string[] {
  const hits = SECRET_PATTERNS.filter(({ re }) => re.test(line)).map(
    (p) => p.name
  );
  const generic = GENERIC_ASSIGNMENT.exec(line);
  if (generic && looksHighEntropy(generic[1])) hits.push("generic-assignment");
  return hits;
}

// Path -> reason. Keep tiny; prefer rewriting a fixture to build it at runtime.
const ALLOWLIST: Record<string, string> = {};

const ROOTS = ["apps/", "packages/", "videos/", "scripts/", ".github/"];
const EXTENSIONS = /\.(ts|tsx|js|mjs|json|md|toml|yml)$/;

function repoRoot(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
}

function trackedFiles(root: string): string[] {
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split("\0")
    .filter(
      (f) =>
        f &&
        ROOTS.some((r) => f.startsWith(r)) &&
        EXTENSIONS.test(f) &&
        !f.includes("node_modules/") &&
        !(f in ALLOWLIST)
    );
}

describe("no secret-shaped literals", () => {
  it("detects each supported shape built at runtime", () => {
    const samples: Record<string, string> = {
      "google-api-key": "AI" + "za" + "a1B2".repeat(9).slice(0, 35),
      "github-token": "gh" + "p_" + "a1B2".repeat(9),
      "github-fine-grained-pat": "github" + "_pat_" + "a1B2c3".repeat(5),
      jwt: ["ey" + "JhbGciOiJI", "ey" + "JzdWIiOiIx", "abcDEF123_-xyz"].join(
        "."
      ),
      "aws-access-key-id": "AK" + "IA" + "A1B2".repeat(4),
      "pem-private-key": "-----" + "BEGIN " + "RSA PRIVATE " + "KEY-----",
      "sk-key": "sk" + "-" + "a1B2".repeat(6),
      "slack-token": "xo" + "xb-" + "1234567890-abcdef",
      "telegram-bot-token": "123456789" + ":" + "a1B2".repeat(9).slice(0, 35),
      "stripe-live-key": "sk" + "_live_" + "a1B2c3d4e5",
      "generic-assignment": 'api_key = "' + "a1B2c3D4e5F6g7H8".repeat(2) + '"',
    };
    for (const [name, sample] of Object.entries(samples)) {
      expect(findSecretShapes(sample), name).toContain(name);
    }
  });

  it("ignores placeholders and prose", () => {
    expect(findSecretShapes("use sk-... or your own key")).toEqual([]);
    expect(
      findSecretShapes('api_key = "your-api-key-goes-here-please-replace"')
    ).toEqual([]);
  });

  it("finds none in tracked source files", () => {
    const root = repoRoot();
    const hits: string[] = [];
    for (const file of trackedFiles(root)) {
      let text: string;
      try {
        text = readFileSync(join(root, file), "utf8");
      } catch {
        continue;
      }
      if (text.includes("\0")) continue;
      text.split("\n").forEach((line, i) => {
        for (const name of findSecretShapes(line))
          hits.push(`${file}:${i + 1} ${name}`);
      });
    }
    expect(
      hits,
      "Build secret-shaped fixtures at runtime (see no-secret-literals.test.ts header)"
    ).toEqual([]);
  });
});
