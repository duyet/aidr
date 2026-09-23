import { track } from "@aidr/ui/track";
import { Link } from "@tanstack/react-router";
import type { Lang } from "../../lib/types";

export function Brand({ lang }: { lang: Lang }) {
  return (
    <Link
      to="/"
      onClick={() => track("nav_click", { to: "/" })}
      className="flex min-w-0 shrink-0 items-baseline gap-2"
    >
      <span className="font-serif text-lg font-medium tracking-tight text-foreground">
        AI;DR
      </span>
      <span className="hidden truncate text-sm text-muted-foreground xl:inline">
        {lang === "vi"
          ? "Hôm nay AI có gì mới?"
          : "What's happening in AI today?"}
      </span>
    </Link>
  );
}
