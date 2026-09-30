---
workflow: product-launch-video
flow: automation
storyboard: yes
message: "Too much AI news; AI;DR ranks it down to the eight stories that matter, every day, in English and Vietnamese."
destination: youtube
aspect: 1920x1080
language: en
audience: "People who follow AI closely: builders, researchers, founders; English and Vietnamese readers"
length: 31s
angle: "One Semicolon — the semicolon is the product: noise on one side, the digest on the other"
narration: yes
---

## Intent

A 30-second launch film for AI;DR (https://aidr.today), marketing the product. The user asked for
showreel-grade motion design: "shows what an incredible motion designer you are... go all out",
"good design, no AI slop".

Chosen direction (picked by the user from nine sketched options): **4 · One Semicolon**. Ink on
full-bleed yellow, letterforms too big for the canvas, nearly one continuous shot with the camera
travelling through the logo's own vector shapes. The semicolon is the hinge: noise on one side, the
digest on the other. Opening: a single blinking semicolon, alone on yellow.

The user asked to mix in screens from three other directions:

- **Marker Pass** — an editor's highlighter runs through dense articles; everything unmarked fades;
  what is left becomes the headline. Paper, yellow marker, tactile, echoes the site's highlighted names.
- **Two Tongues** — every headline lands twice, English and Vietnamese, hinged on the semicolon.
  Paper / ink split, mirrored motion.
- **New Tab** — open a tab, the day's AI news is already there. A moving camera over the real
  interface (real captured UI, cursor-led).

Pace: building — slow open, fast middle, held ending.
Closing line: "What's happening in AI today?" above aidr.today.

## Assets

- ../../apps/web/public/logo.svg — AI;DR square logo, outlined vector paths (yellow #f5c518 tile, ink #1c1917 letters); the semicolon glyph is the film's protagonist.
- ../../apps/web/public/favicon.svg, logo.png, logo-sm.png, logo-icon.png — logo rasters and small mark.
- ../../apps/web/public/fonts/be-vietnam-pro-{500,700}.ttf — Vietnamese-capable face for the Two Tongues beat.
- Live site https://aidr.today (EN) and https://aidr.today/?lang=vi (VI) — capture the real digest card, category nav, trending chips.
- Brand tokens from apps/web/src/styles.css: paper #f7f7f5, ink #0a0a0a, brand yellow #f5c518, brand-soft #fdf6d8, amber accent #b45309, hairline #0a0a0a14; EB Garamond (serif, wordmark and headings), Source Sans 3 (body).

## Customizations

- Music: original 30s track, "Strings in a hurry" — ~120 BPM, short string ostinato, news energy, no brass. Cuts land on its beat in the fast middle.
- Voiceover added after the first draft (owner: "adding cool warm voice over and bg music"): one short line per frame, warm male voice. No captions.
- Three deliverables, each laid out for its shape (not cropped): 16:9 1920x1080 (YouTube, X) is the master; then 9:16 1080x1920 (Reels, TikTok, Shorts) and 1:1 1080x1080 (X and LinkedIn feed) as follow-on versions of the approved master.
- On-screen language English, with one Vietnamese moment (the Two Tongues beat).
- The 336 → 8 collapse (hundreds of stories ranked down to eight) may serve as the middle beat; real figures from the live site on capture day.
- Real product facts to draw on: hourly pipeline consume → rank → publish; email from 07:00 local, Telegram VI/EN from 08:00; Chrome new-tab extension; RSS; MCP.

## Notes

- Owner: the final "A.I.D.R." must not be read slowly. The script writes the name as "AI DR" for the voice engine (spoken briskly as four letters, about 0.7s); "A.I.D.R." is slow and "AIDR" is read as one word. Frame 7 is back to 3.6s.

- Owner: channel chips use logos (assets/logos: Telegram, Chrome, MCP from the media resolver; RSS from Simple Icons; mail from Lucide; Web uses the AI;DR mark). Label is "From 26+ sources". Voice trial: Jonah (Clear & Professional), speed 1.12; the Ewan version is draft 4.

- Owner: "more powerful voice and faster pace, ultra professional and super excited announcement" — voice changed to Ewan (Bright & Energetic) at speed 1.12, lines rewritten as announcements.
- Owner: "showing number of upstream source, number of broadcast channel" — frame 2 shows "From 26 sources" (live count of enabled sources, https://aidr.today/api/system/sources, 2026-09-30); frame 6 shows "6 channels": Web, New tab, Email, Telegram, RSS, MCP.

- Owner: "also mention building LLM powered by AnyRouter (showing anyrouter logo)". Frame 4 carries a credit line with the official AnyRouter mark (assets/anyrouter-logo-black.svg, from anyrouter.dev/brand) and the voice says it.

- Owner asked to "speed up video a bit" after the first draft: the whole film plays 10/9 faster (133.3 BPM). Then: "the first intro longer a bit" — frame 1 runs 5.4s, total 28.8s.

- Avoid the generic AI-launch look: no dark gradient glow, no particles, no purple-blue gradients.
- The site itself is quiet editorial (paper, serif, hairlines); the film should feel like the same brand turned up, not a different one.
- Headlines shown must come from the live site capture, not invented.
- Not signed in to HeyGen at setup; local MusicGen deps missing. Music provider decision pending with the user.
