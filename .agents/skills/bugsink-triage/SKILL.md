---
name: bugsink-triage
description: Check Bugsink (duyet.bugsink.com) for new aidr errors, triage them, file deduped GitHub issues, fix code bugs in parallel background subagents, auto-merge + deploy + validate each fix (rollback on failure), and send one herdr-desk notification per run. Use whenever the user mentions Bugsink, Sentry-style errors, production exceptions, "check bugs", "triage errors", "any new crashes", or when herdr-desk runs the `local:bugsink` job — even if they don't name Bugsink explicitly.
---

# Bugsink triage

Turns production errors in Bugsink into tracked GitHub issues and, when the fix is clear, a reviewed PR. It runs unattended from herdr-desk, so every step must be safe to repeat: re-running it an hour later must not file duplicates or spam Telegram.

All Bugsink and notify calls go through `scripts/bugsink` (run from the repo root). It reads `BUGSINK_API_TOKEN` from the env or `.env.local` and never prints it — don't echo or `cat` the token yourself either.

```bash
S=.agents/skills/bugsink-triage/scripts/bugsink
$S issues aidr                 # open issues (unresolved, unmuted) as JSON
$S event <issue-uuid>          # latest event: message, exception, tags, stacktrace
$S existing AIDR-7             # GitHub issues titled "[bugsink AIDR-7]", any state
$S file AIDR-7 "<title>" body.md
$S comment <issue-uuid> "Tracked in <gh url>"
$S resolve <issue-uuid> <merged PR url>   # only after deploy + validation pass
$S notify "<message>"
```

`DRY_RUN=1` turns every write (issue, comment, notify) into a printed line. `BUGSINK_FIXTURE=<dir>` reads canned JSON instead of the network. Use both when testing this skill.

## Run

1. **List** `$S issues aidr`. Nothing open → stop quietly: no notification, write `no new Bugsink issues` to the run's `changes.md` if herdr-desk gave you one.

2. **Dedupe** each issue with `$S existing <friendly_id>`.
   - Open GitHub issue exists → skip it, unless `count`/`last_seen` moved a lot since the issue was filed. In that case add one `gh issue comment` with the new count, and at most one per run.
   - Closed issue exists and Bugsink still shows it open → it's a regression. File a new issue that links the old one.

3. **Triage.** Read `$S event <uuid>` and put each issue into one bucket:

   | Bucket | Signal | Action |
   |---|---|---|
   | **health-alert** | `logger: aidr.health` or `tags.kind: health` | The worker already files these with label `aidr-alert` (`apps/web/worker/owner-alerts.ts`). Run `gh issue list -R duyet/aidr --label aidr-alert --state open`. Never file these here: the worker owns them, and a second filer means duplicates. Note the matching `aidr-alert` issue, or "worker hasn't filed yet", in the summary. |
   | **ops** | Provider 429/5xx, network timeouts, upstream quota, "chain exhausted" | File an issue if none exists. Never open a code PR — a code change won't fix someone else's outage. |
   | **code-bug** | Exception with a stack frame in `apps/` or `packages/`: TypeError, bad null access, parse error, wrong SQL | File the issue, then try a fix (step 5). |
   | **noise** | Bot traffic, browser extensions, one-off events older than 7 days | Don't file. List it in the summary so the owner can mute it in Bugsink. |

   Severity is `P1` (user-facing or pipeline-blocking: ingest, ranking, publish, email, Telegram), `P2` (degraded), or `P3` (cosmetic or rare).

4. **File.** Title: `[bugsink AIDR-7] <short cause, not the raw message>`. The `[bugsink ID]` prefix is the dedupe key; don't change it. Body:

   ```markdown
   **Bugsink:** <url> · **Seen:** <count>× · first <first_seen> · last <last_seen>
   **Bucket:** code-bug · **Severity:** P1

   ## What happens
   <1–3 sentences in plain words>

   ## Evidence
   <exception type/value + top in-app frames, trimmed>

   ## Likely cause
   <file:line and reasoning, or "unknown">
   ```

   **The repo is public.** Only put in the type, message, and in-app frames. Leave out request bodies, headers, cookies, user IDs, emails, IPs, and tokens. When unsure, leave it out.

   Then run `$S comment <uuid> "Tracked in <issue url>"` so Bugsink links back. Don't resolve here and never mute: an issue is resolved only in step 6, after its fix is live and validated. Muting stays the owner's call.

5. **Fix in parallel.** Fixes run in background subagents, one per code-bug issue, all started at once. Up to **5 per run**; any extra issues wait for the next run. Ops, health-alert, and noise issues never get a fix.
   - **How to spawn.** In Claude Code, use the Agent tool with `run_in_background: true` and `isolation: "worktree"`, with `model: "sonnet"` unless the bug needs deep reasoning. Other agents use their own background/parallel mechanism. With none available, fix the issues one after another.
   - **What each child does.** Give each child the issue number, the Bugsink event, and the brief below, and tell it to follow the brief exactly:
     > Fix GitHub issue #<n> (Bugsink <ID>) in duyet/aidr.
     > - Read `apps/web/ALGORITHM.md` first if the fix touches ingest, ranking, prompts, or notify.
     > - Branch `fix/bugsink-<id-lowercase>` from `origin/master`.
     > - Make the smallest change that removes the cause, and add a test that fails without it.
     > - Run the "change" level of `.agents/skills/aidr-validate/SKILL.md`: lint, the test, check-types. Don't run `build`, because parallel builds run out of memory.
     > - If validation passes, push and open a PR with `Fixes #<n>` and the evidence table.
     > - If the cause is unclear, needs a product decision, or validation fails: comment your findings on #<n> and open no PR.
     > - Never merge or deploy. Report the PR URL or "no PR" with the reason.
   - **You handle merge and deploy yourself.** Only the orchestrator merges and deploys, never the children. You can't hand off everything, because deploys must stay serialized.

6. **Ship one PR at a time.** When the children are done, take each PR one by one, P1 first. Merging to `master` deploys production through `deploy-web.yml`, so each merge is a release. Doing them one at a time means a bad deploy points at exactly one PR.
   1. Wait for CI: `gh pr checks <pr> --watch`. If a check fails, leave the PR open, comment the failure, and move to the next PR.
   2. Rebase if needed, then `gh pr merge <pr> --squash --delete-branch`.
   3. Wait for the deploy: `gh run list -w deploy-web.yml -b master -L 1`, then `gh run watch <id> --exit-status`.
   4. Validate the live site with `aidr-validate` "deploy" + "smoke":
      - `curl -s https://aidr.today/api/health` must report `status: ok`.
      - `verify-aidr doctor` must report `ok: true`.
      - Run `verify-aidr drive <feature>` for the surface the fix touched.
      - If the fix touched the pipeline, check `verify-aidr pipeline` after the next hourly run, or on the next triage run if this one ends first.
   5. **If the deploy or validation fails, roll back at once:**
      - Revert the merge with `git revert` on a branch, open a PR, and merge it; this redeploys.
      - Validate again.
      - Reopen the issue with the failing evidence.
      - Stop shipping the rest of the PRs this run. Leave them open for the owner.
   6. **Resolve once validated.** When validation passes, mark the Bugsink issue done: `$S resolve <uuid> <merged PR url>` (it comments the PR, then resolves), and close the GitHub issue if `Fixes #<n>` didn't. If the error comes back, Bugsink reopens it as a regression and the next run handles it (step 2).
   - Never auto-merge release-please PRs (`chore(main): release …`). Only ship `fix/bugsink-*` PRs opened by this run.

7. **Notify once**, and only if something changed this run (new issue, regression, PR opened, deployed, or rolled back). One message:

   ```
   🐞 Bugsink aidr: 2 new, 1 regression
   • AIDR-7 P1 code-bug → #281, PR #282 merged + deployed ✅ validated
   • AIDR-8 P2 ops → #283
   • AIDR-9 P2 code-bug → PR #285 rolled back ❌ (/api/health degraded)
   • AIDR-1 health-alert → already #270
   ```

   `$S notify "<message>"`. If notify fails, record that in `changes.md` and carry on; a failed notification must not fail the run.

## Report

End with the same summary: per issue, the bucket, what you did, and links. Also list what you skipped and why. For each shipped PR, include the deploy run and the aidr-validate evidence table. Say plainly when a step failed or was skipped; don't hide it.
