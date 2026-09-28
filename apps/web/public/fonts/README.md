# OG card fonts

`eb-garamond-500.ttf` and `eb-garamond-700.ttf` are the fonts the story OG
card renders with. They are the full EB Garamond face, instanced from the
Google Fonts variable font at weights 500 and 700. They are not a Latin subset.

satori has no system fonts. A glyph missing from this file is fetched from a
fallback face and mixed into the headline. The previous 500/700 files were a
Latin cut: `Đ`, `Ơ`, `Ư`, and the tone block were absent even though EB
Garamond itself has them.

Rebuild with:

```bash
python3 -m pip install fonttools brotli
python3 apps/web/scripts/gen-og-fonts.py
```

Upstream is the SIL Open Font License 1.1.
