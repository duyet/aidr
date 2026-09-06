import { Button } from "@aidr/ui";
import type { Lang } from "../lib/types";

export function LangToggle({
  lang,
  onChange,
  disabled,
  buttonClassName,
}: {
  lang: Lang;
  onChange: (lang: Lang) => void;
  disabled?: boolean;
  buttonClassName?: string;
}) {
  return (
    <div
      className={`inline-flex items-center rounded-2xl border border-border p-0.5 ${
        disabled ? "cursor-not-allowed opacity-50" : ""
      }`}
      title={
        disabled
          ? lang === "vi"
            ? "Trang này chỉ có tiếng Anh"
            : "English only"
          : undefined
      }
    >
      {(["en", "vi"] as Lang[]).map((l) => (
        <Button
          key={l}
          type="button"
          variant={lang === l ? "secondary" : "ghost"}
          size="xs"
          disabled={disabled}
          onClick={() => onChange(l)}
          className={`uppercase ${buttonClassName ?? ""} ${
            disabled ? "cursor-not-allowed" : ""
          }`}
          aria-pressed={lang === l}
        >
          {l}
        </Button>
      ))}
    </div>
  );
}
