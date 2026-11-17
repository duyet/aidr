import type { ElementType, ReactNode } from "react";
import { useLang } from "../lib/lang-context";
import { usePrefs } from "../lib/prefs";

const has = (text: ReactNode | null | undefined): text is ReactNode =>
  text !== null && text !== undefined && text !== "";

/**
 * One language, or both when bilingual mode is on. The leading language is
 * full size and the other sits under it, smaller and muted. A missing
 * language renders nothing: Vietnamese and English text never fill in for
 * each other.
 */
export function Bi({
  vi,
  en,
  as: Tag = "span",
  className,
  inline = false,
}: {
  vi?: ReactNode | null;
  en?: ReactNode | null;
  as?: ElementType;
  className?: string;
  /** Short labels: "Đăng ký / Subscribe" on one line instead of stacked. */
  inline?: boolean;
}) {
  const lang = useLang();
  const { prefs } = usePrefs();
  const text = { vi, en };
  const lead = prefs.bilingual ? prefs.bilingualFirst : lang;
  const second = lead === "vi" ? "en" : "vi";

  if (!prefs.bilingual || !has(text[second])) {
    return has(text[lead]) ? (
      <Tag className={className} lang={lead}>
        {text[lead]}
      </Tag>
    ) : null;
  }
  if (!has(text[lead])) {
    return (
      <Tag className={className} lang={second}>
        {text[second]}
      </Tag>
    );
  }
  if (inline) {
    return (
      <Tag className={className}>
        <span lang={lead}>{text[lead]}</span>{" "}
        <span className="bi-sep" aria-hidden>
          /
        </span>{" "}
        <span lang={second}>{text[second]}</span>
      </Tag>
    );
  }
  return (
    <Tag className={className}>
      <span lang={lead} className="block">
        {text[lead]}
      </span>{" "}
      <span lang={second} className="bi-second block">
        {text[second]}
      </span>
    </Tag>
  );
}
