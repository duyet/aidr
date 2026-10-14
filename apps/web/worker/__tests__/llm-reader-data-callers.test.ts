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

const appDir = path.dirname(workerDir);

/** `./llm.js`, `./llm`, `./llm.ts` and the `@/` alias all name llm.ts. */
function importsLlm(file: string, specifier: unknown): boolean {
  if (typeof specifier !== "string") return false;
  const target = specifier.startsWith("@/")
    ? path.join(appDir, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(file), specifier)
      : null;
  return target?.replace(/\.[jt]s$/, "") === llmModule.replace(/\.ts$/, "");
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
    case "ImportNamespaceSpecifier":
    case "TSTypeQuery":
    case "TSQualifiedName":
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
  /** References the scan cannot follow to a call, e.g.
   *  `const ask = callAnyrouter` or `export * from "./llm.js"`. */
  indirect: string[];
  parseErrors: string[];
}

function scanSource(file: string, text: string, scan: Scan): void {
  const rel = path.relative(workerDir, file).split(path.sep).join("/");
  const { program, errors } = parseSync(file, text, { lang: "ts" });
  if (errors.length > 0) scan.parseErrors.push(rel);
  const root = program as unknown as AstNode;
  const { direct, namespaces } = llmBindings(file, root);

  const isNamespace = (node: AstNode | undefined): boolean =>
    node?.type === "Identifier" && namespaces.has(node.name as string);
  const isLlmRef = (node: AstNode | undefined): boolean =>
    (node?.type === "Identifier" && direct.has(node.name as string)) ||
    (node?.type === "MemberExpression" &&
      !node.computed &&
      isNamespace(child(node, "object")) &&
      LLM_CALLS.has(nameOf(child(node, "property")) ?? ""));

  const line = (node: AstNode) => text.slice(0, node.start).split("\n").length;
  const flag = (node: AstNode) => scan.indirect.push(`${rel}:${line(node)}`);

  /** An export the scan cannot follow: importers of a renamed or
   *  re-exported entry point call it under a name it does not track. */
  const opaqueExport = (node: AstNode): boolean => {
    if (node.type === "ExportAllDeclaration") {
      return importsLlm(file, child(node, "source")?.value);
    }
    if (node.type !== "ExportNamedDeclaration" || node.exportKind === "type") {
      return false;
    }
    const source = child(node, "source");
    return list(node, "specifiers").some((spec) => {
      const local = nameOf(child(spec, "local")) ?? "";
      if (source) {
        return importsLlm(file, source.value) && LLM_CALLS.has(local);
      }
      const sameName = nameOf(child(spec, "exported")) === local;
      return direct.has(local) && !(file === llmModule && sameName);
    });
  };

  const visit = (node: AstNode, ancestors: AstNode[]): void => {
    const trail = [...ancestors, node];
    const parent = ancestors.at(-1);
    if (opaqueExport(node)) {
      flag(node);
      return;
    }
    if (node.type === "ExportNamedDeclaration" && !child(node, "declaration")) {
      return;
    }
    if (node.type === "ImportExpression") {
      const source = child(node, "source");
      if (source?.type !== "Literal" || importsLlm(file, source.value)) {
        flag(node);
        return;
      }
    }
    if (node.type === "CallExpression" && isLlmRef(child(node, "callee"))) {
      scan.sites.push({
        key: `${rel}#${enclosingFunction(ancestors)}`,
        sensitive: passesSensitive(node),
      });
      for (const arg of list(node, "arguments")) visit(arg, trail);
      return;
    }
    if (isLlmRef(node) && !isDeclarationSlot(node, parent)) {
      flag(node);
      return;
    }
    // `const l = llm`, `const { completeJson: ask } = llm`, `llm["…"]`.
    if (isNamespace(node) && !isDeclarationSlot(node, parent)) {
      const plainMember =
        parent?.type === "MemberExpression" &&
        parent.object === node &&
        !parent.computed;
      if (!plainMember) {
        flag(node);
        return;
      }
    }
    for (const next of children(node)) visit(next, trail);
  };
  visit(root, []);
}

function emptyScan(): Scan {
  return { sites: [], indirect: [], parseErrors: [] };
}

function scanWorker(): Scan {
  const scan = emptyScan();
  for (const file of sourceFiles(workerDir)) {
    scanSource(file, readFileSync(file, "utf8"), scan);
  }
  return scan;
}

function scanSnippet(text: string, file = "zz-probe.ts"): Scan {
  const scan = emptyScan();
  scanSource(path.join(workerDir, file), text, scan);
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

describe("the call-site scan fails closed", () => {
  const IMPORT = 'import { completeJson } from "./llm.js";\n';
  const NAMESPACE = 'import * as llm from "./llm.js";\n';

  it.each([
    ["an alias binding", `${IMPORT}const ask = completeJson;`],
    ["a renamed re-export", 'export { completeJson as ask } from "./llm.js";'],
    ["a same-name re-export", 'export { completeJson } from "./llm.js";'],
    ["a star re-export", 'export * from "./llm.js";'],
    ["a helper export", `${IMPORT}export { completeJson as ask };`],
    ["a namespace alias", `${NAMESPACE}const l = llm;`],
    ["namespace destructuring", `${NAMESPACE}const { completeJson: a } = llm;`],
    ["a computed member", `${NAMESPACE}llm["completeJson"](env, [], {});`],
    ["a dynamic import", 'const m = await import("./llm.js");'],
    ["a non-literal import", "const m = await import(name);"],
    [
      "an extensionless alias",
      `${IMPORT.replace(".js", "")}const a = completeJson;`,
    ],
    ["a .ts alias", `${IMPORT.replace(".js", ".ts")}const a = completeJson;`],
    [
      "an @/ alias",
      `${IMPORT.replace("./", "@/worker/")}const a = completeJson;`,
    ],
    ["an @/ re-export", 'export * from "@/worker/llm.js";'],
  ])("flags %s", (_, source) => {
    expect(scanSnippet(source).indirect).toHaveLength(1);
  });

  it("flags a renamed export inside llm.ts", () => {
    const scan = scanSnippet(
      "async function callAnyrouter() {}\nexport { callAnyrouter as ask };",
      "llm.ts"
    );
    expect(scan.indirect).toEqual(["llm.ts:2"]);
  });

  it("follows calls it can classify", () => {
    const scan = scanSnippet(
      `${NAMESPACE}${IMPORT.replace("completeJson }", "completeJson as cj }")}` +
        "export function viaNamespace() { return llm.completeJson(env, [], { sensitive: true }); }\n" +
        "export function viaAlias() { return cj(env, []); }\n" +
        "export type Parsed = ReturnType<typeof llm.parseJson>;\n" +
        'const other = await import("./topics.js");'
    );
    expect(scan.indirect).toEqual([]);
    expect(scan.sites).toEqual([
      { key: "zz-probe.ts#viaNamespace", sensitive: true },
      { key: "zz-probe.ts#viaAlias", sensitive: false },
    ]);
  });
});
