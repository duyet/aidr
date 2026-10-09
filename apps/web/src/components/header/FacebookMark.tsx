import type { SVGProps } from "react";

/** Facebook mark for the social channel: the rounded-square tile with the
 *  "f" reversed out of it. A local fill SVG, for the same reason as
 *  `ChromeMark` — `lucide-react` dropped its brand icons, so there is no
 *  glyph to import and the site should not carry a second icon package for it.
 *
 *  Filled rather than stroked like `ChromeMark`, because the Facebook mark is
 *  a solid tile: stroking it at this size leaves a hollow, unreadable "f".
 *  `DropdownMenuItem` sizes it via `[&_svg]:size-4`, so it lands on the same
 *  box as the `lucide-react` icons beside it.
 *
 *  Decorative by default — every call site sits next to a label — so
 *  `aria-hidden` is on unless the caller overrides it. */
export function FacebookMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden
      focusable="false"
      className={className}
      {...props}
    >
      <path d="M24 12.073C24 5.446 18.627 0 12 0S0 5.446 0 12.073c0 5.989 4.388 10.953 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.026 24 18.062 24 12.073Z" />
    </svg>
  );
}
