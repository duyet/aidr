# AI;DR design system

The single source of truth for how aidr.today looks. It is a warm reader:
warm paper and ink neutrals, Inter, spacing instead of divider lines, soft
round buttons, and one yellow signal. It has a light theme and a dark theme,
three layouts (compact, comfortable, newspaper), works on phones, and looks
the same on every page. The approved redesign and its prototype are
`plans/redesign-v2.md` and `plans/redesign-v2/reference.html`.

Token values live in `packages/ui/tokens.css`. The Chrome extension gets a
byte copy, and `apps/web/src/styles.css` keeps matching blocks; the
`tokens.test.mjs` test fails if they drift. Change a color in all three by
editing `tokens.css`, running `pnpm --filter @aidr/ui sync-tokens`, and
copying the block into `styles.css`.

## Themes

- The site follows the system setting by default (next-themes,
  `defaultTheme="system"`, class `.dark` on `<html>`).
- A reader's own choice in Customize (Mode, Background) overrides it and is
  kept in `localStorage`.
- Reader backgrounds: paper (`default`), `gray` and `black` are offered;
  `cream` still loads for readers who saved it. `cream` and `gray` are light
  pages, `black` is the dark theme on `#000` with a `#0b0b0b` panel and a
  `#151515` sunk surface. `styles.css` pins the light text steps on `cream`
  and `gray` so they keep 4.5:1.

## Color tokens

| Role                        | Token                    | Dark        | Light       |
| --------------------------- | ------------------------ | ----------- | ----------- |
| Canvas (page)               | `--background`           | `#1f1e1d`   | `#ffffff`   |
| Panel (cards, popovers)     | `--card`, `--popover`    | `#262624`   | `#ffffff`   |
| Sunk (soft fills, hover)    | `--muted`, `--secondary` | `#30302e`   | `#f0eee6`   |
| Fg (titles, labels)         | `--foreground`           | `#f5f4ee`   | `#1f1e1d`   |
| Body (long text)            | `--body`                 | `#d6d4cc`   | `#3d3d3a`   |
| Mute (meta, captions)       | `--muted-foreground`     | `#a19f96`   | `#64635d`   |
| Quiet (one step under mute) | `--quiet-foreground`     | `#9c9a92`   | `#66655f`   |
| Line (the few lines left)   | `--border`               | `#ffffff1a` | `#1f1e1d1a` |
| Line 2 (inputs)             | `--input`                | `#ffffff33` | `#1f1e1d33` |
| Signal (logo mark, dot)     | `--signal`, `--brand`    | `#f5c518`   | `#f5c518`   |
| Ink on signal               | `--signal-ink`           | `#0a0a0a`   | `#0a0a0a`   |
| CTA (primary button)        | `--primary`              | `#f5f4ee`   | `#1f1e1d`   |
| Ink on CTA                  | `--primary-foreground`   | `#1f1e1d`   | `#ffffff`   |
| Accent text (links)         | `--accent`               | `#f5c518`   | `#8f4300`   |
| Focus ring                  | `--ring`                 | `#f5c518`   | `#b45309`   |
| Keyword: numbers            | `--kw-num`               | `#f5c518`   | `#8f4300`   |
| Keyword: entities           | `--kw-entity`            | `#a0c3ec`   | `#1d4ed8`   |

Rules:

- Yellow is the brand mark and the default accent. Never use `#f5c518` for
  text on a light surface (1.6:1). Use `--accent` or `--kw-num` there.
- The spec's light mute is `#6b6a64`. It moved to `#64635d`, and quiet to
  `#66655f`, because the gray reader background reuses the light text steps
  (`contrast-tokens.test.ts`): `#6b6a64` is 4.25:1 on `#e4e4df`, and the green
  topic count mixed from quiet has to clear 4.5:1 there too. Dark quiet is
  `#9c9a92` for the same reason on the `#30302e` sunk surface.
- Lines are translucent so they stay visible on every reader background.
- Tailwind names: `bg-background`, `bg-card`, `bg-muted`, `text-foreground`,
  `text-body`, `text-muted-foreground`, `border-border`, `border-input`,
  `bg-signal`, `text-signal-ink`, `text-kw-num`, `text-kw-entity`.

### Contrast (WCAG, text needs 4.5:1)

| Text                             | Canvas | Panel | Sunk | Other       |
| -------------------------------- | ------ | ----- | ---- | ----------- |
| Dark mute `#a19f96`              | 6.27   | 5.71  | 4.98 | black 7.92  |
| Dark quiet `#9c9a92`             | 5.91   | 5.38  | 4.69 | black 7.45  |
| Dark kw-num / accent `#f5c518`   | 10.21  | 9.30  | 8.11 | black 12.88 |
| Dark kw-entity `#a0c3ec`         | 9.12   | 8.31  | 7.25 |             |
| Light mute `#64635d`             | 5.72   | 6.03  | 5.19 | gray 4.72   |
| Light quiet `#66655f`            | 5.55   | 5.85  | 5.03 | gray 4.58   |
| Light kw-num / accent `#8f4300`  | 6.71   | 7.07  | 6.09 | gray 5.54   |
| Light kw-entity `#1d4ed8`        | 6.36   | 6.70  | 5.77 | gray 5.25   |
| Light ring `#b45309` (needs 3:1) | 4.77   | 5.02  | 4.32 | gray 3.94   |

The accent choices (below) are checked the same way in
`contrast-tokens.test.ts`.

## Accent

A reader picks the accent in Customize: yellow (default), blue, green, rose or
violet. It recolors the logo mark (`--signal`, `--signal-ink`), links
(`--accent`, `--editorial-accent`) and the focus ring (`--ring`) only.
`.app-shell[data-accent]` sets them; `.dark .app-shell[data-accent]` sets the
dark values. Every light value is at least 4.5:1 on canvas, panel, sunk, cream
and gray, and every dark value on canvas, panel, sunk and black.

| Accent | Light text and ring  | Dark text and ring | Mark      | Ink on mark |
| ------ | -------------------- | ------------------ | --------- | ----------- |
| yellow | `#8f4300`, `#b45309` | `#f5c518`          | `#f5c518` | `#0a0a0a`   |
| blue   | `#1d4ed8`            | `#8db4ff`          | `#4c8dff` | `#ffffff`   |
| green  | `#0e7044`            | `#5bd39a`          | `#2bb673` | `#04140c`   |
| rose   | `#b0264a`            | `#ff8da8`          | `#f0527a` | `#ffffff`   |
| violet | `#6a3fd0`            | `#bba2ff`          | `#8b5cf6` | `#ffffff`   |

Green is one step darker than the prototype's `#117a4a`, which is 4.21:1 on
the gray background.

## Topic color

Each story category keeps its existing color pair (`src/lib/topic-color.ts`,
checked by `category-contrast.test.ts`). `topicStyle()` in `src/lib/topic.ts`
sets the pair as `--tc-light`/`--tc-dark` on an element, and two classes paint
with it:

- `.topic-dot`: the dot on each row, chip and tag. Decorative; the label
  beside it is the text.
- `.topic-ink`: a key name as plain colored text, no underline and no
  background. Text mixes the hue 70% with the foreground, so light mode gets
  the darker ink and keeps 4.5:1.

The highlight pref (`data-highlight`) changes both: `topic` (default) uses
the topic color, `one` uses the accent, `none` paints the ink in the
foreground and the dot in mute. `topicLabel()` gives the localized category
name (Vietnamese in VI mode: Chính sách, Sản phẩm, Model, Ngành, Nghiên cứu,
Chip, Gọi vốn, Tác nhân, Dữ liệu, and the extension's names for the rest).

## Type

One family: **Inter** (variable, `wght` 100 to 900, `opsz` pinned to 14),
self-hosted through `scripts/subset-fonts.ts` as one file with latin, the
whole Vietnamese alphabet and Latin Extended-A. `font-display: optional` with
a metric-matched "Inter Fallback" (Arial at 107%). See `src/fonts.css`.

- `--content-font-sans`, `--editorial-font-sans`: Inter. Body and UI, weights
  400 to 700.
- `--editorial-font-heading`: Inter. Headings use weight 500 or 600 and
  negative tracking. `font-heading` and `font-serif` (an older name kept for
  the same role) both resolve to it. The headline font pref (`data-head-font`)
  and the newspaper layout point it at the serif.
- `--reader-font-serif`: Source Serif 4, when a reader picks the serif for
  headlines or body in Customize, and for the newspaper layout.
- `--editorial-font-mono`: the system mono, for eyebrows and `kbd`. No mono
  file ships, and system monos such as DejaVu Sans Mono lack the stacked
  Vietnamese capitals ("ĐỀ" draws as "ĐÊ`"). So on Vietnamese pages an
  uppercase mono label (`font-mono uppercase`) is set in Inter by one rule
  in `styles.css`. A JetBrains Mono subset would cost 28,468 B at one
  weight, over the 60,000 B font budget.
- Italics are synthesized (no italic file ships). Avoid long italic runs.

Scale (about 8%, then 7%, under the previous one):

| Use                             | Desktop                          | Phone (under 700px) |
| ------------------------------- | -------------------------------- | ------------------- |
| Page and story headline         | 34.5px / 1.15, 600, -0.02em      | 26px (24px narrow)  |
| Lead headline (home)            | 21px compact, 25.5px comfortable | 20.5px              |
| AI;DR summary (story main text) | 16.5px / 1.65                    | 16.5px              |
| Body                            | 13 to 14px, body color           | 13 to 14px          |
| Row title                       | 13.5px / 1.4, 500 (13px compact) | 13.5px              |
| Meta, labels, nav               | 12.5px                           | 12.5px              |
| Buttons                         | 13px                             | 13px                |
| Section label                   | 12.5px, uppercase, +0.07em       | 12.5px              |

Numbers in rows and stats use `tabular-nums`. `styles.css` exposes the sizes
that change by layout as `--headline-size`, `--lead-title-size`,
`--list-title-size` and `--summary-size` on `.app-shell`.

## No lines

No divider lines between rows, sections, the header or the footer. Spacing
and a hover tint (`--muted`) separate things. The exceptions:

- the AI;DR card keeps its production look, hairlines included;
- form controls keep an outline only where they need 3:1 against their
  surface (`--input`);
- focus rings.

## Spacing and radii

- Base unit 4px. Use 4, 8, 12, 16, 24, 32.
- Home spacing is relaxed in every layout: section gaps 32px
  (`--home-section-gap`), rows 15px vertical (`--home-row-pad`), 52px row
  thumbnails (`--home-thumb-size`), a 48px gap to the rail and 36px between
  rail blocks (`--home-rail-gap`). Under 700px: 24px, 13px, 32px and 28px.
- Lists on other pages use `--row-pad` and `--thumb-size`, set by layout.
- Max content width 1080px. The rail is 300px (`--rail-width`).
- Side gutter 16px on phones, 24px from 640px, 32px from 1024px.
- Radii: buttons, chips and pills `999px`; panels `10px` (`--radius`,
  `rounded-lg`); images `10px`, thumbnails `6px`; the logo mark `4px`. The
  newspaper layout sets `--radius` to 2px, so panels go square and pills stay
  round.

## Layouts

The `layout` pref, on `.app-shell` as `data-layout`. A three-icon switch sits
in the menu bar from 700px; under 700px it lives in Customize.

| Layout            | `--row-pad` | `--list-title-size` | `--thumb-size` | Notes                                                                                                                                       |
| ----------------- | ----------- | ------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| compact (default) | 7px         | 13px                | 44px           | Lead headline 21px, 30px chips.                                                                                                             |
| comfortable       | 15px        | 13.5px              | 52px           | The roomier list.                                                                                                                           |
| newspaper         | 12px        | 16.5px              | hidden         | Serif masthead and headlines, justified text, a drop cap on the story summary, the ranked list in 2 or 3 columns, square corners, no rules. |

Newspaper helpers in `styles.css` do nothing in the other layouts:
`.np-only` (shown only in newspaper), `.np-hide`, `.np-masthead` with
`.np-masthead-title` and `.np-masthead-date`, `.np-columns` (`--news-cols`
columns, one under 700px, no column rule), `.np-justify` and `.drop-cap`.

Other page-wide prefs on `.app-shell`: `data-thumbs` (`.row-thumb` hides when
`off`), `data-summaries` (`.row-summary` shows when `on`, and always in
newspaper), `data-tldr-cols` (`.tldr-grid` uses `--tldr-cols`, one column under
760px), `data-news-cols` and `data-head-font`. Dialogs, drawers and popovers
portal to `<body>`, outside `.app-shell`, so they do not see these values.

## Components

- **Header**: a 52px bar (48px in compact), canvas color, no line under it.
  Logo mark (20px yellow square with ";" in ink) plus "AI;DR" in Inter 600.
  Nav links (Today, Weeks, Calendar, each with an icon) in mute, the current
  page in fg (`aria-current="page"`). One primary button with the logo mark
  and "AI;DR". Under 700px the bar holds the logo, Aa, the AI;DR button and
  search, with a bottom tab bar.
- **Buttons**: three styles, all 32px high, 13px, weight 500, fully round,
  with the same focus ring. Icons are lucide-react at 15px, 2px stroke, beside
  a label (only the layout switch and the header Aa are icon-only).
  - `.btn-primary`: `--primary` fill and `--primary-foreground` text. One per
    area.
  - `.btn-soft`: the secondary action, `--muted` fill, no border.
  - `.btn-link`: accent-colored text with an icon. Most secondary actions
    (copy, share, show more, read source, follow) are links.
    On touch screens each gets an invisible 44px tap box.
- **Chips** (`.chip`): soft `--muted` fill, no border, 12.5px, `--chip-h` high.
  A topic chip is dot, localized name, then a `.chip-count`. The selected chip
  (`aria-pressed="true"`) inverts to `--primary` and `--primary-foreground`.
  Segmented switches, the search box and inputs use the same soft fill.
- **AI;DR summary**: on the story page the summary is the main text. A small
  "AI;DR" label sits above it, the text is 16.5px/1.65 in fg, and there is no
  box or numbered list. It is not repeated as a second paragraph.
- **Panel**: `--card` fill, 10px radius, 16px padding. Use it for grouped
  tools, not for body text.
- **Rows**: spacing and a hover tint, no line between rows. Number, a
  two-line title, topic dot, source, time, thumbnail.
- **Keyword highlights**: `.kw-num` for numbers, money and percentages,
  `.kw-entity` for companies, products and people. Color plus weight 600,
  no background, no underline. Use at most a few per title or paragraph.
  `KeywordText` (`lib/keyword-highlight.ts`) applies them everywhere a
  title or AI;DR bullet is shown.
- **Vote thumb**: a compact 14px glyph and count; on touch screens
  (`pointer: coarse`) an invisible 44px box around it takes the tap.

## Focus and keyboard

- Every interactive element shows a 2px ring in `--ring` on
  `:focus-visible`, offset 2px: yellow in dark, amber in light, or the
  reader's accent. The base layer in `styles.css` sets it, and the shared
  `Button` uses `ring-2 ring-ring ring-offset-2`.
- Never remove the outline without putting a ring in its place.
- A keyboard-highlighted row or panel (j/k navigation) uses the same ring,
  with a 6px radius, and scrolls into view. The mouse hover never shows it.
- Shortcuts are listed behind `?` in one `ShortcutSheet`, with a list per
  page (story page, home feed). A "? Shortcuts" hint sits in the page's
  meta row. Hide `kbd` hints on touch devices (`@media (hover: none)`).

## Responsive

- The phone breakpoint is 700px. The story grid goes to one column under
  900px, and the AI;DR card to one column under 760px.
- Every touch target is at least 44px on phones.
- No horizontal scroll at 320px and up. Long words and URLs wrap
  (`overflow-wrap: anywhere`).
- Respect `env(safe-area-inset-*)` on the bars.
- `prefers-reduced-motion: reduce` turns off the button and chip transitions;
  new motion must do the same.

## Writing

Plain English and plain Vietnamese. Short labels. No long dashes.
