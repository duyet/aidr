import { track } from "@aidr/ui/track";
import { X } from "lucide-react";
import { type ReactElement, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { resizeCdnImageUrl } from "../lib/tldr-images";

/** Branded site mark — used when a story has no og/thumbnail, or the
 * remote image fails. Same asset as the favicon so it never 404s. */
export const STORY_THUMB_PLACEHOLDER = "/favicon.svg";

function ThumbLightbox({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}): ReactElement {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const overlay = (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-black/70"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Image"
        className="relative max-h-[90vh] max-w-[min(960px,100%)]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute -top-3 -right-3 z-[1] rounded-full border border-border bg-background p-1.5 text-foreground shadow"
        >
          <X className="h-4 w-4" />
        </button>
        <img
          src={src}
          alt=""
          className="max-h-[90vh] w-auto max-w-full rounded-xl object-contain"
        />
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
      ? "max-h-48 w-full rounded-xl border border-border object-cover"
      : "size-[2lh] min-h-[2lh] min-w-[2lh] shrink-0 self-stretch overflow-hidden rounded-xl border border-border/80 bg-muted object-cover";

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
            ? "block w-full cursor-zoom-in overflow-hidden rounded-xl p-0"
            : "shrink-0 cursor-zoom-in overflow-hidden rounded-xl p-0"
        }
      >
        {img}
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
