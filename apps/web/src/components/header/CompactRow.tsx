import type { DrawerController } from "@ui-sdk/react/drawer";
import { PHONE_PREFS_TRIGGER_CLASS } from "../../lib/chrome";
import type { Lang } from "../../lib/types";
import { PrefsPanel } from "../PrefsPanel";
import { SearchBox } from "../SearchBox";
import { Brand } from "./Brand";
import { PhoneMenuTrigger } from "./PhoneMenu";

/** The phone menu bar under 700px: logo, search, Aa and the AI;DR button.
 *  Today, Weeks and Calendar live in the tab bar. */
export function CompactHeaderRow({
  lang,
  onLangChange,
  langToggleDisabled,
  searchPlaceholder,
  menu,
}: {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  langToggleDisabled: boolean;
  searchPlaceholder: string;
  menu: DrawerController;
}) {
  return (
    <div className="flex h-12 items-center gap-1 px-3 min-[700px]:hidden">
      <Brand lang={lang} />
      <div className="min-w-0 flex-1">
        <SearchBox placeholder={searchPlaceholder} lang={lang} compact />
      </div>
      <PrefsPanel
        onLangChange={onLangChange}
        langDisabled={langToggleDisabled}
        triggerClassName={PHONE_PREFS_TRIGGER_CLASS}
      />
      <PhoneMenuTrigger
        controller={menu}
        className="btn-primary h-9 shrink-0 gap-[7px] pr-3 pl-2"
      />
    </div>
  );
}
