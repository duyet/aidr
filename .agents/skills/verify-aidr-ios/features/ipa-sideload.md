# IPA install with Sideloadly

CI builds an unsigned `AIDR-unsigned.ipa`. A tester signs and installs it with
Sideloadly and their own Apple ID. Steps for people are in
`apps/ios/README.md`.

## Sub-features

- `ipa-build`: the archive step zips `Payload/AIDR.app` into `AIDR-unsigned.ipa`.
- `ipa-shape`: the IPA holds the `AIDR` binary and `Info.plist`.
- `ipa-install`: Sideloadly installs it on a phone and the app opens to Today.

## How to get to it (user POV)

- Open the ios.yml run page on GitHub, download `AIDR-unsigned-ipa`, drag the IPA into Sideloadly.

## Driving it with verify-aidr-ios

Preconditions:

- A completed ios.yml run.

- **Download.** `verify-aidr-ios drive` or `verify-aidr-ios evidence <run-id>`. It fails when the IPA lacks `Payload/AIDR.app/AIDR` or `Info.plist`.
- **Inspect.** `ipa-listing.txt` in the evidence dir.
- **Install.** Manual: a person runs Sideloadly with a phone attached. Report it as not verified unless someone did.

## Gotchas

- A free Apple ID profile lasts 7 days.
- Sideloadly may rewrite the bundle id `oneni.aidr.app` if it is taken on the tester's account; background refresh ids follow the bundle id only in later phases.
