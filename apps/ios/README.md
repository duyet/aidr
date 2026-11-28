# AI;DR for iPhone

Native SwiftUI app for [aidr.today](https://aidr.today). It reads the public JSON
API (`/api/feed`, `/api/public`, `/api/story/:id`, `/api/week/:week`), paints
the last good edition from disk at launch, then refreshes. The plan lives in
[`plans/ios-app.md`](../../plans/ios-app.md).

| | |
|---|---|
| Bundle id | `oneni.aidr.app` |
| Minimum iOS | 26.0 |
| Swift | 6, strict concurrency |
| Version | `MARKETING_VERSION` and `CURRENT_PROJECT_VERSION` in `project.yml` |
| Release notes | [`CHANGELOG.md`](CHANGELOG.md) |

## Layout

| Path | What it is |
|---|---|
| `project.yml` | XcodeGen spec. No `.xcodeproj` is committed. Each target globs its folder, so new files need no spec change. |
| `AIDR/` | The app target: `App/RootView.swift` (tab root), `Today/`, `Resources/Fonts` (Inter 4.1 TTFs, OFL). |
| `AIDRKit/` | Local Swift package: models, `APIClient`, `SnapshotStore`, `Highlight`, `Topic` colors, `Theme`. |
| `AIDRKitTests/` | Unit tests, hosted in the app so the Inter font check sees the real bundle. `Fixtures/` holds production JSON. |
| `AIDRUITests/` | The screenshot journey: Today in VI and EN, and an offline relaunch. |
| `scripts/` | CI helpers and `make-golden.ts`. |

## Build on CI (no Mac needed)

`.github/workflows/ios.yml` runs on pushes to `master` and `feat/ios-*` branches that touch
`apps/ios/**`, and on demand:

```bash
gh workflow run ios.yml --ref feat/ios-app
```

The job runs on `macos-26` with Xcode 26.6 (iOS 26.5 SDK). It generates the
project, runs the unit tests and the UI journey on the newest iPhone simulator,
then archives without signing. Artifacts:

- `ios-screenshots`: `today-vi.png`, `today-en.png`, `today-offline.png`
- `AIDR-unsigned-ipa`: `AIDR-unsigned.ipa` (`Payload/AIDR.app`)
- `test-summary`: `summary.md`, the xcresult summaries as JSON, and the build logs

`.agents/skills/verify-aidr-ios/bin/verify-aidr-ios drive` pushes the branch,
waits for the run and downloads all three.

## TestFlight

The `testflight` job in `ios.yml` runs after `build` on every master push
that touches `apps/ios/**`, and on `gh workflow run ios.yml --ref master`. It
skips itself until the four secrets below exist. It archives a Release build,
signs it with automatic signing through the App Store Connect API key, uploads
it, and uses the workflow run number as the build number.

One-time setup:

1. **Join the Apple Developer Program** ($99 a year) at
   [developer.apple.com/programs/enroll](https://developer.apple.com/programs/enroll),
   as an individual, with an Apple ID that has two-factor authentication. Apple
   may ask for ID checks in the Apple Developer app. Approval can take up to 48
   hours.
2. **Register the bundle id.** In
   [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list),
   add an App ID, explicit, `oneni.aidr.app`. No extra capabilities.
3. **Create the app record.** In [App Store Connect](https://appstoreconnect.apple.com),
   Apps, then + and New App: platform iOS, name, primary language, bundle id
   `oneni.aidr.app`, SKU `aidr-ios`. The bundle id cannot change after this.
4. **Make an API key.** App Store Connect, Users and Access, Integrations, App
   Store Connect API, Team Keys, then +. Access **Admin**: cloud signing creates
   the distribution certificate and profile, which needs Admin. Download the
   `.p8` file (only once) and note the Key ID and the Issuer ID on that page.
5. **Find the Team ID** under Membership details at
   [developer.apple.com/account](https://developer.apple.com/account).
6. **Add the secrets.** Either fill the four `ASC_*` / `APPLE_TEAM_ID` lines in
   the root `.env.local` (see `.env.example`) and run `pnpm sync-env --github`,
   or set them by hand:

   ```bash
   gh secret set ASC_KEY_ID --body <key id>
   gh secret set ASC_ISSUER_ID --body <issuer id>
   gh secret set APPLE_TEAM_ID --body <team id>
   gh secret set ASC_KEY_P8 < AuthKey_<key id>.p8
   ```

7. **Upload a build:** `gh workflow run ios.yml --ref master`. Apple processes
   it for 5 to 30 minutes. `ITSAppUsesNonExemptEncryption = NO` answers export
   compliance.
8. **Install on the iPhone.** App Store Connect, the app, TestFlight, Internal
   Testing: create a group and add yourself. Install the TestFlight app on the
   iPhone, sign in with the same Apple ID and accept the invite. Later builds
   appear there by themselves. Internal testers (up to 100 team members) need no
   review; an external group needs Beta App Review first.

The App Store listing, privacy answers and review notes are in
[`AppStore/`](AppStore/), with the submission checklist in
[`AppStore/checklist.md`](AppStore/checklist.md).

## Install the IPA with Sideloadly

The IPA is unsigned. Sideloadly signs it with your Apple ID on the way to the
phone. A free Apple ID gives a 7-day profile; reinstall after that.

1. Download `AIDR-unsigned-ipa` from the run page (or with the helper above) and unzip it to get `AIDR-unsigned.ipa`.
2. Install Sideloadly from [sideloadly.io](https://sideloadly.io) on macOS or Windows (Windows also needs iTunes and iCloud from Apple's site, not the Microsoft Store).
3. Connect the iPhone by cable, unlock it and tap Trust.
4. On iOS 16 or later turn on Settings, Privacy & Security, Developer Mode, then restart the phone and confirm.
5. Open Sideloadly, drag `AIDR-unsigned.ipa` into it, pick the iPhone, and enter your Apple ID.
6. Under Advanced options leave the bundle id as is, or let Sideloadly change it if `oneni.aidr.app` is taken on your account.
7. Press Start. Enter the Apple ID password or app-specific password when asked.
8. On the phone open Settings, General, VPN & Device Management, tap your Apple ID and Trust.
9. Open AI;DR. Today paints the edition; pull down to refresh.

## Build locally on a Mac

Needs Xcode 26 or later and XcodeGen.

```bash
brew install xcodegen
cd apps/ios
xcodegen generate
open AIDR.xcodeproj
```

Run the tests from the command line:

```bash
xcodebuild test -project AIDR.xcodeproj -scheme AIDR \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

To run on a device, set your team under Signing & Capabilities. Do not commit
the generated project.

## Rules

- VI and EN never fall back to each other. A VI reader with no Vietnamese
  AI;DR sees an empty state, not the English bullets (`Digest.bullets`).
- Topic colors and highlights are ports of `apps/web/src/lib/topic-color.ts`,
  `highlight.ts` and `keyword-highlight.ts`. After changing those, rerun
  `npx tsx apps/ios/scripts/make-golden.ts` and let `GoldenTests` show where
  the Swift side drifts.
- Fixtures are production responses. Refresh them by saving `/api/feed?days=3`,
  `/api/public`, `/api/story/:id` and `/api/week/:week` into
  `AIDRKitTests/Fixtures/`, then regenerate `golden.json`. Update the dates and
  counts `ModelTests` pins.
