import { Button } from "@ui-sdk/react/button";
import {
  Dialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@ui-sdk/react/dialog";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@ui-sdk/react/segmented-control";
import { Copy, Link2 } from "lucide-react";
import { type ReactElement, useRef, useState } from "react";
import {
  STORY_POST_FORMATS,
  type StoryPostFormat,
  storyPostText,
  storyShareLink,
} from "../../lib/share-text";
import type { FeedItem, Lang } from "../../lib/types";
import { storyOgThumbUrl } from "../StoryThumb";

const COPY = {
  en: {
    title: "Copy AI;DR for social",
    close: "Close",
    formats: "Post format",
    labels: { aidr: "AI;DR + link", title: "Title + link", x: "X / Threads" },
    card: "Facebook, Telegram and Zalo show this card when you paste the link.",
    copyPost: "Copy post",
    copyLink: "Copy link",
    copied: "Copied",
    linkCopied: "Link copied",
    selected: "Selected. Press and hold or use your copy key.",
  },
  vi: {
    title: "Chép AI;DR để đăng",
    close: "Đóng",
    formats: "Kiểu bài",
    labels: { aidr: "AI;DR + link", title: "Tiêu đề + link", x: "X / Threads" },
    card: "Khi dán link, Facebook, Telegram và Zalo hiện thẻ này.",
    copyPost: "Chép bài đăng",
    copyLink: "Chỉ chép link",
    copied: "Đã chép bài đăng",
    linkCopied: "Đã chép link",
    selected: "Đã chọn sẵn, nhấn giữ để chép.",
  },
} as const;

/** Select a node's text so a reader can copy it by hand when the
 * clipboard API is missing or refused. */
function selectNode(node: Node | null): void {
  if (!node) return;
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
}

/**
 * "Copy for social": three post formats with a live preview and the share
 * card the link unfurls to. A ui-sdk Dialog: focus moves in, Tab stays
 * inside, Esc closes and focus returns to the opener. `onClose` runs once it
 * has closed.
 */
export function CopySheet({
  item,
  lang,
  onClose,
}: {
  item: FeedItem;
  lang: Lang;
  onClose: () => void;
}): ReactElement {
  const copy = COPY[lang];
  const postRef = useRef<HTMLDivElement | null>(null);
  const linkRef = useRef<HTMLSpanElement | null>(null);
  const copyRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(true);
  const [format, setFormat] = useState<StoryPostFormat>("aidr");
  const [status, setStatus] = useState("");

  const post = storyPostText(item, lang, format);
  const link = post.slice(post.lastIndexOf("\n") + 1);
  const body = post.slice(0, post.length - link.length);
  const card =
    item.og_card_urls?.[lang] ?? storyOgThumbUrl(item.id, lang) ?? undefined;

  const write = async (text: string, done: string, fallback: Node | null) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(done);
    } catch {
      selectNode(fallback);
      setStatus(copy.selected);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      onOpenChangeComplete={(isOpen) => {
        if (!isOpen) onClose();
      }}
    >
      <DialogBackdrop className="fixed inset-0 bg-black/60" />
      <DialogContent
        initialFocus={() => copyRef.current}
        className="fixed bottom-[calc(12px+env(safe-area-inset-bottom))] left-1/2 max-h-[calc(100dvh-24px)] w-[min(520px,calc(100%-24px))] -translate-x-1/2 overflow-y-auto rounded-2xl bg-card p-4 text-card-foreground shadow-xl min-[700px]:top-1/2 min-[700px]:bottom-auto min-[700px]:-translate-y-1/2"
      >
        <div className="flex items-center justify-between gap-3">
          <DialogTitle className="text-[17px] font-semibold">
            {copy.title}
          </DialogTitle>
          <DialogClose
            aria-label={`Esc: ${copy.close}`}
            className="btn-soft font-mono text-[11px] uppercase"
          >
            Esc
          </DialogClose>
        </div>
        <SegmentedControl
          aria-label={copy.formats}
          value={format}
          onValueChange={(next) => {
            if (!next) return;
            setFormat(next as StoryPostFormat);
            setStatus("");
          }}
          className="mt-3 mb-2.5 inline-flex min-w-0 flex-wrap gap-0.5 rounded-full bg-muted p-0.5"
        >
          {STORY_POST_FORMATS.map((f) => (
            <SegmentedControlItem
              key={f}
              value={f}
              className="min-h-9 cursor-pointer rounded-full px-3 text-[13px] text-muted-foreground data-checked:bg-primary data-checked:text-primary-foreground"
            >
              {copy.labels[f]}
            </SegmentedControlItem>
          ))}
        </SegmentedControl>
        <div
          ref={postRef}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the preview is selectable text a keyboard reader may copy by hand
          tabIndex={0}
          data-testid="copy-sheet-post"
          lang={lang}
          className="rounded-[10px] bg-muted p-3 text-sm leading-normal whitespace-pre-wrap [overflow-wrap:anywhere]"
        >
          {body}
          <span ref={linkRef} className="text-muted-foreground">
            {link}
          </span>
        </div>
        <div className="mt-2.5 grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2.5 rounded-[10px] bg-muted p-2 text-xs text-muted-foreground">
          <img
            src={card}
            alt=""
            width={1200}
            height={630}
            loading="lazy"
            decoding="async"
            className="aspect-[1200/630] w-24 rounded-md bg-background object-cover"
          />
          <span>{copy.card}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            ref={copyRef}
            className="btn-primary"
            onClick={() => void write(post, copy.copied, postRef.current)}
          >
            <Copy aria-hidden />
            {copy.copyPost}
          </Button>
          <Button
            className="btn-soft"
            // On a refused clipboard the preview's own link is selected: the
            // same story link, tagged with the format's slot.
            onClick={() =>
              void write(
                storyShareLink(item, lang),
                copy.linkCopied,
                linkRef.current
              )
            }
          >
            <Link2 aria-hidden />
            {copy.copyLink}
          </Button>
          <span
            role="status"
            aria-live="polite"
            className="text-[13px] text-muted-foreground"
          >
            {status}
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
