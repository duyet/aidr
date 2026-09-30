import { MAIL_FORMATS, type MailFormat } from "../../lib/mail-format";
import type { Lang } from "../../lib/types";

const LABELS: Record<MailFormat, { en: string; vi: string }> = {
  "no-images": { en: "No images", vi: "Không hình" },
  design: { en: "Thumbnails", vi: "Hình nhỏ" },
  large: { en: "Large images", vi: "Hình lớn" },
  text: { en: "Plain text", vi: "Chỉ chữ" },
};

/** Digest layout picker, shared by the subscribe form and the settings page. */
export function MailFormatField({
  lang,
  name,
  value,
  onChange,
}: {
  lang: Lang;
  name: string;
  value: MailFormat;
  onChange: (format: MailFormat) => void;
}) {
  return (
    <fieldset className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
      <legend className="mb-1 block font-medium">
        {lang === "vi" ? "Bố cục" : "Layout"}
      </legend>
      {MAIL_FORMATS.map((format) => (
        <label key={format} className="flex items-center gap-1.5">
          <input
            type="radio"
            name={name}
            checked={value === format}
            onChange={() => onChange(format)}
          />
          {LABELS[format][lang]}
        </label>
      ))}
    </fieldset>
  );
}
