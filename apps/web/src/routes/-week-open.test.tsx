/**
 * The provisional edition for the in-progress week. `parseWeek` refuses the
 * open week, so `fetchWeekEdition` falls back to a live ranking here:
 * stored rule, no LLM copy, rebuilt on every request.
 */
import { describe, expect, it } from "vitest";
import type { FeedItem, Lang } from "../lib/types";
import { buildOpenWeekEdition } from "../lib/week-open";
import { Route } from "./week.$week";

const NOW = Date.parse("2026-11-11T05:00:00Z"); // Wed, W46, ICT = 11:00

const item = (
  id: string,
  importance: number,
  extra: Partial<FeedItem> = {}
): FeedItem & { llm_importance: number } => ({
  ...({} as FeedItem),
  llm_importance: importance,
  id,
  url: `https://example.com/${id}`,
  title: `Story ${id}`,
  title_vi: `Tin mới ${id}`,
  summary: null,
  summary_vi: null,
  category: "Tools",
  published_at: Math.floor(NOW / 1000) - 3 * 86_400,
  points: 0,
  comments: 0,
  rank_score: 0,
  source_id: "hn",
  tags: [],
  sources: [],
  llm_tokens: 0,
  image_url: null,
  ...extra,
});

const CANDIDATES = [
  item("aaaaaaaa11111111", 90),
  item("bbbbbbbb22222222", 70),
  item("cccccccc33333333", 50),
];

/** A D1 stub that answers the two reads `buildOpenWeekEdition` makes: the
 * ranked window query, and `getItemsByIds`. */
function fakeDb(
  candidates: Record<string, unknown>[],
  items: Record<string, unknown>[]
) {
  return {
    prepare: (sql: string) => {
      const stmt = {
        bind: () => stmt,
        all: async () => {
          if (sql.includes("llm_importance DESC"))
            return { results: candidates };
          if (sql.includes("json_each")) return { results: items };
          if (sql.includes("tldr_snapshots")) return { results: [] }; // nothing cited yet in the young week
          return { results: [] };
        },
        first: async () => null,
        batch: async () => [],
      };
      return stmt;
    },
    batch: async () => [],
  } as unknown as D1Database;
}

const CANDIDATE_ROWS = CANDIDATES.map((c) => ({
  id: c.id,
  source_id: c.source_id,
  title: c.title,
  title_vi: c.title_vi,
  summary: c.summary,
  category: c.category,
  llm_importance: c.llm_importance ?? 0,
  llm_quality: null,
  points: c.points ?? 0,
  comments: c.comments ?? 0,
  signal_url: null,
  merged_members: null,
  vote_net: 0,
}));

describe("buildOpenWeekEdition", () => {
  it("ranks the week-so-far with the closed-week scoring, no model copy", async () => {
    const edition = await buildOpenWeekEdition(
      fakeDb(
        CANDIDATE_ROWS,
        CANDIDATES as unknown as Record<string, unknown>[]
      ),
      "2026-W46",
      NOW
    );
    expect(edition?.provisional).toBe(true);
    expect(edition?.week).toBe("2026-W46");
    expect(edition?.issue).toBe(7);
    expect(edition?.intro_en).toBeNull();
    expect(edition?.intro_vi).toBeNull();
    expect(edition?.stories.map((s) => s.item.id)).toEqual([
      "aaaaaaaa11111111",
      "bbbbbbbb22222222",
      "cccccccc33333333",
    ]);
    // No model copy: the English line is the title, Vietnamese the title_vi.
    expect(edition?.stories[0].text_en).toBe("Story aaaaaaaa11111111");
    expect(edition?.stories[0].text_vi).toBe("Tin mới aaaaaaaa11111111");
    expect(edition?.stories[1].rank).toBe(2);
    expect(edition?.nextWeek).toBeNull();
    expect(edition?.prevWeek).toBe("2026-W45");
  });

  it("drops stories with no Vietnamese line from the VI column", async () => {
    const rows = [{ ...CANDIDATE_ROWS[0], title_vi: null }, CANDIDATE_ROWS[1]];
    const items = [item("aaaaaaaa11111111", 90), item("bbbbbbbb22222222", 70)];
    const edition = await buildOpenWeekEdition(
      fakeDb(rows, items as unknown as Record<string, unknown>[]),
      "2026-W46",
      NOW
    );
    expect(edition?.stories.map((s) => s.text_en)).toEqual([
      "Story aaaaaaaa11111111",
      "Story bbbbbbbb22222222",
    ]);
    expect(edition?.stories[0].text_vi).toBeNull();
    expect(edition?.stories[1].text_vi).toBe("Tin mới bbbbbbbb22222222");
  });

  it("is null for a week that is not the in-progress one", async () => {
    const edition = await buildOpenWeekEdition(
      fakeDb(
        CANDIDATE_ROWS,
        CANDIDATES as unknown as Record<string, unknown>[]
      ),
      "2026-W45",
      NOW
    );
    expect(edition).toBeNull();
  });

  it("is null when the week has no stories yet", async () => {
    const edition = await buildOpenWeekEdition(fakeDb([], []), "2026-W46", NOW);
    expect(edition).toBeNull();
  });
});

type HeadersFn = (ctx: {
  loaderData: unknown;
  match: { context: { lang: Lang }; search: Record<string, string> };
}) => Record<string, string>;

describe("week route headers for a provisional edition", () => {
  const match = {
    context: { lang: "en" } as { lang: Lang },
    search: { lang: "en" },
  };
  const headers = Route.options.headers as unknown as HeadersFn;
  const openEdition = {
    kind: "week" as const,
    edition: {
      week: "2026-W46",
      issue: 7,
      start_date: "2026-11-09",
      end_date: "2026-11-15",
      intro_en: null,
      intro_vi: null,
      stories: [],
      prevWeek: "2026-W45",
      nextWeek: null,
      updated_at: NOW,
      provisional: true as const,
    },
  };

  it("caches a provisional edition for minutes, not days", () => {
    const out = headers({ loaderData: openEdition, match });
    expect(out["Cache-Control"]).toContain("max-age=60");
    expect(out["Cache-Control"]).not.toContain("max-age=60, s-maxage=3600");
  });
});
