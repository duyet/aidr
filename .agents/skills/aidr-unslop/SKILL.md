---
name: aidr-unslop
description: >
  Cut AI tells and translationese from AI;DR copy in English and Vietnamese.
  Required pass after any draft or translation in aidr-vi-translation,
  aidr-release-notes, aidr-release, and aidr-copy-review, before review. Use
  when copy reads machine-written, a Vietnamese line reads translated, or the
  user asks to unslop, polish, or make a bản dịch sound natural.
---

# aidr-unslop

Run this on a finished draft, before the review skill scores it. Order: write or translate, then this pass, then review. Rewrite the line. Do not add facts, drop facts, or soften hedges.

## English

Apply pstack `unslop` by rule number (`~/.cursor/plugins/**/skills/unslop/SKILL.md`, or `~/.claude/plugins/cache/cursor-plugins/pstack/*/skills/unslop/SKILL.md`). `aidr-copy-review` cites the same numbers. If you cannot find the file, these are the rules that bite most in AI;DR copy:

- No em or en dashes (13). No colon joining two clauses (14).
- No AI vocabulary (7): enhance, seamless, robust, leverage, showcase, crucial, landscape.
- "is" and "has", not "serves as" or "boasts" (8). No "not just X, but Y" (9).
- No ", ensuring", ", highlighting" tails (3). No forced groups of three (10).
- Active voice with the actor named (29). Numbers, not adverbs (30). Sentence case headings (17).
- Say what the feature does, not how it feels (27). Banned words in `docs/marketing/positioning.md` still apply.

## Vietnamese

The goal is a line a Vietnamese tech journalist would write, not English in Vietnamese words. The glossary and keep-English terms live in `apps/web/worker/translation-terms.ts` and `VI_STYLE` in `apps/web/worker/llm.ts`. This list is about voice. Each rule has an id other skills can cite.

| Id | Pattern | Bad | Good |
|---|---|---|---|
| V1 | English word order kept, heavy front-loaded modifier | `Mới được phát hành bởi Google, mô hình này...` | `Google phát hành mô hình này...` |
| V2 | Passive `được/bị ... bởi` where Vietnamese uses active | `Tính năng được ra mắt bởi OpenAI` | `OpenAI ra mắt tính năng` |
| V3 | `việc` / `sự` nominalizing a verb | `Việc sử dụng AI giúp tăng tốc` | `Dùng AI giúp làm nhanh hơn` |
| V4 | `một cách + adj` for an English -ly adverb | `cập nhật một cách nhanh chóng` | `cập nhật nhanh` |
| V5 | Literal idiom or metaphor | `một kẻ thay đổi trò chơi`, `ở trên cùng của bảng xếp hạng` | state the fact; `đứng đầu` |
| V6 | Stacked Sino-Vietnamese or formalese | `tiến hành triển khai thực hiện` | `triển khai` |
| V7 | Pronoun copied from English | `Nó cho phép bạn...` for a product | `Công cụ này cho phép...`, or drop the subject |
| V8 | Repeated subject Vietnamese would omit | `Meta nói Meta sẽ...` | `Meta cho biết sẽ...` |
| V9 | `của` chains | `tính năng mới của ứng dụng của Google` | `tính năng mới trên ứng dụng Google` |
| V10 | Plural marker stacked or misused | `các những mô hình` | `các mô hình` |
| V11 | Product, model, and brand names translated | `Trợ lý Claude Mã`, `Gương Đen` | `Claude Code`, `Black Mirror`, `AI;DR` |
| V12 | English left in where plain Vietnamese exists | `các senators`, `AI-powered` | `các thượng nghị sĩ`, `dùng AI` |
| V13 | English punctuation and spacing | `20 %`, `2.5 tỷ`, `"Title Case Tiêu Đề"`, space before `:` or `?` | `20%`, `2,5 tỷ`, sentence case, no space before punctuation |
| V14 | Filler intensifiers the source lacks | `mạnh mẽ`, `vô cùng`, `đáng kể`, `vừa` added | delete, or use the source's number |
| V15 | `Bạn` imperative copied from English marketing | `Bạn hãy khám phá ngay!` | `Xem tại aidr.today` |
| V16 | English sentence split kept as one long line | one sentence with three `và` | two or three short sentences |

English rules 13, 14, 18, 19, 20, 22, 23, and 25 also apply to Vietnamese text.

## How to run the pass

1. Read each line aloud. Mark every row above that it hits, by id.
2. Rewrite only the marked spans. Keep every name, number, date, and hedge.
3. For Vietnamese, compare against the English twin once more for who did what.
4. Hand the result to the review skill: `aidr-copy-review`, the "Score a translation" section of `aidr-vi-translation`, or `aidr-video-review` for film lines.

When a pattern keeps recurring in stored translations, propose it as a check in `translation-draft-check.ts` through `aidr-vi-translation`. Do not edit worker prompts from this skill. `apps/web/ALGORITHM.md` governs them.
