# About

`/about` explains the product in English: what AI News is, the ingest pipeline, and the Chrome new-tab install pointer. The header language toggle is disabled on this route.

## Sub-features

- `about-hero` renders the About heading and product sentence.
- `about-pipeline` shows the How it works steps (Sources through AI;DR + Email).
- `about-extension` points at `/extension` and `aidr.zip`.

## How to get to it (user POV)

- Open `https://aidr.today/about`.
- Choose `About` in the header (desktop) or the phone menu.

## Driving it with verify-aidr

Preconditions:

- `verify-aidr doctor` reports `ok: true`.

- **Open about.** Run `.cursor/skills/verify-aidr/bin/verify-aidr drive about`. HTTP 200 HTML includes `About AI News`, `How it works`, `Sources`, `AI;DR + Email`, and `Chrome new tab`.
- **Install pointer.** The same body includes `Load unpacked`, `/extension`, and `aidr.zip`.
- **Proof.** Evidence file `about.html` contains those strings. Optional: `verify-aidr screenshot --path /about`.

## Gotchas

- This page is English-only. Vietnamese strings from the homepage are the wrong assertions here.
- Model names under Transparency are fetched client-side; do not require a specific LLM id in SSR HTML.
- Pipeline step labels are the English `STEPS` copy (`Sources`, `Fetch`, `Score`, `Merge`, `Translate`, `Rank`, `AI;DR + Email`).
