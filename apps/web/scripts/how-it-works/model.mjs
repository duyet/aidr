// Ported from apps/web/worker/ranking.ts (constants as of #602), plus the schedule
// numbers from ingest-schedule.ts, llm.ts, tldr.ts, notify/index.ts, subscribe/send.ts.
export const RUN_EVERY_H = 0.5;
export const COALESCE_MIN = 25;
export const SCORE_BATCH = 5;
export const TLDR_MAX = 16;
export const TLDR_WINDOW_H = 24;
export const TLDR_REFRESH_H = 3;
export const EMAIL_HOUR = 7;
export const NOTIFY_HOUR = 8;
export const TELEGRAM_BULLETS = 8;
export const START_HOUR = 5;

export function rankScore({
  importance,
  quality,
  points,
  comments,
  sources,
  votes,
  age,
}) {
  if (age < 0) return 0;
  let decay = Math.exp(-age / 36);
  if (age > 24) decay *= Math.exp(-(age - 24) / 24);
  let engagement = 1 + Math.log10(1 + points + 0.5 * comments);
  if (importance < 4) engagement = Math.min(engagement, 1.3);
  const boost = 1 + 0.12 * (Math.min(Math.max(sources, 1), 8) - 1);
  const crowd = Math.min(engagement * boost, 3.25);
  const steps = 0.2 * Math.min(6, Math.abs(votes));
  const vote = votes >= 0 ? 1 + steps : 1 / (1 + steps);
  const weight = importance ** 1.5 / Math.sqrt(10);
  const breaking = importance >= 8 ? 1 + 0.4 * Math.exp(-age / 3) : 1;
  return (
    weight * (0.6 + (0.4 * quality) / 10) * decay * crowd * vote * breaking
  );
}

// Thirty sample stories over 30 hours. born = hours after the clock starts (negative = already out).
export const STORIES = [
  ["Lab ships an open-weight reasoning model", 9, 8, 820, 410, 5, 3, -3],
  ["Agent framework hits 1.0", 7, 7, 260, 120, 2, 1, -6],
  ["Chip export rules tightened", 8, 7, 140, 90, 4, 0, -10],
  ["Benchmark exposes eval leakage", 6, 8, 310, 200, 1, 2, -1.5],
  ["Coding assistant adds background tasks", 7, 6, 90, 40, 3, 0, -4],
  ["Video model doubles clip length", 7, 7, 400, 150, 3, 0, -14],
  ["Small model beats last year's flagship", 6, 7, 180, 60, 2, 0, -8],
  ["Inference prices cut by half", 8, 6, 520, 300, 6, 1, -20],
  ["Open dataset of code reviews", 5, 7, 70, 20, 1, 0, -2],
  ["Robotics lab shows household demo", 6, 6, 210, 130, 2, 0, -18],
  ["Paper: long context without attention", 6, 9, 150, 45, 1, 0, -12],
  ["Voice mode rolls out to all users", 7, 6, 60, 30, 4, 0, -16],
  ["Startup raises for GPU cloud", 4, 5, 40, 25, 2, 0, -5],
  ["Safety team publishes red-team report", 6, 8, 95, 70, 2, 0, -22],
  ["Browser gets built-in local model", 7, 7, 330, 260, 3, 0, 2],
  ["Image model watermark broken", 5, 6, 120, 80, 1, -1, -9],
  ["Weekly roundup newsletter", 3, 5, 600, 400, 1, 0, -3],
  ["Frontier model update announced", 9, 8, 950, 600, 7, 2, 7],
  ["Translation model for 200 languages", 6, 7, 80, 30, 2, 0, 11],
  ["Data center power deal signed", 5, 6, 50, 40, 3, 0, 15],
  ["Agent benchmark adds real repos", 6, 8, 240, 110, 2, 1, 18],
  ["Open model tops the coding leaderboard", 8, 7, 700, 380, 5, 2, 20],
  ["Regulator opens AI pricing inquiry", 7, 6, 120, 140, 4, 0, 21],
  ["New tokenizer halves context cost", 6, 8, 160, 50, 1, 0, 22.5],
  ["Speech model runs on a phone", 6, 7, 210, 90, 2, 0, 23.5],
  ["Lab publishes interpretability atlas", 7, 9, 380, 120, 3, 1, 25],
  ["Cloud outage hits model APIs", 7, 5, 900, 500, 6, -1, 26],
  ["Robot hand learns from video", 6, 7, 140, 60, 2, 0, 27.5],
  ["IDE ships agent mode to everyone", 7, 6, 300, 220, 3, 0, 28.5],
  ["Paper: scaling laws for retrieval", 5, 8, 90, 30, 1, 0, 29.5],
].map(
  ([title, importance, quality, points, comments, sources, votes, born]) => ({
    title,
    importance,
    quality,
    points,
    comments,
    sources,
    votes,
    born,
  })
);

// The rack at clock time t (its first twenty rows) (hours since START_HOUR): in-window stories by score,
// then aged-out ones; not-yet-published stories are absent.
export function board(t) {
  const live = STORIES.map((s, id) => ({ id, age: t - s.born, s }))
    .filter((r) => r.age >= 0)
    .map((r) => ({
      ...r,
      score: rankScore({ ...r.s, age: r.age }),
      inWindow: r.age <= TLDR_WINDOW_H,
    }));
  const inside = live
    .filter((r) => r.inWindow)
    .sort((a, b) => b.score - a.score);
  const out = live.filter((r) => !r.inWindow).sort((a, b) => b.score - a.score);
  // aged-out rows start after the gate, so every bar left of it is in the TL;DR
  const gate = Math.max(inside.length, TLDR_MAX);
  return [
    ...inside.map((r, i) => ({ ...r, slot: i })),
    ...out.map((r, i) => ({ ...r, slot: gate + i })),
  ].filter((r) => r.slot < 20);
}

// The next stories still on the belt: published after t, in arrival order.
export const upcoming = (t) =>
  STORIES.filter((s) => s.born > t).sort((a, b) => a.born - b.born);

// Example raw input (source, headline as fetched) and the TL;DR line it becomes. All illustrative.
export const EXAMPLES = [
  [
    "Hacker News",
    "Show HN: we open-sourced our 70B reasoning model (Apache-2.0)",
    "A lab released an open-weight 70B reasoning model under Apache-2.0, with weights and eval code public.",
  ],
  [
    "Lobsters",
    "agentkit 1.0 released",
    "The agentkit framework reached 1.0, freezing its tool-calling API after a year of betas.",
  ],
  [
    "RSS · policy wire",
    "Commerce Dept. updates advanced-chip export controls",
    "New export rules extend limits on advanced AI chips to more countries and cloud resellers.",
  ],
  [
    "Hacker News",
    "Paper: popular benchmark leaks into training sets",
    "Researchers found a widely used benchmark inside common training sets, inflating reported scores.",
  ],
  [
    "RSS · vendor blog",
    "Introducing background tasks in our coding assistant",
    "A coding assistant can now run long tasks in the background and report back when done.",
  ],
  [
    "MarketBrief",
    "Video model now makes 2-minute clips",
    "A video model doubled its maximum clip length to two minutes with steadier motion.",
  ],
  [
    "HuggingNews",
    "8B model matches last year's flagship on reasoning evals",
    "An 8B model matched last year's flagship on reasoning benchmarks at a fraction of the cost.",
  ],
  [
    "Hacker News",
    "API prices cut 50% across all models",
    "A major provider halved API prices across its model line, effective immediately.",
  ],
  [
    "RSS · dataset",
    "Releasing 2M human code reviews as an open dataset",
    "An open dataset of two million human code reviews was published for training reviewers.",
  ],
  [
    "Lobsters",
    "Household robot demo: laundry, dishes, tidy-up",
    "A robotics lab showed a robot folding laundry and loading dishes in a real home.",
  ],
  [
    "RSS · arXiv digest",
    "Long context without attention: a state-space approach",
    "A paper reports long-context performance from a state-space model without attention layers.",
  ],
  [
    "RSS · product blog",
    "Voice mode is now available to everyone",
    "Voice mode rolled out to all users, including the free tier.",
  ],
  [
    "MarketBrief",
    "GPU cloud startup raises Series B",
    "A GPU cloud startup raised a Series B to add capacity in three regions.",
  ],
  [
    "RSS · safety blog",
    "Our red-team report for the new model",
    "A safety team published its red-team findings and the mitigations shipped with a new model.",
  ],
  [
    "Hacker News",
    "Browser ships a built-in local model API",
    "A browser now ships an on-device model that web pages can call without a server.",
  ],
  [
    "Hacker News",
    "Image watermark scheme broken in a weekend",
    "Researchers removed an image model's watermark with simple edits, questioning its use for provenance.",
  ],
  [
    "RSS · newsletter",
    "This week in AI #212",
    "A weekly newsletter rounded up the week's model releases and funding.",
  ],
  [
    "Anthropic / OpenAI / Google newsroom",
    "Announcing our next frontier model update",
    "A frontier lab announced a model update with better coding and longer context, rolling out today.",
  ],
  [
    "HuggingNews",
    "One translation model for 200 languages",
    "A single translation model now covers 200 languages, including many low-resource ones.",
  ],
  [
    "MarketBrief",
    "Hyperscaler signs nuclear power deal for data centers",
    "A hyperscaler signed a long-term nuclear power deal to supply new AI data centers.",
  ],
  [
    "Hacker News",
    "New agent benchmark built from real GitHub repos",
    "A new benchmark tests coding agents on tasks taken from real open-source repositories.",
  ],
  [
    "Hacker News",
    "Open model takes #1 on the coding leaderboard",
    "An open-weight model took first place on a public coding leaderboard.",
  ],
  [
    "RSS · policy wire",
    "Regulator opens inquiry into AI model pricing",
    "A competition regulator opened an inquiry into how AI model access is priced.",
  ],
  [
    "RSS · arXiv digest",
    "A tokenizer that halves context cost",
    "A new tokenizer cuts token counts roughly in half for code and multilingual text.",
  ],
  [
    "HuggingNews",
    "Speech recognition fully on-device on a phone",
    "A speech model now runs fully on a phone with near-server accuracy.",
  ],
  [
    "RSS · research blog",
    "An interpretability atlas of a production model",
    "A lab published an atlas of features found inside one of its production models.",
  ],
  [
    "Hacker News",
    "Outage: major model APIs down for 3 hours",
    "A cloud outage took several model APIs offline for about three hours.",
  ],
  [
    "RSS · research blog",
    "Robot hand learns grasping from human video",
    "A robot hand learned to grasp new objects from human video alone.",
  ],
  [
    "RSS · vendor blog",
    "Agent mode now on for every IDE user",
    "An IDE turned on its agent mode for every user after a long preview.",
  ],
  [
    "RSS · arXiv digest",
    "Scaling laws for retrieval-augmented models",
    "A paper fits scaling laws for retrieval, showing when more documents beat a bigger model.",
  ],
];
