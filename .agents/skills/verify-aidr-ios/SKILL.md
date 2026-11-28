---
name: verify-aidr-ios
description: Build and prove the AI;DR iPhone app (apps/ios, SwiftUI) on GitHub Actions macOS runners, since this machine has no Mac or Swift toolchain. Use before claiming an iOS change works, when ios.yml fails, or to fetch the CI screenshots and the unsigned IPA for Sideloadly.
---

# Verify AI;DR for iPhone

The app lives in `apps/ios` (XcodeGen, no committed `.xcodeproj`). There is no
Mac here: the compiler, simulator and archive all run in
`.github/workflows/ios.yml` on the `macos-26` runner with Xcode 26.6. A local
`swift` or `xcodebuild` does not exist; do not look for one.

Lever: `.agents/skills/verify-aidr-ios/bin/verify-aidr-ios`. It prints progress on
stderr and evidence paths on stdout. Evidence lands in
`.agents/skills/verify-aidr-ios/evidence/<run-id>/` and survives cleanup.

Feature map: [`features/README.md`](features/README.md).

## Launch

There is nothing to keep running. A "launch" is one ios.yml run: push a commit
that touches `apps/ios/**` or `.github/workflows/ios.yml` to `feat/ios-app` (or
`master`), or dispatch it. The run is ready to read when it completes; the
three artifacts exist only after the job finishes.

## Doctor

```bash
.agents/skills/verify-aidr-ios/bin/verify-aidr-ios doctor
```

Read-only. Pass means `gh` is signed in, the workflow file exists and is
registered on GitHub, and the branch is pushed. It warns when HEAD is ahead of
origin and lists in-progress runs.

## Drive

```bash
.agents/skills/verify-aidr-ios/bin/verify-aidr-ios drive          # push HEAD, wait, download
.agents/skills/verify-aidr-ios/bin/verify-aidr-ios drive --no-push
.agents/skills/verify-aidr-ios/bin/verify-aidr-ios evidence <run-id>
```

`drive` pushes `HEAD` to `feat/ios-app` (`VERIFY_IOS_BRANCH` to change it), finds
the ios.yml run for that commit with `gh run list --commit`, dispatches one when
the path filter skipped the push, then `gh run watch` until it ends and
`gh run download` into the evidence dir. It exits non-zero when the run fails;
read the failure with `gh run view <id> --log-failed`. The workflow's
`concurrency` group cancels an older run on the same branch, so only one runs.

What the run does: `xcodegen generate`, unit tests (`AIDRKitTests`, hosted in
the app), the UI journey (`AIDRUITests/TodayJourneyTests.swift`) on the newest
iPhone simulator picked by `apps/ios/scripts/pick-simulator.py`, screenshot
export with `xcresulttool export attachments`, then an unsigned archive zipped to
`AIDR-unsigned.ipa`.

## Evidence

Per run: `ios-screenshots/today-vi.png`, `today-en.png`, `today-offline.png`;
`AIDR-unsigned-ipa/AIDR-unsigned.ipa` plus `ipa-listing.txt`; and
`test-summary/summary.md` with `unit.json`, `ui.json` and the xcodebuild logs.

Proof standards:

- Look at the screenshots with the Read tool. A green run with a blank or
  wrong screen is not proof. For Today, check the digest rows are there, the
  text is Inter (not SF), names are blue and figures amber, and the VI shot is
  in Vietnamese with no English bullets.
- The UI journey reads live `https://aidr.today`, so screenshots show that day's
  edition. The unit tests use the fixtures in `apps/ios/AIDRKitTests/Fixtures`.
- The IPA proof is the listing: `Payload/AIDR.app/AIDR` and
  `Payload/AIDR.app/Info.plist`. Installing it on a phone is a manual step
  (features/ipa-sideload.md); say so when you did not do it.
- Report the run URL, the runner label and `xcodebuild -version` from the
  "Select Xcode" step log.

## Cleanup

```bash
.agents/skills/verify-aidr-ios/bin/verify-aidr-ios cleanup
```

Cancels the run the last `drive` watched if it is still going, and forgets it.
It never deletes evidence. Never cancel runs this lever did not start.
