/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LangContext } from "../lib/lang-context";
import { DEFAULT_PREFS, type Prefs, PrefsContext } from "../lib/prefs";
import type { Lang } from "../lib/types";
import { Bi } from "./Bi";
import { LangToggle } from "./LangToggle";

afterEach(cleanup);

/** The root's wiring in miniature: the language lives in state and the
 *  prefs in context, so a switch is visible in the rendered text. */
function Page({
  initialLang,
  initialPrefs = {},
  onLangChange,
}: {
  initialLang: Lang;
  initialPrefs?: Partial<Prefs>;
  onLangChange: (lang: Lang) => void;
}) {
  const [lang, setLang] = useState(initialLang);
  const [prefs, setPrefsState] = useState<Prefs>({
    ...DEFAULT_PREFS,
    ...initialPrefs,
  });
  const wrap = (children: ReactNode) => (
    <LangContext.Provider value={lang}>
      <PrefsContext.Provider
        value={{
          prefs,
          setPrefs: (update) => setPrefsState((p) => ({ ...p, ...update })),
        }}
      >
        {children}
      </PrefsContext.Provider>
    </LangContext.Provider>
  );
  return wrap(
    <>
      <LangToggle
        lang={lang}
        onChange={(next) => {
          onLangChange(next);
          setLang(next);
        }}
      />
      <Bi vi="Hôm nay" en="Today" as="p" />
    </>
  );
}

const checked = () =>
  screen
    .getAllByRole("radio")
    .filter((r) => r.getAttribute("aria-checked") === "true")
    .map((r) => r.textContent);

describe("LangToggle", () => {
  it("offers only VI and EN, with the current language checked", () => {
    render(<Page initialLang="vi" onLangChange={vi.fn()} />);
    expect(
      screen.getByRole("radiogroup", { name: "Ngôn ngữ" }).textContent
    ).toBe("VIEN");
    expect(checked()).toEqual(["VI"]);
  });

  it("switches language with EN and never shows the other language", () => {
    const onLangChange = vi.fn();
    render(<Page initialLang="vi" onLangChange={onLangChange} />);
    fireEvent.click(screen.getByRole("radio", { name: "EN" }));
    expect(onLangChange).toHaveBeenCalledExactlyOnceWith("en");
    expect(checked()).toEqual(["EN"]);
    expect(screen.getByRole("paragraph").textContent).toBe("Today");
  });

  it("leaves bilingual mode to Customize: switching language keeps the pref", () => {
    render(
      <Page
        initialLang="vi"
        initialPrefs={{ bilingual: true }}
        onLangChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByRole("radio", { name: "EN" }));
    expect(screen.getByRole("paragraph").textContent).toContain("Today");
    expect(screen.getByRole("paragraph").textContent).toContain("Hôm nay");
  });

  it("moves with the arrow keys like a radio group", () => {
    const onLangChange = vi.fn();
    render(<Page initialLang="vi" onLangChange={onLangChange} />);
    const vi_ = screen.getByRole("radio", { name: "VI" });
    vi_.focus();
    fireEvent.keyDown(vi_, { key: "ArrowRight" });
    expect(onLangChange).toHaveBeenCalledExactlyOnceWith("en");
    expect(document.activeElement).toBe(
      screen.getByRole("radio", { name: "EN" })
    );
  });
});
