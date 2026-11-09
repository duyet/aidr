import { Link } from "@tanstack/react-router";
import { track } from "../../lib/analytics/track";
import { useLang } from "../../lib/lang-context";
import type { Lang } from "../../lib/types";

export function Brand({ lang }: { lang: Lang }) {
  const navigationLang = useLang();
  return (
    <Link
      to="/"
      search={{ lang: navigationLang }}
      onClick={() => track("nav_click", { to: "/", placement: "header" })}
      className="flex min-w-0 shrink-0 items-center gap-2 rounded-md"
    >
      {/* The yellow ";" mark (DESIGN.md "Logo"). Decorative: the link's
          name stays "AI;DR". */}
      <span
        aria-hidden
        className="grid size-5 shrink-0 place-items-center rounded-[4px] bg-signal text-[calc(13px*var(--reader-font-size,1))] font-bold leading-none text-signal-ink"
      >
        ;
      </span>
      <span className="font-heading text-base font-semibold tracking-[-0.01em] text-foreground">
        AI;DR
      </span>
      {/* The tagline stays in the link's name for screen readers. On screen
          the nav links took its place: from 1024px the bar holds the nav,
          and the tagline next to it squeezed search to about 70px. */}
      <span className="sr-only">
        {lang === "vi"
          ? "Hôm nay AI có gì mới?"
          : "What's happening in AI today?"}
      </span>
    </Link>
  );
}
