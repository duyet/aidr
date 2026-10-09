#!/usr/bin/env tsx
/**
 * Summarise a git range for release notes.
 *
 * Prints JSON with the date range, commit counts by conventional-commit type,
 * contributors, and the feat/fix/perf commits that are candidates for the
 * reader-facing `changes[]` list in `src/content/releases/v*.ts`.
 *
 * Usage:
 *   pnpm --filter @aidr/web release-notes <base> <head>
 *   pnpm --filter @aidr/web release-notes web-v0.1.10 web-v0.1.12
 */

import { execFileSync } from "node:child_process";

const READER_TYPES = new Set(["feat", "fix", "perf"]);
const BOT_AUTHOR = /\[bot\]$/;
// Fields are split on a unit separator so subjects with "|" survive.
const SEP = "\u001f";

interface Commit {
  sha: string;
  date: string;
  author: string;
  type: string;
  scope: string | null;
  breaking: boolean;
  subject: string;
  pr: number | null;
}

function git(args: string[]): string {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function parseSubject(
  raw: string
): Pick<Commit, "type" | "scope" | "breaking" | "subject" | "pr"> {
  const prMatch = raw.match(/\s*\(#(\d+)\)\s*$/);
  const pr = prMatch ? Number(prMatch[1]) : null;
  const withoutPr = prMatch ? raw.slice(0, prMatch.index) : raw;
  const cc = withoutPr.match(/^(\w+)(?:\(([^)]+)\))?(!)?:\s*(.+)$/);
  if (!cc)
    return {
      type: "other",
      scope: null,
      breaking: false,
      subject: withoutPr,
      pr,
    };
  return {
    type: cc[1].toLowerCase(),
    scope: cc[2] ?? null,
    breaking: cc[3] === "!",
    subject: cc[4],
    pr,
  };
}

function readCommits(base: string, head: string): Commit[] {
  const out = git([
    "log",
    "--no-merges",
    "--reverse",
    `--format=%h${SEP}%cd${SEP}%an${SEP}%s`,
    "--date=short",
    "--abbrev=7",
    `${base}..${head}`,
  ]);
  return out
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [sha, date, author, raw] = line.split(SEP);
      return { sha, date, author, ...parseSubject(raw) };
    });
}

function main(): void {
  const [base, head] = process.argv.slice(2);
  if (!base || !head) {
    console.error("usage: release-notes <base> <head>");
    process.exit(1);
  }

  const commits = readCommits(base, head);
  const byType: Record<string, number> = {};
  const contributors: Record<string, number> = {};
  for (const c of commits) {
    byType[c.type] = (byType[c.type] ?? 0) + 1;
    if (!BOT_AUTHOR.test(c.author))
      contributors[c.author] = (contributors[c.author] ?? 0) + 1;
  }
  const dates = commits.map((c) => c.date).sort();

  const report = {
    base,
    head,
    from: dates[0] ?? null,
    to: dates.at(-1) ?? null,
    total: commits.length,
    byType,
    contributors: Object.entries(contributors)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, commits: count })),
    changes: commits
      .filter((c) => READER_TYPES.has(c.type))
      .map(({ sha, type, scope, subject, pr, breaking }) => ({
        sha,
        type,
        scope,
        subject,
        pr,
        breaking,
      })),
  };
  console.log(JSON.stringify(report, null, 2));
}

main();
