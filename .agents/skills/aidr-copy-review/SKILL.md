---
name: aidr-copy-review
description: Review AI;DR marketing copy (docs/marketing/*.md, a post draft, or the live meta description) against positioning.md before it is posted. A script checks banned words, brand spelling, mechanical unslop rules, and whether each number, handle, and tool name has proof. You judge voice and claims. Use when asked to review, check, or score copy, a launch post, a social template, or the site description, and before any marketing text is posted. Nothing ships below 8/10.
---

# aidr-copy-review

Review as someone who did not write the copy. Default: reject. Find the line, say what is wrong, say the fix.

## Inputs

- The copy: a markdown or text file, or nothing for the default run.
- The rules: `docs/marketing/positioning.md` ("Words to avoid", "Do not say", Voice, Proof points). The script reads it at run time, so a change there changes the review.
- The evidence: Proof points in `positioning.md` and `apps/web/ALGORITHM.md`.

## Run

From the repo root:

```bash
pnpm --filter @aidr/web exec tsx scripts/review/copy.ts                       # live edition
pnpm --filter @aidr/web exec tsx scripts/review/copy.ts path/to/draft.md      # one file
pnpm --filter @aidr/web exec tsx scripts/review/copy.ts --fixture <json>      # a frozen input
pnpm --filter @aidr/web exec tsx scripts/review/copy.ts --json /tmp/copy.json # also write the report
```

- With no file, it reads `docs/marketing/launch-post.md`, `social-templates.md`, and `README.md`, then GETs the meta description of `https://aidr.today` and `https://aidr.today/about`. Nothing is written and nothing is posted. If a page cannot be fetched, the run stops with an error. Do not score without it.
- With a file argument, it scores only that file. Paths are relative to where you ran `pnpm`.
- Exit code 0 means the best possible score is at least 8. The script cannot award judged points.

## Rubric

| Row | Points | How to judge | Auto/Judged |
| --- | --- | --- | --- |
| `banned.words` | 2 | No word or phrase from the "Words to avoid" line or a "Do not say" sentence in `positioning.md`. | Auto |
| `brand.spelling` | 1 | The brand is `AI;DR` and the domain is `aidr.today`. Not `AIDR`, `AI DR`, `Aidr.today`, or `AI News` as the name. | Auto |
| `unslop.mechanical` | 2 | No long dash (unslop 13), colon as a mid-sentence connector (14), AI vocabulary (7), "serves as" (8), "not just X, but Y" (9), ", ensuring" tails (3), vague attribution (5), filler (23), plain-word swaps (31), metaphor nouns (26), chatbot or sycophantic phrases (20, 22), decorative emoji (18), curly quotes (19). | Auto |
| `claim.proof` | 2 | Every number, `@handle`, email, and snake_case tool name appears in Proof points, or a number appears in `ALGORITHM.md` next to the same unit ("16 bullets"). | Auto |
| `claim.pipeline` | 1 | Each sentence about what the pipeline does maps to a Proof points row, `ALGORITHM.md`, code, or the live page. The number sits on the right claim: 6 stories is Telegram, 16 bullets is per language, 5 per source family. Spelled-out numbers ("five times") count too. | Judged |
| `voice.facts` | 1 | Short sentences. Facts first, then the link. It says what the pipeline does with its numbers and admits the limit: a machine picks the stories and gets some wrong. | Judged |
| `unslop.judged` | 1 | Unslop rules a script cannot decide: rule of three (10), synonym cycling (11), false ranges (12), bold and inline-header lists (15, 16), title case (17), hedging (24), generic conclusions (25), feeling words (27), dense or passive sentences (28, 29), adverbs (30), flourish (32), over-compression (33). Read the Vietnamese copy for the same patterns. | Judged |

The script only checks what is reliable. A pass on `claim.proof` means the number exists somewhere in the evidence, not that it sits on the right claim. That is why `claim.pipeline` is yours.

## Scoring

- An auto row earns its full points or none. Taste never overrules an auto FAIL.
- A judged row earns full points, or half when the defect sits in one spot. Round the total down.
- The total is the auto points earned plus your judged points, out of 10.
- Ship at 8/10. Below 8 does not ship.
- A live-meta hit is a real finding even though that text lives in `apps/web/src/lib/site.ts` or a route, not in `docs/marketing`. Report it with the file that owns it.

## Report

1. The score out of 10 and the row table (row, points earned of points possible).
2. For every lost point, the `file:line` or live page, the offending text, and the exact rewrite. "Line 12: 'real-time' is banned, runs are 30 minutes apart. Write 'every 30 minutes'." Not "the tone feels off".
3. The five fixes that gain the most points, in order.
4. What you could not check (a page that failed to load, a claim with no evidence anywhere).

## Loop

The author fixes the copy and the review runs again on the changed file. Repeat until the score is 8 or higher. If a banned word or proof point is wrong, change `positioning.md` in its own change, not the copy.
