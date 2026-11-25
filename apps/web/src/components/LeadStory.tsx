import { ArrowRight, ExternalLink } from "lucide-react";
import { recordRead } from "../lib/analytics/reads";
import { track } from "../lib/analytics/track";
import { timeAgo } from "../lib/lang";
import { usePrefs } from "../lib/prefs";
import { publisherHost } from "../lib/publisher-host";
import { storyPath } from "../lib/slug";
import type { FeedItem, Lang } from "../lib/types";
import { Bi } from "./Bi";
import { CategoryLabel } from "./CategoryLabel";
import { KeywordText } from "./KeywordText";
import { storySummaries, storyTitles } from "./row-text";
import { StoryThumb } from "./StoryThumb";

/**
 * The day's top story, above the ranked list: topic and time, headline, two
 * lines of summary, "Read more" (the story page) and the original article.
 * The image sits beside the text; a phone puts it first.
 */
export function LeadStory({ item, lang }: { item: FeedItem; lang: Lang }) {
  const { prefs } = usePrefs();
  const [title, secondTitle] = storyTitles(item, lang, prefs);
  const [summary, secondSummary] = storySummaries(item, lang, prefs);
  const host = item.url ? publisherHost(item.url) : null;
  const href = storyPath(item, lang);
  const time = Number.isFinite(item.published_at)
    ? timeAgo(item.published_at, Date.now(), lang)
    : "";

  return (
    <article
      aria-label={lang === "vi" ? "Tin hàng đầu" : "Top story"}
      className="grid items-start gap-5 min-[700px]:grid-cols-[minmax(0,1fr)_260px] min-[700px]:gap-8"
    >
      <div className="flex min-w-0 flex-col">
        <p className="flex flex-wrap items-center gap-x-1.5 text-[12px] font-semibold uppercase tracking-[0.07em] text-muted-foreground">
          {item.category ? (
            <CategoryLabel name={item.category} lang={lang} quiet />
          ) : null}
          {time && (
            <>
              <span aria-hidden="true">·</span>
              <span suppressHydrationWarning>{time}</span>
            </>
          )}
        </p>
        <h3 className="mt-2.5 line-clamp-3 break-words text-balance text-[length:var(--lead-title-size)] font-semibold leading-[1.14] tracking-[-0.015em] text-foreground in-data-[layout=newspaper]:font-heading in-data-[layout=newspaper]:leading-[1.08]">
          <a
            href={href}
            lang={
              title.fallbackFromEnglish
                ? "en"
                : prefs.bilingual
                  ? title.lang
                  : undefined
            }
            className="hover:underline hover:underline-offset-4"
          >
            <KeywordText
              text={title.text}
              tags={item.tags}
              ink
              category={item.category}
            />
          </a>
        </h3>
        {secondTitle && (
          <p lang={secondTitle.lang} className="bi-second mt-1.5">
            {secondTitle.text}
          </p>
        )}
        {summary && (
          <p
            lang={summary.lang}
            className="np-justify mt-3 line-clamp-2 text-[14.5px] leading-[1.65] text-body"
          >
            {summary.text}
          </p>
        )}
        {secondSummary && (
          <p
            lang={secondSummary.lang}
            className="bi-second np-justify line-clamp-2"
          >
            {secondSummary.text}
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
          <a href={href} className="btn-primary">
            <Bi vi="Đọc tiếp" en="Read more" inline />
            <ArrowRight aria-hidden="true" />
          </a>
          {item.url && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => {
                track("source_click", { item_id: item.id, placement: "row" });
                recordRead(item.id, "outbound");
              }}
              className="btn-link"
            >
              <Bi vi="Đọc bài gốc" en="Read source" inline />
              <ExternalLink aria-hidden="true" />
            </a>
          )}
          {host && (
            <span className="text-[12px] text-muted-foreground">{host}</span>
          )}
        </div>
      </div>
      <div className="min-w-0 max-[699px]:order-first [&_button]:rounded-[10px] [&_img]:rounded-[10px] [&_img]:border-0">
        <StoryThumb
          variant="card"
          src={item.image_url}
          itemId={item.id}
          lang={lang}
          priority
        />
      </div>
    </article>
  );
}
