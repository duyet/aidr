import type { HealthIssue } from "./health.js";

/**
 * Per-source image coverage: the share of published items with a usable
 * picture, over the last 24h against the last 7 days. A source whose ingest
 * stops finding images (a changed page layout, a blocked og:image fetch)
 * still delivers stories, and the imageless Telegram fallback only reports at
 * info, so this is the check that notices.
 *
 * Usable matches the Telegram photo path: `image_url` is set, or the media
 * manifest holds an image asset or a video with a poster.
 */

/**
 * 7 days to 2026-10-16, coverage by source, items per day in brackets.
 * Steady at 80-100%: marketbrief 100% (27), huggingnews 100% (16),
 * techmeme 100% (15), hn 80% (13), techcrunch-ai 98% (7), theverge-ai 100%
 * (4), the-decoder 96% (3). Naturally low, never eligible: lobsters 54% (7),
 * hf-papers 53% (5), arxiv-research 38% (3), simonwillison 36% (2),
 * openai 0% (1). 60% separates the two groups with a 6 point gap above the
 * best low source.
 */
export const IMAGE_COVERAGE_MIN_BASELINE = 0.6;
/** 3 items a day over the 7 days. Below it a source's 24h count is a
 *  handful of stories and one imageless story swings the share. */
export const IMAGE_COVERAGE_MIN_BASELINE_ITEMS = 21;
/** 24h items needed before the share means anything. */
export const IMAGE_COVERAGE_MIN_ITEMS = 4;
export const IMAGE_COVERAGE_COLLAPSE_RATIO = 0.5;

export const IMAGE_COVERAGE_KEY_PREFIX = "image-coverage:";

export function imageCoverageKey(sourceId: string): string {
  return `${IMAGE_COVERAGE_KEY_PREFIX}${sourceId}`;
}

export interface ImageCoverageRow {
  source: string;
  /** Published items in the last 24h, and how many have a usable image. */
  items24h: number;
  usable24h: number;
  items7d: number;
  usable7d: number;
}

/** One row per source. The alias `src` keeps this off the `GROUP BY
 *  source_id` statement the system loaders already key on. */
export const IMAGE_COVERAGE_SQL = `SELECT src AS source,
    SUM(published_at >= unixepoch('now', '-1 day')) AS items24h,
    SUM(CASE WHEN published_at >= unixepoch('now', '-1 day') AND usable = 1 THEN 1 ELSE 0 END) AS usable24h,
    COUNT(*) AS items7d,
    SUM(usable) AS usable7d
  FROM (
    SELECT source_id AS src, published_at,
      CASE WHEN (image_url IS NOT NULL AND image_url != '')
        OR (json_valid(media_manifest) AND EXISTS (
          SELECT 1 FROM json_each(media_manifest, '$.assets') a
          WHERE json_extract(a.value, '$.type') = 'image'
            OR (json_extract(a.value, '$.type') = 'video'
              AND COALESCE(json_extract(a.value, '$.poster_url'), '') != '')
        )) THEN 1 ELSE 0 END AS usable
    FROM items
    WHERE status = 'published' AND published_at >= unixepoch('now', '-7 days')
  )
  GROUP BY src ORDER BY items7d DESC`;

function share(usable: number, items: number): number {
  return items > 0 ? usable / items : 0;
}

export function formatCoverage(row: ImageCoverageRow): string {
  const pct = (u: number, n: number) =>
    n > 0 ? `${Math.round((u / n) * 100)}%` : "n/a";
  return `${row.source}: ${pct(row.usable24h, row.items24h)} (${row.usable24h}/${row.items24h}) in 24h, ${pct(row.usable7d, row.items7d)} (${row.usable7d}/${row.items7d}) in 7d`;
}

/**
 * A source that normally has pictures and lost them. `alerted` holds every
 * alert key the last 24h of runs recorded, so a key fires once per day, not
 * once per half hour while the 24h share stays low.
 */
export function evaluateImageCoverage(
  rows: ImageCoverageRow[],
  alerted: ReadonlySet<string>
): HealthIssue[] {
  const issues: HealthIssue[] = [];
  for (const row of rows) {
    if (row.items7d < IMAGE_COVERAGE_MIN_BASELINE_ITEMS) continue;
    if (row.items24h < IMAGE_COVERAGE_MIN_ITEMS) continue;
    const baseline = share(row.usable7d, row.items7d);
    if (baseline < IMAGE_COVERAGE_MIN_BASELINE) continue;
    const recent = share(row.usable24h, row.items24h);
    if (recent >= baseline * IMAGE_COVERAGE_COLLAPSE_RATIO) continue;
    const key = imageCoverageKey(row.source);
    if (alerted.has(key)) continue;
    issues.push({
      key,
      severity: "warning",
      title: "Source image coverage collapsed",
      detail: `${row.source}: ${row.usable24h} of ${row.items24h} items had an image in 24h (${Math.round(recent * 100)}%), against ${Math.round(baseline * 100)}% over 7 days`,
      evidence: [formatCoverage(row)],
    });
  }
  return issues;
}
