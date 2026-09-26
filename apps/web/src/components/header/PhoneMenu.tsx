import { Button, ErrorBoundary } from "@aidr/ui";
import { track, trackChannelClick } from "@aidr/ui/track";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { useRef, useState } from "react";
import {
  PHONE_LANG_TOGGLE_BUTTON_CLASS,
  PHONE_MENU_DIALOG_CLASS,
  PHONE_MENU_GRID_CLASS,
  PHONE_MENU_LINK_CLASS,
  PHONE_TAP_TARGET_CLASS,
} from "../../lib/chrome";
import { useLang } from "../../lib/lang-context";
import type { Lang } from "../../lib/types";
import { LangToggle } from "../LangToggle";
import { HeaderAuth } from "./HeaderAuth";
import { SITE_LINKS } from "./lib";

const HEADER_MENU_TRIGGER_SELECTOR = "[data-header-menu-trigger]";

function isVisible(element: HTMLElement): boolean {
  if (!element.isConnected) return false;

  let current: HTMLElement | null = element;
  while (current) {
    if (current.hidden) return false;
    const style = window.getComputedStyle(current);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    current = current.parentElement;
  }
  return true;
}

function focusVisibleHeaderTrigger(preferred?: HTMLElement | null) {
  if (typeof document === "undefined") return;

  const candidates = [
    preferred,
    ...Array.from(
      document.querySelectorAll<HTMLElement>(HEADER_MENU_TRIGGER_SELECTOR)
    ),
  ];
  const target = candidates.find((candidate): candidate is HTMLElement =>
    Boolean(candidate && isVisible(candidate))
  );
  target?.focus();
}

export function PhoneMenu({
  lang,
  onLangChange,
  langToggleDisabled,
}: {
  lang: Lang;
  onLangChange: (lang: Lang) => void;
  langToggleDisabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const navigationLang = useLang();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const getLinkClass = (active: boolean) =>
    `${PHONE_MENU_LINK_CLASS} ${
      active
        ? "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80"
        : "hover:bg-muted"
    }`;

  const trackLinkClick = (link: (typeof SITE_LINKS)[number]) => {
    if (link.channel) {
      trackChannelClick(link.channel, { to: link.href });
    } else {
      track("nav_click", { to: link.href });
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen} modal>
      <DialogPrimitive.Trigger asChild>
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          size="icon-lg"
          className={PHONE_TAP_TARGET_CLASS}
          data-header-menu-trigger="phone"
          aria-label="Open menu"
          aria-controls="mobile-menu-dialog"
          aria-expanded={open}
          aria-haspopup="dialog"
        >
          <Menu aria-hidden />
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          data-testid="mobile-menu-backdrop"
          className="fixed inset-0 z-50 bg-black/30"
          onPointerDown={() => setOpen(false)}
        />
        <DialogPrimitive.Content
          id="mobile-menu-dialog"
          className={PHONE_MENU_DIALOG_CLASS}
          aria-modal="true"
          aria-labelledby="mobile-menu-title"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            closeRef.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            focusVisibleHeaderTrigger(triggerRef.current);
          }}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4 min-[600px]:px-6">
            <DialogPrimitive.Title asChild>
              <h2
                id="mobile-menu-title"
                className="font-serif text-lg font-medium tracking-tight"
              >
                AI;DR
              </h2>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button
                ref={closeRef}
                type="button"
                variant="ghost"
                size="icon-lg"
                className={PHONE_TAP_TARGET_CLASS}
                aria-label="Close menu"
              >
                <X aria-hidden />
              </Button>
            </DialogPrimitive.Close>
          </div>
          <nav aria-label="Mobile navigation" className={PHONE_MENU_GRID_CLASS}>
            {SITE_LINKS.map((link) => {
              const active = link.internal && pathname === link.href;
              const linkClass = getLinkClass(active);
              return link.internal ? (
                <Link
                  key={link.href}
                  to={link.href}
                  search={{ lang: navigationLang }}
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    trackLinkClick(link);
                    setOpen(false);
                  }}
                  className={linkClass}
                >
                  <link.icon aria-hidden />
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => {
                    trackLinkClick(link);
                    setOpen(false);
                  }}
                  className={linkClass}
                  rel={
                    link.href.startsWith("http")
                      ? "noopener noreferrer"
                      : undefined
                  }
                  target={link.href.startsWith("http") ? "_blank" : undefined}
                >
                  <link.icon aria-hidden />
                  {link.label}
                </a>
              );
            })}
          </nav>
          <div className="mt-auto space-y-3 border-t border-border p-4">
            <div className="flex min-h-[52px] items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {lang === "vi" ? "Ngôn ngữ" : "Language"}
              </span>
              <LangToggle
                lang={lang}
                onChange={onLangChange}
                disabled={langToggleDisabled}
                buttonClassName={PHONE_LANG_TOGGLE_BUTTON_CLASS}
              />
            </div>
            <ErrorBoundary fallback={null}>
              <HeaderAuth
                avatarSize="size-9"
                stacked
                onSignIn={() => setOpen(false)}
              />
            </ErrorBoundary>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
