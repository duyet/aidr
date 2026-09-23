import { type KeyboardEvent, useCallback } from "react";

/** Dropdown keyboard nav for the search typeahead: Escape closes; the arrows
 * wrap through the result rows (filter row first, then story matches). */
export function useSearchKeyNav({
  showDropdown,
  rowCount,
  setOpen,
  setActiveIndex,
}: {
  showDropdown: boolean;
  rowCount: number;
  setOpen: (open: boolean) => void;
  setActiveIndex: (updater: (i: number) => number) => void;
}) {
  return useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        return;
      }
      if (!showDropdown || rowCount === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i + 1 >= rowCount ? 0 : i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i - 1 < 0 ? rowCount - 1 : i - 1));
      }
    },
    [showDropdown, rowCount, setOpen, setActiveIndex]
  );
}
