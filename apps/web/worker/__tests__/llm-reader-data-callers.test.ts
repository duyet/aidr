import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseSync } from "vite";
import { describe, expect, it } from "vitest";

/**
 * A failed `callAnyrouter` attempt can keep a response snippet in
 * `llm_calls`, and a provider error body can echo the prompt. A prompt that
 * carries reader-written text (suggestions, submissions) must pass
 * `sensitive: true` so no snippet is stored for it.
 *
 * Every model call site in `worker/` is listed here, keyed by file and
 * nearest named function. A new call site fails the scan until someone
 * decides whether its prompt can hold reader data.
 */
const CALL_SITES: Record<string, { readerData: boolean; why: string }> = {
  "dedupe.ts#clusterSimilar": {
    readerData: false,
    why: "published item titles",
  },
  "jev-panel/executor.ts#createJevJudgeExecutor": {
    readerData: true,
    why: "judges reader submissions and suggestions",
  },
  "llm.ts#completeJsonWithModel": {
    readerData: false,
    why: "wrapper; its callers are classified",
  },
  "llm.ts#completeJson": {
    readerData: false,
    why: "wrapper; its callers are classified",
  },
  "llm.ts#scoreBatchWithChat": {
    readerData: false,
    why: "fetched item text",
  },
  "llm.ts#translateBatch": { readerData: false, why: "fetched item text" },
  "llm.ts#summarizeEnglish": { readerData: false, why: "fetched item text" },
  "llm.ts#repairTldrViBullets": {
    readerData: false,
    why: "generated TL;DR bullets",
  },
  "llm.ts#generateTldr": { readerData: false, why: "published items" },
  "mail/compose.ts#wrapWithAi": {
    readerData: false,
    why: "operator-written campaign notes and picked items",
  },
  "notify/story-summary.ts#captionSummaryFor": {
    readerData: false,
    why: "published story summary",
  },
  "submissions.ts#reviewPendingSubmissions": {
    readerData: true,
    why: "reader-submitted url, title and note",
  },
  "suggestions.ts#retranslateFieldWithGuidance": {
    readerData: true,
    why: "reader suggestion text",
  },
  "suggestions.ts#rateSuggestion": {
    readerData: true,
    why: "reader suggestion text",
  },
  "suggestions.ts#planUnifiedEdits": {
    readerData: true,
    why: "reader suggestion text",
  },
  "topics.ts#mapUnseenTopics": {
    readerData: false,
    why: "model-generated topic tags",
  },
  "translation-knowledge.ts#learnFromAcceptedSuggestion": {
    readerData: true,
    why: "reader suggestion text",
  },
  "translation-qa.ts#requestReview": {
    readerData: false,
    why: "published translation pair",
  },
  "translation-qa.ts#requestRepair": {
    readerData: false,
    why: "published translation pair",
  },
  "translation-qa.ts#ensureEnglishCandidates": {
    readerData: false,
    why: "published Vietnamese source",
  },
  "weekly.ts#generateWeeklyCopy": {
    readerData: false,
    why: "published items",
  },
};

const LLM_CALLS = new Set([
  "callAnyrouter",
  "completeJson",
  "completeJsonWithModel",
]);

const workerDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const llmModule = path.join(workerDir, "llm.ts");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : sourceFiles(full);
    }
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

/** An ESTree node from Vite's oxc parser. Comments are not nodes. */
interface AstNode {
  type: string;
  start: number;
  [key: string]: unknown;
}

function isNode(value: unknown): value is AstNode {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}

function child(node: AstNode, key: string): AstNode | undefined {
  const value = node[key];
  return isNode(value) ? value : undefined;
}

function list(node: AstNode, key: string): AstNode[] {
  const value = node[key];
  return Array.isArray(value) ? value.filter(isNode) : [];
}

function children(node: AstNode): AstNode[] {
  return Object.values(node).flatMap((value) =>
    Array.isArray(value) ? value.filter(isNode) : isNode(value) ? [value] : []
  );
}

function nameOf(node: AstNode | undefined): string | undefined {
  if (node?.type === "Identifier") return node.name as string;
  if (node?.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  return undefined;
}

function importsLlm(file: string, specifier: unknown): boolean {
  if (typeof specifier !== "string" || !specifier.startsWith(".")) {
    return false;
  }
  const target = path.resolve(path.dirname(file), specifier);
  return target.replace(/\.js$/, ".ts") === llmModule;
}

/** Local names bound to an LLM call function, and `import * as` names. */
function llmBindings(file: string, program: AstNode) {
  const direct = new Set<string>(file === llmModule ? LLM_CALLS : []);
  const namespaces = new Set<string>();
  for (const statement of list(program, "body")) {
    if (
      statement.type !== "ImportDeclaration" ||
      statement.importKind === "type" ||
      !importsLlm(file, child(statement, "source")?.value)
    ) {
      continue;
    }
    for (const spec of list(statement, "specifiers")) {
      const local = nameOf(child(spec, "local"));
      if (!local) continue;
      if (spec.type === "ImportNamespaceSpecifier") namespaces.add(local);
      if (
        spec.type === "ImportSpecifier" &&
        LLM_CALLS.has(nameOf(child(spec, "imported")) ?? "")
      ) {
        direct.add(local);
      }
    }
  }
  return { direct, namespaces };
}

const FUNCTION_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);
const KEYED_HOLDERS = new Set([
  "Property",
  "MethodDefinition",
  "PropertyDefinition",
]);

/** Name of the nearest named function on the ancestor path. Anonymous
 *  callbacks (`items.map(async (x) => …)`) belong to the function that
 *  holds them. */
function enclosingFunction(ancestors: AstNode[]): string {
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const fn = ancestors[i]!;
    if (!FUNCTION_TYPES.has(fn.type)) continue;
    const own = nameOf(child(fn, "id"));
    if (own) return own;
    const holder = ancestors[i - 1];
    if (holder?.type === "VariableDeclarator") {
      const name = nameOf(child(holder, "id"));
      if (name) return name;
    }
    if (holder && KEYED_HOLDERS.has(holder.type) && !holder.computed) {
      const name = nameOf(child(holder, "key"));
      if (name) return name;
    }
  }
  return "<top level>";
}

/** True when an object-literal argument has `sensitive: true` as a real
 *  property. Comments, spreads, shorthand and variables do not count. */
function passesSensitive(call: AstNode): boolean {
  return list(call, "arguments").some(
    (arg) =>
      arg.type === "ObjectExpression" &&
      list(arg, "properties").some((prop) => {
        const value = child(prop, "value");
        return (
          prop.type === "Property" &&
          !prop.computed &&
          !prop.shorthand &&
          nameOf(child(prop, "key")) === "sensitive" &&
          value?.type === "Literal" &&
          value.value === true
        );
      })
  );
}

/** Places a bound name can sit without being a use of the function. */
function isDeclarationSlot(node: AstNode, parent: AstNode | undefined) {
  switch (parent?.type) {
    case "ImportSpecifier":
    case "ExportSpecifier":
    case "TSTypeQuery":
      return true;
    case "FunctionDeclaration":
      return parent.id === node;
    case "MemberExpression":
      return parent.property === node && !parent.computed;
    case "Property":
    case "MethodDefinition":
    case "PropertyDefinition":
      return parent.key === node && !parent.computed && !parent.shorthand;
    default:
      return false;
  }
}

interface CallSite {
  key: string;
  sensitive: boolean;
}

interface Scan {
  sites: CallSite[];
  /** References that are not a direct call, e.g. `const ask = callAnyrouter`. */
  indirect: string[];
  parseErrors: string[];
}

function scanFile(file: string, scan: Scan): void {
  const text = readFileSync(file, "utf8");
  const rel = path.relative(workerDir, file).split(path.sep).join("/");
  const { program, errors } = parseSync(file, text, { lang: "ts" });
  if (errors.length > 0) scan.parseErrors.push(rel);
  const root = program as unknown as AstNode;
  const { direct, namespaces } = llmBindings(file, root);
  if (direct.size === 0 && namespaces.size === 0) return;

  const isLlmRef = (node: AstNode | undefined): boolean =>
    (node?.type === "Identifier" && direct.has(node.name as string)) ||
    (node?.type === "MemberExpression" &&
      !node.computed &&
      namespaces.has(nameOf(child(node, "object")) ?? "") &&
      LLM_CALLS.has(nameOf(child(node, "property")) ?? ""));

  const line = (node: AstNode) => text.slice(0, node.start).split("\n").length;

  const visit = (node: AstNode, ancestors: AstNode[]): void => {
    const trail = [...ancestors, node];
    if (node.type === "CallExpression" && isLlmRef(child(node, "callee"))) {
      scan.sites.push({
        key: `${rel}#${enclosingFunction(ancestors)}`,
        sensitive: passesSensitive(node),
      });
      for (const arg of list(node, "arguments")) visit(arg, trail);
      return;
    }
    if (isLlmRef(node) && !isDeclarationSlot(node, ancestors.at(-1))) {
      scan.indirect.push(`${rel}:${line(node)}`);
      return;
    }
    for (const next of children(node)) visit(next, trail);
  };
  visit(root, []);
}

function scanWorker(): Scan {
  const scan: Scan = { sites: [], indirect: [], parseErrors: [] };
  for (const file of sourceFiles(workerDir)) scanFile(file, scan);
  return scan;
}

describe("LLM call sites that carry reader data", () => {
  const { sites, indirect, parseErrors } = scanWorker();

  it("parses every worker source file", () => {
    expect(parseErrors).toEqual([]);
  });

  it("classifies every call site", () => {
    const found = [...new Set(sites.map((site) => site.key))].sort();
    expect(found).toEqual(Object.keys(CALL_SITES).sort());
  });

  it("calls the LLM functions directly, so every call is scanned", () => {
    expect(indirect).toEqual([]);
  });

  it("marks every reader-data call sensitive", () => {
    const unmarked = sites
      .filter((site) => CALL_SITES[site.key]?.readerData && !site.sensitive)
      .map((site) => site.key);
    expect(unmarked).toEqual([]);
  });

  it("keeps System One rows snippet-free (it also sees reader text)", () => {
    const source = readFileSync(path.join(workerDir, "systemone.ts"), "utf8");
    const snippets = [...source.matchAll(/responseSnippet:\s*([^,\n]+)/g)].map(
      (match) => match[1]
    );
    expect(snippets.length).toBeGreaterThan(0);
    expect(new Set(snippets)).toEqual(new Set(["null"]));
  });
});
