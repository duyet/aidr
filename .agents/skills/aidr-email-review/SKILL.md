---
name: aidr-email-review
description: Review the AI;DR daily digest email, EN and VI, for today's edition (or a stored fixture) before or after a change to worker/mail, worker/subscribe or the digest pipeline. Renders the mail as a pure function with a dummy unsubscribe token, never sends, and scores it on a 10-point rubric (Gmail clip size, unsubscribe link and header, plain-text part, image alt text, subject language, UTM, plus a judged mobile and dark mode row). Use when asked to "review", "QA", "check" or "score" the digest email. Nothing ships below 8/10.
---

# aidr-email-review

You did not write this mail. Default: reject until the rows say otherwise.

## Inputs

- Today's live edition from `GET https://aidr.today/api/public?lang=en` (it carries `bullets_en`, `bullets_vi` and the `stories` rows the mail joins to).
- Or a fixture: `apps/web/scripts/review/fixtures/email-*.json` (same shape, trimmed).
- The renderer the send path uses: `digestBulletsWithItems` and `buildDigestEmail` in `apps/web/worker/subscribe/send.ts`, `listUnsubscribeHeaders` in `apps/web/worker/mail/render.ts`.

The script never imports or calls a sender. The day video is not in the public API, so the review renders without the video block.

## Run

From the repo root:

```bash
pnpm --filter @aidr/web exec tsx scripts/review/email.ts
pnpm --filter @aidr/web exec tsx scripts/review/email.ts --fixture scripts/review/fixtures/email-2026-10-21.json
pnpm --filter @aidr/web exec tsx scripts/review/email.ts --json /tmp/email-review.json
```

There is no `--date`: the public API serves only today's edition. Score an older day through a fixture.

The live run also sends one token-free `GET https://aidr.today/subscribe` to confirm the unsubscribe page answers. Never request `/api/subscribe?token=...`: that endpoint unsubscribes.

To view the mail, save `html` from `renderEdition` to a file and open it at 375px wide, in light and dark mode.

## Rubric

| Row | Points | How to judge | Auto/Judged |
| --- | --- | --- | --- |
| size | 2 | HTML is under 102 KB, where Gmail clips. The repo states no limit, so this uses Gmail's. | Auto |
| unsubscribe | 2 | The HTML and plain text both link `/subscribe?unsubscribe=<token>`. `List-Unsubscribe` lists URLs whose paths match files in `src/routes`. `List-Unsubscribe-Post` is one-click. A live GET of `/subscribe` answers 2xx or 3xx. | Auto |
| plain-text | 1.5 | The text part is not empty and links every story (`/<id8>`). | Auto |
| img-alt | 1 | Every `<img>` has non-empty alt text. | Auto |
| subject | 1.5 | The EN subject has no Vietnamese diacritics. The VI subject has them. Each starts with the lead story's headline in its language. | Auto |
| utm | 1 | Every aidr.today link without a subscriber token carries `utm_source=email`, `utm_medium=digest`, `utm_campaign=digest-<date>` (`worker/utm.ts`). | Auto |
| mobile-dark | 1 | At 375px nothing overflows, tap targets are easy to hit, text is readable. In dark mode, text and the wordmark keep contrast. | Judged |

## Scoring

- An auto row earns full points or none. Taste never overrules it.
- A judged row may earn half when the defect is in one spot.
- Ship at 8/10. Below 8, it does not ship.

## Report

1. The script's row table, as printed.
2. The judged row's score and one line on why.
3. Every lost point: the row, the language, the item id (`/<id8>`), and the fix.
4. The total and ship or no ship.
