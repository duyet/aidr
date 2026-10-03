import { ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { dayArchiveOgPath } from "../lib/day-archive";
import type { Lang } from "../lib/types";

/**
 * The black "AI;DR hôm nay" chip in the digest masthead. Hover or focus asks
 * the parent to swap the bullet list for the day card (`DayCardOverlay`);
 * leaving brings the text back. Clicking opens the day page.
 */
export function DayCardChip({
  date,
  href,
  lang,
  onPreview,
}: {
  date: string;
  href: string;
  lang: Lang;
  onPreview: (open: boolean) => void;
}) {
  const label =
    lang === "vi" ? `Xem ảnh tóm tắt ngày ${date}` : `Preview the ${date} card`;
  return (
    <a
      href={href}
      aria-label={label}
      onPointerEnter={() => onPreview(true)}
      onPointerLeave={() => onPreview(false)}
      onFocus={() => onPreview(true)}
      onBlur={() => onPreview(false)}
      className="inline-flex items-center gap-1.5 bg-[#0a0a0a] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
    >
      <ImageIcon className="size-3.5" aria-hidden />
      <span className="hidden sm:inline">
        {lang === "vi" ? "AI;DR hôm nay" : "AI;DR daily"}
      </span>
    </a>
  );
}

/**
 * The day card laid over the digest content while the chip is hovered. The
 * image loads shortly after the page settles (or on first hover, if sooner)
 * and then stays mounted, so hovers show it instantly.
 */
export function DayCardOverlay({
  date,
  lang,
  open,
}: {
  date: string;
  lang: Lang;
  open: boolean;
}) {
  const [wanted, setWanted] = useState(false);
  if (open && !wanted) setWanted(true);
  // Warm the image once the page has settled, so the first hover is instant.
  useEffect(() => {
    const timer = setTimeout(() => setWanted(true), 2000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-card p-3 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${
        open ? "scale-100 opacity-100" : "scale-[0.98] opacity-0"
      }`}
    >
      {wanted ? (
        <img
          src={dayArchiveOgPath(date, lang)}
          alt=""
          width={1200}
          height={630}
          decoding="async"
          className="max-h-full w-auto max-w-full rounded-xl object-contain shadow-lg"
        />
      ) : null}
    </div>
  );
}
