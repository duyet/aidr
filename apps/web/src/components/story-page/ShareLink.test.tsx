/** @vitest-environment happy-dom */

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareLink } from "./ShareLink";

const item = { id: "abcdef12deadbeef", title: "A story", title_vi: null };

function setup(onFallback = vi.fn()) {
  render(
    <ShareLink item={item} lang="en" title="A story" onFallback={onFallback} />
  );
  return onFallback;
}

async function press() {
  await act(async () => {
    screen.getByRole("button", { name: "Share" }).click();
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "share");
});

describe("ShareLink", () => {
  it("hands the story link to the device share sheet when there is one", async () => {
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, "share", {
      value: share,
      configurable: true,
    });
    setup();
    await press();
    expect(share).toHaveBeenCalledTimes(1);
    const [data] = share.mock.calls[0] as unknown as [ShareData];
    expect(data.title).toBe("A story");
    expect(data.url).toContain("/abcdef12");
  });

  it("copies the link otherwise and says so", async () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    setup();
    await press();
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("/abcdef12")
    );
    expect(screen.getByRole("button", { name: "Link copied" })).toBeTruthy();
  });

  it("opens the copy sheet when the clipboard is refused", async () => {
    const writeText = vi.fn(async () => {
      throw new Error("denied");
    });
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const onFallback = setup();
    await press();
    expect(onFallback).toHaveBeenCalledTimes(1);
  });

  it("treats cancelling the share sheet as a choice, not a failure", async () => {
    const share = vi.fn(async () => {
      throw new DOMException("cancelled", "AbortError");
    });
    Object.defineProperty(navigator, "share", {
      value: share,
      configurable: true,
    });
    const onFallback = setup();
    await press();
    expect(onFallback).not.toHaveBeenCalled();
  });

  it("falls back to the copy sheet when sharing fails for another reason", async () => {
    const share = vi.fn(async () => {
      throw new DOMException("no", "NotAllowedError");
    });
    Object.defineProperty(navigator, "share", {
      value: share,
      configurable: true,
    });
    const onFallback = setup();
    await press();
    expect(onFallback).toHaveBeenCalledTimes(1);
  });
});
