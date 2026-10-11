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
import { PHONE_TAP_TARGET_CLASS } from "../../lib/chrome";
import type { Lang } from "../../lib/types";
import { CalendarPanel } from "../calendar/CalendarPanel";

/**
 * Header calendar icon. On the wide header it opens a popover under the icon,
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
  const onOpenChange = (open: boolean) => {
    if (open) track("calendar_open", { surface });
  };

  if (surface === "sheet") {
    return (
      <Sheet onOpenChange={onOpenChange}>
        <SheetTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            title={label}
            aria-label={label}
            className={`${PHONE_TAP_TARGET_CLASS} rounded-xl bg-muted text-foreground hover:bg-muted/70`}
          >
            <CalendarDays aria-hidden />
          </Button>
        </SheetTrigger>
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
      <PopoverPrimitive.Trigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={label}
          aria-label={label}
        >
          <CalendarDays aria-hidden />
        </Button>
      </PopoverPrimitive.Trigger>
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
