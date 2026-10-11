import { Button } from "@aidr/ui";
import { CalendarDays } from "lucide-react";
import { calendarPath } from "../../lib/calendar";
import type { Lang } from "../../lib/types";

/** Wide-header link to the past-editions calendar (`/calendar`). */
export function CalendarButton({ lang }: { lang: Lang }) {
  const label = lang === "vi" ? "Lịch các số báo" : "Browse past editions";
  return (
    <Button asChild variant="ghost" size="icon-sm" title={label}>
      <a href={calendarPath(undefined, lang)} aria-label={label}>
        <CalendarDays aria-hidden />
      </a>
    </Button>
  );
}
