import { Badge, Button } from "@aidr/ui";
import { Languages, Newspaper, ShieldCheck } from "lucide-react";
import { track } from "../../lib/analytics/track";
import { FACEBOOK_URL } from "../../lib/site";
import type { Lang } from "../../lib/types";
import { ChannelSplit } from "./ChannelSplit";

/** Facebook "f" mark; lucide ships no brand icons. */
export function FacebookMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden
    >
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07c0 6.03 4.39 11.02 10.13 11.93v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.97h-1.51c-1.49 0-1.96.93-1.96 1.89v2.25h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07Z" />
    </svg>
  );
}

const FACEBOOK_FEATURES = [
  {
    icon: Newspaper,
    en: "Each edition posted to the Page as it publishes.",
    vi: "Mỗi số báo được đăng lên Trang ngay khi phát hành.",
  },
  {
    icon: Languages,
    en: "Posts are in English.",
    vi: "Bài đăng bằng tiếng Anh.",
  },
  {
    icon: ShieldCheck,
    en: "Follow the Page, no sign-up on aidr.today.",
    vi: "Theo dõi Trang, không cần đăng ký trên aidr.today.",
  },
] as const;

const PAGE_PLUGIN_SRC = `https://www.facebook.com/plugins/page.php?${new URLSearchParams(
  {
    href: FACEBOOK_URL,
    tabs: "timeline",
    width: "500",
    height: "640",
    small_header: "true",
    hide_cover: "false",
    show_facepile: "false",
  }
).toString()}`;

export function FacebookChannel({ lang }: { lang: Lang }) {
  const t = (en: string, vi: string) => (lang === "vi" ? vi : en);
  return (
    <ChannelSplit
      controls={
        <>
          <p className="text-base leading-relaxed text-muted-foreground">
            {t(
              "Get the ranked AI news in your Facebook feed. Follow the AI;DR Page.",
              "Nhận tin AI đã xếp hạng ngay trên bảng tin Facebook. Theo dõi Trang AI;DR."
            )}
          </p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            {FACEBOOK_FEATURES.map((f) => (
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
          <Button size="lg" className="w-full" asChild>
            <a
              href={FACEBOOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                track("channel_click", {
                  channel: "facebook",
                  placement: "subscribe_page",
                  lang: "en",
                })
              }
            >
              <FacebookMark className="mr-2 size-5" />
              {t("Follow AI;DR on Facebook", "Theo dõi AI;DR trên Facebook")}
            </a>
          </Button>
        </>
      }
      preview={
        <div className="space-y-4">
          <Badge variant="secondary" className="rounded-full">
            {t("Latest posts on the Page", "Bài mới trên Trang")}
          </Badge>
          <iframe
            title={t("AI;DR Facebook Page", "Trang Facebook AI;DR")}
            src={PAGE_PLUGIN_SRC}
            loading="lazy"
            width="500"
            height="640"
            className="w-full max-w-[500px] rounded-xl border border-border bg-muted"
            allow="encrypted-media"
          />
        </div>
      }
    />
  );
}
