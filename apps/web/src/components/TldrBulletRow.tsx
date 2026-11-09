import type { ReactElement, ReactNode } from "react";
import type { AidrLayout } from "../lib/aidr-layout";
import type { Lang } from "../lib/types";
import { StoryThumb } from "./StoryThumb";

export function TldrBulletRow({
  layout,
  n,
  thumbSrc,
  thumbItemId,
  itemId,
  lang,
  fullText,
  linked,
  numbered = false,
  priority,
  children,
}: {
  layout: AidrLayout;
  n: number;
  thumbSrc: string | null;
  /** The story `thumbSrc` belongs to; defaults to `itemId`. */
  thumbItemId?: string;
  itemId?: string;
  lang?: Lang;
  fullText: string;
  linked?: boolean;
  /** Draw the mono rank before the text (layout A); the list is still an
   * <ol>, so the number is decorative for screen readers. */
  numbered?: boolean;
  priority?: boolean;
  children: ReactNode;
}): ReactElement {
  const copy = (
    <span
      className={`min-w-0 flex-1 line-clamp-2 break-words text-[calc(15px*var(--reader-font-size,1))] text-foreground ${
        linked ? "underline-offset-2 group-hover:underline" : ""
      }`}
      title={fullText}
    >
      {children}
    </span>
  );
  // Row padding follows the reader Density pref (--reader-pad).
  const row =
    "flex min-h-[2lh] items-start gap-3 py-[var(--reader-pad,0.5rem)]";
  switch (layout) {
    case "a":
    case "b":
      return (
        <span className={row}>
          {numbered && (
            // The outer span shares the text's size and line height, so the
            // small mono rank sits on the first line's baseline.
            <span
              aria-hidden="true"
              className="w-5 shrink-0 text-[calc(15px*var(--reader-font-size,1))]"
            >
              <span
                className={`font-mono text-[calc(11px*var(--reader-font-size,1))] tabular-nums ${
                  n === 1
                    ? "font-semibold text-accent"
                    : "text-muted-foreground"
                }`}
              >
                {String(n).padStart(2, "0")}
              </span>
            </span>
          )}
          {copy}
          <StoryThumb
            src={thumbSrc}
            thumbItemId={thumbItemId}
            itemId={itemId}
            lang={lang}
            priority={priority}
          />
        </span>
      );
    case "c":
      return (
        <span className={row}>
          {copy}
          <span className="relative shrink-0 self-stretch">
            <StoryThumb
              src={thumbSrc}
              thumbItemId={thumbItemId}
              itemId={itemId}
              lang={lang}
              priority={priority}
            />
            <span className="absolute bottom-0.5 left-0.5 flex h-4 min-w-4 items-center justify-center rounded-sm bg-foreground/80 px-0.5 text-[calc(10px*var(--reader-font-size,1))] font-bold tabular-nums text-background">
              {n}
            </span>
          </span>
        </span>
      );
    default: {
      const _exhaustive: never = layout;
      throw new Error(`unhandled AI;DR layout: ${_exhaustive}`);
    }
  }
}
