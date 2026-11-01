# AI;DR design system

The single source of truth for how aidr.today looks. It is an xAI-inspired
reader: a clean, compact layout, Inter, hairline dividers, white or black pill
buttons, and one yellow signal. It has a light theme and a dark theme, works
on phones, and looks the same on every page.

Token values live in `packages/ui/tokens.css`. The Chrome extension gets a
byte copy, and `apps/web/src/styles.css` keeps matching blocks; the
`tokens.test.mjs` test fails if they drift. Change a color in all three by
editing `tokens.css`, running `pnpm --filter @aidr/ui sync-tokens`, and
copying the block into `styles.css`.

## Themes

- The site follows the system setting by default (next-themes,
  `defaultTheme="system"`, class `.dark` on `<html>`).
- A reader's own choice in the prefs panel (Mode, Background) overrides it
  and is kept in `localStorage`.
- Reader backgrounds: `cream` and `gray` are light pages, `black` is the dark
  theme on `#000`. `styles.css` adjusts the text tokens on `gray` so they keep
  4.5:1.

## Color tokens

| Role                           | Token                    | Dark        | Light       |
| ------------------------------ | ------------------------ | ----------- | ----------- |
| Canvas (page)                  | `--background`           | `#0a0a0a`   | `#fafaf9`   |
| Panel (cards, popovers)        | `--card`, `--popover`    | `#131416`   | `#ffffff`   |
| Sunk (chips, wells, hover)     | `--muted`, `--secondary` | `#1a1c20`   | `#f1f1ef`   |
| Fg (titles, labels)            | `--foreground`           | `#ffffff`   | `#0a0a0a`   |
| Body (long text)               | `--body`                 | `#d4d6da`   | `#2c2d30`   |
| Mute (meta, captions)          | `--muted-foreground`     | `#8d9197`   | `#55595f`   |
| Quiet (one step under mute)    | `--quiet-foreground`     | `#868a90`   | `#575b61`   |
| Line (hairlines)               | `--border`               | `#ffffff17` | `#0a0a0a14` |
| Line 2 (outline pills, inputs) | `--input`                | `#ffffff2e` | `#0a0a0a2e` |
| Signal (logo mark, dot)        | `--signal`, `--brand`    | `#f5c518`   | `#f5c518`   |
| Ink on signal                  | `--signal-ink`           | `#0a0a0a`   | `#0a0a0a`   |
| CTA (solid pill)               | `--primary`              | `#ffffff`   | `#0a0a0a`   |
| Ink on CTA                     | `--primary-foreground`   | `#0a0a0a`   | `#ffffff`   |
| Accent text (links, category)  | `--accent`               | `#f5c518`   | `#a14a07`   |
| Focus ring                     | `--ring`                 | `#f5c518`   | `#b45309`   |
| Keyword: numbers               | `--kw-num`               | `#f5c518`   | `#a14a07`   |
| Keyword: entities              | `--kw-entity`            | `#a0c3ec`   | `#1d4ed8`   |

Rules:

- Yellow is the only accent. Never use `#f5c518` for text on a light
  surface (1.6:1). Use `--accent` or `--kw-num` there.
- Lines are translucent so they stay visible on every reader background.
- Tailwind names: `bg-background`, `bg-card`, `bg-muted`, `text-foreground`,
  `text-body`, `text-muted-foreground`, `border-border`, `border-input`,
  `bg-signal`, `text-signal-ink`, `text-kw-num`, `text-kw-entity`.

### Contrast (WCAG, text needs 4.5:1)

| Text                             | Canvas | Panel | Sunk  | Other      |
| -------------------------------- | ------ | ----- | ----- | ---------- |
| Dark mute `#8d9197`              | 6.25   | 5.82  | 5.39  | black 6.63 |
| Dark quiet `#868a90`             | 5.71   | 5.31  | 4.92  | black 6.05 |
| Dark kw-num `#f5c518`            | 12.14  | 11.31 | 10.47 |            |
| Dark kw-entity `#a0c3ec`         | 10.85  | 10.10 | 9.35  |            |
| Light mute `#55595f`             | 6.75   | 7.05  | 6.23  | gray 5.24  |
| Light quiet `#575b61`            | 6.54   | 6.83  | 6.04  | gray 5.08  |
| Light kw-num / accent `#a14a07`  | 5.75   | 6.00  | 5.31  | cream 5.56 |
| Light kw-entity `#1d4ed8`        | 6.42   | 6.70  | 5.93  | gray 4.98  |
| Light ring `#b45309` (needs 3:1) | 4.81   | 5.02  | 4.44  | gray 3.73  |

Light mute is one step darker than the mockup's `#62666c`: the cream and gray
reader backgrounds reuse the light text steps (`contrast-tokens.test.ts`), and
`#62666c` is 4.29:1 on gray. On the gray background accent and kw-num use
`#8f4106` (5.33:1), since `#a14a07` there would be 4.46:1.

## Type

One family: **Inter** (variable, `wght` 100 to 900, `opsz` pinned to 14),
self-hosted through `scripts/subset-fonts.ts` as one file with latin, the
whole Vietnamese alphabet and Latin Extended-A. `font-display: optional` with
a metric-matched "Inter Fallback" (Arial at 107%). See `src/fonts.css`.

- `--content-font-sans`, `--editorial-font-sans`: Inter. Body and UI.
- `--editorial-font-heading`: Inter. Headings use weight 500 or 600 and
  negative tracking. `font-heading` and `font-serif` (an older name kept for
  the same role) both resolve to it.
- `--reader-font-serif`: Source Serif 4, only when a reader picks "Serif".
- `--editorial-font-mono`: the system mono, for eyebrows and `kbd`. No mono
  file ships, and system monos such as DejaVu Sans Mono lack the stacked
  Vietnamese capitals ("ĐỀ" draws as "ĐÊ`"). So on Vietnamese pages an
  uppercase mono label (`font-mono uppercase`) is set in Inter by one rule
  in `styles.css`. A JetBrains Mono subset would cost 28,468 B at one
  weight, over the 60,000 B font budget.
- Italics are synthesized (no italic file ships). Avoid long italic runs.

Scale (compact):

| Use                             | Desktop                      | Phone (under 820px)          |
| ------------------------------- | ---------------------------- | ---------------------------- |
| Display (story h1, page h1)     | 34px / 1.12, 500, -0.025em   | 24px / 1.18                  |
| Section heading                 | 20px / 1.3, 600, -0.015em    | 18px                         |
| AI;DR summary (story main text) | 17px / 1.6, fg               | 17px / 1.6                   |
| Body                            | 16px / 1.6, body color       | 16px                         |
| Row title                       | 15px / 1.4, 500, fg          | 15px                         |
| Meta, nav, buttons              | 13px                         | 13px (14px in the phone bar) |
| Eyebrow                         | 11px mono, uppercase, +0.1em | 11px                         |

Numbers in rows and stats use `tabular-nums`.

## Spacing and radii

- Base unit 4px. Use 4, 8, 12, 16, 24, 32.
- Section gaps 14 to 16px. Page top padding 20px on desktop, 16px on phones.
- Max content width 1080px. Story pages are one text column plus a 360px
  media rail, with a 32px gap.
- Side gutter 16px on phones, 24px from 640px, 32px from 1024px.
- Radii: pills `999px`; panels `10px` (`--radius`, `rounded-lg`); images
  `10px`, thumbnails `6px`; the logo mark `4px`.

## Components

- **Header**: 52px bar (36px controls, 8px above and below), canvas color with blur, one hairline under it. Logo
  mark (20px yellow square with ";" in ink) plus "AI;DR" in Inter 600 16px.
  Nav links 13px in mute, the current page in fg (`aria-current="page"`),
  shown from 1024px. Outline pill for EN/VI, solid pill for "Get AI;DR".
  Under 640px the bar holds the logo, search and icon buttons, and the rest
  moves into the phone menu.
- **Pill button**: 36px tall on desktop (`h-9`, `sm` is 32px), 13 to 14px,
  weight 500. Solid uses `--primary` and `--primary-foreground`. Outline is
  transparent with a `--input` border and fg text. Ghost has no border and
  `--muted` on hover.
- **AI;DR summary**: on the story page the summary is the main text. A small
  mono "AI;DR" label sits above it, the text is 17px/1.6 in fg, and there is
  no box or numbered list. It is not repeated as a second paragraph.
- **Panel**: `--card` fill, `--border` hairline, 10px radius, 16px padding
  (18px across on desktop). Use it for grouped tools, not for body text.
- **Eyebrow**: 11px mono, uppercase, +0.1em tracking, mute color. The
  category goes first in `--accent` with a "●" dot.
- **Hairline rows**: lists are rows split by `--border` lines, 8 to 12px
  vertical padding, no card per row. Thumbnails 88px wide at 16:9, 6px radius.
- **Keyword highlights**: `.kw-num` for numbers, money and percentages,
  `.kw-entity` for companies, products and people. Color plus weight 600,
  no background, no underline. Use at most a few per title or paragraph.
  `KeywordText` (`lib/keyword-highlight.ts`) applies them everywhere a
  title or AI;DR bullet is shown. Topic and category hues live only in the
  small color dots, never in title text.
- **Vote thumb**: a compact 14px glyph and count; on touch screens
  (`pointer: coarse`) an invisible 44px box around it takes the tap.

## Focus and keyboard

- Every interactive element shows a 2px ring in `--ring` on
  `:focus-visible`, offset 2px: yellow in dark, amber in light. The base
  layer in `styles.css` sets it, and the shared `Button` uses
  `ring-2 ring-ring ring-offset-2`.
- Never remove the outline without putting a ring in its place.
- A keyboard-highlighted row or panel (j/k navigation) uses the same ring,
  with a 6px radius, and scrolls into view. The mouse hover never shows it.
- Shortcuts are listed behind `?` in one `ShortcutSheet`, with a list per
  page (story page, home feed). A "? Shortcuts" hint sits in the page's
  meta row. Hide `kbd` hints on touch devices (`@media (hover: none)`).

## Responsive

- One column under about 820px. The media rail moves above the text and
  goes full bleed (no radius).
- Every touch target is at least 44px on phones.
- Story pages on phones get a sticky bottom action bar (canvas color,
  hairline on top, safe-area padding) with the two main actions as
  44px pills. The inline action row hides there.
- No horizontal scroll at 320px and up. Long words and URLs wrap
  (`overflow-wrap: anywhere`).
- Respect `env(safe-area-inset-*)` on the bars.

## Writing

Plain English and plain Vietnamese. Short labels. No long dashes.
