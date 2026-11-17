/** 44px tap target; p-0 + 20px SVG so compact header glyphs sit centered. */
const PHONE_TAP_TARGET_CLASS =
  "inline-flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center p-0 leading-none [&_svg]:block [&_svg]:size-5";

export const PHONE_PREFS_TRIGGER_CLASS = `${PHONE_TAP_TARGET_CLASS} rounded-full text-sm font-semibold leading-none text-muted-foreground hover:bg-muted hover:text-foreground`;
