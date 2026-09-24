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
