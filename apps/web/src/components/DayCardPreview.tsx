import { ImageIcon } from "lucide-react";
import { useState } from "react";
import { dayArchiveOgPath } from "../lib/day-archive";
import type { Lang } from "../lib/types";

/**
 * Image icon beside the digest date. Hover, focus or tap pops up that day's
 * card (`/api/og/date/…`) with a quick fade-and-rise; clicking opens the day
 * page. The image is requested on first intent only, so the homepage pays
 * nothing until someone reaches for it.
 */
export function DayCardPreview({
  date,
  href,
  lang,
}: {
  date: string;
  href: string;
  lang: Lang;
}) {
  const [open, setOpen] = useState(false);
  const [wanted, setWanted] = useState(false);
  const show = () => {
    setWanted(true);
    setOpen(true);
  };
  const label =
    lang === "vi" ? `Xem ảnh tóm tắt ngày ${date}` : `Preview the ${date} card`;
  return (
    <span className="relative inline-flex">
      <a
        href={href}
        onPointerEnter={show}
        onPointerLeave={() => setOpen(false)}
        onFocus={show}
        onBlur={() => setOpen(false)}
        aria-label={label}
        title={label}
        className="inline-flex items-center gap-1.5 bg-[#0a0a0a] px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-white transition-transform hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
      >
        <ImageIcon className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">
          {lang === "vi" ? "AI;DR hôm nay" : "AI;DR daily"}
        </span>
      </a>
      <span
        aria-hidden
        className={`pointer-events-none absolute right-0 top-full z-50 mt-2 w-[min(28rem,85vw)] origin-top-right overflow-hidden rounded-xl border border-border/80 bg-[#f5c518] shadow-xl transition-all duration-150 ease-out motion-reduce:transition-none ${
          open
            ? "translate-y-0 scale-100 opacity-100"
            : "-translate-y-1 scale-95 opacity-0"
        }`}
      >
        {wanted ? (
          <img
            src={dayArchiveOgPath(date, lang)}
            alt=""
            width={1200}
            height={630}
            decoding="async"
            className="block aspect-[1200/630] h-auto w-full"
          />
        ) : (
          <span className="block aspect-[1200/630] w-full" />
        )}
      </span>
    </span>
  );
}
