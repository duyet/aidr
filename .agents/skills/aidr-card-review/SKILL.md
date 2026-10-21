---
name: aidr-card-review
description: Review the AI;DR day card (the Telegram and Facebook day image, also the day page's og:image) and the story OG images of its tiles, EN and VI, for today's edition or a given date. Scores a 10-point rubric, script-checked rows plus judged rows. Use before or after a card, layout, font or tile-pick change, when asked to "review", "check", "QA" or "score" the day card or OG images, and when a card looks wrong in a channel. Nothing ships below 8/10.
---

# aidr-card-review

You did not build this card. Find what is wrong, name the tile, and say the fix.

## Inputs

- The day's ranked stories, read from production D1 (SELECT only) with the route's own `getDayArchive`.
- The card the route builds from them: `dayCardModel` and `dayOgCard` in `apps/web/src/lib/day-og.tsx`, tiles from `pickDayCardItems` in `apps/web/src/lib/day-card-pick.ts`.
- The published PNGs, by plain GET: `https://aidr.today/api/og/date/<date>.png?lang=en|vi` and `https://aidr.today/api/og/<id>.png?lang=en|vi` for each tile.
- For the judged rows: open the two day PNGs and look at them at 320 px wide.

## Run

From the repo root:

```bash
pnpm --filter @aidr/web exec tsx scripts/review/card.ts                      # today's live card
pnpm --filter @aidr/web exec tsx scripts/review/card.ts --date 2026-10-21    # one day
pnpm --filter @aidr/web exec tsx scripts/review/card.ts --fixture scripts/review/fixtures/card-good.json
pnpm --filter @aidr/web exec tsx scripts/review/card.ts --json /tmp/card.json
```

Headline fit is measured headlessly. The repo has no Playwright or Puppeteer, so the script walks the element tree `dayOgCard` returns and reads each headline's fitted text and font size. Those come from `og-text-fit.ts`, whose widths are measured Be Vietnam Pro advances. The script does not fetch publisher photos. It counts every photo URL as loaded, which gives the photo-rich layout with the smallest tiles. The live PNG can differ when a photo failed or the hourly cache holds an older render. Check the PNG by eye for that.

Tests: `pnpm exec vitest run worker/__tests__/review-card.test.ts` from `apps/web`.

## Rubric

| Row | Points | How to judge | Auto/Judged |
| --- | --- | --- | --- |
| render-size | 2 | Every fetched PNG (day card and each tile's story OG, EN and VI) answers 200, is `image/png`, is 1200x630, and is at most 5 MB, Telegram's URL ceiling. | Auto |
| tile-count | 2 | Tiles equal `pickDayCardItems` over the day's stories with `hasDayOgCopy`, in order. Count is `dayCardTileCount`: every story up to six, so a 4 or 5 story day shows all of them (#952). | Auto |
| fit-320 | 2 | Every tile headline is drawn whole (no "…" cut), and its font size scaled to a 320 px wide card is at least 6 px. | Auto |
| no-repeat | 1 | No story id and no headline appears on two tiles. | Auto |
| lang-copy | 1 | Every tile has a headline in the card's language (`hasDayOgCopy`). No English on the VI card, no Vietnamese on the EN card. | Auto |
| lead-reads | 1 | At 320 px wide, one story clearly leads and the eye lands on tile 1 first. | Judged |
| photo-crops | 1 | No crop cuts a face, a logo, or the subject in half. A screenshot crop that loses its own headline counts too. | Judged |

## Scoring

- An auto row earns full points or none. Taste never overrules it.
- A judged row may earn half when the defect is in one tile only.
- The card ships at 8/10. Below 8 it does not ship.

## Report

Give the row table with each row's result and points. Then list every lost point with the language, the story id, what is wrong, and the fix. For example:

```
fit-320  -2  en 3706f14f...: cut to "SpaceX Posts $4.4B First Profit Since IPO…", 4.8 px at 320 wide
         fix: give mosaic tiles a larger floor size, or a shorter tile headline
```
