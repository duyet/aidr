# Today

The first tab. It shows the current AI;DR edition: the masthead, category chips
with colored dots and counts, the day block ("28 • AI;DR / THỨ BẢY · THÁNG 11
2026"), and the 8 numbered digest rows with a topic label, highlighted names
(blue) and figures (amber), and a thumbnail.

## Sub-features

- `today-digest`: 8 rows, `digest-row-1` to `digest-row-8`, from `tldr.bullets_en` or `bullets_vi`.
- `today-lang`: VI when the system language is Vietnamese, else EN. No fallback between them.
- `today-highlight`: names and figures colored like the web (`GoldenTests`).
- `today-font`: Inter loads from the app bundle (`FontTests`).
- `today-refresh`: pull to refresh reloads `/api/feed?days=3`.

## How to get to it (user POV)

- Open the app. Today is the selected tab.
- Pull down on the list to refresh.

## Driving it with verify-aidr-ios

Preconditions:

- `verify-aidr-ios doctor` passes.

- **Run.** `.agents/skills/verify-aidr-ios/bin/verify-aidr-ios drive`. `testTodayVietnamese` and `testTodayEnglish` launch with `-AppleLanguages (vi)` and `(en)` and wait for `digest-row-1` and `day-block`.
- **Look.** Read `ios-screenshots/today-vi.png` and `today-en.png`. The VI shot has the "Hôm nay" tab and Vietnamese bullets; the EN shot English. Rows show numbers 01 onward, a topic label, colored keywords, and thumbnails.
- **Logic.** `test-summary/unit.json` shows `DigestTests`, `GoldenTests`, `FontTests` passed.

## Gotchas

- The screenshot shows the live edition of the day the run happens, not the fixture day.
- Thumbnails load over the network; the journey waits about 4 seconds. A gray square is a slow image, not a layout bug, unless every row is gray.
- Pull to refresh is not driven by the journey yet. Prove it by hand or add a UI test that swipes down on `today-digest`.
