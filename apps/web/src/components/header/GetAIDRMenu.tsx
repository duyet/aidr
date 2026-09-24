import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import { PHONE_GET_AIDR_TRIGGER_CLASS } from "../../lib/chrome";
import { EXTENSION_PATH, TELEGRAM_URL } from "../../lib/site";

export function GetAIDRMenu({ compact = false }: { compact?: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "icon-lg" : "sm"}
          className={compact ? PHONE_GET_AIDR_TRIGGER_CLASS : undefined}
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
            onClick={() => track("nav_click", { to: "/subscribe?tab=email" })}
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
          <Link to="/data" onClick={() => track("nav_click", { to: "/data" })}>
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
  );
}
