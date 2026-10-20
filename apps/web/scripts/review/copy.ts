/**
 * Scores marketing copy for the `aidr-copy-review` skill. The mechanical rows
 * are decided here over plain text; the voice and claim-meaning rows are left
 * to a reviewer. Read-only: files from the repo, plus GET requests to
 * https://aidr.today for the live meta description.
 *
 *   pnpm --filter @aidr/web exec tsx scripts/review/copy.ts [file ...] [--fixture <json>] [--json <out>]
 */
import { readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type AutoResult,
  emit,
  type RubricRow,
  SHIP_AT,
  scoreRubric,
} from "./rubric";

export interface CopyDoc {
  /** Name shown in reasons, as `file:line`. */
  file: string;
  text: string;
}

export interface CopyInput {
  docs: CopyDoc[];
  /** Full text of docs/marketing/positioning.md. */
  positioning: string;
  /** Full text, or the relevant excerpt, of apps/web/ALGORITHM.md. */
  algorithm: string;
}

export const RUBRIC: RubricRow[] = [
  {
    id: "banned.words",
    points: 2,
    auto: true,
    ask: 'No word or phrase from positioning.md "Words to avoid" or "Do not say"',
  },
  {
    id: "brand.spelling",
    points: 1,
    auto: true,
    ask: 'Brand is "AI;DR", domain is "aidr.today"; never "AIDR", "AI DR", "Aidr.today", or "AI News" as the name',
  },
  {
    id: "unslop.mechanical",
    points: 2,
    auto: true,
    ask: "No long dash (13), mid-sentence colon (14), AI vocabulary (7), 'serves as' (8), 'not just X but Y' (9), -ing tail (3), vague attribution (5), filler (23), plain-word swaps (31), metaphor nouns (26), chatbot phrases (20, 22), decorative emoji (18), curly quotes (19)",
  },
  {
    id: "claim.proof",
    points: 2,
    auto: true,
    ask: "Every number, handle, email, and tool name appears in positioning.md Proof points or ALGORITHM.md",
  },
  {
    id: "claim.pipeline",
    points: 1,
    ask: "Each sentence about what the pipeline does maps to a Proof points row, ALGORITHM.md, or code, and the number sits on the right claim (6 stories is Telegram, 16 bullets is per language)",
  },
  {
    id: "voice.facts",
    points: 1,
    ask: "Short sentences, facts first then the link, and it admits the limit (a machine picks the stories and gets some wrong)",
  },
  {
    id: "unslop.judged",
    points: 1,
    ask: "Unslop rules a script cannot see: rule of three (10), synonym cycling (11), false ranges (12), headers and bold (15, 16, 17), hedging and conclusions (24, 25), feeling words (27), dense or passive sentences (28, 29), adverbs (30), flourish (32), over-compression (33)",
  },
];

const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../../.."
);
const POSITIONING = "docs/marketing/positioning.md";
const ALGORITHM = "apps/web/ALGORITHM.md";
export const DEFAULT_FILES = [
  "docs/marketing/launch-post.md",
  "docs/marketing/social-templates.md",
  "docs/marketing/README.md",
];
export const LIVE_PAGES = ["https://aidr.today", "https://aidr.today/about"];

/** Words and phrases positioning.md bans, read from its text at run time. */
export function parseBannedTerms(positioning: string): string[] {
  const terms: string[] = [];
  const list = /^Words to avoid:\s*(.+)$/m.exec(positioning);
  if (list?.[1]) {
    // The "Do not say" sentences can follow on the same line; the list ends at the first sentence break.
    const items = list[1].split(/\.(?:\s|$)/)[0] ?? "";
    for (const part of items.split(",")) {
      const term = part.trim();
      if (term) terms.push(term);
    }
  }
  for (const m of positioning.matchAll(/Do not say\s+["“]([^"”]+)["”]/g)) {
    if (m[1]) terms.push(m[1].trim());
  }
  const unique = [...new Set(terms.map((t) => t.toLowerCase()))];
  if (!unique.length) {
    throw new Error(
      'positioning.md has no "Words to avoid:" line or "Do not say" sentence to enforce'
    );
  }
  return unique;
}

/** The claim and evidence table between "## Proof points" and the next heading. */
export function proofSection(positioning: string): string {
  const m = /^## Proof points\s*$([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(
    positioning
  );
  if (!m?.[1]?.trim())
    throw new Error("positioning.md has no Proof points section");
  return m[1];
}

function termPattern(term: string): RegExp {
  const body = term
    .split(/[-\s]+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[-\\s]?");
  const suffix = /[-\s]/.test(term) ? "" : "\\p{L}*";
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${body}${suffix}(?![\\p{L}\\p{N}])`,
    "giu"
  );
}

interface Line {
  file: string;
  line: number;
  text: string;
}

function linesOf(docs: readonly CopyDoc[]): Line[] {
  return docs.flatMap((doc) =>
    doc.text
      .split("\n")
      .map((text, i) => ({ file: doc.file, line: i + 1, text }))
  );
}

/** Replaces inline code with filler so names in backticks are not read as prose. */
const maskCode = (text: string) =>
  text.replace(/`[^`]*`/g, (m) => "X".repeat(m.length));

/** positioning.md lists the banned words; those lines are the rule, not copy. */
const isRuleLine = (text: string) =>
  /^Words to avoid:/.test(text) || /Do not say\s+["“]/.test(text);

function checkBanned(lines: Line[], positioning: string): string[] {
  const patterns = parseBannedTerms(positioning).map(
    (term) => [term, termPattern(term)] as const
  );
  const why: string[] = [];
  for (const { file, line, text } of lines) {
    if (isRuleLine(text)) continue;
    for (const [term, re] of patterns) {
      for (const m of text.matchAll(re)) {
        why.push(`${file}:${line} banned "${term}" (found "${m[0]}")`);
      }
    }
  }
  return why;
}

function checkBrand(lines: Line[]): string[] {
  const why: string[] = [];
  for (const { file, line, text } of lines) {
    const prose = maskCode(text);
    const flag = (found: string, fix: string) =>
      why.push(`${file}:${line} "${found}", write ${fix}`);
    for (const m of prose.matchAll(/\bAIDR\b/g)) flag(m[0], '"AI;DR"');
    for (const m of prose.matchAll(/\bAI\s+DR\b/gi)) flag(m[0], '"AI;DR"');
    for (const m of prose.matchAll(/\bAI[;:.-]DR\b/gi)) {
      if (m[0] !== "AI;DR") flag(m[0], '"AI;DR"');
    }
    for (const m of prose.matchAll(/\baidr\.today\b/gi)) {
      if (m[0] !== "aidr.today") flag(m[0], '"aidr.today"');
    }
    for (const m of prose.matchAll(/\bAI News\b/g)) {
      flag(m[0], '"AI;DR" ("AI News" is the SEO title, not the brand)');
    }
  }
  return why;
}

interface MechanicalRule {
  rule: number;
  re: RegExp;
  label: string;
}

const words = (list: string[]) =>
  new RegExp(`\\b(?:${list.join("|")})\\b`, "gi");

const MECHANICAL: MechanicalRule[] = [
  {
    rule: 13,
    re: /[—–]|(?<=\S) -{1,2} (?=\S)/g,
    label: "long dash or dash substitute",
  },
  {
    rule: 14,
    re: /(?<=[\p{L}\p{N})\]`;]): (?!https?:)(?=\p{Ll})/gu,
    label: "colon as a mid-sentence connector",
  },
  {
    rule: 7,
    re: words([
      "additionally",
      "crucial",
      "delve",
      "enduring",
      "enhance",
      "fostering",
      "garner",
      "interplay",
      "intricate",
      "landscape",
      "pivotal",
      "showcase",
      "tapestry",
      "testament",
      "underscore",
      "vibrant",
    ]),
    label: "AI vocabulary",
  },
  {
    rule: 8,
    re: words(["serves as", "stands as", "boasts"]),
    label: "fancy way to say is",
  },
  {
    rule: 9,
    re: /\bnot (?:just|only)\b[^.!?\n]*\bbut\b/gi,
    label: '"not just X, but Y"',
  },
  {
    rule: 3,
    re: /, (?:highlighting|ensuring|reflecting|showcasing|fostering|underscoring)\b/gi,
    label: "superficial -ing phrase",
  },
  {
    rule: 5,
    re: words([
      "experts believe",
      "experts say",
      "industry reports suggest",
      "some critics argue",
      "studies show",
    ]),
    label: "vague attribution",
  },
  {
    rule: 23,
    re: words([
      "in order to",
      "due to the fact that",
      "it is important to note",
      "it's worth noting",
    ]),
    label: "filler phrase",
  },
  {
    rule: 31,
    re: words([
      "utilize",
      "utilizes",
      "facilitate",
      "numerous",
      "in the event that",
    ]),
    label: "fancy word for a plain one",
  },
  {
    rule: 26,
    re: words([
      "substrate",
      "wedge",
      "nexus",
      "bedrock",
      "scaffolding",
      "paradigm",
      "modality",
      "flywheel",
      "north star",
      "locus",
      "vantage",
      "gold-plating",
      "endgame",
    ]),
    label: "abstract metaphor noun",
  },
  {
    rule: 20,
    re: words([
      "i hope this helps",
      "let me know if",
      "of course!",
      "certainly!",
    ]),
    label: "chatbot phrase",
  },
  {
    rule: 22,
    re: /\b(?:great question|you're absolutely right)\b/gi,
    label: "sycophantic tone",
  },
  { rule: 18, re: /\p{Extended_Pictographic}/gu, label: "decorative emoji" },
  { rule: 19, re: /[“”‘’]/g, label: "curly quote" },
];

function checkMechanical(lines: Line[]): string[] {
  const why: string[] = [];
  for (const { file, line, text } of lines) {
    if (isRuleLine(text)) continue;
    const prose = maskCode(text);
    for (const { rule, re, label } of MECHANICAL) {
      for (const m of prose.matchAll(re)) {
        why.push(
          `${file}:${line} unslop ${rule} ${label} "${m[0].trim() || m[0]}"`
        );
      }
    }
  }
  return why;
}

const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const URL = /https?:\/\/\S+/g;
const NUMBER = /(?<![\p{L}\d:])(?:\d{1,2}:\d{2}|\d+)(?![\p{L}])/gu;

/** Numbers a reader could take as claims: drops URLs, code, placeholders, dates, list markers. */
function claimNumbers(text: string): { value: string; unit: string }[] {
  const prose = text
    .replace(/^\s*\d+\.\s/, "")
    .replace(/`[^`]*`/g, " ")
    .replace(URL, " ")
    .replace(EMAIL, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\d{4}-\d{2}-\d{2}/g, " ");
  return [...prose.matchAll(NUMBER)].map((m) => {
    const after = prose.slice((m.index ?? 0) + m[0].length);
    return {
      value: m[0],
      unit: /^\s*([\p{L}]+)/u.exec(after)?.[1]?.toLowerCase() ?? "",
    };
  });
}

const hasNumber = (corpus: string, value: string) =>
  new RegExp(`(?<![\\d:])${value}(?![\\d:])`).test(corpus);

const stem = (unit: string) => unit.replace(/s$/, "");

/** A number is backed by Proof points, or by ALGORITHM.md using the same unit after it. */
function numberBacked(
  value: string,
  unit: string,
  proof: string,
  algorithm: string
) {
  if (hasNumber(proof, value)) return true;
  if (!unit) return false;
  return new RegExp(`(?<![\\d:])${value}\\s+${stem(unit)}s?\\b`, "i").test(
    algorithm
  );
}

function checkProof(
  lines: Line[],
  positioning: string,
  algorithm: string
): string[] {
  const proof = proofSection(positioning);
  const corpus = `${proof}\n${algorithm}`.toLowerCase();
  const why: string[] = [];
  for (const { file, line, text } of lines) {
    if (isRuleLine(text)) continue;
    for (const { value, unit } of claimNumbers(text)) {
      if (!numberBacked(value, unit, proof, algorithm)) {
        why.push(
          `${file}:${line} number "${value}${unit ? ` ${unit}` : ""}" is not in Proof points or ALGORITHM.md`
        );
      }
    }
    const withoutUrls = text.replace(URL, " ");
    const emails = [...withoutUrls.matchAll(EMAIL)].map((m) => m[0]);
    const noEmails = withoutUrls.replace(EMAIL, " ");
    const handles = [...noEmails.matchAll(/(?<![\w.])@\w+/g)].map((m) => m[0]);
    const tools = [
      ...noEmails.replace(/@\w+/g, " ").matchAll(/\b[a-z]+(?:_[a-z0-9]+)+\b/g),
    ].map((m) => m[0]);
    for (const id of [...emails, ...handles, ...tools]) {
      if (!corpus.includes(id.toLowerCase())) {
        why.push(
          `${file}:${line} "${id}" is not in Proof points or ALGORITHM.md`
        );
      }
    }
  }
  return why;
}

/** One entry per automatic row. An empty list is a pass. */
export function autoChecks(input: CopyInput): AutoResult {
  const lines = linesOf(input.docs);
  if (!lines.length) throw new Error("no copy to review");
  return {
    "banned.words": checkBanned(lines, input.positioning),
    "brand.spelling": checkBrand(lines),
    "unslop.mechanical": checkMechanical(lines),
    "claim.proof": checkProof(lines, input.positioning, input.algorithm),
  };
}

const readRepo = (path: string) =>
  readFileSync(resolve(REPO_ROOT, path), "utf8");

/** Reads copy files (default: the three marketing files) plus the evidence docs. */
export function loadCopy(files: readonly string[] = DEFAULT_FILES): CopyInput {
  return {
    docs: files.map((f) => {
      const abs = resolve(REPO_ROOT, f);
      return {
        file: relative(REPO_ROOT, abs) || f,
        text: readFileSync(abs, "utf8"),
      };
    }),
    positioning: readRepo(POSITIONING),
    algorithm: readRepo(ALGORITHM),
  };
}

const decodeEntities = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) =>
      String.fromCodePoint(parseInt(h, 16))
    )
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

/** Pulls the meta and og descriptions out of a page. Pure so a test can feed it HTML. */
export function metaDescriptions(html: string, url: string): CopyDoc[] {
  const found: string[] = [];
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = /(?:name|property)="(description|og:description)"/i.exec(
      tag
    )?.[1];
    const content = /content="([^"]*)"/i.exec(tag)?.[1];
    if (key && content !== undefined) found.push(decodeEntities(content));
  }
  return [...new Set(found)].map((text) => ({
    file: `live:${url}#meta-description`,
    text,
  }));
}

/** GETs the live pages. Throws on any non-200 so a score is never faked. */
export async function loadLiveMeta(
  pages: readonly string[] = LIVE_PAGES,
  get: typeof fetch = fetch
): Promise<CopyDoc[]> {
  const docs: CopyDoc[] = [];
  for (const url of pages) {
    const res = await get(url, { headers: { accept: "text/html" } });
    if (!res.ok) throw new Error(`GET ${url} returned ${res.status}`);
    const metas = metaDescriptions(await res.text(), url);
    if (!metas.length) throw new Error(`GET ${url} has no meta description`);
    docs.push(...metas);
  }
  return docs;
}

export function loadFixture(path: string): CopyInput {
  const raw: unknown = JSON.parse(readFileSync(path, "utf8"));
  const f = raw as Partial<CopyInput>;
  if (
    !Array.isArray(f.docs) ||
    typeof f.positioning !== "string" ||
    typeof f.algorithm !== "string"
  ) {
    throw new Error(
      `${path} is not a copy fixture (needs docs, positioning, algorithm)`
    );
  }
  return { docs: f.docs, positioning: f.positioning, algorithm: f.algorithm };
}

async function main(argv: readonly string[]) {
  const valueFlags = new Set(["--fixture", "--json"]);
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? "";
    if (valueFlags.has(arg)) i++;
    else if (!arg.startsWith("--")) files.push(arg);
  }
  // pnpm runs the script from apps/web; paths the user typed are relative to where they ran pnpm.
  const here = process.env.INIT_CWD ?? process.cwd();
  const flag = (name: string) => {
    const at = argv.indexOf(name);
    return at >= 0 ? argv[at + 1] : undefined;
  };
  const fixture = flag("--fixture");
  let input: CopyInput;
  let surface = "copy";
  if (fixture) {
    input = loadFixture(resolve(here, fixture));
    surface = `copy fixture ${fixture}`;
  } else if (files.length) {
    input = loadCopy(files.map((f) => resolve(here, f)));
  } else {
    input = loadCopy();
    input.docs.push(...(await loadLiveMeta()));
    surface = "copy live edition";
  }
  const report = scoreRubric(surface, RUBRIC, autoChecks(input));
  emit([report], argv);
  process.exitCode = report.earned + report.open >= SHIP_AT ? 0 : 1;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(2);
  });
}
