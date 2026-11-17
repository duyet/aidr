import { Sheet, SheetContent, SheetTitle } from "@aidr/ui";
import { useRouterState } from "@tanstack/react-router";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "@ui-sdk/react/popover";
import { CalendarDays } from "lucide-react";
import {
  type MouseEvent,
  type ReactNode,
  useId,
  useRef,
  useState,
} from "react";
import { track } from "../../lib/analytics/track";
import { calendarPath } from "../../lib/calendar";
import type { Lang } from "../../lib/types";
import { CalendarPanel } from "../calendar/CalendarPanel";

function isModifiedClick(event: Event | MouseEvent | undefined): boolean {
  if (!event || !("button" in event)) return false;
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

/**
 * Lịch / Calendar: a link to `/calendar` that works before hydration and
 * without JS, and a modified click still opens it in a new tab. A plain click
 * opens the month heat grid instead: a popover in the menu bar, a bottom
 * sheet from the phone tab bar.
 */
export function CalendarButton({
  lang,
  surface,
  className,
}: {
  lang: Lang;
  surface: "popover" | "sheet";
  className: string;
}) {
  const label = lang === "vi" ? "Lịch các số báo" : "Browse past editions";
  const href = calendarPath(undefined, lang);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const current = pathname.replace(/\/+$/, "") === "/calendar";
  const [open, setOpen] = useState(false);

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (next) track("calendar_open", { placement: surface });
  };
  const onClick = (e: MouseEvent) => {
    if (isModifiedClick(e)) return;
    e.preventDefault();
    changeOpen(!open);
  };
  const body = (
    <>
      <CalendarDays aria-hidden />
      <span lang="en" className="leading-tight">
        Calendar
      </span>
    </>
  );

  if (surface === "sheet") {
    return (
      <SheetCalendar
        lang={lang}
        label={label}
        href={href}
        open={open}
        onOpenChange={changeOpen}
        onClick={onClick}
        className={className}
        current={current}
      >
        {body}
      </SheetCalendar>
    );
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        if (next && isModifiedClick(details.event)) {
          details.cancel();
          return;
        }
        changeOpen(next);
      }}
    >
      <PopoverTrigger
        render={<a href={href} />}
        title={label}
        aria-current={current ? "page" : undefined}
        onClick={onClick}
        className={className}
      >
        {body}
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="start"
        sideOffset={8}
        collisionPadding={12}
        className="w-[300px] max-w-[calc(100vw-1.5rem)] rounded-2xl border-0 bg-popover p-3 text-popover-foreground shadow-xl outline-none"
      >
        <PopoverTitle className="sr-only">{label}</PopoverTitle>
        <CalendarPanel lang={lang} surface="popover" />
      </PopoverContent>
    </Popover>
  );
}

// CalendarPanel's sheet close button is a Radix SheetClose, so the phone
// surface stays on the Radix Sheet until the panel moves to ui-sdk.
function SheetCalendar({
  lang,
  label,
  href,
  open,
  onOpenChange,
  onClick,
  className,
  current,
  children,
}: {
  lang: Lang;
  label: string;
  href: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClick: (e: MouseEvent) => void;
  className: string;
  current: boolean;
  children: ReactNode;
}) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const panelId = useId();
  return (
    <>
      <a
        ref={linkRef}
        href={href}
        title={label}
        aria-current={current ? "page" : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={onClick}
        className={className}
      >
        {children}
      </a>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          id={panelId}
          side="bottom"
          showCloseButton={false}
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            linkRef.current?.focus();
          }}
          className="rounded-t-2xl border-0 px-4 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        >
          <SheetTitle className="sr-only">{label}</SheetTitle>
          <CalendarPanel lang={lang} surface="sheet" />
        </SheetContent>
      </Sheet>
    </>
  );
}
