import { ArrowRight, MailOpen, Rss } from "lucide-react";
import { withLang } from "../lib/locale-url";
import type { Lang } from "../lib/types";

export const WEEKLY_SUBSCRIBE_PATH = "/subscribe?tab=email&freq=weekly";
const RSS_SUBSCRIBE_PATH = "/subscribe?tab=rss";

export function weeklySubscribeHref(lang: Lang): string {
  return withLang(WEEKLY_SUBSCRIBE_PATH, lang);
}

/**
 * The weekly-email strip: a newspaper double rule, one black masthead mark,
 * plain copy and one solid action. The icon lifts and the arrow nudges on
 * hover; `motion-reduce` stills both.
 */
export function WeeklySubscribeCta({ lang }: { lang: Lang }) {
  const vi = lang === "vi";
  return (
    <aside
      aria-label={vi ? "Đăng ký bản tin tuần" : "Subscribe to the weekly email"}
      className="group my-8 flex flex-col gap-4 border-y-2 border-foreground py-5 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-4">
        <span
          aria-hidden
          className="relative grid size-12 shrink-0 place-items-center rounded-sm bg-foreground text-background transition-transform duration-300 ease-out group-hover:-translate-y-0.5 motion-reduce:transition-none"
        >
          <MailOpen className="size-5" strokeWidth={1.75} />
          {/* The AI;DR signal dot — one yellow spot, never decoration. */}
          <span className="absolute top-1 right-1 size-1.5 rounded-full bg-signal" />
        </span>
        <div className="min-w-0">
          <p className="font-serif text-xl font-semibold leading-snug">
            {vi
              ? "Nhận AI;DR Tuần Này vào sáng thứ Hai"
              : "Get AI;DR Weekly every Monday"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {vi
              ? "Một email mỗi tuần với những tin AI đáng đọc nhất. Miễn phí, hủy bất cứ lúc nào."
              : "One email each week with the AI stories that mattered. Free, unsubscribe anytime."}
          </p>
          <a
            href={withLang(RSS_SUBSCRIBE_PATH, lang)}
            className="mt-1.5 inline-flex items-center gap-1.5 text-sm text-muted-foreground underline decoration-border underline-offset-4 transition-colors hover:text-foreground hover:decoration-foreground"
          >
            <Rss className="size-3.5" aria-hidden />
            {vi ? "Theo dõi qua RSS" : "Prefer RSS? Follow the feed"}
          </a>
        </div>
      </div>
      <a
        href={weeklySubscribeHref(lang)}
        className="inline-flex shrink-0 items-center justify-center gap-2 bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-opacity hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground"
      >
        {vi ? "Đăng ký bản tin tuần" : "Subscribe to the weekly email"}
        <ArrowRight
          aria-hidden
          className="size-4 transition-transform duration-300 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
        />
      </a>
    </aside>
  );
}
