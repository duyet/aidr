---
name: aidr-daily-news
description: Make the AI;DR Daily Brief — today's top AI stories as a two-anchor TV news video in 16:9 (YouTube, Facebook) and 9:16 (TikTok, Reels, Shorts), with a summary-grid opening, real post images, voices, music, sound effects, burned-in captions, cover stills and per-platform post captions, rendered at 4K. Use when the user asks for "today's news video", "daily video", "daily brief", "news video for TikTok / YouTube / Facebook", "generate today's video", or to change the daily template under videos/daily-news/.
---

# aidr-daily-news

One template, a new edition every day. Scripts do the mechanics; your job is the newsroom: pick the pictures, write the anchors' lines and the screen text, and make today look different from yesterday.

Reference for every file and field: `videos/daily-news/README.md`. Brand rules: `videos/brand/brand.md`.

## The run (three commands and one writing pass)

From `videos/daily-news/`. If `node` is an nvm shell function, put `~/.nvm/versions/node/<v>/bin` on `PATH` and call `command node`.

```bash
git pull
node scripts/new.mjs                 # fetch edition + media, assets-sheet.jpg, draft script.json
# → read editions/<date>/assets-sheet.jpg and edition.json, then rewrite script.json (below)
node scripts/daily.mjs <date>        # refuses drafts; voice → build → lint → snapshots
# → read snap-16x9/ and snap-9x16/ contact sheets; fix script.json; rerun daily.mjs
node scripts/daily.mjs <date> --render   # two 4K MP4s + two cover PNGs in renders/
```

Vietnamese cut, when asked: write `script.vi.json` from the edition's `text_vi` (same facts, Vietnamese hosts `thanh`, `duc-huy`, `an-nhien`, `phan-anh` in the seeded order, statWord without diacritics is fine), then `daily.mjs <date> --lang vi [--render]`. Avoid descenders in a giant `stat` (`−20 TỶ USD`, not `tỷ`).

Then commit the sources (`script.json`, `edition.json`, `captions.srt`, `posts.md`, `timeline.json`, template changes) on a branch, push when the owner asks, and hand over the MP4 and cover paths, the duration and `posts.md`. Renders, media and voice files stay ignored.

`new.mjs` never overwrites a written `script.json` (use `--force` to redraft). Voice parts are cached per sentence, so rerunning `daily.mjs` after a wording fix only re-voices the changed sentence. Voices use `$ELEVENLABS_API_KEY` (check the character quota first: `GET /v1/user/subscription`); HeyGen is the fallback and its sign-in expires about hourly: `npx hyperframes auth status`, and `npx hyperframes auth login` when it is not valid.

The owner approved rendering the daily brief without a separate preview gate (2026-10-02). Posting needs the owner: there are no posting credentials here, so hand over files and copy.

## Writing script.json

The draft has every field, `TODO`s, and a `_bullet` per story holding the source text. `daily.mjs` refuses to run until every `TODO` and `_bullet` is gone.

### Facts

Only what the story's bullet in `edition.json` says. Reword for the ear; never add a number, name, date or claim. Spell numbers as spoken ("sixty billion dollars"); the screen shows "$60B" in `stat`.

### Anchors: talk like TV

- Anchors are the hosts in `videos/brand/voices.json` (see Voices below), named by key: `alex`, `allison`, `tyler-cruz`, `ivanna`, `kristen` (English). `new.mjs` drafts them in the day's seeded order; keep that order unless a line reads better with another host. The HeyGen pair (Gareth, Tabitha, `config.voice.heygen`) stands in when ElevenLabs fails. A line is a list of `{ "anchor", "text" }` parts; hand off mid-story when there is a natural second beat (the detail, the consequence, the "why it matters"). Single-anchor stories are fine; vary who leads.
- **No rank cues and no filler.** Never "Number one", "Two", "Next up", "Let's go", "Moving on". Each story opens on the news itself: the subject and the verb ("Cloudflare is launching Clef…"). Light anchor segues are allowed only as part of the news: "In research, …", "Meanwhile at Microsoft, …", "And finally, …" for the last story.
- Present tense or present perfect ("is launching", "has released"). Plain words, no hype ("huge", "insane", "game-changing").
- 18–35 words per story keeps six stories near 70–85 s.
- Intro: anchor A gives the show and the date ("This is AI DR, your AI news for Friday, October second."); anchor B adds a fresh line about today — the lead story or the day's theme ("Money and models today."). Never reuse yesterday's line.
- Outro: the sign-off with "aidr dot today" and a short goodbye. Spoken "AI DR" and "aidr dot today" show as "AI;DR" and "aidr.today" in captions.

### Screen text

- `kicker` — who or what, 2–5 words (auto-shrinks to one line).
- `headline` — 5–9 words, the news itself, not a copy of the voice. `*stars*` mark the 2–4 words the yellow marker sweeps.
- `stat` + `statLabel` — the one number or state that sums the story (`$60B`, `Public beta`, `SOTA`). `statWord` is the spoken word it lands on (first word of the stat as spoken, e.g. `sixty`).
- `category` — from the edition; sharpen it when wrong (a vulnerability → `Security`).

### Pictures

Read `assets-sheet.jpg` (tiles row by row in the printed file order). Keep each story's best real photo or product image first in `images`. Drop media that belongs to another story and text-heavy OG cards (they crop badly in 9:16 and the grid). No usable image → `images: []` plus `paper: { venue, title }`, the typographic card. An agent may generate a still for a story with no picture using the `google-flow-video` skill (save it to `assets/`, list it in `images`); never present a generated image as a real photo. Video b-roll is not supported yet.

### Make it look different every day

- The opening is always the **summary grid** (`theme.intro: "grid"`): frame 0 shows every story's picture, number and headline with the date, so the first frame works as a thumbnail and the viewer sees the whole show at once. Other intros (`date-slam`, `countdown`, `headline-stack`) exist; use them only when the owner asks.
- The intro line names one or two stories; set `intro.focus` (`[{ "rank", "word" }]`) so those grid tiles lift on the spoken word — the grid otherwise holds still for the whole intro.
- `new.mjs` rotates `theme.transition` (`wipe` | `ink` | `shutter`) and `theme.background` (`paper` | `soft` | `grid`) against yesterday; keep or change, but not both the same as yesterday.
- Story `layout`: `split` (image + column), `full` (strong photo full-bleed, card over it), `stat` (the number is the story). `stat` at most twice, `full` only for photos that hold up large, never the same layout three times in a row.
- `thumb` — the story and a 3–7 word hook for the cover still. Pick the biggest or most surprising story, not always #1.

## Captions and post copy

`build.mjs` writes `captions.srt` (YouTube upload; captions are also burned in) and `posts.md` from `script.json` `post`:

| Field | Rule |
|-------|------|
| `post.hook` | One sentence used across platforms |
| `post.youtubeTitle` | ≤ 100 chars: the lead story, "& more", the date (default generated) |
| `post.shortsTitle` | ≤ 92 chars; `#Shorts` is appended |
| `post.tiktok` | ≤ 150 chars: the 2–3 biggest names, then a question or 👇 |
| `post.facebook` | 1–2 sentences naming the top stories; the build adds the list, link and hashtags |
| `post.hashtags` | 5–8: `AI`, `AINews`, then the companies in today's stories |

`posts.md` links the day page `https://aidr.today/date/<date>` and folds YouTube chapters shorter than 10 s (a short intro takes the first story's title at 0:00).

Where it goes: YouTube (16:9, `cover-<date>-16x9.png` as thumbnail, `captions.srt`), YouTube Shorts, TikTok, Instagram Reels (9:16, `cover-<date>-9x16.png` as cover), and the AI;DR Facebook Page https://www.facebook.com/profile.php?id=61595124655150 (16:9 video, or the 9:16 as a Reel).

## Review before handing over

From the contact sheets and, after render, a few frames of each MP4:

- Frame 0 is the full grid with the date; every tile readable.
- No text over text; captions clear of the copy card; the chrome bar readable.
- The stat lands with its word; anchors alternate as written; no dead air longer than a breath.
- Every fact on screen and in the voice is in `edition.json`.
- For a deeper pass, or after a template change, run `aidr-video-review` on the renders.

## Changing the template

- Look and layout: `template/style.css` (`.f-16x9` / `.f-9x16` variables; layouts `.l-*`; intros; transitions).
- Motion: `template/motion.js` (one paused timeline; follow `aidr-motion-designer`; tween transforms and opacity only — `lint` rejects `left`/`top` tweens).
- Voices, music, effects, timing, captions: `config.json`. Add a host to `videos/brand/voices.json` (with `name` and `gender`); voice settings live there too.
- A new option goes in the CSS and motion, is read from `script.json`, and is listed in the README and here. Rebuild an older edition too.

## Done

- [ ] `script.json` has no rank cues or filler, a fresh intro line, and differs from yesterday in transition or background.
- [ ] Every fact traces to `edition.json`.
- [ ] Both contact sheets looked at; frame 0 is the grid.
- [ ] Two 4K MP4s and two covers in `renders/`; `posts.md` and `captions.srt` written.
- [ ] Sources committed; renders not. Report: paths, durations, anything skipped.

## Voices

The voice cast lives in `videos/brand/voices.json` (ElevenLabs): five
English hosts and four Vietnamese hosts, the owner's picks. Every voiced
AI;DR video — release films, the daily brief, changelog/feature clips —
uses it the same way: hosts alternate per scene or story like a TV show or
podcast, never the same voice twice in a row, opener and closer differ,
order from a seeded shuffle (seed = edition date or release version) so
re-renders match. Short natural hand-offs between hosts are fine. Add a
voice to the account from the shared library when it is missing
(`POST /v1/voices/add/{public_owner_id}/{voice_id}`).

## Delegation

To keep the daily cheap, hand the mechanical steps to subagents named
`<model>-<level>-<task>`: `haiku-low-*` for the render and status report,
contact sheets, and the oEmbed check after upload; `sonnet-medium-*` for
`posts.md` copy and the Vietnamese `script.vi.json`. Picking pictures,
writing the anchors' lines, the frame review and anything on the owner's
Chrome stay in the main session. Renders and uploads are serial. Full plan:
`aidr-release` → Delegation.
