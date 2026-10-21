import { Mail } from "lucide-react";
import { withLang } from "../lib/locale-url";
import type { Lang } from "../lib/types";

export const WEEKLY_SUBSCRIBE_PATH = "/subscribe?tab=email&freq=weekly";
const RSS_SUBSCRIBE_PATH = "/subscribe?tab=rss";

export function weeklySubscribeHref(lang: Lang): string {
  return withLang(WEEKLY_SUBSCRIBE_PATH, lang);
}

export function WeeklySubscribeCta({ lang }: { lang: Lang }) {
  const vi = lang === "vi";
  return (
    <aside
      aria-label={vi ? "Đăng ký bản tin tuần" : "Subscribe to the weekly email"}
      className="my-8 flex flex-col gap-4 border-y-2 border-foreground py-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="min-w-0">
        <p className="font-serif text-xl font-semibold">
          {vi
            ? "Nhận AI;DR Tuần vào sáng thứ Hai"
            : "Get AI;DR Weekly every Monday"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {vi
            ? "Một email mỗi tuần với những tin AI đáng đọc nhất. Miễn phí, hủy bất cứ lúc nào."
            : "One email a week with the AI stories that mattered. Free, unsubscribe anytime."}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {vi ? "Thích dùng trình đọc tin? " : "Prefer a feed reader? "}
          <a
            href={withLang(RSS_SUBSCRIBE_PATH, lang)}
            className="font-medium text-foreground underline underline-offset-4"
          >
            {vi ? "Theo dõi qua RSS" : "Follow by RSS"}
          </a>
        </p>
      </div>
      <a
        href={weeklySubscribeHref(lang)}
        className="inline-flex shrink-0 items-center justify-center gap-2 bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        <Mail className="size-4" aria-hidden />
        {vi ? "Đăng ký email tuần" : "Subscribe to the weekly email"}
      </a>
    </aside>
  );
}
