import type { CSSProperties } from "react";
import { categoryLabel } from "../lib/lang";
import { categoryColor } from "../lib/topic-color";
import type { Lang } from "../lib/types";

/**
 * A compact, readable category label with a deterministic theme-aware accent.
 * The text remains the source of truth; color is only a secondary cue. The
 * category-colored class mixes the palette with the active foreground so it
 * stays readable on reader and muted surfaces. When a selected surface needs
 * high-contrast button text, `colored={false}` keeps the label readable while
 * `dot` retains the category accent.
 */
export function CategoryLabel({
  name,
  lang,
  className,
  colored = true,
  dot = false,
}: {
  name: string | null | undefined;
  lang: Lang;
  className?: string;
  colored?: boolean;
  dot?: boolean;
}) {
  if (!name) return null;

  const color = categoryColor(name);
  const style = {
    "--tc-light": color.light,
    "--tc-dark": color.dark,
  } as CSSProperties;

  return (
    <span
      className={["inline-flex items-center gap-1.5", className]
        .filter(Boolean)
        .join(" ")}
      style={style}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className="category-filter-dot size-1.5 shrink-0 rounded-full"
        />
      ) : null}
      <span className={colored ? "category-colored" : undefined}>
        {categoryLabel(name, lang)}
      </span>
    </span>
  );
}
