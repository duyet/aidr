import { Link, useRouterState } from "@tanstack/react-router";
import type { DrawerController } from "@ui-sdk/react/drawer";
import { track } from "../../lib/analytics/track";
import { useLang } from "../../lib/lang-context";
import type { Lang } from "../../lib/types";
import { Bi } from "../Bi";
import { CalendarButton } from "./CalendarButton";
import { NAV_ITEMS } from "./lib";
import { PhoneMenuTrigger } from "./PhoneMenu";

const TAB_CLASS =
  "flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-center text-[11px] font-medium text-muted-foreground transition-colors aria-[current=page]:text-foreground motion-reduce:transition-none [&_svg]:size-[18px] [&_svg]:shrink-0";

/** Today, Weeks, Calendar and AI;DR, fixed to the bottom under 700px. */
export function TabBar({ lang, menu }: { lang: Lang; menu: DrawerController }) {
  const navigationLang = useLang();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const path = pathname.replace(/\/+$/, "") || "/";
  return (
    <nav
      aria-label={lang === "vi" ? "Thanh điều hướng" : "Tab bar"}
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgb(0_0_0/0.06)] backdrop-blur-md min-[700px]:hidden"
    >
      {NAV_ITEMS.map((item) =>
        item.id === "/calendar" ? (
          <CalendarButton
            key={item.id}
            lang={lang}
            surface="sheet"
            className={TAB_CLASS}
          />
        ) : (
          <Link
            key={item.id}
            to={item.href}
            search={{ lang: navigationLang }}
            aria-current={path === item.href ? "page" : undefined}
            onClick={() =>
              track("nav_click", { to: item.id, placement: "tab_bar" })
            }
            className={TAB_CLASS}
          >
            <item.icon aria-hidden />
            <span lang="en" className="leading-tight">
              {item.en}
            </span>
          </Link>
        )
      )}
      <PhoneMenuTrigger controller={menu} className={TAB_CLASS} />
    </nav>
  );
}
