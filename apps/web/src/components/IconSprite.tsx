import type { SVGProps } from "react";

/**
 * Icons a feed row repeats. Each row used to inline the full lucide <svg>
 * (three per row, ~400 bytes each); a row now points at one shared symbol.
 * Paths are lucide's (ISC), so the icons look the same.
 */
const SYMBOLS = {
  "external-link": [
    "M15 3h6v6",
    "M10 14 21 3",
    "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  ],
  "chevron-up": ["m18 15-6-6-6 6"],
  "chevron-down": ["m6 9 6 6 6-6"],
} as const;

export type SpriteIconName = keyof typeof SYMBOLS;

const symbolId = (name: SpriteIconName) => `icon-${name}`;

export function IconSprite() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      {(Object.keys(SYMBOLS) as SpriteIconName[]).map((name) => (
        <symbol
          key={name}
          id={symbolId(name)}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {SYMBOLS[name].map((d) => (
            <path key={d} d={d} />
          ))}
        </symbol>
      ))}
    </svg>
  );
}

/** One sprite icon. Keeps lucide's class names so styles and tests that
 * key off `lucide-<name>` still match. */
export function SpriteIcon({
  name,
  className,
  ...rest
}: { name: SpriteIconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={`lucide lucide-${name}${className ? ` ${className}` : ""}`}
      aria-hidden="true"
      {...rest}
    >
      <use href={`#${symbolId(name)}`} />
    </svg>
  );
}
