/** 44px tap target; p-0 + 20px SVG so compact header glyphs sit centered. */
export const PHONE_TAP_TARGET_CLASS =
  "inline-flex h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 items-center justify-center p-0 leading-none [&_svg]:block [&_svg]:size-5";

export const PHONE_PREFS_TRIGGER_CLASS = `${PHONE_TAP_TARGET_CLASS} rounded-full text-sm font-semibold leading-none text-muted-foreground hover:bg-muted hover:text-foreground`;

export const PHONE_GET_AIDR_TRIGGER_CLASS = `${PHONE_TAP_TARGET_CLASS} gap-0.5 border border-border/80 bg-muted/60 p-1.5 text-foreground shadow-sm hover:bg-muted data-[state=open]:bg-muted`;

export const PHONE_DROPDOWN_ITEM_CLASS = "h-11 min-h-11 min-w-[44px]";

export const PHONE_LANG_TOGGLE_BUTTON_CLASS = "min-h-[44px] min-w-[44px] px-3";

/** Full-screen phone navigation uses the browser's default safe viewport. */
export const PHONE_MENU_DIALOG_CLASS =
  "fixed z-50 mx-auto flex max-w-3xl flex-col rounded-3xl border border-border bg-card text-card-foreground shadow-2xl";

/** One column on narrow phones; two balanced columns from the landscape breakpoint. */
export const PHONE_MENU_GRID_CLASS =
  "grid min-h-0 flex-1 auto-rows-fr grid-cols-1 gap-1.5 overflow-y-auto px-4 py-4 min-[600px]:grid-cols-2 min-[600px]:gap-2 min-[600px]:px-6 min-[600px]:py-5";

/** Large, readable navigation targets that still collapse to one column on phones. */
export const PHONE_MENU_LINK_CLASS =
  "flex min-h-12 w-full items-center gap-3 rounded-2xl border border-transparent px-4 text-[0.9375rem] transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 focus-visible:outline-none min-[600px]:min-h-14 min-[600px]:gap-4 min-[600px]:px-5 min-[600px]:text-base [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground min-[600px]:[&_svg]:size-[22px]";

/** SiteHeader + desktop HeaderBar — hidden on narrow or short (landscape phone) viewports. */
export const WIDE_CHROME_CLASS = "news-wide-chrome";

/** Combined phone chrome with a visible search field. */
export const COMPACT_CHROME_CLASS = "news-compact-chrome";

export const WIDE_HEADER_ROW_CLASS = "news-wide-row";
