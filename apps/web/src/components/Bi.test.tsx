/** @vitest-environment happy-dom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LangContext } from "../lib/lang-context";
import { DEFAULT_PREFS, type Prefs, PrefsContext } from "../lib/prefs";
import type { Lang } from "../lib/types";
import { Bi } from "./Bi";

function setup(lang: Lang, prefs: Partial<Prefs>, ui: React.ReactElement) {
  return render(
    <LangContext.Provider value={lang}>
      <PrefsContext.Provider
        value={{ prefs: { ...DEFAULT_PREFS, ...prefs }, setPrefs: () => {} }}
      >
        {ui}
      </PrefsContext.Provider>
    </LangContext.Provider>
  );
}

afterEach(cleanup);

describe("Bi", () => {
  it("shows only the current language when bilingual mode is off", () => {
    setup("vi", {}, <Bi vi="Đăng ký" en="Subscribe" />);
    expect(screen.getByText("Đăng ký")).toBeTruthy();
    expect(screen.queryByText("Subscribe")).toBeNull();
  });

  it("shows both, leading language first, when bilingual mode is on", () => {
    setup(
      "en",
      { bilingual: true, bilingualFirst: "en" },
      <Bi vi="Đăng ký" en="Subscribe" />
    );
    const en = screen.getByText("Subscribe");
    const vi = screen.getByText("Đăng ký");
    expect(
      en.compareDocumentPosition(vi) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(vi.className).toContain("bi-second");
  });

  it("never fills a missing language from the other one", () => {
    const { container } = setup("vi", {}, <Bi vi={null} en="Subscribe" />);
    expect(container.textContent).toBe("");
    const both = setup(
      "vi",
      { bilingual: true },
      <Bi vi="Chỉ tiếng Việt" en="" />
    );
    expect(both.container.textContent).toBe("Chỉ tiếng Việt");
  });

  it("puts short labels on one line when inline", () => {
    setup("vi", { bilingual: true }, <Bi inline vi="Lịch" en="Calendar" />);
    expect(screen.getByText("Lịch").parentElement?.textContent).toBe(
      "Lịch / Calendar"
    );
  });

  it("separates the two languages with a space in the accessible text", () => {
    const { container } = setup(
      "vi",
      { bilingual: true },
      <Bi vi="Tìm kiếm" en="Search" />
    );
    expect(container.textContent).toBe("Tìm kiếm Search");
  });
});
