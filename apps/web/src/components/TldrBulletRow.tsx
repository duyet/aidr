import type { ReactElement, ReactNode } from "react";
import type { AidrLayout } from "../lib/aidr-layout";
import { StoryThumb } from "./StoryThumb";

export function TldrBulletRow({
  layout,
  n,
  thumbSrc,
  itemId,
  fullText,
  linked,
  priority,
  children,
}: {
  layout: AidrLayout;
  n: number;
  thumbSrc: string | null;
  itemId?: string;
  fullText: string;
  linked?: boolean;
  priority?: boolean;
  children: ReactNode;
}): ReactElement {
  const copy = (
    <span
      className={`min-w-0 flex-1 line-clamp-2 break-words ${
        linked
          ? "underline decoration-border underline-offset-2 group-hover:decoration-accent"
          : ""
      }`}
      title={fullText}
    >
      {children}
    </span>
  );
  switch (layout) {
    case "a":
    case "b":
      return (
        <span className="flex min-h-[2lh] items-stretch gap-2">
          {copy}
          <StoryThumb src={thumbSrc} itemId={itemId} priority={priority} />
        </span>
      );
    case "c":
      return (
        <span className="flex min-h-[2lh] items-stretch gap-2">
          {copy}
          <span className="relative shrink-0 self-stretch">
            <StoryThumb src={thumbSrc} itemId={itemId} priority={priority} />
            <span className="absolute bottom-0.5 left-0.5 flex h-4 min-w-4 items-center justify-center rounded-sm bg-foreground/80 px-0.5 text-[10px] font-bold tabular-nums text-background">
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
