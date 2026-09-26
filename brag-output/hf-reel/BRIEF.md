# BRIEF — AI;DR story reel

One short vertical video per trending story, generated from the live feed.

## Deliverable

- **Format:** MP4, 1080×1920 (9:16), 10.0 s, 30 fps master (60 fps on request).
- **Unit:** one story per file — `story-001.mp4`, `story-002.mp4`, …
- **Unnarrated.** No voice-over. Music bed only, added after the style is locked.
- **Silent by default** for the first style pass, so the motion can be judged clean.

## Subject

`https://aidr.today` — a ranked AI-news digest. The product's own trending list is
the input: one short per TL;DR bullet, then any high-scoring item the digest skipped.

## Hard constraints

1. **Only real data and real assets.** Every word, number, image, favicon and quote
   comes from the live `/api/feed` payload or the repo's brand files. Nothing invented.
2. **Every frame is a pure function of time.** One paused GSAP timeline, seek-safe.
   No render-time clocks, no unseeded randomness, no network.
3. **No narration.** Motion is the message.
4. **Bilingual is a feature, not an accident.** The EN and VI headlines both appear,
   and the VI one is always tagged so the language is never ambiguous.
5. **The product's own design language.** Tokens from `apps/web/src/styles.css`, the
   real wordmark rebuilt from `apps/web/public/logo.svg`, the real EB Garamond +
   Source Sans 3 from `apps/extension/fonts`.
6. **The dither is background-only.** A monochrome black→white Bayer field behind
   everything; every piece of content above it stays pixel-sharp.

## Structure — 10 s, six beats

| # | Beat | Window | What is on screen |
|---|------|--------|-------------------|
| 1 | **The story** | 0.00–3.05 | The real story image, full-bleed, slamming in then pushing. Real source favicon + source name, real digest date. |
| 2 | **The score** | 1.02–3.10 | `AI;DR · RANKED` kicker, the real `rank_score` counting up, then the real category / points / comments / quotes. |
| 3 | **The headline** | 2.62–5.42 | The digest headline, EB Garamond, wiping up line by line. |
| 4 | **Tiếng Việt** | 4.20–6.60 | The Vietnamese headline cross-dissolves in behind a `VI` tag. |
| 5 | **The quote** | 5.30–7.86 | A real pull-quote from the story's own sources, with the real author handle. |
| 6 | **The way in** | 7.10–8.66 | The real publisher host, the real wordmark, "Read the full story". |
| 7 | **End card** | 8.58–10.0 | The wordmark, `aidr.today`, the tagline, the three real channels. |

## Style

- **Black and white background.** The dithered field is greyscale on purpose. The
  brand yellow is the only colour in the film.
- **Restrained.** No glows, no particles, no bouncy easing the product does not use.
  Fast `power3/power4` entrances, one idea per beat.
- **Type does the work.** Serif for anything said (headlines, quotes, tagline),
  sans for anything labelled (kickers, metadata, stats).

## Run shape

- **Automation.** `build-vars.mjs` turns `stories.json` into one variables file per
  story; `render-all.mjs` loops `hyperframes render --variables-file` over them.
  One composition, N outputs — the same code path whether N is 1 or 200.
- **Gate:** `hyperframes lint` and `hyperframes check` must pass with 0 findings
  before any render.

## Mass production notes

- Composition is fully variable-driven (`data-composition-variables`), so no
  per-story HTML is ever generated.
- Assets are frozen locally at fetch time, so a render never touches the network.
- Renders are embarrassingly parallel: one browser, N sequential renders, or N
  processes with disjoint output paths.
