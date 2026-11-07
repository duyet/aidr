import { buttonVariants } from "@aidr/ui";
import { Mail } from "lucide-react";
import { withLang } from "../lib/locale-url";
import { PANEL } from "../lib/page-style";
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
      className={`${PANEL} my-6 flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-[18px]`}
    >
      <div className="min-w-0">
        <p className="text-[15px] font-semibold leading-[1.4] text-foreground">
          {vi
            ? "Nhận AI;DR Tuần vào sáng thứ Hai"
            : "Get AI;DR Weekly every Monday"}
        </p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {vi
            ? "Một email mỗi tuần với những tin AI đáng đọc nhất. Miễn phí, hủy bất cứ lúc nào."
            : "One email a week with the AI stories that mattered. Free, unsubscribe anytime."}
        </p>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
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
        className={buttonVariants({
          className: "max-sm:h-11 text-[13px]",
        })}
      >
        <Mail className="size-4" aria-hidden />
        {vi ? "Đăng ký email tuần" : "Subscribe to the weekly email"}
      </a>
    </aside>
  );
}
