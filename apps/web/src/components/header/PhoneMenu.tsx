import { Button, ErrorBoundary } from "@aidr/ui";
import { track } from "@aidr/ui/track";
import { Link, useRouterState } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  PHONE_MENU_DIALOG_CLASS,
  PHONE_MENU_GRID_CLASS,
  PHONE_MENU_LINK_CLASS,
  PHONE_TAP_TARGET_CLASS,
} from "../../lib/chrome";
import type { Lang } from "../../lib/types";
import { LangToggle } from "../LangToggle";
import { HeaderAuth } from "./HeaderAuth";
import { SITE_LINKS } from "./lib";

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!open) {
      if (wasOpen.current) {
        wasOpen.current = false;
        triggerRef.current?.focus();
      }
      return;
    }

    wasOpen.current = true;
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

  const getLinkClass = (active: boolean) =>
    `${PHONE_MENU_LINK_CLASS} ${
      active
        ? "border-border bg-secondary text-secondary-foreground hover:bg-secondary/80"
        : "hover:bg-muted"
    }`;

  return (
    <>
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="icon-lg"
        className={PHONE_TAP_TARGET_CLASS}
        aria-label="Open menu"
        aria-controls="mobile-menu-dialog"
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
                tabIndex={-1}
                className="absolute inset-0 bg-black/30"
                aria-label="Close menu"
                onClick={() => setOpen(false)}
              />
              <div
                id="mobile-menu-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="mobile-menu-title"
                className={PHONE_MENU_DIALOG_CLASS}
              >
                <div className="flex items-center justify-between border-b border-border px-5 py-4 min-[600px]:px-6">
                  <h2
                    id="mobile-menu-title"
                    className="font-serif text-lg font-medium tracking-tight"
                  >
                    AI;DR
                  </h2>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    className={PHONE_TAP_TARGET_CLASS}
                    aria-label="Close menu"
                    autoFocus
                    onClick={() => setOpen(false)}
                  >
                    <X aria-hidden />
                  </Button>
                </div>
                <nav
                  aria-label="Mobile navigation"
                  className={PHONE_MENU_GRID_CLASS}
                >
                  {SITE_LINKS.map((link) => {
                    const active = link.internal && pathname === link.href;
                    const linkClass = getLinkClass(active);
                    return link.internal ? (
                      <Link
                        key={link.href}
                        to={link.href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => {
                          track("nav_click", { to: link.href });
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
                        <link.icon aria-hidden />
                        {link.label}
                      </a>
                    );
                  })}
                </nav>
                <div className="news-mobile-menu-footer mt-auto space-y-3 border-t border-border p-4">
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
                    <HeaderAuth avatarSize="size-9" stacked />
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
