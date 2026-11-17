import { useEffect, useRef } from "react";

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.matches("input, textarea, select, [contenteditable]"))
  );
}

/**
 * J and K step to the next and previous story while the drawer is open.
 * Typing, a modifier and any layer above the drawer (the image zoom, the
 * sign-in prompt) keep their own keys.
 */
export function useNeighborKeys(step: (direction: 1 | -1) => void): void {
  const stepRef = useRef(step);
  stepRef.current = step;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "j" && event.key !== "k") return;
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        event.shiftKey ||
        isEditable(event.target)
      ) {
        return;
      }
      if (document.querySelectorAll('[aria-modal="true"]').length > 1) return;
      event.preventDefault();
      stepRef.current(event.key === "j" ? 1 : -1);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}
