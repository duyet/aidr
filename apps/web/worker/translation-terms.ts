/**
 * English technical terms and names that must survive EN→VI verbatim.
 *
 * One list feeds both the generator (VI_STYLE + the per-item keep list in
 * the translate prompt) and the deterministic QA guard, so the guard never
 * demands a term the style tells the generator to translate.
 */

/** Jargon Vietnamese tech readers already use in English. Each entry is a
 * stem matched on word boundaries; plural/inflected forms pass. */
export const KEEP_ENGLISH_TERMS = [
  "fine-tun",
  "agent",
  "agentic",
  "multi-agent",
  "benchmark",
  "token",
  "open-weight",
  "prompt",
  "chatbot",
  "swarm",
  "embedding",
] as const;

/** Prose form used in VI_STYLE. */
export const KEEP_ENGLISH_PROSE =
  "fine-tune, benchmark, agent, agentic, token, open-weights, prompt, chatbot, embedding, LLM, GPU, AI, swarm, multi-agent";

/** Capitalized words a Vietnamese journalist correctly translates: places,
 * demonyms, calendar words, and English function words that open a sentence
 * or a title-case headline. */
const TRANSLATABLE_NAMES = new Set(
  [
    "us",
    "usa",
    "uk",
    "u.s",
    "america",
    "american",
    "americans",
    "china",
    "chinese",
    "japan",
    "japanese",
    "korea",
    "korean",
    "south",
    "north",
    "india",
    "indian",
    "germany",
    "german",
    "france",
    "french",
    "britain",
    "british",
    "england",
    "english",
    "europe",
    "european",
    "russia",
    "russian",
    "taiwan",
    "taiwanese",
    "vietnam",
    "vietnamese",
    "australia",
    "australian",
    "canada",
    "canadian",
    "italy",
    "spain",
    "brazil",
    "mexico",
    "israel",
    "iran",
    "ukraine",
    "singapore",
    "thailand",
    "indonesia",
    "africa",
    "asia",
    "senate",
    "congress",
    "house",
    "white",
    "pentagon",
    "federal",
    "commission",
    "department",
    "ministry",
    "government",
    "president",
    "ceo",
    "cfo",
    "coo",
    "cto",
    "wall",
    "street",
    "january",
    "february",
    "march",
    "april",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
    "jan",
    "feb",
    "mar",
    "apr",
    "jun",
    "jul",
    "aug",
    "sep",
    "sept",
    "oct",
    "nov",
    "dec",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
    "the",
    "a",
    "an",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "i",
    "we",
    "you",
    "they",
    "he",
    "she",
    "in",
    "on",
    "at",
    "for",
    "from",
    "with",
    "by",
    "of",
    "to",
    "and",
    "or",
    "but",
    "if",
    "when",
    "what",
    "whatever",
    "why",
    "how",
    "who",
    "new",
    "learn",
    "see",
    "read",
    "our",
    "after",
    "before",
    "as",
    "is",
    "are",
    "not",
    "no",
    "back",
    "live",
    "feed",
    "stories",
    "day",
    "program",
    "programme",
    "grant",
  ].map((w) => w.toLowerCase())
);

function foldTerm(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9.-]/g, "");
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Word-bounded, case-insensitive. A stem may be followed by more letters
 * (agent → agents/agentic, fine-tun → fine-tuning). */
function hasWord(text: string, word: string, stem: boolean): boolean {
  const tail = stem ? "[\\p{L}-]*" : "(?:s|es|'s|’s)?";
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegex(word)}${tail}(?![\\p{L}\\p{N}])`,
    "iu"
  ).test(text);
}

const NON_AI_AGENT_RE =
  /\b(?:federal|fbi|secret|special|border|customs|immigration|free|travel|real[- ]estate|sports)\s+agents?\b/gi;

const WORD_RE = /[A-Za-z][A-Za-z0-9]*(?:[.'’-][A-Za-z0-9]+)*/g;

/** Words that are names regardless of position: acronyms (MCP, AI5),
 * camelCase (OpenAI, xAI), or letters with digits (GPT-5, H100). */
function isStrongName(word: string): boolean {
  return (
    /^[A-Z][A-Z0-9]+(?:[.-][A-Z0-9]+)*s?$/.test(word) ||
    /^[A-Za-z][a-z0-9]*[A-Z][A-Za-z0-9]*$/.test(word) ||
    (/\d/.test(word) && /[A-Za-z]/.test(word))
  );
}

/** A headline in Title Case capitalizes ordinary words ("Raises", "Cuts"),
 * so a plain capitalized title word is only a name if the sentence-case
 * summary also capitalizes it mid-sentence. */
function isTitleCase(title: string): boolean {
  const words = title.match(/[A-Za-z][A-Za-z'’-]{3,}/g) ?? [];
  // "Anthropic fine-tunes Claude" is too short to tell; treat it as
  // sentence case so its mid-sentence capitals still count.
  if (words.length < 4) return false;
  const caps = words.filter((w) => /^[A-Z]/.test(w)).length;
  return caps / words.length >= 0.6;
}

/** Capitalized words that are not the first word of a sentence. */
function midSentenceCapitals(text: string): Set<string> {
  const out = new Set<string>();
  for (const sentence of text.split(/(?<=[.!?:;·•—–])\s+|\n+/)) {
    const words = sentence.match(WORD_RE) ?? [];
    words.slice(1).forEach((w) => {
      if (/^[A-Z]/.test(w)) out.add(w);
    });
  }
  return out;
}

const RUN_CONNECTORS = new Set(["of", "on", "and", "for", "the", "de"]);

/** A run naming an institution is translated ("Catholic Church" → "Giáo
 * hội Công giáo", "Homeland Security" → "An ninh Nội địa"). */
const INSTITUTION_WORDS = new Set([
  "church",
  "catholic",
  "homeland",
  "security",
  "justice",
  "force",
  "council",
  "court",
  "agency",
  "university",
  "institute",
  "foundation",
  "army",
  "navy",
  "police",
  "union",
  "party",
  "office",
  "bureau",
  "committee",
  "parliament",
  "ministry",
  "department",
  "treasury",
]);

/** Mid-sentence capitalized words that stand alone or in a pair:
 * "Claude", "Decagon", "David Sacks". Longer runs are usually institution
 * or feature titles ("Council of Advisers on Science and Technology",
 * "Responsive Video Interfaces") that a Vietnamese journalist translates,
 * so they are left to the reviewer. */
function shortCapitalRuns(text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.split(/(?<=[.!?:;·•—–])\s+|\n+/)) {
    const words = sentence.match(WORD_RE) ?? [];
    let run: string[] = [];
    const flush = () => {
      const caps = run.filter((w) => /^[A-Z]/.test(w));
      if (
        caps.length <= 2 &&
        caps.length === run.length &&
        !caps.some((w) => INSTITUTION_WORDS.has(w.toLowerCase()))
      ) {
        out.push(...caps);
      }
      run = [];
    };
    words.forEach((w, i) => {
      if (i > 0 && /^[A-Z]/.test(w)) run.push(w);
      // "Council of Advisers on Science": a connector between capitals
      // keeps the run going, so the whole title counts as one long run.
      else if (
        run.length > 0 &&
        RUN_CONNECTORS.has(w) &&
        /^[A-Z]/.test(words[i + 1] ?? "")
      )
        run.push(w);
      else flush();
    });
    flush();
  }
  return out;
}

/** Names the guard can demand with high precision: every acronym,
 * camelCase, or digit-bearing word, the headline's capitalized names, and
 * short capitalized runs in the summary. */
function nameCandidates(title: string, summary: string): string[] {
  const names = new Set<string>();
  for (const w of `${title}\n${summary}`.match(WORD_RE) ?? []) {
    if (isStrongName(w)) names.add(w);
  }
  // A one-letter model suffix ("Model X") is only a name with its head.
  for (const m of `${title}\n${summary}`.matchAll(
    /\b[A-Z][A-Za-z0-9]+ [A-Z]\b(?![.'’-]?\w|\.)/g
  )) {
    names.add(m[0]);
  }
  for (const w of shortCapitalRuns(summary)) names.add(w);
  // Sentence-case title: mid-sentence capitals are names, and so is the
  // first word when the summary capitalizes it mid-sentence too. Title Case
  // capitalizes ordinary words, so only the summary's evidence counts.
  const summaryCaps = new Set(
    [...midSentenceCapitals(summary)].map((w) => w.toLowerCase())
  );
  const titleCaps = isTitleCase(title)
    ? new Set<string>()
    : midSentenceCapitals(title);
  for (const w of title.match(WORD_RE) ?? []) {
    if (
      titleCaps.has(w) ||
      (/^[A-Z]/.test(w) && summaryCaps.has(w.toLowerCase()))
    ) {
      names.add(w);
    }
  }
  // "OpenAI's" → "OpenAI"; "GPUs" collapses into "GPU" when both occur.
  const base = new Set([...names].map((w) => w.replace(/['’]s$/, "")));
  for (const w of base) {
    if (/[A-Z]s$/.test(w) && base.has(w.slice(0, -1))) base.delete(w);
  }
  return [...base].filter((w) => {
    const folded = foldTerm(w);
    return (
      folded.length >= 2 &&
      !TRANSLATABLE_NAMES.has(folded) &&
      !TRANSLATABLE_NAMES.has(folded.replace(/s$/, ""))
    );
  });
}

/** Feed chrome that ingest leaves at the start of some summaries: arXiv
 * listing headers and aggregator "back to feed" lines. It is not article
 * text, so no guard should demand it survive. */
export function stripSourceBoilerplate(text: string): string {
  return text
    .replace(
      /^\s*←?\s*Back to live feed\s*·\s*\d+\s+stor(?:y|ies) across \d+ days?\s*/i,
      ""
    )
    .replace(/^\s*arXiv:\S+\s+Announce Type:\s*\S+\s+Abstract:\s*/i, "")
    .replace(/^\s*See what[’']s happening and join the conversation\s*$/i, "");
}

export interface ProtectedTerms {
  /** Product, model, company, and person names; acronyms. */
  names: string[];
  /** Keep-English jargon stems found in the source. */
  jargon: string[];
}

/** Terms in an English source that the Vietnamese must keep verbatim. */
export function extractProtectedTerms(source: {
  title: string;
  summary: string;
}): ProtectedTerms {
  const summary = stripSourceBoilerplate(source.summary);
  const text = `${source.title}\n${summary}`;
  // "Federal agents" are people, not AI agents.
  const jargon = KEEP_ENGLISH_TERMS.filter((term) =>
    hasWord(
      term === "agent" ? text.replace(NON_AI_AGENT_RE, "") : text,
      term,
      true
    )
  );
  return {
    names: nameCandidates(source.title, summary),
    jargon: [...jargon],
  };
}

/** Name present: folded match on word boundaries ("OpenAI" ⇔ "Open AI" is
 * not accepted, but "Việt Nam"-style diacritic folding is). */
function hasName(candidate: string, name: string): boolean {
  const folded = foldTerm(name).replace(/(?<=..)s$/, "");
  if (!folded) return true;
  // Inner dots/hyphens belong to the word ("GPT-5.6"); a trailing one
  // ends the sentence ("10 triệu USD.").
  const words = (
    candidate.match(/[\p{L}\p{N}]+(?:[.'’-][\p{L}\p{N}]+)*/gu) ?? []
  ).map((w) => foldTerm(w));
  const joined = ` ${words.join(" ")} `;
  // Short names ("Pi", "AI") must be a whole word; longer ones may carry a
  // suffix ("Claude's", "GPUs").
  if (
    words.some(
      (w) => w === folded || (folded.length >= 4 && w.startsWith(folded))
    )
  )
    return true;
  // Multi-token forms such as "GPT 5" for "GPT-5".
  return joined.replace(/\s+/g, "").includes(folded) && folded.length >= 4;
}

/** "AI-generated" → demand "AI"; "multi-agent" → demand "agent". The
 * lowercase English half is the part a Vietnamese sentence restates. */
function coreOfCompound(term: string): string {
  if (!term.includes("-")) return term;
  const parts = term.split("-");
  const named = parts.filter((p) => /[A-Z0-9]/.test(p));
  if (named.length > 0 && named.length < parts.length) return named.join("-");
  return term === "multi-agent" ? "agent" : term;
}

/** Source terms missing from the candidate, in source order. */
export function missingProtectedTerms(
  source: { title: string; summary: string },
  candidate: { title: string; summary: string }
): ProtectedTerms {
  const terms = extractProtectedTerms(source);
  const text = `${candidate.title}\n${candidate.summary}`;
  return {
    names: terms.names.filter((name) => !hasName(text, coreOfCompound(name))),
    jargon: terms.jargon.filter(
      (term) => !hasWord(text, coreOfCompound(term), true)
    ),
  };
}

/** Flat keep-verbatim list for the translate prompt. */
export function keepVerbatimList(source: {
  title: string;
  summary: string;
}): string[] {
  const terms = extractProtectedTerms(source);
  return [
    ...terms.names,
    ...terms.jargon.map((t) => (t === "fine-tun" ? "fine-tune" : t)),
  ];
}
