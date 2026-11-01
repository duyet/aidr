import { type RefObject, useEffect, useRef } from "react";

export type StoryKeyAction =
  | "next"
  | "prev"
  | "enter"
  | "copy"
  | "original"
  | "sources"
  | "help"
  | "escape";

interface KeyLike {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
  target: EventTarget | null;
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as {
    tagName?: string;
    isContentEditable?: boolean;
  } | null;
  if (!el?.tagName) return false;
  const tag = el.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    el.isContentEditable === true
  );
}

/**
 * The story page shortcut a key press asks for, or null. Shift is allowed
 * (`?` needs it); Cmd, Ctrl and Alt are not, so browser and OS shortcuts
 * pass through. Typing in a field never triggers a shortcut, and an open
 * modal owns the keyboard (`modalOpen`).
 */
export function storyKeyAction(
  e: KeyLike,
  modalOpen: boolean
): StoryKeyAction | null {
  if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return null;
  if (modalOpen || isTyping(e.target)) return null;
  switch (e.key) {
    case "j":
    case "J":
      return "next";
    case "k":
    case "K":
      return "prev";
    case "Enter":
      return "enter";
    case "c":
    case "C":
      return "copy";
    case "o":
    case "O":
      return "original";
    case "s":
    case "S":
      return "sources";
    case "?":
      return "help";
    case "Escape":
      return "escape";
    default:
      return null;
  }
}

/** Blocks j/k walks through: `[data-kb]` elements that are on screen. */
function targets(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-kb]")).filter(
    (el) => el.getClientRects().length > 0
  );
}

function reducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/** Move real focus, so the shared `:focus-visible` ring marks the block and
 * Enter and Tab continue from it. */
export function focusBlock(el: HTMLElement | null): void {
  if (!el) return;
  el.focus({ preventScroll: true });
  el.scrollIntoView({
    block: "center",
    behavior: reducedMotion() ? "auto" : "smooth",
  });
}

export interface StoryKeyHandlers {
  copy: () => void;
  original: () => void;
  sources: () => void;
  help: () => void;
  escape: () => void;
}

/** Page-level shortcuts for the story page; see ShortcutSheet. */
export function useStoryKeys(
  rootRef: RefObject<HTMLElement | null>,
  handlers: StoryKeyHandlers
): void {
  const ref = useRef(handlers);
  ref.current = handlers;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const root = rootRef.current;
      if (!root) return;
      const modalOpen = document.querySelector('[aria-modal="true"]') !== null;
      const action = storyKeyAction(e, modalOpen);
      if (!action) return;
      const list = targets(root);
      const active = document.activeElement as HTMLElement | null;
      const at = active ? list.indexOf(active) : -1;
      switch (action) {
        case "next":
        case "prev": {
          if (list.length === 0) return;
          e.preventDefault();
          const step = action === "next" ? 1 : -1;
          const next =
            at < 0
              ? action === "next"
                ? 0
                : list.length - 1
              : Math.max(0, Math.min(list.length - 1, at + step));
          focusBlock(list[next]);
          return;
        }
        case "enter": {
          // Links and buttons handle Enter themselves; a block opens its
          // own primary control.
          if (at < 0 || active?.matches("a[href], button, summary")) return;
          const primary =
            active?.querySelector<HTMLElement>("[data-kb-primary]");
          if (!primary) return;
          e.preventDefault();
          primary.click();
          return;
        }
        case "copy":
          e.preventDefault();
          ref.current.copy();
          return;
        case "original":
          e.preventDefault();
          ref.current.original();
          return;
        case "sources":
          e.preventDefault();
          ref.current.sources();
          return;
        case "help":
          e.preventDefault();
          ref.current.help();
          return;
        case "escape":
          ref.current.escape();
          return;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [rootRef]);
}
