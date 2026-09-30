---
name: aidr-validate
description: Prove an aidr change or task actually works before calling it done — code checks, deploy verification, live smoke test, and hourly pipeline health (ingest → rank → publish → email/Telegram). Use after any fix, feature, PR, or deploy in this repo; when a herdr-desk child finishes a task; when the user asks "is it working", "verify", "smoke test", "check the pipeline", "did the deploy land", or before writing "done"/"fixed" in a PR or report.
---

# aidr-validate

"Tests pass" is not the same as "it works". This skill chooses the right proof level for what changed, runs it, and reports evidence. It wraps the repo's existing tools instead of repeating them:

- `.cursor/skills/verify-aidr/bin/verify-aidr`: live HTTP, feature drives, prod D1 pipeline check (read-only)
- `.cursor/skills/aidr-ops/bin/aidr-ops`: secret/config preflight and deploy
- `GET https://aidr.today/api/health`: the Worker's own pipeline health

## Pick the level

Run every level up to the highest one that applies:

| Level | When | Proof |
|---|---|---|
| **change** | Any code edit (always) | Narrowest first: `pnpm exec biome lint <changed paths>` → `pnpm --filter @aidr/web test` (or `vitest run <file>`) → `pnpm --filter @aidr/web check-types`. Plus the new test must fail without the fix; check that by stashing the fix once. |
| **build** | Touched build config, routes, the extension, or anything bundled | `pnpm --filter @aidr/web build`. Don't run it in parallel sub-agents, because concurrent builds OOM. |
| **deploy** | After a deploy | `aidr-ops preflight` passed before the deploy. Then `curl -s https://aidr.today/api/health` gives `status: ok`, and `verify-aidr doctor` gives `ok: true`. |
| **smoke** | Any user-visible surface changed, or after a deploy | `verify-aidr drive <feature>` for the feature you changed (homepage, tldr, about, extension, api-public, analytics, telegram), not a convenient substitute. `drive all` after a risky deploy. |
| **pipeline** | Touched ingest, ranking, prompts, LLM routing, notify, or the workflow; or you're checking prod health | `verify-aidr pipeline`: last run under 2h old with no error, Telegram posted within 8h, no failed notifications or chain-exhausted runs in 24h. Pipeline changes only show up on the **next hourly run**, so after deploying, re-check once a run has finished after the deploy time. |

Some levels are read-only and some write. The **change** and **build** levels, `doctor`, `pipeline`, `drive`, and `/api/health` are read-only. Only deploy with `aidr-ops deploy`, and only when the task asked for a deploy. Unattended fix jobs stop at an open PR.

## Report

End with a short evidence table. Don't write prose claims:

```
| Check                 | Result | Evidence                          |
|-----------------------|--------|-----------------------------------|
| biome lint (2 files)  | ✅     | 0 issues                          |
| vitest edition.test   | ✅     | 14 passed; fails without fix ✅   |
| check-types           | ✅     |                                   |
| /api/health           | ✅     | status ok, latest run 12m, !failed|
| verify-aidr pipeline  | ⚠️     | no Telegram post 9h (pre-existing)|
```

Rules that keep the table honest:
- A skipped check is `⏭ skipped: <reason>`, never omitted. Say "tests pass" only if none were skipped.
- Report a failure that predates your change as ⚠️ pre-existing, with the evidence. Don't fix it silently, and don't let it hide your own result.
- If a level fails, the task isn't done. Say so, and include the failing output.
