/** @vitest-environment happy-dom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { track } from "../lib/analytics/track";
import { LangContext } from "../lib/lang-context";
import type { FeedResponse, Lang } from "../lib/types";
import { HomeRail } from "./HomeRail";

vi.mock("../lib/analytics/track", () => ({ track: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(track).mockClear();
  vi.unstubAllGlobals();
});

const feed = {
  trending: [{ tag: "Nvidia", count: 7 }],
} as unknown as FeedResponse;

function rail(lang: Lang, showTrending = true) {
  return render(
    <LangContext.Provider value={lang}>
      <HomeRail
        feed={feed}
        lang={lang}
        selectedTag={null}
        onSelectTag={() => {}}
        showTrending={showTrending}
      />
    </LangContext.Provider>
  );
}

describe("HomeRail", () => {
  it("links the Vietnamese Telegram channel in Vietnamese and the English one in English", () => {
    rail("vi");
    expect(
      screen.getByRole("link", { name: /@aihomnay/ }).getAttribute("href")
    ).toBe("https://t.me/aihomnay");
    cleanup();
    rail("en");
    expect(
      screen.getByRole("link", { name: /@aidr_today/ }).getAttribute("href")
    ).toBe("https://t.me/aidr_today");
  });

  it("links the latest weekly edition and the calendar", () => {
    rail("en");
    expect(
      screen.getByRole("link", { name: /Issue \d+/ }).getAttribute("href")
    ).toMatch(/^\/week\/\d{4}-W\d{2}\?lang=en$/);
    expect(
      screen
        .getByRole("link", { name: "Edition calendar" })
        .getAttribute("href")
    ).toBe("/calendar?lang=en");
  });

  it("lists trending tags only when the section is on", () => {
    rail("en");
    expect(screen.getByRole("button", { name: "Nvidia 7" })).toBeTruthy();
    cleanup();
    rail("en", false);
    expect(screen.queryByRole("button", { name: "Nvidia 7" })).toBeNull();
  });
});

describe("RailSubscribe in the rail", () => {
  it("posts the email with the news source and says to check the inbox", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response("{}", { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);
    rail("en");
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.submit(
      screen.getByLabelText("Email").closest("form") as HTMLFormElement
    );
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toMatch(/inbox/)
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/subscribe");
    expect(JSON.parse(String(init.body))).toMatchObject({
      email: "reader@example.com",
      lang: "en",
      source: "news",
    });
    expect(vi.mocked(track).mock.calls.map((c) => c[0])).toEqual([
      "subscribe_submit",
      "subscribe_success",
    ]);
  });

  it("reports a rejected address and lets the reader try again", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("{}", { status: 400 })))
    );
    rail("en");
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "bad" },
    });
    fireEvent.submit(
      screen.getByLabelText("Email").closest("form") as HTMLFormElement
    );
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(track).toHaveBeenCalledWith("subscribe_error", {
      source: "news",
      reason: "invalid",
    });
    expect(screen.getByLabelText("Email")).toBeTruthy();
  });

  it("reports a network failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new Error("offline")))
    );
    rail("en");
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a@b.co" },
    });
    fireEvent.submit(
      screen.getByLabelText("Email").closest("form") as HTMLFormElement
    );
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(track).toHaveBeenCalledWith("subscribe_error", {
      source: "news",
      reason: "network",
    });
  });
});
