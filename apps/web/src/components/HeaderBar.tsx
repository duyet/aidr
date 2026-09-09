import { AuthButtons, Button, ErrorBoundary, Separator } from "@aidr/ui";
import { track } from "@aidr/ui/track";
import { RiChromeLine } from "@remixicon/react";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, Plus, Send } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  COMPACT_CHROME_CLASS,
  PHONE_PREFS_TRIGGER_CLASS,
  PHONE_TAP_TARGET_CLASS,
  WIDE_HEADER_ROW_CLASS,
} from "../lib/chrome";
import { useClerkModule } from "../lib/clerk-user";
import { DUYET_URL, EXTENSION_PATH, TELEGRAM_URL } from "../lib/site";
import type { Lang } from "../lib/types";
import { LangToggle } from "./LangToggle";
import { PrefsPanel } from "./PrefsPanel";
import { SearchBox } from "./SearchBox";

// Routes whose content is English-only — the EN|VI toggle is disabled
// while on one of these, rather than offering a translation that doesn't
// exist.
const LANG_TOGGLE_DISABLED_PATHS = new Set(["/data", "/about", "/mail"]);

const SITE_LINKS = [
  { href: "/", label: "News", internal: true },
  { href: "/about", label: "About", internal: true },
  { href: "/mcp", label: "MCP", internal: true },
  { href: "/subscribe", label: "Subscribe", internal: true },
  { href: "/extension", label: "Get AI;DR", internal: true },
  { href: TELEGRAM_URL, label: "Telegram", internal: false },
  { href: "/data", label: "Data", internal: true },
  { href: "/submit", label: "Submit", internal: true },
  { href: DUYET_URL, label: "duyet.net", internal: false },
] as const;

function Brand({ lang }: { lang: Lang }) {
  return (
    <Link
      to="/"
      onClick={() => track("nav_click", { to: "/" })}
      className="flex min-w-0 shrink-0 items-baseline gap-2"
    >
      <span className="font-serif text-lg font-medium tracking-tight text-foreground">
        AI;DR
      </span>
      <span className="hidden truncate text-sm text-muted-foreground xl:inline">
        {lang === "vi"
          ? "Hôm nay AI có gì mới?"
          : "What's happening in AI today?"}
      </span>
    </Link>
  );
}

function PhoneMenu({
  lang,
  onLangChange,
  langToggleDisabled,
}: {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  langToggleDisabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { mod: clerkModule } = useClerkModule();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const linkClass =
    "flex h-11 w-full items-center rounded-xl px-3 text-sm hover:bg-muted";

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={PHONE_TAP_TARGET_CLASS}
        aria-label="Open menu"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <Menu aria-hidden />
      </Button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-50">
              <button
                type="button"
                className="absolute inset-0 bg-black/30"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              />
              <div
                role="dialog"
                aria-modal="true"
                aria-label="Menu"
                className="absolute inset-y-0 right-0 flex w-[min(20rem,85vw)] flex-col border-l border-border bg-card text-card-foreground shadow-2xl"
              >
                <div className="border-b border-border px-6 py-5 font-serif text-lg font-medium tracking-tight">
                  AI;DR
                </div>
                <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-3 py-3">
                  {SITE_LINKS.map((link) =>
                    link.internal ? (
                      <Link
                        key={link.href}
                        to={link.href}
                        onClick={() => {
                          track("nav_click", { to: link.href });
                          setOpen(false);
                        }}
                        className={linkClass}
                      >
                        {link.label}
                      </Link>
                    ) : (
                      <a
                        key={link.href}
                        href={link.href}
                        onClick={() => {
                          track("nav_click", { to: link.href });
                          setOpen(false);
                        }}
                        className={linkClass}
                        rel={
                          link.href.startsWith("http")
                            ? "noopener noreferrer"
                            : undefined
                        }
                        target={
                          link.href.startsWith("http") ? "_blank" : undefined
                        }
                      >
                        {link.label}
                      </a>
                    )
                  )}
                </nav>
                <div className="mt-auto space-y-3 border-t border-border p-4">
                  <div className="flex h-11 items-center justify-between">
                    <span className="text-xs text-muted-foreground">
                      {lang === "vi" ? "Ngôn ngữ" : "Language"}
                    </span>
                    <LangToggle
                      lang={lang}
                      onChange={onLangChange}
                      disabled={langToggleDisabled}
                      buttonClassName="min-h-[36px] min-w-[44px] px-3"
                    />
                  </div>
                  <ErrorBoundary fallback={null}>
                    <AuthButtons
                      wrapWithProvider={false}
                      clerkModule={clerkModule}
                      avatarSize="size-9"
                      stacked
                    />
                  </ErrorBoundary>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}

export function HeaderBar({
  lang,
  onLangChange,
}: {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // The single app-wide <ClerkProvider> lives in __root.tsx; hand AuthButtons
  // that exact module so it never renders Clerk primitives before the
  // provider is mounted.
  const { mod: clerkModule } = useClerkModule();
  const langToggleDisabled = LANG_TOGGLE_DISABLED_PATHS.has(pathname);
  const searchPlaceholder = lang === "vi" ? "Tìm kiếm..." : "Search AI news...";

  return (
    <header className="sticky top-0 z-40 border-b border-border/80 bg-background/80 backdrop-blur-md transition-[background-color,border-color] duration-150">
      <div
        className={`${WIDE_HEADER_ROW_CLASS} mx-auto max-w-[1080px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8`}
      >
        <Brand lang={lang} />
        <div className="min-w-0 flex-1">
          <SearchBox placeholder={searchPlaceholder} lang={lang} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden sm:inline-flex"
            asChild
          >
            <a
              href={TELEGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => track("nav_click", { to: "telegram" })}
              aria-label="Telegram"
              title="Telegram"
            >
              <Send aria-hidden />
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden sm:inline-flex"
            asChild
          >
            <Link
              to={EXTENSION_PATH}
              onClick={() => track("nav_click", { to: EXTENSION_PATH })}
              aria-label="Get AI;DR"
              title="Get AI;DR"
            >
              <RiChromeLine aria-hidden />
            </Link>
          </Button>
          <Button variant="default" size="sm" asChild>
            <Link
              to="/submit"
              onClick={() => track("nav_click", { to: "/submit" })}
              title="Submit"
              aria-label="Submit"
            >
              <Plus aria-hidden />
            </Link>
          </Button>
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

      <div
        className={`${COMPACT_CHROME_CLASS} mx-auto max-w-[1080px] items-center gap-1.5 px-3 py-2`}
      >
        <Brand lang={lang} />
        <div className="min-w-0 flex-1">
          <SearchBox placeholder={searchPlaceholder} lang={lang} compact />
        </div>
        <Button
          variant="ghost"
          size="icon"
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
          size="icon"
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
    </header>
  );
}
