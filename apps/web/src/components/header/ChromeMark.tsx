import type { SVGProps } from "react";

/** Chrome mark for the extension channel: outer ring, center circle, and the
 *  three segment dividers. A local stroke SVG so the site does not carry a
 *  second icon package for one glyph.
 *
 *  Decorative by default — every call site sits next to a label — so
 *  `aria-hidden` is on unless the caller overrides it. */
export function ChromeMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={className}
      {...props}
    >
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 8h9.17" />
      <path d="M15.46 14 10.88 21.94" />
      <path d="M8.54 14 3.95 6.06" />
    </svg>
  );
}
