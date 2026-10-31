import { describe, expect, it } from "vitest";
import { DAY_SHARE_LIMIT, dayShareText, storyShareText } from "./share-text";

const item = {
  id: "abcdef1234567890",
  title: "OpenAI ships a new model",
  title_vi: "OpenAI ra mắt model mới",
};

describe("storyShareText", () => {
  it("gives the English title, then its English link", () => {
    expect(storyShareText(item, "en")).toBe(
      "OpenAI ships a new model\nhttps://aidr.today/abcdef12?lang=en"
    );
  });

  it("gives the Vietnamese title and a Vietnamese link on the VI page", () => {
    expect(storyShareText(item, "vi")).toBe(
      "OpenAI ra mắt model mới\nhttps://aidr.today/abcdef12?lang=vi"
    );
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
    expect(blocks[1]).toBe("1. Story 1\nhttps://aidr.today/00000000?lang=en");
    expect(blocks).toHaveLength(DAY_SHARE_LIMIT + 2);
    expect(text).not.toContain(`Story ${DAY_SHARE_LIMIT + 1}\n`);
    expect(blocks.at(-1)).toBe(
      "All stories: https://aidr.today/date/2026-10-30?lang=en"
    );
  });

  it("is fully Vietnamese on the VI page", () => {
    const text = dayShareText("2026-10-30", many, "vi");
    expect(text).toMatch(/^Tin AI nổi bật, /);
    expect(text).toContain("1. Tin 1\nhttps://aidr.today/00000000?lang=vi");
    expect(text).not.toContain("Story 1");
    expect(text).toContain(
      "Xem tất cả: https://aidr.today/date/2026-10-30?lang=vi"
    );
  });
});
