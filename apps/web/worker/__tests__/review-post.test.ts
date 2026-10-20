import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  autoChecks,
  type PostInput,
  RUBRIC,
  rebuildFacebookStoryPost,
  rebuildTelegramStory,
  scorePosts,
  visibleText,
} from "../../scripts/review/post";
import { buildStoryCaption } from "../notify/telegram";
import type { StoryPayload } from "../notify/types";

const fixture = (name: string): PostInput =>
  JSON.parse(
    readFileSync(
      new URL(`../../scripts/review/fixtures/${name}`, import.meta.url),
      "utf8"
    )
  ) as PostInput;

const good = fixture("post-good.json");
const bad = fixture("post-bad.json");

/** The bad fixture's post whose id starts with `prefix`, scored alone. */
const only = (prefix: string): PostInput => ({
  date: bad.date,
  posts: bad.posts.filter((p) => p.id.startsWith(prefix)),
});

describe("post review rubric", () => {
  it("sums to 10 and ships at 8", () => {
    expect(RUBRIC.reduce((sum, row) => sum + row.points, 0)).toBe(10);
    expect(RUBRIC.filter((row) => !row.auto).map((row) => row.id)).toEqual([
      "hook_news",
      "vi_natural",
    ]);
  });

  it("passes every automatic row on a real edition", () => {
    const report = scorePosts(good);
    expect(report.lost).toBe(0);
    expect(report.earned).toBe(8);
    expect(good.posts.map((p) => p.channel).sort()).toEqual(
      [
        "facebook-en",
        "facebook-en",
        "telegram",
        "telegram",
        "telegram-en",
        "telegram-en",
      ].sort()
    );
  });

  it("scores nothing as a pass when there are no posts", () => {
    const result = autoChecks({ date: good.date, posts: [] });
    for (const reasons of Object.values(result)) expect(reasons.length).toBe(1);
  });
});

describe("post review automatic rows fail on a bad post and name it", () => {
  it("caption_cap: a photo caption over 1024 visible characters", () => {
    const [reason] = autoChecks(only("ca90")).caption_cap;
    expect(reason).toContain("telegram-en ca900001");
    expect(reason).toMatch(/cap 1024/);
  });

  it("caption_cap counts visible characters, not tags or entities", () => {
    expect(visibleText("<b>a &amp; b</b> &lt;x&gt;")).toBe("a & b <x>");
  });

  it("headline_repeat: a summary line equal to the headline", () => {
    const [reason] = autoChecks(only("de90")).headline_repeat.filter((r) =>
      r.includes("de900002")
    );
    expect(reason).toMatch(/summary is the headline/);
  });

  it("headline_repeat: a lead clause that restates the headline", () => {
    const [reason] = autoChecks(only("de900003")).headline_repeat;
    expect(reason).toContain("de900003");
    expect(reason).toMatch(/restates/);
  });

  it("utm: a link with no utm params", () => {
    const reasons = autoChecks(only("07900004")).utm;
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.join("\n")).toMatch(/utm_source missing/);
  });

  it("utm: a Telegram post tagged for Facebook", () => {
    const reasons = autoChecks(only("07900005")).utm;
    expect(reasons.join("\n")).toMatch(/utm_source facebook, want telegram/);
  });

  it("image: no image and no fallback", () => {
    const [reason] = autoChecks(only("13900006")).image;
    expect(reason).toContain("13900006");
    expect(reason).toMatch(/no image and no preview fallback/);
  });

  it("image: the first-party share card is not a story photo", () => {
    const [reason] = autoChecks(only("13900007")).image;
    expect(reason).toMatch(/image:first_party_card/);
  });

  it("hashtags: a caption with no category line", () => {
    const [reason] = autoChecks(only("ba900008")).hashtags;
    expect(reason).toMatch(/no #category line/);
  });

  it("hashtags: a malformed category line", () => {
    const [reason] = autoChecks(only("ba900009")).hashtags;
    expect(reason).toMatch(/malformed category line/);
  });

  it("postability: a story the send gate refuses", () => {
    const [reason] = autoChecks(only("90900010")).postability;
    expect(reason).toContain("gate:chrome");
  });

  it("postability: a summary too short to post", () => {
    const [reason] = autoChecks(only("90900011")).postability;
    expect(reason).toMatch(/short/);
  });

  it("postability: a digest bullet that is page chrome", () => {
    const digest = bad.posts.filter((p) => p.kind === "digest");
    const reasons = autoChecks({ date: bad.date, posts: digest }).postability;
    expect(reasons[0]).toMatch(/bullet 3 carries source-page chrome/);
  });

  it("a row loses its points only on its own defect", () => {
    const report = scorePosts(only("ba900008"));
    const byId = Object.fromEntries(report.rows.map((r) => [r.id, r.result]));
    expect(byId.hashtags).toBe("FAIL");
    expect(byId.caption_cap).toBe("PASS");
    expect(byId.utm).toBe("PASS");
  });
});

describe("rebuilt posts come from the real builders", () => {
  const story: StoryPayload = {
    id: "9b955ce8af2763d0",
    url: "https://example.com/story",
    title: "Meta delays its next Llama model",
    summary:
      "Meta said its next Llama model will ship later than planned because quality is below its internal bar. The company gave no new date.",
    image_url: "https://example.com/llama.jpg",
    media_manifest: null,
    category: "models",
    points: 120,
    comments: 12,
    rank_score: 1,
    llm_importance: null,
    lang: "en",
  };

  it("a Telegram story post is the builder's caption and passes", () => {
    const post = rebuildTelegramStory("en", story, { ok: true });
    expect(post.text).toBe(buildStoryCaption(story));
    expect(post.form).toBe("photo");
    expect(post.links[0]).toContain("utm_source=telegram");
    const result = autoChecks({ date: "2026-10-21", posts: [post] });
    expect(Object.values(result).flat()).toEqual([]);
  });

  it("a stored caption is scored in place of the rebuilt one", () => {
    const stored = `${buildStoryCaption(story)}${"x".repeat(1100)}`;
    const post = rebuildTelegramStory(
      "en",
      story,
      { ok: true },
      {
        kind: "photo",
        caption: stored,
      }
    );
    expect(post.source).toBe("stored");
    expect(
      autoChecks({ date: "2026-10-21", posts: [post] }).caption_cap
    ).toHaveLength(1);
  });

  it("a Facebook story post links the story page with facebook utm", () => {
    const post = rebuildFacebookStoryPost(story, { ok: true });
    expect(post.links[0]).toContain("utm_source=facebook");
    expect(post.text.split("\n\n")[0]).toBe(story.title);
    expect(autoChecks({ date: "2026-10-21", posts: [post] }).utm).toEqual([]);
  });

  it("a Facebook message that opens with the headline again fails headline_repeat", () => {
    const post = rebuildFacebookStoryPost(
      { ...story, summary: `${story.title}. ${story.summary}` },
      { ok: true }
    );
    expect(
      autoChecks({ date: "2026-10-21", posts: [post] }).headline_repeat
    ).not.toEqual([]);
  });
});
