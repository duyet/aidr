import { Link, useRouterState } from "@tanstack/react-router";
import { track } from "../../lib/analytics/track";
import { useLang } from "../../lib/lang-context";
import type { Lang } from "../../lib/types";
import { CalendarButton } from "./CalendarButton";
import { NAV_ITEMS } from "./lib";

// Below 1024px the bar is full, so the labels move to screen readers only.
const ITEM_CLASS =
  "inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:text-foreground motion-reduce:transition-none [&_svg]:size-[15px] [&_svg]:shrink-0 max-lg:[&>span]:sr-only";

/** Hôm nay, Tuần and Lịch. Lịch opens the month grid in a popover. */
export function HeaderNav({ lang }: { lang: Lang }) {
  const navigationLang = useLang();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const path = pathname.replace(/\/+$/, "") || "/";
  return (
    <nav
      aria-label={lang === "vi" ? "Chính" : "Main"}
      className="flex shrink-0 items-center gap-0.5"
    >
      {NAV_ITEMS.map((item) =>
        item.id === "/calendar" ? (
          <CalendarButton
            key={item.id}
            lang={lang}
            surface="popover"
            className={ITEM_CLASS}
          />
        ) : (
          <Link
            key={item.id}
            to={item.href}
            search={{ lang: navigationLang }}
            aria-current={path === item.href ? "page" : undefined}
            onClick={() =>
              track("nav_click", { to: item.id, placement: "header" })
            }
            className={ITEM_CLASS}
          >
            <item.icon aria-hidden />
            <span lang="en" className="leading-tight">
              {item.en}
            </span>
          </Link>
        )
      )}
    </nav>
  );
}
