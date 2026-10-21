---
name: aidr-post-review
description: Review the social posts of one AI;DR edition (Telegram EN @aidr_today, Telegram VI @aihomnay, Facebook EN) as a harsh editor before they are trusted, and score them out of 10 on a rubric of script-checked rows (caption caps, headline repeat, UTM, image, hashtag line, postability) plus judged rows (hook reads like news, Vietnamese reads natural). Use when a change touches notify/telegram.ts, notify/facebook.ts, headline-repeat.ts, post-quality.ts, the day card or story captions, when asked to "review", "score", "QA" or "check" today's posts, and before a post format change goes to the production channels. Nothing ships below 8/10.
---

# aidr-post-review

You are a harsh editor and you did not build these posts. Default: reject. Find what is wrong, name the post, say how to fix it.

Run this in a session that did not write the change under review.

## What is scored, and whether it is the sent text

`notify_posts` (migration 0070) stores the Telegram HTML of a sent story post. Nothing else is stored: not the digest message, not any Facebook text, and no story posted before 0070. So the script reads in this order:

1. A sent Telegram story post with a `notify_posts` row. The stored caption is scored as sent. The post shows `stored`.
2. Everything else is rebuilt from stored items with the worker's own pure builders: `buildStoryCaption` and `buildAlbumCaption` (notify/telegram.ts), `buildDigestMessage` after `fitHighlightDigest` for the day-card digest, `buildFacebookStory` and `buildFacebookDigest` (notify/facebook.ts). The post shows `rebuilt`. **The score for a rebuilt post is for rebuilt text.** It says what the code produces from today's stored data, not what went out. A post edited by hand in Telegram, or built from a summary that has changed since, can differ.

Rebuilt Telegram story captions use `notify_summaries` when a row exists (the send-time source), else the channel summary cut as the builder cuts it. The send path (`prepareStoryPost`) may call the LLM to write a missing caption summary. The script never does, so a rebuilt caption can differ there too.

When a channel has sent no story today, the script rebuilds the digest highlight it would post (the first of the day card's top three that passes the send gate) and says so in a `note:` line.

## Inputs

- Live: the D1 tables `notifications`, `notify_posts`, `notify_summaries`, `items`, `translations`, `tldr_snapshots`, read with `wranglerSelect` (SELECT only, refuses anything else). Needs a Cloudflare login that can read D1.
- Or a saved fixture: `--fixture apps/web/scripts/review/fixtures/<file>.json`.

No Telegram or Facebook call is made. No send or fetch path is imported for use. No LLM call. No write.

## Run

From the repo root:

```bash
pnpm --filter @aidr/web exec tsx scripts/review/post.ts                      # today's edition, live
pnpm --filter @aidr/web exec tsx scripts/review/post.ts --date 2026-10-20    # another local day (Asia/Ho_Chi_Minh)
pnpm --filter @aidr/web exec tsx scripts/review/post.ts --json /tmp/post.json
pnpm --filter @aidr/web exec tsx scripts/review/post.ts --save /tmp/post-input.json   # keep the loaded posts
pnpm --filter @aidr/web exec tsx scripts/review/post.ts --fixture apps/web/scripts/review/fixtures/post-bad.json
```

Output is the row table with each failed row's reasons (channel, story id8, what is wrong), then every post's text under `Posts reviewed`. Judge the two judged rows from that text.

Fixtures: `post-good.json` is a real edition (2026-10-21) that passes every auto row. `post-bad.json` is the same edition with one defect per post, so each auto row fails with a named post. The test is `apps/web/worker/__tests__/review-post.test.ts`.

## Rubric

| Row | Points | How to judge | Auto/Judged |
|---|---|---|---|
| `caption_cap` | 2 | Visible length (tags dropped, `&amp;` is one character) of a Telegram photo or album caption is 1024 or fewer. A Telegram text post or digest message is 4096 or fewer. A Facebook message fits Graph's 63,206. | Auto |
| `headline_repeat` | 1.5 | After the headline, no line equals it, and the summary does not open with a clause that only restates it (`withoutRestatedHeadline`, the #957 rule). A digest bullet's clause after its headline gets the same test. | Auto |
| `utm` | 1.5 | Every aidr.today link, in the text, in a button, or as the Facebook link attachment, has `utm_source` for its channel (`telegram` or `facebook`), `utm_medium=social`, `utm_campaign` `story` or `digest-<date>`. A story link's `utm_content` ends with `-<id8>`. A post with no aidr.today link fails. | Auto |
| `image` | 1.5 | Telegram story: at least one photo the media guard accepts (`imageVerdict`), else a text post whose publisher preview the guard accepts (`previewVerdict`, the #804 fallback). Digest: the versioned day card, else the day page preview. Facebook: the link attachment is an aidr.today page, whose og:image is the preview. No image and no fallback fails, and so does the first-party share card used as a photo. | Auto |
| `hashtags` | 0.5 | A Telegram story caption ends with `#category`, then optional `▲ n`, `💬 n`, `📎 +n more`, joined by two-space-dot-two-space. A story with no category fails. Digest messages and Facebook posts have no hashtag line by design and are not scored here. | Auto |
| `postability` | 1 | Story copy passes the send gate (`postableCopy`: not chrome, not short under 80 characters, not missing, translation gate, QA reject), and the real send would not withhold it as source copy. A story that was sent but now has no copy in the channel language fails. A digest bullet is not empty and carries no page chrome. | Auto |
| `hook_news` | 1 | The headline and the first summary line read like news: the fact first, no teaser, no clickbait, no "you won't believe", no source-page text. Read the EN and VI posts. | Judged |
| `vi_natural` | 1 | Vietnamese posts (Telegram VI) read as Vietnamese a reader would write. Look for word-for-word calques, doubled words ("lợi nhuận lợi nhuận"), English left in the middle of a sentence, lost numbers or names. | Judged |

## Scoring

- An auto row earns full points or none. The script decides it. Taste never overrules it. If an auto row fails on text you think is fine, fix the check in the script and its test, do not argue the score.
- A judged row earns full points, half when the defect is in one spot (one post, one bullet), or none.
- Total is auto points earned plus judged points. Max 10.
- Ship line: 8/10. Below 8, the posts do not ship. The script prints `cannot ship` once the best possible score is under 8.
- No posts to review is a fail on every auto row. It means the loader found nothing, not that the edition is clean.

## Report format

Return a table first.

| Row | Points | Result | Why |
|---|---|---|---|

Then list every lost point as one line: `<row> -<points>: <channel> <id8>: <what is wrong>. Fix: <the change>`. For example, `headline_repeat -1.5: facebook-en 980d4d8b: the summary repeats the headline as its first paragraph. Fix: run the summary through withoutRestatedHeadline in buildFacebookStory.` State whether each reviewed post was `stored` or `rebuilt`. End with the score out of 10 and ship or reject.

## Known gaps

- Telegram `video` posts and a story with a video asset: the script rebuilds the photo path and does not judge the video.
- Digest highlight and trending posts sent before migration 0070 have no stored caption, so they are always `rebuilt`.
- The Facebook image row trusts that an aidr.today page has an og:image. It does not fetch it.
