import { useState } from "react";
import { dayArchiveOgPath } from "../lib/day-archive";
import type { Lang } from "../lib/types";

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
