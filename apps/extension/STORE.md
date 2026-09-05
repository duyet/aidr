# Chrome Web Store listing (first submit)

Do not invent a store URL until the item is published. Unpacked zips
never auto-update; CWS installs do (Chrome checks Google's update
service). Do **not** set `update_url` in `manifest.json`.

## Single purpose (dashboard)

Replaces the Chrome new tab with the public AI;DR digest and ranked AI
stories from aidr.today.

## Permission justifications

- `storage` — save appearance/language settings and a short local cache
  of the last digest so a new tab still renders offline.
- Host `https://aidr.today/*` — fetch `GET /api/public` and
  `GET /api/feed`. No other origins.
- Optional `http://localhost/*` and `http://127.0.0.1/*` — unpacked /
  website zip only, for developers pointing the API base at a local
  Worker. Not granted unless the user confirms the Chrome prompt.
  The CWS zip omits these.

## Privacy practices

- Privacy policy URL: `https://aidr.today/privacy` (HTTPS, no login).
- Certify: no remote code. All JS is in the package.
- Data: website content (public story titles/URLs/thumbs) used only to
  paint the new tab. Not sold. Not used for ads.
- Limited Use: collection is only what the single purpose needs.

## Listing assets (dashboard, not in the zip)

See [`store/README.md`](./store/README.md). Required sizes: screenshots
1280×800 and small tile 440×280, captured from a real new tab.

- Store icon 128×128 (package already has `icons/icon128.png`)
- Category: News
- Homepage: `https://aidr.today/extension`
- Support: `https://github.com/duyet/aidr/issues`

## Package

Two zip shapes — do not mix them up:

- **Website / Load unpacked** (`https://aidr.today/aidr.zip`): files live
  under `aidr/manifest.json`. Chrome cannot Load unpacked a zip — unzip,
  then pick the `aidr` folder.
- **Chrome Web Store upload**: `manifest.json` at archive root, no
  `aidr/` prefix, no localhost optional hosts. Produce with:

```bash
pnpm --filter @aidr/web pack-cws
# writes apps/extension/dist/aidr-cws.zip
```

Do **not** upload `public/aidr.zip` / `https://aidr.today/aidr.zip` to
CWS. Do not set `update_url` in `manifest.json`.

`AIDR_EXT_STORE=1 pnpm --filter @aidr/extension build` fails if the
source tree still has localhost optional hosts (unpacked default keeps
them). The CWS packer strips loopback from the packed manifest.

## Review traps this package already avoids

- MV3, no `eval`, no remotely hosted scripts
- No `<all_urls>`, no `tabs` / `webRequest` / `history` / `identity`
- New tab override uses the documented `chrome_url_overrides` API
- CSP `connect-src` is limited to aidr.today (CWS) or aidr.today +
  loopback (unpacked)
