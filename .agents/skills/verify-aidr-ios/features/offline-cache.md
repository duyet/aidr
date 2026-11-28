# Offline cache

The app saves the last feed that decoded to
`Application Support/AIDR/feed.json` and paints it at launch before the network
answers. With no network it keeps that edition and shows "Offline" in the
masthead.

## Sub-features

- `cache-write`: a successful refresh saves the server's bytes atomically.
- `cache-paint`: launch paints from the file within a few seconds, network or not.
- `cache-offline-note`: a failed refresh shows `offline-note` and keeps the rows.

## How to get to it (user POV)

- Open the app once online, close it, turn on Airplane Mode, open it again.

## Driving it with verify-aidr-ios

Preconditions:

- `verify-aidr-ios doctor` passes.

- **Run.** `verify-aidr-ios drive`. `testOfflineRelaunchPaintsFromCache` launches online (writes the cache), terminates, relaunches with `AIDR_API_BASE=http://127.0.0.1:9` (nothing listens there), and requires `digest-row-1` within 5 seconds and `offline-note`.
- **Look.** Read `ios-screenshots/today-offline.png`: the digest is on screen and the masthead says Offline.
- **Logic.** `SnapshotStoreTests` in `test-summary/unit.json`: round trip, corrupt file reads as empty, location is Application Support.

## Gotchas

- `AIDR_API_BASE` only swaps the origin `APIClient` talks to; the cache and the UI are the shipping code.
- Images come from `URLCache` (200 MB disk). The offline shot can show gray thumbnails for images the first launch never finished loading.
