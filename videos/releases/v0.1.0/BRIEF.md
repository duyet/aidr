---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "AI;DR goes public at aidr.today"
destination: youtube
aspect: 1920x1080 (master) + 1080x1920
language: en
audience: "Readers of aidr.today and people who follow AI news tools"
length: 58s
angle: "Five highlights of the release, each shown on the live site"
narration: yes
---

# AI;DR v0.1.0 release film

One film for the v0.1.0 release (Sep 7 – 30, 2026): the 16:9 master here (on YouTube as 8Tng0STx3m0) and a 9:16 version in `../v0.1.0-9x16/` (same timing and sound, laid out again for the phone safe zone x 60–960, y 200–1580). Post with `youtube.md`.

- **Source of truth for content:** `apps/web/src/content/releases/v0.1.0.ts` (the release page at aidr.today/release/v0.1.0). Highlights, stats and dates on screen match it.
- **On-screen UI:** real screenshots of aidr.today, captured by `../scripts/capture.sh` into `capture/` (ignored: it holds third-party story photos). The page list is `captures` in `film.json`.
- **Voice-over:** the house cast in `videos/brand/voices.json` (ElevenLabs, eleven_multilingual_v2): hosts alternate per section like a TV show, never the same voice twice in a row, in an order shuffled with the version as seed so a re-render keeps the same voices. English has 5 hosts, Vietnamese 4. Lines are conversational, one per section, from `voice` in `film.json` (`"cast": true`); section lengths follow the lines. Voice files are cached in `assets/audio/voice/` (ignored). Earlier single-voice auditions are in `renders/voice-auditions*/`.
- **Captions:** burned in, house style; also `captions-en.srt` and `captions-vi.srt`.
- **Sound:** the house "News Theme" bed from `../../aidr-launch/assets/bgm/` and its effects, cut and placed by `../scripts/build.mjs` into `assets/audio/` (ignored, regenerated).
- **No narration, no subtitles.** All copy is on screen in English. A Vietnamese subtitle track was optional and was not made.

## Languages

English (master) and Vietnamese. Vietnamese on-screen copy is from the `.vi` strings in `apps/web/src/content/releases/v0.1.0.ts` and the house wording of `routes/changelog.tsx`; the pages are captured with `?lang=vi` into `capture-vi/`. Voice-over in both languages, as in v0.1.12.

## Rebuild

See `../README.md` (Commands). In short, from `videos/releases/`:

```bash
node scripts/build.mjs v0.1.0 --capture && node scripts/build.mjs v0.1.0 --lang vi --capture
scripts/render.sh v0.1.0
```

Every `index.html` (`v0.1.0/`, `v0.1.0-9x16/`, `v0.1.0-vi/`, `v0.1.0-vi-9x16/`) is generated; change `film.json`, `../scripts/build.mjs` or `../scripts/motion.js` instead.
