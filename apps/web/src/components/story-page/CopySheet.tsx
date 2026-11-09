import { Button } from "@aidr/ui";
import { Copy, Link2 } from "lucide-react";
import { type ReactElement, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  STORY_POST_FORMATS,
  type StoryPostFormat,
  storyPostText,
  storyShareLink,
} from "../../lib/share-text";
import type { FeedItem, Lang } from "../../lib/types";
import { storyOgThumbUrl } from "../StoryThumb";
import { useDialogLifecycle } from "../story-dialog/use-dialog-lifecycle";

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
 * card the link unfurls to. A modal on the shared dialog lifecycle, so focus
 * moves in, Tab stays inside, Esc closes and focus returns to the opener.
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
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useDialogLifecycle(onClose, overlayRef);
  const postRef = useRef<HTMLDivElement | null>(null);
  const linkRef = useRef<HTMLSpanElement | null>(null);
  const copyRef = useRef<HTMLButtonElement | null>(null);
  const [format, setFormat] = useState<StoryPostFormat>("aidr");
  // The lifecycle focuses the panel; the main action is the better start.
  useEffect(() => {
    copyRef.current?.focus();
  }, []);
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

  const sheet = (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[1000] grid place-items-end justify-items-center p-3 min-[700px]:place-items-center"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={copy.close}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative max-h-[calc(100dvh-24px)] w-full max-w-[520px] overflow-y-auto rounded-2xl border border-input bg-background p-4 text-foreground shadow-xl mb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id={titleId}
            className="text-[calc(17px*var(--reader-font-size,1))] font-semibold"
          >
            {copy.title}
          </h2>
          <Button
            variant="outline"
            size="sm"
            onClick={onClose}
            aria-label={`Esc: ${copy.close}`}
            className="font-mono text-[calc(11px*var(--reader-font-size,1))] uppercase"
          >
            Esc
          </Button>
        </div>
        <fieldset
          aria-label={copy.formats}
          className="mt-3 mb-2.5 inline-flex min-w-0 flex-wrap gap-0.5 rounded-full border border-input p-0.5"
        >
          {STORY_POST_FORMATS.map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={format === f}
              onClick={() => {
                setFormat(f);
                setStatus("");
              }}
              className="min-h-9 rounded-full px-3 text-[calc(13px*var(--reader-font-size,1))] text-muted-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground"
            >
              {copy.labels[f]}
            </button>
          ))}
        </fieldset>
        <div
          ref={postRef}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the preview is selectable text a keyboard reader may copy by hand
          tabIndex={0}
          data-testid="copy-sheet-post"
          lang={lang}
          className="whitespace-pre-wrap rounded-[10px] border border-border bg-card p-3 text-sm leading-normal [overflow-wrap:anywhere]"
        >
          {body}
          <span ref={linkRef} className="text-muted-foreground">
            {link}
          </span>
        </div>
        <div className="mt-2.5 grid grid-cols-[96px_minmax(0,1fr)] items-center gap-2.5 rounded-[10px] border border-border p-2 text-xs text-muted-foreground">
          <img
            src={card}
            alt=""
            width={1200}
            height={630}
            loading="lazy"
            decoding="async"
            className="aspect-[1200/630] w-24 rounded-md bg-muted object-cover"
          />
          <span>{copy.card}</span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            ref={copyRef}
            className="h-11 px-5 text-sm"
            onClick={() => void write(post, copy.copied, postRef.current)}
          >
            <Copy aria-hidden />
            {copy.copyPost}
          </Button>
          <Button
            variant="outline"
            className="h-11 px-5 text-sm"
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
            className="text-[calc(13px*var(--reader-font-size,1))] text-muted-foreground"
          >
            {status}
          </span>
        </div>
      </div>
    </div>
  );
  return createPortal(sheet, document.body);
}
