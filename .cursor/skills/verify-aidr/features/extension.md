# Get AI;DR

`/subscribe` is how you get AI;DR: Chrome Web Store, Telegram, or email. `/extension` 301s to `/subscribe`.

## Sub-features

- `subscribe-tabs` renders Chrome, Telegram, and Email tabs.
- `subscribe-cws` links the Chrome Web Store listing.
- `extension-redirect` sends `/extension` to `/subscribe`.

## How to get to it (user POV)

- Open `https://aidr.today/subscribe`.
- Choose Get AI;DR in the header.
- Open the old `/extension` URL (redirects).

## Driving it with verify-aidr

Preconditions:

- `verify-aidr doctor` reports `ok: true`.

- **Open guide.** Run `.cursor/skills/verify-aidr/bin/verify-aidr drive extension`. HTTP 200 HTML for `/subscribe` includes `Chrome`, `Telegram`, and `chromewebstore.google.com`.
- **Redirect.** `GET /extension` with redirects off is 301/302 to `/subscribe`.
- **Proof.** Evidence file `subscribe.html`.
- **Unpacked package.** Run `pnpm --filter @aidr/extension lint`, `pnpm --filter @aidr/extension test`, `pnpm --filter @aidr/extension build`, and `pnpm --filter @aidr/extension verify`. The last command must report `VERIFIED` and capture the desktop/phone header states.
- **Header states.** In the local new-tab preview, open and close the Get AI;DR menu with mouse and keyboard, then repeat the phone menu at a narrow viewport; expect all six web menu destinations and no clipped controls.

## Gotchas

- Do not require `Load unpacked` or `/aidr.zip` on this page; install is the Chrome Web Store.
- Footer must not list Brand; `/brand` still exists from the header.
