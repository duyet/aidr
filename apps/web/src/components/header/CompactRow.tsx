import { Button } from "@aidr/ui";
import { track } from "@aidr/ui/track";
import { RiChromeLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import { Send } from "lucide-react";
import {
  COMPACT_CHROME_CLASS,
  PHONE_PREFS_TRIGGER_CLASS,
  PHONE_TAP_TARGET_CLASS,
} from "../../lib/chrome";
import { EXTENSION_PATH, TELEGRAM_URL } from "../../lib/site";
import type { Lang } from "../../lib/types";
import { PrefsPanel } from "../PrefsPanel";
import { SearchBox } from "../SearchBox";
import { Brand } from "./Brand";
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
        <Button
          variant="ghost"
          size="icon-lg"
          className={PHONE_TAP_TARGET_CLASS}
          asChild
        >
          <Link
            to={EXTENSION_PATH}
            onClick={() => track("nav_click", { to: EXTENSION_PATH })}
            aria-label="Get AI;DR"
          >
            <RiChromeLine aria-hidden />
          </Link>
        </Button>
        <Button
          variant="ghost"
          size="icon-lg"
          className={PHONE_TAP_TARGET_CLASS}
          asChild
        >
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => track("nav_click", { to: "telegram" })}
            aria-label="Telegram"
          >
            <Send aria-hidden />
          </a>
        </Button>
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
