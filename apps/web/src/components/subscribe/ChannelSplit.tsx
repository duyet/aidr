import type { ReactNode } from "react";

/**
 * Two-column layout for one delivery channel: the copy, the CTA and the
 * controls on the left, the preview on the right. Changing a control on the
 * left re-renders the preview beside it, so the setting and its result are
 * read in one glance instead of scrolled past each other.
 *
 * Below `lg` the columns collapse and the preview follows the controls —
 * a side-by-side pair that narrow would squeeze the preview into an
 * unreadable strip.
 */
export function ChannelSplit({
  controls,
  preview,
}: {
  controls: ReactNode;
  preview: ReactNode;
}) {
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12">
      <div className="space-y-6">{controls}</div>
      {/* Sticky so a long control column scrolls past a preview that stays put. */}
      <div className="min-w-0 lg:sticky lg:top-20">{preview}</div>
    </div>
  );
}
