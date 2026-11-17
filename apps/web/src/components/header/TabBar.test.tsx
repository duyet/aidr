/** @vitest-environment happy-dom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import {
  createDrawerController,
  type DrawerController,
} from "@ui-sdk/react/drawer";
import { type ReactNode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "../../lib/analytics/track";
import { LangContext } from "../../lib/lang-context";
import { DEFAULT_PREFS, type Prefs, PrefsContext } from "../../lib/prefs";
import type { Lang } from "../../lib/types";
import { HeaderNav } from "./HeaderNav";
import { PhoneMenu } from "./PhoneMenu";
import { TabBar } from "./TabBar";

const route = vi.hoisted(() => ({ path: "/" }));
vi.mock("../../lib/analytics/track", () => ({ track: vi.fn() }));
vi.mock("../../lib/calendar-fn", () => ({
  fetchCalendarMonth: vi.fn(async () => null),
}));
vi.mock("@tanstack/react-router", async () => {
  const React = await import("react");
  return {
    Link: ({
      children,
      to,
      search,
      params: _params,
      ...props
    }: {
      children?: React.ReactNode;
      to?: string;
      search?: Record<string, string>;
      [key: string]: unknown;
    }) => {
      const url = new URL((to ?? "#").replace(/\/\$$/, ""), "http://localhost");
      for (const [key, value] of Object.entries(search ?? {})) {
        url.searchParams.set(key, value);
      }
      return React.createElement(
        "a",
        { ...props, href: `${url.pathname}${url.search}${url.hash}` },
        children
      );
    },
    useRouterState: ({
      select,
    }: {
      select: (state: {
        location: { pathname: string; href: string };
      }) => unknown;
    }) =>
      select({
        location: { pathname: route.path, href: `${route.path}?lang=en` },
      }),
  };
});

beforeEach(() => {
  route.path = "/";
});
afterEach(() => {
  cleanup();
  vi.mocked(track).mockClear();
});

function Providers({ lang, children }: { lang: Lang; children: ReactNode }) {
  const [prefs, setPrefsState] = useState<Prefs>(DEFAULT_PREFS);
  return (
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
}

function Bars({ lang }: { lang: Lang }) {
  const [menu] = useState<DrawerController>(createDrawerController);
  return (
    <Providers lang={lang}>
      <HeaderNav lang={lang} />
      <TabBar lang={lang} menu={menu} />
      <PhoneMenu
        controller={menu}
        lang={lang}
        onLangChange={() => undefined}
        langToggleDisabled={false}
      />
    </Providers>
  );
}

const tabBar = (name = "Tab bar") =>
  within(screen.getByRole("navigation", { name }));

describe("menu bar nav and phone tab bar", () => {
  it("name Today, Weeks and Calendar in English even in Vietnamese, each with an icon", () => {
    render(<Bars lang="vi" />);
    const main = within(screen.getByRole("navigation", { name: "Chính" }));
    const items = [
      main.getByRole("link", { name: "Today" }),
      main.getByRole("link", { name: "Weeks" }),
      main.getByRole("link", { name: "Calendar" }),
    ];
    for (const item of items) expect(item.querySelector("svg")).not.toBeNull();
    expect(items[0].getAttribute("href")).toBe("/?lang=vi");
    expect(items[1].getAttribute("href")).toBe("/weeks?lang=vi");
    expect(
      tabBar("Thanh điều hướng")
        .getAllByRole("link")
        .map((a) => a.textContent)
    ).toEqual(["Today", "Weeks", "Calendar"]);
  });

  it("marks the current page in both bars", () => {
    route.path = "/weeks/";
    render(<Bars lang="en" />);
    const main = within(screen.getByRole("navigation", { name: "Main" }));
    expect(
      main.getByRole("link", { name: "Weeks" }).getAttribute("aria-current")
    ).toBe("page");
    expect(
      main.getByRole("link", { name: "Today" }).getAttribute("aria-current")
    ).toBeNull();
    expect(
      tabBar().getByRole("link", { name: "Weeks" }).getAttribute("aria-current")
    ).toBe("page");
  });

  it("marks Calendar current on the calendar page", () => {
    route.path = "/calendar";
    render(<Bars lang="vi" />);
    const main = within(screen.getByRole("navigation", { name: "Chính" }));
    expect(
      main.getByRole("link", { name: "Calendar" }).getAttribute("aria-current")
    ).toBe("page");
  });

  it("reports a nav click by route id from the tab bar", () => {
    render(<Bars lang="en" />);
    fireEvent.click(tabBar().getByRole("link", { name: "Weeks" }));
    expect(track).toHaveBeenCalledExactlyOnceWith("nav_click", {
      to: "/weeks",
      placement: "tab_bar",
    });
  });

  it("opens the month grid as a sheet from the Calendar tab and a popover from the menu bar", async () => {
    render(<Bars lang="en" />);
    fireEvent.click(tabBar().getByRole("link", { name: "Calendar" }));
    await screen.findByRole("dialog", { name: "Browse past editions" });
    expect(track).toHaveBeenLastCalledWith("calendar_open", {
      placement: "sheet",
    });
    cleanup();
    vi.mocked(track).mockClear();

    render(<Bars lang="en" />);
    const main = within(screen.getByRole("navigation", { name: "Main" }));
    fireEvent.click(main.getByRole("link", { name: "Calendar" }));
    await screen.findByRole("dialog", { name: "Browse past editions" });
    expect(track).toHaveBeenCalledExactlyOnceWith("calendar_open", {
      placement: "popover",
    });
  });

  it("opens the AI;DR menu from the last tab", async () => {
    render(<Bars lang="en" />);
    const tab = tabBar().getByRole("button", { name: "AI;DR" });
    expect(tab.querySelector("[aria-hidden]")?.textContent).toBe(";");
    fireEvent.click(tab);
    await screen.findByRole("dialog", { name: "AI;DR" });
  });
});
