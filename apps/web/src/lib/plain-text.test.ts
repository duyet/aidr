import { describe, expect, it } from "vitest";
import {
  cleanTitle,
  decodeHtmlEntitiesOnce,
  stripTitleMarker,
} from "./plain-text";

describe("decodeHtmlEntitiesOnce", () => {
  // Real titles from the-decoder, theverge-ai and techcrunch-ai (2026-10-01).
  it.each([
    ["OpenAI&#039;s new model", "OpenAI's new model"],
    ["Google&#8217;s Gemini", "Google’s Gemini"],
    ["Tools &amp; agents", "Tools & agents"],
    ["&quot;Agents&quot; are here", '"Agents" are here'],
    ["Caf&#xE9;", "Café"],
  ])("decodes %s", (raw, decoded) => {
    expect(decodeHtmlEntitiesOnce(raw)).toBe(decoded);
  });

  it("decodes one layer only, so an escaped entity stays readable text", () => {
    expect(decodeHtmlEntitiesOnce("R&amp;amp;D")).toBe("R&amp;D");
    expect(decodeHtmlEntitiesOnce("&amp;#039;")).toBe("&#039;");
  });

  it("yields plain text, never markup the decoder added", () => {
    // Sinks escape `<b>` again; the decoder must not drop or keep it encoded.
    expect(decodeHtmlEntitiesOnce("&lt;b&gt;bold&lt;/b&gt;")).toBe(
      "<b>bold</b>"
    );
  });

  it("leaves invalid code points and unknown names as written", () => {
    expect(decodeHtmlEntitiesOnce("&#xD800; &#99999999; &bogus;")).toBe(
      "&#xD800; &#99999999; &bogus;"
    );
  });
});

describe("stripTitleMarker", () => {
  it.each([
    ["UPDATE: DeepSeek V4 Pro ships", "DeepSeek V4 Pro ships"],
    ["Updated:  Gemini 4 lands", "Gemini 4 lands"],
    ["BREAKING: OpenAI raises", "OpenAI raises"],
    ["Cập nhật: Qwen3.8-27B chiếm ngôi đầu", "Qwen3.8-27B chiếm ngôi đầu"],
  ])("strips the wire marker from %s", (raw, clean) => {
    expect(stripTitleMarker(raw)).toBe(clean);
  });

  it("keeps headlines where the word is the story", () => {
    expect(stripTitleMarker("Update to Gemini fixes memory")).toBe(
      "Update to Gemini fixes memory"
    );
    expect(stripTitleMarker("UPDATE:")).toBe("UPDATE:");
  });
});

describe("cleanTitle", () => {
  it("decodes entities, then strips the marker", () => {
    expect(cleanTitle("UPDATE: Anthropic&#039;s plan")).toBe(
      "Anthropic's plan"
    );
  });
});
