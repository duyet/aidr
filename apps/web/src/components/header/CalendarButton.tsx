import {
  Button,
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@aidr/ui";
import { track } from "@aidr/ui/track";
import { CalendarDays } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";
import type { MouseEvent, ReactNode } from "react";
import { calendarPath } from "../../lib/calendar";
import { PHONE_TAP_TARGET_CLASS } from "../../lib/chrome";
import type { Lang } from "../../lib/types";
import { CalendarPanel } from "../calendar/CalendarPanel";

/**
 * Keeps a plain click from navigating; modified clicks keep the link. It sits
 * on a wrapper so it runs after the Radix trigger, which skips its toggle for
 * an event that is already default-prevented.
 */
function PlainClickOnly({ children }: { children: ReactNode }) {
  const onClick = (e: MouseEvent) => {
    if (e.button === 0 && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)) {
      e.preventDefault();
    }
  };
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: display:contents wrapper, the link inside is the control
    <span className="contents" onClick={onClick}>
      {children}
    </span>
  );
}

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
  const onOpenChange = (open: boolean) => {
    if (open) track("calendar_open", { surface });
  };

  if (surface === "sheet") {
    return (
      <Sheet onOpenChange={onOpenChange}>
        <PlainClickOnly>
          <SheetTrigger asChild>
            <Button
              asChild
              variant="ghost"
              title={label}
              className={`${PHONE_TAP_TARGET_CLASS} rounded-xl bg-muted text-foreground hover:bg-muted/70`}
            >
              <a href={href} aria-label={label}>
                <CalendarDays aria-hidden />
              </a>
            </Button>
          </SheetTrigger>
        </PlainClickOnly>
        <SheetContent
          side="bottom"
          showCloseButton={false}
          aria-describedby={undefined}
          className="rounded-t-2xl px-4 pt-5 pb-6"
        >
          <SheetTitle className="sr-only">{label}</SheetTitle>
          <CalendarPanel lang={lang} surface="sheet" />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <PopoverPrimitive.Root onOpenChange={onOpenChange}>
      <PlainClickOnly>
        <PopoverPrimitive.Trigger asChild>
          <Button asChild variant="ghost" size="icon-sm" title={label}>
            <a href={href} aria-label={label}>
              <CalendarDays aria-hidden />
            </a>
          </Button>
        </PopoverPrimitive.Trigger>
      </PlainClickOnly>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={8}
          aria-label={label}
          className="z-50 w-[300px] max-w-[calc(100vw-1.5rem)] rounded-2xl border border-border bg-popover p-3 text-popover-foreground shadow-xl"
        >
          <CalendarPanel lang={lang} surface="popover" />
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
