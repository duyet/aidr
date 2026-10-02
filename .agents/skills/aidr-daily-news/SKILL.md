---
name: aidr-daily-news
description: Make the AI;DR Daily Brief — today's top AI stories as a news-broadcast video in 16:9 (YouTube, Facebook) and 9:16 (TikTok, Reels, Shorts), with voiceover, music, sound effects, burned-in captions, cover stills and per-platform post captions, rendered at 4K. Use when the user asks for "today's news video", "daily video", "daily brief", "news video for TikTok / YouTube / Facebook", "generate today's video", or to change the daily template under videos/daily-news/.
---

# aidr-daily-news

One template, a new edition every day. The template is `videos/daily-news/` (read its `README.md`: layout, commands, `script.json` and `config.json` fields). Your job each day is the editorial and creative part; scripts do the rest.

## Read first

1. `videos/daily-news/README.md` — the pipeline and every setting.
2. `videos/brand/brand.md` — palette, type, voice, the data rule, the avoid list.
3. Yesterday's `videos/daily-news/editions/<yesterday>/script.json` — so today looks different.
4. The `aidr-motion-designer` skill only if you change `template/`.

## The run

From `videos/daily-news/`. Use `command node` with the nvm `bin` on `PATH` if `node` is a shell function.

| # | Do | Check |
|---|----|-------|
| 1 | `git pull`, then `node scripts/fetch.mjs` | `edition.json` has `count` stories; note which have no image |
| 2 | Look at the media: a contact sheet of `editions/<date>/assets/` (ffmpeg `hstack`/`vstack`) | Drop media that belongs to another story and text-heavy OG cards (they crop badly in 9:16) |
| 3 | Write `editions/<date>/script.json` (rules below) | Valid JSON; every fact traceable to `edition.json` |
| 4 | `npx hyperframes auth status`, then `node scripts/voice.mjs <date>` | One wav + words file per line; listen to anything with names or numbers |
| 5 | `node scripts/build.mjs <date> --no-audio`, then snapshot both formats (README) and look at both contact sheets | No text over text, nothing clipped, captions clear of the copy, chrome readable |
| 6 | Fix in `script.json` (wording, `layout`, `images`, `*marker*`), rebuild. Change `template/` only for a real template bug | — |
| 7 | `node scripts/build.mjs <date>` (with sound), `lint` in `out/16x9` and `out/9x16` | 0 errors (about 65 structure warnings are expected) |
| 8 | `node scripts/render.mjs <date>` | Two 4K MP4s and two cover PNGs in `renders/` |
| 9 | Review: watch the renders, or run `aidr-video-review` on them | Voice and picture in sync, the stat lands on its word, no frozen stretch |
| 10 | Commit the sources (`script.json`, `edition.json`, `captions.srt`, `posts.md`, `timeline.json`, any template change); push when the owner asks | Renders, assets and voice stay ignored |
| 11 | Hand over: the MP4 and cover paths, duration, and `posts.md` | Say what was skipped |

The owner approved rendering the daily brief without a separate preview gate (2026-10-02). Posting to any platform still needs the owner: there are no posting credentials in this repo, so hand over files and copy.

## Writing script.json

**Facts.** Only what the story's bullet in `edition.json` says. Reword for the ear; never add a number, name, date or claim. Spell numbers the way they should be spoken ("sixty billion dollars"); the screen shows "$60B" in `stat`.

**Voice.** Plain, quick, no hype words ("game-changing", "insane"). Each story line: a rank cue ("Number one." / "Two." / "And six."), the news in one sentence, at most one short follow-up. 18–35 words per story keeps the cut near 60–75 s for six stories. Say "AI DR" and "aidr dot today" (captions turn them into "AI;DR" and "aidr.today").

**Intro, different every day.** Write a fresh intro line that carries the day: the date, the lead story, or a theme across the six ("Money and models today: ..."). Never reuse yesterday's line. `intro.title` is the on-screen line under the date.

**Screen text.**
- `kicker`: who or what, 2–5 words.
- `headline`: 5–9 words, the news itself; put `*stars*` around the 2–4 words that matter (the yellow marker). Not a copy of the voice line.
- `stat`: the one number or state that sums the story (`$60B`, `Public beta`, `SOTA`); `statLabel` gives it context; `statWord` is the spoken word it lands on.
- `category`: from `edition.json`; may be sharpened (a vulnerability story → `Security`).

**Creative choices — vary them every day.** Compare with yesterday and change at least two of:
- `theme.intro`: `date-slam` | `countdown` | `headline-stack` (all show the date).
- `theme.transition`: `wipe` | `ink` | `shutter`.
- `theme.background`: `paper` | `soft` | `grid`.
- Story `layout`s: `split` (image + column), `full` (big strong photo, card over it), `stat` (when the number is the story). Use `stat` at most twice, `full` only for photos that hold up full-bleed, and never the same layout three times in a row.
- `thumb`: the story and a 3–7 word hook that tells the grid what that day was about. Pick the biggest or most surprising story, not always #1.

**Images.** Prefer the post's real photo or product image. A story with no usable image gets `images: []` and a `paper` card (venue + title), which is the right look for papers and announcements. When a story needs a picture and has none, an agent may generate a still with the `google-flow-video` skill (save it to `editions/<date>/assets/`, add it to `images`) — label nothing as a real photo that is not one. Video b-roll is not supported by the template yet.

## Captions and post copy

`build.mjs` writes `captions.srt` (upload to YouTube; the video also has them burned in) and `posts.md` from `script.json` `post`:

| Field | Platform rule |
|-------|---------------|
| `post.youtubeTitle` | ≤ 100 chars, lead story + "& more" + date. Default is generated |
| `post.shortsTitle` | ≤ 92 chars; `#Shorts` is appended |
| `post.hook` | One sentence, used across platforms |
| `post.tiktok` | ≤ 150 chars: the 2–3 biggest names, then a question or 👇. 3–5 hashtags |
| `post.facebook` | 1–2 sentences naming the top stories; the build adds the list, the link and 4 hashtags |
| `post.hashtags` | 5–8: `AI`, `AINews`, then companies in the day's stories |

Platforms: YouTube (16:9 + Shorts 9:16), TikTok (9:16), Instagram Reels (9:16), the AI;DR Facebook Page (https://www.facebook.com/profile.php?id=61595124655150; 16:9 video or the 9:16 as a Reel). Covers: `cover-<date>-16x9.png` is the YouTube thumbnail; `cover-<date>-9x16.png` is the TikTok/Reels cover — on a profile grid each tile shows that day's date and hook.

## Changing the template

- Look and layout: `template/style.css` (`.f-16x9` / `.f-9x16` variables; layouts `.l-*`; intros; transitions).
- Motion: `template/motion.js` (one timeline; follow `aidr-motion-designer`; transforms and opacity only — `lint` rejects `left`/`top` tweens).
- Sound and timing: `config.json`.
- A new option (layout, intro, transition) goes in the CSS and motion, is read from `script.json`, and is listed in the README and above.
- After a template change, rebuild and snapshot an old edition too.

## Done

- [ ] `script.json` differs from yesterday in intro line and at least two creative choices.
- [ ] Every fact on screen and in the voice is in `edition.json`.
- [ ] Both contact sheets looked at; no overlaps or clipped text.
- [ ] Two 4K MP4s and two covers rendered; `posts.md` and `captions.srt` written.
- [ ] Sources committed; renders not.
- [ ] Report: paths, durations, what was skipped.
