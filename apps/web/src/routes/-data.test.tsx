import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LangContext } from "../lib/lang-context";
import { Route, SystemPage } from "./data";

vi.mock("../lib/admin", () => ({
  useAdmin: () => ({
    isAdmin: false,
    loading: false,
    getToken: async () => null,
  }),
}));

vi.mock("../components/system/AdminPanel", () => ({
  AdminPanel: () => null,
}));
vi.mock("../components/system/AlgoTab", () => ({ AlgoTab: () => null }));
vi.mock("../components/system/ContentTab", () => ({
  ContentTab: () => null,
}));
vi.mock("../components/system/LlmTab", () => ({ LlmTab: () => null }));
vi.mock("../components/system/ModelAttribution", () => ({
  ModelAttribution: () => null,
}));
vi.mock("../components/system/OverviewTab", () => ({
  OverviewTab: () => null,
}));
vi.mock("../components/system/RunsTab", () => ({
  RunsTab: ({ lang }: { lang: string }) => (
    <div data-testid="runs-tab-language">{lang}</div>
  ),
}));
vi.mock("../components/system/SourcesTab", () => ({
  SourcesTab: () => null,
}));

function renderPage(): string {
  vi.spyOn(Route, "useSearch").mockReturnValue({} as never);
  vi.spyOn(Route, "useNavigate").mockReturnValue((() => undefined) as never);
  return renderToStaticMarkup(
    <LangContext.Provider value="en">
      <SystemPage />
    </LangContext.Provider>
  );
}

describe("/data route localization", () => {
  it("passes the reachable bilingual context to the Runs tab", () => {
    vi.spyOn(Route, "useSearch").mockReturnValue({ tab: "runs" } as never);
    vi.spyOn(Route, "useNavigate").mockReturnValue((() => undefined) as never);

    const html = renderToStaticMarkup(
      <LangContext.Provider value="vi">
        <SystemPage />
      </LangContext.Provider>
    );

    expect(html).toContain('data-testid="runs-tab-language"');
    expect(html).toContain("vi");
  });
});

describe("/data layout", () => {
  it("keeps the six reader-facing tabs and hides Admin from non-admins", () => {
    const html = renderPage();

    for (const label of [
      "Overview",
      "Content",
      "Runs",
      "Sources",
      "LLM",
      "Algo",
    ]) {
      expect(html).toContain(`>${label}</button>`);
    }
    expect(html).not.toContain(">Admin</button>");
  });

  it("leads with a quiet page header and a full-width model strip", () => {
    const html = renderPage();

    // The signups metric now lives in the Overview tab, so the header is just
    // a title and a one-line description — no lonely card in the corner.
    expect(html).toContain("Pipeline</h1>");
    expect(html).toContain("Live ingest, content, and token use.");
    expect(html).not.toContain("AIDR user signups");
    expect(html).not.toContain("Clerk accounts");
  });
});
