import { Link, useRouterState } from "@tanstack/react-router";
import type { NavTarget } from "../../lib/analytics/events";
import { track } from "../../lib/analytics/track";
import { useLang } from "../../lib/lang-context";
import type { Lang } from "../../lib/types";

/** The few routes the wide header names inline (DESIGN.md "Header"). Every
 *  other destination stays in the phone menu and the footer. */
export const HEADER_NAV: {
  id: NavTarget;
  href: "/weeks";
  en: string;
  vi: string;
}[] = [{ id: "/weeks", href: "/weeks", en: "Weekly", vi: "Bản tin tuần" }];

/** Muted links, the current page in the foreground color. Shown from the
 *  `lg` breakpoint; below it the row is full and the phone menu has them. */
export function HeaderNav({ lang }: { lang: Lang }) {
  const navigationLang = useLang();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const path = pathname.replace(/\/+$/, "") || "/";
  return (
    <nav
      aria-label={lang === "vi" ? "Chính" : "Main"}
      className="hidden shrink-0 items-center gap-4 text-[calc(13px*var(--reader-font-size,1))] lg:flex"
    >
      {HEADER_NAV.map((item) => {
        const current = path === item.href;
        return (
          <Link
            key={item.href}
            to={item.href}
            search={{ lang: navigationLang }}
            aria-current={current ? "page" : undefined}
            onClick={() =>
              track("nav_click", { to: item.id, placement: "header" })
            }
            className={`whitespace-nowrap rounded-sm transition-colors hover:text-foreground ${
              current ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {lang === "vi" ? item.vi : item.en}
          </Link>
        );
      })}
    </nav>
  );
}
