import { useEffect, useState } from "react";
import { SITE_URL } from "../../lib/site";
import { storyPath } from "../../lib/slug";
import type { FeedItem, Lang } from "../../lib/types";
import { formatStoryScore, formatStoryTimestamp } from "./story-meta";
import { describeTelegramStatus, type StoryRanking } from "./story-ranking";

const COPY = {
  en: {
    title: "Why this ranks",
    position: "Rank today",
    score: "Score",
    importance: "Importance",
    outlets: "Outlets",
    top: "Top story of the day: this is the arrow on the homepage. It is not the Telegram trending post.",
    telegram: "Telegram trending",
    vi: "Telegram (VI)",
    en: "Telegram (EN)",
    loading: "Loading…",
    failed: "Could not load ranking details.",
  },
  vi: {
    title: "Vì sao xếp hạng này",
    position: "Hạng trong ngày",
    score: "Điểm",
    importance: "Độ quan trọng",
    outlets: "Số nguồn",
    top: "Tin hàng đầu trong ngày: đây là mũi tên trên trang chủ, không phải bài nổi bật trên Telegram.",
    telegram: "Telegram nổi bật",
    vi: "Telegram (VI)",
    en: "Telegram (EN)",
    loading: "Đang tải…",
    failed: "Không tải được chi tiết xếp hạng.",
  },
} as const;

const CHANNEL_LABEL = { telegram: "vi", "telegram-en": "en" } as const;

/**
 * Path for the ranking fetch. `storyPath` already includes `?lang=`, so
 * `ranking` is set on the URL. A second `?` would be swallowed into `lang`.
 */
export function rankingRequestPath(
  item: Pick<FeedItem, "id">,
  lang: Lang
): string {
  const url = new URL(`/api/story${storyPath(item, lang)}`, SITE_URL);
  url.searchParams.set("ranking", "1");
  return `${url.pathname}${url.search}`;
}

/** "Why this ranks" / Telegram trending status, loaded when first opened. */
export function StoryRankingPanel({
  item,
  lang,
}: {
  item: FeedItem;
  lang: Lang;
}) {
  const copy = COPY[lang];
  const [open, setOpen] = useState(false);
  const [ranking, setRanking] = useState<StoryRanking | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle");

  useEffect(() => {
    if (!open || ranking || state === "loading") return;
    setState("loading");
    fetch(rankingRequestPath(item, lang))
      .then((res) =>
        res.ok
          ? (res.json() as Promise<{ ranking?: StoryRanking }>)
          : Promise.reject(res.status)
      )
      .then((data: { ranking?: StoryRanking }) => {
        if (data.ranking) setRanking(data.ranking);
        setState(data.ranking ? "idle" : "failed");
      })
      .catch(() => setState("failed"));
  }, [open, ranking, state, item, lang]);

  const outlets = item.sources.filter((s) => s.kind !== "discussion").length;
  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-8 touch-manipulation items-center rounded-sm px-1 underline decoration-dotted underline-offset-2 hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
      >
        {copy.title}
      </button>
      {open ? (
        <div className="mt-1 min-w-0 border-l border-border pl-2 text-[11px] leading-relaxed">
          {ranking ? (
            <>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1">
                <div>
                  <dt className="text-muted-foreground">{copy.position}</dt>
                  <dd className="font-mono tabular-nums text-foreground">
                    #{ranking.dayRank} / {ranking.dayTotal}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{copy.score}</dt>
                  <dd className="font-mono tabular-nums text-foreground">
                    {formatStoryScore(ranking.rankScore)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{copy.importance}</dt>
                  <dd className="font-mono tabular-nums text-foreground">
                    {ranking.importance ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{copy.outlets}</dt>
                  <dd className="font-mono tabular-nums text-foreground">
                    {outlets || 1}
                  </dd>
                </div>
              </dl>
              {ranking.dayRank === 1 && ranking.dayTotal > 1 ? (
                <p className="mt-1.5 text-muted-foreground">{copy.top}</p>
              ) : null}
              <p className="mb-0.5 mt-1.5 font-semibold text-muted-foreground">
                {copy.telegram}
              </p>
              <ul className="space-y-0.5">
                {Object.entries(ranking.channels).map(([channel, status]) => (
                  <li key={channel}>
                    <span className="text-muted-foreground">
                      {
                        copy[
                          CHANNEL_LABEL[channel as keyof typeof CHANNEL_LABEL]
                        ]
                      }
                      :
                    </span>{" "}
                    {describeTelegramStatus(lang, status, ranking, (ms) =>
                      formatStoryTimestamp(ms / 1000, lang)
                    )}
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-muted-foreground">
              {state === "failed" ? copy.failed : copy.loading}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
