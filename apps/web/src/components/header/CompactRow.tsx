import {
  COMPACT_CHROME_CLASS,
  PHONE_PREFS_TRIGGER_CLASS,
} from "../../lib/chrome";
import type { Lang } from "../../lib/types";
import { PrefsPanel } from "../PrefsPanel";
import { SearchBox } from "../SearchBox";
import { Brand } from "./Brand";
import { GetAIDRMenu } from "./GetAIDRMenu";
import { PhoneMenu } from "./PhoneMenu";

export function CompactHeaderRow({
  lang,
  onLangChange,
  langToggleDisabled,
  searchPlaceholder,
}: {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  langToggleDisabled: boolean;
  searchPlaceholder: string;
}) {
  return (
    <div
      className={`${COMPACT_CHROME_CLASS} mx-auto max-w-[1080px] items-center gap-2 px-3 py-1.5`}
    >
      <Brand lang={lang} />
      <div className="flex min-w-0 flex-1 items-center gap-1">
        <div className="min-w-0 flex-1">
          <SearchBox placeholder={searchPlaceholder} lang={lang} compact />
        </div>
        <GetAIDRMenu compact />
        <PrefsPanel triggerClassName={PHONE_PREFS_TRIGGER_CLASS} />
        <PhoneMenu
          lang={lang}
          onLangChange={onLangChange}
          langToggleDisabled={langToggleDisabled}
        />
      </div>
    </div>
  );
}
