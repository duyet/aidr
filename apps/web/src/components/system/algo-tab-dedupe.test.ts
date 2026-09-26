import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), "utf8");

describe("algo tab model chains", () => {
  it("renders the four chains in exactly one place on the tab", () => {
    // The chains used to appear in both RankingCard and the AnyRouter card,
    // making the tab mostly duplicated text. Ranking keeps them; the AnyRouter
    // card is a gateway pitch only.
    const algo = read("AlgoTab.tsx");
    for (const key of ["scoring", "translation", "tldr", "decisions"]) {
      expect(algo, key).not.toContain(`.${key}`);
      expect(algo, key).not.toContain(`: models.${key}`);
      expect(algo, key).not.toContain(`models.${key}`);
    }
    // No per-model links left in the card that dropped them.
    expect(algo).not.toContain("anyrouterModelUrl");
    // It no longer needs to fetch the models it does not render.
    expect(algo).not.toContain("useSystemData");
    // The pitch keeps the referral link.
    expect(algo).toContain("anyrouter.dev/?ref=aidr.today");
  });

  it("keeps the chains rendered in the Ranking card", () => {
    const explainer = read("RankingExplainer.tsx");
    for (const key of ["scoring", "translation", "tldr", "decisions"]) {
      expect(explainer, key).toContain(`models.${key}`);
    }
    // One <ModelChain> per task — the copy cannot quietly drop one.
    expect(explainer.match(/<ModelChain /g)).toHaveLength(4);
  });

  it("keeps the ranking formula intact while compacting the layout", () => {
    const explainer = read("RankingExplainer.tsx");
    // chrome-copy.test.ts already pins the GitHub link and the sources term.
    expect(explainer).toContain("GITHUB_ALGORITHM_URL");
    expect(explainer).toContain("min(sourceCount, 8)");
    // A separator only existed to split the two duplicate blocks.
    expect(explainer).not.toContain("Separator");
  });
});

describe("data tab spacing", () => {
  const panels = [
    "OverviewTab.tsx",
    "ContentTab.tsx",
    "RunsTab.tsx",
    "SourcesTab.tsx",
    "LlmTab.tsx",
    "AlgoTab.tsx",
  ];

  it("gives every tab body the same gap below the strip", () => {
    for (const file of panels) {
      const src = read(file);
      expect(src, file).toContain("TAB_PANEL");
      // `mt-0` glues the first card to the tab strip; `mt-2` is the
      // primitive default and reads as too tight on a full-width page.
      expect(src, file).not.toMatch(/TabsContent[^>]*className="[^"]*mt-0/);
    }
  });

  it("keeps the spacing in one shared module", () => {
    expect(read("tab-spacing.ts")).toContain("export const TAB_PANEL");
    // The route's admin panel is the seventh body; it must not drift either.
    expect(read("../../routes/data.tsx")).toContain("TAB_PANEL");
  });

  it("leaves the tab strip room around its triggers", () => {
    const route = read("../../routes/data.tsx");
    // Match across lines: the className is on the line after the tag.
    const tokensOf = (tag: string) =>
      route
        .match(new RegExp(`<${tag}[\\s\\S]*?className="([^"]*)"`))?.[1]
        .split(/\s+/) ?? [];

    // Token-exact: a substring check would also match `gap-1.5` and would
    // keep passing if the padding were reverted to `p-1`.
    const list = tokensOf("TabsList");
    expect(list).toEqual(
      expect.arrayContaining(["p-1.5", "gap-1.5", "min-h-11"])
    );
    expect(list).not.toContain("p-1");

    expect(tokensOf("TabsTrigger")).toEqual(
      expect.arrayContaining(["px-4", "py-2", "text-sm"])
    );
  });
});
