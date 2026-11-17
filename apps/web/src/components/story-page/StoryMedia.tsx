import { type ReactElement, useState } from "react";
import { track } from "../../lib/analytics/track";
import { publisherHost } from "../../lib/publisher-host";
import { resizeCdnImageUrl, sanitizeImageUrl } from "../../lib/tldr-images";
import type { FeedItem, Lang } from "../../lib/types";
import { Bi } from "../Bi";
import { ImageZoom } from "../story/ImageZoom";
import {
  MEDIA_COPY,
  MediaImage,
  MediaVideo,
  visibleMediaAssets,
} from "../story/MediaGallery";

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
        className="block w-full cursor-zoom-in overflow-hidden rounded-xl p-0"
      >
        <img
          src={src}
          alt={alt}
          width={960}
          height={600}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={onFail}
          className="block aspect-[16/10] w-full rounded-xl bg-muted object-cover"
        />
      </button>
      {open && <ImageZoom src={src} onClose={() => setOpen(false)} />}
    </>
  );
}

/** Falls back to the legacy `image_url`; with no media at all it renders nothing. */
export function StoryMedia({
  item,
  lang,
  className,
}: {
  item: FeedItem;
  lang: Lang;
  className?: string;
}): ReactElement | null {
  const copy = MEDIA_COPY[lang];
  const assets = visibleMediaAssets(item.media_manifest);
  const host = publisherHost(item.url);
  const fallback = resizeCdnImageUrl(sanitizeImageUrl(item.image_url), "card");
  const [first, ...rest] = assets;
  const total = assets.length || 1;
  // A dead lead image leaves no empty box or orphan credit behind.
  const [heroFailed, setHeroFailed] = useState(false);
  if (!first && !fallback) return null;
  if (heroFailed && rest.length === 0) return null;

  return (
    <figure className={`m-0 grid min-w-0 gap-2 ${className ?? ""}`}>
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
      {host && !heroFailed && (
        <figcaption className="text-[12.5px] text-muted-foreground">
          <Bi vi={`Ảnh: ${host}`} en={`Image: ${host}`} />
        </figcaption>
      )}
      {rest.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
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
