# daily-news — AI;DR Daily Brief

A news-broadcast video of the day's top AI stories, rendered every day in two shapes from one template:

| Format | Size (render) | Goes to |
|--------|---------------|---------|
| `16x9` | 3840x2160 (authored 1920x1080) | YouTube, Facebook Page video |
| `9x16` | 2160x3840 (authored 1080x1920) | TikTok, Reels (Instagram + Facebook), YouTube Shorts |

Look: "Yellow Desk". Paper ground, AI;DR yellow, EB Garamond headlines, a live broadcast bar with a story counter, an ink news crawl, yellow stinger wipes that carry the next rank, real post images with a slow push, the headline swept by the yellow marker, the key number landing on its spoken word, and burned-in word-by-word captions.

The agent skill for the daily run is `.agents/skills/aidr-daily-news/`. This page is the reference.

## Layout

| Path | Tracked | What it is |
|------|---------|------------|
| `config.json` | yes | Template-wide settings: count, formats, voice, music, effects, timing, captions |
| `template/style.css` | yes | All layout, both formats (`.f-16x9` / `.f-9x16` variables), layouts, intros, transitions |
| `template/motion.js` | yes | The single GSAP timeline, driven by `window.__DN` from the build |
| `scripts/fetch.mjs` | yes | Edition + real post media from `https://aidr.today/api/public?lang=en` |
| `scripts/voice.mjs` | yes | HeyGen TTS per line, with word timings |
| `scripts/build.mjs` | yes | Timeline, both compositions, audio mix, captions, covers, post copy |
| `scripts/render.mjs` | yes | 4K MP4s and cover PNGs |
| `editions/<date>/edition.json` | yes | What the API said that day (the facts) |
| `editions/<date>/script.json` | yes | The day's creative choices and spoken script (written by the agent) |
| `editions/<date>/captions.srt`, `posts.md`, `timeline.json` | yes | Generated, kept as the day's record |
| `editions/<date>/assets/`, `voice/`, `out/`, `renders/`, `snap-*/` | no | Third-party media and regenerable output |

## Daily run

From `videos/daily-news/` (on machines where `node`/`npx` are nvm shell functions, put `~/.nvm/versions/node/<v>/bin` on `PATH` and call `command node`):

```bash
node scripts/fetch.mjs                 # 1. edition.json + assets/ (top `count` stories)
# 2. write editions/<date>/script.json  (the agent: see "script.json" below)
node scripts/voice.mjs <date>          # 3. voice/<id>.wav + words (HeyGen; needs `npx hyperframes auth login`)
node scripts/build.mjs <date>          # 4. out/16x9, out/9x16, out/cover-*, mix, captions.srt, posts.md
(cd editions/<date>/out/16x9 && npx --yes hyperframes@0.8.96 snapshot --at 1.5,10,20,30,40,50 --describe false -o ../../snap-16x9)
(cd editions/<date>/out/9x16 && npx --yes hyperframes@0.8.96 snapshot --at 1.5,10,20,30,40,50 --describe false -o ../../snap-9x16)
node scripts/render.mjs <date>         # 5. renders/*.mp4 (4K) + cover PNGs, ~10–20 min
```

Re-voice one line after an edit: `node scripts/voice.mjs <date> --only s3`. Build without sound for quick looks: `build.mjs <date> --no-audio` (rebuild with sound before rendering).

## script.json

Everything that changes day to day. Facts come only from `edition.json` (the brand's data rule): reword for speech, never add a number or claim the bullet does not have.

```jsonc
{
  "date": "2026-10-02",
  "dateline": "Friday, October 2, 2026",
  "theme": {
    "intro": "date-slam",        // date-slam | countdown | headline-stack — default rotates by day of year
    "transition": "wipe",        // wipe (yellow + rank) | ink (ink panel + yellow rank) | shutter (two halves)
    "background": "paper",       // paper | soft | grid
    "accent": "#F5C518"          // optional override of the yellow
  },
  "thumb": { "story": 4, "hook": "$60B to fund Anthropic's AI chips" },   // cover still
  "post": { "hook": "...", "hashtags": ["AI", "..."], "tiktok": "...", "facebook": "...", "youtubeTitle": "...", "shortsTitle": "..." },
  "intro": { "voice": "This is AI DR. ...", "title": "Six stories that matter today" },
  "stories": [{
    "rank": 1,
    "category": "Tools",                     // label (amber small caps)
    "kicker": "Cloudflare launches Clef",    // one line, auto-shrinks to fit
    "headline": "*Open-weight decision models*, now on Workers AI",  // *stars* = yellow marker; auto-fits
    "stat": "Clef + Clef-flash", "statLabel": "plus an RL fine-tuning platform",
    "statWord": "clef",                      // the stat lands when this word is spoken
    "layout": "split",                       // split | full (image full-bleed, card lower third) | stat (giant number)
    "images": ["assets/s1-1.png"],           // curated from assets/; several = crossfade; [] = typographic card
    "paper": { "venue": "arXiv:2609.37725", "title": "..." },  // the no-image card
    "source": "blog.cloudflare.com",         // optional override of the credit
    "voice": "Number one. Cloudflare launches Clef, ..."
  }],
  "outro": { "voice": "That's AI DR for today. ...", "title": "What's happening in AI today?", "follow": "..." }
}
```

Spoken text says "AI DR" and "aidr dot today"; `config.captions.replace` shows them as "AI;DR" and "aidr.today" in captions.

## config.json

| Key | Meaning |
|-----|---------|
| `count` | Stories per edition (fetch takes the top N bullets) |
| `formats` | Size per format and its 4K render preset |
| `voice` | HeyGen voice id (same voice as the launch film), speed, gain |
| `music` | Bed (the launch film's "News Theme"), level, ducked level; ducking is a sidechain on the voice |
| `sfx` | Library dir, master level, and which effect plays on each cue (`open`, `storyIn`, `rankHit`, `statHit`, `tick`, `outro`) |
| `timing` | Lead and tail around each voice line, per segment kind; the video length follows the voice |
| `captions` | Burn in or not, words per caption, spoken → shown replacements |

## Sound

One mixed track (`out/mix.wav`, 48 kHz stereo, loudness-normalised to about −14 LUFS): voice lines placed at `start + lead`; the music bed under a sidechain duck with a fade in and a 2.5 s fade out; effects placed so each one's peak lands on its visual hit (wipe, rank tile, stat). Change the sound by editing `config.sfx.cues`, not the build.

## Known issues

- HeyGen sign-in expires; `npx hyperframes auth status` before `voice.mjs`.
- `lint` reports about 65 warnings (`nested_structure_needs_subcomposition`, `timeline_track_too_dense`): the composition is one generated file by design. Errors must be 0.
- Some API media is wrong for the story (a manifest can carry another story's photo) or is a text-heavy OG card that crops badly in 9:16. Look at the contact sheet of `assets/` and curate `images` in `script.json`.
- `config.json` `music.file` points at `../aidr-launch/assets/bgm/news-theme-source.mp3`.
