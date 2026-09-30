---
name: bugsink-triage
description: Check Bugsink (duyet.bugsink.com) for new aidr errors, triage them, file deduped GitHub issues, open fix PRs for code bugs, and send one herdr-desk notification per run. Use whenever the user mentions Bugsink, Sentry-style errors, production exceptions, "check bugs", "triage errors", "any new crashes", or when herdr-desk runs the `local:bugsink` job — even if they don't name Bugsink explicitly.
---

# Bugsink triage

Turns production errors in Bugsink into tracked GitHub issues and, when the fix is clear, a reviewed PR. It runs unattended from herdr-desk, so every step must be safe to repeat: re-running it an hour later must not file duplicates or spam Telegram.

All Bugsink and notify calls go through `scripts/bugsink` (run from the repo root). It reads `BUGSINK_API_TOKEN` from the env or `.env.local` and never prints it — don't echo or `cat` the token yourself either.

```bash
S=.cursor/skills/bugsink-triage/scripts/bugsink
$S issues aidr                 # open issues (unresolved, unmuted) as JSON
$S event <issue-uuid>          # latest event: message, exception, tags, stacktrace
$S existing AIDR-7             # GitHub issues titled "[bugsink AIDR-7]", any state
$S file AIDR-7 "<title>" body.md
$S comment <issue-uuid> "Tracked in <gh url>"
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

   Then run `$S comment <uuid> "Tracked in <issue url>"` so Bugsink links back. Never resolve or mute issues in Bugsink: that is the owner's call.

5. **Fix** code bugs only, and at most **2 fix PRs per run** so a flood of errors can't turn into a flood of PRs.
   - Read `apps/web/ALGORITHM.md` first if the fix touches ingest, ranking, prompts, or notify.
   - Branch `fix/bugsink-<friendly-id-lowercase>` from `master`. Make the smallest change that removes the cause, and add a test that fails without it.
   - Validate with the `aidr-validate` skill (`.cursor/skills/aidr-validate/SKILL.md`, "change" level). If it fails, leave the issue open with your findings and don't open a PR.
   - Open the PR with `Fixes #<n>`. Don't merge, deploy, or push to `master`: the owner reviews every automated fix.
   - Skip the fix when the cause is unclear or the change needs a product decision. A good issue is still a useful result.

6. **Notify once**, and only if something changed this run (new issue, regression, PR opened). One message:

   ```
   🐞 Bugsink aidr: 2 new, 1 regression
   • AIDR-7 P1 code-bug → #281, PR #282
   • AIDR-8 P2 ops → #283
   • AIDR-1 health-alert → already #270
   ```

   `$S notify "<message>"`. If notify fails, record that in `changes.md` and carry on; a failed notification must not fail the run.

## Report

End with the same summary: per issue, the bucket, what you did, and links. Also list what you skipped and why. Say plainly when a step failed or was skipped; don't hide it.
