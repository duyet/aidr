# JEV panel: core, adapter, and scoring integration

Deterministic review-panel core from [#167](https://github.com/duyet/aidr/pull/167),
plus the transport adapter and scoring-call-site integration added in
[#203](https://github.com/duyet/aidr/issues/203).

- `core.ts` — worker-neutral aggregation, quorum, diversity, bounded debate,
  idempotency keys, audit records. No `Env`, `fetch`, D1, or LLM dependency.
- `config.ts` — `Env` to `JevPanelConfig`, including the diversity refusal.
- `executor.ts` — one configured slot to one `JevExecutionResult`.
- `score-review.ts` — the decision mapping, fail policy, and run/decision-keyed
  memo. Called from `scoreItems` in `llm.ts`.

## Configuration

The panel is **off unless `JEV_PANEL_ENABLED` is set to a truthy value**
(`1`, `true`, `yes`, `on`). With the switch unset, `scoreItems` issues exactly
the calls it issued before this directory existed and returns the same rows,
with no `jevReview` field on the result.

| Variable | Default | Meaning |
| --- | --- | --- |
| `JEV_PANEL_ENABLED` | unset (off) | Master switch. |
| `JEV_PANEL_RELEVANCE_MODEL` | unset | Comma-separated chain for the `relevance` judge. |
| `JEV_PANEL_SOURCE_QUALITY_MODEL` | unset | Comma-separated chain for the `source_quality` judge. |
| `JEV_PANEL_QUORUM` | `2` | Non-abstain valid votes needed. Clamped to the judge's count. |
| `JEV_PANEL_DEBATE` | `0` | `1` enables the single replacement cross-examination round. |
| `JEV_PANEL_FAIL_MODE` | `open` | `closed` forces relevance to 0 when the panel cannot decide. |
| `JEV_PANEL_BUDGET_MS` | `40000` | Wall-clock budget for one item's whole panel. |
| `JEV_PANEL_APPLY_CATEGORY` | `0` | `1` lets an unambiguous panel category replace the primary one. |

Set the two model variables to models from **different vendor families**:

```
JEV_PANEL_ENABLED=1
JEV_PANEL_RELEVANCE_MODEL=openai/gpt-5.2
JEV_PANEL_SOURCE_QUALITY_MODEL=anthropic/claude-opus-4-5
```

## Rules the integration holds to

**Model diversity is never fabricated.** A config whose two roles name the same
model id, or two models from the same vendor family, is refused at
config-resolution time with a reason, before any judge runs. A router alias
such as `anyrouter/auto` is not a model and is refused as a judge. The adapter
reports the model the gateway actually served, so a chain that falls through to
a different model produces an identity mismatch and that vote is dropped rather
than counted as a second opinion. One configured slot is one vote no matter how
many transport attempts it took.

**The panel can only lower a score.** The effect is a relevance *ceiling*:
`min(primaryRelevance, panelMeanScore)`. There is no configuration under which
the panel raises a score or promotes an item.

| Panel `recommendation` | Applied relevance |
| --- | --- |
| `support` | `min(primary, panel mean score)` |
| `oppose` | `0` — a panel that voted against publication cannot be an enabler |
| `human_review` (no quorum, tie, unresolved debate) | `primary`, or `0` when `JEV_PANEL_FAIL_MODE=closed` |

**Bounded.** At most `JEV_PANEL_MAX_JUDGES` slots, at most one replacement
cross-examination round (the core's hard cap), one prompt byte cap
(`JEV_PANEL_MAX_PROMPT_BYTES`, refused rather than truncated), one answer
length cap, one per-invocation timeout, and one wall-clock budget per item.
Truncating a prompt could silently change an answer, so an over-cap prompt is
an invalid vote instead.

**Idempotent per run and decision.** Panel results are memoized on
`runId + items.id + content tag`, so a replayed workflow step reuses the stored
decision instead of spending judge calls again. The relevance ceiling is
monotonic, so applying it twice cannot lower the item twice, and the `items`
upsert is keyed on `id` in any case. Cross-isolate idempotency would need a new
table; it is deliberately not added here, and is called out as a known
limitation rather than silently assumed.

**Never loses a primary result.** Disabled, unresolvable config, transport
error, timeout, malformed judgment, no quorum, a throw in the adapter — every
path returns the primary row with a reason in `ScoreResult.jevReview`. A
config that cannot be resolved is a *misconfiguration*, not a verdict, so it
always degrades open even under `JEV_PANEL_FAIL_MODE=closed`: a typo must never
reject a whole ingest run.

**No schema drift.** The panel writes nothing new. It rides on the existing
`llm_relevance` and `category` columns, and the existing relevance gate in
`workflow.ts` still owns the publish/reject decision. No migration is added.

## Mapping onto the persisted decision

`scoreItems` returns a `ScoreResult` whose `relevance` and `category` may have
been adjusted, plus a non-persisted `jevReview` reason. The workflow's existing
code is unchanged: `publishedRows` and the `status` column still read
`score.relevance` against `RELEVANCE_THRESHOLD`, so a demoted item simply falls
through the gate that was already there.

`ScoreResult.jevReview` carries the outcome kind, a log-safe reason, the
recommendation, whether quorum was reached, the core's idempotency key, and the
before/after relevance. It is not written to D1 — the reason is visible in
`console.log` and in the `llm_calls` rows the adapter's own transport attempts
produce.

## Category adoption is opt-in

Relevance is a monotonic ceiling, so a replay is safe. A category is not: the
same panel can resolve a different mode across runs, so adopting one would churn
`items.category` on every replay. `JEV_PANEL_APPLY_CATEGORY` is therefore off by
default and only takes effect when the mode was unambiguous and the value is
already in `CATEGORIES`.

## Deliberately not done

- **Translation QA.** `translation-qa.ts` already has an independent reviewer
  chain with its own model-disjointness rules. The panel is not layered on top
  of it; doing so would duplicate an existing control.
- **Human review queue.** `result.requiresHumanReview` is surfaced on the
  outcome but nothing persists it. A durable queue needs a new table, which is
  out of scope here.
- **Audit persistence.** `JevPanelResult.audit` is produced by the core and
  carried in memory; it is not written to D1. Persisting it needs a new table.
- **A quality claim.** Nothing here claims the panel improves score accuracy.
  The slice is about wiring a bounded, auditable second opinion behind a switch.
