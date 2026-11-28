# Screenshots

Apple's page was read on 2026-11-28 (source 17). This file is a contract for the UI tests. At the time of writing, `apps/ios` on `feat/ios-app` has one UI test (`TodayJourneyTests.testLaunchScreenshot`, attachment `today-en`). The tests below do not exist yet. The Phase 1 lanes must meet this contract. Do not claim a shot is automated until its test exists.

## Sizes

Apple now names device classes, not inches. The iPhone line of the page says: at least one screenshot for **iPhone with Dynamic Island (medium display)**. That is the 6.3 inch class (iPhone 17 Pro, 16 Pro and so on).

| Class | Accepted portrait sizes (pixels) | Status |
|---|---|---|
| Dynamic Island, medium (6.3 inch) | 1206 x 2622, 1179 x 2556 | **Required** |
| Dynamic Island, large (6.9 inch) | 1320 x 2868, 1290 x 2796, 1260 x 2736 | Optional, but upload it too (see below) |

Why both: the plan said "6.9 inch". The page says the medium class is the required one. Its fallback notes for the large and Face ID classes also read inconsistently (the Face ID large row says "required if Dynamic Island large is not provided"). Uploading both sets costs one more CI run and removes the doubt. Re-read the page on the day of submit.

Other rules from the same page: 1 to 10 screenshots per size, `.png` or `.jpg`, **no alpha channel**, all content must follow the review guidelines. Localize screenshots for each language you offer (source 5).

- iPad: the target is iPhone only (`TARGETED_DEVICE_FAMILY: "1"` in `project.yml`). Then no iPad screenshots are needed. If the family ever includes iPad, a 13 inch set (2064 x 2752 or 2048 x 2732) becomes required. Guideline 2.4.1 says iPhone apps should run on iPad "whenever possible". It is an encouragement, not a rule. It is a checklist gate.
- iPhone Duo (a foldable class on Apple's page): screenshots are required only for apps built with the iOS 27.1 SDK or later, from April 2027. Not v1. Add them when the app moves to that SDK.

## Capture contract for the UI tests

| Item | Value |
|---|---|
| Test class | `AppStoreScreenshotTests` in `apps/ios/AIDRUITests` |
| Attachment name | `<lang>-<NN>-<slug>`, for example `vi-03-story`. `scripts/export-screenshots.py` already writes `<attachment name>.png`. |
| Launch arguments, English | `-AppleLanguages (en) -AppleLocale en_US -AIDR_FIXTURE appstore` |
| Launch arguments, Vietnamese | `-AppleLanguages (vi) -AppleLocale vi_VN -AIDR_FIXTURE appstore` |
| `-AIDR_FIXTURE appstore` | A new flag the app lane must add. It loads `AIDR/Resources/Fixtures/appstore.json` and bundled pictures and makes no network call. |
| Status bar | `xcrun simctl status_bar <udid> override --time 9:41 --dataNetwork wifi --wifiMode active --wifiBars 3 --cellularMode active --cellularBars 4 --batteryState charged --batteryLevel 100` before the run |
| Simulators | iPhone 17 Pro (1206 x 2622, the class `scripts/pick-simulator.py` already prefers) and iPhone 17 Pro Max (1320 x 2868). Same test, two runs. |
| Output | `screenshots/6.3/<attachment>.png` and `screenshots/6.9/<attachment>.png` |
| Gate | `python3 apps/ios/AppStore/check-screenshots.py screenshots` checks size, alpha channel, names and that English and Vietnamese match |

Simulator screenshots from `XCUIScreen` are in device pixels, so no resize is needed. They may carry an alpha channel. If `check-screenshots.py` says so, flatten them: `magick in.png -background white -alpha remove -alpha off out.png` (or `sips`).

## Fixture rule (5.2.1, 2.3.1, 2.3.7)

The live feed carries publisher photos from news sites and social posts and names of AI companies. Do not put those in the store listing. A screenshot is part of your metadata. Third-party photos, logos and brand names there are your use, not a reader's.

- Use `appstore.json`: 10 to 12 stories with headlines and summaries written for the fixture. Neutral, generic wording. No real company, product or person names. No publisher logos.
- Pictures are bundled tiles the project made itself (topic gradient plus a glyph).
- Source lines show a plain domain such as `example.org`.
- Keep the real layout, ranking, topic chips and highlights. Guideline 2.3 wants screenshots that "accurately reflect the app's core experience" and 2.3.3 wants the app in use, not title art.

## The six shots

Order matters. App Store search shows the first one to three images (source 5). Put the layout and the native features first.

| # | Slug | Screen and steps | Caption EN | Caption VI | Automated |
|---|---|---|---|---|---|
| 01 | `today` | Today tab at the top of the list: masthead, topic chips, 4 to 5 ranked rows with pictures | Today's AI news, ranked | Tin AI hôm nay, đã xếp hạng | Yes |
| 02 | `digest` | Digest tab with the 12 line digest | The whole day in 12 lines | Cả ngày gói trong 12 dòng | Yes |
| 03 | `story` | Tap row 1. Story screen with highlighted title, picture, summary, sources. **Dark mode** (`-AppleInterfaceStyle Dark`), as Apple suggests one dark shot | Short summary. Link to the source. | Tóm tắt ngắn. Có link nguồn. | Yes |
| 04 | `share` | Story > Share > Share as image sheet. Gradient background chosen, card preview with padding and rounded corners | Turn a story into an image | Biến tin thành ảnh để chia sẻ | Yes, if the sheet is reachable by accessibility ids |
| 05 | `explain` | Story > Explain simply, answer streamed in. Needs Apple Intelligence | Explained in plain words, on your iPhone | Giải thích đơn giản, ngay trên iPhone | **No. Manual** |
| 06 | `calendar` | Calendar tab with the heat map and the weeks list below | Every past edition, one tap away | Mọi bản tin cũ, chỉ một chạm | Yes |

Shot 05 cannot come from CI. The hosted macOS runner has no Apple Intelligence, so the explain buttons are hidden there on purpose. Capture 05 by hand, in both languages, on a Mac with Apple Intelligence turned on in the iOS Simulator, or on a real iPhone 15 Pro or later (inferred: Foundation Models in the Simulator uses the host Mac's model). Use the fixture story and name the file `en-05-explain.png` and `vi-05-explain.png`. A real device gives 1206 x 2622 on a 6.3 inch iPhone. If you cannot capture 6.9 inch for 05, upload five shots in the 6.9 set. Sets do not have to match across sizes.

Captions are optional. Raw screenshots are valid. If you add captions in a design tool, keep the screenshot visible and unchanged inside the frame.

Not shown on purpose: Suggest a story (see "Cross-lane items" in checklist.md), and any publisher image. The notification with a picture cannot be screenshotted by an XCUITest because it lives in SpringBoard. It is covered by review recording 1 and the description text.

## Screenshot rules to avoid a 2.3 rejection

- Show the app in use. No splash, no login (2.3.3). The app has no login.
- No other platform's name or imagery (2.3.10).
- Captions must match what the app does. Do not caption a feature the reviewer's device may not show without saying "on supported iPhones" (2.3.1).
- Keep icon and screenshots appropriate for a 4+ listing even though the rating is higher (2.3.8). Headlines in the fixture contain no violence or abuse wording.
- No device frames with Apple logos.

## Vietnamese strings

The VI captions above and the VI description use "Hôm nay", "Tóm tắt nhanh", "Giải thích đơn giản", "Vì sao đáng chú ý". The app's own tab and button labels must read the same. Check `Localizable.xcstrings` on the Phase 1 branch before upload.
