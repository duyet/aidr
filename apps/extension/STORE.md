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
- Optional `http://localhost/*` and `http://127.0.0.1/*` — developers
  pointing the API base at a local Worker. Not granted unless the user
  confirms the Chrome prompt.

## Privacy practices

- Privacy policy URL: `https://aidr.today/privacy` (HTTPS, no login).
- Certify: no remote code. All JS is in the package.
- Data: website content (public story titles/URLs/thumbs) used only to
  paint the new tab. Not sold. Not used for ads.
- Limited Use: collection is only what the single purpose needs.

## Listing assets (dashboard, not in the zip)

- Store icon 128×128 (package already has `icons/icon128.png`)
- Screenshots: at least one 1280×800 of the new tab (up to 5)
- Small promo tile 440×280
- Optional marquee 1400×560
- Category: News
- Homepage: `https://aidr.today/extension`
- Support: `https://github.com/duyet/aidr/issues`

## Package

Zip root must be `aidr/manifest.json` (already how `aidr.zip` is packed)
for Load unpacked. CWS upload wants `manifest.json` at the zip root —
upload a CWS zip of the unpacked folder contents, not `aidr.zip`.

```bash
cd apps/extension
# zip the folder contents (manifest.json at root), excluding tests/docs
```

## Review traps this package already avoids

- MV3, no `eval`, no remotely hosted scripts
- No `<all_urls>`, no `tabs` / `webRequest` / `history` / `identity`
- New tab override uses the documented `chrome_url_overrides` API
- CSP `connect-src` is limited to aidr.today + loopback
