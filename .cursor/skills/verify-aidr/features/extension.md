# Chrome extension guide

`/extension` is the install guide for the Manifest V3 new-tab zip. It is not a Chrome Web Store listing. Users download `aidr.zip`, unzip, then Load unpacked the `aidr` folder.

## Sub-features

- `ext-guide` renders the install page with Load unpacked steps.
- `ext-zip-link` points at `/aidr.zip`.
- `ext-chrome-url` emits `chrome://extensions` as an href.
- `ext-unzip-warning` tells the user to unzip before Load unpacked.

## How to get to it (user POV)

- Open `https://aidr.today/extension`.
- Choose `Chrome tab` in the header.
- Follow the install pointer on `/about`.

## Driving it with verify-aidr

Preconditions:

- `verify-aidr doctor` reports `ok: true`.

- **Open guide.** Run `.cursor/skills/verify-aidr/bin/verify-aidr drive extension`. HTTP 200 HTML includes `Load unpacked`, `href="chrome://extensions"`, `/aidr.zip`, `manifest.json`, and `/media/chrome-load-unpacked-zip-error.png`.
- **Unzip first.** Body contains `Unzip first` or `Giải nén trước` (SSR lang may be `vi`).
- **No store listing.** Body must not contain `chrome.google.com/webstore`.
- **Proof.** Evidence file `extension.html`. Optional screenshot of `/extension`.

## Gotchas

- SSR default is Vietnamese, so `Add to Chrome` / `Unzip first` may be absent while `Giải nén trước` is present. Accept either unzip warning.
- `chrome://extensions` cannot navigate from HTTPS; the href is still required.
- English marketing strings in the JS bundle are not proof the visible heading is English. Prefer `Load unpacked` and the zip href.
- This feature is the public install page, not loading the unpacked MV3 package in Chrome. For that, `apps/extension/scripts/verify-newtab.mjs` is a separate harness.
