import { ErrorBoundary } from "@aidr/ui";
import type { Lang } from "../../lib/types";
import { LangToggle } from "../LangToggle";
import { PrefsPanel } from "../PrefsPanel";
import { SearchBox } from "../SearchBox";
import { Brand } from "./Brand";
import { GetAIDRMenu } from "./GetAIDRMenu";
import { HeaderAuth } from "./HeaderAuth";
import { HeaderNav } from "./HeaderNav";
import { IntroVideoButton } from "./IntroVideo";
import { LayoutSwitch } from "./LayoutSwitch";

/** The menu bar from 700px: logo, nav, search, Aa, layout, language, the
 *  AI;DR button and sign-in. */
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
    <div className="mx-auto hidden h-[52px] max-w-[1080px] items-center gap-2 px-4 min-[700px]:flex sm:px-6 lg:gap-3 lg:px-8 [[data-layout=compact]_&]:h-12">
      <Brand lang={lang} />
      <HeaderNav lang={lang} />
      <div className="min-w-0 flex-1">
        <SearchBox placeholder={searchPlaceholder} lang={lang} />
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <PrefsPanel
          onLangChange={onLangChange}
          langDisabled={langToggleDisabled}
        />
        <LayoutSwitch />
        <LangToggle
          lang={lang}
          onChange={onLangChange}
          disabled={langToggleDisabled}
        />
        <GetAIDRMenu />
        <IntroVideoButton lang={lang} />
        <ErrorBoundary fallback={null}>
          <HeaderAuth />
        </ErrorBoundary>
      </div>
    </div>
  );
}
