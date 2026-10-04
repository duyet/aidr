import { track } from "@aidr/ui/track";
import { Maximize2, X } from "lucide-react";
import { type ReactElement, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { withLang } from "../lib/locale-url";
import { resizeCdnImageUrl } from "../lib/tldr-images";
import type { Lang } from "../lib/types";
import {
  STORY_DIALOG_CLOSE_BUTTON_CLASS,
  STORY_DIALOG_LIGHTBOX_IMAGE_CLASS,
  STORY_DIALOG_LIGHTBOX_OVERLAY_CLASS,
  STORY_DIALOG_LIGHTBOX_PANEL_CLASS,
} from "./story-dialog/layout";
import { useDialogLifecycle } from "./story-dialog/use-dialog-lifecycle";

/** Branded site mark — used when a story has no og/thumbnail, or the
 * remote image fails. Same asset as the favicon so it never 404s. */
export const STORY_THUMB_PLACEHOLDER = "/favicon.svg";

export function ThumbLightbox({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}): ReactElement {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useDialogLifecycle(onClose, overlayRef);

  const overlay = (
    <div ref={overlayRef} className={STORY_DIALOG_LIGHTBOX_OVERLAY_CLASS}>
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        tabIndex={-1}
        aria-label="Close"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Image"
        tabIndex={-1}
        className={STORY_DIALOG_LIGHTBOX_PANEL_CLASS}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className={`${STORY_DIALOG_CLOSE_BUTTON_CLASS} absolute -top-3 -right-3 z-[1] border border-border bg-background text-foreground shadow`}
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
        <img src={src} alt="" className={STORY_DIALOG_LIGHTBOX_IMAGE_CLASS} />
      </div>
    </div>
  );
  return createPortal(overlay, document.body);
}

/**
 * Compact story thumbnail matching the feed card language: rounded,
 * bordered, object-cover. Sized to two lines of the surrounding
 * `leading-snug` copy (`2lh`) so it fills an AI;DR row.
 */
/** First-party story card. Used when the publisher thumb is missing or 404s.
 * `lang` picks the headline language on the card. */
export function storyOgThumbUrl(
  itemId: string | undefined,
  lang: Lang | undefined
): string | null {
  if (!itemId) return null;
  return withLang(`/api/og/${itemId}.png`, lang === "en" ? "en" : "vi");
}

export function StoryThumb({
  src,
  alt = "",
  priority = false,
  itemId,
  lang,
  variant = "feed",
}: {
  src?: string | null;
  alt?: string;
  /** First-screen thumbs: eager so LCP is not a lazy 800KB og:image. */
  priority?: boolean;
  itemId?: string;
  /** Card language when we fall back to `/api/og`. */
  lang?: Lang;
  variant?: "feed" | "card";
}): ReactElement {
  // Keep every URL that already failed. A later failure must not bring an
  // earlier one back, or the publisher image and the OG card load forever.
  const [failedSrcs, setFailedSrcs] = useState<ReadonlySet<string>>(
    () => new Set()
  );
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const url = resizeCdnImageUrl(src, variant === "card" ? "card" : "thumb");
  const remote = url && !failedSrcs.has(url) ? url : null;
  const og = storyOgThumbUrl(itemId, lang);
  const ogSrc = og && !failedSrcs.has(og) ? og : null;
  const showSrc = remote ?? ogSrc ?? STORY_THUMB_PLACEHOLDER;
  const zoomSrc = remote ? (resizeCdnImageUrl(src, "full") ?? remote) : ogSrc;

  /*
   * A `fetchPriority="high"` here becomes a `<link rel=preload as=image
   * fetchpriority=high>` in the SSR head, and the 2026-09-27 trace showed
   * four of them (pbs.twimg.com x4) starting at t=436 ms — the same
   * millisecond the render-blocking stylesheet was discovered. On a 1.6 Mbps
   * link they pushed the CSS from ~90 ms to 1,338 ms, and the LCP element (a
   * text row, not an image) painted 1.6-2.2 s after TTFB.
   *
   * The LCP element is text, so no image needs the highest priority slot.
   * First-screen thumbs stay `eager` — they are in the viewport, so the
   * browser fetches them either way and the page looks identical — they just
   * hand the priority back. This removes the high-priority third-party
   * preloads from the critical path without changing a pixel.
   */
  const loading = priority ? "eager" : "lazy";

  const imgClass =
    variant === "card"
      ? "max-h-56 w-full rounded-3xl border border-border object-cover transition-transform duration-200 motion-reduce:transform-none motion-reduce:transition-none group-hover:scale-[1.04] group-focus-visible:scale-[1.04]"
      : "size-[2lh] min-h-[2lh] min-w-[2lh] shrink-0 self-stretch overflow-hidden rounded-xl border border-border/80 bg-muted object-cover transition-transform duration-200 motion-reduce:transform-none motion-reduce:transition-none group-hover:scale-[1.08] group-focus-visible:scale-[1.08]";

  const img = (
    <img
      src={showSrc}
      alt={alt}
      width={variant === "card" ? 640 : 48}
      height={variant === "card" ? 192 : 48}
      loading={loading}
      fetchPriority="low"
      decoding="async"
      referrerPolicy="no-referrer"
      aria-hidden={alt || zoomSrc ? undefined : true}
      onError={(event) => {
        if (showSrc !== STORY_THUMB_PLACEHOLDER) {
          const broken = showSrc;
          setFailedSrcs((current) => {
            if (current.has(broken)) return current;
            const next = new Set(current);
            next.add(broken);
            return next;
          });
          return;
        }
        event.currentTarget.style.visibility = "hidden";
      }}
      className={imgClass}
    />
  );

  if (!zoomSrc) return img;

  return (
    <>
      <button
        type="button"
        id={labelId}
        aria-label="Zoom image"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
          track("thumb_zoom", itemId ? { item_id: itemId } : undefined);
        }}
        className={
          variant === "card"
            ? "group relative block w-full cursor-zoom-in overflow-hidden rounded-3xl p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            : "group relative shrink-0 cursor-zoom-in overflow-hidden rounded-xl p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        }
      >
        {img}
        <span
          className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition duration-200 motion-reduce:transition-none group-hover:bg-black/40 group-hover:opacity-100 group-focus-visible:bg-black/40 group-focus-visible:opacity-100"
          aria-hidden
        >
          <Maximize2
            className={
              variant === "card"
                ? "h-7 w-7 text-white drop-shadow"
                : "h-3.5 w-3.5 text-white drop-shadow"
            }
          />
        </span>
      </button>
      {open && (
        <ThumbLightbox
          src={zoomSrc}
          onClose={() => {
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
