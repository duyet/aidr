# Changelog

## [0.1.15](https://github.com/duyet/aidr/compare/aidr-v0.1.14...aidr-v0.1.15) (2026-09-10)

### ✨ Features

* **extension:** reload icon beside the digest updated timestamp (force network refresh)


## [0.1.14](https://github.com/duyet/aidr/compare/aidr-v0.1.13...aidr-v0.1.14) (2026-09-10)

### 💄 Styles

* **extension:** hide publisher domain next to story titles (match the web list)
* **extension:** hide points/comments score on feed rows
* **web:** hide points/comments score on StoryRow

### 🐛 Bug Fixes

* **extension:** section tiles in Settings repaint so on/off state updates immediately


## [0.1.13](https://github.com/duyet/aidr/compare/aidr-v0.1.12...aidr-v0.1.13) (2026-09-09)

### 💄 Styles

* **extension:** vertically center AI;DR when it is the only new-tab section, with more relaxed spacing
* **extension:** header action row shares one vertical center (Chrome, Telegram, Submit, Aa, EN|VI, Sign in)

### ✨ Features

* **extension:** hide header Submit (+) unless the session is signed in


## [0.1.12](https://github.com/duyet/aidr/compare/aidr-v0.1.11...aidr-v0.1.12) (2026-09-09)

### 🐛 Bug Fixes

* **extension:** header Chrome control uses RiChromeLine (same mark as aidr.today HeaderBar)
* **extension:** drop oversized "Add section" restore chip from new tab (restore sections in Settings)

### 💄 Styles

* **extension:** header Telegram / Chrome / Submit icons share 1rem size


## [0.1.11](https://github.com/duyet/aidr/compare/aidr-v0.1.10...aidr-v0.1.11) (2026-09-09)

### ✨ Features

* **extension:** digest-first layout tighter (AI;DR padding, chips, footer hidden by default)
* **extension:** cache-first hydrateDigest paints last digest then live-refresh; skip no-op re-paint
* **extension:** campaign-tagged digest fetches (cache hit vs miss) plus prefs/lang track pings on existing `/api/extension`


## [0.1.10](https://github.com/duyet/aidr/compare/aidr-v0.1.9...aidr-v0.1.10) (2026-09-08)

### ✨ Features

* **extension:** icon-only Submit button in desktop header (matches web HeaderBar)
* **extension:** story dialog now renders bilingual EN|VI columns with dual-language toggle, source kind/author/timestamp/quote rows, topic tag badges, and thumbnail image — matching web StoryDetail
* **extension:** theme tokens aligned with web styles.css (secondary, input, popover, card-foreground, border-radius)
* **extension:** section key renamed stories→days; default section order now [categories, trending, tldr, days] matching aidr.today PrefsPanel
* **extension:** bilingual dialog preference toggle in Settings panel (persists across stories)


## [0.1.9](https://github.com/duyet/aidr/compare/aidr-v0.1.8...aidr-v0.1.9) (2026-09-08)

Stay on 0.1.x: feat commits must not open aidr-v0.2.x. Chrome Web Store and
GitHub tags remain aidr-v0.1.*.


## [0.3.0](https://github.com/duyet/aidr/compare/aidr-v0.2.0...aidr-v0.3.0) (2026-09-07)

Unpublished line (no `aidr-v0.3.0` tag). Folded into 0.1.9.


### ✨ Features

* **extension:** Chrome Web Store link in header next to Telegram icon
* **extension:** Submit button now icon-only in desktop header with aria-label
* **extension:** contrast tuning for muted/accent colors light and dark, matching website theme


## [0.2.0](https://github.com/duyet/aidr/compare/aidr-v0.1.8...aidr-v0.2.0) (2026-09-06)

Unpublished line (no `aidr-v0.2.0` tag). Folded into 0.1.9.


### ✨ Features

* **extension:** digest-first new tab — AI;DR brief above a collapsed daily feed with per-section Hide / Move up / Move down chrome, "Add section" restore, section ordering, show-footer toggle, and cache-first fast paint
* **extension:** footer hidden by default for a cleaner digest-first layout (toggle in Settings)
* **web:** digest-first homepage — daily feed starts collapsed behind "Show daily feed" toggle; AI;DR brief stays prominent; per-section chrome toolbar and "Add section" restore (parity with extension)
* **web:** PrefsPanel sections grid with wireframes; section ordering; hidden-section restore
* **web:** bilingual dialog preference remembered across stories


### 🐛 Bug Fixes

* **extension:** stories section now defaults to off (sections.stories === true), matching showFooter default-false normalization
* **extension:** export el() helper so newtab.js section-chrome helpers resolve (was undefined in newtab.js module scope)


## [0.1.8](https://github.com/duyet/aidr/compare/aidr-v0.1.7...aidr-v0.1.8) (2026-09-06)


### ✨ Features

* **extension:** match website PrefsPanel and Slashy reader chrome


## [0.1.7](https://github.com/duyet/aidr/compare/aidr-v0.1.6...aidr-v0.1.7) (2026-09-05)


### 🐛 Bug Fixes

* **extension:** replace unclickable settings drawer with Aa prefs dialog


## [0.1.6](https://github.com/duyet/aidr/compare/aidr-v0.1.5...aidr-v0.1.6) (2026-09-05)


### ✨ Features

* **extension:** match live homepage header, footer, day feed, and reader fonts


## [0.1.5](https://github.com/duyet/aidr/compare/aidr-v0.1.4...aidr-v0.1.5) (2026-09-05)


### ✨ Features

* **extension:** AI;DR wordmark logo and sticky branded new-tab topbar


## [0.1.4](https://github.com/duyet/aidr/compare/aidr-v0.1.3...aidr-v0.1.4) (2026-09-05)


### ✨ Features

* **extension:** pack a CWS zip with manifest at archive root ([ab8fc3a](https://github.com/duyet/aidr/commit/ab8fc3ab148906bcb7e1c29686d4a10b6ab510d3))

## [0.1.3](https://github.com/duyet/aidr/compare/aidr-v0.1.2...aidr-v0.1.3) (2026-09-04)


### ✨ Features

* bootstrap aidr monorepo from news + news-tab ([b1e3e54](https://github.com/duyet/aidr/commit/b1e3e54019a3668f1704da0ab796e459655acff2))
* **extension:** prepare CWS auto-update and first-review checklist ([b4168a5](https://github.com/duyet/aidr/commit/b4168a5d0d92f8c6a5f6e82e1fee6d01a34a74ab))

## [0.1.2](https://github.com/duyet/monorepo/compare/news-tab-v0.1.1...news-tab-v0.1.2) (2026-09-03)


### ✨ Features

* **news-tab:** match live homepage AI;DR layout ([#1429](https://github.com/duyet/monorepo/issues/1429)) ([4740556](https://github.com/duyet/monorepo/commit/47405565ef79882190c42ef8c5d8c91fa7dfe73f))
* **news:** public Chrome new-tab zip and load-unpacked guide ([#1421](https://github.com/duyet/monorepo/issues/1421)) ([8989c2f](https://github.com/duyet/monorepo/commit/8989c2f36ab82d3bed92c059737716ef6d5df67e))


### 🐛 Bug Fixes

* **news:** unzip then Load unpacked the folder, not the zip ([#1423](https://github.com/duyet/monorepo/issues/1423)) ([7ffba0e](https://github.com/duyet/monorepo/commit/7ffba0e0524fa744047068e246df2cadf7d7185f))

## [0.1.1](https://github.com/duyet/monorepo/compare/news-tab-v0.1.0...news-tab-v0.1.1) (2026-08-29)


### ✨ Features

* **news-tab:** add Chrome new-tab extension to monorepo ([#1403](https://github.com/duyet/monorepo/issues/1403)) ([6d1b20b](https://github.com/duyet/monorepo/commit/6d1b20bef4050cce466d9e5d51d5b723269bbc4d))

## Changelog
