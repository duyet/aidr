# Evidence (gitignored)

`bin/verify-aidr-ios` downloads each run here. Everything except this README and
`.gitignore` is gitignored. Cleanup never deletes it.

```text
evidence/
├── .last-run                     # run id the last drive watched (cleanup cancels it)
└── <run-id>/
    ├── run.json                  # url, head sha, conclusion
    ├── ios-screenshots/*.png     # today-vi, today-en, today-offline
    ├── AIDR-unsigned-ipa/AIDR-unsigned.ipa
    ├── ipa-listing.txt           # unzip -l of the IPA
    └── test-summary/             # summary.md, unit.json, ui.json, build logs
```

Override the location with `VERIFY_IOS_EVIDENCE`.
