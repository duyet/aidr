import { useState } from "react";
import {
  type DayVideo as DayVideoData,
  youtubeEmbedUrl,
  youtubeThumbnailUrl,
} from "../lib/day-video";
import type { Lang } from "../lib/types";

/**
 * Click-to-play YouTube facade: a thumbnail button until clicked, then the
 * privacy-enhanced (youtube-nocookie) player. Nothing from YouTube's player
 * loads before the click.
 */
function YoutubeFacade({
  id,
  title,
  vertical,
  lang,
}: {
  id: string;
  title: string;
  vertical: boolean;
  lang: Lang;
}) {
  const [playing, setPlaying] = useState(false);
  const frame = vertical
    ? "mx-auto aspect-[9/16] w-full max-w-sm"
    : "aspect-video w-full";
  return (
    <div
      className={`${frame} relative overflow-hidden rounded-2xl border border-border/80 bg-black`}
    >
      {playing ? (
        <iframe
          src={youtubeEmbedUrl(id)}
          title={title}
          className="absolute inset-0 h-full w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      ) : (
        <button
          type="button"
          onClick={() => setPlaying(true)}
          aria-label={`${lang === "vi" ? "Phát video" : "Play video"}: ${title}`}
          className="group absolute inset-0 h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* Lazy: the facade hidden at this breakpoint (display:none)
              never fetches its thumbnail. */}
          <img
            src={youtubeThumbnailUrl(id)}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover opacity-90 transition-opacity group-hover:opacity-100"
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-20 items-center justify-center rounded-2xl bg-black/70 text-white transition-colors group-hover:bg-red-600">
              <svg
                viewBox="0 0 24 24"
                className="h-7 w-7"
                fill="currentColor"
                aria-hidden="true"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * The day's "TV": the 16:9 video on md+ (else the Short in 9:16), and the
 * Short on mobile (else the 16:9 video). Breakpoints are CSS so the SSR
 * HTML is identical for every device and stays cacheable.
 */
export function DayVideo({
  video,
  fallbackTitle,
  lang,
}: {
  video: DayVideoData;
  fallbackTitle: string;
  lang: Lang;
}) {
  const title = video.title ?? fallbackTitle;
  const desktopId = video.youtube_id ?? video.short_id;
  const mobileId = video.short_id ?? video.youtube_id;
  return (
    <>
      {desktopId && (
        <div className="hidden md:block">
          <YoutubeFacade
            id={desktopId}
            title={title}
            vertical={!video.youtube_id}
            lang={lang}
          />
        </div>
      )}
      {mobileId && (
        <div className="md:hidden">
          <YoutubeFacade
            id={mobileId}
            title={title}
            vertical={Boolean(video.short_id)}
            lang={lang}
          />
        </div>
      )}
    </>
  );
}
