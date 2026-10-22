# Brief: Chrome extension promo

- **What:** a 17 s reminder that AI;DR has a Chrome extension, ending on the short link `aidr.today/c` (302 to the Chrome Web Store, `apps/web/worker/chrome-short-link.ts`).
- **Formats:** 16:9 (`index.html`, rendered 3840x2160) and 9:16 (`9x16/index.html`, rendered 2160x3840). Same beats and audio; each shape framed on its own.
- **Footage:** real. `scripts/capture.mjs` loads `apps/extension` unpacked in Chromium, switches the new tab to EN, and screenshots it with the live edition, then the live store listing. Captured text is in `data/newtab-desktop.txt`.
- **Voice:** `data/script.json`, three hosts from `videos/brand/voices.json` (Kristen, Alex, Allison). Copy passed `aidr-unslop`.
- **Music:** News Theme bed from `videos/aidr-launch`, ducked about 9 dB under the voice, faded over the last 1.5 s. SFX from `aidr-launch-2026` (Pixabay, `assets/sfx/CREDITS.md`).
- **Not posted.** Social tokens are expired (#962).

## Rebuild

```bash
PLAYWRIGHT=<playwright-core> CHROME=<chromium> node scripts/capture.mjs
ELEVENLABS_API_KEY=... node scripts/voice.mjs
node scripts/build.mjs           # writes index.html, 9x16/index.html, assets/bgm/bed.mp3
npx hyperframes@0.8.181 render -w 2 --resolution 4k -o renders/promo-chrome-ext-16x9.mp4
(cd 9x16 && npx hyperframes@0.8.181 render -w 2 --resolution portrait-4k -o renders/promo-chrome-ext-9x16.mp4)
```
