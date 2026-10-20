import { AlignLeft, ImageIcon } from "lucide-react";
import { useState } from "react";
import { dayArchiveOgPath } from "../lib/day-archive";
import type { Lang } from "../lib/types";

export function DayCardViewSwitch({
  lang,
  showImage,
  onChange,
  onIntent,
}: {
  lang: Lang;
  showImage: boolean;
  onChange: (showImage: boolean) => void;
  onIntent?: () => void;
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
      onPointerEnter={onIntent}
      onFocus={onIntent}
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
 * on, at the full body width (capped so it fits the screen). The card is a
 * 600 KB PNG, so it is fetched only once the reader shows intent (pointer or
 * focus on the switch, `warm`) or opens the view, and then stays mounted so
 * switching back and forth is instant. A timer used to fetch it 2 s after
 * every homepage load, which was a third of the page's bytes for a view
 * most readers never open.
 */
export function DayCardView({
  date,
  lang,
  open,
  warm = false,
}: {
  date: string;
  lang: Lang;
  open: boolean;
  warm?: boolean;
}) {
  const [wanted, setWanted] = useState(false);
  if ((open || warm) && !wanted) setWanted(true);
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
