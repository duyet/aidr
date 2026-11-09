/**
 * Shared class strings for the type roles in apps/web/DESIGN.md, so every
 * page sets its eyebrow, title and section heading the same way. Sizes
 * scale with `--reader-font-size` (the prefs Text size slider) and
 * leading with `--reader-leading` (Density), like every other reader page.
 */

/** 11px mono, uppercase, +0.1em, mute. Vietnamese pages swap the mono for
 * Inter in styles.css. */
export const EYEBROW =
  "font-mono text-[calc(11px*var(--reader-font-size,1))] uppercase tracking-[0.1em] text-muted-foreground";

/** Display: the page h1. 24px on phones, 34px from 820px. */
export const PAGE_TITLE =
  "text-balance text-[calc(24px*var(--reader-font-size,1))] font-medium leading-[1.18] tracking-[-0.025em] text-foreground min-[820px]:text-[calc(34px*var(--reader-font-size,1))] min-[820px]:leading-[1.12]";

/** Section heading: 18px on phones, 20px from 640px. */
export const SECTION_TITLE =
  "text-[calc(18px*var(--reader-font-size,1))] font-semibold leading-[1.3] tracking-[-0.015em] text-foreground sm:text-[calc(20px*var(--reader-font-size,1))]";

/** The lead paragraph under a page title. */
export const PAGE_LEAD =
  "text-[calc(16px*var(--reader-font-size,1))] leading-(--reader-leading,1.6) text-body";

/** A grouped-tools panel: card fill, hairline, 10px radius. */
export const PANEL = "rounded-lg border border-border bg-card";
