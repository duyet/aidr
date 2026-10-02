# quality-bench fixtures

Frozen inputs for `scripts/quality-bench.ts`. Run from `apps/web`:

```bash
pnpm bench --out /tmp/before.json      # baseline
# ...change worker/topic-learning.ts, source-diversity.ts, sources/keywords.ts...
pnpm bench --out /tmp/after.json
pnpm bench --compare /tmp/before.json /tmp/after.json
```

Keep a change only when the composite rises and no metric regresses for a
reason you cannot explain. Do not edit gold files to make a change pass.

## Files

- `snapshot.json`: 300 prod D1 rows exported 2026-10-02 with trimmed fields.
  It holds the top published rows by `rank_score` in the 48h before `now`,
  every 20th merged row, all rejected rows, and the 50 ids from
  `../importance-eval.json`. `source_count` = 1 + merged rows pointing at the
  item in the 3-day export.
- `gold-trending.json`: model/product names that really trended in the last
  24h of the snapshot, with alias keys, plus the junk list (generic words that
  should never be a chip).
- `gold-entities.json`: 67 titles with the model/product names they contain
  (`entities`) and labs (`labs`, info only). 13 titles have no entity, which
  measures extraction precision.
- `gold-keyword.json`: AI vs non-AI titles for the prefilter.

## Labelling rules

- Labels come from the title text only. Never add a name the title does not
  contain. Gold was written before running the code on these titles.
- Entity match is exact `trendingKey` equality against the name or a listed
  alias. A shorter prefix (`gemini-4` for `gemini-4-argon`) is a partial and
  counts as a miss.
- Keyword `ai: true` means the story is about AI/ML, not that it mentions AI.
  Ambiguous titles are left out. Positives come from sources the prefilter
  does not gate, because gated sources (hn, arxiv) only hold titles that
  already passed. Four negatives are marked `synthetic`: they probe regex
  false positives (`model`, `rag`, `mail`).

## Scoring

Each metric is 0..1; the composite is the weighted sum (0..100).

| metric | weight | how |
|---|---|---|
| trending | 30 | `getFeed` path (`capSourceShare` → `collectTrendingCandidates` → `rankTrendingWithGrowth`); 0.45·precision@10 + 0.35·recall + 0.2·(1 − junk rate) |
| entities | 25 | `extractTitleEntities`; 0.7·recall + 0.3·precision |
| keyword | 20 | `isAiRelatedTitle`; F2 (recall weighted) |
| diversity | 15 | `pickDiverse` on the 24h window for top 16 and top 50; share under `familyCapFor` + family coverage |
| importance | 10 | entropy of published importance + agreement with `importance-eval.json` bands |

Known gaps: yesterday's trending counts come from the snapshot's 24-48h rows,
while production reads `topic_daily`. Importance is stored LLM output, so no
code change here moves it. Merge/reject rates are printed as info only and
describe the sampled fixture, not production.
