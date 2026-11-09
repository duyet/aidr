import { describe, expect, it } from "vitest";
import { landingFromUrl } from "./analytics/landing";
import {
  DAY_SHARE_LIMIT,
  dayShareText,
  STORY_POST_FORMATS,
  storyPostText,
  storyShareLink,
  storyShareText,
  trimToLength,
  X_POST_LIMIT,
} from "./share-text";

const item = {
  id: "abcdef1234567890",
  title: "OpenAI ships a new model",
  title_vi: "OpenAI ra mắt model mới",
};

const STORY_UTM =
  "utm_source=share&utm_medium=social&utm_campaign=story&utm_content=copy-abcdef12";
const DAY_UTM =
  "utm_source=share&utm_medium=social&utm_campaign=digest-2026-10-30";

describe("storyShareText", () => {
  it("gives the English title, then its English link", () => {
    expect(storyShareText(item, "en")).toBe(
      `OpenAI ships a new model\nhttps://aidr.today/abcdef12?lang=en&${STORY_UTM}`
    );
  });

  it("gives the Vietnamese title and a Vietnamese link on the VI page", () => {
    expect(storyShareText(item, "vi")).toBe(
      `OpenAI ra mắt model mới\nhttps://aidr.today/abcdef12?lang=vi&${STORY_UTM}`
    );
  });

  it("lands as the share channel, naming the copied story", () => {
    const url = new URL(storyShareText(item, "en").split("\n")[1]);
    expect(landingFromUrl(url.search, url.pathname)).toMatchObject({
      channel: "share",
      page_type: "story",
      utm_campaign: "story",
      utm_content: "copy-abcdef12",
    });
  });
});

describe("dayShareText", () => {
  const many = Array.from({ length: DAY_SHARE_LIMIT + 3 }, (_, i) => ({
    ...item,
    id: `${String(i).padStart(8, "0")}ffff`,
    title: `Story ${i + 1}`,
    title_vi: `Tin ${i + 1}`,
  }));

  it("lists the top stories numbered, then links the whole day", () => {
    const text = dayShareText("2026-10-30", many, "en");
    const blocks = text.split("\n\n");
    expect(blocks[0]).toMatch(/^Top AI stories, /);
    expect(blocks[1]).toBe(
      `1. Story 1\nhttps://aidr.today/00000000?lang=en&${DAY_UTM}&utm_content=list-00000000`
    );
    expect(blocks).toHaveLength(DAY_SHARE_LIMIT + 2);
    expect(text).not.toContain(`Story ${DAY_SHARE_LIMIT + 1}\n`);
    expect(blocks.at(-1)).toBe(
      `All stories: https://aidr.today/date/2026-10-30?lang=en&${DAY_UTM}&utm_content=all`
    );
  });

  it("is fully Vietnamese on the VI page", () => {
    const text = dayShareText("2026-10-30", many, "vi");
    expect(text).toMatch(/^Tin AI nổi bật, /);
    expect(text).toContain("1. Tin 1\nhttps://aidr.today/00000000?lang=vi&");
    expect(text).not.toContain("Story 1");
    expect(text).toContain(
      `Xem tất cả: https://aidr.today/date/2026-10-30?lang=vi&${DAY_UTM}&utm_content=all`
    );
  });
});

/**
 * The story page's "Copy for social" sheet. A reader pastes the post as is,
 * so it has to be in the page language, carry the AI;DR text when asked,
 * fit X when asked, and say in its link which format was pasted.
 */
describe("storyPostText", () => {
  const story = {
    ...item,
    summary: "OpenAI raised $11B.\n\nThe round values it at $1.25T.",
    summary_vi:
      "OpenAI gom được 11 tỷ USD.\n\nVòng này định giá 1,25 nghìn tỷ USD.",
  };
  const utm = (slot: string) =>
    `utm_source=share&utm_medium=social&utm_campaign=story&utm_content=${slot}-abcdef12`;

  it("writes title, AI;DR line and link in English", () => {
    expect(storyPostText(story, "en", "aidr")).toBe(
      "OpenAI ships a new model\n\n" +
        "AI;DR: OpenAI raised $11B. The round values it at $1.25T.\n\n" +
        `https://aidr.today/abcdef12?lang=en&${utm("aidr")}`
    );
  });

  it("writes the Vietnamese title and summary on the VI page", () => {
    expect(storyPostText(story, "vi", "aidr")).toBe(
      "OpenAI ra mắt model mới\n\n" +
        "AI;DR: OpenAI gom được 11 tỷ USD. Vòng này định giá 1,25 nghìn tỷ USD.\n\n" +
        `https://aidr.today/abcdef12?lang=vi&${utm("aidr")}`
    );
  });

  it("uses the English summary the VI page shows when there is no VI text", () => {
    const text = storyPostText({ ...story, summary_vi: "  " }, "vi", "aidr");
    expect(text).toContain("AI;DR: OpenAI raised $11B.");
  });

  it("falls back to title and link when there is no summary", () => {
    expect(
      storyPostText({ ...story, summary: null, summary_vi: null }, "en", "aidr")
    ).toBe(
      `OpenAI ships a new model\nhttps://aidr.today/abcdef12?lang=en&${utm("aidr")}`
    );
  });

  it("keeps the title + link format identical to the row copy button", () => {
    expect(storyPostText(story, "vi", "title")).toBe(
      storyShareText(story, "vi")
    );
  });

  it("trims a long Vietnamese title on a word so the X post fits 280", () => {
    const long = {
      ...story,
      title_vi: Array.from({ length: 60 }, () => "Tiêu đề rất dài").join(" "),
    };
    const post = storyPostText(long, "vi", "x");
    const [title, link] = post.split("\n");
    expect(Array.from(post).length).toBeLessThanOrEqual(X_POST_LIMIT);
    expect(title.endsWith("…")).toBe(true);
    expect(long.title_vi.startsWith(title.slice(0, -1))).toBe(true);
    expect(title.slice(0, -1).endsWith(" ")).toBe(false);
    expect(link).toBe(`https://aidr.today/abcdef12?lang=vi&${utm("x")}`);
  });

  it("leaves a short title whole on X", () => {
    expect(storyPostText(story, "en", "x")).toBe(
      `OpenAI ships a new model\nhttps://aidr.today/abcdef12?lang=en&${utm("x")}`
    );
  });

  it("tags a bare copied link as its own slot", () => {
    expect(storyShareLink(story, "en")).toBe(
      `https://aidr.today/abcdef12?lang=en&${utm("link")}`
    );
  });

  it("lands every format as the share channel with its slot", () => {
    const links = [
      ...STORY_POST_FORMATS.map((f) =>
        storyPostText(story, "en", f).split("\n").at(-1)
      ),
      storyShareLink(story, "en"),
    ];
    const slots = links.map((link) => {
      const url = new URL(link ?? "");
      return landingFromUrl(url.search, url.pathname)?.utm_content;
    });
    expect(slots).toEqual([
      "aidr-abcdef12",
      "copy-abcdef12",
      "x-abcdef12",
      "link-abcdef12",
    ]);
  });
});

describe("trimToLength", () => {
  it("returns short text unchanged and cuts long text with an ellipsis", () => {
    expect(trimToLength("short", 10)).toBe("short");
    expect(trimToLength("one two three four", 12)).toBe("one two…");
  });
});

describe("story style params", () => {
  it("omits font and fs at the defaults", () => {
    expect(storyShareLink(item, "en", { font: "sans", fontSize: 1 })).toContain(
      "https://aidr.today/abcdef12?lang=en&"
    );
    expect(
      storyShareLink(item, "en", { font: "sans", fontSize: 1 })
    ).not.toContain("font=");
    expect(
      storyShareLink(item, "en", { font: "sans", fontSize: 1 })
    ).not.toContain("fs=");
  });

  it("carries a serif face and larger text so the link keeps the style", () => {
    const link = storyShareLink(item, "en", { font: "serif", fontSize: 1.15 });
    expect(link).toContain("&font=serif");
    expect(link).toContain("&fs=1.15");
  });
});
