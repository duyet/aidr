import { useRouterState } from "@tanstack/react-router";
import {
  createDrawerController,
  type DrawerController,
} from "@ui-sdk/react/drawer";
import { useState } from "react";
import type { Lang } from "../lib/types";
import { CompactHeaderRow } from "./header/CompactRow";
import { isLangToggleDisabledPath } from "./header/lib";
import { PhoneMenu } from "./header/PhoneMenu";
import { TabBar } from "./header/TabBar";
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
  const [menu] = useState<DrawerController>(createDrawerController);

  return (
    <>
      <header className="sticky top-0 z-40 bg-background">
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
          menu={menu}
        />
      </header>
      <TabBar lang={lang} menu={menu} />
      <PhoneMenu
        controller={menu}
        lang={lang}
        onLangChange={onLangChange}
        langToggleDisabled={langToggleDisabled}
      />
    </>
  );
}
