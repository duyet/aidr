# AI;DR for iPhone

Goal: a native iPhone app for AI;DR that people open every day. It reads today's edition fast, even offline. A daily notification with a thumbnail brings them back. It shares a story as a good-looking image. It runs small AI tasks on the device with Apple's Foundation Models. CI builds an unsigned IPA for Sideloadly, and a second job uploads to TestFlight once signing secrets exist.

The mobile web (aidr.today at 390px) is the design reference. The app is not a web wrapper (App Store guideline 4.2). It is native SwiftUI on the public JSON API.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| UI | SwiftUI, iOS 26 minimum, Swift 6 | Liquid Glass tab bar and sheets come free. Foundation Models needs iOS 26. |
| Project | XcodeGen `apps/ios/project.yml`, no committed `.xcodeproj` | Reviewable diffs. CI generates the project. |
| Code layout | `AIDRKit` local Swift package (models, API, cache, highlight, AI) plus a thin app target | Logic is unit-tested without the UI. |
| Dependencies | None in v1 | Fewer review and privacy-manifest questions. |
| Data | Public JSON only: `/api/public`, `/api/feed?days=N`, `/api/story/:id`, `/api/week/:week`, `/api/thumb/:id` | No backend change for v1. |
| Local first | Last good feed JSON in Application Support, and images in a 200 MB URLCache. Launch paints from disk, then refreshes. | Instant open, works offline. |
| Notifications | Local, no APNs. BGAppRefreshTask fetches the edition. A daily notification at a chosen time (default 07:00) carries the top headline and its image as an attachment. | No server, no push certificate, still has a thumbnail. |
| On-device AI | Foundation Models, gated on `SystemLanguageModel.default.availability`. "Explain simply" and "Why it matters" on a story, and a one-line notification teaser. Hidden when unavailable. | Private and free. Never a required path. |
| Share | ShareLink for the URL, plus "Share as image". ImageRenderer draws the story card on a chosen background (story image blur, gradients, solid colors) with padding, radius and shadow, Shottr style. | The growth loop. |
| Contribute | "Suggest a story" opens https://aidr.today/submit in SFSafariViewController. Mail to submit@aidr.today does not work: the email Worker ignores senders without a verified AI;DR account (`apps/email/src/intake.ts` `unknown_sender`). A native form waits for accounts in Phase 5. | No new endpoint, no account. |
| Accounts | Not in v1 (operator confirmed) | Sign-in brings guideline 4.8 (Sign in with Apple) and 5.1.1(v) (in-app account deletion). The app is complete signed out, like the web. Phase 5 adds them. |
| Languages | VI and EN, no fallback between them (same rule as the web) | Matches `worker/digest/edition.ts`. |
| Bundle id | `oneni.aidr.app` | Confirmed by the operator (same `oneni.<app>.app` pattern as `oneni.anyr.app`). Permanent once the App Store Connect record exists. |

## Phases

Each phase ends in a check on the real artifact, not only unit tests.

### Phase 0: Scaffold, design system and CI (one owner, blocking)
- [ ] `apps/ios` XcodeGen project: app target `AIDR`, local package `AIDRKit`, unit and UI test targets.
- [ ] Design system `AIDRKit/Theme`: colors from `packages/ui/tokens.css` (light and dark), Inter from `apps/extension/fonts`, spacing, the yellow AI;DR mark, topic colors (port of `apps/extension/js/topic-color.js`), title highlight (port of `highlight.js`).
- [ ] Models and API client for the endpoints above, decoded from fixtures saved from production.
- [ ] One screen, Today, showing the digest from the cache.
- [ ] `.github/workflows/ios.yml` runs XcodeGen, unit tests, a UI-test journey that saves screenshots, and an unsigned `AIDR-unsigned.ipa` artifact.
- [ ] Verification skill `.agents/skills/verify-aidr-ios` triggers CI, waits, downloads the screenshots, IPA and test summary.
- Check: CI is green on `feat/ios-app`, the screenshot shows today's digest, and the IPA downloads.

### Phase 1: The daily reader (parallel lanes, one owner per folder)
- [ ] A. Today: masthead, AI;DR digest (8/12/16), category chips, ranked list, pull to refresh, offline banner, search over cached stories.
- [ ] B. Story: headline with highlights, image, AI;DR summary, sources, Read source (SFSafariViewController), Copy AI;DR, Share, Share as image, Suggest a story.
- [ ] C. Calendar heatmap and Weeks list, then a day page and a week page.
- [ ] D. Settings (language, text size, notification time), background refresh, daily notification with thumbnail, image prefetch for the top stories.
- Check: the CI screenshot journey covers each screen in VI and EN (`-AppleLanguages` launch arguments). A hosted unit test asserts the scheduled notification request, its text and its image attachment. A UI test runs in another process and cannot read pending requests.
- Known limit of v1: a local notification carries what the last background refresh fetched, and iOS does not promise that refresh runs. Push (APNs) would remove the gap and is out of v1.

### Phase 2: On-device AI
- [ ] Explain and Why it matters on a story, streamed, in the reader's language.
- [ ] Notification teaser written on device when available.
- Check: unit tests cover the prompt builders. The UI hides the AI controls when the model is unavailable, which is the CI simulator case.

### Phase 3: App Store and TestFlight
- [ ] App icon, launch screen, `ITSAppUsesNonExemptEncryption = NO`, `PrivacyInfo.xcprivacy` with required-reason APIs (UserDefaults CA92.1, and file timestamps if the cache reads file dates).
- [ ] `apps/ios/AppStore/`: EN and VI metadata, keywords, privacy labels, review notes, age rating answers, screenshot set at 6.9 inch from the UI tests, and a first-submit checklist.
- [ ] Web prerequisites (separate web PR): a `/support` page with a contact (today `/support` is 404), and an iOS section in `/privacy` (text ready in `apps/ios/AppStore/privacy.md`).
- [ ] TestFlight job in `ios.yml`, skipped unless the secrets `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8` and `APPLE_TEAM_ID` exist.
- Check: the operator adds the secrets and the job uploads build 1. Only the operator can do this.

### Phase 4: Later
- Widgets (today's top 3), Share Extension for contributions, day videos (YouTube ids from the day archive), App Intents and Shortcuts.

### Phase 5: Accounts
- Sign in with Apple plus Clerk, votes, in-app account deletion.

## Release notes

`apps/ios/CHANGELOG.md`, one entry per build. The version lives in `project.yml`.
