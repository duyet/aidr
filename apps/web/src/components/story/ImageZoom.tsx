import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
} from "@ui-sdk/react/dialog";
import { X } from "lucide-react";
import { type ReactElement, useState } from "react";
import {
  STORY_DIALOG_CLOSE_BUTTON_CLASS,
  STORY_DIALOG_LIGHTBOX_IMAGE_CLASS,
} from "../story-dialog/layout";

/** styles.css sizes `.story-dialog-lightbox-*` from these two insets, which
 * only `.story-dialog-overlay` defines, so the dialog sets them itself. */
const PANEL_CLASS =
  "story-dialog-lightbox-panel fixed top-1/2 left-1/2 w-[min(960px,calc(100%-2rem))] max-w-[min(960px,100%)] -translate-x-1/2 -translate-y-1/2 [--story-dialog-inset-top:max(1rem,env(safe-area-inset-top,0px))] [--story-dialog-inset-bottom:max(1rem,env(safe-area-inset-bottom,0px))]";

/**
 * A full-size image over the page. A ui-sdk Dialog, so it nests inside the
 * StoryDialog drawer: Escape closes only the image, and focus goes back to
 * the control that opened it. `onClose` runs once the dialog has closed, so
 * unmounting it does not cut that focus return short.
 */
export function ImageZoom({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}): ReactElement {
  const [open, setOpen] = useState(true);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/70" />
      <DialogContent aria-label="Image" className={PANEL_CLASS}>
        <DialogClose
          aria-label="Close"
          className={`${STORY_DIALOG_CLOSE_BUTTON_CLASS} absolute -top-3 -right-3 z-[1] border border-border bg-background text-foreground shadow`}
        >
          <X className="h-4 w-4" aria-hidden />
        </DialogClose>
        <img src={src} alt="" className={STORY_DIALOG_LIGHTBOX_IMAGE_CLASS} />
      </DialogContent>
    </Dialog>
  );
}
