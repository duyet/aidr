# Chrome Web Store listing assets

These files are **dashboard-only**. The zip packer skips this directory
and `.md` files — do not ship screenshots in the extension package.

Capture from the real unpacked new tab. Do not invent screenshots with
an image model.

## Regenerate

```bash
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  pnpm --filter @aidr/extension store-assets
# other folder or one language:
node apps/extension/scripts/store-assets.mjs --out /tmp/store --lang en
# one edition:
pnpm --filter @aidr/extension store-assets --date 2026-10-09
```

Without `--date` it uses the newest edition with at least 8 AI;DR
bullets and 8 ranked stories, checked against `/date/<date>.md`, for
up to 7 days back. If today's edition qualifies it is the live digest
(`/api/public`), the same data the new tab loads. A past edition is
rebuilt from public reads: that day's bullets come from
`/date/<date>.md` (EN + VI), joined by story id to the full items in
`/api/feed?days=3&before=<date + 1>`; categories, trending and day rows
come from that feed. The day card is `/api/og/date/<date>.png`, which
the new tab requests for the edition date.

`scripts/store-assets.mjs` fetches today's `/api/public` and
`/api/feed?days=3` from aidr.today per language, serves this extension
folder over loopback with that digest and the scene's settings seeded
into `newtab.html`, and drives headless Chrome over the DevTools
protocol. Every scene has the day feed on: with it off the page centers
the AI;DR card (`.page.is-brief`) and leaves an empty band under the
chips. A scene reloads (up to 3 tries) if a thumbnail fails to load,
and images are decoded synchronously before capture so none paint blank.
Pings to `/api/extension` are blocked so captures do not count
as installs. Output is JPEG quality 90, so no file has an alpha channel.

The data is real, so frames change with the edition. The 0.1.21
images use the 2026-10-09 edition. Look at every image before
uploading.

## Files

| File | Size | How it is made |
|---|---|---|
| `en-1-digest.jpg`, `vi-1-digest.jpg` | 1280×800 | Light theme, top of the page. Masthead date and the numbered AI;DR bullets, first day of the feed below. |
| `en-2-stories.jpg`, `vi-2-stories.jpg` | 1280×800 | Light theme, feed on, scrolled to the first day heading. Day-grouped ranked rows with votes, category and time in columns. |
| `en-3-day-card.jpg`, `vi-3-day-card.jpg` | 1280×800 | Light theme, feed on; clicks the image side of the image/text switch and waits for the day card from `aidr.today/api/og/date/<date>.png`. |
| `en-4-dark.jpg`, `vi-4-dark.jpg` | 1280×800 | Dark theme, feed on, top of the page. |
| `en-5-settings.jpg`, `vi-5-settings.jpg` | 1280×800 | Light theme, feed on; clicks the Aa button. Theme tab: light/dark, font, text size, the 5-step density slider at its medium default, background. The EN/VI toggle shows in the header. |
| `promo-440x280.jpg` | 440×280 | HTML composition: brand yellow `#f5c518`, ink `#0a0a0a`, "AI;DR" in EB Garamond, tagline in Source Sans 3 (fonts from `../fonts`), and a crop of a 2× English new-tab capture (light, feed on). |
| `marquee-1400x560.jpg` | 1400×560 | Same composition at marquee size with a larger crop and a "Free · English & Tiếng Việt · aidr.today" line. |

`en-*` go in **Global screenshots**, `vi-*` in **Localized
screenshots → Vietnamese**. Store icon is `icons/icon128.png` (already
in the package).

Check before upload:

```bash
sips -g pixelWidth -g pixelHeight -g hasAlpha apps/extension/store/*.jpg
```
