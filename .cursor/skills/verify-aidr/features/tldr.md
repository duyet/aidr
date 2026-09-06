# AI;DR

AI;DR is the daily digest on the homepage: a dated heading and short bullets that point at ranked stories. The same bullets are exposed on `GET /api/public`.

## Sub-features

- `tldr-heading` shows the `AI;DR` heading on `/`.
- `tldr-public` returns `tldr.bullets_en` and `tldr.bullets_vi` on `/api/public`.
- `tldr-empty` records `tldr: null` as a data gap, not a UI invention.

## How to get to it (user POV)

- Open `https://aidr.today/` and read the digest card under the header.
- Call `GET https://aidr.today/api/public` (extension and other clients).

## Driving it with verify-aidr

Preconditions:

- `verify-aidr doctor` reports `ok: true`.

- **Heading.** Run `.cursor/skills/verify-aidr/bin/verify-aidr drive tldr`. Homepage HTML 200 includes the `AI;DR` heading string.
- **Public bullets.** The same drive fetches `/api/public`. When `tldr` is an object, `bullets_en` and `bullets_vi` are arrays; each shown bullet has a `text` string.
- **Proof.** Evidence includes `tldr-home.html` and `tldr-public.json`. A non-null digest with zero bullets fails this feature. A JSON `tldr: null` fails with `tldrMissing: true` (live data), not a made-up layout bug.

## Gotchas

- The visible count is capped (8/12/16) in the UI; `/api/public` may return up to 16 bullets.
- Default homepage copy around the heading is `24 giờ qua` or a snapshot date, not the English `past 24 hours`.
- Do not require story `summary` — that field is intentionally omitted from the public digest.
