import { describe, expect, it } from "vitest";
import { FALLBACK_THEMES, fallbackTags } from "../tag-fallback.js";
import {
  isLearnableEntityTopic,
  isSpecificTrendingTopic,
} from "../topic-learning.js";

/** A slice of production `topics` (name → canonical), aliases included. */
const KNOWN = new Map<string, string>([
  ...[
    "amd",
    "samsung",
    "chips",
    "amazon",
    "google",
    "deepmind",
    "google-deepmind",
    "apple",
    "spacex",
    "palantir",
    "healthcare",
    "smartphone",
    "vietnam",
    "innovation",
    "robotics",
    "layoffs",
    "research",
    "agent",
    "data-center",
    "china",
    "trump",
    "cloud",
    "memory",
    "sales",
    "gpt",
    "uk",
    "ukraine",
    "world-labs",
  ].map((name) => [name, name] as const),
  ["aws", "amazon"],
  ["vit", "vit"],
  // Alias rows the mapping model wrote. A headline word is not this topic.
  ["model", "gpt"],
  ["autonomous-vehicles", "waymo"],
  ["waymo", "waymo"],
]);

const tags = (title: string, sourceId = "marketbrief", known = KNOWN) =>
  fallbackTags({ title, sourceId }, known);

describe("fallbackTags", () => {
  it("names the companies in a headline before its theme", () => {
    expect(tags("AMD CEO Lisa Su Meets Samsung Semiconductor Head")).toEqual([
      "amd",
      "samsung",
      "chips",
    ]);
  });

  it("names a country or lab Jev's lists lack", () => {
    // Each published untagged in the week to 2026-10-16 (#770).
    expect(
      tags("Baroness Campbell Uses AI Voice for first UK Parliament Speech")
    ).toEqual(["uk"]);
    expect(
      tags("Russian Bot Traffic Plummets After Ukraine Hits Yandex Data Hubs")
    ).toEqual(["ukraine"]);
  });

  // A wrong tag is worse than none: these words sit inside other names.
  it("does not tag a country or lab from a lookalike word", () => {
    expect(tags("Duke researchers publish a new benchmark")).toEqual([]);
    expect(tags("Real World Labs opens a new campus")).toEqual([]);
  });

  it("reads a company's other name and tags the company once", () => {
    expect(tags("Amazon moves AWS AI agents to Bedrock")).toEqual([
      "amazon",
      "agent",
    ]);
  });

  it("ignores alias rows in topics", () => {
    expect(tags("Autonomous Vehicles Log Record Miles")).toEqual([]);
  });

  it("prefers the longest name, so Google DeepMind is one tag", () => {
    expect(tags("Google DeepMind ships a weather model")).toEqual([
      "google-deepmind",
    ]);
  });

  it("strips a possessive", () => {
    expect(tags("Health Care Workers Are Tired of Palantir’s Mess")).toEqual([
      "palantir",
      "healthcare",
    ]);
  });

  it("tags Vietnamese headlines by their Latin names and Vietnamese words", () => {
    expect(
      tags(
        "Tính năng hút người dùng của dòng smartphone gập Samsung",
        "vnexpress-tech"
      )
    ).toEqual(["samsung", "smartphone"]);
    expect(
      tags(
        "Việt Nam tăng bậc Chỉ số đổi mới sáng tạo toàn cầu 2026",
        "vnexpress-tech"
      )
    ).toEqual(["innovation", "vietnam"]);
    // "Việt" loses its diacritics to "vit" under topic normalization. It is
    // never read as a name.
    expect(tags("Việt hóa phần mềm", "vnexpress-tech")).toEqual([]);
    expect(tags("Một số iPhone 18 Pro gặp lỗi âm thanh")).toEqual(["apple"]);
    expect(tags("Tên lửa Starship lần đầu bay lên quỹ đạo")).toEqual([
      "spacex",
    ]);
  });

  it("never reads a plain word as a name, even when it is a topic", () => {
    expect(tags("A Model For Cloud Memory Sales")).toEqual([]);
    expect(tags("an apple a day keeps samsung away")).toEqual([]);
  });

  it("leaves event promos and a passing word untagged", () => {
    expect(
      tags(
        "Affected by layoffs? Don’t miss this $75 deal for your TechCrunch Disrupt 2026 Expo+ Pass",
        "techcrunch-ai"
      )
    ).toEqual([]);
    expect(
      tags(
        "Last 24 hours: Exhibit at TechCrunch Disrupt 2026 and reach 10,000+ tech leaders",
        "techcrunch-ai"
      )
    ).toEqual([]);
    expect(tags("FICO Cuts 15% of Staff to Integrate AI")).toEqual(["layoffs"]);
  });

  it("returns only names topics holds as their own canonical", () => {
    // An unseen name would make normalizeTopics call the mapping model.
    const withoutSamsung = new Map(
      [...KNOWN].filter(([name]) => name !== "samsung")
    );
    expect(
      tags(
        "AMD CEO Lisa Su Meets Samsung Semiconductor Head",
        "x",
        withoutSamsung
      )
    ).toEqual(["amd", "chips"]);
    expect(tags("ChatGPT adds memory", "hn", new Map())).toEqual([]);
  });

  it("gives every paper its source's theme", () => {
    expect(
      tags(
        "Approximation Property of Dropout Neural Networks",
        "arxiv-research"
      )
    ).toEqual(["research"]);
  });

  it("keeps at most three tags", () => {
    expect(
      tags(
        "Trump, Samsung and AMD Back China Data Center Robots With AI Agents"
      )
    ).toEqual(["trump", "samsung", "amd"]);
  });

  it("names no theme that could become a highlight keyword or a chip", () => {
    // A week of innovation-festival stories must not put an "innovation"
    // chip on the homepage or highlight the word in every headline.
    for (const theme of FALLBACK_THEMES) {
      expect([theme, isLearnableEntityTopic(theme)]).toEqual([
        theme,
        theme === "vietnam",
      ]);
      expect([theme, isSpecificTrendingTopic(theme)]).toEqual([theme, false]);
    }
  });
});
