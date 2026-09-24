import {
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
import {
  ChevronDown,
  Database,
  Mail,
  Plus,
  Send,
  Workflow,
} from "lucide-react";
import { WIDE_HEADER_ROW_CLASS } from "../../lib/chrome";
import { EXTENSION_PATH, TELEGRAM_URL } from "../../lib/site";
import type { Lang } from "../../lib/types";
import { LangToggle } from "../LangToggle";
import { PrefsPanel } from "../PrefsPanel";
import { SearchBox } from "../SearchBox";
import { Brand } from "./Brand";
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              title="Get AI;DR"
              aria-label="Get AI;DR menu"
            >
              <img
                src="/logo-icon.png"
                alt=""
                className="size-4 rounded"
                aria-hidden
              />
              Get AI;DR
              <ChevronDown
                aria-hidden
                className="transition-transform group-data-[state=open]/button:rotate-180"
              />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link
                to={EXTENSION_PATH}
                onClick={() => track("nav_click", { to: EXTENSION_PATH })}
              >
                <RiChromeLine aria-hidden />
                Chrome Extension
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
                Telegram Channel (Vietnamese)
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                to="/subscribe"
                search={{ tab: "email" }}
                onClick={() =>
                  track("nav_click", { to: "/subscribe?tab=email" })
                }
              >
                <Mail aria-hidden />
                Email Subscription
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
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
                to="/data"
                onClick={() => track("nav_click", { to: "/data" })}
              >
                <Database aria-hidden />
                Data Analytics
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                to="/data"
                search={{ tab: "algo" }}
                onClick={() => track("nav_click", { to: "/data?tab=algo" })}
              >
                <Workflow aria-hidden />
                Algorithms
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
          <HeaderAuth />
        </ErrorBoundary>
      </div>
    </div>
  );
}
