/**
 * One gap between the tab strip and a tab's first card, shared by every panel
 * so the rhythm cannot drift per tab. The Tabs primitive ships `mt-2` and the
 * panels used to override it with a mix of `mt-0` (flush against the strip)
 * and `mt-4`; `mt-5` is one step of the page's own `space-y-6` scale, so the
 * gap reads as a deliberate break rather than a missing margin.
 */
export const TAB_PANEL = "mt-5";
