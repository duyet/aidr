import { track } from "@aidr/ui/track";
import { useId, useState } from "react";
import {
  MAX_MEDIA_ASSETS,
  type MediaManifest,
  mediaIdentityKey,
} from "../../../worker/media.js";
import { publisherHost } from "../../lib/publisher-host";
import type { Lang } from "../../lib/types";
import {
  STORY_THUMB_PLACEHOLDER,
  StoryThumb,
  ThumbLightbox,
} from "../StoryThumb";

/** Bounded story media for the reader.
 *
 * The bounded, typed `items.media_manifest` (#160 / migration 0024) already
 * carries ordered, canonicalized image/video assets all the way to the client,
 * but nothing under `apps/web` read it and no `<video>` existed, so "one story
 * can show more than one thumbnail" had no user-visible effect on the web.
 * This renders exactly that: the manifest's assets, in the manifest's order,
 * from the manifest's own URLs.
 *
 * Invariants this component must not break:
 * - No URL is re-derived, re-sanitized, or CDN-rewritten. The manifest string
 *   is what lands in `src` / `poster`. The reader adds no network call and no
 *   D1 read beyond the payload that already carried these URLs.
 * - `mediaIdentityKey` doubles as the render gate and the dedupe identity. A
 *   null identity means `worker/media` canonicalization already rejected that
 *   URL (non-HTTP(S) scheme, credentials, non-default port, private or
 *   reserved host), so it never reaches the DOM.
 * - Nothing autoplays, nothing moves, and every frame reserves its box before
 *   the bytes arrive.
 */

export type VisibleMediaAsset =
  | { kind: "image"; key: string; url: string; index: number }
  | {
      kind: "video";
      key: string;
      url: string;
      /** The manifest's own poster, already gated. Never a second asset. */
      poster: string | null;
      index: number;
    };

/** A poster is only usable if it passes the same image gate as an asset. */
function gatedPoster(poster: unknown): string | null {
  if (typeof poster !== "string" || !poster) return null;
  return mediaIdentityKey("image", poster) ? poster : null;
}

/**
 * Manifest assets in persisted order, deduplicated by the manifest's own
 * stable identity and capped at `MAX_MEDIA_ASSETS`.
 *
 * The cap is checked before the next asset is even inspected, so an asset
 * past the cap is never rendered and therefore never fetched. The identity
 * matches `buildMediaManifest`'s own `assetIdentity` (`type` + content key),
 * so resize variants of one image collapse while a signed-CDN query that is
 * not a resize key does not.
 */
export function visibleMediaAssets(
  manifest: MediaManifest | null | undefined
): VisibleMediaAsset[] {
  const visible: VisibleMediaAsset[] = [];
  const seen = new Set<string>();
  const assets = Array.isArray(manifest?.assets) ? manifest.assets : [];
  for (const asset of assets) {
    if (visible.length >= MAX_MEDIA_ASSETS) break;
    if (!asset || (asset.type !== "image" && asset.type !== "video")) continue;
    if (typeof asset.url !== "string") continue;
    const identity = mediaIdentityKey(asset.type, asset.url);
    if (!identity) continue;
    const key = `${asset.type}:${identity}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const index = visible.length + 1;
    visible.push(
      asset.type === "video"
        ? {
            kind: "video",
            key,
            url: asset.url,
            poster: gatedPoster(asset.poster_url),
            index,
          }
        : { kind: "image", key, url: asset.url, index }
    );
  }
  return visible;
}

/** 16:9 box reserved before load, matching the `aspect-[16/9]` class. */
const FRAME_WIDTH = 640;
const FRAME_HEIGHT = 360;
const FRAME_CLASS =
  "aspect-[16/9] w-full rounded-xl border border-border bg-muted object-cover";

const MEDIA_COPY = {
  en: {
    group: "Story media",
    imageAlt: (index: number, total: number, host: string | null) =>
      `Story image ${index} of ${total}${host ? ` from ${host}` : ""}`,
    videoLabel: (index: number, total: number, host: string | null) =>
      `Story video ${index} of ${total}${host ? ` from ${host}` : ""}`,
    zoom: (index: number, total: number) => `Zoom image ${index} of ${total}`,
    videoFallback: "This browser cannot play this video.",
    videoLink: "Open the video file",
    videoUnavailable: "This video is unavailable.",
  },
  vi: {
    group: "Hình ảnh và video của bài viết",
    imageAlt: (index: number, total: number, host: string | null) =>
      `Hình ${index} trên ${total} của bài viết${host ? ` từ ${host}` : ""}`,
    videoLabel: (index: number, total: number, host: string | null) =>
      `Video ${index} trên ${total} của bài viết${host ? ` từ ${host}` : ""}`,
    zoom: (index: number, total: number) =>
      `Phóng to hình ${index} trên ${total}`,
    videoFallback: "Trình duyệt này không phát được video.",
    videoLink: "Mở tệp video",
    videoUnavailable: "Video này không khả dụng.",
  },
} as const;

function MediaImage({
  asset,
  alt,
  label,
  itemId,
}: {
  asset: Extract<VisibleMediaAsset, { kind: "image" }>;
  alt: string;
  label: string;
  itemId?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);

  // A dead CDN image must not leave a broken frame behind. The site mark is
  // local, so a failed remote asset costs zero extra requests.
  if (failed) {
    return (
      <img
        src={STORY_THUMB_PLACEHOLDER}
        alt=""
        aria-hidden="true"
        width={FRAME_WIDTH}
        height={FRAME_HEIGHT}
        decoding="async"
        className={FRAME_CLASS}
      />
    );
  }

  const img = (
    <img
      src={asset.url}
      alt={alt}
      width={FRAME_WIDTH}
      height={FRAME_HEIGHT}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${FRAME_CLASS} transition-transform duration-200 motion-reduce:transition-none group-focus-visible:scale-[1.02] motion-reduce:transform-none`}
    />
  );

  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={(event) => {
          event.preventDefault();
          setOpen(true);
          track(
            "story_media_zoom",
            itemId ? { item_id: itemId, index: asset.index } : undefined
          );
        }}
        className="group block w-full cursor-zoom-in overflow-hidden rounded-xl border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        {img}
      </button>
      {open && <ThumbLightbox src={asset.url} onClose={() => setOpen(false)} />}
    </>
  );
}

function MediaVideo({
  asset,
  label,
  lang,
  total,
}: {
  asset: Extract<VisibleMediaAsset, { kind: "video" }>;
  label: string;
  lang: Lang;
  total: number;
}) {
  const [failed, setFailed] = useState(false);
  const copy = MEDIA_COPY[lang];

  // A video that will not load degrades to its poster, then to a localized
  // note. Either way the reader keeps a reserved, non-broken frame and a way
  // to reach the source — the fallback link survives the failure.
  if (failed) {
    return (
      <div
        className={`${FRAME_CLASS} flex flex-col items-center justify-center gap-1 p-2 text-center`}
      >
        {asset.poster ? (
          <img
            src={asset.poster}
            alt=""
            aria-hidden="true"
            width={FRAME_WIDTH}
            height={FRAME_HEIGHT}
            decoding="async"
            className="h-full w-full rounded-lg object-cover"
          />
        ) : (
          <span className="text-[10px] leading-tight text-muted-foreground">
            {copy.videoUnavailable}
          </span>
        )}
        <a
          href={asset.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("story_media_open", { index: asset.index })}
          className="text-[10px] font-medium text-accent underline underline-offset-2"
        >
          {copy.videoLink}
        </a>
      </div>
    );
  }

  return (
    <video
      src={asset.url}
      {...(asset.poster ? { poster: asset.poster } : {})}
      controls
      // No autoplay anywhere: nothing here plays with sound or without a
      // deliberate press of the browser's own play control.
      preload="none"
      muted
      playsInline
      width={FRAME_WIDTH}
      height={FRAME_HEIGHT}
      aria-label={label}
      onError={() => setFailed(true)}
      className={`${FRAME_CLASS} motion-reduce:transition-none`}
    >
      {/* Spec-defined fallback: rendered when the source cannot be played. */}
      <p className="p-2 text-[10px] text-muted-foreground">
        {copy.videoFallback}{" "}
        <a
          href={asset.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("story_media_open", { index: asset.index })}
          className="font-medium text-accent underline underline-offset-2"
        >
          {copy.videoLink}
        </a>{" "}
        ({asset.index}/{total})
      </p>
    </video>
  );
}

/**
 * Ordered story media for the reader's meta column.
 *
 * Falls back to the legacy single `image_url` thumbnail when the manifest
 * yields nothing renderable, so stories without a manifest render exactly as
 * they did before this existed.
 */
export function MediaGallery({
  manifest,
  fallbackImageUrl,
  articleUrl,
  lang,
  itemId,
}: {
  manifest?: MediaManifest;
  /** Legacy single thumbnail, used only when the manifest has nothing. */
  fallbackImageUrl?: string | null;
  /** Story URL; only its publisher host is used, to name the media. */
  articleUrl?: string | null;
  lang: Lang;
  itemId?: string;
}) {
  const headingId = useId();
  const assets = visibleMediaAssets(manifest);

  if (assets.length === 0) {
    return fallbackImageUrl ? (
      <StoryThumb src={fallbackImageUrl} itemId={itemId} variant="card" />
    ) : null;
  }

  const copy = MEDIA_COPY[lang];
  const total = assets.length;
  const host = publisherHost(articleUrl);

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h2
        id={headingId}
        className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
      >
        {copy.group}
      </h2>
      {assets.map((asset) =>
        asset.kind === "image" ? (
          <MediaImage
            key={asset.key}
            asset={asset}
            alt={copy.imageAlt(asset.index, total, host)}
            label={copy.zoom(asset.index, total)}
            itemId={itemId}
          />
        ) : (
          <MediaVideo
            key={asset.key}
            asset={asset}
            label={copy.videoLabel(asset.index, total, host)}
            lang={lang}
            total={total}
          />
        )
      )}
    </section>
  );
}
