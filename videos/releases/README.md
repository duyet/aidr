# releases

One short film per aidr.today release, built from a shared template, in English and Vietnamese, each in 16:9 and 9:16 (Shorts, TikTok, Reels; laid out again for the phone safe zone x 60–960, y 200–1580, not cropped). A language with `voice` in `film.json` gets a voice-over by the house cast in `videos/brand/voices.json` (hosts alternate per section, seeded by the version; `"cast": false` plus `provider`/`voice` picks one voice instead), burned-in captions and a ducked mix; one without it is music and effects only. Every mix is normalised to -14 LUFS.

## Commands

From `videos/releases/` (where `node`/`npx` are nvm shell functions, put `~/.nvm/versions/node/<v>/bin` on `PATH` first):

```bash
node scripts/build.mjs v0.1.12 --capture             # English: capture pages, voice, compositions, mix
node scripts/build.mjs v0.1.12 --lang vi --capture   # Vietnamese: the same from film.json "vi"
scripts/render.sh v0.1.12                            # render every built cut (en, vi) into v0.1.12/renders/
scripts/render.sh v0.1.12 vi                         # one language only
```

`--lang` picks the language (default `en`). English copy is `film.json`'s top level; the `vi` block overrides it field by field (scenes by index; `rows`, `stats` and `captionReplace` whole) and brings its own `captures` (saved to `capture-vi/`), `voice`, `ui` strings and framing fixes where the Vietnamese pages lay out differently. Drop `--capture` to rebuild from the saved captures.

| Language, shape | Project folder | Render |
|-----------------|----------------|--------|
| en 16:9 (master) | `<v>/` | `<v>/renders/aidr-<v>-en-16x9.mp4` |
| en 9:16 | `<v>-9x16/` | `<v>/renders/aidr-<v>-en-9x16.mp4` (+ `-tiktok.mp4`, under 28 MB) |
| vi 16:9 | `<v>-vi/` | `<v>/renders/aidr-<v>-vi-16x9.mp4` |
| vi 9:16 | `<v>-vi-9x16/` | `<v>/renders/aidr-<v>-vi-9x16.mp4` (+ `-tiktok.mp4`) |

Each folder is its own HyperFrames project because one project may hold only one root composition. A voice-over needs `$ELEVENLABS_API_KEY` (provider `elevenlabs`) or HeyGen auth (`npx hyperframes auth refresh`, provider `heygen`).

| Path | Tracked | What it is |
|------|---------|------------|
| `scripts/build.mjs` | yes | `film.json` → both compositions, voice-over, captions and the sound |
| `scripts/motion.js` | yes | The single GSAP timeline, inlined by the build |
| `scripts/capture.sh` | yes | Screenshots of the live site at 1360x850, 2x |
| `scripts/render.sh` | yes | Renders every built cut in 4K, cover stills and TikTok copies |
| `scripts/queue.sh`, `scripts/status.py` | yes | One-at-a-time render queue that keeps `STATUS.json` (ignored) current |
| `scripts/social.sh` | yes | Under-28 MB social copy of a cut: `-x.mp4` (16:9, X) or `-tiktok.mp4` (9:16) |
| `scripts/tts-elevenlabs.mjs` | yes | ElevenLabs TTS with word timings for captions |
| `<v>/film.json` | yes | The release's copy, pages to capture, and camera framing |
| `<v>/BRIEF.md`, `STORYBOARD.md`, `youtube.md` | yes | Brief, frame plan, YouTube title/description/tags |
| `<v>*/index.html`, `assets/fonts/`, `<v>/captions-<lang>.srt` | yes | Generated compositions, staged brand fonts, caption tracks |
| `capture/`, `capture-<lang>/`, `assets/audio/`, `renders/`, `snapshots/` | no | Third-party photos, voice cache and regenerable output |

## capture.sh click syntax

`scripts/capture.sh <out-dir> <name>=<path>[@<scrollY>][#<click>] ...` saves a 2720x1700 screenshot of a live page. After `#`, the click is one of:

| Spec | Meaning |
|------|---------|
| `#Why this ranks` | click the element with that text |
| `#button:Reader preferences` | click a button by its accessible name (retried until `aria-pressed` sticks) |
| `#button:Show day card>button:Show text` | several clicks in order, joined by `>` (the two forms can be mixed) |

`/api/...` paths are downloaded as-is. The `button:` form and `>` chains land with the v0.1.13 release PR (#507); until it merges, `capture.sh` on master only has the text click.

## New release film

1. Read the release page source `apps/web/src/content/releases/v<x>.ts` and pick five highlights.
2. Copy a `film.json`, then change the copy, `captures`, and for each scene `to` (where the camera lands) and `focus` (the highlighted box). Both are fractions of the screenshot: `x`, `y` from the top left, `w` (and `h` for `focus`). `to9` / `focus9` override the 9:16 landing and highlight; by default it lands closer, around the highlight. A 9:16 window should show at most about 0.4 of the capture width, or the UI is too small on a phone. Add `voice` (one line per section) for a voice-over; `motion` tightens the in-scene times.
3. `node scripts/build.mjs v<x> --capture` (and `--lang vi`), then `npx hyperframes snapshot` in each folder and look at the frames.
4. `scripts/render.sh v<x>`, review with the `aidr-video-review` skill until it scores 8/10, and fill `youtube.md`.

Framing reference (screenshot fractions → window): the window shows `w` of the screenshot's width; the visible height is `w × 0.713 × width / height` of the screenshot's height.
