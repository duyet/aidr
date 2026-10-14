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

describe("decodeHtmlEntitiesOnce accented and symbol names", () => {
  // Stored techmeme summaries from production D1, 2026-10-08 and 2026-10-14.
  it.each([
    ["Gen&eacute; Teare / Crunchbase News", "Gené Teare / Crunchbase News"],
    [
      "By Camila Grigera Na&oacute;n / Fortune.",
      "By Camila Grigera Naón / Fortune.",
    ],
  ])("decodes %s", (raw, decoded) => {
    expect(decodeHtmlEntitiesOnce(raw)).toBe(decoded);
  });

  it("decodes named, decimal and hex forms of the same letter alike", () => {
    expect(
      decodeHtmlEntitiesOnce("Na&oacute;n Na&#243;n Na&#xF3;n Na&#xf3;n")
    ).toBe("Naón Naón Naón Naón");
  });

  it("is case-sensitive for letters, so &Oacute; and &oacute; differ", () => {
    expect(
      decodeHtmlEntitiesOnce("&Oacute;&oacute;&Aacute;&szlig;&ntilde;&OElig;")
    ).toBe("ÓóÁßñŒ");
  });

  it("decodes a double-encoded accent once, leaving the inner entity", () => {
    expect(decodeHtmlEntitiesOnce("Na&amp;oacute;n")).toBe("Na&oacute;n");
  });

  it("leaves text without entities byte-identical", () => {
    const plain = "Naón, Gené & Co: a < b > c; 100% – “ok” \u00a0 &";
    expect(decodeHtmlEntitiesOnce(plain)).toBe(plain);
  });

  it("keeps a literal ampersand that is not an entity", () => {
    for (const text of [
      "AT&T",
      "R&D; next",
      "a &b; c",
      "Q&A &",
      "x &#; y",
      "&;",
    ]) {
      expect(decodeHtmlEntitiesOnce(text)).toBe(text);
    }
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
