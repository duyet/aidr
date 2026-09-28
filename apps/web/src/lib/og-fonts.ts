/**
 * The satori/resvg OG renderer has no system font stack: it only shapes text
 * with the `fonts` array the route passes in. When a glyph is missing there,
 * satori does not skip it — it fetches a fallback face and mixes it into the
 * headline. EB Garamond covers Vietnamese, but the file this route used to
 * load was a Latin-only cut, so the tone marks and horned letters were not
 * in it. These assets are the full face, instanced at wght 500 and 700.
 * Provenance lives in `public/fonts/README.md`.
 */
import { STORY_OG_HEIGHT, STORY_OG_WIDTH } from "./story-og";

/** Asset paths for the two card weights. Loaded per render request. */
export const STORY_OG_FONT_SOURCES = {
  medium: "/fonts/eb-garamond-500.ttf",
  bold: "/fonts/eb-garamond-700.ttf",
} as const;

/** The family name the card's JSX asks for. Must match the loaded fonts. */
export const STORY_OG_FONT_FAMILY = "EB Garamond";

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
