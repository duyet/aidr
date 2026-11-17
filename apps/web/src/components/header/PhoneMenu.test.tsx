/** @vitest-environment happy-dom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import {
  createDrawerController,
  type DrawerController,
} from "@ui-sdk/react/drawer";
import { type ReactNode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "../../lib/analytics/track";
import { introVideoEmbedUrl } from "../../lib/intro-video";
import { LangContext } from "../../lib/lang-context";
import { DEFAULT_PREFS, type Prefs, PrefsContext } from "../../lib/prefs";
import type { Lang } from "../../lib/types";
import { PhoneMenu, PhoneMenuTrigger } from "./PhoneMenu";

const route = vi.hoisted(() => ({ path: "/" }));
// The real id is `null` until the owner uploads the video, so every test
// below runs with the control hidden unless it sets an id itself.
const introVideo = vi.hoisted(() => ({ id: null as string | null }));

vi.mock("../../lib/intro-video", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/intro-video")>()),
  get INTRO_VIDEO_YOUTUBE_ID() {
    return introVideo.id;
  },
}));
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

afterEach(() => {
  cleanup();
  introVideo.id = null;
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

function Harness({
  lang,
  onLangChange = () => undefined,
  langToggleDisabled = false,
}: {
  lang: Lang;
  onLangChange?: (lang: Lang) => void;
  langToggleDisabled?: boolean;
}) {
  const [menu] = useState<DrawerController>(createDrawerController);
  return (
    <Providers lang={lang}>
      <header>
        <PhoneMenuTrigger controller={menu} className="bar" />
      </header>
      <nav aria-label="Tab bar">
        <PhoneMenuTrigger controller={menu} className="tab" />
      </nav>
      <PhoneMenu
        controller={menu}
        lang={lang}
        onLangChange={onLangChange}
        langToggleDisabled={langToggleDisabled}
      />
    </Providers>
  );
}

async function openFrom(place: "header" | "Tab bar") {
  const scope =
    place === "header"
      ? within(screen.getByRole("banner"))
      : within(screen.getByRole("navigation", { name: "Tab bar" }));
  const trigger = scope.getByRole("button", { name: "AI;DR" });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = await screen.findByRole("dialog", { name: "AI;DR" });
  return { trigger, dialog };
}

describe("PhoneMenu sheet", () => {
  it("opens from either AI;DR button as a modal bottom sheet and Escape returns focus to the one pressed", async () => {
    render(<Harness lang="en" />);
    const { trigger, dialog } = await openFrom("Tab bar");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("data-side")).toBe("bottom");
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true)
    );

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("closes from its localized close button", async () => {
    render(<Harness lang="vi" />);
    const { dialog } = await openFrom("header");
    fireEvent.click(within(dialog).getByRole("button", { name: "Đóng menu" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("puts the email field first, then Telegram, Facebook, Chrome, MCP and RSS", async () => {
    render(<Harness lang="en" />);
    const { dialog } = await openFrom("header");
    const email = within(dialog).getByRole("textbox", { name: "Email" });
    const rows = within(dialog)
      .getAllByRole("link")
      .map((a) => a.textContent);
    expect(rows.slice(0, 6)).toEqual([
      "Pick the time and frequency",
      "Telegram@aidr_today",
      "FacebookEnglish Page",
      "ChromeAI news on a new tab",
      "MCP serverFor AI assistants",
      "RSSFor feed readers",
    ]);
    const first = within(dialog).getAllByRole("link")[0];
    expect(
      email.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("links Telegram to the channel in the reader's language", async () => {
    render(<Harness lang="vi" />);
    const { dialog } = await openFrom("header");
    const telegram = within(dialog).getByRole("link", { name: /Telegram/ });
    expect(telegram.getAttribute("href")).toBe("https://t.me/aihomnay");
    expect(telegram.textContent).toContain("@aihomnay");
    fireEvent.click(telegram);
    expect(track).toHaveBeenCalledExactlyOnceWith("channel_click", {
      channel: "telegram",
      placement: "phone_menu",
      lang: "vi",
    });
  });

  it("reports Facebook as an English channel click and closes the sheet", async () => {
    render(<Harness lang="vi" />);
    const { dialog } = await openFrom("header");
    fireEvent.click(within(dialog).getByRole("link", { name: /Facebook/ }));
    expect(track).toHaveBeenCalledExactlyOnceWith("channel_click", {
      channel: "facebook",
      placement: "phone_menu",
      lang: "en",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("lists the site pages by English name and reports a page's route id, not its href", async () => {
    render(<Harness lang="vi" />);
    const { dialog } = await openFrom("header");
    const pages = within(dialog).getByRole("navigation", { name: "Trang" });
    expect(
      within(pages)
        .getAllByRole("link")
        .map((a) => a.textContent)
    ).toEqual([
      "About",
      "Release",
      "Data",
      "Privacy",
      "Brand",
      "Contribute",
      "duyet.net",
    ]);
    const about = within(pages).getByRole("link", { name: "About" });
    expect(about.getAttribute("href")).toBe("/about?lang=vi");
    fireEvent.click(within(pages).getByRole("link", { name: "duyet.net" }));
    expect(track).toHaveBeenCalledExactlyOnceWith("nav_click", {
      to: "duyet.net",
      placement: "phone_menu",
    });
  });

  it("holds the language switch, disabled on English-only pages", async () => {
    const onLangChange = vi.fn();
    const { unmount } = render(
      <Harness lang="vi" onLangChange={onLangChange} />
    );
    let { dialog } = await openFrom("header");
    fireEvent.click(within(dialog).getByRole("radio", { name: "EN" }));
    expect(onLangChange).toHaveBeenCalledExactlyOnceWith("en");
    unmount();

    render(<Harness lang="en" langToggleDisabled />);
    ({ dialog } = await openFrom("header"));
    const group = within(dialog).getByRole("radiogroup", { name: "Language" });
    expect(group.getAttribute("aria-disabled")).toBe("true");
    expect(group.getAttribute("title")).toBe("English only");
    fireEvent.click(within(group).getByRole("radio", { name: "VI" }));
    expect(
      within(group)
        .getByRole("radio", { name: "EN" })
        .getAttribute("aria-checked")
    ).toBe("true");
  });

  it("reports sign-in as phone_menu and closes the sheet", async () => {
    render(<Harness lang="en" />);
    const { dialog } = await openFrom("header");
    fireEvent.click(within(dialog).getByRole("link", { name: "Sign in" }));
    expect(track).toHaveBeenCalledExactlyOnceWith("nav_click", {
      to: "/sign-in",
      placement: "phone_menu",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("intro video row", () => {
  // The test asserts the iframe's src; it must not fetch the embed.
  (
    window as unknown as {
      happyDOM: { settings: { disableIframePageLoading: boolean } };
    }
  ).happyDOM.settings.disableIframePageLoading = true;

  it("adds no row while the video id is unset", async () => {
    render(<Harness lang="vi" />);
    const { dialog } = await openFrom("header");
    const pages = within(dialog).getByRole("navigation", { name: "Trang" });
    expect(within(pages).queryByRole("button")).toBeNull();
  });

  it("plays the video over the sheet and keeps the sheet open after closing it", async () => {
    introVideo.id = "abc123XYZ_-";
    render(<Harness lang="vi" />);
    const { dialog } = await openFrom("header");
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Video giới thiệu" })
    );
    const player = await screen.findByRole("dialog", { name: "AI;DR là gì?" });
    expect(player.querySelector("iframe")?.getAttribute("src")).toBe(
      introVideoEmbedUrl("abc123XYZ_-")
    );
    expect(track).toHaveBeenCalledExactlyOnceWith("intro_video_open", {
      placement: "phone_menu",
    });

    fireEvent.keyDown(document.activeElement ?? document.body, {
      key: "Escape",
    });
    await waitFor(() => expect(document.querySelector("iframe")).toBeNull());
    expect(screen.getByRole("dialog", { name: "AI;DR" })).toBe(dialog);
  });
});
