/**
 * The intro video control ships before the video exists, so its contract is
 * mostly about what must NOT happen: no dead button while the id is unset,
 * and no request to YouTube until a reader asks for the video.
 *
 * @vitest-environment happy-dom
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { track } from "@aidr/ui/track";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { INTRO_VIDEO_COPY, introVideoEmbedUrl } from "../../lib/intro-video";
import type { Lang } from "../../lib/types";
import { IntroVideoButton } from "./IntroVideo";

const introVideo = vi.hoisted(() => ({ id: null as string | null }));

vi.mock("../../lib/intro-video", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/intro-video")>()),
  get INTRO_VIDEO_YOUTUBE_ID() {
    return introVideo.id;
  },
}));

vi.mock("@aidr/ui/track", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@aidr/ui/track")>()),
  track: vi.fn(),
}));

// The test asserts the iframe's attributes; it must not fetch the embed.
// happy-dom logs each skipped load to stderr; that noise is expected.
(
  window as unknown as {
    happyDOM: { settings: { disableIframePageLoading: boolean } };
  }
).happyDOM.settings.disableIframePageLoading = true;

const here = dirname(fileURLToPath(import.meta.url));
const VIDEO_ID = "abc123XYZ_-";
const EMBED_URL =
  "https://www.youtube-nocookie.com/embed/abc123XYZ_-?autoplay=1&rel=0";

afterEach(() => {
  cleanup();
  introVideo.id = null;
  vi.mocked(track).mockClear();
});

describe("IntroVideoButton", () => {
  it("renders nothing while the video id is unset", () => {
    const { container } = render(<IntroVideoButton lang="en" />);
    expect(container.innerHTML).toBe("");
    expect(screen.queryByRole("button")).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("renders a labelled icon button once the id is set, without loading the player", () => {
    introVideo.id = VIDEO_ID;
    render(<IntroVideoButton lang="en" />);
    const button = screen.getByRole("button", {
      name: "Watch the AI;DR intro video",
    });
    // Icon only: the accessible name comes from aria-label, not visible text.
    expect(button.textContent).toBe("");
    expect(button.querySelector("svg")).not.toBeNull();
    // Nothing is requested from YouTube on page load.
    expect(document.querySelector("iframe")).toBeNull();
    expect(track).not.toHaveBeenCalled();
  });

  it("mounts the nocookie player on open and removes it on close", async () => {
    introVideo.id = VIDEO_ID;
    render(<IntroVideoButton lang="en" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Watch the AI;DR intro video" })
    );

    const dialog = await screen.findByRole("dialog", {
      name: "What is AI;DR?",
    });
    const iframe = dialog.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe(EMBED_URL);
    expect(iframe?.getAttribute("title")).toBe("What is AI;DR?");
    expect(iframe?.getAttribute("allow")).toBe(
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    );
    expect(iframe?.hasAttribute("allowfullscreen")).toBe(true);
    expect(iframe?.getAttribute("referrerpolicy")).toBe(
      "strict-origin-when-cross-origin"
    );
    expect(iframe?.parentElement?.className).toContain("aspect-video");
    expect(track).toHaveBeenCalledExactlyOnceWith("intro_video_open", {
      from: "header",
    });

    // Removing the iframe is what stops playback.
    fireEvent.click(within(dialog).getByRole("button", { name: "Close" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("also removes the player when closed with Escape", async () => {
    introVideo.id = VIDEO_ID;
    render(<IntroVideoButton lang="en" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Watch the AI;DR intro video" })
    );
    await screen.findByRole("dialog");

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(document.querySelector("iframe")).toBeNull());
  });

  it("speaks Vietnamese on the Vietnamese site", async () => {
    introVideo.id = VIDEO_ID;
    render(<IntroVideoButton lang="vi" />);
    fireEvent.click(
      screen.getByRole("button", { name: "Xem video giới thiệu AI;DR" })
    );

    const dialog = await screen.findByRole("dialog", { name: "AI;DR là gì?" });
    expect(dialog.querySelector("iframe")?.getAttribute("title")).toBe(
      "AI;DR là gì?"
    );
    expect(within(dialog).getByRole("button", { name: "Đóng" })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Close" })).toBeNull();
  });
});

describe("intro video copy and embed", () => {
  it("has every string in both languages, with no language reusing the other", () => {
    const langs: Lang[] = ["en", "vi"];
    const keys = Object.keys(INTRO_VIDEO_COPY.en) as Array<
      keyof typeof INTRO_VIDEO_COPY.en
    >;
    expect(keys.sort()).toEqual(["close", "menu", "open", "title"]);
    for (const lang of langs) {
      expect(Object.keys(INTRO_VIDEO_COPY[lang]).sort()).toEqual(keys);
      for (const key of keys) {
        expect(INTRO_VIDEO_COPY[lang][key].trim()).not.toBe("");
      }
    }
    for (const key of keys) {
      expect(INTRO_VIDEO_COPY.vi[key]).not.toBe(INTRO_VIDEO_COPY.en[key]);
    }
  });

  it("embeds from the privacy-enhanced host and autoplays", () => {
    expect(introVideoEmbedUrl(VIDEO_ID)).toBe(EMBED_URL);
  });

  it("is mounted in the wide header row and the phone menu", () => {
    const wide = readFileSync(join(here, "WideRow.tsx"), "utf8");
    const phone = readFileSync(join(here, "PhoneMenu.tsx"), "utf8");
    expect(wide).toContain("<IntroVideoButton lang={lang} />");
    expect(phone).toContain("<IntroVideoButton lang={lang} tile />");
  });
});
