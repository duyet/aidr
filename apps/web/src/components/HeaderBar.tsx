import { useRouterState } from "@tanstack/react-router";
import type { Lang } from "../lib/types";
import { CompactHeaderRow } from "./header/CompactRow";
import { isLangToggleDisabledPath } from "./header/lib";
import { WideHeaderRow } from "./header/WideRow";

export function HeaderBar({
  lang,
  onLangChange,
}: {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const langToggleDisabled = isLangToggleDisabledPath(pathname);
  const searchPlaceholder = lang === "vi" ? "Tìm kiếm..." : "Search AI news...";

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur-md transition-[background-color,border-color] duration-150">
      <WideHeaderRow
        lang={lang}
        onLangChange={onLangChange}
        langToggleDisabled={langToggleDisabled}
        searchPlaceholder={searchPlaceholder}
      />
      <CompactHeaderRow
        lang={lang}
        onLangChange={onLangChange}
        langToggleDisabled={langToggleDisabled}
        searchPlaceholder={searchPlaceholder}
      />
    </header>
  );
}
