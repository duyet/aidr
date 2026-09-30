import { Send } from "lucide-react";
import {
  TELEGRAM_EN_HANDLE,
  TELEGRAM_EN_URL,
  TELEGRAM_HANDLE,
  TELEGRAM_URL,
} from "../../lib/site";
import type { Lang } from "../../lib/types";
import { BrowserFrame } from "./BrowserFrame";

/** Sample digest copy. Shape mirrors `buildDigestMessage` /
 *  `buildStoryCaption` in worker/notify/telegram.ts so the preview stays
 *  honest about what actually lands in the channel: `date` is the digest's
 *  YYYY-MM-DD stamp, and `meta`'s hashtag is the sanitized category slug the
 *  bot emits (`category.replace(/[^a-z0-9_]/gi, "_")` — which is why it stays
 *  ASCII in both locales). */
export const TELEGRAM_DIGEST = {
  en: {
    date: "2026-09-27",
    bullets: [
      "OpenAI ships a faster reasoning model for agents",
      "Anthropic open-sources Claude interpretability tools",
      "Google DeepMind brings Gemini on-device to Chrome",
    ],
    story: {
      title: "NVIDIA releases an open inference stack for Blackwell",
      summary:
        "A vendor-neutral serving layer targets Blackwell without locking callers into one runtime.",
      meta: "#Infra  ·  ▲ 412  ·  💬 96",
      buttons: ["Read →"],
    },
    cta: "Read the full digest on aidr.today →",
  },
  vi: {
    date: "2026-09-27",
    bullets: [
      "OpenAI ra mắt mô hình suy luận nhanh hơn cho agent",
      "Anthropic mở mã nguồn bộ công cụ diễn giải Claude",
      "Google DeepMind đưa Gemini chạy on-device lên Chrome",
    ],
    story: {
      title: "NVIDIA phát hành stack inference mở cho Blackwell",
      summary:
        "Một lớp phục vụ trung lập hãng nhắm Blackwell mà không ràng buộc runtime.",
      meta: "#Infra  ·  ▲ 412  ·  💬 96",
      buttons: ["Đọc bài →"],
    },
    cta: "Xem đầy đủ trên aidr.today →",
  },
} as const;

/** Telegram channel mock: the once-a-day digest plus a trending post, in the
 *  two message shapes the bot actually sends. `channel` picks which channel
 *  (and content language) is shown; `lang` is the page language for chrome. */
export function TelegramPreview({
  lang,
  channel,
}: {
  lang: Lang;
  channel: Lang;
}) {
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const copy = TELEGRAM_DIGEST[channel === "vi" ? "vi" : "en"];
  const url = channel === "vi" ? TELEGRAM_URL : TELEGRAM_EN_URL;
  const handle = channel === "vi" ? TELEGRAM_HANDLE : TELEGRAM_EN_HANDLE;

  return (
    <BrowserFrame tab="Telegram" address={url.replace(/^https?:\/\//, "")}>
      <div className="space-y-3 bg-[#f4f4f5] px-2.5 py-3 dark:bg-muted/30">
        <div className="flex items-center gap-2.5 border-b border-border/70 pb-2.5">
          <span
            className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#2AABEE] text-white"
            aria-hidden
          >
            <Send className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold leading-tight">
              {handle}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {t("AI news, ranked daily", "Tin AI, xếp hạng hằng ngày")}
            </p>
          </div>
        </div>

        {/* Digest message: bold header + linked bullets + one CTA button.
              A div, not an <article>: these are decorative mock bubbles, and
              an unnamed `article` would add noise to the landmark list. */}
        <div className="max-w-full rounded-2xl rounded-tl-sm border border-border/60 bg-card px-3 py-2.5 shadow-sm">
          <p className="text-[13px] font-semibold leading-snug text-foreground">
            <span aria-hidden>🗞</span> {t("AI news today", "AI hôm nay có gì")}{" "}
            — {copy.date}
          </p>
          <ul className="mt-1.5 space-y-1.5">
            {copy.bullets.map((b) => (
              <li
                key={b}
                className="text-[12.5px] leading-relaxed text-foreground/90"
              >
                <span className="text-muted-foreground" aria-hidden>
                  •
                </span>{" "}
                {b}{" "}
                <span className="text-accent" aria-hidden>
                  →
                </span>
              </li>
            ))}
          </ul>
          <span className="mt-2.5 inline-flex rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground">
            {copy.cta}
          </span>
        </div>

        {/* Trending post: bold title, summary, meta line, two buttons. */}
        <div className="max-w-full rounded-2xl rounded-tl-sm border border-border/60 bg-card px-3 py-2.5 shadow-sm">
          <p className="text-[13px] font-semibold leading-snug text-foreground">
            <span aria-hidden>🔥</span> {copy.story.title}
          </p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-foreground/90">
            {copy.story.summary}
          </p>
          <p className="mt-1.5 text-[11px] text-accent">{copy.story.meta}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {copy.story.buttons.map((b) => (
              <span
                key={b}
                className="rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground"
              >
                {b}
              </span>
            ))}
          </div>
        </div>
      </div>
    </BrowserFrame>
  );
}
