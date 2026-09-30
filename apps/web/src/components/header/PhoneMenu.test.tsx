/**
 * Radix lifecycle coverage runs in a DOM test environment. It does not
 * evaluate Tailwind media queries or layout, so real 600px/pixel assertions
 * remain a browser check when a Chrome/Playwright runtime is available.
 * happy-dom is dev-only; it avoids the jsdom/data-urls test dependency chain.
 * No static HTML snapshot is treated as computed-layout evidence.
 *
 * @vitest-environment happy-dom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { introVideoEmbedUrl } from "../../lib/intro-video";
import { GetAIDRMenu } from "./GetAIDRMenu";
import { PhoneMenu } from "./PhoneMenu";

// The real id is `null` until the owner uploads the video, so every test
// below runs with the control hidden unless it sets an id itself.
const introVideo = vi.hoisted(() => ({ id: null as string | null }));

vi.mock("../../lib/intro-video", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/intro-video")>()),
  get INTRO_VIDEO_YOUTUBE_ID() {
    return introVideo.id;
  },
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
        {
          ...props,
          href: `${url.pathname}${url.search}${url.hash}`,
        },
        children
      );
    },
    useRouterState: ({
      select,
    }: {
      select: (state: { location: { pathname: string } }) => unknown;
    }) => select({ location: { pathname: "/" } }),
  };
});

class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }),
});

Object.defineProperty(window, "ResizeObserver", {
  writable: true,
  value: TestResizeObserver,
});

beforeEach(() => {
  document.body.style.overflow = "";
});

afterEach(() => {
  cleanup();
  introVideo.id = null;
});

function renderPhoneMenu() {
  return render(
    <>
      <button type="button" data-testid="outside-control">
        Outside
      </button>
      <PhoneMenu
        lang="vi"
        onLangChange={() => undefined}
        langToggleDisabled={false}
      />
      <GetAIDRMenu />
    </>
  );
}

function focusableElements(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  );
}

describe("PhoneMenu modal behavior", () => {
  it("opens with close focus, locks the body, and makes background content inert", async () => {
    renderPhoneMenu();
    const trigger = screen.getByRole("button", { name: "Open menu" });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = await screen.findByRole("dialog");
    const close = screen.getByRole("button", { name: "Close menu" });
    const outside = screen.getByTestId("outside-control");

    await waitFor(() => expect(document.activeElement).toBe(close));
    await waitFor(() => expect(document.body.dataset.scrollLocked).toBe("1"));
    expect(document.body.style.pointerEvents).toBe("none");
    expect(outside.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-describedby")).toBeNull();
    expect(dialog.className).toContain("inset-3");
    expect(dialog.className).toContain("min-[600px]:inset-4");
    const navigation = within(dialog).getByRole("navigation", {
      name: "Mobile navigation",
    });
    // Two columns of large tiles at every phone width, not one column of rows:
    // nine full-width rows buried half the menu behind a scroll gesture.
    expect(navigation.className).toContain("grid-cols-2");
    expect(navigation.className).not.toContain("grid-cols-1");
    const newsLink = within(navigation).getByRole("link", { name: "News" });
    expect(newsLink.getAttribute("aria-current")).toBe("page");
    expect(newsLink.getAttribute("href")).toBe("/?lang=en");
    expect(
      within(dialog).getByRole("link", { name: "Sign in" }).getAttribute("href")
    ).toBe("/sign-in?lang=en");
  });

  it("wraps Tab and Shift+Tab inside the dialog", async () => {
    renderPhoneMenu();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = await screen.findByRole("dialog");
    const focusable = focusableElements(dialog);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    expect(first).toBeTruthy();
    expect(last).toBeTruthy();

    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    await waitFor(() => expect(document.activeElement).toBe(first));

    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    await waitFor(() => expect(document.activeElement).toBe(last));
  });

  it("closes from the close button and returns focus to the trigger", async () => {
    renderPhoneMenu();
    const trigger = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(trigger);
    await screen.findByRole("dialog");
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("closes when footer sign-in navigation is activated", async () => {
    renderPhoneMenu();
    const trigger = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(trigger);
    await screen.findByRole("dialog");

    fireEvent.click(screen.getByRole("link", { name: "Sign in" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on Escape, restores the trigger, and releases the body lock", async () => {
    renderPhoneMenu();
    const trigger = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(trigger);
    await screen.findByRole("dialog");

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("");
    expect(document.body.dataset.scrollLocked).toBeUndefined();
    expect(trigger.closest('[aria-hidden="true"]')).toBeNull();
  });

  it("closes from the backdrop", async () => {
    renderPhoneMenu();
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    await screen.findByRole("dialog");
    fireEvent.pointerDown(screen.getByTestId("mobile-menu-backdrop"));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("returns focus to a currently visible trigger after a breakpoint change", async () => {
    renderPhoneMenu();
    const trigger = screen.getByRole("button", { name: "Open menu" });
    fireEvent.click(trigger);
    await screen.findByRole("dialog");

    trigger.style.display = "none";
    const fallback = screen.getByRole("button", {
      name: "Get AI;DR menu",
      hidden: true,
    });
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(document.activeElement).toBe(fallback));
  });
});

describe("mobile action sizing", () => {
  it("renders nav links as large icon-over-label tiles", async () => {
    render(
      <PhoneMenu
        lang="vi"
        onLangChange={() => undefined}
        langToggleDisabled={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = await screen.findByRole("dialog");
    const newsLink = within(dialog).getByRole("link", { name: "News" });

    // A tile, not a list row: column layout with the icon above the label, and
    // a target well past the 44px floor.
    expect(newsLink.className).toContain("flex-col");
    expect(newsLink.className).toContain("min-h-24");
    expect(newsLink.className).toContain("min-[600px]:min-h-28");
    expect(newsLink.className).toContain("items-center");
  });

  it("shows every site link as a tile, not a truncated list", async () => {
    render(
      <PhoneMenu
        lang="vi"
        onLangChange={() => undefined}
        langToggleDisabled={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = await screen.findByRole("dialog");
    const navigation = within(dialog).getByRole("navigation", {
      name: "Mobile navigation",
    });
    // Mirrors SITE_LINKS: every entry still reachable, none dropped.
    expect(
      within(navigation)
        .getAllByRole("link")
        .map((link) => link.textContent)
    ).toEqual([
      "News",
      "About",
      "Brand",
      "MCP",
      "Get AI;DR",
      "Telegram",
      "Data",
      "Submit",
      "duyet.net",
    ]);
  });

  it("splits nav and settings side by side in landscape", async () => {
    // A 375px-tall phone stacked leaves the grid ~1 row tall. From the 600px
    // breakpoint the language/auth column moves beside the nav instead.
    render(
      <PhoneMenu
        lang="vi"
        onLangChange={() => undefined}
        langToggleDisabled={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = await screen.findByRole("dialog");
    const navigation = within(dialog).getByRole("navigation", {
      name: "Mobile navigation",
    });
    const body = navigation.parentElement;
    const footer = navigation.nextElementSibling;

    expect(body?.className).toContain("min-[600px]:flex-row");
    expect(footer?.className).toContain("min-[600px]:border-l");
    expect(footer?.className).toContain("min-[600px]:border-t-0");
  });

  it("renders the language switch as a full-width segmented control", async () => {
    render(
      <PhoneMenu
        lang="vi"
        onLangChange={() => undefined}
        langToggleDisabled={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = await screen.findByRole("dialog");
    const vi = within(dialog).getByRole("button", { name: "vi" });
    const container = vi.parentElement;

    // Labelled and edge-to-edge rather than a small pill tucked in a corner.
    expect(container?.className).toContain("grid-cols-2");
    expect(container?.className).toContain("w-full");
    const label = within(dialog).getByText("Ngôn ngữ");
    const navigation = within(dialog).getByRole("navigation", {
      name: "Mobile navigation",
    });
    expect(
      label.compareDocumentPosition(navigation) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it("keeps the disabled state on the segmented control, not just the buttons", () => {
    // Regression risk from swapping the container class: a custom container
    // must not drop the `cursor-not-allowed` / opacity the pill always had.
    render(
      <PhoneMenu lang="en" onLangChange={() => undefined} langToggleDisabled />
    );
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = screen.getByRole("dialog");
    const en = within(dialog).getByRole("button", { name: "en" });
    expect(en.parentElement?.className).toContain("cursor-not-allowed");
    expect(en.parentElement?.className).toContain("opacity-50");
  });

  it("renders compact dropdown items and language controls with 44px classes", async () => {
    render(
      <>
        <GetAIDRMenu compact />
        <PhoneMenu
          lang="vi"
          onLangChange={() => undefined}
          langToggleDisabled={false}
        />
      </>
    );

    const getAIDRTrigger = screen.getByRole("button", {
      name: "Get AI;DR menu",
    });
    fireEvent.pointerDown(getAIDRTrigger, { button: 0, pointerType: "mouse" });
    fireEvent.click(getAIDRTrigger);
    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "Chrome Extension",
      "Telegram Channel (Vietnamese)",
      "Telegram Channel (English)",
      "Email Subscription",
      "Submit",
      "Data Analytics",
      "Algorithms",
      "About",
    ]);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.className).toContain("h-11");
      expect(item.className).toContain("min-h-11");
      expect(item.className).toContain("min-w-[44px]");
    }

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    await screen.findByRole("dialog");
    // 56px halves of a full-width segmented control: a deliberately larger
    // target than the 44px floor the dropdown items use.
    for (const language of ["en", "vi"]) {
      const button = screen.getByRole("button", { name: language });
      expect(button.className).toContain("min-h-14");
      expect(button.className).toContain("min-w-[44px]");
    }
  });

  it("leaves the desktop dropdown on its existing compact sizing", async () => {
    render(<GetAIDRMenu />);
    const trigger = screen.getByRole("button", { name: "Get AI;DR menu" });
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
    fireEvent.click(trigger);
    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    for (const item of items) {
      expect(item.className).not.toContain("min-w-[44px]");
      expect(item.className).not.toContain("min-h-11");
    }
  });
  // An item that opens another site should say so: without the marker the
  // Telegram rows look identical to the internal routes, and the reader
  // gets a new tab with no warning.
  it("marks the items that leave the site with a trailing external icon", async () => {
    render(<GetAIDRMenu />);
    const trigger = screen.getByRole("button", { name: "Get AI;DR menu" });
    fireEvent.pointerDown(trigger, { button: 0, pointerType: "mouse" });
    fireEvent.click(trigger);
    const menu = await screen.findByRole("menu");

    const external = new Set([
      "Telegram Channel (Vietnamese)",
      "Telegram Channel (English)",
    ]);
    for (const item of within(menu).getAllByRole("menuitem")) {
      const label = item.textContent ?? "";
      const icons = item.querySelectorAll("svg");
      expect(icons.length).toBe(external.has(label) ? 2 : 1);
      if (!external.has(label)) continue;
      // Trailing and smaller than the leading icon, and hidden from
      // assistive tech: `target="_blank"` plus the label already say it.
      const marker = icons[1];
      expect(marker.getAttribute("aria-hidden")).toBe("true");
      expect(marker.getAttribute("class")).toContain("ml-auto");
      expect(marker.getAttribute("class")).toContain("!size-3");
    }
  });
});

describe("intro video tile", () => {
  // The test asserts the iframe's src; it must not fetch the embed.
  (
    window as unknown as {
      happyDOM: { settings: { disableIframePageLoading: boolean } };
    }
  ).happyDOM.settings.disableIframePageLoading = true;

  // The compact header row has no room for another 44px control, so phones
  // reach the video from the menu, like every other secondary action.
  async function openMenuNavigation() {
    render(
      <PhoneMenu
        lang="vi"
        onLangChange={() => undefined}
        langToggleDisabled={false}
      />
    );
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }));
    const dialog = await screen.findByRole("dialog");
    return within(dialog).getByRole("navigation", {
      name: "Mobile navigation",
    });
  }

  it("adds no tile while the video id is unset", async () => {
    const navigation = await openMenuNavigation();
    expect(within(navigation).queryByRole("button")).toBeNull();
  });

  it("plays the video over the menu and keeps the menu open after closing it", async () => {
    introVideo.id = "abc123XYZ_-";
    const navigation = await openMenuNavigation();
    const tile = within(navigation).getByRole("button", {
      name: "Video giới thiệu",
    });
    expect(tile.className).toContain("min-h-24");

    fireEvent.click(tile);
    const player = await screen.findByRole("dialog", { name: "AI;DR là gì?" });
    expect(player.querySelector("iframe")?.getAttribute("src")).toBe(
      introVideoEmbedUrl("abc123XYZ_-")
    );

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.querySelector("iframe")).toBeNull());
    expect(screen.getByRole("navigation", { name: "Mobile navigation" })).toBe(
      navigation
    );
  });
});
