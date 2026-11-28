# AI;DR iPhone verification map

The maintained list of what to prove for `apps/ios`. Each feature file has the
same four sections: `Sub-features`, `How to get to it (user POV)`,
`Driving it with verify-aidr-ios`, `Gotchas`.

| Feature | File | Proof |
|---|---|---|
| Today | [today.md](today.md) | `today-vi.png`, `today-en.png` |
| Offline cache | [offline-cache.md](offline-cache.md) | `today-offline.png`, `SnapshotStoreTests` |
| IPA install with Sideloadly | [ipa-sideload.md](ipa-sideload.md) | `ipa-listing.txt`, then a manual install |

## Baseline preconditions

- `verify-aidr-ios doctor` passes.
- The UI journey needs `https://aidr.today/api/feed` to answer from the runner.
  A live outage fails Today; the failure is real, do not stub around it.
- Add a screen: add a UI test that saves an `XCTAttachment` with
  `lifetime = .keepAlways` and a stable `name`, then a feature file here.
