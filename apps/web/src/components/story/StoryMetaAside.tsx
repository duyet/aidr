import { Clock, Cpu, Link2 } from "lucide-react";
import type { CSSProperties } from "react";
import { storyPath } from "../../lib/slug";
import { topicColor } from "../../lib/topic-color";
import type { FeedItem, Lang } from "../../lib/types";
import { CategoryLabel } from "../CategoryLabel";
import { StoryThumb } from "../StoryThumb";
import { fmtTime } from "./lib";

/** Right-hand meta column: thumbnail, topics, and the details line. */
export function StoryMetaAside({
  item,
  lang,
  imageUrl,
}: {
  item: FeedItem;
  lang: Lang;
  imageUrl: string | null;
}) {
  return (
    <aside className="not-typeset min-w-0 space-y-5 md:border-l md:border-border md:pl-6">
      {imageUrl && (
        <StoryThumb src={imageUrl} itemId={item.id} variant="card" />
      )}

      {(item.tags.length > 0 || item.category) && (
        <div className="space-y-2">
          <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {lang === "vi" ? "Chủ đề" : "Topics"}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {item.category && (
              <span className="rounded-full border border-border bg-background px-2 py-0 text-xs">
                <CategoryLabel name={item.category} lang={lang} />
              </span>
            )}
            {item.tags.map((tag) => {
              const color = topicColor(tag);
              return (
                <span
                  key={tag}
                  className="rounded-full border border-border bg-background px-2 py-0 text-xs"
                >
                  <span
                    className="topic-colored"
                    style={
                      {
                        "--tc-light": color.light,
                        "--tc-dark": color.dark,
                      } as CSSProperties
                    }
                  >
                    {tag}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <div className="text-xs leading-relaxed text-muted-foreground">
        <Clock className="inline h-3 w-3 align-[-1px]" aria-hidden />{" "}
        {fmtTime(item.published_at, lang)} · {item.source_id} · score{" "}
        {item.rank_score.toFixed(1)}
        {item.llm_tokens > 0 && (
          <>
            {" · "}
            <Cpu className="inline h-3 w-3 align-[-1px]" aria-hidden />{" "}
            {item.llm_tokens} tokens
          </>
        )}
        {" · "}
        <a
          href={storyPath(item)}
          className="underline underline-offset-2 hover:text-accent"
        >
          <Link2 className="inline h-3 w-3 align-[-1px]" aria-hidden />{" "}
          {lang === "vi" ? "Trang tin" : "Permalink"}
        </a>
      </div>
    </aside>
  );
}
