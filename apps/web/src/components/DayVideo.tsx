import { useState } from "react";
import {
  type DayVideo as DayVideoData,
  youtubeEmbedUrl,
  youtubeThumbnailUrl,
  youtubeWatchUrl,
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
          {/* Real YouTube thumbnail. maxres is missing for some uploads;
              fall back to hq. Lazy: the facade hidden at this breakpoint
              (display:none) never fetches it. */}
          <img
            src={youtubeThumbnailUrl(id, "maxres")}
            onError={(e) => {
              const fallback = youtubeThumbnailUrl(id);
              if (e.currentTarget.src !== fallback)
                e.currentTarget.src = fallback;
            }}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          />
          <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-4 pb-4 pt-16 text-left">
            <span className="block text-[11px] font-semibold uppercase tracking-wider text-white/70">
              {lang === "vi" ? "Bản tin video" : "Video briefing"}
            </span>
            <span className="mt-0.5 line-clamp-2 block font-serif text-lg leading-snug text-white">
              {title}
            </span>
          </span>
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex h-14 w-20 items-center justify-center rounded-2xl bg-red-600 text-white shadow-lg transition-transform group-hover:scale-110">
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

function WatchOnYoutube({
  id,
  vertical,
  lang,
}: {
  id: string;
  vertical: boolean;
  lang: Lang;
}) {
  return (
    <a
      href={youtubeWatchUrl(id, vertical)}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-accent"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-3.5 w-3.5 text-red-600"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M23 7.2a3 3 0 0 0-2.1-2.1C19 4.6 12 4.6 12 4.6s-7 0-8.9.5A3 3 0 0 0 1 7.2 31 31 0 0 0 .5 12a31 31 0 0 0 .5 4.8 3 3 0 0 0 2.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 0 0 2.1-2.1 31 31 0 0 0 .5-4.8 31 31 0 0 0-.5-4.8ZM9.8 15.1V8.9L15.2 12l-5.4 3.1Z" />
      </svg>
      {lang === "vi" ? "Xem trên YouTube" : "Watch on YouTube"}
    </a>
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
          <WatchOnYoutube
            id={desktopId}
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
          <WatchOnYoutube
            id={mobileId}
            vertical={Boolean(video.short_id)}
            lang={lang}
          />
        </div>
      )}
    </>
  );
}
