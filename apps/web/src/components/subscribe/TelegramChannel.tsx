import { Button } from "@aidr/ui";
import { trackChannelClick } from "@aidr/ui/track";
import { Flame, Languages, Newspaper, Send, ShieldCheck } from "lucide-react";
import { TELEGRAM_HANDLE, TELEGRAM_URL } from "../../lib/site";
import type { Lang } from "../../lib/types";
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
    en: "English and Vietnamese, matching the site.",
    vi: "Tiếng Anh và tiếng Việt, giống trên web.",
  },
  {
    icon: ShieldCheck,
    en: "Public channel, no account. Open it in any Telegram app.",
    vi: "Kênh công khai, không cần tài khoản. Mở bằng mọi ứng dụng Telegram.",
  },
] as const;

/** Telegram tab of the deliver page: channel CTA, features, channel mock. */
export function TelegramChannel({ lang }: { lang: Lang }) {
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  return (
    <>
      <p className="text-base leading-relaxed text-muted-foreground">
        {t(
          "Get the same ranked AI news in Telegram. Open the public channel — no Chrome install required.",
          "Nhận cùng tin AI đã xếp hạng trên Telegram. Mở kênh công khai — không cần cài Chrome."
        )}
      </p>
      <Button size="lg" asChild>
        <a
          href={TELEGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackChannelClick("telegram", { to: "telegram" })}
        >
          <Send className="mr-2 size-5" aria-hidden />
          {t(`Open ${TELEGRAM_HANDLE}`, `Mở ${TELEGRAM_HANDLE}`)}
        </a>
      </Button>
      <ul className="grid gap-3 sm:grid-cols-2">
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
      <TelegramPreview lang={lang} />
    </>
  );
}
