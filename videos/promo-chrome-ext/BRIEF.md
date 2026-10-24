# Brief: Chrome extension spot

- **What:** a 13.5 s TV-style spot for the AI;DR Chrome extension, ending on the short link `aidr.today/c` (302 to the Chrome Web Store, `apps/web/worker/chrome-short-link.ts`) for 5.5 s.
- **Owner direction (2026-10-23):** better VO, faster pace, a TVC voice, more art and design, no button highlights, no feature tour, show off the screenshots.
- **Formats:** 16:9 (`index.html`, rendered 3840x2160) and 9:16 (`9x16/index.html`, rendered 2160x3840). Same beats and audio; each shape framed on its own.
- **Covers:** `cover/index.html` and `9x16/cover/index.html`, written by `scripts/build.mjs` (ignored), snapshotted to `renders/cover-16x9.png` and `9x16/renders/cover-9x16.png`.
- **Footage:** three owner screenshots of the live new tab, 2026-10-23 (`assets/shots/`, lossless WebP): light EN, dark VI, light EN with the list. `scripts/shots.py` measures each yellow date header into `data/shots.json`; the light and dark cards are cropped from their header so the cut between them matches. The 9:16 cut crops the whole tab from the top, so its cards fill about half the frame height.
- **Voice:** `data/script.json`, one announcer. Alex won an audition against Tyler Cruz and Ivanna on the same three lines: fastest delivery (7.85 s of speech against 7.99 and 8.73) and a word-perfect ElevenLabs Scribe transcript, as were the other two. Commercial settings (style 0.45, stability 0.32) instead of the brand's narration defaults. Each line is loudness-normalized to -20 LUFS when voiced. Line 3 reads the brand as "AIDR"; whether the voice says A-I-D-R or "aider" still needs an ear check by the owner.
- **Sound:** all new, generated with ElevenLabs (`assets/sfx/CREDITS.md`). 120 BPM music bed, low-passed until the first cut, ducked about 11 dB under the voice. Renders are mastered to -16 LUFS, -1 dBTP by `scripts/master.sh`.
- **Not posted.**

## Rebuild

```bash
python3 -I scripts/shots.py      # only when a screenshot changes
ELEVENLABS_API_KEY=... node scripts/voice.mjs
node scripts/build.mjs           # writes index.html, 9x16/index.html, assets/bgm/bed.mp3
npx hyperframes@0.8.181 render -w 2 --resolution 4k -o renders/promo-chrome-ext-16x9.mp4
(cd 9x16 && npx hyperframes@0.8.181 render -w 2 --resolution portrait-4k -o renders/promo-chrome-ext-9x16.mp4)
scripts/master.sh renders/promo-chrome-ext-16x9.mp4
scripts/master.sh 9x16/renders/promo-chrome-ext-9x16.mp4
(cd cover && npx hyperframes@0.8.181 snapshot . -o /tmp/cover --at 0.5 --no-end)   # then copy to renders/cover-16x9.png; same for 9x16/cover
```
