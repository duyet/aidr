/** @vitest-environment happy-dom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { track } from "../lib/analytics/track";
import { DEFAULT_WEEKLY_DAY } from "../lib/mail-frequency";
import { EmailSubscribeForm } from "./EmailSubscribeForm";

vi.mock("../lib/analytics/track", () => ({ track: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.mocked(track).mockClear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function submitWith(fetchImpl: () => Promise<Response>) {
  vi.stubGlobal("fetch", vi.fn(fetchImpl));
  render(
    <EmailSubscribeForm
      lang="en"
      source="news"
      prefs={{
        lang: "en",
        size: 5,
        format: "design",
        font: "sans",
        frequency: "daily",
        weeklyDay: DEFAULT_WEEKLY_DAY,
      }}
      onPrefsChange={() => {}}
    />
  );
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
    target: { value: "reader@example.com" },
  });
  fireEvent.submit(
    screen
      .getByPlaceholderText("you@example.com")
      .closest("form") as HTMLFormElement
  );
  await waitFor(() => expect(track).toHaveBeenCalledTimes(2));
  return vi.mocked(track).mock.calls[1];
}

describe("subscribe_error reason", () => {
  it.each([
    [400, "invalid"],
    [429, "rate_limited"],
    [500, "server"],
  ] as const)("maps HTTP %i to %s", async (status, reason) => {
    const call = await submitWith(async () =>
      Response.json({ error: "x" }, { status })
    );
    expect(call).toEqual(["subscribe_error", { source: "news", reason }]);
  });

  it("reports a failed request as a network error", async () => {
    const call = await submitWith(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(call).toEqual([
      "subscribe_error",
      { source: "news", reason: "network" },
    ]);
  });

  it("sends the submit without a channel param", async () => {
    await submitWith(async () => Response.json({ ok: true }));
    expect(vi.mocked(track).mock.calls[0]).toEqual([
      "subscribe_submit",
      { source: "news" },
    ]);
  });
});

describe("hydration", () => {
  const form = (
    <EmailSubscribeForm
      lang="vi"
      source="news"
      prefs={{
        lang: "vi",
        size: 5,
        format: "design",
        font: "sans",
        frequency: "daily",
        weeklyDay: DEFAULT_WEEKLY_DAY,
      }}
      onPrefsChange={() => {}}
    />
  );

  function stubTimezone(timeZone: string) {
    vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
      resolvedOptions: () => ({ timeZone }),
    } as Intl.DateTimeFormat);
  }

  it("hydrates a server render made in another timezone without a mismatch", async () => {
    stubTimezone("UTC");
    const container = document.createElement("div");
    container.innerHTML = renderToString(form);
    document.body.appendChild(container);

    stubTimezone("Asia/Saigon");
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    let root!: ReturnType<typeof hydrateRoot>;
    await act(async () => {
      root = hydrateRoot(container, form);
    });

    try {
      expect(errors).not.toHaveBeenCalled();
      expect(container.textContent).toContain("(Asia/Saigon)");
      expect(container.textContent).not.toContain("(UTC)");
    } finally {
      root.unmount();
      container.remove();
    }
  });

  it("posts the browser timezone", async () => {
    stubTimezone("Asia/Saigon");
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    render(form);
    fireEvent.change(screen.getByPlaceholderText("you@example.com"), {
      target: { value: "reader@example.com" },
    });
    fireEvent.submit(
      screen
        .getByPlaceholderText("you@example.com")
        .closest("form") as HTMLFormElement
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(init.body as string).timezone).toBe("Asia/Saigon");
  });
});
