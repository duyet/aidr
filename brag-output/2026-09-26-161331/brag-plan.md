# AI;DR — Launch Film Plan

**Input:** project `aidr` (live at https://aidr.today) · **Tone:** polished / kinetic
**Format:** landscape 1920×1080 @ 30fps · **Duration:** 22.50s (675 frames)
**Look:** ordered-dither / pixel, using the product's own `dither-kit` language
**Music:** original instrumental, 128 BPM, A minor, Am–F–C–G, 12 bars — composed for this film
**Sound design:** original, written as one piece with the music (same key, tempo grid, reverb)
**Voice:** Daniel ("Steady Broadcaster", ElevenLabs), generated line-by-line so every cut lands on a word

---

## 1. What it is

**AI;DR reads the AI news so you don't have to.** It polls 20 sources every hour, throws away
anything irrelevant, collapses many write-ups of the same story into one item, scores and ranks
what's left, writes a TL;DR in English and Vietnamese, and delivers it to Telegram, a Chrome
new-tab page, and an email digest.

## 2. Who it's for

Builders and AI people who want the signal without the firehose — the ones who already have eleven
tabs open and still feel behind.

## 3. What sets it apart

- **Sources, not vibes.** Real named sources — Hacker News, HuggingNews, Lobsters, Anthropic,
  xAI, DeepMind, AWS ML, Simon Willison and 12 more. All 20 are named on screen.
- **A visible formula.** `rankScore = importance × qualityFactor × decay × engagement × sources`,
  reproduced verbatim from the product's own `/data?tab=algo` page, sub-formulas included.
- **A real ledger.** 4,501 posts ingested → 2,035 merged away → 2,398 published. Every number
  comes from the live `/api/system` totals and reconciles exactly.
- **Three real delivery surfaces**, all shipped and all filmed as themselves: the Telegram
  channel, the Chrome new tab, and the rendered email digest.

## 4. The angle

**The firehose, and the thing that turns it off.**

The first three seconds are deliberately unusable: 30 real AI story titles flooding the frame
faster than you can read, overlapping into noise, while the real all-time total races up beside
them. Then the music drops on bar 3 and they *snap* out of the way. Every later scene is that same
motion, tightened: collect → score → rank → deliver. The film is a demonstration, not a
description — the transition is the product.

## 5. The hook

Chaos you can recognise, in real headlines with real source labels, reaching full density inside
two seconds. The viewer recognises the problem immediately because they've lived it.

## 6. Visual identity (taken from the real codebase)

| Token | Value | Source |
|---|---|---|
| Page background | `#0c0c0c` | `apps/web/src/styles.css` dark `--background` |
| Card | `#171717` | `--card` |
| Foreground | `#fafafa` | `--foreground` |
| Muted foreground | `#a3a3a3` | `--muted-foreground` |
| Border | `#ffffff1a` | `--border` |
| Brand yellow | `#f5c518` | `logo.svg` / favicon |
| Accent amber | `#f59e0b` | dark `--accent` |
| Display type | EB Garamond | `apps/extension/fonts/eb-garamond-*.woff2` |
| UI type | Source Sans 3 | `apps/extension/fonts/source-sans-3-*.woff2` |
| Mono | SF Mono / ui-monospace stack | system |

Background is never flat: a slow amber radial bloom drifts behind everything, plus a faint
80px grid, film grain, a 1px scanline and a vignette. No frame is ever dead.

### The dither — background only

Every frame's **background field** is quantised through the product's own dither
language and nothing else is:

- the **exact 4×4 Bayer threshold matrix** from `apps/web/src/components/dither-kit/dither-paint.ts`
- **`CELL = 2`** device px per dither cell, painted at 960×540 and blitted up with
  `image-rendering: pixelated` — "chunky enough to read pixelated", as `backingSize()` puts it
- the kit's colour-vs-opacity rule, adapted for a full field: **one warm duotone ramp**
  (cool near-black → warm white) with the Bayer matrix choosing between adjacent rungs,
  plus a **fixed 34% chroma blend** so the amber bloom stays amber
- repainted at 26 Hz — the drift is slow, so nobody can see the step

It is painted by the page into a single `<canvas>` behind the content. The compositor
(`scripts/video/capture.mjs`) does **no** filtering at all — it flattens RGBA to RGB24 and
nothing else. Every word, number, logo, screenshot and video frame above the field is
pixel-sharp. The 2px `.px` grid texture that used to sit on the cards was removed for the
same reason.

## 7. Storyboard — every scene boundary is a bar line

| # | Scene | Time | Bars | Music | What happens |
|---|---|---|---|---|---|
| 1 | **FIREHOSE** | 0.000–3.750 | 0–2 | INTRO → BUILD, riser, heartbeat kicks | 30 real story titles fly in from the right on successive 16ths, overlapping into an unreadable pile. Beside them the real 3-day feed count races to **208**. Camera shake grows with the riser. Real source names scroll underneath. |
| 2 | **SNAP** | 3.750–7.500 | 3–4 | BUILD → **DROP A** + crash @5.625 | On the downbeat the pile clears. Real `logo.svg` punches in, the real tagline resolves word-by-word on 16ths, and a **real screen recording of aidr.today** rises in a browser window — the AI;DR card with all 8 numbered stories and their thumbnails, cursor and all. An amber scan sweeps it. |
| 3 | **COLLECT** | 7.500–11.250 | 5–6 | DROP B, whoosh @9.375 | All 20 real sources converge from every direction into a 5×4 grid, one per 16th, each showing its real lifetime item count. A counter resolves to 20. Then the grid funnels into a single beam of light. |
| 4 | **RANK** | 11.250–15.000 | 7–8 | DROP B → **PEAK** + crash @15 | Five factor cards land one per 8th — **importance · quality · freshness · engagement · sources** — each with a plain-English line and its real parameter as a data chip. They collapse into a strip and resolve into the actual expression. Six real ranked rows fly in and **reorder into rank on successive 16ths**. Then the ledger: 2,035 merged away · 2,398 published. |
| 5 | **DELIVER** | 15.000–18.750 | 9–10 | PEAK → BREAK → BUILD 2 | Three real surfaces land one per beat, each in its own device frame — a **real iPhone recording** of the Telegram channel playing in a phone, the real Chrome new tab, the real email digest. |
| 6 | **OUTRO** | 18.750–22.500 | 11–12 | BUILD 2 → **FINAL** + crash @20.625 | Surfaces fly out; 36 amber tiles assemble on the snare roll. On the final crash they burst and the real logo lands: wordmark, `aidr.today`, the real tagline, the three channels. |

## 8. Motion rules

- **Every cut is a bar line; every secondary move is an 8th or 16th.** Nothing moves on a
  timecode that isn't in `beatmap.json`, which is emitted by the music engine itself.
- Transitions: 0.28s. Whip-pan for lateral moves, `easeOutBack` overshoot for arrivals, a white
  flash on every crash hit, a dip-through-black at each scene boundary.
- Hard per-scene visibility windows, so nothing can leak across a boundary.
- Text the viewer must read stays fully settled ≥0.3s per word. Only texture text moves early.
- Continuous 1px float and gradient drift underneath, so motion never stops.

## 9. Voice-over script (line-by-line, timed to the music)

| Line | In | Text |
|---|---|---|
| L1 | 0.55 | "The AI news never stops." |
| L2 | 3.95 | "So AI, D R reads it for you." |
| L3 | 7.70 | "Every hour. Twenty sources. Collected." |
| L4 | 11.40 | "Scored, merged, ranked. Duplicates gone." |
| L5 | 15.15 | "Telegram. Your new tab. Your inbox." |
| L6 | 19.15 | "AI, D R. AIDR dot today." |

Each line is generated separately, its exact duration measured, then placed on the timeline. The
scene it belongs to is locked to both the bar line and the speech.

## 10. What shipped

| File | |
|---|---|
| `brag.mp4` | 1920×1080, 30fps, 22.500s, 675 frames, H.264 CRF 16 + AAC 192k, 4.5 Mbps, −14.2 LUFS / −1.5 dBTP. Poster baked in as **frame 0** (replaced, not prepended, so duration and sync are untouched). |
| `brag.jpg` | the poster, pulled from frame 648 (t = 21.6s) — a fully settled end-card frame |
| `brag-plan.md` | this document |
| `share-copy.txt` | postable caption |

Everything reproducible lives in `work/`: `scripts/music/compose.mjs` (music + beat map),
`scripts/music/sfx.mjs` (sound design), `scripts/video/dither.mjs` (PNG codec + dither),
`scripts/video/capture.mjs` (frame capture), `scripts/video/{vo,mix,assemble}.sh`,
`scripts/build-content.mjs` (live API → `frames/content.json`), and the raw captures in
`work/assets` and `work/data`.

