/**
 * One gap between the tab strip and a tab's first card, shared by every panel
 * so the rhythm cannot drift per tab. The Tabs primitive ships `mt-2`, which
 * reads as "glued to the tabs" on a full-width page; the panels override it
 * here instead of each picking its own value.
 */
export const TAB_PANEL = "mt-5";
