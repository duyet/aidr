# Upstream web font sources

Full variable fonts that `scripts/subset-fonts.ts` cuts into the one-file-per-family
subsets `src/fonts.css` serves. They are never served directly.

| File                         | Upstream                                   | Commit     | Font revision |
| ---------------------------- | ------------------------------------------ | ---------- | ------------- |
| `inter-opsz-wght.woff2`      | `ofl/inter/Inter[opsz,wght].ttf`           | `0b58fb37` | 4.001         |
| `newsreader-opsz-wght.woff2` | `ofl/newsreader/Newsreader[opsz,wght].ttf` | `8b0a1d0f` | 1.003         |

Both come from [google/fonts](https://github.com/google/fonts), rewrapped
losslessly as woff2 with `fonttools ttLib.woff2 compress` to keep the repo
small. Each `*.OFL.txt` is that family's SIL Open Font License 1.1 from the
same commit.

- Inter: commit `0b58fb370093f9a9f4ff785d94405710b79de67c`. The subsetter
  pins the `opsz` axis to 14 (text size) and keeps `wght` variable.
- Newsreader: commit `8b0a1d0f5983c89bc2b93f1b5fb55f9e252744b5`. The
  reading serif for AI;DR Weekly and the "Serif" reader pref; replaces
  Source Serif 4 (Production Type drew it for news streams and publishing
  platforms; full Vietnamese coverage). The subsetter pins `opsz` to 14.

Source Sans 3 and EB Garamond were removed when Inter became the site's only
UI and heading face; Source Serif 4 was swapped for Newsreader in the same
role (see `apps/web/DESIGN.md`).

To upgrade, download the new `.ttf` at a pinned commit, compress it to the same
file name, update this table, and run `pnpm --filter @aidr/web test`.
