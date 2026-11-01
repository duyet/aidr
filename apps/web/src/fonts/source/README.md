# Upstream web font sources

Full variable fonts that `scripts/subset-fonts.ts` cuts into the one-file-per-family
subsets `src/fonts.css` serves. They are never served directly.

| File                             | Upstream                                       | Commit     | Font revision |
| -------------------------------- | ---------------------------------------------- | ---------- | ------------- |
| `inter-opsz-wght.woff2`          | `ofl/inter/Inter[opsz,wght].ttf`               | `0b58fb37` | 4.001         |
| `source-serif-4-opsz-wght.woff2` | `ofl/sourceserif4/SourceSerif4[opsz,wght].ttf` | `ddf386ba` | 4.004         |

Both come from [google/fonts](https://github.com/google/fonts), rewrapped
losslessly as woff2 with `fonttools ttLib.woff2 compress` to keep the repo
small. Each `*.OFL.txt` is that family's SIL Open Font License 1.1 from the
same commit.

- Inter: commit `0b58fb370093f9a9f4ff785d94405710b79de67c`. The subsetter
  pins the `opsz` axis to 14 (text size) and keeps `wght` variable.
- Source Serif 4: commit `ddf386ba1b9fbc6b2c818f1ddcd9148f54ced94b`, the
  revision `@fontsource-variable` 5.3.x shipped, so glyphs did not change when
  the site moved off Fontsource's per-subset files. The subsetter pins `opsz`
  to 14.

Source Sans 3 and EB Garamond were removed when Inter became the site's only
UI and heading face (see `apps/web/DESIGN.md`).

To upgrade, download the new `.ttf` at a pinned commit, compress it to the same
file name, update this table, and run `pnpm --filter @aidr/web test`.
