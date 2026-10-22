# Plan 034: Theme system with AI;DR and Newspaper themes

> **Executor instructions**: Ship the phases in order. Each phase is one PR that a reviewer can verify on its own. Run every verification command and confirm the expected result before moving on. If a STOP condition hits, stop and report. Do not update `plans/README.md` beyond the row this plan adds.
>
> **Drift check (run first)**: `git diff --stat 49f90f44..HEAD -- packages/ui/tokens.css apps/web/src/styles.css apps/web/src/lib/prefs.ts apps/web/src/components/prefs/ThemeTab.tsx apps/extension/js/settings.js apps/extension/js/settings-panel.js`
> If any of these changed, reread the "Current state" section against the new code before you start.

## Status

- **Priority**: P2
- **Effort**: L (four PRs)
- **Risk**: MEDIUM (touches every page's CSS; phase 1 must be a zero visual diff)
- **Depends on**: none
- **Category**: feature
- **Planned at**: commit `49f90f44`, 2026-10-23

## Goal

A reader picks a theme on the website and in the Chrome extension. Two themes ship:

- **AI;DR**: today's look. It must stay byte-identical in rendered output.
- **Newspaper**: a printed broadsheet look. Serif type, newsprint paper, ink rules, small-caps labels, dense columns on wide screens.

Theme and light/dark are two separate choices. Every theme has a light and a dark variant.

## Current state

### Web (`apps/web`)

- Tailwind v4. `apps/web/src/styles.css:1-14` imports Tailwind, shadcn, `fonts.css`, `typeset.css`, and declares `@custom-variant dark (&:is(.dark *))`.
- `@theme inline` (`styles.css:16`) maps Tailwind colors to CSS variables (`--color-background: var(--background)`), so components already paint through tokens.
- `styles.css:77` (`:root {`) and `styles.css:168-221` (`:root.dark, .dark {`) hold their own copy of every token. The shared file `packages/ui/tokens.css` has the same values. `packages/ui/tokens.test.mjs:74-79` fails when the two drift. The web does not import `@aidr/ui/tokens.css` even though `packages/ui/package.json:17` exports it.
- Light/dark: `next-themes` with `attribute="class"`, `defaultTheme="system"` (`packages/ui/ThemeProvider.tsx`), mounted in `apps/web/src/routes/__root.tsx:244`. next-themes writes `localStorage.theme` and injects its own pre-paint script, so dark mode has no flash.
- The header "Aa" button (`apps/web/src/components/PrefsPanel.tsx:40-48`) opens a popover with two tabs, `ThemeTab` and `SettingsTab` (`PrefsPanel.tsx:67-70`).
- `ThemeTab` (`apps/web/src/components/prefs/ThemeTab.tsx`) controls font (sans/serif), font size, density, a five-swatch reader background (`BG_SWATCHES`, `ThemeTab.tsx:23-29`: default, cream, gray, dark, black), and a light/dark switch (`setDarkMode`, `ThemeTab.tsx:51-65`).
- Reader prefs live in `localStorage.news_prefs` (`apps/web/src/lib/prefs.ts:66`, `loadPrefs` at `prefs.ts:92`). The `bg` value lands on `.app-shell[data-reader-bg]` (`__root.tsx:248`, CSS at `styles.css:439-453`). `applyReaderTheme` (`prefs.ts:180-195`) also flips next-themes when the swatch is dark or black.
- `news_prefs` is read only on the client, after hydration. The `data-reader-bg` swatch therefore paints default first and then switches. That is an existing flash this plan must not copy.
- Fonts are self-hosted (`apps/web/src/fonts.css`): Source Sans 3, EB Garamond, Source Serif 4, each with a Vietnamese subset.

### Extension (`apps/extension`)

- Plain JS, no bundler. `newtab.html:7`, `options.html:7`, and `privacy.html:7` load `css/tokens.css`, a byte-identical copy of `packages/ui/tokens.css` written by `pnpm --filter @aidr/ui sync-tokens` (`packages/ui/package.json:22`). `tokens.test.mjs` fails on drift.
- In `tokens.css` dark mode is `html[data-theme="dark"]` (`packages/ui/tokens.css:105`) plus a `prefers-color-scheme` block for `html[data-theme="system"]` (`tokens.css:163`).
- Settings live in `chrome.storage` via `apps/extension/js/settings.js`. `DEFAULT_SETTINGS.theme = "system"` (`settings.js:24`), `THEMES = ["light","dark","system"]` (`settings.js:50`), `BGS` (`settings.js:51`).
- `boot.js` awaits `loadSettings()` and calls `applyAppearance` (`settings.js:178-200`), which sets `data-theme`, `data-font`, `data-density`, and `.dark` on `<html>`. The settings panel (`js/settings-panel.js:81`) mirrors the web "Theme" tab.
- The extension already uses the attribute name `data-theme` for light/dark/system. The new theme choice needs a different attribute.

### Other surfaces that paint brand colors

| Surface | Where | Themed? | Why |
|---|---|---|---|
| OG / share cards | `apps/web/src/lib/story-og.tsx:76` (`YELLOW = "#f5c518"`), `routes/api/og.*` | No | A share card is the brand seen by people who never chose a theme. It is rendered once and cached by URL. |
| Email | `apps/web/worker/mail/markdown.ts`, `templates.ts` | No | Inline hex for mail clients. One edition goes to every subscriber. No reader preference exists at send time. |
| Telegram, Facebook | `worker/notify` | No | Platform renders the post. |
| Video, release films | `videos/`, `.agents/skills/aidr-video` | No | Fixed brand asset. |
| MCP anatomy figure | `apps/web/src/components/mcp/anatomy/anatomy.css` | Inherits tokens only | Another agent owns this area. It reads `--background`/`--foreground`, so it follows whatever tokens the theme sets. No theme-specific rules. |

## Design

### Data shape first

One registry, one type, keyed by theme id. Light/dark stays a second axis that next-themes (web) and `settings.theme` (extension) already own.

```ts
// packages/ui/themes.ts
export const THEME_IDS = ["aidr", "newspaper"] as const;
export type ThemeId = (typeof THEME_IDS)[number];
export const DEFAULT_THEME: ThemeId = "aidr";

export interface ThemeMeta {
  id: ThemeId;
  label: { en: string; vi: string };
  /** Swatch colors for the picker, light and dark. */
  preview: { light: [bg: string, fg: string, accent: string]; dark: [string, string, string] };
}
export const THEMES: Record<ThemeId, ThemeMeta> = { ... };
export function parseThemeId(value: unknown): ThemeId; // anything unknown -> "aidr"
```

The token values do not live in TypeScript. They live in CSS, because the extension has no bundler and the web already reads tokens through CSS variables.

- `packages/ui/tokens.css` keeps the AI;DR tokens on `:root` and the dark set as today.
- `packages/ui/themes/newspaper.css` overrides the same variable names under `html[data-skin="newspaper"]` and the dark set under `html[data-skin="newspaper"].dark`. It also declares the theme-only variables listed in the token table.
- The attribute is `data-skin`, not `data-theme`, because the extension already uses `data-theme` for light/dark/system and next-themes owns the word "theme" on the web. Copy shown to readers still says "Theme" / "Giao diện".

AI;DR is the absence of an override. `html` without `data-skin`, or with `data-skin="aidr"`, paints exactly what ships today. That is how the AI;DR theme stays byte-identical.

### One dark selector

Today the web uses `.dark` and the extension uses `html[data-theme="dark"]` plus a media query. The extension's `applyAppearance` already toggles `.dark` on `<html>` too (`settings.js:183`). Phase 1 makes `.dark` the single dark selector in `tokens.css` for both surfaces, which drops the duplicated media block. The extension keeps computing system dark in `isDarkAppearance`, so behavior does not change.

### Storage and no-flash apply

| Surface | Stored where | Applied when |
|---|---|---|
| Web | `localStorage["aidr_skin"]` (string id) | A 4-line inline script in `<head>`, before CSS paints, sets `document.documentElement.dataset.skin`. Same technique next-themes uses for `.dark`. |
| Extension | `chrome.storage` key `skin` in `settings.js` (`DEFAULT_SETTINGS.skin = "aidr"`) | `boot.js` already awaits settings before first paint and calls `applyAppearance`, which sets `data-skin`. |

Why not a cookie and server-rendered attribute: the home page and story pages are edge-cached HTML. A cookie that changes the HTML would split the cache per reader. The inline script keeps one cached document for everyone, and the theme is a CSS switch on top.

Why not inside `news_prefs`: that object is parsed after hydration (the swatch flash above). The theme needs a tiny key the head script can read with no JSON parse. `prefs.ts` reads and writes the same key through a `skin` field so the React state stays the one source while the page runs.

### Fonts

`@font-face` rules for the Newspaper faces go in `fonts.css` (web) and `apps/extension/css/` (extension), self-hosted woff2 with `latin` and `vietnamese` subsets, `font-display: swap`. A browser downloads a face only when an element uses it, and only `[data-skin="newspaper"]` rules use them. AI;DR readers download zero new bytes. Do not add a `<link rel="preload">` for them.

### Picker placement

The "Aa" popover keeps its two tabs. `ThemeTab` gets a new first row, "Theme" / "Giao diện", with two cards (name plus a three-color strip from `THEMES[id].preview`). The light/dark switch, background swatches, font, size, and density rows stay below it unchanged. The extension settings panel (`settings-panel.js`, "theme" tab) gets the same row.

Interaction with existing rows:

- Background swatches `cream` and `gray` are AI;DR-only. Newspaper already is a paper tone. Under Newspaper the swatch row shows only default / dark / black, and the stored `bg` is kept so switching back restores it.
- The reader font switch (sans/serif) stays. Under Newspaper, "sans" maps to the Newspaper body face anyway (see open question 3).

### Newspaper theme spec

| Element | Light | Dark |
|---|---|---|
| Page (`--background`, `--card`) | `#f4efe4` newsprint | `#16140f` |
| Ink (`--foreground`) | `#141210` | `#ebe5d6` |
| Secondary text (`--muted-foreground`) | `#4a453d` | `#b5ad9c` |
| Quiet text (`--quiet-foreground`) | `#5e584e` | `#a39b8a` |
| Hairline (`--border`) | `#14121033` | `#ebe5d633` |
| Heavy rule (`--rule`, new) | `#141210` | `#ebe5d6` |
| Accent (`--accent`, tags and active link) | `#8b1a1a` oxblood | `#e07a5f` |
| Primary pill (`--primary`) | `#141210` | `#ebe5d6` |
| Brand yellow (`--brand`) | unchanged `#f5c518`, used only for the logo mark | unchanged |

Contrast targets, checked in phase 3 by extending `apps/web/src/lib/contrast-tokens.test.ts`: every text token at 4.5:1 or better on `--background` and `--card`. The values above are a starting point; the test decides.

Type:

- Masthead and headlines: **Playfair Display** (SIL OFL, Google Fonts, has a Vietnamese subset), weights 700 and 900.
- Body, TL;DR bullets, meta: **Newsreader** (SIL OFL, Production Type for Google Fonts, optical sizes, has a Vietnamese subset), 400 and 600.
- Section labels: Newsreader 600, `font-variant: small-caps`, `letter-spacing: 0.06em`.
- Meta lines (source, time): Newsreader italic.

Both faces render Vietnamese diacritics. The prototype shows them with real copy from aidr.today.

Layout rules (scoped to `[data-skin="newspaper"]`):

- Masthead: centered `AI;DR` in Playfair 900 at `clamp(44px, 9vw, 92px)`, a dateline strip above (date, "ranked every 30 minutes", updated time) in small caps, a double rule below (`3px double var(--rule)`).
- Section heads: centered small caps between a 2px top rule and a 1px bottom rule.
- Category chips become a small-caps text row with thin vertical dividers. No pill backgrounds. Active item is `--accent`.
- `--radius: 0` everywhere. No card shadows. Cards lose their border; rules separate content instead.
- TL;DR: CSS columns, `column-rule: 1px solid var(--border)`, 3 columns at 1024px and up, 2 at 700 to 1023, 1 below. Justified text with `hyphens: auto`. A drop cap on the first bullet's text only, never on its tag.
- Top stories: a grid with the lead story spanning 2 of 3 columns at 30px Playfair 900. Vertical rules between columns. One column below 700px.
- Mobile (390px): masthead stays, dateline drops its middle item, everything single column.

### Token table

Variables the theme system reads. "New" means phase 1 adds it with the AI;DR value so the AI;DR output does not change.

| Token | AI;DR light | AI;DR dark | Newspaper light | Newspaper dark | Notes |
|---|---|---|---|---|---|
| `--background` | `#f7f7f5` | `#0c0c0c` | `#f4efe4` | `#16140f` | |
| `--foreground` | `#0a0a0a` | `#fafafa` | `#141210` | `#ebe5d6` | |
| `--card` | `#ffffff` | `#171717` | `#f4efe4` | `#16140f` | |
| `--muted` | `#e5e5e3` | `#2a2a2a` | `#e9e2d3` | `#24211a` | |
| `--muted-foreground` | `#474747` | `#a3a3a3` | `#4a453d` | `#b5ad9c` | |
| `--quiet-foreground` | `#5c5c5c` | `#9a9a9a` | `#5e584e` | `#a39b8a` | |
| `--border` | `#0a0a0a14` | `#ffffff1a` | `#14121033` | `#ebe5d633` | |
| `--accent` | `#b45309` | `#f59e0b` | `#8b1a1a` | `#e07a5f` | |
| `--primary` | `#0a0a0a` | `#fafafa` | `#141210` | `#ebe5d6` | |
| `--editorial-font-serif` | EB Garamond | same | Playfair Display | same | headlines |
| `--editorial-font-sans` | Source Sans 3 | same | Newsreader | same | body UI text |
| `--rule` (new) | `var(--border)` | `var(--border)` | `#141210` | `#ebe5d6` | heavy section rules |
| `--radius` | current value | same | `0` | `0` | |
| `--label-variant` (new) | `normal` | same | `small-caps` | same | section labels |
| `--label-tracking` (new) | `0` | same | `0.06em` | same | |
| `--feed-columns` (new) | `1` | same | `3` (2 at 700 to 1023, 1 below) | same | TL;DR and top stories |

Every other existing token (`--heat-*`, `--chart-*`, `--sidebar-*`, `--brand*`, reader bg swatches) keeps its AI;DR value under Newspaper unless phase 3 finds a contrast failure.

## Phases

Each phase is one PR, ships alone, and leaves production working.

### Phase 1: one token source, zero visual diff

1. Make `apps/web/src/styles.css` import `@aidr/ui/tokens.css` and delete its own `:root {}` and `:root.dark, .dark {}` token blocks (`styles.css:77-221`). Move the web-only comment lines into `tokens.css`.
2. In `tokens.css`, switch the dark selector to `.dark` and delete the `prefers-color-scheme` mirror block. The extension already sets `.dark` (`settings.js:183`).
3. Add the new tokens from the table (`--rule`, `--label-variant`, `--label-tracking`, `--feed-columns`) with AI;DR values. Nothing reads them yet.
4. Rewrite `tokens.test.mjs`: drop the "web styles.css tokens match" test (there is no second copy), keep the byte-identical extension copy test.
5. `pnpm --filter @aidr/ui sync-tokens`.

Verify:

- `pnpm --filter @aidr/web test`, `pnpm --filter @aidr/web check-types`, `node --test packages/ui/tokens.test.mjs`, `pnpm --filter @aidr/extension test`.
- Computed-style diff: a script loads `/`, `/story/<id>`, `/date/<today>`, `/subscribe`, `/mcp` in light and dark on the local dev server before and after the change and diffs `getComputedStyle(document.documentElement)` for every `--*` variable plus a pixel screenshot diff at 1280 and 390. Expected: zero changed variables, zero changed pixels.
- Load the unpacked extension in light, dark, and system; screenshots match before/after.

STOP if any variable or pixel changes.

### Phase 2: registry and picker, AI;DR only selectable

1. Add `packages/ui/themes.ts` (`THEME_IDS`, `THEMES`, `parseThemeId`) with both entries.
2. Web: the head script that sets `data-skin` from `localStorage.aidr_skin`, a `skin` field in `Prefs` that reads and writes that key, and the "Theme" row in `ThemeTab`. Newspaper card renders disabled with "Coming soon" / "Sắp có" until phase 3.
3. Track `prefs_change` with `pref: "skin"` like the other rows.

Verify: unit tests for `parseThemeId` (unknown, empty, and stored-garbage values fall back to `aidr`) and for the head script string (it must not throw when storage is blocked). Phase 1 computed-style diff still zero. `verify-aidr drive` the Aa popover.

### Phase 3: Newspaper on the web

1. Self-host Playfair Display and Newsreader woff2 (latin + vietnamese) and add `@font-face` rules to `fonts.css`.
2. Add `packages/ui/themes/newspaper.css` with the token overrides and the layout rules from the spec. Import it after `tokens.css`.
3. Enable the Newspaper card. Hide cream and gray swatches under Newspaper.
4. Extend `contrast-tokens.test.ts` to run every text token pair for both themes and both modes.

Verify:

- Contrast tests pass.
- AI;DR computed-style and pixel diff against phase 2: zero.
- Screenshots of `/`, a story page, `/date/<today>`, `/subscribe` in Newspaper light and dark at 1280 and 390, attached to the PR.
- Network panel on an AI;DR page shows no Playfair or Newsreader request.
- Reload with Newspaper selected and throttled CPU: no frame paints the AI;DR palette first.
- `verify-aidr doctor`, then `verify-aidr drive` home with the theme switched.

### Phase 4: extension

1. Add `skin` to `DEFAULT_SETTINGS`, the `pick` list in `settings.js`, and `applyAppearance` (`root.dataset.skin = settings.skin`).
2. Copy `themes/newspaper.css` and the two font files into the extension (extend `sync-tokens` to copy it; extend the drift test to cover it). Link it from `newtab.html` and `options.html`.
3. Add the Theme row to `settings-panel.js`, same order and copy as the web.
4. Bump the extension version and note it in `apps/extension/CHANGELOG.md`.

Verify: `pnpm --filter @aidr/extension test` with new `settings.test.js` cases (default is `aidr`, unknown values fall back). Load unpacked, switch themes in light, dark, and system, screenshot the new tab at 1280 and 390. Settings survive a browser restart.

## Risks

- **Phase 1 is a big CSS move.** A selector order change can shift cascade results without changing a single value. The computed-style plus pixel diff is the gate, not review.
- **Cache split.** Any server-side read of the theme would split the edge cache. Keep the choice client-only.
- **Font weight.** Two new families add about 150 to 200 KB for Newspaper readers. Subset to latin + vietnamese and only the weights listed.
- **Fixed hex in components.** Some components set colors inline (`StoryRow.tsx`, `TrendingChips.tsx`, `CategoryLabel.tsx`, topic colors in `lib/topic-color.ts`). They keep AI;DR colors under Newspaper. Phase 3 lists each one it finds and either maps it to a token or accepts it.
- **Two dark sources on the web.** `applyReaderTheme` writes `.dark` and next-themes also writes it. The theme work must not add a third writer. `data-skin` never touches `.dark`.
- **Owned-elsewhere files.** `apps/web/src/components/subscribe/McpChannel.tsx` and `apps/web/src/routes/mcp.tsx` are being edited by another agent as this plan is written. Leave them to inherit tokens.

## Prototype

A throwaway static mock (not committed) of the home page in both themes, light and dark, at 1280 and 390, using live copy from aidr.today on 2026-10-23. It confirmed that Playfair Display and Newsreader render Vietnamese diacritics cleanly, and it caught two layout bugs that the spec now rules out. The drop cap must skip the tag. Column rules must not depend on `nth-child` once the lead story spans two columns.

## Open questions for the owner

1. **Default for new readers.** AI;DR for everyone, or follow a URL like `?theme=newspaper` for share links? The plan assumes AI;DR and no URL param.
2. **Masthead.** Newspaper replaces the header bar with a centered masthead. Is that acceptable on every page, or only on the home page with the normal header elsewhere?
3. **Reader font switch under Newspaper.** Keep the sans/serif switch (sans means Source Sans body text inside a newspaper layout), or hide it under Newspaper?
4. **Cream and gray swatches.** Hide them under Newspaper (the plan's choice), or keep them as paper tints?
5. **Sync between web and extension.** Signed-in readers could carry the theme across both. The plan keeps each surface local. Worth a later plan?
6. **Brand yellow.** The Newspaper palette drops yellow except for the logo. Is a theme with almost no brand yellow still on brand?
