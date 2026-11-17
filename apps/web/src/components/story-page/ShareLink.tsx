import { Button } from "@ui-sdk/react/button";
import { Check, Share2 } from "lucide-react";
import { type ReactElement, useEffect, useRef, useState } from "react";
import { storyShareLink } from "../../lib/share-text";
import type { FeedItem, Lang } from "../../lib/types";
import { Bi } from "../Bi";

const COPIED_MS = 1600;

/**
 * "Share": the device's share sheet where there is one, else the story link
 * on the clipboard. When the clipboard is refused too, `onFallback` opens the
 * copy sheet, where the link is selected to copy by hand. Cancelling the
 * share sheet is a choice, not a failure.
 */
export function ShareLink({
  item,
  lang,
  title,
  onFallback,
}: {
  item: Pick<FeedItem, "id" | "title" | "title_vi">;
  lang: Lang;
  title: string;
  onFallback: () => void;
}): ReactElement {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function share() {
    const url = storyShareLink(item, lang);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title, url });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) {
          onFallback();
        }
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      timer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      onFallback();
    }
  }

  return (
    <Button type="button" onClick={() => void share()} className="btn-link">
      {copied ? <Check aria-hidden /> : <Share2 aria-hidden />}
      <span aria-live="polite">
        {copied ? (
          <Bi vi="Đã chép liên kết" en="Link copied" inline />
        ) : (
          <Bi vi="Chia sẻ" en="Share" inline />
        )}
      </span>
    </Button>
  );
}
