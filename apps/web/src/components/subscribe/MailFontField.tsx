import { MAIL_FONTS, type MailFont } from "../../lib/mail-font";
import type { Lang } from "../../lib/types";

const LABELS: Record<MailFont, { en: string; vi: string }> = {
  sans: { en: "Sans", vi: "Không chân" },
  serif: { en: "Serif headlines", vi: "Tiêu đề có chân" },
};

export function MailFontField({
  lang,
  name,
  value,
  onChange,
}: {
  lang: Lang;
  name: string;
  value: MailFont;
  onChange: (font: MailFont) => void;
}) {
  return (
    <fieldset className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      <legend className="mb-1 block font-medium">
        {lang === "vi" ? "Phông chữ" : "Font"}
      </legend>
      {MAIL_FONTS.map((font) => (
        <label key={font} className="flex items-center gap-1.5">
          <input
            type="radio"
            name={name}
            checked={value === font}
            onChange={() => onChange(font)}
          />
          {LABELS[font][lang]}
        </label>
      ))}
    </fieldset>
  );
}
