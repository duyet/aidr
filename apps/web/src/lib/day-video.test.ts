import { describe, expect, it } from "vitest";
import { isYoutubeId, parseYoutubeId, youtubeEmbedUrl } from "./day-video";

describe("parseYoutubeId", () => {
  it("accepts every link shape an operator pastes", () => {
    for (const input of [
      "B3vKYiV7rOw",
      "https://youtu.be/B3vKYiV7rOw",
      "https://youtu.be/B3vKYiV7rOw?si=abc",
      "youtu.be/B3vKYiV7rOw",
      "https://www.youtube.com/watch?v=B3vKYiV7rOw&t=10s",
      "https://m.youtube.com/watch?v=B3vKYiV7rOw",
      "https://www.youtube.com/embed/B3vKYiV7rOw",
      "https://www.youtube-nocookie.com/embed/B3vKYiV7rOw",
      "  https://youtube.com/watch?v=B3vKYiV7rOw  ",
    ]) {
      expect(parseYoutubeId(input), input).toBe("B3vKYiV7rOw");
    }
    expect(parseYoutubeId("https://youtube.com/shorts/fStNAQhJo3M")).toBe(
      "fStNAQhJo3M"
    );
  });

  it("rejects anything that is not exactly one 11-char id on a YouTube host", () => {
    // The id lands in an iframe src, so a lookalike host, a path trick or a
    // wrong-length id must never pass.
    for (const input of [
      "",
      "B3vKYiV7rO",
      "B3vKYiV7rOww",
      "B3vKYiV7r<w",
      "https://evil.example/watch?v=B3vKYiV7rOw",
      "https://youtube.com.evil.example/watch?v=B3vKYiV7rOw",
      "https://youtu.be/B3vKYiV7rOw/extra",
      "https://www.youtube.com/watch?v=short",
      "https://www.youtube.com/playlist?list=B3vKYiV7rOw",
      "javascript:alert(1)",
      "ftp://youtu.be/B3vKYiV7rOw",
    ]) {
      expect(parseYoutubeId(input), input).toBeNull();
    }
    expect(parseYoutubeId(42)).toBeNull();
    expect(isYoutubeId("B3vKYiV7rOw")).toBe(true);
  });

  it("embeds through the privacy-enhanced host", () => {
    expect(youtubeEmbedUrl("B3vKYiV7rOw")).toMatch(
      /^https:\/\/www\.youtube-nocookie\.com\/embed\/B3vKYiV7rOw\?/
    );
  });
});
