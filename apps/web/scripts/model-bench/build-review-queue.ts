/**
 * Datasets for the reader review queue (suggestions, submissions) and the
 * JEV panel judges. Same rules as build.ts: SELECT-only, no user ids, names,
 * ip hashes or emails.
 *
 * Production volume is small, so every usable row is taken (cap 40).
 * The JEV panel has never been enabled in production (`jev_panel_verdicts`
 * is empty), so judge cases are labelled with the production verdict on the
 * same subject (silver), not stored panel votes.
 */
import { fetchOgData } from "../../worker/enrich";
import { d1, interleave, write } from "./build";

const CAP = 40;

interface SuggestionRow {
  id: string;
  item_id: string;
  field: "title" | "summary" | "auto";
  lang: "vi" | "en";
  status: string;
  rating: number | null;
  suggestion: string;
  title: string;
  summary: string | null;
  source_lang: string | null;
  vi_title: string | null;
  vi_summary: string | null;
}

/** Reviewed suggestions. Accepted rows are left out: `translations` already
 *  holds the applied edit and the pre-review text is not stored, so the
 *  prompt would show the reviewer its own fix as the current text. */
function suggestionRows(): SuggestionRow[] {
  return d1<SuggestionRow>(
    `SELECT s.id, s.item_id, s.field, s.lang, s.status, s.rating, s.suggestion,
            i.title, substr(coalesce(i.summary,''),1,1600) AS summary, i.source_lang,
            t.title AS vi_title, substr(coalesce(t.summary,''),1,1600) AS vi_summary
     FROM translation_suggestions s
     JOIN items i ON i.id = s.item_id
     LEFT JOIN translations t ON t.item_id = s.item_id AND t.lang = 'vi'
     WHERE s.status IN ('rejected', 'needs_review')
     ORDER BY s.created_at DESC LIMIT ${CAP}`
  );
}

function buildSuggestion() {
  const cases = suggestionRows().map((r) => ({
    id: r.id,
    field: r.field,
    lang: r.lang,
    suggestion: r.suggestion,
    item: {
      title: r.title,
      summary: r.summary ?? "",
      source_lang: r.source_lang === "vi" ? "vi" : "en",
    },
    vi: { title: r.vi_title ?? "", summary: r.vi_summary ?? "" },
    silver: { status: r.status, rating: r.rating },
    labelSource: "silver:translation_suggestions.status",
  }));
  write("suggestion", ["silver:translation_suggestions.status"], cases);
}

interface SubmissionRow {
  id: string;
  url: string;
  title: string;
  note: string | null;
  status: string;
  rating: number | null;
}

/** og:description is fetched at review time and never stored, so it is
 *  re-fetched here for every case alike (accepted rows' item summaries
 *  would leak the label). */
async function submissionCases() {
  const rows = d1<SubmissionRow>(
    `SELECT id, url, title, note, status, rating FROM submissions
     WHERE status IN ('accepted', 'rejected') ORDER BY created_at DESC LIMIT ${CAP}`
  );
  const out = [];
  for (const r of rows) {
    const og = await fetchOgData(r.url);
    out.push({
      id: r.id,
      url: r.url,
      title: r.title,
      note: r.note ?? "",
      ogDescription: og.description ?? "",
      silver: { accepted: r.status === "accepted", rating: r.rating },
      labelSource: "silver:submissions.status",
    });
  }
  return out;
}

async function buildSubmission() {
  write("submission", ["silver:submissions.status"], await submissionCases());
}

interface ItemRow {
  id: string;
  title: string;
  summary: string | null;
  source_id: string;
  status: string;
}

/** Scoring judges (relevance, source_quality, safety): submissions in the
 *  submission-gate shape, plus published/rejected items in the score-panel
 *  shape. Label: the production publish/accept decision. */
async function buildJudgeScore() {
  const subs = (await submissionCases()).map((s) => ({
    id: `sub:${s.id}`,
    shape: "submission",
    content: {
      url: s.url,
      title: s.title,
      note: s.note,
      ogDescription: s.ogDescription,
    },
    silver: { publish: s.silver.accepted },
    labelSource: "silver:submissions.status",
  }));
  const items = (status: string) =>
    d1<ItemRow>(
      `SELECT id, title, substr(coalesce(summary,''),1,1200) AS summary, source_id, status
       FROM items WHERE status = '${status}' AND llm_relevance IS NOT NULL
       ORDER BY fetched_at DESC LIMIT ${Math.ceil((CAP - subs.length) / 2)}`
    );
  const scored = interleave(items("published"), items("rejected")).map((r) => ({
    id: r.id,
    shape: "score",
    content: { title: r.title, summary: r.summary ?? "", source: r.source_id },
    silver: { publish: r.status === "published" },
    labelSource: "silver:items.status",
  }));
  write(
    "judge-score",
    ["silver:submissions.status", "silver:items.status"],
    interleave(subs, scored).slice(0, CAP)
  );
}

/** translation_fidelity judge: rejected suggestions in the gate shape, plus
 *  stored EN→VI translations as the proposal, labelled by qa_rating. */
function buildJudgeTranslation() {
  const sugg = suggestionRows().map((r) => ({
    id: `sugg:${r.id}`,
    content: {
      field: r.field,
      sourceText: `${r.title}\n${r.summary ?? ""}`,
      currentTranslation: `${r.vi_title ?? ""}\n${r.vi_summary ?? ""}`,
      suggestion: r.suggestion,
    },
    silver: { accept: false },
    labelSource: "silver:translation_suggestions.status",
  }));
  const tr = (where: string) =>
    d1<{
      id: string;
      title: string;
      summary: string;
      vi_title: string;
      vi_summary: string;
      qa_rating: number;
    }>(
      `SELECT i.id, i.title, substr(coalesce(i.summary,''),1,1200) AS summary, t.title AS vi_title, substr(coalesce(t.summary,''),1,1600) AS vi_summary, t.qa_rating
       FROM items i JOIN translations t ON t.item_id = i.id AND t.lang = 'vi' AND t.source_lang = 'en'
       WHERE ${where} AND t.title IS NOT NULL ORDER BY t.qa_at DESC LIMIT ${Math.ceil((CAP - sugg.length) / 2)}`
    );
  const translations = interleave(
    tr("t.qa_rating >= 0.9"),
    tr("t.qa_rating < 0.7")
  ).map((r) => ({
    id: r.id,
    content: {
      field: "translation",
      sourceText: `${r.title}\n${r.summary}`,
      currentTranslation: "",
      suggestion: `${r.vi_title}\n${r.vi_summary}`,
    },
    silver: { accept: r.qa_rating >= 0.7 },
    labelSource: "silver:translations.qa_rating",
  }));
  write(
    "judge-translation",
    ["silver:translation_suggestions.status", "silver:translations.qa_rating"],
    [...sugg, ...translations].slice(0, CAP)
  );
}

export const REVIEW_QUEUE_BUILDERS: Record<string, () => void | Promise<void>> =
  {
    suggestion: buildSuggestion,
    submission: buildSubmission,
    "judge-score": buildJudgeScore,
    "judge-translation": buildJudgeTranslation,
  };
