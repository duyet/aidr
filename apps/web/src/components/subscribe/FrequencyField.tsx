<<<<<<< HEAD
import {
  MAIL_FREQUENCIES,
  type MailFrequency,
  WEEKLY_DAYS,
  type WeeklyDay,
  weekdayName,
} from "../../lib/mail-frequency";
=======
import { MAIL_FREQUENCIES, type MailFrequency } from "../../lib/mail-frequency";
>>>>>>> origin/master
import type { Lang } from "../../lib/types";

const COPY: Record<
  MailFrequency,
  { title: { en: string; vi: string }; hint: { en: string; vi: string } }
> = {
  daily: {
    title: { en: "Daily", vi: "Hằng ngày" },
    hint: { en: "Every morning", vi: "Mỗi sáng" },
  },
  weekly: {
    title: { en: "Weekly", vi: "Hằng tuần" },
<<<<<<< HEAD
    hint: {
      en: "Best of 7 days, on your day",
      vi: "Tin hay nhất 7 ngày, vào ngày bạn chọn",
    },
=======
    hint: { en: "Monday recap of the week", vi: "Tổng hợp tuần, sáng thứ Hai" },
>>>>>>> origin/master
  },
};

/** Daily digest vs weekly edition, shared by the subscribe form and the
 *  settings page. Two cards rather than radios: it is the first choice a
 *  reader makes, so it should read as one. */
export function FrequencyField({
  lang,
  name,
  value,
  onChange,
<<<<<<< HEAD
  weeklyDay,
  onWeeklyDayChange,
=======
>>>>>>> origin/master
}: {
  lang: Lang;
  name: string;
  value: MailFrequency;
  onChange: (frequency: MailFrequency) => void;
<<<<<<< HEAD
  /** The weekday picker shows only for `weekly`. */
  weeklyDay: WeeklyDay;
  onWeeklyDayChange: (day: WeeklyDay) => void;
=======
>>>>>>> origin/master
}) {
  return (
    <fieldset className="text-sm">
      <legend className="mb-1 block font-medium">
        {lang === "vi" ? "Tần suất" : "How often"}
      </legend>
      <div className="grid grid-cols-2 gap-2">
        {MAIL_FREQUENCIES.map((frequency) => {
          const checked = value === frequency;
          return (
            <label
              key={frequency}
              className={`flex cursor-pointer flex-col rounded-md border px-3 py-2 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                checked
                  ? "border-accent bg-accent/10"
                  : "border-border hover:bg-muted/50"
              }`}
            >
              <input
                type="radio"
                name={name}
                value={frequency}
                checked={checked}
                onChange={() => onChange(frequency)}
                className="sr-only"
              />
              <span className="font-medium">{COPY[frequency].title[lang]}</span>
              <span className="text-xs text-muted-foreground">
                {COPY[frequency].hint[lang]}
              </span>
            </label>
          );
        })}
      </div>
<<<<<<< HEAD
      {value === "weekly" && (
        <div
          role="radiogroup"
          aria-label={lang === "vi" ? "Ngày nhận" : "Delivery day"}
          className="mt-3"
        >
          <span className="mb-1 block text-xs text-muted-foreground">
            {lang === "vi"
              ? "Nhận vào sáng (khoảng 7:00 giờ của bạn)"
              : "Arrives the morning of (around 7:00 your time)"}
          </span>
          <div className="grid grid-cols-7 gap-1">
            {WEEKLY_DAYS.map((day) => {
              const checked = weeklyDay === day;
              const full = weekdayName(day, lang);
              return (
                <label
                  key={day}
                  title={full}
                  className={`flex cursor-pointer items-center justify-center rounded-md border py-1.5 text-xs font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${
                    checked
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border hover:bg-muted/50"
                  }`}
                >
                  <input
                    type="radio"
                    name={`${name}-day`}
                    value={day}
                    checked={checked}
                    onChange={() => onWeeklyDayChange(day)}
                    aria-label={full}
                    className="sr-only"
                  />
                  <span aria-hidden>{shortDay(day, lang)}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </fieldset>
  );
}

const SHORT: Record<"en" | "vi", readonly string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  vi: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"],
};

function shortDay(day: WeeklyDay, lang: Lang): string {
  return SHORT[lang === "vi" ? "vi" : "en"][day] ?? "";
}
=======
    </fieldset>
  );
}
>>>>>>> origin/master
