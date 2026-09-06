# Evidence (gitignored)

This directory holds proof artifacts from `verify-aidr`. Everything here except this README and `.gitignore` is gitignored.

Default layout:

```text
.cursor/skills/verify-aidr/evidence/
├── README.md
├── .state.json          # last launch (base URL, runId, optional local PID)
└── <run-id>/
    ├── doctor.json
    ├── homepage.html
    ├── tldr-public.json
    ├── about.html
    ├── extension.html
    ├── api-public.json
    ├── homepage-desktop.png   # optional
    ├── homepage-mobile.png    # optional
    └── report.json
```

Override the run directory with `VERIFY_AIDR_EVIDENCE`. Cleanup stops processes this lever started and must not delete these files.
