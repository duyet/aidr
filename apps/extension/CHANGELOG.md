# Changelog

## [0.2.0](https://github.com/duyet/aidr/compare/aidr-v0.1.8...aidr-v0.2.0) (2026-09-06)


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
