/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { track } from "../../lib/analytics/track";
import { TELEGRAM_EN_URL, TELEGRAM_URL } from "../../lib/site";
import { ChromeChannel } from "./ChromeChannel";
import { FacebookChannel } from "./FacebookChannel";
import { TelegramChannel } from "./TelegramChannel";

vi.mock("../../lib/analytics/track", () => ({ track: vi.fn() }));
// The previews embed third-party frames happy-dom would try to fetch.
vi.mock("./ChannelSplit", () => ({
  ChannelSplit: ({ controls }: { controls: ReactNode }) => controls,
}));

afterEach(() => {
  cleanup();
  vi.mocked(track).mockClear();
});

const linkTo = (href: string) =>
  document.querySelector(`a[href="${href}"]`) as HTMLAnchorElement;

describe("subscribe page channel_click", () => {
  it("tags each Telegram button with its channel's language", () => {
    render(<TelegramChannel lang="en" />);
    fireEvent.click(linkTo(TELEGRAM_URL));
    fireEvent.click(linkTo(TELEGRAM_EN_URL));
    expect(vi.mocked(track).mock.calls).toEqual([
      [
        "channel_click",
        { channel: "telegram", placement: "subscribe_page", lang: "vi" },
      ],
      [
        "channel_click",
        { channel: "telegram", placement: "subscribe_page", lang: "en" },
      ],
    ]);
  });

  it("reports the Chrome Web Store button as the extension channel", () => {
    render(<ChromeChannel lang="en" />);
    fireEvent.click(screen.getByRole("link", { name: /Chrome Web Store/ }));
    expect(track).toHaveBeenCalledExactlyOnceWith("channel_click", {
      channel: "extension",
      placement: "subscribe_page",
    });
  });

  it("reports the Facebook follow button as the English page", () => {
    render(<FacebookChannel lang="en" />);
    fireEvent.click(
      screen.getByRole("link", { name: /Follow AI;DR on Facebook/ })
    );
    expect(track).toHaveBeenCalledExactlyOnceWith("channel_click", {
      channel: "facebook",
      placement: "subscribe_page",
      lang: "en",
    });
  });
});
