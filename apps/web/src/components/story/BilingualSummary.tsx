import type { FeedItem, Lang } from "../../lib/types";

/** Side-by-side EN | VI columns — the current language sorts first. The
 * suggest-a-correction target stays on the VI column either way. */
export function BilingualSummary({
  item,
  lang,
  paragraphsEn,
  paragraphsVi,
}: {
  item: FeedItem;
  lang: Lang;
  paragraphsEn: string[];
  paragraphsVi: string[];
}) {
  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:divide-x md:divide-border">
      {[
        {
          key: "en",
          title: item.title,
          titleFallback: false,
          paragraphs: paragraphsEn,
          isVi: false,
        },
        {
          key: "vi",
          title: item.title_vi?.trim() || item.title,
          titleFallback: !item.title_vi?.trim(),
          paragraphs: paragraphsVi,
          isVi: true,
        },
      ]
        .sort((a) => (a.key === lang ? -1 : 1))
        .map((col, i) => (
          <div
            key={col.key}
            data-suggest-field={col.isVi ? "summary" : undefined}
            className={i === 0 ? "space-y-2" : "space-y-2 pt-4 md:pt-0 md:pl-6"}
          >
            <h3
              className="text-sm font-bold leading-snug text-foreground"
              lang={col.titleFallback ? "en" : undefined}
            >
              {col.title}
              {col.titleFallback && (
                <span className="ml-1 align-middle text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  EN
                </span>
              )}
            </h3>
            {col.paragraphs.length > 0 && (
              <div className="typeset typeset-reader">
                {col.paragraphs.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            )}
          </div>
        ))}
    </div>
  );
}
