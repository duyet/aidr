/** @vitest-environment happy-dom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { type ReactNode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "../../lib/analytics/track";
import { LangContext } from "../../lib/lang-context";
import { DEFAULT_PREFS, type Prefs, PrefsContext } from "../../lib/prefs";
import type { Lang } from "../../lib/types";
import { GetAIDRMenu } from "./GetAIDRMenu";

const route = vi.hoisted(() => ({ path: "/" }));
vi.mock("../../lib/analytics/track", () => ({ track: vi.fn() }));
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

// Links in a DOM test must not navigate: happy-dom would fetch the page.
const stopNavigation = (event: Event) => {
  if ((event.target as Element).closest("a")) event.preventDefault();
};
beforeEach(() => document.addEventListener("click", stopNavigation));
afterEach(() => document.removeEventListener("click", stopNavigation));

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
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

async function openMenu(lang: Lang) {
  render(
    <Providers lang={lang}>
      <GetAIDRMenu />
    </Providers>
  );
  const trigger = screen.getByRole("button", { name: "AI;DR" });
  fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog");
  return { trigger, dialog };
}

describe("GetAIDRMenu", () => {
  it("is one button named AI;DR, with no Get or Nhận", () => {
    render(
      <Providers lang="vi">
        <GetAIDRMenu />
      </Providers>
    );
    const trigger = screen.getByRole("button", { name: "AI;DR" });
    expect(trigger.className).toContain("btn-primary");
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens a popover named for following, email first and no site pages", async () => {
    const { trigger, dialog } = await openMenu("vi");
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Theo dõi AI;DR" })).toBe(dialog);
    expect(
      within(dialog).getByRole("button", { name: "Đăng ký" })
    ).toBeTruthy();
    const names = within(dialog)
      .getAllByRole("link")
      .map((a) => a.textContent);
    expect(names).toEqual([
      "Chọn giờ và tần suất",
      "Telegram@aihomnay",
      "FacebookTrang tiếng Anh",
      "ChromeTin AI trên tab mới",
      "MCP serverCho trợ lý AI",
      "RSSCho trình đọc tin",
    ]);
    for (const page of ["Giới thiệu", "Dữ liệu", "Phát hành", "About"]) {
      expect(within(dialog).queryByText(page)).toBeNull();
    }
  });

  it("links each row where it promises, with the reader's language", async () => {
    const { dialog } = await openMenu("en");
    const href = (name: RegExp) =>
      within(dialog).getByRole("link", { name }).getAttribute("href");
    expect(href(/Telegram/)).toBe("https://t.me/aidr_today");
    expect(href(/Facebook/)).toBe("https://www.facebook.com/aidr.today/");
    expect(href(/Chrome/)).toBe("/subscribe?lang=en");
    expect(href(/MCP/)).toBe("/mcp?lang=en");
    expect(href(/RSS/)).toBe("/subscribe?tab=rss&lang=en");
    expect(href(/time and frequency/)).toBe("/subscribe?tab=email&lang=en");
  });

  it("reports each row from the header menu and closes the popover", async () => {
    const { dialog } = await openMenu("en");
    fireEvent.click(within(dialog).getByRole("link", { name: /Telegram/ }));
    expect(track).toHaveBeenCalledExactlyOnceWith("channel_click", {
      channel: "telegram",
      placement: "header_menu",
      lang: "en",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    vi.mocked(track).mockClear();
    fireEvent.click(screen.getByRole("button", { name: "AI;DR" }));
    const again = await screen.findByRole("dialog");
    fireEvent.click(within(again).getByRole("link", { name: /MCP/ }));
    expect(track).toHaveBeenCalledExactlyOnceWith("nav_click", {
      to: "/mcp",
      placement: "header_menu",
    });
  });

  it("subscribes in one step in the reader's language", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { dialog } = await openMenu("vi");
    fireEvent.input(within(dialog).getByRole("textbox", { name: "Email" }), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Đăng ký" }));
    await within(dialog).findByRole("status");
    expect(within(dialog).getByRole("status").textContent).toContain(
      "bấm link xác nhận"
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/subscribe");
    expect(JSON.parse(String(init.body))).toMatchObject({
      email: "reader@example.com",
      lang: "vi",
      source: "news",
    });
    expect(vi.mocked(track).mock.calls).toEqual([
      ["subscribe_submit", { source: "news" }],
      ["subscribe_success", { source: "news" }],
    ]);
  });

  it("says so and reports why when the signup is refused", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 429 }));
    const { dialog } = await openMenu("en");
    fireEvent.input(within(dialog).getByRole("textbox", { name: "Email" }), {
      target: { value: "reader@example.com" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Subscribe" }));
    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toBe(
      "Could not subscribe. Try again in a few minutes."
    );
    expect(track).toHaveBeenLastCalledWith("subscribe_error", {
      source: "news",
      reason: "rate_limited",
    });
  });
});
