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
- Write news in the third person, not the source's own voice. A press release's, paper's, or blog's "we", "our", or "I" becomes the company or author the text names, else `nhóm tác giả` for a paper, `tác giả` for a blog post, `hãng` for a company announcement. Never name a speaker the text does not give. "You" the reader becomes `người dùng` or is dropped. Keep the first person only inside a direct quote. Drop a feed footer ("The post … appeared first on …").
- Prefer everyday words (`dùng`, `hãng`) over formalese when they mean the same thing. Split a long English sentence. Drop a repeated subject Vietnamese would omit.
- A complete summary is about as long as the English one, at least 80% when the source is long enough for the gate.
- Only Vietnamese plus the kept English terms. No third-language word (`abonnement` is `gói thuê bao`) and no English word that has a plain Vietnamese one (`các senators` is `các thượng nghị sĩ`, `AI-powered` is `dùng AI`).
- Proofread for stutters and near-miss spellings: `thỏa thỏa thuận`, `285 triệu triệu USD`, `địch chính trị` for `địa chính trị`. The draft gate flags a doubled word with diacritics.
- A named conjecture, theorem, or paper title you cannot render with certainty stays in English (`Unique Games Conjecture`).
- A Vietnamese TL;DR bullet carries the same facts as its English twin: every name (co-investors, the source outlet), nothing added (`mạnh mẽ`, `vừa`, `trực tiếp`).

After a draft, run the `aidr-unslop` pass (Vietnamese rules V1 to V16), then run the same checks the worker runs. In a node snippet or a unit test, call `translationDraftIssues` with the stripped source, the candidate, and the knowledge rules. Fix every issue it returns. Do not store a draft that still has issues.

## Change the pipeline

Change the smallest of these, then the test that locks it:

| Change | File | Test |
|---|---|---|
| Voice, examples, calques | `VI_STYLE` in `llm.ts` | `llm.test.ts` |
| The short card the model sees | `RULES_OVERVIEW` in `llm.ts` | the exact-string assertion in `llm.test.ts` |
| A term that must survive in English | `translation-terms.ts` | `translation-terms.test.ts` |
| What counts as a bad draft (calque, magnitude, gloss, Title Case, doubled word, garbled word, decimal point, `$` figure, English headline, length) | `translation-draft-check.ts`, `vi-syllable.ts`, `vi-lexicon.ts` (regenerate with `scripts/gen-vi-lexicon.ts`) | `translation-draft-check.test.ts`, `vi-syllable.test.ts` |

Before a new check ships, count what it would send back for repair: `pnpm exec tsx scripts/vi-audit.ts --days 7` (from `apps/web`, read-only D1) prints rows per check.
| How TL;DR VI bullets relate to the EN ones | `tldrPrompt` in `llm.ts` | `llm.test.ts` |
| Which model translates | `wrangler.toml` chains, locked by `schedule.test.ts` | probe first |

A `VI_STYLE` example must state only facts that are in the bad line. Do not add an AI-safety clause, a hedge, or a word such as `vừa` or `rõ rệt` that the source did not have.

Add a translate model only after a streaming `json_object` probe returns usable Vietnamese JSON. Record the model id, the HTTP status, and that the body was usable. A non-streaming 200 is not enough. Load `ANYROUTER_LOCAL_API_KEY` from `.env.local` (never the production `ANYROUTER_API_KEY`) without printing it. Do not add an id that 404s or returns an unusable body.

## Compare models

`scripts/translation-eval.ts` runs the production generate → review → repair path and a blind back-translation:

```bash
cd apps/web
pnpm exec tsx scripts/translation-eval.ts run --fixture scripts/fixtures/translation-eval-bullets.json --out /tmp/base.json            # stored prod VI
pnpm exec tsx scripts/translation-eval.ts run --fixture scripts/fixtures/translation-eval-bullets.json --generate --model google/gemma-4-31b --out /tmp/gemma.json
pnpm exec tsx scripts/translation-eval.ts compare /tmp/base.json /tmp/gemma.json
```

The summary reports accept rate, reviewer fidelity and naturalness, term preservation, back-translation recall, the VI/EN length ratio, generator p50/p95, and billed USD.

To test a card or a model against the current one, use the arms over `scripts/fixtures/vi-natural/items.json` (36 stories, frozen batches):

```bash
pnpm exec tsx scripts/translation-eval.ts gen --arm X --model <id> --out scripts/fixtures/vi-natural/arm-X.json   # the checked-out card
pnpm exec tsx scripts/translation-eval.ts metrics --arm P=fixture --arm A=scripts/fixtures/vi-natural/arm-A.json --arm X=...
pnpm exec tsx scripts/translation-eval.ts judge --pair A=... --pair X=... --judge openai/gpt-5.6-luna --out judge-AX-luna.json
pnpm exec tsx scripts/translation-eval.ts verdict judge-AX-luna.json judge-AX-<second judge>.json
```

Every request counts against `fixtures/vi-natural/calls.json` and stops at its cap or the first 429. A card ships only when both judges prefer it on at least 65% of the 36 stories with no more lost facts. On 2026-10-16 a free-form card ("not sentence by sentence") lost facts on Laguna and Gemma and read no better (ALGORITHM.md §6); the model decided naturalness. `scripts/fixtures/translation-eval.json` holds 30 item translations; `translation-eval-bullets.json` holds 30 real TL;DR bullets.

A local failure is not a prod failure. From a bench host outside Google's supported regions, `google/gemini-3-flash` returns 400 (antigravity) and the AI Studio pool returns 400 "User location is not supported", while the Worker on Cloudflare is served (audit: `gemini-3-flash` → `gemini-2.5-flash`). Several `google/*` ids flip between 200 and 404 BYOK by the hour. Check `pnpm --filter @aidr/web agent audit` for the prod route before dropping an id, and report an unreachable model as unavailable with its status, not as a score.

Do not rewrite stored production translations or write production D1 unless the user asks. The next backfill and repair pass pick up prompt changes for rows that fail the gate.

## Verify

```bash
pnpm --filter @aidr/web exec vitest run worker/__tests__/llm.test.ts worker/__tests__/translation-terms.test.ts worker/__tests__/translation-draft-check.test.ts worker/__tests__/vi-syllable.test.ts
pnpm exec biome check apps/web/worker/llm.ts apps/web/worker/translation-terms.ts apps/web/worker/translation-draft-check.ts apps/web/worker/vi-syllable.ts
```

Run `schedule.test.ts` as well when the model chain changes. Do not run the full `@aidr/web` suite. Do not `wrangler deploy`. A push to `master` deploys.

## Score a translation

Use this to score today's Vietnamese edition before you call it good, or after a change to `VI_STYLE`, the glossary, or the draft gate. Nothing ships below 8/10. Run it in a session that did not write the translations.

Scope is the stories and the VI TL;DR bullets of `GET /api/public?lang=vi`, with the stored `vi_title` and `vi_summary` from read-only D1. The script makes no LLM call and writes nothing. It reuses `draftIssuesByCheck`, `garbledWords`, `sentSource`, and `loadActiveRules`, so it agrees with the worker's gate.

```bash
pnpm --filter @aidr/web exec tsx scripts/review/vi.ts [--fixture <json>] [--json <out>]
```

Run it from the repo root. With `--fixture` it scores a saved edition instead of the live one (`scripts/review/fixtures/vi-good.json` is the clean one, `vi-bad.json` fails every automatic row). Every failure reason starts with the story or bullet and the first 8 characters of the item id, the same id as its `aidr.today/<id>` permalink.

| Row | Points | How to judge | Auto/Judged |
|---|---|---|---|
| `vi_garble` | 2 | No word that no Vietnamese spelling allows (`vi-syllable`), in a story or a bullet | Auto |
| `vi_numbers` | 1 | `draftIssuesByCheck` magnitude, decimal, dollar, and version checks are empty | Auto |
| `vi_calque_gloss` | 1 | Calque, parenthetical English gloss, and knowledge-rule `avoid` checks are empty | Auto |
| `vi_doubled_case` | 0.5 | No doubled word, no Title Case headline | Auto |
| `vi_untranslated` | 0.5 | No English headline echoed as the VI title | Auto |
| `vi_length` | 0.5 | VI summary is at least 60% of the English one when the source has 200 or more characters | Auto |
| `vi_title_present` | 1 | Every edition story has a VI title, and no VI bullet equals its English twin | Auto |
| `vi_keep_terms` | 1 | Every `KEEP_ENGLISH_TERMS` term in the source survives | Auto |
| `vi_native` | 1 | Read each title and bullet aloud. It sounds like a Vietnamese tech journalist, not English syntax in Vietnamese words | Judged |
| `vi_facts` | 1.5 | Against the English: who did what, every name, number, and hedge is kept, and nothing is added | Judged |

Scoring: an automatic row earns full points or none, and taste never overrules it. A judged row may earn half when the defect is in one spot. Ships at 8 of 10. Open the English item next to each Vietnamese one for the judged rows. A story that is clean to the gate can still swap who did what.

Report format:

1. The row table with PASS, FAIL, or the judged score for each row.
2. Every lost point, with the item id and the fix, for example `be38b11f: write "inference engine", not "khung suy diễn" (vi_calque_gloss, vi_keep_terms)`.
3. The total out of 10 and whether it ships.
