import type { Lang } from "../../lib/types";

/** Side-by-side EN | VI columns — the current language sorts first. The
 * suggest-a-correction target stays on the VI column either way. `lang` on
 * each column is the language of that column's text, not of the page. */
export function BilingualSummary({
  lang,
  paragraphsEn,
  paragraphsVi,
}: {
  lang: Lang;
  paragraphsEn: string[];
  paragraphsVi: string[];
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:divide-x lg:divide-border">
      {[
        {
          key: "en" as const,
          paragraphs: paragraphsEn,
          isVi: false,
        },
        {
          key: "vi" as const,
          paragraphs: paragraphsVi,
          isVi: true,
        },
      ]
        .sort((a) => (a.key === lang ? -1 : 1))
        .map((col, i) => (
          <div
            key={col.key}
            data-suggest-field={col.isVi ? "summary" : undefined}
            lang={col.key}
            className={i === 0 ? undefined : "pt-4 lg:pt-0 lg:pl-6"}
          >
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
