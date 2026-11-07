import { useEffect, useRef } from "react";

/** Elements j/k step through: AI;DR items and story rows, in page order. */
export const FEED_KEYNAV_SELECTOR = "[data-keynav]";

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.matches("input, textarea, select, [contenteditable]")
  );
}

function visibleTargets(): HTMLElement[] {
  return Array.from(
    document.querySelectorAll<HTMLElement>(FEED_KEYNAV_SELECTOR)
  ).filter((el) => el.getClientRects().length > 0 && !el.closest("[hidden]"));
}

/**
 * Pick the element j (+1) or k (-1) moves to. From a focused target it steps
 * to the neighbour; with nothing focused it starts at the first target in
 * view (j) or the last one in view (k), so the first press never jumps the
 * page back to the top.
 */
export function nextKeyNavTarget(
  targets: HTMLElement[],
  active: Element | null,
  step: 1 | -1,
  viewportHeight: number
): HTMLElement | undefined {
  const current = active
    ? targets.findIndex((el) => el === active || el.contains(active))
    : -1;
  if (current !== -1) return targets[current + step];
  if (step === 1) {
    return (
      targets.find((el) => el.getBoundingClientRect().top >= 0) ?? targets[0]
    );
  }
  return (
    targets.findLast(
      (el) => el.getBoundingClientRect().bottom <= viewportHeight
    ) ?? targets[targets.length - 1]
  );
}

export interface FeedKeyHandlers {
  /** `?`: show or hide the shortcut list (ShortcutSheet). */
  onHelp?: () => void;
  /** Esc anywhere on the page, e.g. to hide that list. */
  onEscape?: () => void;
}

/**
 * Home feed keyboard navigation: j and k move focus between the AI;DR items
 * and the story rows. Enter opens (the row and link handlers already do that)
 * and Esc on an open row closes it (StoryRow). `?` toggles the shortcut list.
 * Keys typed into a field, with a modifier, or while a modal dialog is open
 * are left alone, so the search box, the prefs panel and the story dialog
 * keep their own handling.
 */
export function useFeedKeyNav(handlers: FeedKeyHandlers = {}): void {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.isComposing || isEditable(e.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      // `?` is Shift+/ on most layouts, so it is matched before the shift
      // check below that keeps J and K plain.
      if (e.key === "?") {
        if (!ref.current.onHelp) return;
        e.preventDefault();
        ref.current.onHelp();
        return;
      }
      if (e.key === "Escape") {
        ref.current.onEscape?.();
        return;
      }
      if (e.key !== "j" && e.key !== "k") return;
      if (e.shiftKey) return;
      const next = nextKeyNavTarget(
        visibleTargets(),
        document.activeElement,
        e.key === "j" ? 1 : -1,
        window.innerHeight
      );
      if (!next) return;
      e.preventDefault();
      next.focus({ preventScroll: true });
      next.scrollIntoView({ block: "nearest" });
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
