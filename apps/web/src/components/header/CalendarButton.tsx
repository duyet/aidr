import { Button, Sheet, SheetContent, SheetTitle } from "@aidr/ui";
import { track } from "@aidr/ui/track";
import { CalendarDays } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import { type MouseEvent, useId, useRef, useState } from "react";
import { calendarPath } from "../../lib/calendar";
import { PHONE_TAP_TARGET_CLASS } from "../../lib/chrome";
import type { Lang } from "../../lib/types";
import { CalendarPanel } from "../calendar/CalendarPanel";

/**
 * Header calendar icon, a link to `/calendar` that works before hydration and
 * without JS. On the wide header it opens a popover under the icon,
 * on the compact (phone) header a bottom sheet. Both hold the same month heat
 * grid, fetched when first opened.
 */
export function CalendarButton({
  lang,
  surface,
}: {
  lang: Lang;
  surface: "popover" | "sheet";
}) {
  const label = lang === "vi" ? "Lịch các số báo" : "Browse past editions";
  const href = calendarPath(undefined, lang);
  const [open, setOpen] = useState(false);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const panelId = useId();

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (next) track("calendar_open", { surface });
  };
  const onClick = (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }
    e.preventDefault();
    changeOpen(!open);
  };
  const returnFocus = (e: Event) => {
    e.preventDefault();
    linkRef.current?.focus();
  };

  const link = (
    <Button
      asChild
      variant="ghost"
      title={label}
      {...(surface === "sheet"
        ? {
            className: `${PHONE_TAP_TARGET_CLASS} rounded-xl bg-muted text-foreground hover:bg-muted/70`,
          }
        : { size: "icon-sm" as const })}
    >
      <a
        ref={linkRef}
        href={href}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={onClick}
      >
        <CalendarDays aria-hidden />
      </a>
    </Button>
  );

  if (surface === "sheet") {
    return (
      <>
        {link}
        <Sheet open={open} onOpenChange={changeOpen}>
          <SheetContent
            id={panelId}
            side="bottom"
            showCloseButton={false}
            aria-describedby={undefined}
            onCloseAutoFocus={returnFocus}
            className="rounded-t-2xl px-4 pt-5 pb-6"
          >
            <SheetTitle className="sr-only">{label}</SheetTitle>
            <CalendarPanel lang={lang} surface="sheet" />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={changeOpen}>
      <PopoverPrimitive.Anchor asChild>{link}</PopoverPrimitive.Anchor>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          id={panelId}
          align="end"
          sideOffset={8}
          aria-label={label}
          onCloseAutoFocus={returnFocus}
          onInteractOutside={(e) => {
            if (linkRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
          className="z-50 w-[300px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-xl"
        >
          <CalendarPanel lang={lang} surface="popover" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
