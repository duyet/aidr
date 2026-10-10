---
name: aidr-vi-translation
description: >
  Translate AI news into Vietnamese in the aidr house style, or change the
  EN→VI prompt, glossary, and draft gate. Use when the user asks to dịch,
  translate to Vietnamese, fix a bản dịch, improve Vietnamese copy, or edit
  VI_STYLE, RULES_OVERVIEW, or the translate chain. Also /aidr-vi-translation.
---

# Vietnamese translation

The house style lives in code. Read it before writing or editing a translation. Do not paste a second copy of the glossary into a prompt, a test, or this skill.

Read, in this order:

1. `apps/web/worker/llm.ts` — `VI_STYLE` and `RULES_OVERVIEW`. `RULES_OVERVIEW` is an exact string locked by `worker/__tests__/llm.test.ts`. It is the short card in the translate user message. It is not appended inside `viSystemPrompt`.
2. `apps/web/worker/translation-terms.ts` — `KEEP_ENGLISH_TERMS` and `KEEP_ENGLISH_PROSE`. They must agree. `open-source` is not a keep term.
3. `apps/web/worker/translation-knowledge.ts` — `viSystemPrompt` builds the system prompt as `VI_STYLE` plus the glossary. A missing `translation_knowledge` table still returns the overview.
4. `apps/web/worker/translation-draft-check.ts` — `translationDraftIssues` is the repair gate. The source it sees is the stripped, clipped text from `sentSource`.

`apps/web/ALGORITHM.md` is the pipeline. Languages do not fall back (`worker/digest/edition.ts`). An empty Vietnamese column stays empty.

## Translate one item

Restate the news the way a Vietnamese tech journalist would say it out loud. Keep every fact: names, numbers, dates, who did what, and hedges such as "may" or "reportedly". Add nothing. A merged clause is allowed only when every fact remains. A cut sentence is a failed translation.

- Headline: Vietnamese sentence case. First word and proper names only. An unchanged English title is a failed translation unless the title is already Vietnamese.
- Jargon in `KEEP_ENGLISH_TERMS` stays English. `open-source` becomes `mã nguồn mở`. An AI agent stays `AI agent`, never `đại lý` or `đặc vụ`.
- No parenthetical English gloss. Write `RAG`, not `RAG (Retrieval-Augmented Generation)`. A year, a percent, or a bare label such as `(SEC)` may stay.
- Numbers: Vietnamese press style. `B` / billion = `tỷ`, `M` / million = `triệu`, `T` / trillion = `nghìn tỷ`. `$20B` is `20 tỷ USD`. A model size such as `7B` stays as written. Decimal comma: `2,5 tỷ USD`.
- A vague word is not a number. `Countless` is not `hàng triệu`.
- Do not swap who did what. If A accuses B, do not write B's thing of A.
- Prefer everyday words (`dùng`, `hãng`) over formalese when they mean the same thing. Split a long English sentence. Drop a repeated subject Vietnamese would omit.
- A complete summary is about as long as the English one, at least 80% when the source is long enough for the gate.
- Only Vietnamese plus the kept English terms. No third-language word (`abonnement` is `gói thuê bao`) and no English word that has a plain Vietnamese one (`các senators` is `các thượng nghị sĩ`, `AI-powered` is `dùng AI`).
- Proofread for stutters and near-miss spellings: `thỏa thỏa thuận`, `285 triệu triệu USD`, `địch chính trị` for `địa chính trị`. The draft gate flags a doubled word with diacritics.
- A named conjecture, theorem, or paper title you cannot render with certainty stays in English (`Unique Games Conjecture`).
- A Vietnamese TL;DR bullet carries the same facts as its English twin: every name (co-investors, the source outlet), nothing added (`mạnh mẽ`, `vừa`, `trực tiếp`).

After a draft, run the same checks the worker runs. In a node snippet or a unit test, call `translationDraftIssues` with the stripped source, the candidate, and the knowledge rules. Fix every issue it returns. Do not store a draft that still has issues.

## Change the pipeline

Change the smallest of these, then the test that locks it:

| Change | File | Test |
|---|---|---|
| Voice, examples, calques | `VI_STYLE` in `llm.ts` | `llm.test.ts` |
| The short card the model sees | `RULES_OVERVIEW` in `llm.ts` | the exact-string assertion in `llm.test.ts` |
| A term that must survive in English | `translation-terms.ts` | `translation-terms.test.ts` |
| What counts as a bad draft (calque, magnitude, gloss, Title Case, doubled word, length) | `translation-draft-check.ts` | `translation-draft-check.test.ts` |
| How TL;DR VI bullets relate to the EN ones | `tldrPrompt` in `llm.ts` | `llm.test.ts` |
| Which model translates | `wrangler.toml` chains, locked by `schedule.test.ts` | probe first |

A `VI_STYLE` example must state only facts that are in the bad line. Do not add an AI-safety clause, a hedge, or a word such as `vừa` or `rõ rệt` that the source did not have.

Add a translate model only after a streaming `json_object` probe returns usable Vietnamese JSON. Record the model id, the HTTP status, and that the body was usable. A non-streaming 200 is not enough. Load `ANYROUTER_API_KEY` from `.env.local` without printing it. Do not add an id that 404s or returns an unusable body.

## Compare models

`scripts/translation-eval.ts` runs the production generate → review → repair path and a blind back-translation:

```bash
cd apps/web
pnpm exec tsx scripts/translation-eval.ts run --fixture scripts/fixtures/translation-eval-bullets.json --out /tmp/base.json            # stored prod VI
pnpm exec tsx scripts/translation-eval.ts run --fixture scripts/fixtures/translation-eval-bullets.json --generate --model google/gemma-4-31b --out /tmp/gemma.json
pnpm exec tsx scripts/translation-eval.ts compare /tmp/base.json /tmp/gemma.json
```

The summary reports accept rate, reviewer fidelity and naturalness, term preservation, back-translation recall, the VI/EN length ratio, generator p50/p95, and billed USD. `scripts/fixtures/translation-eval.json` holds 30 item translations; `translation-eval-bullets.json` holds 30 real TL;DR bullets.

A local failure is not a prod failure. From a bench host outside Google's supported regions, `google/gemini-3-flash` returns 400 (antigravity) and the AI Studio pool returns 400 "User location is not supported", while the Worker on Cloudflare is served (audit: `gemini-3-flash` → `gemini-2.5-flash`). Several `google/*` ids flip between 200 and 404 BYOK by the hour. Check `pnpm --filter @aidr/web agent audit` for the prod route before dropping an id, and report an unreachable model as unavailable with its status, not as a score.

Do not rewrite stored production translations or write production D1 unless the user asks. The next backfill and repair pass pick up prompt changes for rows that fail the gate.

## Verify

```bash
pnpm --filter @aidr/web exec vitest run worker/__tests__/llm.test.ts worker/__tests__/translation-terms.test.ts worker/__tests__/translation-draft-check.test.ts
pnpm exec biome check apps/web/worker/llm.ts apps/web/worker/translation-terms.ts apps/web/worker/translation-draft-check.ts
```

Run `schedule.test.ts` as well when the model chain changes. Do not run the full `@aidr/web` suite. Do not `wrangler deploy`. A push to `master` deploys.
