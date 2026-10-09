---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "Every day gets a page, and you get a vote"
destination: youtube
aspect: 1920x1080 (master) + 1080x1920
language: en
audience: "Readers of aidr.today and people who follow AI news tools"
length: 47s
angle: "Five highlights of the release, each shown on the live site"
narration: yes
---

# AI;DR v0.1.12 release film

One film for the v0.1.12 release (Oct 1 – 9, 2026) in two shapes: the 16:9 master here and a 9:16 version in `../v0.1.12-9x16/` (same timing and sound, laid out again for the phone safe zone x 60–960, y 200–1580). Post with `youtube.md`.

- **Source of truth for content:** `apps/web/src/content/releases/v0.1.12.ts` (the release page at aidr.today/release/v0.1.12). Highlights, stats and dates on screen match it.
- **On-screen UI:** real screenshots of aidr.today, captured by `../scripts/capture.sh` into `capture/` (ignored: it holds third-party story photos). The page list is `captures` in `film.json`.
- **Sound:** the house "News Theme" bed from `../../aidr-launch/assets/bgm/` and its effects, cut and placed by `../scripts/build.mjs` into `assets/audio/` (ignored, regenerated).
- **Voice-over:** the house cast in `videos/brand/voices.json` (ElevenLabs, eleven_multilingual_v2): hosts alternate per section like a TV show, never the same voice twice in a row, in an order shuffled with the version as seed so a re-render keeps the same voices. English has 5 hosts, Vietnamese 4. Lines are conversational, one per section, from `voice` in `film.json` (`"cast": true`); section lengths follow the lines. Voice files are cached in `assets/audio/voice/` (ignored). Earlier single-voice auditions are in `renders/voice-auditions*/`.
- **Mix:** one premixed track per language, `assets/audio/mix-<lang>.wav`: the music ducked about 10 dB under the voice by a sidechain compressor, effects on top, normalised to -14 LUFS.
- **Captions:** burned in, house style (paper chips, the spoken word gets the yellow marker; English lines of up to 4–6 words that never end on a weak word, Vietnamese lines by clause); also written to `captions-en.srt` and `captions-vi.srt`.

## Languages

English (master) and Vietnamese. Vietnamese on-screen copy is from the `.vi` strings in `apps/web/src/content/releases/v0.1.12.ts` and the house wording of `routes/changelog.tsx`; the pages are captured with `?lang=vi` into `capture-vi/`. Vietnamese captions break by clause, never inside a compound word.

## Rebuild

See `../README.md` (Commands). In short, from `videos/releases/`:

```bash
node scripts/build.mjs v0.1.12 --capture && node scripts/build.mjs v0.1.12 --lang vi --capture
scripts/render.sh v0.1.12
```

Every `index.html` (`v0.1.12/`, `v0.1.12-9x16/`, `v0.1.12-vi/`, `v0.1.12-vi-9x16/`) is generated; change `film.json`, `../scripts/build.mjs` or `../scripts/motion.js` instead.
