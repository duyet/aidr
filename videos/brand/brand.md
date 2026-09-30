# AI;DR brand, for video

The site is quiet editorial: paper, ink, serif, hairlines. A video should feel like the same brand turned up, not a different one.

## Palette

| Name | Hex | Use |
|------|-----|-----|
| Paper | `#F7F7F5` | Light ground |
| Ink | `#0A0A0A` | Text, dark ground |
| Yellow | `#F5C518` | The logo tile, full-bleed fields, marker highlight |
| Yellow soft | `#FDF6D8` | Tints behind yellow elements |
| Amber | `#B45309` | Small accents, category labels, "updated" notes |
| Hairline | `#0A0A0A14` | 1px rules, the only border |
| Logo ink | `#1C1917` | The letters inside the logo tile |

Source: `apps/web/src/styles.css` and `apps/web/public/logo.svg`.

## Type

| Role | Face |
|------|------|
| Wordmark, display, headlines | EB Garamond, weight 500 |
| Body, labels, UI text | Source Sans 3 |
| Data, timestamps, counters | A monospace |

Vietnamese glyphs are covered by the staged files in `brand/assets/fonts/` (both families ship a `vietnamese` subset). Use these local files; do not link a font host.

## Logo

- `brand/assets/logo.svg` is the square mark: yellow tile, letters as **outlined vector paths**.
- Never retype the wordmark inside the tile as text. Animate the paths.
- `brand/assets/favicon.svg` is the same mark at small size.
- The semicolon is the recurring motif. It can stand alone.

## Motifs

- **Semicolon hinge** — noise on one side, the digest on the other; English on one side, Vietnamese on the other.
- **Yellow marker highlight** — a highlighter sweep behind the words that matter, echoing the site's highlighted names.
- **Hairline rules** — 1px, no boxes, no shadows.
- **Numbered ranked rows** — the digest card: number, category label, headline.
- **Category labels** — small caps, coloured, before the headline.

## Voice

Plain, editorial, no hype. Short sentences. The site's own line is "What's happening in AI today?"

## Data rule

Headlines and counts come from the live site or `https://aidr.today/api/public` on the day the video is made (`tldr.bullets_en`, `tldr.bullets_vi`). Save them under the project's `data/`. Never invent a headline or a figure.

## Avoid

- Dark gradient glow
- Particles
- Purple-to-blue gradients
- Bouncy eases

## Design spec

`brand/frame.md` is the canonical design spec. It is the `biennale-yellow` frame preset remixed onto AI;DR's tokens.

The remix script (`build-frame.mjs`) got two things wrong on the first run: it mapped the accent to `#322A90` (a category link colour) instead of yellow, and set the display face to Source Sans 3 instead of EB Garamond. Both were corrected by hand. New projects should **copy `brand/frame.md`** into the project as `frame.md`, not re-run the remix blindly. The `@font-face` block in that file points at `assets/fonts/`, so copy `brand/assets/fonts/` into the project's `assets/fonts/` too.
