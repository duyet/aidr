/**
 * Writes AIDRKitTests/Fixtures/golden.json: what the web's own topic color and
 * highlight functions return for the web test inputs and for every AI;DR bullet
 * in the saved feed fixture. The Swift ports must return the same thing.
 *
 * Rerun after changing the web helpers or the feed fixture:
 *   npx tsx apps/ios/scripts/make-golden.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  highlightTitle,
  setLearnedKeywords,
  tagsForHighlight,
} from "../../web/src/lib/highlight";
import { highlightKeywords } from "../../web/src/lib/keyword-highlight";
import {
  CATEGORY_NAMES,
  categoryColor,
  topicColor,
} from "../../web/src/lib/topic-color";

const fixtures = join(
  dirname(fileURLToPath(import.meta.url)),
  "../AIDRKitTests/Fixtures"
);
const feed = JSON.parse(readFileSync(join(fixtures, "feed.json"), "utf8"));
const items = feed.days.flatMap((d: { items: unknown[] }) => d.items) as Array<{
  id: string;
  tags: string[];
}>;
const tagsById = new Map(items.map((i) => [i.id, i.tags]));
const learned: string[] = feed.learnedKeywords;

const topicTags = [
  ...new Set([
    "GPT-5",
    " GPT-5 ",
    "anthropic",
    "ANTHROPIC",
    "  llm  ",
    "open-source",
    "robotics",
    "agents",
    "reasoning",
    "safety",
    "chips",
    "funding",
    "google",
    "meta",
    "research",
    "Gemini",
    "Đà Nẵng",
    "",
    "claude code",
    ...items.flatMap((i) => i.tags),
  ]),
];
const categories = [
  ...CATEGORY_NAMES,
  " research ",
  "uncategorized",
  "toString",
  "",
];

type TitleCase = {
  title: string;
  tags: string[];
  learned: string[];
  useFallback: boolean;
};
const titleCases: TitleCase[] = [
  {
    title: "Anthropic ships Claude 5",
    tags: [],
    learned: [],
    useFallback: false,
  },
  {
    title: "Anthropic ships Claude 5",
    tags: ["openai"],
    learned: [],
    useFallback: false,
  },
  {
    title: "Anthropic ships Claude 5",
    tags: ["anthropic"],
    learned: [],
    useFallback: false,
  },
  {
    title: "New open source model released",
    tags: ["open-source"],
    learned: [],
    useFallback: false,
  },
  {
    title: "Anthropic and OpenAI race on models",
    tags: ["anthropic", "openai"],
    learned: [],
    useFallback: false,
  },
  {
    title: "An open source release",
    tags: ["open", "open source"],
    learned: [],
    useFallback: false,
  },
  {
    title: "SpaceXAI Opens Grok Build to All",
    tags: ["SpaceX", "xAI", "Grok"],
    learned: [],
    useFallback: false,
  },
  {
    title: "New GPT-5.6 model announced",
    tags: ["GPT"],
    learned: [],
    useFallback: false,
  },
  {
    title: "Qwen3 tops the charts",
    tags: ["qwen"],
    learned: [],
    useFallback: false,
  },
  {
    title: "Alpha Beta Gamma Delta all launch today",
    tags: ["alpha", "beta", "gamma", "delta"],
    learned: [],
    useFallback: false,
  },
  { title: "", tags: ["anthropic"], learned: [], useFallback: false },
  {
    title: "New GPT-5 model announced",
    tags: ["GPT-5"],
    learned: [],
    useFallback: false,
  },
  {
    title: "Anthropic and OpenAI ship GPT-5.6 Sol",
    tags: [],
    learned: [],
    useFallback: true,
  },
  {
    title:
      "Nvidia announced a $442B one-day gain after OpenAI locked in a new chip deal. Claude and Gemini remain the other labs in the race.",
    tags: [],
    learned: [],
    useFallback: true,
  },
  {
    title: "Cursor and Windsurf race Fable",
    tags: [],
    learned: ["Fable", "Windsurf"],
    useFallback: true,
  },
];

const keywordCases: Array<{ text: string; tags: string[]; learned: string[] }> =
  [
    {
      text: "OpenAI gom được ~11 tỷ USD, định giá 1,25 nghìn tỷ USD, mục tiêu 30 tỷ USD.",
      tags: [],
      learned: [],
    },
    {
      text: "It raised $11B at a $1.25 trillion valuation, up 30%, 10x faster.",
      tags: [],
      learned: [],
    },
    { text: "Khoảng ~11 người, tăng 5 phần trăm", tags: [], learned: [] },
    {
      text: "In 2026 GPT-5 and Qwen3-235B beat Llama 3 on 8 tests, v1.2.",
      tags: [],
      learned: [],
    },
    {
      text: "See https://example.com/raise-30%25/$11B and www.x.com/11B now",
      tags: [],
      learned: [],
    },
    { text: "1% 2% 3% 4% 5% 6%", tags: [], learned: [] },
    { text: "11 tỷlệ", tags: [], learned: [] },
    { text: "11 tỷ đồng", tags: [], learned: [] },
    {
      text: "OpenAI và Anthropic gom được 11 tỷ USD",
      tags: ["anthropic"],
      learned: [],
    },
    { text: "New funding round for the lab", tags: ["funding"], learned: [] },
    { text: "Read https://openai.com/blog today", tags: [], learned: [] },
    {
      text: "Theo WSJ, OpenAI đạt ~11 tỷ USD (30%) tại https://x.com/a/11B.",
      tags: ["openai"],
      learned: [],
    },
  ];
for (const lang of ["en", "vi"] as const) {
  for (const b of feed.tldr[`bullets_${lang}`] as Array<{
    text: string;
    item_ids: string[];
  }>) {
    const tags = b.item_ids.flatMap((id) => tagsById.get(id) ?? []);
    keywordCases.push({ text: b.text, tags, learned });
  }
}

const golden = {
  topicColor: topicTags.map((tag) => ({ tag, ...topicColor(tag) })),
  categoryColor: categories.map((name) => ({ name, ...categoryColor(name) })),
  highlightTitle: titleCases.map((c) => {
    setLearnedKeywords(c.learned);
    const tags = c.useFallback ? tagsForHighlight(c.tags) : c.tags;
    return { ...c, segments: highlightTitle(c.title, tags) };
  }),
  highlightKeywords: keywordCases.map((c) => {
    setLearnedKeywords(c.learned);
    return { ...c, segments: highlightKeywords(c.text, c.tags) };
  }),
};
writeFileSync(
  join(fixtures, "golden.json"),
  `${JSON.stringify(golden, null, 1)}\n`
);
console.log(
  `golden.json: ${golden.topicColor.length} topic colors, ${golden.highlightTitle.length} title cases, ${golden.highlightKeywords.length} keyword cases`
);
