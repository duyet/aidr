import type { StoryOgImage } from "./story-og";

/**
 * Which layout a day card uses, decided from the day's own content.
 *
 * The stories, their count and their order are fixed before any photo is
 * fetched (`pickDayCardItems`), because the Telegram digest lists the same
 * stories in the same order. This module only decides how to show them:
 * which slot each story takes, given which photos actually loaded. It never
 * reorders. A story keeps its `rank` (its position in the digest) wherever
 * it lands.
 */

export interface DayCardStory {
  id: string;
  rank: number;
  title: string;
  kicker: string;
  image: StoryOgImage | null;
}

export type DayCardLayout =
  /** No story yet. `pending`: today, the first stories are still coming. */
  | { variant: "empty"; pending: boolean }
  | { variant: "single"; lead: DayCardStory }
  | { variant: "split"; pair: readonly [DayCardStory, DayCardStory] }
  /** Photos are scarce: the lead with its photo, the rest as a ruled list. */
  | { variant: "lead-list"; lead: DayCardStory; rows: DayCardStory[] }
  /** Photo-rich: the lead large, the next photo stories as smaller tiles,
   *  any later stories as list rows. */
  | {
      variant: "mosaic";
      lead: DayCardStory;
      tiles: DayCardStory[];
      rows: DayCardStory[];
    }
  /** The lead has no photo: a typographic poster of the day's headlines. */
  | { variant: "headlines"; lead: DayCardStory; rows: DayCardStory[] };

export type DayCardVariant = DayCardLayout["variant"];

export interface DayCardShape {
  stories: number;
  /** Leading stories, in order, whose photo loaded. Only this run can take
   *  photo slots without reordering the list. */
  photoRun: number;
  today: boolean;
}

export function dayCardShape(
  stories: readonly DayCardStory[],
  today: boolean
): DayCardShape {
  const firstWithout = stories.findIndex((s) => !s.image);
  return {
    stories: stories.length,
    photoRun: firstWithout < 0 ? stories.length : firstWithout,
    today,
  };
}

/** Whether these headlines fit whole in the 2×2 tile block. The renderer
 *  owns the geometry, so the layout only asks. */
export type FourTilesFit = (tiles: readonly DayCardStory[]) => boolean;

/** Photo tiles beside the mosaic lead: a 2×2 block when four photos follow
 *  the lead and their headlines fit it, else one row of two. Three in a row
 *  is too narrow to read. A story that loses its tile moves to the rows, in
 *  the same order. */
function mosaicTileCount(
  rest: readonly DayCardStory[],
  photoRun: number,
  fourTilesFit: FourTilesFit
): number {
  return photoRun - 1 >= 4 && fourTilesFit(rest.slice(0, 4)) ? 4 : 2;
}

interface VariantRule {
  variant: DayCardVariant;
  when: (shape: DayCardShape) => boolean;
  assign: (
    stories: readonly DayCardStory[],
    shape: DayCardShape,
    fourTilesFit: FourTilesFit
  ) => DayCardLayout;
}

export const DAY_CARD_VARIANTS: readonly VariantRule[] = [
  {
    variant: "empty",
    when: (s) => s.stories === 0,
    assign: (_, s) => ({ variant: "empty", pending: s.today }),
  },
  {
    variant: "single",
    when: (s) => s.stories === 1,
    assign: ([lead]) => ({ variant: "single", lead }),
  },
  {
    variant: "headlines",
    when: (s) => s.photoRun === 0,
    assign: ([lead, ...rows]) => ({ variant: "headlines", lead, rows }),
  },
  {
    variant: "split",
    when: (s) => s.stories === 2 && s.photoRun === 2,
    assign: ([a, b]) => ({ variant: "split", pair: [a, b] }),
  },
  {
    variant: "mosaic",
    when: (s) => s.photoRun >= 3,
    assign: ([lead, ...rest], s, fourTilesFit) => {
      const tileCount = mosaicTileCount(rest, s.photoRun, fourTilesFit);
      return {
        variant: "mosaic",
        lead,
        tiles: rest.slice(0, tileCount),
        rows: rest.slice(tileCount),
      };
    },
  },
  {
    variant: "lead-list",
    when: () => true,
    assign: ([lead, ...rows]) => ({ variant: "lead-list", lead, rows }),
  },
];

export function chooseDayCardLayout(
  stories: readonly DayCardStory[],
  today: boolean,
  fourTilesFit: FourTilesFit
): DayCardLayout {
  const shape = dayCardShape(stories, today);
  const rule = DAY_CARD_VARIANTS.find((r) => r.when(shape));
  return (rule as VariantRule).assign(stories, shape, fourTilesFit);
}

export function layoutStories(layout: DayCardLayout): DayCardStory[] {
  switch (layout.variant) {
    case "empty":
      return [];
    case "single":
      return [layout.lead];
    case "split":
      return [...layout.pair];
    case "mosaic":
      return [layout.lead, ...layout.tiles, ...layout.rows];
    case "lead-list":
    case "headlines":
      return [layout.lead, ...layout.rows];
  }
}
