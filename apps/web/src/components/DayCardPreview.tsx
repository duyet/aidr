import { AlignLeft, ImageIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { dayArchiveOgPath } from "../lib/day-archive";
import type { Lang } from "../lib/types";

/**
 * Image | text switch in the digest masthead, styled like the 8 | 12 count
 * pills beside it. "Image" swaps the bullet list for the day card
 * (`DayCardView`); "text" brings the list back.
 */
export function DayCardViewSwitch({
  lang,
  showImage,
  onChange,
}: {
  lang: Lang;
  showImage: boolean;
  onChange: (showImage: boolean) => void;
}) {
  const views = [
    {
      image: true,
      Icon: ImageIcon,
      label: lang === "vi" ? "Xem ảnh tóm tắt" : "Show day card",
    },
    {
      image: false,
      Icon: AlignLeft,
      label: lang === "vi" ? "Xem dạng chữ" : "Show text",
    },
  ];
  return (
    <fieldset
      aria-label={lang === "vi" ? "Kiểu hiển thị" : "View"}
      className="m-0 flex min-w-0 gap-1 rounded-full border-0 bg-[#0a0a0a]/10 p-0.5"
    >
      {views.map(({ image, Icon, label }) => {
        const active = showImage === image;
        return (
          <button
            key={label}
            type="button"
            aria-pressed={active}
            aria-label={label}
            title={label}
            onClick={() => onChange(image)}
            className={`inline-flex h-6 w-8 items-center justify-center rounded-full transition-[background-color,color] duration-150 ${
              active
                ? "bg-[#0a0a0a] text-white"
                : "text-[#0a0a0a]/70 hover:text-[#0a0a0a]"
            }`}
          >
            <Icon className="size-3.5" aria-hidden />
          </button>
        );
      })}
    </fieldset>
  );
}

/**
 * The day card shown in place of the bullet list while the image view is
 * on, at the full body width (capped so it fits the screen). The image loads
 * shortly after the page settles (or on first switch, if sooner) and then
 * stays mounted, so switching shows it instantly.
 */
export function DayCardView({
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
    <div hidden={!open} className={open ? "flex justify-center" : "hidden"}>
      {wanted ? (
        <img
          src={dayArchiveOgPath(date, lang)}
          alt={
            lang === "vi"
              ? `Ảnh tóm tắt AI;DR ngày ${date}`
              : `AI;DR card for ${date}`
          }
          width={1200}
          height={630}
          decoding="async"
          className="h-auto max-h-[min(70vh,630px)] w-auto max-w-full rounded-xl object-contain shadow-lg"
        />
      ) : null}
    </div>
  );
}
