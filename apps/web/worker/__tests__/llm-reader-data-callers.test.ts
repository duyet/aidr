import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * A failed `callAnyrouter` attempt can keep a response snippet in
 * `llm_calls`, and a provider error body can echo the prompt. A prompt that
 * carries reader-written text (suggestions, submissions) must pass
 * `sensitive: true` so no snippet is stored for it.
 *
 * Every model call site in `worker/` is listed here, keyed by file and
 * enclosing function. A new call site fails the scan until someone decides
 * whether its prompt can hold reader data.
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

const workerDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return entry.name === "__tests__" ? [] : sourceFiles(full);
    }
    return entry.name.endsWith(".ts") ? [full] : [];
  });
}

/** The call's argument text, from its `(` to the matching `)`. */
function callText(source: string, open: number): string {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "(") depth++;
    else if (source[i] === ")" && --depth === 0) {
      return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
}

interface CallSite {
  key: string;
  args: string;
}

function callSites(): CallSite[] {
  const sites: CallSite[] = [];
  const call = /\b(?:callAnyrouter|completeJson|completeJsonWithModel)\(/g;
  for (const file of sourceFiles(workerDir)) {
    const source = readFileSync(file, "utf8");
    const rel = path.relative(workerDir, file).split(path.sep).join("/");
    for (const match of source.matchAll(call)) {
      const before = source.slice(0, match.index);
      if (/function\s+$/.test(before)) continue;
      const fn = [...before.matchAll(/function\s+(\w+)/g)].at(-1)?.[1];
      sites.push({
        key: `${rel}#${fn ?? "<top level>"}`,
        args: callText(source, match.index + match[0].length - 1),
      });
    }
  }
  return sites;
}

describe("LLM call sites that carry reader data", () => {
  const sites = callSites();

  it("classifies every call site", () => {
    const found = [...new Set(sites.map((site) => site.key))].sort();
    expect(found).toEqual(Object.keys(CALL_SITES).sort());
  });

  it("marks every reader-data call sensitive", () => {
    const unmarked = sites
      .filter((site) => CALL_SITES[site.key]?.readerData)
      .filter((site) => !/\bsensitive:\s*true\b/.test(site.args))
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
