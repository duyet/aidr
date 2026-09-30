import { Badge, Button } from "@aidr/ui";
import { trackChannelClick } from "@aidr/ui/track";
import { Flame, Languages, Newspaper, Send, ShieldCheck } from "lucide-react";
import {
  TELEGRAM_EN_HANDLE,
  TELEGRAM_EN_URL,
  TELEGRAM_HANDLE,
  TELEGRAM_URL,
} from "../../lib/site";
import type { Lang } from "../../lib/types";
import { ChannelSplit } from "./ChannelSplit";
import { TelegramPreview } from "./TelegramPreview";

export const TELEGRAM_FEATURES = [
  {
    icon: Newspaper,
    en: "One digest a day: today's AI news, ranked and summarised.",
    vi: "Một bản tin mỗi ngày: tin AI hôm nay, đã xếp hạng và tóm tắt.",
  },
  {
    icon: Flame,
    en: "Trending alerts when a story breaks out — max 6 a day.",
    vi: "Cảnh báo khi tin nổi bật — tối đa 6 tin mỗi ngày.",
  },
  {
    icon: Languages,
    en: "One channel per language: English and Vietnamese.",
    vi: "Mỗi ngôn ngữ một kênh: tiếng Anh và tiếng Việt.",
  },
  {
    icon: ShieldCheck,
    en: "Public channel, no account. Open it in any Telegram app.",
    vi: "Kênh công khai, không cần tài khoản. Mở bằng mọi ứng dụng Telegram.",
  },
] as const;

const CHANNELS = [
  {
    channel: "vi",
    url: TELEGRAM_URL,
    handle: TELEGRAM_HANDLE,
    track: "telegram",
    label: { en: "Vietnamese", vi: "Tiếng Việt" },
  },
  {
    channel: "en",
    url: TELEGRAM_EN_URL,
    handle: TELEGRAM_EN_HANDLE,
    track: "telegram-en",
    label: { en: "English", vi: "Tiếng Anh" },
  },
] as const;

/** Telegram tab of the deliver page: features and one CTA per channel on the
 *  left, the channel mocks on the right, the mock matching the page language
 *  first. */
export function TelegramChannel({ lang }: { lang: Lang }) {
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const channels = [...CHANNELS].sort(
    (a, b) => Number(b.channel === lang) - Number(a.channel === lang)
  );
  return (
    <ChannelSplit
      controls={
        <>
          <p className="text-base leading-relaxed text-muted-foreground">
            {t(
              "Get the same ranked AI news in Telegram. Open the public channel — no Chrome install required.",
              "Nhận cùng tin AI đã xếp hạng trên Telegram. Mở kênh công khai — không cần cài Chrome."
            )}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {TELEGRAM_FEATURES.map((f) => (
              <li
                key={f.en}
                className="flex items-start gap-2.5 text-sm text-muted-foreground"
              >
                <f.icon
                  className="mt-0.5 size-4 shrink-0 text-primary"
                  aria-hidden
                />
                <span>{t(f.en, f.vi)}</span>
              </li>
            ))}
          </ul>
          <div className="space-y-4">
            {channels.map((c) => (
              <div key={c.channel} className="space-y-2">
                <div>
                  <p className="text-sm font-semibold">
                    {t(c.label.en, c.label.vi)}
                  </p>
                  <p className="text-xs text-muted-foreground">{c.handle}</p>
                </div>
                <Button size="lg" className="w-full" asChild>
                  <a
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() =>
                      trackChannelClick("telegram", { to: c.track })
                    }
                  >
                    <Send className="mr-2 size-5" aria-hidden />
                    {t(`Open ${c.handle}`, `Mở ${c.handle}`)}
                  </a>
                </Button>
              </div>
            ))}
          </div>
        </>
      }
      preview={
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-full">
              {t("What lands in the channel", "Bạn sẽ nhận gì trong kênh")}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {t(
                "Illustrative layout — the real digest is in the channel",
                "Bố cục minh họa — bản tin thật nằm trong kênh"
              )}
            </span>
          </div>
          <div className="space-y-6">
            {channels.map((c) => (
              <TelegramPreview
                key={c.channel}
                lang={lang}
                channel={c.channel}
              />
            ))}
          </div>
        </div>
      }
    />
  );
}
