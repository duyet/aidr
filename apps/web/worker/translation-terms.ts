/**
 * English technical terms and names that must survive EN→VI verbatim.
 *
 * One list feeds both the generator (VI_STYLE + the per-item keep list in
 * the translate prompt) and the deterministic QA guard, so the guard never
 * demands a term the style tells the generator to translate.
 */

import { sentenceEnds } from "./sentences.js";

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
  "decision model",
  "reasoning model",
  "foundation model",
  "world model",
  "context window",
  "guardrail",
  "jailbreak",
  "harness",
  "hyperscaler",
  "rollout",
  "exploit",
  "kill switch",
  "red-team",
  "sandbox",
  "frontier model",
  "prompt",
  "chatbot",
  "swarm",
  "embedding",
] as const;

/** Matched as whole words (plural allowed), not stems: the verb forms
 * "harnessing" and "exploited" are ordinary English a journalist translates. */
const WHOLE_WORD_TERMS = new Set<string>(["harness", "exploit"]);

/** Prose form used in VI_STYLE. */
export const KEEP_ENGLISH_PROSE =
  "fine-tune, benchmark, agent, agentic, token, open-weights, decision model, reasoning model, foundation model, world model, reinforcement learning (or RL), context window, guardrail, jailbreak, harness, hyperscaler, rollout, exploit, kill switch, red-teaming, sandbox, frontier model, MoE, prompt, chatbot, embedding, LLM, GPU, AI, swarm, multi-agent";

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
 * (agent → agents/agentic, fine-tun → fine-tuning). Spaces and hyphens in a
 * stem are interchangeable ("open weights" ⇔ "open-weight"). */
function hasWord(text: string, word: string, stem: boolean): boolean {
  const tail = stem ? "[\\p{L}-]*" : "(?:s|es|'s|’s)?";
  const body = stem
    ? word.split(/[- ]/).map(escapeRegex).join("[- ]?")
    : escapeRegex(word);
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${body}${tail}(?![\\p{L}\\p{N}])`,
    "iu"
  ).test(text);
}

export const NON_AI_AGENT_RE =
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

/** Chrome specific enough to strip wherever it sits. The bare "Back to top"
 * leading form is not here: it reads as article text mid-sentence. */
const CHROME_ANYWHERE = [
  // "← Back to live feed", the aggregator's own label, or an arrowed link
  "[←‹«]?\\s*Back to (?:the )?live feed",
  "[←‹«]\\s*Back to (?:the |all )?(?:stories|news|articles|home|homepage)",
  // "1 stories across 1 day" (a bare "3 stories" can be article text)
  "\\d+\\s+stor(?:y|ies)\\s+across\\s+\\d+\\s+days?",
  "Skip to (?:main )?content",
  // "From Bloomberg. View the full context on Techmeme."
  "View the full context on [A-Z][\\w.]*(?: [A-Z][\\w.]*){0,2}\\.?",
  // The Vietnamese rendering: "Xem toàn bộ ngữ cảnh trên Techmeme."
  "Xem [^.]{0,40}? trên Techmeme\\.?",
];

const CHROME_SEPARATOR = "\\s*[·•|:—–-]?\\s*";

/** One leading page-chrome segment: a back/breadcrumb link, a story or
 * reading-time counter, or a skip link. Aggregator pages (huggingnews,
 * marketbrief) put these before the story body, and og/<p> extraction picks
 * them up. Matched only at the start, so article text is never touched. */
const LEADING_CHROME_RE = new RegExp(
  `^\\s*(?:${[
    // "← Back to live feed", "Back to all stories", "‹ Back to news"
    "[←‹«<]?\\s*Back to (?:the )?(?:[\\w-]+ ){0,2}(?:feed|news|stories|articles|home|homepage|list|index|top)\\b",
    ...CHROME_ANYWHERE,
    // "5 min read", "3 minute read"
    "\\d+\\s*min(?:ute)?s?\\s+read",
  ].join("|")})${CHROME_SEPARATOR}`,
  "i"
);

const EMBEDDED_CHROME_RE = new RegExp(
  `(?:${CHROME_ANYWHERE.join("|")})${CHROME_SEPARATOR}`,
  "gi"
);

/** True when the text carries page chrome at its start or anywhere inside. */
export function hasSourceChrome(text: string): boolean {
  return (
    LEADING_CHROME_RE.test(text) ||
    new RegExp(EMBEDDED_CHROME_RE.source, "i").test(text)
  );
}

/** Removes page chrome wherever it sits. A digest line is a headline plus a
 * summary clause, so chrome lands mid-line, not at the start where
 * `stripSourceBoilerplate` looks. */
export function stripEmbeddedChrome(text: string): string {
  return stripTrailingAttribution(
    stripSourceBoilerplate(text)
      .replace(EMBEDDED_CHROME_RE, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

/** Strips every leading chrome segment, however many are chained. */
function stripLeadingChrome(text: string): string {
  let out = text;
  for (let next = out.replace(LEADING_CHROME_RE, ""); next !== out; ) {
    out = next;
    next = out.replace(LEADING_CHROME_RE, "");
  }
  return out;
}

/** Footers a feed appends after the excerpt. A footer begins a word (so not
 * inside a quote or bracket) and runs to the end of the text: the outlet name
 * with no quote marks or sentence break, then an optional period. Quoted
 * mentions and mentions followed by more prose are kept. Feeds truncate the
 * excerpt mid-sentence, so the footer need not follow sentence punctuation.
 * The title between the opening words and "appeared first on" may not
 * contain the opening words again, so article text that starts "The
 * article …" earlier is kept. */
const FOOTER_START = String.raw`(?<!\S)`;
const FOOTER_OUTLET = String.raw`(?:(?!\.\s)[^\n"“”]){1,60}?\s*\.?$`;
const FEED_FOOTERS: readonly RegExp[] = [
  // WordPress default: MarkTechPost, The GitHub Blog, Microsoft Research.
  new RegExp(
    String.raw`\s*${FOOTER_START}The post (?:(?!\bThe post ).)+? appeared first on ${FOOTER_OUTLET}`,
    "s"
  ),
  // The Decoder.
  new RegExp(
    String.raw`\s*${FOOTER_START}The article (?:(?!\bThe article ).)+? appeared first on ${FOOTER_OUTLET}`,
    "s"
  ),
];

function stripFeedFooter(text: string): string {
  const trimmed = text.trimEnd();
  for (const footer of FEED_FOOTERS) {
    const next = trimmed.replace(footer, "");
    if (next !== trimmed) return next;
  }
  return text;
}

/** A capitalised name or handle: "Bloomberg", "The Information",
 * "@openainewsroom", "Goldman Sachs and Reuters". Capitalised words only, so a
 * sentence that goes on ("Theo dự báo từ …", "From Nvidia to Obvious Ventures
 * …") is not a name. */
const ATTRIBUTION_WORD = String.raw`[@\p{Lu}\p{N}][\p{L}\p{N}_.'’&@-]*`;
const ATTRIBUTION_NAME_RE = new RegExp(
  String.raw`^${ATTRIBUTION_WORD}(?:\s+(?:${ATTRIBUTION_WORD}|and|of|the|và|từ|trên|thuộc|[/&])){0,6}$`,
  "u"
);
const AUTHOR_RE = new RegExp(
  String.raw`^${ATTRIBUTION_WORD}(?:\s+${ATTRIBUTION_WORD}){0,5}$`,
  "u"
);
const HANDLE_RE = /^@[\p{L}\p{N}_.@-]+$/u;

/** Outlets that Techmeme and the stored "Theo X." rows credit, taken from
 * production rows. A credit to an outlet missing here keeps its sentence,
 * which loses nothing. A publisher that is also the subject of claims (Apple,
 * OpenAI) does not belong here: "Tác giả Mỹ thuộc Apple." is a claim. */
const KNOWN_OUTLETS: ReadonlySet<string> = new Set([
  "AP",
  "Axios",
  "BBC",
  "Bloomberg",
  "Bloomberg Law",
  "Business Insider",
  "CBS News",
  "CNBC",
  "CNN",
  "Cointelegraph",
  "Command Line",
  "Daring Fireball",
  "Engadget",
  "Fierce Healthcare",
  "Financial Times",
  "Forbes",
  "Fortune",
  "Krebs on Security",
  "MacRumors",
  "MarkTechPost",
  "NBC News",
  "New York Times",
  "Nikkei Asia",
  "Politico",
  "Reuters",
  "Semafor",
  "SemiAnalysis",
  "Shtetl-Optimized",
  "TechCrunch",
  "Techmeme",
  "The Decoder",
  "The Information",
  "The New York Times",
  "The Verge",
  "The Wall Street Journal",
  "The Washington Post",
  "Time",
  "VentureBeat",
  "Wall Street Journal",
  "Washington Post",
  "Wired",
  "ZDNET",
]);

/** The domains a known outlet publishes on. A domain counts only when it is
 * listed here: "axios.js", "time.ly" and "commandline.dev" share a label with
 * an outlet but are not its site, and "x.com" or "me.com" name a product. */
const OUTLET_DOMAINS: ReadonlySet<string> = new Set([
  "apnews.com",
  "asia.nikkei.com",
  "axios.com",
  "bbc.co.uk",
  "bbc.com",
  "bloomberg.com",
  "bloomberglaw.com",
  "businessinsider.com",
  "cbsnews.com",
  "cnbc.com",
  "cnn.com",
  "cointelegraph.com",
  "daringfireball.net",
  "engadget.com",
  "fiercehealthcare.com",
  "forbes.com",
  "fortune.com",
  "ft.com",
  "krebsonsecurity.com",
  "macrumors.com",
  "marktechpost.com",
  "nbcnews.com",
  "nytimes.com",
  "politico.com",
  "reuters.com",
  "semafor.com",
  "semianalysis.com",
  "techcrunch.com",
  "techmeme.com",
  "the-decoder.com",
  "theinformation.com",
  "theverge.com",
  "time.com",
  "venturebeat.com",
  "washingtonpost.com",
  "wired.com",
  "wsj.com",
  "zdnet.com",
]);

/** "techcrunch.com", "www.theverge.com": a known outlet's own domain. */
function isOutletDomain(name: string): boolean {
  return OUTLET_DOMAINS.has(name.toLowerCase().replace(/^www\./, ""));
}

/** One source: a known outlet, an @handle, or an outlet's domain. */
function isSource(name: string): boolean {
  return (
    KNOWN_OUTLETS.has(name) || HANDLE_RE.test(name) || isOutletDomain(name)
  );
}

/** "Reuters và Bloomberg", "Bloomberg / Politico / New York Times": every
 * part is a source. */
function isSourceList(name: string): boolean {
  return name.split(/\s*\/\s*|\s+(?:và|and|&)\s+/u).every(isSource);
}

/** "Ina Fried / Axios", "Sarah Hilton từ Bloomberg", "Brian Krebs / Krebs on
 * Security": capitalised words, then sources. The author is never checked
 * against a list, so the sources after it carry the whole decision: "Elon
 * Musk / Tesla on Monday" and "Mỹ thuộc Nvidia" are claims. */
function isByline(name: string, joiners = true): boolean {
  const joiner = joiners
    ? String.raw`(?:\s*\/\s*|\s+(?:từ|trên|thuộc)\s+)`
    : String.raw`\s*\/\s*`;
  const match = new RegExp(`^(.+?)${joiner}(.+)$`, "u").exec(name);
  return match !== null && AUTHOR_RE.test(match[1]) && isSourceList(match[2]);
}

/** Each way a sentence opens a credit, and the bare name it accepts besides
 * a byline. */
const ATTRIBUTION_LEADS: readonly {
  lead: string;
  bare: (name: string) => boolean;
  joiners?: boolean;
}[] = [
  {
    lead: String.raw`(?:(?:[Tt]in|[Bb]ài)\s+)?[Tt]ừ|[Bb]ài viết (?:của|từ)|[Nn]guồn(?:\s+tin)?\s*:?|[Ff]rom|[Vv]ia|[Ss]ource\s*:?`,
    bare: (name) => ATTRIBUTION_NAME_RE.test(name) || isSourceList(name),
  },
  // "Theo" also cites a country or a ministry: "Theo Mỹ.", "Theo Trung Quốc.".
  { lead: "[Tt]heo|[Tt]hông tin từ", bare: isSourceList },
  // "By" also opens a deadline or an adverb: "By March.", "By @sama.".
  { lead: "[Bb]y", bare: (name) => KNOWN_OUTLETS.has(name) },
  // "Bởi" is also "because": "Bởi Time.", "Bởi CNBC thuộc NBC News." and
  // "Bởi Mỹ trên CNN." are claims. Only "author / outlet" counts as a byline.
  {
    lead: "[Bb]ởi",
    bare: (name) => HANDLE_RE.test(name) || isOutletDomain(name),
    joiners: false,
  },
  { lead: "[Tt]ác giả", bare: () => false },
];

/** A whole sentence that only names where the story came from: "Từ The
 * Information.", "Tin từ @openainewsroom.", "Theo Reuters.", "Nguồn: Axios.",
 * "From Bloomberg.", "Via @x.", "Source: X.", Techmeme's "By Ina Fried / Axios."
 * byline, or the same in parentheses. A sentence that carries a claim ("Theo
 * Reuters, Nvidia …") has more after the name, so it does not match. */
const ATTRIBUTION_SENTENCES = ATTRIBUTION_LEADS.map(
  ({ lead, bare, joiners }) => ({
    pattern: new RegExp(
      String.raw`^\(?\s*(?:${lead})\s+(.+?)\s*[.!]?\s*\)?\.?$`,
      "u"
    ),
    bare,
    joiners,
  })
);

function isAttributionSentence(sentence: string): boolean {
  return ATTRIBUTION_SENTENCES.some(({ pattern, bare, joiners }) => {
    const name = pattern.exec(sentence)?.[1];
    return name !== undefined && (bare(name) || isByline(name, joiners));
  });
}

/** The Techmeme "see the page" pointer, English or Vietnamese. */
const CONTEXT_LINK_SENTENCE_RE =
  /^(?:View the full context on|Xem [^.]{0,40}? trên) Techmeme\.?$/;

/** Drops trailing sentences that are only an attribution or a Techmeme
 * context pointer. Summaries from aggregators end "From Bloomberg. View the
 * full context on Techmeme."; the source already shows in the meta line. Only
 * the last sentence is judged, and only when nothing but the attribution is in
 * it, so "Theo Reuters, Nvidia …" and a mid-text "từ" stay. A summary that is
 * only attribution becomes "" and callers fall back to the headline. */
export function stripTrailingAttribution(text: string): string {
  const original = text.trimEnd();
  let out = original;
  for (;;) {
    const start = sentenceEnds(out).findLast((end) => end < out.length) ?? 0;
    const last = out.slice(start).trim();
    if (!isAttributionSentence(last) && !CONTEXT_LINK_SENTENCE_RE.test(last)) {
      return out === original ? text : out;
    }
    out = out.slice(0, start).trimEnd();
  }
}

/** Feed chrome that ingest leaves in some summaries: arXiv listing headers
 * and aggregator navigation ("← Back to live feed · 1 stories across 1
 * day") at the start, an "appeared first on" footer at the end. It is not
 * article text: it must not reach the stored English summary, the
 * translator, or any guard. */
export function stripSourceBoilerplate(text: string): string {
  return stripTrailingAttribution(
    stripFeedFooter(stripLeadingChrome(text))
      .replace(/^\s*arXiv:\S+\s+Announce Type:\s*\S+\s+Abstract:\s*/i, "")
      .replace(/^\s*See what[’']s happening and join the conversation\s*$/i, "")
  );
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
      !WHOLE_WORD_TERMS.has(term)
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
      (term) =>
        !hasWord(text, coreOfCompound(term), !WHOLE_WORD_TERMS.has(term))
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
    ...terms.jargon.map((t) =>
      t === "fine-tun" ? "fine-tune" : t === "red-team" ? "red-teaming" : t
    ),
  ];
}
