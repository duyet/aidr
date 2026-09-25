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
import { GetAIDRMenu } from "./GetAIDRMenu";
import { PhoneMenu } from "./PhoneMenu";

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
    expect(navigation.className).toContain("grid-cols-1");
    expect(navigation.className).toContain("min-[600px]:grid-cols-2");
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
      "Email Subscription",
      "Submit",
      "Data Analytics",
      "Algorithms",
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
    for (const language of ["en", "vi"]) {
      const button = screen.getByRole("button", { name: language });
      expect(button.className).toContain("min-h-[44px]");
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
});
