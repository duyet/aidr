import {
  Dialog,
  DialogBackdrop,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@ui-sdk/react/dialog";
import { CirclePlay } from "lucide-react";
import { useState } from "react";
import { track } from "../../lib/analytics/track";
import {
  INTRO_VIDEO_COPY,
  INTRO_VIDEO_YOUTUBE_ID,
  introVideoEmbedUrl,
} from "../../lib/intro-video";
import type { Lang } from "../../lib/types";
import { Bi } from "../Bi";
import { ROW_CLASS } from "./LinkRow";

/**
 * Plays the introduction video in a dialog. Renders nothing until
 * `INTRO_VIDEO_YOUTUBE_ID` is set. The iframe lives inside the dialog content,
 * so nothing loads from YouTube before the dialog opens and closing it removes
 * the player, which stops playback. The dialog is the bare player: no header,
 * no close button, no card chrome, so it closes with Escape or a click outside.
 */
export function IntroVideoButton({
  lang,
  tile = false,
}: {
  lang: Lang;
  /** A phone-menu row instead of the menu bar's icon button. */
  tile?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const videoId = INTRO_VIDEO_YOUTUBE_ID;
  if (!videoId) return null;
  const copy = INTRO_VIDEO_COPY[lang];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) {
          track("intro_video_open", {
            placement: tile ? "phone_menu" : "header",
          });
        }
        setOpen(next);
      }}
    >
      {tile ? (
        <DialogTrigger className={ROW_CLASS}>
          <CirclePlay aria-hidden />
          <Bi
            vi={INTRO_VIDEO_COPY.vi.menu}
            en={INTRO_VIDEO_COPY.en.menu}
            inline
          />
        </DialogTrigger>
      ) : (
        <DialogTrigger
          title={copy.open}
          aria-label={copy.open}
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground motion-reduce:transition-none [&_svg]:size-[15px]"
        >
          <CirclePlay aria-hidden />
        </DialogTrigger>
      )}
      <DialogBackdrop className="fixed inset-0 m-0 size-full max-h-none max-w-none border-0 bg-black/70 p-0" />
      {/* The dialog IS the player. border-0 and p-0 clear the browser's own
          popover frame. The width is the lesser of the viewport's width and
          the 16:9 box that fits its height, so the whole player stays on
          screen on short and narrow viewports alike. */}
      <DialogContent className="m-auto w-[min(calc(100%-1.5rem),calc((100dvh-1.5rem)*16/9))] max-w-none overflow-hidden border-0 bg-black p-0 outline-none">
        <DialogTitle className="sr-only">{copy.title}</DialogTitle>
        <div className="aspect-video w-full">
          <iframe
            src={introVideoEmbedUrl(videoId)}
            title={copy.title}
            className="size-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
