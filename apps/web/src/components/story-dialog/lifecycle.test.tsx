/** @vitest-environment jsdom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_PREFS, PrefsContext } from "../../lib/prefs";
import type { FeedItem } from "../../lib/types";
import { StoryDialog } from "../StoryDialog";
import { ThumbLightbox } from "../StoryThumb";
import { useDialogLifecycle } from "./use-dialog-lifecycle";

vi.mock("../SuggestTranslation", () => ({
  SuggestionBadge: () => null,
  SuggestTranslation: () => null,
}));

const actEnvironment = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT: boolean;
};
actEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | undefined;
let mount: HTMLDivElement;
let trigger: HTMLButtonElement;

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing test element: ${selector}`);
  return element;
}

function OuterModal({
  onClose,
  onOpenLightbox,
}: {
  onClose: () => void;
  onOpenLightbox: () => void;
}) {
  const close = () => onClose();
  const panelRef = useDialogLifecycle(close);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Outer"
      tabIndex={-1}
      data-testid="outer-dialog"
    >
      <button type="button" data-testid="outer-open" onClick={onOpenLightbox}>
        Open image
      </button>
      <button type="button" data-testid="outer-last" onClick={close}>
        Close story
      </button>
    </div>
  );
}

function OuterHarness({ onClose }: { onClose: () => void }) {
  const [visible, setVisible] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const close = () => {
    onClose();
    setVisible(false);
  };

  return visible ? (
    <>
      <OuterModal
        onClose={close}
        onOpenLightbox={() => setLightboxOpen(true)}
      />
      {lightboxOpen && (
        <ThumbLightbox
          src="https://example.com/story.jpg"
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  ) : null;
}

async function renderHarness(onClose: () => void) {
  await act(async () => {
    root?.render(<OuterHarness onClose={onClose} />);
  });
}

function storyItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    id: "story-12345678",
    url: "https://example.com/story",
    title: "A story title",
    title_vi: null,
    summary: "A long English summary. ".repeat(12),
    summary_vi: null,
    category: null,
    published_at: 1_700_000_000,
    points: 1,
    comments: 0,
    rank_score: 8.4,
    source_id: "example",
    tags: ["testing"],
    sources: [],
    llm_tokens: 0,
    image_url: null,
    ...overrides,
  };
}

function StoryDialogHarness({
  bilingualDialog,
  onClose,
}: {
  bilingualDialog: boolean;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(true);
  return open ? (
    <PrefsContext.Provider
      value={{
        prefs: { ...DEFAULT_PREFS, bilingualDialog },
        setPrefs: vi.fn(),
      }}
    >
      <StoryDialog
        idPrefix="story-12345678"
        lang="en"
        onClose={() => {
          onClose();
          setOpen(false);
        }}
      />
    </PrefsContext.Provider>
  ) : null;
}

async function renderStoryDialog(
  item: FeedItem,
  bilingualDialog = true,
  onClose = vi.fn()
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => item,
    }))
  );
  await act(async () => {
    root?.render(
      <StoryDialogHarness bilingualDialog={bilingualDialog} onClose={onClose} />
    );
  });
  await act(async () => {
    await Promise.resolve();
  });
}

async function pressEscape() {
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Escape",
      })
    );
  });
}

beforeEach(() => {
  document.body.innerHTML = "";
  document.body.style.overflow = "auto";
  trigger = document.createElement("button");
  trigger.textContent = "Open story";
  document.body.appendChild(trigger);
  trigger.focus();
  mount = document.createElement("div");
  document.body.appendChild(mount);
  root = createRoot(mount);
});

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
    root = undefined;
  }
  document.body.innerHTML = "";
  document.body.style.overflow = "";
  vi.unstubAllGlobals();
});

describe("modal lifecycle", () => {
  it("contains focus, inerts the background, and restores the trigger", async () => {
    await renderHarness(vi.fn());
    const panel = required<HTMLElement>("[data-testid=outer-dialog]");
    const first = required<HTMLButtonElement>("[data-testid=outer-open]");
    const last = required<HTMLButtonElement>("[data-testid=outer-last]");

    expect(document.activeElement).toBe(panel);
    expect(trigger.hasAttribute("inert")).toBe(true);
    expect(trigger.getAttribute("aria-hidden")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");

    trigger.focus();
    expect(document.activeElement).toBe(first);

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Tab",
      })
    );
    expect(document.activeElement).toBe(first);

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Tab",
        shiftKey: true,
      })
    );
    expect(document.activeElement).toBe(last);

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        key: "Tab",
      })
    );
    expect(document.activeElement).toBe(first);

    await act(async () => {
      root?.unmount();
    });
    root = undefined;

    expect(trigger.hasAttribute("inert")).toBe(false);
    expect(trigger.hasAttribute("aria-hidden")).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe("auto");
  });

  it("keeps the story shell scrollable and uses single width without Vietnamese", async () => {
    await renderStoryDialog(storyItem());
    const panel = required<HTMLElement>('[role="dialog"]');
    const header = required<HTMLElement>(".sticky");
    const body = required<HTMLElement>(".overflow-y-auto");

    expect(panel.className).toContain("story-dialog-panel");
    expect(panel.className).toContain("xl:max-w-6xl");
    expect(panel.className).not.toContain("2xl:max-w-[88rem]");
    expect(header.parentElement).toBe(panel);
    expect(body.contains(header)).toBe(false);
    body.scrollTop = 240;
    expect(body.scrollTop).toBe(240);
    expect(
      required<HTMLButtonElement>(".story-dialog-overlay > button").tabIndex
    ).toBe(-1);
  });

  it("keeps the story backdrop clickable while the page is inert", async () => {
    const onClose = vi.fn();
    await renderStoryDialog(storyItem(), true, onClose);
    const backdrop = required<HTMLButtonElement>(
      ".story-dialog-overlay > button"
    );

    expect(backdrop.hasAttribute("inert")).toBe(false);
    expect(backdrop.hasAttribute("aria-hidden")).toBe(false);
    await act(async () => {
      backdrop.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.body.style.overflow).toBe("auto");
  });

  it("enables the wider bilingual width only after Vietnamese content loads", async () => {
    await renderStoryDialog(
      storyItem({ title_vi: "Tiêu đề tiếng Việt", summary_vi: "Tóm tắt" })
    );
    const panel = required<HTMLElement>('[role="dialog"]');
    expect(panel.className).toContain("2xl:max-w-[88rem]");
  });

  it("closes only a nested StoryDialog lightbox on Escape", async () => {
    const onClose = vi.fn();
    await renderStoryDialog(
      storyItem({ image_url: "https://example.com/story.jpg" }),
      true,
      onClose
    );
    const zoom = required<HTMLButtonElement>('[aria-label="Zoom image"]');
    zoom.focus();
    await act(async () => {
      zoom.click();
    });

    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(2);
    expect(mount.hasAttribute("inert")).toBe(true);
    const backdrops = document.querySelectorAll<HTMLButtonElement>(
      ".story-dialog-overlay > button"
    );
    expect(backdrops).toHaveLength(2);
    expect(backdrops[1].hasAttribute("inert")).toBe(false);
    const lightbox = required<HTMLElement>(
      '[role="dialog"][aria-label="Image"]'
    );
    const overlay = lightbox.parentElement;
    if (!overlay) throw new Error("Missing lightbox overlay");
    const unexpectedTextNodes = Array.from(overlay.childNodes)
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent?.trim())
      .filter((text): text is string => Boolean(text));
    expect(unexpectedTextNodes).toEqual([]);
    expect(document.activeElement).toBe(lightbox);
    expect(document.body.style.overflow).toBe("hidden");

    await pressEscape();
    expect(
      document.querySelector('[role="dialog"][aria-label="Image"]')
    ).toBeNull();
    expect(
      document.querySelector('[role="dialog"][aria-label="A story title"]')
    ).not.toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe("hidden");

    await pressEscape();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.body.style.overflow).toBe("auto");
    expect(document.activeElement).toBe(trigger);
  });
});
