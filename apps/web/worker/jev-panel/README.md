# JEV panel core

This directory is a worker-neutral, deterministic core for the first slice of
[#144](https://github.com/duyet/aidr/issues/144). It has no `Env`, `fetch`,
database, prompt, or LLM transport dependency.

## Boundary

- A panel is a set of typed judge slots. Each slot has a caller-supplied model
  identity, role, and prompt/template key.
- One configured slot produces one vote. A transport adapter may make several
  attempts or walk a fallback chain, but `transportAttempts` is audit metadata
  only; it is never counted as another vote.
- Successful executions must report the actual model identity. The core never
  infers or fabricates a model identity. A reported identity that differs from
  the configured slot is invalid and requires human review.
- Claims, evidence, scores in `[0, 1]`, categories, and explicit
  `support`/`oppose`/`abstain` votes are validated at the core boundary.
  Submitted and fetched text is passed as `untrustedContent`; adapters remain
  responsible for fencing it as data, never instructions.
- Aggregation is order-independent. Invalid, timeout, and error records remain
  in the audit trail but do not count as directional votes. Quorum counts
  valid non-abstain votes. A tie, category tie, missing quorum, or invalid
  diversity gate returns an advisory `human_review` result with
  `safeAction: "none"`.
- The aggregate score is the rounded arithmetic mean of valid directional
  scores; category is the lexicographically stable mode. A category mode tie
  is not resolved by input order and also requires human review. The vote
  recommendation is a deterministic support/oppose majority, independent of
  score thresholds; this slice does not claim a quality threshold.
- A configured disagreement or unresolved quorum can request one structured
  cross-examination round. Its judgments replace the initial judgments; they
  are never appended. The packet contains only structured claims/evidence and
  aggregate metadata, not raw subject text.
- The idempotency key hashes normalized panel policy, configured identities,
  and subject content. Shuffling judge order does not change it; changing
  content or policy does.

## Deliberately deferred

This is not wired into the submission workflow, translation QA, scoring,
ranking, publication, moderation, persistence, or an admin API. Its
`integration` boundary is deliberately advisory in this slice: a caller must
keep the existing relevance/safety gate authoritative. Translation/scoring
adapters should be designed only after [#158](https://github.com/duyet/aidr/pull/158)
settles the independent semantic-review contract. This code makes no claim of
quality improvement and must not be used as a publication decision by itself.

A transport integration should return one `JevExecutionResult` per slot,
report model/version provenance, classify timeouts explicitly, and persist the
returned audit object through the future integration boundary. Human review
is a queue/decision boundary for that future adapter, not an automatic
approval or rejection path here.
