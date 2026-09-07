import { describe, expect, it } from "vitest";
import {
  collectBulletItemIds,
  extractBracketItemIds,
  parseStoredBullets,
  stripBracketItemIds,
} from "./tldr-bullets";

const ID = "925fd2fbf6741ab4d1fb9eb02c2fbbaa16a58a23dbd701d825c8b6754af525d3";

describe("extractBracketItemIds", () => {
  it("pulls trailing sha256 citations out of LLM prose", () => {
    expect(extractBracketItemIds(`OpenAI filed an EU report. [${ID}]`)).toEqual(
      [ID]
    );
  });

  it("keeps unique ids in appearance order", () => {
    expect(
      extractBracketItemIds(`[aaaa1111] then [${ID}] and [aaaa1111]`)
    ).toEqual(["aaaa1111", ID]);
  });
});

describe("stripBracketItemIds", () => {
  it("removes the citation so the digest does not paint the hash", () => {
    expect(stripBracketItemIds(`OpenAI filed an EU report. [${ID}]`)).toBe(
      "OpenAI filed an EU report."
    );
  });
});

describe("collectBulletItemIds", () => {
  it("accepts a string item_ids value the model sometimes returns", () => {
    expect(collectBulletItemIds({ item_ids: ID }, "text")).toEqual([ID]);
  });

  it("recovers ids from text when the JSON field is empty", () => {
    expect(collectBulletItemIds({ item_ids: [] }, `A story. [${ID}]`)).toEqual([
      ID,
    ]);
  });
});

describe("parseStoredBullets", () => {
  it("recovers empty item_ids from a trailing [hex] and strips it", () => {
    expect(
      parseStoredBullets([
        { text: `OpenAI filed an EU report. [${ID}]`, item_ids: [] },
      ])
    ).toEqual([{ text: "OpenAI filed an EU report.", item_ids: [ID] }]);
  });

  it("keeps a well-formed bullet unchanged", () => {
    expect(parseStoredBullets([{ text: "Hello", item_ids: ["abc"] }])).toEqual([
      { text: "Hello", item_ids: ["abc"] },
    ]);
  });
});
