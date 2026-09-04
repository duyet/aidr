# @aidr/extension

Chrome Manifest V3 new-tab page for [aidr.today](https://aidr.today).
It paints today's AI;DR + top stories to match the live
[aidr.today](https://aidr.today) homepage (layout A: numbered
two-column digest, keyword highlights, category chips, trending pills,
~40–48px thumbs). No account. Not a Cloudflare Worker or Pages
app — do not add `wrangler.toml`.

Load this folder **unpacked**. `manifest.json` is the extension root.

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
- `host_permissions`: `https://aidr.today/*`
- `optional_host_permissions`: `http://localhost/*` and `http://127.0.0.1/*`
  for a local API (`http://localhost:3014`)

No identity, tabs scrape, webRequest, history, or analytics. See
[`privacy.html`](./privacy.html).
