import { track } from "@aidr/ui/track";
import { Maximize2, X } from "lucide-react";
import { type ReactElement, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { resizeCdnImageUrl } from "../lib/tldr-images";
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
export function StoryThumb({
  src,
  alt = "",
  priority = false,
  itemId,
  variant = "feed",
}: {
  src?: string | null;
  alt?: string;
  /** First-screen thumbs: eager so LCP is not a lazy 800KB og:image. */
  priority?: boolean;
  itemId?: string;
  variant?: "feed" | "card";
}): ReactElement {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const url = resizeCdnImageUrl(src, variant === "card" ? "card" : "thumb");
  const remote = url && url !== failedSrc ? url : null;
  const showSrc = remote ?? STORY_THUMB_PLACEHOLDER;
  const zoomSrc = remote ? (resizeCdnImageUrl(src, "full") ?? remote) : null;

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
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "low"}
      decoding="async"
      referrerPolicy="no-referrer"
      aria-hidden={alt || zoomSrc ? undefined : true}
      onError={(event) => {
        if (remote) {
          setFailedSrc(remote);
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
