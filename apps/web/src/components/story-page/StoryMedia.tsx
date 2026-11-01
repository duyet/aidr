import { type ReactElement, useState } from "react";
import { track } from "../../lib/analytics/track";
import { publisherHost } from "../../lib/publisher-host";
import { resizeCdnImageUrl, sanitizeImageUrl } from "../../lib/tldr-images";
import type { FeedItem, Lang } from "../../lib/types";
import { ThumbLightbox } from "../StoryThumb";
import {
  MEDIA_COPY,
  MediaImage,
  MediaVideo,
  visibleMediaAssets,
} from "../story/MediaGallery";

/** Lead image: 16:9 cover, 10px radius, full bleed under 820px. */
function HeroImage({
  src,
  alt,
  label,
  itemId,
  onFail,
}: {
  src: string;
  alt: string;
  label: string;
  itemId: string;
  onFail: () => void;
}): ReactElement {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        data-kb=""
        aria-label={label}
        onClick={() => {
          setOpen(true);
          track("media_open", { media: "image", index: 1, item_id: itemId });
        }}
        className="block w-full cursor-zoom-in overflow-hidden p-0 min-[820px]:rounded-[10px]"
      >
        <img
          src={src}
          alt={alt}
          width={960}
          height={540}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={onFail}
          className="block aspect-video w-full bg-muted object-cover min-[820px]:rounded-[10px]"
        />
      </button>
      {open && <ThumbLightbox src={src} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * The story's media rail: the first image (or video) large, with a
 * publisher caption, then any further manifest media. Falls back to the
 * legacy `image_url`; with no media at all it renders nothing.
 */
export function StoryMedia({
  item,
  lang,
}: {
  item: FeedItem;
  lang: Lang;
}): ReactElement | null {
  const copy = MEDIA_COPY[lang];
  const assets = visibleMediaAssets(item.media_manifest);
  const host = publisherHost(item.url);
  const fallback = resizeCdnImageUrl(sanitizeImageUrl(item.image_url), "card");
  const [first, ...rest] = assets;
  const total = assets.length || 1;
  // A dead lead image leaves no empty box or orphan caption behind.
  const [heroFailed, setHeroFailed] = useState(false);
  if (!first && !fallback) return null;
  if (heroFailed && rest.length === 0) return null;

  const caption = host ? `${lang === "vi" ? "Ảnh" : "Image"}: ${host}` : null;

  return (
    <figure className="m-0 grid gap-1.5 max-[819px]:order-first max-[819px]:-mx-4 min-[640px]:max-[819px]:-mx-6 min-[820px]:sticky min-[820px]:top-16">
      {heroFailed ? null : first?.kind === "video" ? (
        <MediaVideo
          asset={first}
          label={copy.videoLabel(1, total, host)}
          lang={lang}
          total={total}
          itemId={item.id}
        />
      ) : (
        <HeroImage
          src={first?.url ?? fallback ?? ""}
          alt={copy.imageAlt(1, total, host)}
          label={copy.zoom(1, total)}
          itemId={item.id}
          onFail={() => setHeroFailed(true)}
        />
      )}
      {caption && !heroFailed && (
        <figcaption className="text-xs text-muted-foreground max-[819px]:px-4 min-[640px]:max-[819px]:px-6">
          {caption}
        </figcaption>
      )}
      {rest.length > 0 && (
        <div className="mt-2 grid grid-cols-2 gap-2 max-[819px]:px-4 min-[640px]:max-[819px]:px-6">
          {rest.map((asset) =>
            asset.kind === "image" ? (
              <MediaImage
                key={asset.key}
                asset={asset}
                alt={copy.imageAlt(asset.index, total, host)}
                label={copy.zoom(asset.index, total)}
                itemId={item.id}
                solo={false}
              />
            ) : (
              <MediaVideo
                key={asset.key}
                asset={asset}
                label={copy.videoLabel(asset.index, total, host)}
                lang={lang}
                total={total}
                itemId={item.id}
              />
            )
          )}
        </div>
      )}
    </figure>
  );
}
