# Upstream web font sources

Full variable fonts that `scripts/subset-fonts.ts` cuts into the one-file-per-family
subsets `src/fonts.css` serves. They are never served directly.

| File                             | Upstream                                       | Font revision |
| -------------------------------- | ---------------------------------------------- | ------------- |
| `source-sans-3-wght.woff2`       | `ofl/sourcesans3/SourceSans3[wght].ttf`        | 3.052         |
| `eb-garamond-wght.woff2`         | `ofl/ebgaramond/EBGaramond[wght].ttf`          | 1.003         |
| `source-serif-4-opsz-wght.woff2` | `ofl/sourceserif4/SourceSerif4[opsz,wght].ttf` | 4.004         |

All three come from [google/fonts](https://github.com/google/fonts) at commit
`ddf386ba1b9fbc6b2c818f1ddcd9148f54ced94b`, rewrapped losslessly as woff2 with
`fonttools ttLib.woff2 compress` to keep the repo small. The revisions are the
ones `@fontsource-variable` 5.3.x shipped, so glyphs did not change when the
site moved off Fontsource's per-subset files. Each `*.OFL.txt` is that
family's license from the same commit.

To upgrade, download the new `.ttf` at a pinned commit, compress it to the same
file name, update this table, and run `pnpm --filter @aidr/web test`.
