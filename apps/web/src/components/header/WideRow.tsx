import {
  AuthButtons,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  ErrorBoundary,
  Separator,
} from "@aidr/ui";
import { track } from "@aidr/ui/track";
import { RiChromeLine } from "@remixicon/react";
import { Link } from "@tanstack/react-router";
import { Database, Plus, Send } from "lucide-react";
import { WIDE_HEADER_ROW_CLASS } from "../../lib/chrome";
import { useClerkModule } from "../../lib/clerk-user";
import { EXTENSION_PATH, TELEGRAM_URL } from "../../lib/site";
import type { Lang } from "../../lib/types";
import { LangToggle } from "../LangToggle";
import { PrefsPanel } from "../PrefsPanel";
import { SearchBox } from "../SearchBox";
import { Brand } from "./Brand";

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
  // The single app-wide <ClerkProvider> lives in __root.tsx; hand AuthButtons
  // that exact module so it never renders Clerk primitives before the
  // provider is mounted.
  const { mod: clerkModule } = useClerkModule();

  return (
    <div
      className={`${WIDE_HEADER_ROW_CLASS} mx-auto max-w-[1080px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8`}
    >
      <Brand lang={lang} />
      <div className="min-w-0 flex-1">
        <SearchBox placeholder={searchPlaceholder} lang={lang} />
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="default"
              size="sm"
              title="Menu"
              aria-label="Menu"
            >
              <Plus aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link
                to="/submit"
                onClick={() => track("nav_click", { to: "/submit" })}
              >
                <Plus aria-hidden />
                Submit
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                to={EXTENSION_PATH}
                onClick={() => track("nav_click", { to: EXTENSION_PATH })}
              >
                <RiChromeLine aria-hidden />
                Get AI;DR
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a
                href={TELEGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => track("nav_click", { to: "telegram" })}
              >
                <Send aria-hidden />
                Telegram
              </a>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link
                to="/data"
                onClick={() => track("nav_click", { to: "/data" })}
              >
                <Database aria-hidden />
                Data
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Separator orientation="vertical" className="mx-1 h-5" />
        <PrefsPanel />
        <LangToggle
          lang={lang}
          onChange={onLangChange}
          disabled={langToggleDisabled}
        />
        <ErrorBoundary fallback={null}>
          <AuthButtons
            wrapWithProvider={false}
            clerkModule={clerkModule}
            avatarSize="size-7"
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}
