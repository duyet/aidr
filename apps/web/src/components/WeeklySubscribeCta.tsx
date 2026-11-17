import { Mail } from "lucide-react";
import { withLang } from "../lib/locale-url";
import type { Lang } from "../lib/types";
import { Bi } from "./Bi";

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
      className="my-6 flex flex-col gap-3 rounded-xl bg-muted px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5"
    >
      <div className="min-w-0">
        <Bi
          as="p"
          className="text-[15px] font-semibold leading-[1.4] text-foreground"
          vi="Nhận AI;DR Tuần vào sáng thứ Hai"
          en="Get AI;DR Weekly every Monday"
        />
        <Bi
          as="p"
          className="mt-1 text-[13px] text-muted-foreground"
          vi="Một email mỗi tuần với những tin AI đáng đọc nhất. Miễn phí, hủy bất cứ lúc nào."
          en="One email a week with the AI stories that mattered. Free, unsubscribe anytime."
        />
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          <Bi
            inline
            vi="Thích dùng trình đọc tin?"
            en="Prefer a feed reader?"
          />{" "}
          <a
            href={withLang(RSS_SUBSCRIBE_PATH, lang)}
            className="font-medium text-foreground underline underline-offset-4"
          >
            <Bi inline vi="Theo dõi qua RSS" en="Follow by RSS" />
          </a>
        </p>
      </div>
      <a href={weeklySubscribeHref(lang)} className="btn-primary">
        <Mail aria-hidden />
        <Bi inline vi="Đăng ký email tuần" en="Subscribe to the weekly email" />
      </a>
    </aside>
  );
}
