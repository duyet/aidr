import { useEffect } from "react";

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

/**
 * Home feed keyboard navigation: j and k move focus between the AI;DR items
 * and the story rows. Enter opens (the row and link handlers already do that)
 * and Esc on an open row closes it (StoryRow). Keys typed into a field, with
 * a modifier, or while a modal dialog is open are left alone, so the search
 * box, the prefs panel and the story dialog keep their own handling.
 */
export function useFeedKeyNav(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "j" && e.key !== "k") return;
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.shiftKey || e.isComposing) return;
      if (isEditable(e.target)) return;
      if (document.querySelector('[aria-modal="true"]')) return;
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
