---
name: aidr-digest-review
description: Review the AI;DR TL;DR digest (tldr_snapshots, GET /api/public tldr.bullets_en and bullets_vi) before it goes to email, Telegram or Facebook. Checks bullet count and length, item_ids that resolve to a story with a URL, duplicate stories, EN/VI parity and language, numbers that are not in the source items, first-person voice and page chrome, then judges the lead and the EN/VI facts. Use after any change to worker/tldr.ts, the TL;DR prompt, selectEdition or the VI translation of bullets, when asked to review, QA, score or check the digest, and before a digest is sent or re-sent. Nothing ships below 8/10.
---

# aidr-digest-review

You did not write this digest. Default: reject. Find what is wrong, say which bullet and which item,
and say how to fix it. Run this in a session that did not build the change under review.

## Inputs

- Today's live edition: `GET https://aidr.today/api/public?lang=en` and `?lang=vi`. EN bullets come
  from the first, VI bullets from the second, so a language fallback shows up.
- The stored items the bullets cite, read-only through `wranglerSelect` (`apps/web/scripts/cf-d1.ts`,
  SELECT only). The public stories carry no summary, so the numbers check needs this.
- A past edition by ICT date (`--date YYYY-MM-DD`), or a saved edition (`--fixture file.json`).
- The pipeline contract: `apps/web/ALGORITHM.md` section 10 and `apps/web/worker/tldr.ts`.

## Run

From the repo root:

```bash
pnpm --filter @aidr/web exec tsx scripts/review/digest.ts                      # today, live
pnpm --filter @aidr/web exec tsx scripts/review/digest.ts --date 2026-10-14    # a stored edition
pnpm --filter @aidr/web exec tsx scripts/review/digest.ts --fixture apps/web/scripts/review/fixtures/digest-good.json
pnpm --filter @aidr/web exec tsx scripts/review/digest.ts --json /tmp/digest.json
```

It prints every row as PASS, FAIL (with the bullet and the reason) or `judge`, then the automatic
total. Exit code 1 means the best possible score is under 8. It calls no LLM and writes nothing.

## Rubric

Points sum to 10.

| Row | Points | How to judge | Auto/Judged |
| --- | --- | --- | --- |
| count | 1 | 1 to 16 bullets in each language (`TLDR_MAX_ITEMS`), and at least `usefulTldrFloor` (8 on a normal day, fewer when the edition has fewer stories) | Auto |
| length | 1 | Every bullet is 150 to 270 characters. The prompt asks for "about 2 sentences or 180-240 characters" (`worker/llm.ts`, ALGORITHM.md section 10); the check allows 30 characters either side | Auto |
| ids | 1 | Every bullet cites at least one item_id, and each id is in the edition (stories list or D1 `items`) with a URL | Auto |
| dupes | 1 | No item id in two bullets of one language, no URL shared by two cited items, no near-duplicate headlines across bullets (`isTitleNearDuplicate`) | Auto |
| parity | 1 | EN and VI have the same bullet count and the same item_ids in the same order | Auto |
| language | 1 | VI bullets have Vietnamese diacritics and EN bullets do not (`looksVietnamese`); VI is not English-only (`isEnglishOnlyViTldr`); no VI bullet equals its EN bullet or a headline (`worker/digest/edition.ts`: columns never fall back to each other) | Auto |
| numbers | 1 | Every number in a bullet is in the title, summary or `title_vi` of the items it cites. `$16.3B`, `16,3 tỷ USD` and `16.3 billion` are one value. A VI bullet also passes the magnitude and decimal-comma checks of `draftIssuesByCheck` (`worker/translation-draft-check.ts`). Bare single digits are skipped | Auto |
| voice | 1 | No first person (`I`, `we`, `our`, `tôi`, `chúng tôi`, `chúng ta`) outside quotes, no page chrome (`hasSourceChrome`), no `[id]` citation, no emoji in the text | Auto |
| lead | 1 | Each bullet opens with the news: who did what. The why comes second and comes from the cited items. No scene-setting opener, no filler | Judged |
| facts | 1 | The VI bullet carries the same names, numbers, dates and hedges as the EN bullet with the same ids, and adds nothing | Judged |

## Scoring

- An automatic row earns its full point or none. Taste never overrules it: if the script says FAIL,
  fix the digest or fix the script, and say which.
- A judged row earns 1 when every bullet passes, 0.5 when the defect is in one bullet, 0 otherwise.
- Total = automatic points earned + judged points. Ship at 8 out of 10.
- A number the script cannot match may be a figure written as a word ("two million") or a sum the
  model computed. Check the source item. A computed figure is still a FAIL: the digest may not
  state a number its sources do not.

## Judge the two rows by hand

Read the EN and VI bullets side by side for the same item_ids. Open the cited items when a figure or
a name looks new. For `lead`, read only the first clause of each bullet and ask what happened. For
`facts`, tick off names, numbers and hedges ("reportedly", "may") one by one.

## Report

1. The row table: row, points earned, PASS / FAIL / half.
2. Score: `N/10`, and `SHIP` or `REJECT`.
3. For every lost point: the language, the bullet number, the item id (first 8 characters), what is
   wrong, and the fix (regenerate through the admin dry run, edit the prompt, fix the item's
   `title_vi`, or drop the story).
4. If it rejects, the single change that recovers the most points first.
