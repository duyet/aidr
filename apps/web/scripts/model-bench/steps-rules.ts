/**
 * `rule-extraction`: the call `learnFromAcceptedSuggestion` makes after an
 * accepted VI correction (worker/translation-knowledge.ts). The bench copies
 * that call (prompt, options, `validateRule`, `ruleIsEvidenced`) instead of
 * calling the wrapper, which writes to D1 and swallows provider errors.
 *
 * Prod has almost no accepted reader corrections, so most cases are built
 * from real prod text:
 *   positive  each active rule's stored example, and stored VI rows that
 *             contain a rule's bad_vi, corrected by substitution. Kept only
 *             when prod's own `ruleIsEvidenced` accepts the gold rule.
 *   negative  accepted reader suggestions that taught no rule, and stored
 *             VI rows with one story-specific number changed (a fact fix).
 * Quality is class-balanced so "always one-off" cannot score well.
 */
import { callAnyrouter, parseJson } from "../../worker/llm";
import {
  buildRuleExtractionPrompt,
  containsViPhrase,
  type LearnInput,
  ruleIsEvidenced,
  validateRule,
} from "../../worker/translation-knowledge";
import { d1, interleave, write } from "./build";
import type { Case, CaseResult, StepDef } from "./steps";

export const ruleExtractionStep: StepDef = {
  envVar: "ANYROUTER_TRANSLATE_MODEL",
  primary:
    "class-balanced: reusable rules found (term + evidenced) vs one-off fixes left alone",
  units: (cases) => cases.map((c) => [c]),
  async run(env, [c], { model }) {
    const input = c.input as LearnInput;
    const { content } = await callAnyrouter(
      env,
      [{ role: "user", content: buildRuleExtractionPrompt(input) }],
      { json: true, modelSpec: model, task: "review", sensitive: true }
    );
    let parsed: Record<string, unknown> | null = null;
    try {
      parsed = parseJson<Record<string, unknown>>(content);
    } catch {
      parsed = null;
    }
    const gold = c.gold as { reusable: boolean; source_term?: string };
    if (!parsed || typeof parsed.reusable !== "boolean")
      return [
        {
          id: c.id,
          valid: false,
          metrics: { positive: Number(gold.reusable) },
        },
      ];
    const rule = parsed.reusable ? validateRule(parsed) : null;
    const metrics: CaseResult["metrics"] = {
      positive: Number(gold.reusable),
      reusableAgree: Number(parsed.reusable === gold.reusable),
    };
    if (gold.reusable) {
      metrics.ruleValid = Number(rule !== null);
      metrics.termMatch = Number(
        rule !== null &&
          rule.source_term.replace(/s$/, "") ===
            (gold.source_term ?? "").toLowerCase().replace(/s$/, "")
      );
      metrics.evidenced = Number(rule !== null && ruleIsEvidenced(rule, input));
    }
    return [
      {
        id: c.id,
        valid: true,
        metrics,
        output: rule ?? { reusable: parsed.reusable },
      },
    ];
  },
  quality: (r) => {
    const score = (x: CaseResult): number => {
      if (!x.valid) return 0;
      const m = x.metrics;
      if (!m.positive) return m.reusableAgree ?? 0;
      return (
        0.3 * (m.reusableAgree ?? 0) +
        0.1 * (m.ruleValid ?? 0) +
        0.3 * (m.termMatch ?? 0) +
        0.3 * (m.evidenced ?? 0)
      );
    };
    const cls = (pos: boolean) => {
      const xs = r.filter((x) => Boolean(x.metrics.positive) === pos);
      return xs.length
        ? xs.map(score).reduce((a, b) => a + b, 0) / xs.length
        : null;
    };
    const parts = [cls(true), cls(false)].filter(
      (v): v is number => v !== null
    );
    return parts.length
      ? parts.reduce((a, b) => a + b, 0) / parts.length
      : null;
  },
};

interface RuleRow {
  kind: "keep_english" | "preferred_term" | "avoid";
  source_term: string;
  vi_term: string | null;
  bad_vi: string;
  example: string | null;
}

const esc = (s: string) => s.replace(/'/g, "''");

/** Replace every case-insensitive occurrence of `bad` in `text`. */
function substitute(text: string, bad: string, good: string): string {
  return text.replace(
    new RegExp(bad.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"),
    good
  );
}

export function buildRuleExtraction() {
  const rules = d1<RuleRow>(
    "SELECT kind, source_term, vi_term, bad_vi, example FROM translation_knowledge WHERE status = 'active'"
  );
  const positives: Case[] = [];
  const pushPositive = (
    id: string,
    rule: RuleRow,
    input: LearnInput,
    labelSource: string
  ) => {
    const gold = {
      kind: rule.kind,
      source_term: rule.source_term,
      vi_term: rule.vi_term,
      bad_vi: JSON.parse(rule.bad_vi) as string[],
      note: null,
    };
    // Keep only cases prod itself would treat as evidence for the rule.
    if (!ruleIsEvidenced(gold, input)) return;
    positives.push({
      id,
      input,
      gold: { reusable: true, kind: rule.kind, source_term: rule.source_term },
      labelSource,
    });
  };
  for (const rule of rules) {
    const bad = JSON.parse(rule.bad_vi) as string[];
    const good = rule.vi_term ?? rule.source_term;
    if (rule.example) {
      const ex = JSON.parse(rule.example) as {
        source: string;
        bad: string;
        good: string;
      };
      pushPositive(
        `example:${rule.source_term}`,
        rule,
        {
          suggestionId: "bench",
          rating: 1,
          sourceText: ex.source,
          previousVi: ex.bad,
          appliedVi: ex.good,
          readerSuggestion: `"${bad[0]}" is wrong here, use "${good}".`,
        },
        "gold:translation_knowledge.example"
      );
    }
    const hits = d1<{
      id: string;
      title: string;
      summary: string;
      vi_title: string;
      vi_summary: string;
    }>(
      `SELECT i.id, i.title, substr(coalesce(i.summary,''),1,600) AS summary, t.title AS vi_title, substr(coalesce(t.summary,''),1,800) AS vi_summary
       FROM items i JOIN translations t ON t.item_id = i.id AND t.lang = 'vi' AND t.source_lang = 'en'
       WHERE lower(i.title || ' ' || coalesce(i.summary,'')) LIKE '%${esc(rule.source_term.toLowerCase())}%'
         AND (${bad.map((b) => `lower(t.title || ' ' || coalesce(t.summary,'')) LIKE '%${esc(b.toLowerCase())}%'`).join(" OR ")})
       ORDER BY i.published_at DESC LIMIT 3`
    );
    for (const h of hits) {
      const useTitle = bad.some((b) => containsViPhrase(h.vi_title, b));
      const before = useTitle ? h.vi_title : h.vi_summary;
      const after = bad.reduce((t, b) => substitute(t, b, good), before);
      pushPositive(
        `stored:${h.id}:${rule.source_term}`,
        rule,
        {
          suggestionId: "bench",
          rating: 1,
          sourceText: useTitle ? h.title : h.summary,
          previousVi: before,
          appliedVi: after,
          readerSuggestion: `Use "${good}" instead of "${bad.find((b) => containsViPhrase(before, b)) ?? bad[0]}".`,
        },
        "derived:stored translations.vi with a rule's bad_vi, substituted"
      );
    }
  }

  const negatives: Case[] = [];
  const accepted = d1<{
    id: string;
    field: string;
    suggestion: string;
    applied_text: string;
    title: string;
    summary: string;
  }>(
    `SELECT s.id, s.field, s.suggestion, s.applied_text, i.title, substr(coalesce(i.summary,''),1,600) AS summary
     FROM translation_suggestions s JOIN items i ON i.id = s.item_id
     WHERE s.status = 'accepted' AND s.lang = 'vi' AND s.applied_text IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM translation_knowledge k WHERE k.from_suggestion_id = s.id)`
  );
  // Seed rules carry no from_suggestion_id, so a suggestion about a rule's
  // bad_vi taught that rule and is not a one-off.
  const allBad = rules.flatMap((r) => JSON.parse(r.bad_vi) as string[]);
  for (const s of accepted)
    if (!allBad.some((b) => containsViPhrase(s.suggestion, b)))
      negatives.push({
        id: `suggestion:${s.id}`,
        input: {
          suggestionId: "bench",
          rating: 1,
          sourceText: s.field === "summary" ? s.summary : s.title,
          previousVi: null,
          appliedVi: s.applied_text,
          readerSuggestion: s.suggestion,
        },
        gold: { reusable: false },
        labelSource: "silver:accepted translation_suggestions with no rule",
      });
  // Story-specific fact fixes: the stored VI had one number wrong.
  const facts = d1<{ id: string; title: string; vi_title: string }>(
    `SELECT i.id, i.title, t.title AS vi_title
     FROM items i JOIN translations t ON t.item_id = i.id AND t.lang = 'vi' AND t.source_lang = 'en'
     WHERE i.status = 'published' AND t.title GLOB '*[0-9]*' AND i.title GLOB '*[0-9]*'
     ORDER BY i.published_at DESC LIMIT 40`
  );
  for (const f of facts) {
    const m = f.vi_title.match(/\d+/);
    if (!m || !f.title.includes(m[0])) continue;
    const wrong = String(Number(m[0]) + (Number(m[0]) > 5 ? -3 : 2));
    const previousVi = f.vi_title.replace(m[0], wrong);
    negatives.push({
      id: `fact:${f.id}`,
      input: {
        suggestionId: "bench",
        rating: 1,
        sourceText: f.title,
        previousVi,
        appliedVi: f.vi_title,
        readerSuggestion: `The number is wrong: the source says ${m[0]}, not ${wrong}.`,
      },
      gold: { reusable: false },
      labelSource:
        "derived:stored translations.vi title with one number changed (fact fix)",
    });
    if (negatives.length >= positives.length + 2) break;
  }
  write(
    "rule-extraction",
    [
      "gold:translation_knowledge.example",
      "derived:stored translations.vi with a rule's bad_vi, substituted",
      "silver:accepted translation_suggestions with no rule",
      "derived:stored translations.vi number fact fix",
    ],
    interleave(positives, negatives)
  );
}
