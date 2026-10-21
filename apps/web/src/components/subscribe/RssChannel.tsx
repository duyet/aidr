import { Badge, Button } from "@aidr/ui";
import { Check, Clock, Copy, ListOrdered, Rss, Text } from "lucide-react";
import { useState } from "react";
import { track } from "../../lib/analytics/track";
import { feedLangsFor, feedUrl, RSS_READERS } from "../../lib/rss-subscribe";
import type { Lang } from "../../lib/types";
import { ChannelSplit } from "./ChannelSplit";

const FEED_FACTS = [
  {
    icon: ListOrdered,
    en: "Up to 100 stories from the last 3 days, newest first.",
    vi: "Tối đa 100 tin trong 3 ngày gần đây, tin mới nhất ở trên đầu.",
  },
  {
    icon: Text,
    en: "Each item has the headline, a short summary, and a link to the story on aidr.today. Not the full article.",
    vi: "Mỗi mục có tiêu đề, phần tóm tắt ngắn và đường dẫn tới bài trên aidr.today. Không kèm toàn văn bài gốc.",
  },
  {
    icon: Clock,
    en: "New stories arrive every 30 minutes, when the pipeline runs.",
    vi: "Tin mới được cập nhật mỗi 30 phút, theo mỗi lượt chạy của hệ thống.",
  },
] as const;

const FEED_LABEL = {
  en: { en: "English feed", vi: "Bản tin tiếng Anh" },
  vi: { en: "Vietnamese feed", vi: "Bản tin tiếng Việt" },
} as const;

function FeedRow({ lang, feedLang }: { lang: Lang; feedLang: Lang }) {
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  const url = feedUrl(feedLang);
  const [copied, setCopied] = useState(false);

  async function copy() {
    track("rss_subscribe", { target: "copy", lang: feedLang });
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-border p-4">
      <p className="text-sm font-semibold">{FEED_LABEL[feedLang][lang]}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2.5 py-2 text-xs">
          {url}
        </code>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void copy()}
          aria-label={t(
            `Copy ${FEED_LABEL[feedLang].en} URL`,
            `Sao chép địa chỉ ${FEED_LABEL[feedLang].vi.toLowerCase()}`
          )}
        >
          {copied ? (
            <Check className="size-4" aria-hidden />
          ) : (
            <Copy className="size-4" aria-hidden />
          )}
          {copied ? t("Copied", "Đã chép") : t("Copy", "Sao chép")}
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">
          {t("Open in", "Mở bằng")}
        </span>
        {RSS_READERS.map((reader) => (
          <Button key={reader.id} variant="secondary" size="sm" asChild>
            <a
              href={reader.href(url)}
              target={reader.id === "feed" ? undefined : "_blank"}
              rel="noopener noreferrer"
              onClick={() =>
                track("rss_subscribe", { target: reader.id, lang: feedLang })
              }
            >
              {reader.label}
            </a>
          </Button>
        ))}
      </div>
    </div>
  );
}

export function RssChannel({ lang }: { lang: Lang }) {
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  return (
    <ChannelSplit
      controls={
        <>
          <p className="text-base leading-relaxed text-muted-foreground">
            {t(
              "Follow AI;DR in the feed reader you already use. No account, no email.",
              "Theo dõi AI;DR bằng trình đọc RSS bạn đang dùng. Không cần tài khoản, không cần email."
            )}
          </p>
          <div className="space-y-3">
            {feedLangsFor(lang).map((feedLang) => (
              <FeedRow key={feedLang} lang={lang} feedLang={feedLang} />
            ))}
          </div>
        </>
      }
      preview={
        <div className="space-y-4 rounded-xl border border-border bg-card p-6">
          <Badge variant="secondary" className="gap-1.5 rounded-full">
            <Rss className="size-3.5" aria-hidden />
            {t("What's in the feed", "Bản tin có gì")}
          </Badge>
          <ul className="space-y-3">
            {FEED_FACTS.map((f) => (
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
        </div>
      }
    />
  );
}
