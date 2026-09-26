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
      expect(algo).not.toContain(`.${key}`);
    }
    expect(algo).not.toContain("anyrouterModelUrl");
    expect(algo).not.toContain("useSystemData");
    // The pitch keeps the referral link and the shared gateway explainer.
    expect(algo).toContain("anyrouter.dev/?ref=aidr.today");

    const explainer = read("RankingExplainer.tsx");
    for (const key of ["scoring", "translation", "tldr", "decisions"]) {
      expect(explainer).toContain(`models.${key}`);
    }
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
    const spacing = read("tab-spacing.ts");
    expect(spacing).toContain("export const TAB_PANEL");
    // The route's admin panel is the seventh body; it must not drift either.
    expect(read("../../routes/data.tsx")).toContain("TAB_PANEL");
  });

  it("leaves the tab strip room around its triggers", () => {
    const route = read("../../routes/data.tsx");
    expect(route).toMatch(/TabsList[^>]*p-1\.5/);
    expect(route).not.toMatch(/TabsList[^>]*p-1"/);
  });
});

describe("telegram tab preview", () => {
  it("shows a channel mock instead of copy and a button only", () => {
    const src = read("../subscribe/DeliverPage.tsx");
    expect(src).toContain("TelegramPreview");
    // Both message shapes the bot actually sends.
    expect(src).toContain("buildDigestMessage");
    expect(src).toContain("buildStoryCaption");
    // Rendered inside the shared frame, like the other two tabs.
    expect(src).toMatch(/function TelegramPreview[\s\S]*BrowserFrame/);
    // Feature list, so the tab matches the Chrome tab's rhythm.
    expect(src).toContain("TELEGRAM_FEATURES");
  });

  it("keeps the preview copy inside the existing en/vi pattern", () => {
    const src = read("../subscribe/DeliverPage.tsx");
    expect(src).toContain("TELEGRAM_DIGEST");
    // No hardcoded English in the rendered preview body: every string is
    // either indexed by lang or routed through t().
    expect(src).toMatch(/const copy = TELEGRAM_DIGEST\[lang === "vi"/);
  });
});
