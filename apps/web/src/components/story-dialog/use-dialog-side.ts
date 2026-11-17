import { useSyncExternalStore } from "react";

export type DialogSide = "right" | "bottom";

const WIDE = "(min-width: 700px)";

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

export function useDialogSide(): DialogSide {
  return useSyncExternalStore(
    subscribe,
    () => (window.matchMedia(WIDE).matches ? "right" : "bottom"),
    () => "right"
  );
}
