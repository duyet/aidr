/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LangContext } from "../../lib/lang-context";
import type { ModelChains } from "../../lib/system-queries";
import type { Lang } from "../../lib/types";
import { AccountCountView } from "./AccountCountCard";
import { AttributionView } from "./ModelAttribution";

afterEach(cleanup);

const models = {
  scoring: ["typesafe/jev", "anyrouter/auto", "deepseek/deepseek-v4.1-flash"],
  translation: ["google/gemini-3.5-flash", "anyrouter/auto"],
  tldr: ["anyrouter/auto"],
  decisions: [],
};

function renderWithLang(lang: Lang, modelChains: ModelChains): void {
  render(
    <LangContext.Provider value={lang}>
      <AttributionView models={modelChains} />
    </LangContext.Provider>
  );
}

/** `ModelChains` requires all four tasks; the grid always renders all four. */
function chains(overrides: Partial<ModelChains> = {}): ModelChains {
  return {
    scoring: [],
    translation: [],
    tldr: [],
    decisions: [],
    ...overrides,
  };
}

/** One chain per fallback count, from a direct lead to a deep fallback stack. */
const CHAIN_CASES = [
  {
    label: "a direct chain with no fallbacks",
    chain: ["anyrouter/auto"],
    visible: "direct",
    spoken: "direct, no fallback models",
    subline: "No fallback configured",
    tooltip: "No fallback models",
  },
  {
    label: "exactly one fallback hop",
    chain: ["google/gemini-3.5-flash", "anyrouter/auto"],
    visible: "1 hop",
    spoken: "1 fallback hop",
    subline: "1 fallback after lead",
    tooltip: "1 fallback: anyrouter/auto",
  },
  {
    label: "two fallback hops",
    chain: ["typesafe/jev", "anyrouter/auto", "deepseek/deepseek-v4.1-flash"],
    visible: "2 hops",
    spoken: "2 fallback hops",
    subline: "2 fallbacks after lead",
    tooltip: "2 fallbacks: anyrouter/auto → deepseek/deepseek-v4.1-flash",
  },
  {
    label: "three fallback hops",
    chain: ["typesafe/jev", "anyrouter/auto", "a/second", "b/third"],
    visible: "3 hops",
    spoken: "3 fallback hops",
    subline: "3 fallbacks after lead",
    tooltip: "3 fallbacks: anyrouter/auto → a/second → b/third",
  },
] as const;

describe("AttributionView", () => {
  it("shows the four tasks, actual lead models, and fallback hop depth", () => {
    render(<AttributionView models={models} />);

    expect(screen.getByText("Score")).toBeTruthy();
    expect(screen.getByText("Translate")).toBeTruthy();
    expect(screen.getByText("TL;DR")).toBeTruthy();
    expect(screen.getByText("Decisions")).toBeTruthy();
    expect(screen.getByText("typesafe/jev")).toBeTruthy();
    expect(screen.getByText("google/gemini-3.5-flash")).toBeTruthy();
    expect(screen.getByText("2 hops")).toBeTruthy();
    expect(screen.getByText("1 hop")).toBeTruthy();
    expect(screen.getByText("direct")).toBeTruthy();
    expect(
      screen.getByRole("link", {
        name: "Score lead model typesafe/jev, 2 fallback hops",
      })
    ).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "Open AnyRouter in a new tab" })
    ).toBeTruthy();
  });

  it("makes an unconfigured task explicit instead of showing a fake model", () => {
    render(<AttributionView models={models} />);

    expect(screen.getByText("Not configured")).toBeTruthy();
    expect(screen.getByText("No model source available")).toBeTruthy();
    expect(screen.getByText("unavailable")).toBeTruthy();
  });
});

describe("AttributionView fallback accessible names", () => {
  // The lead-model link overrides its text content, so its accessible name is
  // the only thing a screen reader announces. It must never contradict the
  // visible hop pill next to it.
  it.each(CHAIN_CASES)(
    "names $label consistently with the visible hop text",
    ({ chain, visible, spoken, subline, tooltip }) => {
      const [lead] = chain;
      render(<AttributionView models={chains({ scoring: [...chain] })} />);

      expect(screen.getByText(visible)).toBeTruthy();
      expect(screen.getByText(subline)).toBeTruthy();

      const link = screen.getByRole("link", {
        name: `Score lead model ${lead}, ${spoken}`,
      });
      expect(link.getAttribute("title")).toBe(chain.join(" → "));

      const pill = screen.getByText(visible);
      expect(pill.getAttribute("title")).toBe(tooltip);
    }
  );

  it("never announces a zero or mis-inflected fallback count", () => {
    render(<AttributionView models={models} />);

    const names = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("aria-label") ?? "");

    expect(names).toEqual([
      "Open AnyRouter in a new tab",
      "Score lead model typesafe/jev, 2 fallback hops",
      "Translate lead model google/gemini-3.5-flash, 1 fallback hop",
      "TL;DR lead model anyrouter/auto, direct, no fallback models",
    ]);
    for (const name of names) {
      expect(name).not.toMatch(/0 fallback/);
      expect(name).not.toMatch(/\b1 fallback hops\b/);
      expect(name).not.toMatch(/\b1 hops\b/);
    }
  });

  it("keeps direct chains out of the numeric fallback vocabulary", () => {
    render(<AttributionView models={chains({ tldr: ["anyrouter/auto"] })} />);

    expect(screen.getByText("direct")).toBeTruthy();
    expect(
      screen.getByRole("link", {
        name: "TL;DR lead model anyrouter/auto, direct, no fallback models",
      })
    ).toBeTruthy();
    expect(screen.queryByText(/0 hop/)).toBeNull();
    expect(screen.queryByText(/0 fallback/)).toBeNull();
  });
});

describe("AttributionView model and unavailable states", () => {
  it("exposes the card as a named region instead of a dangling id", () => {
    render(<AttributionView models={models} />);

    const region = screen.getByRole("region", {
      name: "Powered by AnyRouter",
    });
    const title = region.querySelector("[id]");
    expect(title?.id).toBeTruthy();
    expect(title?.textContent).toBe("Powered by AnyRouter");
  });

  it("never repeats an element id when rendered more than once", () => {
    render(
      <>
        <AttributionView models={models} />
        <AttributionView models={models} />
      </>
    );

    const ids = Array.from(document.querySelectorAll("[id]")).map(
      (node) => node.id
    );
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      screen.getAllByRole("region", { name: "Powered by AnyRouter" })
    ).toHaveLength(2);
  });

  it("links only configured models and claims no fallback hop when unavailable", () => {
    render(<AttributionView models={chains()} />);

    // No lead model, so no model link and no fabricated model identity.
    expect(screen.queryByRole("link", { name: /Decisions/ })).toBeNull();
    expect(screen.getAllByText("unavailable")).toHaveLength(4);
    expect(screen.getAllByText("Not configured")).toHaveLength(4);
    expect(screen.getAllByText("No model source available")).toHaveLength(4);
    // The unavailable pill has no chain tooltip to leak a fake chain.
    for (const pill of screen.getAllByText("unavailable")) {
      expect(pill.getAttribute("title")).toBeNull();
    }
  });

  it("treats a missing task key the same as an unconfigured one", () => {
    // `ModelChains` declares all four tasks, but the grid defends with
    // `models[key] ?? []`; drop one key to exercise that runtime guard.
    const { decisions: _omitted, ...withoutDecisions } = chains({
      scoring: ["anyrouter/auto"],
    });
    render(
      <AttributionView models={withoutDecisions as unknown as ModelChains} />
    );

    expect(screen.getByText("direct")).toBeTruthy();
    expect(screen.getAllByText("unavailable")).toHaveLength(3);
    expect(screen.getAllByText("No model source available")).toHaveLength(3);
    // Only the AnyRouter link and the one configured model link exist.
    expect(screen.getAllByRole("link")).toHaveLength(2);
  });
});

describe("AttributionView locale contract", () => {
  // /data is an English-only dashboard (`const lang: Lang = "en"` in
  // routes/data.tsx), so the card must render identical accessible names
  // under both locales instead of leaking or translating hop wording.
  it.each(["en", "vi"] as const)(
    "renders the same English labels for the %s locale",
    (lang) => {
      renderWithLang(
        lang,
        chains({
          scoring: [
            "typesafe/jev",
            "anyrouter/auto",
            "deepseek/deepseek-v4.1-flash",
          ],
          translation: ["google/gemini-3.5-flash", "anyrouter/auto"],
          tldr: ["anyrouter/auto"],
        })
      );

      expect(screen.getByText("Powered by AnyRouter")).toBeTruthy();
      expect(
        screen.getByText("Lead model + fallback depth · public config only")
      ).toBeTruthy();
      expect(screen.getByText("direct")).toBeTruthy();
      expect(screen.getByText("1 hop")).toBeTruthy();
      expect(screen.getByText("2 hops")).toBeTruthy();
      expect(screen.getByText("unavailable")).toBeTruthy();
      expect(
        screen.getByRole("link", {
          name: "Translate lead model google/gemini-3.5-flash, 1 fallback hop",
        })
      ).toBeTruthy();
      expect(
        screen.getByRole("link", {
          name: "TL;DR lead model anyrouter/auto, direct, no fallback models",
        })
      ).toBeTruthy();
      expect(
        screen.getByRole("link", { name: "Open AnyRouter in a new tab" })
      ).toBeTruthy();
    }
  );
});

describe("AccountCountView", () => {
  it("labels the aggregate separately from subscribers", () => {
    render(
      <AccountCountView
        data={{ total: 37, source: "clerk", status: "available" }}
      />
    );

    expect(screen.getByText("AIDR user signups")).toBeTruthy();
    expect(screen.getByText("37")).toBeTruthy();
    expect(screen.getByText("Clerk accounts · aggregate total")).toBeTruthy();
    expect(screen.queryByText("Subscribers")).toBeNull();
  });

  it.each([
    ["unconfigured", "Account source is not configured."],
    ["error", "Account source could not be read."],
  ] as const)("renders the honest %s state", (status, detail) => {
    render(
      <AccountCountView data={{ total: null, source: "clerk", status }} />
    );

    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.getByText("Unavailable")).toBeTruthy();
    expect(screen.getByText(detail)).toBeTruthy();
    expect(screen.queryByText("0")).toBeNull();
  });
});
