import { AuthButtons, Button, ErrorBoundary } from "@aidr/ui";
import { track } from "@aidr/ui/track";
import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PHONE_TAP_TARGET_CLASS } from "../../lib/chrome";
import { useClerkModule } from "../../lib/clerk-user";
import type { Lang } from "../../lib/types";
import { LangToggle } from "../LangToggle";
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
    "flex h-12 w-full items-center gap-3 rounded-xl px-3 text-[0.9375rem] hover:bg-muted [&_svg]:size-[18px] [&_svg]:shrink-0 [&_svg]:text-muted-foreground";

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
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
                className="absolute inset-3 flex flex-col rounded-3xl border border-border bg-card text-card-foreground shadow-2xl"
              >
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <span className="font-serif text-lg font-medium tracking-tight">
                    AI;DR
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-lg"
                    className={PHONE_TAP_TARGET_CLASS}
                    aria-label="Close menu"
                    onClick={() => setOpen(false)}
                  >
                    <X aria-hidden />
                  </Button>
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
