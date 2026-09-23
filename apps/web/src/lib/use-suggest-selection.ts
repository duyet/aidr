import { type RefObject, useEffect, useState } from "react";
import { detectSuggestField, type SuggestField } from "./selection-field";

export interface SelectionButtonState {
  field: SuggestField;
  text: string;
  top: number;
  left: number;
}

export interface SuggestSelection {
  selectionButton: SelectionButtonState | null;
  pendingSuggestion: { field: SuggestField; text: string } | null;
  /** Moves the current selection into the suggestion form. */
  acceptSelection: () => void;
  clearPending: () => void;
}

/**
 * Medium-style "select text → suggest a correction" for the Vietnamese
 * translation. Scoped to the given container, listeners attached
 * client-side only (SSR-safe).
 */
export function useSuggestSelection(
  containerRef: RefObject<HTMLDivElement | null>,
  enabled: boolean
): SuggestSelection {
  const [selectionButton, setSelectionButton] =
    useState<SelectionButtonState | null>(null);
  const [pendingSuggestion, setPendingSuggestion] = useState<{
    field: SuggestField;
    text: string;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    const BUTTON_HEIGHT = 32;
    const GAP = 6;

    const onMouseUp = (e: MouseEvent) => {
      // The floating "suggest" button lives inside `container`, so a
      // mouseup on it bubbles here too — and since this listener is a
      // native addEventListener on `container`, it fires *before* React's
      // root-delegated click handler ever runs. Recomputing/clearing
      // selectionButton here would re-render (and can unmount) the button
      // before the click event reaches it, silently swallowing the click.
      if (
        e.target instanceof Node &&
        (e.target as HTMLElement).closest?.("[data-selection-button]")
      ) {
        return;
      }
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        setSelectionButton(null);
        return;
      }
      const text = sel.toString().trim();
      if (!text) {
        setSelectionButton(null);
        return;
      }
      const range = sel.getRangeAt(0);
      if (!container.contains(range.commonAncestorContainer)) {
        setSelectionButton(null);
        return;
      }
      const field = detectSuggestField(range.commonAncestorContainer);
      if (!field) {
        setSelectionButton(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      const aboveTop = rect.top - BUTTON_HEIGHT - GAP;
      const flip = aboveTop < 0;
      setSelectionButton({
        field,
        text,
        top: flip ? rect.bottom + GAP : aboveTop,
        left: rect.left,
      });
    };

    const hide = () => setSelectionButton(null);
    const onSelectionChange = () => {
      if (window.getSelection()?.isCollapsed) hide();
    };
    const onDocMouseDown = (e: MouseEvent) => {
      if (!container.contains(e.target as Node)) hide();
    };

    container.addEventListener("mouseup", onMouseUp);
    window.addEventListener("scroll", hide, true);
    document.addEventListener("selectionchange", onSelectionChange);
    document.addEventListener("mousedown", onDocMouseDown);

    return () => {
      container.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("scroll", hide, true);
      document.removeEventListener("selectionchange", onSelectionChange);
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, [containerRef, enabled]);

  return {
    selectionButton,
    pendingSuggestion,
    acceptSelection: () => {
      if (!selectionButton) return;
      setPendingSuggestion({
        field: selectionButton.field,
        text: selectionButton.text,
      });
      setSelectionButton(null);
    },
    clearPending: () => setPendingSuggestion(null),
  };
}
