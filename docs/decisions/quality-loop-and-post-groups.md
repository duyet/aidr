# Quality loop, grouped posts and supporting posts

Status: proposal. Nothing here is built. Written 2026-10-20.

Owner request: design a pipeline that keeps improving post quality and
translation, keeps making the validate checks better, and supports grouped
posts and supporting posts.

## What exists today

Every item below is in the repo now.

- **Generation guidance.** `VI_STYLE` and its bad to good examples
  (`worker/llm.ts`), and the keep-English list (`worker/translation-terms.ts`).
- **Deterministic check after translation.** `translationDraftIssues` and
  `tldrBulletIssues` (`worker/translation-draft-check.ts`): keep terms,
  knowledge-rule phrases, magnitudes, versions, stutter, calques (`CALQUES`).
- **LLM QA.** The `qa-translations` step rates a stored translation and can
  send it to human review.
- **Knowledge rules.** `translation_knowledge`, filled from accepted reader
  suggestions, injected into prompts and checked deterministically.
- **Send-time gate.** `translationPostability` (`worker/notify/post-quality.ts`,
  #938) re-runs the draft check with today's rules before a Vietnamese post.
- **Event dedupe.** `loadPostedEvents` stops a channel posting an event it
  already covered inside 48 hours.
- **Post memory.** `notify_posts` (0070) keeps the caption and `message_id`
  of each story post.
- **Merge canonicals.** The cluster step points duplicate rows at one
  canonical item (`worker/dedupe.ts`).
- **Offline bench.** `model-bench` replays prod-shaped datasets.

## What went wrong this week (evidence)

1. **A fix lived in three places.** The "model family" rule exists in the prompt
   examples, in `CALQUES` and in the keep-English list. Edits are by hand,
   from a screenshot each time. Nothing proves the three agree.
2. **Two correct changes broke together.** #936 and #938 each passed CI alone.
   On master, #936's "model family" check made an unrelated gate test fail
   (fixed in #947). No test ran the combined behavior against real text.
3. **The new gate had no measured refusal rate.** The #938 reviewer flagged it:
   one over-broad rule could silence the channel. #950 added the replay
   (`apps/web/scripts/telegram-gate-replay.ts`). Over 14 days it showed the gate
   refusing 42% of EN to VI stories, 17.8% of all stories falsely. After #950
   it is 33.6% and 11.8%, still above the 5% bar. The number was measured once,
   by hand, and nothing keeps measuring it.
4. **Defects are found by people.** Every calque added this month came from the
   owner's screenshot. No path turns a refusal, a QA reject or a reader
   suggestion into a regression test by itself.

## Design A: a quality loop

One loop for every defect, wherever it is found.

```
detect  ->  label  ->  encode  ->  shadow  ->  enforce  ->  measure
```

### A1. One check registry

Model the domain once. Each check is a record, not code spread over three files.

```ts
interface QualityCheck {
  id: string;            // "calque:model-family"
  layer: "prompt" | "draft" | "qa" | "send";
  mode: "shadow" | "warn" | "block";
  source: "owner" | "reader" | "qa" | "replay";
  example: { en: string; badVi: string; goodVi: string };  // a real row
  test: (src: TranslationText, vi: TranslationText) => string | null;
}
```

The prompt's bad to good list, `CALQUES` and the keep-English terms are generated
from the registry. Drift between them becomes impossible, which is the cause of
problem 1. First step is a pure refactor with no behavior change, proven by
the existing tests passing unchanged.

### A2. A defect ledger

A table `quality_events` (item id, language, stage, check id, outcome,
text hash, time). The draft check, the send gate and QA each write one row per
verdict. Writes never fail a post (the same rule `recordStoryPost` follows).
`agent quality` prints, per check, the hits, refusals and the share of stories
refused. An alert fires when the send gate refuses over 25% of a day's
candidates, or when a channel has had no post for 20 hours (the existing alert
fires at 26). This answers problem 3 permanently, not once.

### A3. A golden set that CI replays

A committed file of real rows, built as plain strings. Two lists.

- **Defects.** Every row that ever shipped a defect, with the check that must
  catch it.
- **Passes.** Rows a Vietnamese reader approved, which must never be refused.

CI replays both against the registry, together, on every change. A new check
must catch at least one defect and refuse zero passes, so two checks cannot
break each other unseen (problem 2). The replay script from the in-flight
tuning work is the starting lever.

### A4. Shadow mode

A new check starts in `shadow`: it writes ledger rows and blocks nothing. After
7 days the owner or an agent labels the sampled hits. It moves to `block` when
the false-positive share is under 5%. This keeps a bad rule from silencing a
channel while it is still being tuned.

### A5. Intake

Defects arrive from five places. All five create the same two artifacts, a
golden-set row and a `shadow` check draft.

- Reader suggestions (exists, feeds `translation_knowledge`).
- QA rejects and gate refusals (new, from the ledger).
- Bugsink issues (the triage skill already reads them).
- The owner's screenshot (`agent quality add-defect <item> <note>`).
- The weekly replay over the last 14 days (finds drift nobody reported).

### A6. Repair before refusal

When the send gate refuses a story, call the translate repair once with the
issue list, store the fixed text, and re-check. Post only if it passes. If it
still fails, take the next candidate, as #938 does today. This turns a refusal
into a fix where the model can do it, and the ledger shows how often it can.

## Design B: grouped posts

Problem. Three outlets report one event and the channel posts one of them, or
posts two that read as repeats. The reader never sees that the event has
several sources.

Data shape. Reuse the cluster result, add no new clustering.

```ts
interface StoryGroup {
  id: string;                 // the canonical item id
  memberIds: string[];        // other rows merged under it
  kind: "same-event";         // series and topic are later
  evidence: string[];         // shared names and tokens that justified it
}
```

Rules.

- A group needs the evidence `post-quality.ts` already uses (two shared names,
  three shared tokens, the Jaccard floor). A weaker link is not a group.
- A grouped post is one message. The lead story is the canonical item. A line
  under the summary names up to three other outlets, each a link.
- The posted-event key becomes the group id, so a second outlet reporting the
  same event later cannot produce a second post.
- No group, no change. Ungrouped stories post exactly as today.

## Design C: supporting posts

Problem. Today a story gets one post. A later update, the day video, or a
correction has no place to go except a new top-level post or a silent edit.

Data shape. Use the message id `notify_posts` already stores.

```ts
interface SupportingPost {
  parentChannel: string;
  parentItemId: string;
  kind: "update" | "correction" | "video";
  replyToMessageId: string;   // from notify_posts
}
```

Behavior. A supporting post is a Telegram reply (`reply_to_message_id`) under
the parent. Three triggers.

1. **Update.** A new member joins a group that was already posted. One short
   reply names the new outlet and the new fact, at most one per group per day.
2. **Correction.** A posted Vietnamese caption is later found defective and
   `editStoryCaption` is allowed to fix it. If the edit succeeds, no reply. If
   Telegram refuses the edit (media posts are limited), send a one-line
   correction reply.
3. **Video.** The day video reply under the digest. It exists today as a
   button, so this is optional.

Limits. At most two supporting posts per parent. None for stories older than
48 hours. Both limits are constants next to `POSTED_WINDOW_MS`.

## Build order

Each step ends in a check, and the next step starts only after it passes.

| Step | Change | Check |
| --- | --- | --- |
| 0 | Replay script and baseline refusal rate (#950 landed it; false positives 11.8%) | Every refusal labeled, false positives under 5% |
| 1 | Registry, generated prompt list and `CALQUES`, no behavior change | Existing translate and gate tests pass unchanged |
| 2 | Ledger table, `agent quality`, refusal-rate alert | Replay writes rows, alert fires on a synthetic spike |
| 3 | Golden set and CI replay | A deliberately conflicting check fails CI |
| 4 | Shadow mode and promotion rule | A shadow check blocks nothing, promotes at under 5% |
| 5 | Repair before refusal | Refused fixture is repaired or falls to the next story |
| 6 | Groups computed read-only, shown on `/data` | Group count and members match the cluster table |
| 7 | Grouped post on Telegram, staging channel first | Staging post shows lead and outlets, no second post for a late member |
| 8 | Supporting replies | Staging reply threads under the parent, caps hold |

Steps 0 to 5 need no new product decision. Steps 6 to 8 change what readers see
and should wait for the owner.

## Decisions for the owner

1. Alert threshold. 25% refusals a day, and 20 hours without a post. Keep or change.
2. Shadow period. 7 days and a 5% false-positive bar. Keep or change.
3. Do groups post on both channels, or Vietnamese first.
4. May a correction reply go out without the owner reading it.

## Not in scope

Rewriting stored Vietnamese rows (about 330 weak ones remain, a separate
backfill with its own approval). Changing the translate model chain. A new
clustering model.
