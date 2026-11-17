/** @vitest-environment happy-dom */

import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ThumbLightbox } from "../StoryThumb";
import { useDialogLifecycle } from "./use-dialog-lifecycle";

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

    await act(async () => {
      trigger.focus();
      document.dispatchEvent(
        new FocusEvent("focusin", { bubbles: true, cancelable: true })
      );
    });
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
});
