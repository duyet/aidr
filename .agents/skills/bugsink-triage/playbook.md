# Bugsink triage (herdr-desk job `local:bugsink`)

You run unattended. Read `.agents/skills/bugsink-triage/SKILL.md` and follow its **Run** section exactly: list → dedupe → triage → file → parallel fix subagents (≤5) → merge + deploy + validate one PR at a time, rollback on failure → one notify.

Write a short `changes.md` in the run folder with the summary from the skill's **Report** section. If there were no open Bugsink issues, write `no new Bugsink issues` and send no notification.
