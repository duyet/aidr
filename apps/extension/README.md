# @aidr/extension

Chrome Manifest V3 new-tab page for [aidr.today](https://aidr.today).
It paints today's AI;DR + day-grouped stories to match the live
[aidr.today](https://aidr.today) homepage (layout A: numbered
two-column digest, keyword highlights, category chips, trending pills,
story rows with points/comments, footer). No account. Not a Cloudflare Worker or Pages
app — do not add `wrangler.toml`.

Load this folder **unpacked**. `manifest.json` is the extension root.

Chrome does **not** auto-update unpacked zips. Once listed on the Chrome
Web Store, Chrome updates CWS installs automatically — do not set
`update_url` in the manifest. Unpacked installs compare
`GET https://aidr.today/api/extension` and show a zip banner when newer.
Store listing copy and first-submit checklist: [`STORE.md`](./STORE.md).
Privacy URL for the dashboard: `https://aidr.today/privacy`.

```bash
pnpm --filter @aidr/extension lint
pnpm --filter @aidr/extension test
pnpm --filter @aidr/extension build
pnpm --filter @aidr/extension verify
```

`build` validates the unpacked tree (it does not emit a Worker bundle).
Load unpacked from this folder, not `dist/`.

## Load unpacked

1. Use this folder from a git checkout (the directory that contains `manifest.json`)
2. Open [`chrome://extensions`](chrome://extensions)
3. Enable **Developer mode**
4. **Load unpacked** and pick that folder
5. Open a new tab

To point at a local API (`http://localhost:3014`), set **API base URL** in the
extension settings and grant the optional host permission when Chrome asks.
Production default is `https://aidr.today`.

## Shared code

The extension has no bundler and the Chrome Web Store zip only contains files
under this folder, so shared code is copied in, not imported across packages.

- **CSS tokens:** `packages/ui/tokens.css` is the source; `css/tokens.css` is a
  byte-identical copy (`pnpm --filter @aidr/ui sync-tokens`).
- **Pure logic:** `packages/libs/reader-view.js` is a plain ES module (default
  theme `light`, the AI;DR views `image` / `rows2` / `rows3`, the line-clamp
  rule `tldrRows()`, and the lucide Equal / Menu / Image glyphs as SVG data).
  The web app imports it as `@aidr/libs/reader-view`; the extension loads the
  copy at `js/shared/reader-view.js` (`pnpm --filter @aidr/libs sync-extension`).
  `js/shared/` ships in the zip because the pack step zips this whole folder.

Edit the source in `packages`, then run the sync script. `pnpm --filter
@aidr/libs test` and `@aidr/ui test` fail when a copy drifts.

## Public API

- **URL:** `GET https://aidr.today/api/public`
- **Auth:** none
- **Chrome data:** unpacked MV3 `host_permissions` also read
  `GET /api/feed?days=3` for category counts, trending pills, and item tags
  (the slim public digest does not include those). Previewing `newtab.html`
  as a web page cannot call `/api/feed` (no CORS); Load unpacked can.
- **Fallback:** `GET /api/feed` if `/api/public` fails, then last-good cache in
  `chrome.storage.local`

## Permissions

- `storage` — settings (`sync`, with `local` fallback) and feed cache
- `alarms` — the service worker (`js/background.js`) refreshes the feed
  cache every 30 minutes, only when the cache is older than 5 minutes
- `host_permissions`: `https://aidr.today/*`
- `optional_host_permissions`: `http://localhost/*` and `http://127.0.0.1/*`
  for a local API (`http://localhost:3014`)

No identity, tabs scrape, webRequest, history, or analytics SDK. Anonymous per-day event counts only. See
[`privacy.html`](./privacy.html).
