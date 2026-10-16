# daily-news — AI;DR Daily Brief

A news-broadcast video of the day's top AI stories, rendered every day in two shapes from one template:

| Format | Size (render) | Goes to |
|--------|---------------|---------|
| `16x9` | 3840x2160 (authored 1920x1080) | YouTube, Facebook Page video |
| `9x16` | 2160x3840 (authored 1080x1920) | TikTok, Reels (Instagram + Facebook), YouTube Shorts |

Look: "Yellow Desk". It opens on one of seven intros, rotated by date (the summary grid, a cover, a date panel, a chapter numeral, the semicolon hinge, a numbered list, a masthead); each shows the date and real pictures on frame 0, so the first frame works as a thumbnail. Then two anchors read the news like TV. Paper ground, AI;DR yellow, EB Garamond headlines, a live broadcast bar with a story counter, an ink news crawl, yellow stinger wipes that carry the next rank, real post images with a slow push, the headline swept by the yellow marker, the key number landing on its spoken word, and burned-in word-by-word captions.

The agent skill for the daily run is `.agents/skills/aidr-daily-news/`. This page is the reference.

## Layout

| Path | Tracked | What it is |
|------|---------|------------|
| `config.json` | yes | Template-wide settings: count, formats, voice, music, effects, timing, captions |
| `template/style.css` | yes | The shared layout, both formats (`.f-16x9` / `.f-9x16` variables): chrome, the split story, captions, outro |
| `template/motion.js` | yes | The single GSAP timeline, driven by `window.__DN` from the build; it calls the day's variants from `window.__LOOK` |
| `scripts/looks/` | yes | The look registry: one entry per intro, transition, background and story layout, each with its markup, CSS, motion and sound cues. Add a variant by adding an entry |
| `scripts/fetch.mjs` | yes | Edition + real post media from `https://aidr.today/api/public?lang=en` |
| `scripts/new.mjs` | yes | Start the day: fetch, media contact sheet, draft `script.json` (`--week` for the weekly edition) |
| `scripts/fetch-week.mjs`, `scripts/week.mjs`, `scripts/media.mjs` | yes | Weekly edition fetch; ISO-week math (with `week.test.mjs`); download helper shared with `fetch.mjs` |
| `scripts/daily.mjs` | yes | Voice → build → lint → snapshots (→ render) for a written script |
| `scripts/voice.mjs` | yes | ElevenLabs TTS (the cast in `../brand/voices.json`) per sentence and anchor, HeyGen as fallback, joined per segment, with word timings; checks the ElevenLabs quota first and switches the whole cut to no-voice when it is short |
| `scripts/novoice.mjs` | yes | The no-voice helpers: reading-speed word timing, the quota check, `QuotaError` |
| `scripts/lang.mjs` | yes | The cut's language (`--lang vi`) and its file names |
| `scripts/cast.mjs` | yes | The voice cast: host keys, seeded host order, the "never twice in a row" check |
| `scripts/look.mjs` | yes | The day's look (intro, transition, background, choreography) from the edition's date, and each story's layout from the images on disk, resolved at build time |
| `scripts/sound-measure.mjs` | yes | Measures every effect's peak and level and the music bed's phrase starts with ffmpeg; prints the tables `scripts/looks/sound.mjs` holds |
| `scripts/build.mjs` | yes | Timeline, both compositions, audio mix, captions, covers, post copy |
| `scripts/grid.mjs` | yes | The summary grid's layout per format and story count (1–8): areas, tracks, and the tile type scale, so frame 0 has no empty cell; an odd count gives the lead story a hero tile (with `grid.test.mjs`) |
| `scripts/render.mjs` | yes | 4K MP4s and cover PNGs |
| `scripts/publish.mjs` | yes | The one idempotent runner: render → upload → attach → telegram, state in `STATUS.json` |
| `scripts/auto-script.mjs` | yes | Writes `script.json` without an agent (scheduled run): model via anyrouter, checked, else a template from the bullets; fits the length to the Reel limit |
| `scripts/gate.mjs` | yes | Quality gate: ffprobe streams, Reels spec (3–90 s, 9:16, ≥540x960, 24–60 fps), text lint (the Worker's engagement-bait regex) |
| `scripts/facebook-reel.mjs` | yes | Facebook Reel upload (Graph API Reels publishing); used by `publish.mjs --steps facebook`, and a CLI for any 9:16 mp4 |
| `scripts/*.test.mjs` | yes | `node --test videos/daily-news/scripts/*.test.mjs` (runs in CI) |
| `scripts/visub.mjs` | yes | The `visub` cut's captions: translates `captions.srt` to Vietnamese (model chain + the Worker's house style), writes `captions.visub.json` / `.srt` with the English cue times; `--youtube` writes its Vietnamese YouTube metadata, `youtube.visub.json` |
| `scripts/visub-screen.mjs` | yes | The `visub` cut's screen text: the edition's Vietnamese where it has it, else the `visub.mjs` model chain; writes `screen.visub.json` |
| `scripts/status.mjs` | yes | `STATUS.json` row helpers for `publish.mjs`: rows per cut, what render and telegram still have to do |
| `scripts/telegram-video.mjs` | yes | Telegram helpers for `publish.mjs`: under-50 MB copy, thumbnail, `sendVideo`; `--file <mp4> --chat <id>` sends a single test clip |
| `editions/<date>/edition.json` | yes | What the API said that day (the facts) |
| `editions/<date>/script.json` | yes | The day's creative choices and spoken script (written by the agent) |
| `editions/<date>/captions.srt`, `posts.md`, `timeline.json` | yes | Generated, kept as the day's record |
| `editions/<date>/captions.visub.json`, `captions.visub.srt` | yes | The `visub` translation (cache: the same English cues reuse it; the same texts at new times are retimed) |
| `editions/<date>/youtube.visub.json` | yes | The `visub` YouTube title, description and tags (`lines` caches each English description line's Vietnamese) |
| `editions/<date>/screen.visub.json` | yes | The `visub` screen text, one `{ en, vi, from }` per field (cache: a field whose English is unchanged is kept) |
| `editions/<date>/STATUS.json` | no | One row per cut (`<date>-<lang>-<fmt>`): render facts, YouTube id/url, attached, Telegram message |
| `editions/<date>/assets/`, `assets-sheet.jpg`, `voice/`, `out/`, `renders/`, `snap-*/` | no | Third-party media and regenerable output |

## Daily run

From `videos/daily-news/` (on machines where `node`/`npx` are nvm shell functions, put `~/.nvm/versions/node/<v>/bin` on `PATH` and call `command node`):

```bash
node scripts/new.mjs                     # fetch edition + media, assets-sheet.jpg, draft script.json
# write editions/<date>/script.json      # the agent: replace every TODO, rewrite the voice, delete _bullet
# in parallel, a sonnet subagent writes script.vi.json from the edition's text_vi (Vietnamese hosts)
node scripts/publish.mjs <date> --steps render   # daily.mjs --render per language: 4K MP4s + covers, fills STATUS.json
# review snap-*/ contact sheets and the renders
node scripts/publish.mjs <date> --steps upload,attach   # YouTube (serial, owner's Chrome), then the day page
node scripts/publish.mjs <date> --steps telegram        # staging chat first
node scripts/publish.mjs <date> --steps telegram --prod # then the real channels
```

`publish.mjs <date> [--lang en,vi,visub] [--steps render,gate,upload,attach,facebook,telegram] [--no-voice] [--chat <id>] [--prod] [--telegram-fmt 16x9|9x16] [--telegram-mode video|card] [--dry-run]` never writes scripts: it exits with a message when `script.json` / `script.vi.json` is missing or still a draft. State is `editions/<date>/STATUS.json`, one row per cut (`<date>-<lang>-<fmt>`: `path`, `cover`, `state`, `voice` (`true` narrated, `false` no-voice), `sizeMB`, `duration`, `youtube {id,url}`, `uploadError {at,why}` (the last failed upload), `attached`, `telegram {chat_id,message_id,file?}`, `telegramTest` for staging and `--chat` sends); every step skips cuts it already finished (YouTube cannot replace a file, Telegram cannot unpost), so a rerun resumes. Uploads run one at a time and stop on the first failure; 16x9 is a `long` video with its cover as thumbnail, 9x16 a `short`. The uploaders print `ID=` before the thumbnail, playlist and oEmbed steps, so a run that fails after it still records the id (and `uploadError`): a rerun never uploads that cut again. `attach` runs `agent day-video` with each cut's id (16:9 `--video`, 9:16 `--short`) and the title from `posts.md`. `telegram` uploads the video file itself with Bot API `sendVideo` (per language, `--telegram-fmt` cut, default 16x9): an H.264/AAC copy `renders/<name>-tg.mp4` under 50 MB (1080p, bitrate retry if still over), the cover as a <=320 px JPEG thumbnail, duration/width/height, `supports_streaming`, the `posts.md` YouTube title as the HTML caption, and buttons "▶ YouTube" (only when the cut has a YouTube id) and the day page. It needs the render, not the YouTube upload. Needs `TELEGRAM_BOT_TOKEN` (env or `.env.local`); `ffmpeg`/`ffprobe` come from `$FFMPEG`/`$FFPROBE` or PATH (ffprobe optional). It posts to `$TELEGRAM_STAGING_CHAT_ID` (env or `.env.local`) unless `--chat` is given; only `--prod` posts to the real channels (`$TELEGRAM_EN_CHAT_ID` / `$TELEGRAM_VI_CHAT_ID`, else `@aidr_today` / `-1004420104760`). Only a `--prod` post to the real channel marks the cut done (`telegram`) and is recorded on the Worker for the day video watchdog (`agent day-video-posted`, `day_video_posts`); a staging or `--chat` send is kept as `telegramTest`, so checking in staging never blocks the `--prod` post. A `sendVideo` error stops the step with Telegram's message (no link-post fallback). `--telegram-mode card` keeps the old Worker path (`agent day-video-telegram`: YouTube thumbnail card, needs the attached ids). `--dry-run` prints every command and runs none.

The anchors are the cast in `../brand/voices.json`: several voices per cut, alternating per story, seeded by the date (see `scripts/cast.mjs`).

The single steps still work on their own: `daily.mjs <date> [--lang vi] [--render]` (refuses drafts; voice → build → lint → snapshots in `snap-16x9/`, `snap-9x16/`).

**Vietnamese cut.** Write `editions/<date>/script.vi.json` (same shape; Vietnamese voice and screen text from the edition's `text_vi`/`title_vi`, anchors from the `vi` hosts in `voices.json`), then add `--lang vi` to `daily.mjs`, `voice.mjs`, `build.mjs` or `render.mjs`. It writes `voice-vi/`, `out-vi/`, `snap-vi-*/`, `captions.vi.srt`, `timeline.vi.json`, the `vi` block of `posts.md` (links with `?lang=vi`), and `renders/aidr-daily-<date>-vi-<fmt>-4k.mp4` / `cover-<date>-vi-<fmt>.png`. Screen labels (date, "BẢN TIN NGÀY", "nguồn") come from the `UI` table in `build.mjs`.

**Vietnamese subtitles (`visub`).** The English cut with Vietnamese captions and Vietnamese screen text, for the Vietnamese Telegram channel: no Vietnamese voice and no `script.vi.json`. `--lang visub` needs the English cut built on the same machine (`voice/`, `out/mix.wav`, `timeline.json`, `captions.srt`). `visub.mjs <date>` translates the English captions: consecutive cues up to `.`/`!`/`?` go to the model as one sentence (the `auto-script.mjs` chain, `ANYROUTER_LOCAL_API_KEY` locally and `ANYROUTER_API_KEY` in CI; the style is `VI_STYLE` + `RULES_OVERVIEW` read from `apps/web/worker/llm.ts`), and the Vietnamese is split back over that sentence's cues by English length, so every cue keeps its English start and end. Each answer is checked (line count, no empty or untranslated line, every number kept, `AI;DR` and `aidr.today` kept, text lint); a failure tries the next model, and no key or no valid answer exits 1. The YouTube title is translated in the same call for the Telegram caption and the YouTube upload. A title over YouTube's 100 characters never discards the lines: the same model is asked once for a shorter one (the limit and the length in the prompt), and if that fails or is still long, the title is `Bản tin AI;DR | <edition date>` with the date from `<date>` written as the Vietnamese titles write it (`3/10/2026`), or `Bản tin AI;DR` alone when `<date>` is not a day (a weekly edition). Model text is never cut, and the fallback takes nothing from it: a cut Vietnamese clause can drop the words that reverse or limit it, and a date read from the model's title can be a number or a false date. `visub-screen.mjs <date>` writes the screen text a viewer reads in Vietnamese to `screen.visub.json`: each story's category, kicker, headline, stat, statLabel and paper card, plus `intro.title`, `outro.title`, `outro.follow` and `thumb.hook`. A string the edition already has in Vietnamese takes that copy (a script field equal to the story's `title` takes `title_vi`, `text` takes `text_vi`, a category takes `CATEGORY_VI` from `apps/web/worker/mail/render.ts`); the rest goes to the same model chain with the story's `title_vi`/`text_vi` as the wording to follow. Each field is checked like a caption line, plus the headline's `*marker*` spans, the `auto-script.mjs` word limits (kicker 1-6, headline 3-12; a Vietnamese syllable counts as a word), and every name the site's Vietnamese keeps as written. A field that fails goes to the next model; a field no model gets right exits 1. `--force` translates every field again. `build.mjs --lang visub` rebuilds the English timeline from the same voice (it refuses a cache whose cues or times differ, a `screen.visub.json` that does not match `script.json`, or a stale English build), copies `out/mix.wav`, burns the Vietnamese words spread evenly over each cue, lays `screen.visub.json` over the English script (voice, `statWord`, `intro.focus`, images and layout stay English, so the stat and the grid focus land on the English words), takes the labels and the dateline from the `vi` `UI` table, and writes `out-visub/16x9` and `out-visub/cover-16x9`. `render.mjs --lang visub` renders one 16:9 at 1080p (Telegram gets a 1080p copy anyway): `renders/aidr-daily-<date>-visub-16x9-1080p.mp4`, and its own cover `renders/cover-<date>-visub-16x9.png`. `publish.mjs --lang visub` runs render, gate, upload, attach and telegram; never Facebook. `upload` first runs `visub.mjs <date> --youtube`: the English 16:9 description in `posts.md` is translated line by line (a chapter time, list number or trailing link stays as written; a hashtag line stays that many plain hashtags; numbers, `AI;DR`, `aidr.today` and every link are checked, and a translated title must fit 100 characters), the aidr.today links get `?lang=vi`, and the tags are the English ones plus "tin AI hôm nay" and "trí tuệ nhân tạo". Each English line's Vietnamese is cached in `youtube.visub.json` `lines`, so a re-voiced cut whose chapter times moved sends the same text without a model call. The upload is the 1080p 16:9 with its Vietnamese cover as thumbnail, the translated title, `defaultLanguage` `vi` and `defaultAudioLanguage` `en` (`--lang vi --audio-lang en`; in the owner's Chrome, Studio's "Video language" is English and its title/description language is not set), playlist "AI;DR", category and privacy as the English upload. `attach` sets the Vietnamese day page (`day-video --lang vi --video <id> --title <translated title>`, no `--short`). The Vietnamese page shows one video and the Vietnamese-voice cut wins: visub is not uploaded or attached when that cut has an id (STATUS), is in the same run, or is the page's video. The page's cut is read from STATUS ids, else from its shape (the voice cut always has a 16:9 and a Short; visub has a 16:9 only), and a `?lang=vi` page that repeats the English ids has no Vietnamese video. The telegram step posts to the Vietnamese channel (`$TELEGRAM_VI_CHAT_ID`) with the translated title, "▶ YouTube" linking the visub video, else (not uploaded, or the upload failed) the English 16:9 video (STATUS, else the live day page), and "Trang ngày trên aidr.today". It is skipped when the Vietnamese-voice cut is already on that channel. It is never in the default `--lang`.

Lower-level steps: `fetch.mjs`, `voice.mjs <date>`, `build.mjs <date> [--no-audio]`, `render.mjs <date> [--only 9x16]`. Voice parts are cached per sentence (anchor + text), so a wording fix re-voices only that sentence.

## Automated run (Facebook Reel + YouTube, no agent)

`.github/workflows/daily-reel.yml` runs every day at 02:30 UTC (09:30 Asia/Ho_Chi_Minh, after the 08:00 digest): the English cut, then the same video with Vietnamese subtitles for YouTube, the Vietnamese day page and the Vietnamese channel:

1. `auto-script.mjs` — keeps a finished `script.json` (an agent's hand-written one always wins); else fetches today's published edition with `fetch.mjs` (`/api/public?lang=en`, the snapshot the site shows; a past `--date` needs its committed `edition.json`), asks the model chain (`ANYROUTER_VIDEO_MODEL`; default `openai/gpt-5.6-luna`, then the Worker's chat chain read from `ANYROUTER_MODEL` in `apps/web/wrangler.toml`, paid Claude last; `visub.mjs` and `visub-screen.mjs` use the same chain) for screen text and anchor lines, and checks the answer: every number must be in the story's bullet or title, `statWord` and `intro.focus` words must be spoken, title caps (100 / 92 / 150), no bait or TODO, cast rule. Anchors always come from the seeded cast order, never the model. Any failure moves to the next model, then to the deterministic template (bullet text as the voice, the source title as screen text). Stories are dropped from the bottom (never under 3) until the estimated length is ≤ 80 s (`--max-seconds`). It writes `script.source.json` with which path won.
2. `publish.mjs <date> --lang en --steps render --render-published` (renders even cuts already on the day page: the runner starts empty and the Reel needs the file) — voices with `ELEVENLABS_API_KEY` (missing or out of quota → no-voice cut), `AIDR_NO_HEYGEN=1`.
3. `--steps gate` — every render has video and audio streams and a duration, the script and the posts.md Facebook caption pass the text lint; the EN 9:16 is transcoded to the Reels copy `renders/<name>-reel.mp4` (1080x1920 H.264 30 fps, 2 s closed GOP, AAC 48 kHz stereo) and checked against the Reels spec. A Reel-only failure (e.g. over 90 s) is recorded in `STATUS.json` as `reelGate` and stops only the facebook step.
4. Artifact: the Reels copy, covers, `script.json`, `edition.json`, `posts.md`, `captions.srt`, `STATUS.json` (14 days).
5. Live runs only: `--steps upload,attach --uploader api` (skipped with a log line when the `YOUTUBE_*` secrets are missing), `--steps facebook --prod`, `--steps telegram --prod`. The job fails at the end if the Reel did not post.
6. After the English posts: `--lang visub --steps render,gate --render-published` (translate, build, 1080p render; a rerun renders a cut already posted, because the gate and an unsent Telegram post need the file) and, on live runs, `--lang visub --steps upload,attach --uploader api` (skipped with a log line without the `YOUTUBE_*` secrets) then `--lang visub --steps telegram --prod` to the Vietnamese channel (`TELEGRAM_VI_CHAT_ID`). They need only the English render: a failed English upload, Reel or Telegram post does not stop them. The render and upload are `continue-on-error`, so a visub failure, such as no key or no valid translation, never blocks or undoes the English posts; the job fails at the end instead, and each failed channel (the Reel, the visub cut) has its own failing step. The Telegram post is the last post and is not `continue-on-error`. A failed upload records `uploadError` in `STATUS.json` and the Telegram post still goes out with the English video's button, or only the day page button when the English video has no id either. A hand-published day gets no visub Telegram post. `captions.visub.json` and `youtube.visub.json` are cached with `STATUS.json`, so a rerun burns the same captions and sends the same description (a rerun re-voices, so the same cue texts at new times are retimed, and moved chapter times reuse the cached lines); the `-visub` artifact holds them with the SRT and `timeline.json`. Dry runs print its posting plan, with the upload's title, language fields and description.

Manual dispatch defaults to `dry_run: true` (render, gate, artifact, and the posting plan printed by `--dry-run`); untick it for a live run, and set `date` to redo a day. `STATUS.json` is carried between runs of the same day with `actions/cache`, and the public steps check the live state first (YouTube: the day page; Facebook: a Page Reel whose description has `aidr.today/date/<date>`), so a rerun does not post twice. A day an agent already published by hand (every cut on the day page before this workflow touched it) still gets its Reel but no second Telegram post (`HAND_PUBLISHED`, cached with `STATUS.json`).

**Missed posts.** The Worker's day video watchdog (`apps/web/ALGORITHM.md`, "Daily video watchdog") checks every target from 20:00 local (13:00 UTC) and DMs the owner once a day with what is missing: YouTube 16:9, Short and the Vietnamese video from the day page, the Reel from the Page, and Telegram (en, vi) from `day_video_posts`. Telegram cannot be read back, so `--steps telegram --prod` records each channel post there (`agent day-video-posted`) and records the posts already in `STATUS.json` again on every run, which fills in a record that failed after its post. To fill the gaps, rerun live for the date: `gh workflow run daily-reel.yml -R duyet/aidr -f dry_run=false -f date=<date>`. The run restores the day's `STATUS.json` and skips each post already made, so only the missing ones go out. Rerun before local midnight: a past date needs a committed `editions/<date>/edition.json`. On a `HAND_PUBLISHED` day the run skips Telegram, so post a missing channel by hand: `node scripts/publish.mjs <date> --lang en --steps telegram --prod` (`--lang visub` for the Vietnamese channel). A local run has no CI `STATUS.json`, so check the channel first.

`publish.mjs --steps facebook` (needs `--prod`; there is no staging Page) posts the Reels copy with `facebook-reel.mjs`: `POST /{page-id}/video_reels upload_phase=start` → `POST rupload.facebook.com/video-upload/{version}/{video_id}` (`Authorization: OAuth <token>`, `offset`, `file_size`) → `upload_phase=finish video_state=PUBLISHED description=<posts.md Facebook block, day link with utm_source=facebook&utm_medium=reel>` → poll `?fields=status` until ready and published. The `video_id` is saved right after `start`; an unclear `finish` answer polls instead of posting again. `FACEBOOK_GRAPH_VERSION` defaults to the Worker's. The Page token must be a long-lived Page token with `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, from a user with the CREATE_CONTENT task. `facebook` and `gate` never run unless listed in `--steps`.

Post any 9:16 mp4 (a release film too): `node scripts/facebook-reel.mjs --file <mp4> --description "<text>" [--marker <text>] [--dry-run]`, or `--date <YYYY-MM-DD>` to take the caption from that day's `posts.md`. It makes the Reels copy, gates it, skips if a Reel with the marker (default: the caption's first link) is already on the Page, then posts.

**Manual override:** write (or fix) `editions/<date>/script.json` the usual way and commit it before 02:30 UTC; the scheduled run renders that script instead of generating one. To stop a day, cancel the run or disable the workflow. To redo a day by hand, run `publish.mjs` locally as in "Daily run" and add `--steps facebook --prod`.

## Weekly edition

The same template makes a weekly cut ("AI;DR Weekly") from `GET https://aidr.today/api/week/<YYYY-Www>`. The week is the ISO week (Monday..Sunday) of Asia/Ho_Chi_Minh dates, which is how the Worker keys its snapshots (`scripts/week.mjs`, tested by `node --test scripts/week.test.mjs`). The "date" argument of every script is `week-<week>`, e.g. `week-2026-W41`.

```bash
node scripts/fetch-week.mjs [--week 2026-W41] [--count 8]   # default week: the last closed one; edition.json (kind "weekly") + assets/
node scripts/new.mjs --week [2026-W41]                      # fetch-week + assets-sheet.jpg + draft script.json (intro from intro_en)
# write editions/week-<week>/script.json (and script.vi.json from text_vi / intro_vi, never from English)
node scripts/publish.mjs week-2026-W41 --steps render      # daily.mjs --render per language
```

`build.mjs` reads `edition.kind === "weekly"`: labels "WEEKLY EDITION" / "BẢN TIN TUẦN", the dateline is the week range, files are `renders/aidr-weekly-<week>-<lang>-<fmt>-4k.mp4` and `cover-weekly-<week>-<lang>-<fmt>.png`, and `posts.md` links to `https://aidr.today/week/<week>` (`?lang=vi`). Daily output is unchanged. For weekly, `publish.mjs` only runs `--steps render` (and `--dry-run`); upload, attach and telegram are planned, not wired, and exit with a message.

## script.json

Everything that changes day to day. Facts come only from `edition.json` (the brand's data rule): reword for speech, never add a number or claim the bullet does not have.

```jsonc
{
  "date": "2026-10-02",
  "dateline": "Friday, October 2, 2026",
  "theme": {                     // optional pin, only when the owner asks; leave it out (see "Looks" below)
    "intro": "grid",             // grid | cover | date-slam | chapter | hinge | headline-stack | countdown
    "transition": "wipe",        // wipe (yellow + rank) | ink (ink panel + yellow rank) | shutter (two halves)
    "background": "paper",       // paper | soft | grid
    "accent": "#F5C518"          // optional override of the yellow
  },
  "thumb": { "story": 4, "hook": "$60B to fund Anthropic's AI chips" },   // cover still
  "post": { "hook": "...", "hashtags": ["AI", "..."], "tiktok": "...", "facebook": "...", "youtubeTitle": "...", "shortsTitle": "..." },
  "intro": { "voice": [{ "anchor": "ivanna", "text": "This is AI DR, ..." }, { "anchor": "allison", "text": "..." }], "title": "Six stories that matter today",
             "focus": [{ "rank": 1, "word": "twenty" }] },   // the intro lifts that story (others dim) on the spoken word that names it
  "stories": [{
    "rank": 1,
    "category": "Tools",                     // label (amber small caps)
    "kicker": "Cloudflare launches Clef",    // one line, auto-shrinks to fit
    "headline": "*Open-weight decision models*, now on Workers AI",  // *stars* = yellow marker; auto-fits
    "stat": "Clef + Clef-flash", "statLabel": "plus an RL fine-tuning platform",
    "statWord": "clef",                      // the stat lands when this word is spoken
    "layout": "split",                       // optional request: split | full (image full-bleed, card lower third) | stat (giant number) | poster (yellow panel) | statement (centred headline); see "Looks"
    "images": ["assets/s1-1.png"],           // curated from assets/; several = crossfade; [] = typographic card
    "paper": { "venue": "arXiv:2609.37725", "title": "..." },  // the no-image card
    "source": "blog.cloudflare.com",         // optional override of the credit
    "anchor": "alex",                        // optional; host key from the cast; default follows the seeded host order
    "voice": [{ "anchor": "alex", "text": "Cloudflare is launching Clef, ..." }, { "anchor": "kristen", "text": "Plus ..." }]  // or one string
  }],
  "outro": { "voice": [{ "anchor": "kristen", "text": "That's AI DR for today. ..." }, { "anchor": "allison", "text": "See you tomorrow." }], "title": "What's happening in AI today?", "follow": "..." }
}
```

### Looks

The look is derived at build time, never stored. `scripts/look.mjs` `resolveLook(script, edition)` picks the intro, the transition, the background and the story choreography from the edition's date (the ISO week for a weekly edition), so the next day differs on every one, with no record of yesterday. Every rotating intro must be finished on frame 0 (`looks.test.mjs` fails one that fades its content in). Each key in `script.json` `theme` pins that axis and wins over the rotation; an unknown id fails the build and lists the allowed ones. Every cut reads the pin from `script.json` (a `theme` in `script.vi.json` is ignored), so the English, Vietnamese and `visub` cuts of a day look the same. Adding or removing an `auto` entry in `scripts/looks/` reshuffles every unpinned day, past ones included. `timeline.json` records the resolved `theme` and `layouts` as a receipt; the build never reads it back. The four committed editions from before this change pin their theme and every story's layout, so they rebuild as they shipped.

Story layouts (`split`, `full`, `stat`, `poster`, `statement`) are chosen in the same `resolveLook` call, after the build drops every image that is not on disk (a failed download, or a path that no longer exists). So a story's layout always matches the images it really shows, and a scene that needs a picture never ships without one. The rules, in priority order:

1. A story's `layout` in `script.json` wins when it can render: `full` needs at least one image. An unknown id fails the build. A `full` with no image falls back to the rules below, and the build prints `! look:`.
2. Each scene in `scripts/looks/layout.mjs` scores how well it `suits` the story; the highest score that its image need and its `max` allow wins.
3. No layout shows three times in a row when another one can render.

What the scores say today: the cover (`thumb`) story gets `poster` (its copy in ink on a flat yellow panel, its picture or paper card on the paper side; once a day). A story with no image that is not the cover gets `statement` (its headline centred in large italic serif with the marker; at most twice a day), then `split` with the paper card. A story whose bullet has a dollar amount gets `stat` (at most twice). The others alternate `split` and `full` by position.

The layouts read the English bullet and the image lists only, never the screen text, so the English, Vietnamese and `visub` cuts of a day get the same layouts. `auto-script.mjs` and `new.mjs` write no `layout`.

Spoken text says "AI DR" and "aidr dot today"; `config.captions.replace` shows them as "AI;DR" and "aidr.today" in captions.

## config.json

| Key | Meaning |
|-----|---------|
| `count` | Stories per edition (fetch takes the top N bullets) |
| `formats` | Size per format and its 4K render preset |
| `voice` | `provider` (`elevenlabs`), `cast` (path to `voices.json`), `lang` (`en` \| `vi` hosts), `gap` (breath between parts, s), `volume`; `heygen` is the fallback: `anchors` (name → HeyGen voice id + speed) and `byGender` (which HeyGen anchor stands in for a cast host) |
| `music` | Bed (the launch film's "News Theme"), level, ducked level; ducking is a sidechain on the voice |
| `sfx` | Library dir and master level; which effect plays on each cue lives in `scripts/looks/sound.mjs` |
| `timing` | Lead and tail around each voice line, per segment kind; the video length follows the voice. `noVoice.wordsPerSecond` (`en` 2.6, `vi` 3.2) is the reading speed that times a no-voice cut |
| `captions` | Burn in or not, words per caption, spoken → shown replacements |

## Sound

One mixed track (`out/mix.wav`, 48 kHz stereo, loudness-normalised to about −14 LUFS): voice lines placed at `start + lead`; the music bed under a sidechain duck with a fade in and a 2.5 s fade out; effects placed so each one's peak lands on its visual hit (wipe, rank tile, stat). The date picks the sound like the look: each cue draws one effect from its pool, trimmed to the level of the pool's first file, and the bed starts on one of its 8 s phrase starts (a cut that would run off the end of the bed fails the build). Change pools and starts in `scripts/looks/sound.mjs`, not in the build; `node scripts/sound-measure.mjs` measures each file's peak and level and the bed's phrase starts.

## No voice (out of ElevenLabs quota)

Rule: if ElevenLabs cannot voice the day, the cut goes **no-voice**; it is never half voiced and never falls back to HeyGen for that reason.

`voice.mjs` adds up the characters of the sentences it still has to synthesize (uncached only), then reads `GET https://api.elevenlabs.io/v1/user/subscription` (`character_limit - character_count`). It goes no-voice when the remaining characters are fewer than needed, when `$ELEVENLABS_API_KEY` is missing or rejected (401), or when a quota/key error (401, 402, `quota_exceeded`) hits mid-run. It prints `! no voice: <reason>` and writes `voice/mode.json` (`{ "voice": false, "reason": ... }`). A fully cached day needs no quota and no key. Other ElevenLabs errors still fall back to HeyGen per sentence.

`build.mjs` then makes the silent cut: the music bed at its normal level (no ducking) and the sfx, then the same loudness normalisation; every segment lasts `lead + words / config.timing.noVoice.wordsPerSecond[lang] + tail`; the word times (captions, `statWord`, `intro.focus`) are spread evenly over the estimate, so the captions are the read-along. `timeline.json` gets `"voice": false`. `posts.md` is unchanged (it never claims narration). `publish.mjs` records `voice: true|false` per cut in `STATUS.json` and prints `voice` / `no voice` in its summary.

`--no-voice` forces it: `daily.mjs`, `voice.mjs`, `build.mjs` and `publish.mjs` (render step) accept it. Remove the flag, rerun with quota, and delete the renders to get the narrated cut back.

## Known issues

- Voices need `$ELEVENLABS_API_KEY`; a non-quota ElevenLabs error falls back to HeyGen for that sentence and prints `!` (quota and key errors make the cut no-voice, see above). HeyGen sign-in expires; `npx hyperframes auth status` before `voice.mjs`.
- Anchors follow the show rule: never the same host twice in a row, closer differs from opener. `voice.mjs` refuses a script that breaks it. `new.mjs` drafts anchors in a host order shuffled with the date as seed.
- `lint` reports about 65 warnings (`nested_structure_needs_subcomposition`, `timeline_track_too_dense`): the composition is one generated file by design. Errors must be 0.
- Some API media is wrong for the story (a manifest can carry another story's photo) or is a text-heavy OG card that crops badly in 9:16. Look at the contact sheet of `assets/` and curate `images` in `script.json`.
- `config.json` `music.file` points at `../aidr-launch/assets/bgm/news-theme-source.mp3`.
