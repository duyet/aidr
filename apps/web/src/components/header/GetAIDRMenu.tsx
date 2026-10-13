import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@aidr/ui";
import { Link } from "@tanstack/react-router";
import {
  ChevronDown,
  Database,
  ExternalLink,
  Info,
  Mail,
  Plus,
  Send,
  Workflow,
} from "lucide-react";
import { track } from "../../lib/analytics/track";
import {
  PHONE_DROPDOWN_ITEM_CLASS,
  PHONE_GET_AIDR_TRIGGER_CLASS,
} from "../../lib/chrome";
import { useLang } from "../../lib/lang-context";
import {
  EXTENSION_PATH,
  FACEBOOK_URL,
  TELEGRAM_EN_URL,
  TELEGRAM_URL,
} from "../../lib/site";
import { ChromeMark } from "./ChromeMark";
import { FacebookMark } from "./FacebookMark";

/** Trailing marker on the items that leave the site. It sits at the far edge
 *  of the row so it reads as "opens elsewhere" and never competes with the
 *  item's own leading icon for the label's attention. */
function ExternalMarker() {
  return <ExternalLink className="ml-auto !size-3 opacity-70" aria-hidden />;
}

export function GetAIDRMenu({ compact = false }: { compact?: boolean }) {
  const navigationLang = useLang();
  const itemClassName = compact ? PHONE_DROPDOWN_ITEM_CLASS : undefined;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={compact ? "icon-lg" : "sm"}
          className={compact ? PHONE_GET_AIDR_TRIGGER_CLASS : undefined}
          data-header-menu-trigger="get-ai-dr"
          title="Get AI;DR"
          aria-label="Get AI;DR menu"
        >
          <img
            src="/logo-icon.png"
            alt=""
            className="size-4 shrink-0 rounded"
            aria-hidden
          />
          {compact ? <span className="sr-only">Get AI;DR</span> : "Get AI;DR"}
          <ChevronDown
            aria-hidden
            className="!size-3.5 shrink-0 transition-transform group-data-[state=open]/button:rotate-180"
          />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild className={itemClassName}>
          <Link
            to={EXTENSION_PATH}
            search={{ lang: navigationLang }}
            onClick={() =>
              track("channel_click", {
                channel: "extension",
                placement: "header_menu",
              })
            }
          >
            <ChromeMark aria-hidden />
            Chrome Extension
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={itemClassName}>
          <a
            href={TELEGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              track("channel_click", {
                channel: "telegram",
                placement: "header_menu",
                lang: "vi",
              })
            }
          >
            <Send aria-hidden />
            Telegram Channel (Vietnamese)
            <ExternalMarker />
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={itemClassName}>
          <a
            href={TELEGRAM_EN_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              track("channel_click", {
                channel: "telegram",
                placement: "header_menu",
                lang: "en",
              })
            }
          >
            <Send aria-hidden />
            Telegram Channel (English)
            <ExternalMarker />
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={itemClassName}>
          <a
            href={FACEBOOK_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() =>
              track("channel_click", {
                channel: "facebook",
                placement: "header_menu",
                lang: "en",
              })
            }
          >
            <FacebookMark />
            Facebook Page
            <ExternalMarker />
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={itemClassName}>
          <Link
            to="/subscribe"
            search={{ tab: "email", lang: navigationLang }}
            onClick={() =>
              track("channel_click", {
                channel: "email",
                placement: "header_menu",
              })
            }
          >
            <Mail aria-hidden />
            Email Subscription
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className={itemClassName}>
          <Link
            to="/contribute"
            search={{ lang: navigationLang }}
            onClick={() =>
              track("nav_click", {
                to: "/contribute",
                placement: "header_menu",
              })
            }
          >
            <Plus aria-hidden />
            Contribute
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={itemClassName}>
          <Link
            to="/data"
            onClick={() =>
              track("nav_click", { to: "/data", placement: "header_menu" })
            }
          >
            <Database aria-hidden />
            Data Analytics
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={itemClassName}>
          <Link
            to="/data"
            search={{ tab: "algo" }}
            onClick={() =>
              track("nav_click", {
                to: "/data?tab=algo",
                placement: "header_menu",
              })
            }
          >
            <Workflow aria-hidden />
            Algorithms
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className={itemClassName}>
          <Link
            to="/about"
            search={{ lang: navigationLang }}
            onClick={() =>
              track("nav_click", { to: "/about", placement: "header_menu" })
            }
          >
            <Info aria-hidden />
            About
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
