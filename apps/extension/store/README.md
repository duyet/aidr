# Chrome Web Store listing assets

These files are **dashboard-only**. The zip packer skips this directory
and `.md` files — do not ship screenshots in the extension package.

Capture from a real Load unpacked new tab. Do not invent screenshots
with an image model.

## Required

- Screenshots: **1280×800** (at least one, up to 5) of the new tab
- Small promo tile: **440×280**

## Optional

- Marquee: 1400×560
- Store icon: 128×128 (package already ships `icons/icon128.png`)

Captured for the 0.1.20 update, from a real unpacked new tab:

- `screenshot-light-1280x800.png`
- `screenshot-dark-1280x800.png`
- `promo-440x280.png` — the light frame scaled to 440×280

Upload them in the CWS dashboard, not inside the zip.
