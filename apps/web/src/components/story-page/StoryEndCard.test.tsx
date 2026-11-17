/** @vitest-environment happy-dom */

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { track } from "../../lib/analytics/track";
import { LangContext } from "../../lib/lang-context";
import { DEFAULT_PREFS, type Prefs, PrefsContext } from "../../lib/prefs";
import type { Lang } from "../../lib/types";
import { StoryEndCard } from "./StoryEndCard";

vi.mock("../../lib/analytics/track", () => ({ track: vi.fn() }));

function setup(lang: Lang, prefs: Partial<Prefs> = {}) {
  return render(
    <LangContext.Provider value={lang}>
      <PrefsContext.Provider
        value={{ prefs: { ...DEFAULT_PREFS, ...prefs }, setPrefs: vi.fn() }}
      >
        <StoryEndCard lang={lang} />
      </PrefsContext.Provider>
    </LangContext.Provider>
  );
}

async function subscribe(email: string) {
  fireEvent.input(screen.getByLabelText("Email"), {
    target: { value: email },
  });
  await act(async () => {
    fireEvent.submit(
      screen
        .getByRole("button", { name: /Subscribe|Đăng ký/ })
        .closest("form") as HTMLFormElement
    );
  });
}

beforeEach(() => {
  vi.mocked(track).mockClear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("StoryEndCard", () => {
  it("links the Telegram channel of the page language", () => {
    setup("vi");
    expect(
      screen
        .getByRole("link", { name: "Telegram @aihomnay" })
        .getAttribute("href")
    ).toBe("https://t.me/aihomnay");
    cleanup();
    setup("en");
    expect(
      screen
        .getByRole("link", { name: "Telegram @aidr_today" })
        .getAttribute("href")
    ).toBe("https://t.me/aidr_today");
  });

  it("follows the leading language in bilingual mode", () => {
    setup("vi", { bilingual: true, bilingualFirst: "en" });
    expect(
      screen.getByRole("link", { name: /Telegram/ }).getAttribute("href")
    ).toBe("https://t.me/aidr_today");
  });

  it("posts the email with the leading language and the news source, then asks to confirm", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    setup("vi");
    await subscribe("reader@example.com");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/subscribe");
    expect(JSON.parse(init.body as string)).toMatchObject({
      email: "reader@example.com",
      lang: "vi",
      source: "news",
    });
    expect(track).toHaveBeenCalledWith("subscribe_submit", { source: "news" });
    expect(track).toHaveBeenCalledWith("subscribe_success", { source: "news" });
    expect(screen.getByRole("status").textContent).toContain("link xác nhận");
    expect(screen.queryByLabelText("Email")).toBeNull();
  });

  it.each([
    [400, "invalid"],
    [429, "rate_limited"],
    [500, "server"],
  ])("reports a %i answer as %s and keeps the form", async (status, reason) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status }))
    );
    setup("en");
    await subscribe("reader@example.com");
    expect(track).toHaveBeenCalledWith("subscribe_error", {
      source: "news",
      reason,
    });
    expect(screen.getByRole("alert").textContent).toContain("try again");
    expect(screen.getByLabelText("Email")).toBeTruthy();
  });

  it("reports a dropped connection as a network error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      })
    );
    setup("en");
    await subscribe("reader@example.com");
    expect(track).toHaveBeenCalledWith("subscribe_error", {
      source: "news",
      reason: "network",
    });
  });
});
