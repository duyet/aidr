/**
 * Shared class strings for the type roles in apps/web/DESIGN.md, so every
 * page sets its eyebrow, title and section heading the same way. Buttons use
 * `Button` / `buttonVariants` from @aidr/ui.
 */

/** 11px mono, uppercase, +0.1em, mute. Vietnamese pages swap the mono for
 * Inter in styles.css. */
export const EYEBROW =
  "font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground";

/** Display: the page h1. 24px on phones, 34px from 820px. */
export const PAGE_TITLE =
  "text-balance text-[24px] font-medium leading-[1.18] tracking-[-0.025em] text-foreground min-[820px]:text-[34px] min-[820px]:leading-[1.12]";

/** Section heading: 18px on phones, 20px from 640px. */
export const SECTION_TITLE =
  "text-[18px] font-semibold leading-[1.3] tracking-[-0.015em] text-foreground sm:text-[20px]";

/** The lead paragraph under a page title. */
export const PAGE_LEAD = "text-[16px] leading-[1.6] text-body";

/** A grouped-tools panel: card fill, hairline, 10px radius. */
export const PANEL = "rounded-lg border border-border bg-card";
