import { ErrorBoundary, Separator } from "@aidr/ui";
import { WIDE_HEADER_ROW_CLASS } from "../../lib/chrome";
import type { Lang } from "../../lib/types";
import { LangToggle } from "../LangToggle";
import { PrefsPanel } from "../PrefsPanel";
import { SearchBox } from "../SearchBox";
import { Brand } from "./Brand";
import { GetAIDRMenu } from "./GetAIDRMenu";
import { HeaderAuth } from "./HeaderAuth";

export function WideHeaderRow({
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
      className={`${WIDE_HEADER_ROW_CLASS} mx-auto max-w-[1080px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8`}
    >
      <Brand lang={lang} />
      <div className="min-w-0 flex-1">
        <SearchBox placeholder={searchPlaceholder} lang={lang} />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <GetAIDRMenu />
        <Separator orientation="vertical" className="mx-1 h-5" />
        <PrefsPanel />
        <LangToggle
          lang={lang}
          onChange={onLangChange}
          disabled={langToggleDisabled}
        />
        <ErrorBoundary fallback={null}>
          <HeaderAuth />
        </ErrorBoundary>
      </div>
    </div>
  );
}
