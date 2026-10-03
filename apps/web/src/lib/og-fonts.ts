/**
 * The satori/resvg OG renderer has no system font stack: it only shapes text
 * with the `fonts` array the route passes in. When a glyph is missing there,
 * satori does not skip it — it asks `loadAdditionalAsset` to pull a fallback
 * face from Google Fonts over the network, so a Vietnamese headline silently
 * rendered half EB Garamond and half Noto Sans. EB Garamond does cover the
 * alphabet, but its Vietnamese diacritics collide, and its stacked tones
 * are positioned only by GPOS, which this renderer skips. The card uses
 * Be Vietnam Pro, a humanist sans whose Vietnamese marks are in the outlines.
 *
 * These assets have to carry the full Vietnamese alphabet as simple outlines.
 * Source Sans 3 stores stacked tones as composites whose vertical position
 * lives only in GPOS mark-to-base, which this renderer does not apply, so
 * the marks draw on the letter. Be Vietnam Pro is the humanist sans that
 * already bakes those marks into the outline. Provenance and the exact
 * recipe live in `public/fonts/README.md`.
 */
import { STORY_OG_HEIGHT, STORY_OG_WIDTH } from "./story-og";

/** Asset paths for the two card weights. Loaded per render request. */
export const STORY_OG_FONT_SOURCES = {
  medium: "/fonts/be-vietnam-pro-500.ttf",
  bold: "/fonts/be-vietnam-pro-700.ttf",
} as const;

/** The family name the card's JSX asks for. Must match the loaded fonts. */
export const STORY_OG_FONT_FAMILY = "Be Vietnam Pro";

/** The complete Vietnamese precomposed inventory: 65 upper + 65 lower. */
export const VIETNAMESE_ALPHABET =
  "ÀÁÂÃÈÉÊÌÍÒÓÔÕÙÚĂĐĨŨƠƯ" +
  "ẠẢẤẦẨẪẬẮẰẲẴẶẸẺẼ" +
  "ỀỂỄỆỈỊỌỎỐỒỔỖỘỚỜỞỠỢỤỦỨỪỬỮỰỲỴỶỸ" +
  "àáâãèéêìíòóôõùúăđĩũơư" +
  "ạảấầẩẫậắằẳẵặẹẻẽềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ";

export interface StoryOgFontAsset {
  name: string;
  data: ArrayBuffer;
  weight: 500 | 700;
  style: "normal";
}

export type StoryOgFontLoader = (
  path: string
) => Promise<ArrayBuffer | null> | ArrayBuffer | null;

/**
 * Resolve the card fonts, dropping any weight the asset lookup could not
 * serve. satori then falls back to its default face for that weight instead of
 * failing the whole render, so a missing asset degrades the card rather than
 * breaking the route.
 */
export async function loadStoryOgFonts(
  load: StoryOgFontLoader
): Promise<StoryOgFontAsset[]> {
  const weights = [
    [500, STORY_OG_FONT_SOURCES.medium],
    [700, STORY_OG_FONT_SOURCES.bold],
  ] as const;

  const resolved = await Promise.all(
    weights.map(async ([weight, path]) => {
      const data = await load(path);
      return data && data.byteLength > 0
        ? ({
            name: STORY_OG_FONT_FAMILY,
            data,
            weight,
            style: "normal",
          } satisfies StoryOgFontAsset)
        : null;
    })
  );

  return resolved.filter((font): font is StoryOgFontAsset => font !== null);
}

/** ImageResponse options shared by the Worker route and the preview script. */
export interface StoryOgRenderOptions {
  width: number;
  height: number;
  /** Omitted entirely when no weight loaded, so satori keeps its own default. */
  fonts?: StoryOgFontAsset[];
}

export function storyOgRenderOptions(
  fonts: StoryOgFontAsset[]
): StoryOgRenderOptions {
  return {
    width: STORY_OG_WIDTH,
    height: STORY_OG_HEIGHT,
    ...(fonts.length ? { fonts } : {}),
  };
}

export type OgAssetEnv = {
  ASSETS?: { fetch: (r: Request) => Promise<Response> };
};

function assetsGet(path: string): Request {
  // Same trick as worker/public-assets.ts — bypass SPA not_found handling.
  return new Request(`https://assets.local${path}`, {
    method: "GET",
    headers: { Accept: "*/*" },
  });
}

/** Read a font from the Worker ASSETS binding; null on any miss. */
export async function loadOgFontAsset(
  env: OgAssetEnv | undefined,
  path: string
): Promise<ArrayBuffer | null> {
  try {
    const res = await env?.ASSETS?.fetch(assetsGet(path));
    if (!res?.ok) return null;
    // A miss answered with the SPA shell would be a >1000 byte HTML buffer,
    // and satori throws on that instead of degrading. Same guard as
    // worker/public-assets.ts, because it is the same binding.
    const ctype = (res.headers.get("content-type") ?? "").toLowerCase();
    if (ctype.includes("text/html")) return null;
    const buf = await res.arrayBuffer();
    return buf.byteLength > 1000 ? buf : null;
  } catch {
    return null;
  }
}
