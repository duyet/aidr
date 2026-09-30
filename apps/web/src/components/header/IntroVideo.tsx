import { Button } from "@aidr/ui";
import { track } from "@aidr/ui/track";
import { CirclePlay } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useState } from "react";
import { PHONE_MENU_LINK_CLASS } from "../../lib/chrome";
import {
  INTRO_VIDEO_COPY,
  INTRO_VIDEO_YOUTUBE_ID,
  introVideoEmbedUrl,
} from "../../lib/intro-video";
import type { Lang } from "../../lib/types";

/**
 * Header control that plays the introduction video in a dialog. Renders
 * nothing until `INTRO_VIDEO_YOUTUBE_ID` is set. The iframe lives inside the
 * dialog content, so nothing loads from YouTube before the dialog opens and
 * closing it removes the player, which stops playback. The dialog is the bare
 * player: no header and no close button, so it closes with Escape or a click
 * outside.
 */
export function IntroVideoButton({
  lang,
  tile = false,
}: {
  lang: Lang;
  /** Large phone-menu tile instead of the wide header's icon button. */
  tile?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const videoId = INTRO_VIDEO_YOUTUBE_ID;
  if (!videoId) return null;
  const copy = INTRO_VIDEO_COPY[lang];

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          track("intro_video_open", { from: tile ? "phone_menu" : "header" });
        }
        setOpen(next);
      }}
    >
      <DialogPrimitive.Trigger asChild>
        {tile ? (
          <button
            type="button"
            className={`${PHONE_MENU_LINK_CLASS} hover:bg-muted`}
          >
            <CirclePlay aria-hidden />
            {copy.menu}
          </button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            title={copy.open}
            aria-label={copy.open}
          >
            <CirclePlay aria-hidden />
          </Button>
        )}
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-1.5rem)] w-[calc(100%-1.5rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-background text-foreground shadow-xl"
        >
          <DialogPrimitive.Title className="sr-only">
            {copy.title}
          </DialogPrimitive.Title>
          <div className="aspect-video w-full shrink-0 bg-black">
            <iframe
              src={introVideoEmbedUrl(videoId)}
              title={copy.title}
              className="size-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
