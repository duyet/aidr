import type { TldrBullet } from "./types";

/** og:image is often stored with HTML entities (`&amp;` in query strings).
 * Decode until stable, then keep only absolute http(s) URLs. */
export function sanitizeImageUrl(
  url: string | null | undefined
): string | null {
  if (!url) return null;
  let decoded = url.trim();
  for (let i = 0; i < 3 && decoded.includes("&amp;"); i++) {
    decoded = decoded.replaceAll("&amp;", "&");
  }
  try {
    const parsed = new URL(decoded);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}

export type CdnImageSize = "thumb" | "card" | "full";

/**
 * Rewrite known CDN og:image URLs down to a size that matches how we
 * render them (48px thumbs / ~320px cards). Leaves unknown hosts alone.
 */
export function resizeCdnImageUrl(
  url: string | null | undefined,
  size: CdnImageSize = "thumb"
): string | null {
  const clean = sanitizeImageUrl(url);
  if (!clean) return null;
  let parsed: URL;
  try {
    parsed = new URL(clean);
  } catch {
    return clean;
  }
  const host = parsed.hostname.toLowerCase();
  if (host === "pbs.twimg.com" || host.endsWith(".twimg.com")) {
    return rewriteTwimg(parsed, size);
  }
  // Google blog filenames like `.width-1300.png` are not independently
  // addressable at smaller widths (403). Skip them as 48px thumbs so
  // Lighthouse does not download ~800KB for a round badge.
  if (size === "thumb") {
    const widthHint = parsed.pathname.match(/\.width-(\d+)\./i);
    if (widthHint && Number(widthHint[1]) > 400) return null;
  }
  if (host === "images.unsplash.com") {
    const w = size === "thumb" ? "96" : size === "card" ? "640" : "1600";
    parsed.searchParams.set("w", w);
    parsed.searchParams.set("q", size === "full" ? "80" : "60");
    parsed.searchParams.set("fit", "crop");
    return parsed.toString();
  }
  return parsed.toString();
}

function rewriteTwimg(parsed: URL, size: CdnImageSize): string {
  const name =
    size === "thumb" ? "small" : size === "card" ? "900x900" : "large";
  const suffix = parsed.pathname.match(
    /^(.*)\.(jpe?g|png|webp|gif):(orig|large|medium|small|thumb|360x360|240x240|900x900|4096x4096)$/i
  );
  if (suffix) {
    const ext = suffix[2].toLowerCase().replace("jpeg", "jpg");
    parsed.pathname = `${suffix[1]}.${suffix[2]}`;
    parsed.searchParams.set("format", ext);
    parsed.searchParams.set("name", name);
    return parsed.toString();
  }
  if (parsed.searchParams.has("name")) {
    parsed.searchParams.set("name", name);
  }
  parsed.pathname = parsed.pathname.replace(
    /_(400x400|200x200)\.(jpe?g|png|webp)$/i,
    size === "thumb" ? "_200x200.$2" : "_400x400.$2"
  );
  return parsed.toString();
}

/** Build id → story image for attaching to AI;DR bullets at read time. */
export function imageUrlByItemId(
  items: Array<{ id: string; image_url?: string | null }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const item of items) {
    const url = sanitizeImageUrl(item.image_url);
    if (item.id && url) map.set(item.id, url);
  }
  return map;
}

/** Every story id cited by either language's bullets. */
export function collectTldrItemIds(
  tldr: { bullets_en: TldrBullet[]; bullets_vi: TldrBullet[] } | null
): string[] {
  if (!tldr) return [];
  const ids = new Set<string>();
  for (const bullet of [...tldr.bullets_en, ...tldr.bullets_vi]) {
    for (const id of bullet.item_ids ?? []) {
      if (id) ids.add(id);
    }
  }
  return [...ids];
}

/** Additive `image_url` from the first linked story that has one.
 * Omits the field when none of the cited stories have an image so the
 * stored snapshot shape (`text` + `item_ids`) stays unchanged. */
export function attachTldrBulletImages(
  bullets: TldrBullet[],
  imageByItemId: Map<string, string>
): TldrBullet[] {
  return bullets.map((bullet) => {
    const existing = sanitizeImageUrl(bullet.image_url);
    if (existing) return { ...bullet, image_url: existing };
    for (const id of bullet.item_ids ?? []) {
      const url = imageByItemId.get(id);
      if (url) return { ...bullet, image_url: url };
    }
    return bullet;
  });
}

export function withTldrImages<
  T extends { bullets_en: TldrBullet[]; bullets_vi: TldrBullet[] },
>(
  tldr: T | null,
  imageByItemId: Map<string, string>
):
  | (Omit<T, "bullets_en" | "bullets_vi"> & {
      bullets_en: TldrBullet[];
      bullets_vi: TldrBullet[];
    })
  | null {
  if (!tldr) return tldr;
  return {
    ...tldr,
    bullets_en: attachTldrBulletImages(tldr.bullets_en, imageByItemId),
    bullets_vi: attachTldrBulletImages(tldr.bullets_vi, imageByItemId),
  };
}
