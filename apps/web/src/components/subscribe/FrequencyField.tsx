import { MAIL_FREQUENCIES, type MailFrequency } from "../../lib/mail-frequency";
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
    hint: { en: "Monday recap of the week", vi: "Tổng hợp tuần, sáng thứ Hai" },
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
}: {
  lang: Lang;
  name: string;
  value: MailFrequency;
  onChange: (frequency: MailFrequency) => void;
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
    </fieldset>
  );
}
