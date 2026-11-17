import type { CSSProperties, ReactElement } from "react";
import { highlightKeywords } from "../lib/keyword-highlight";
import { topicStyle } from "../lib/topic";
import { topicColor } from "../lib/topic-color";

const KIND_CLASS = { num: "kw-num", entity: "kw-entity" } as const;

function keywordStyle(word: string): CSSProperties {
  const color = topicColor(word.trim().toLowerCase());
  return {
    "--tc-light": color.light,
    "--tc-dark": color.dark,
  } as CSSProperties;
}

/** Titles, AI;DR bullets and summaries with the key words picked out
 * (DESIGN.md "Keyword highlights"), the same on the feed, the digest, the
 * calendar and the story page. Plain text only, never HTML, so a summary
 * cannot inject markup.
 *
 * Default: `.kw-num` / `.kw-entity` spans. With `ink`, every key word is a
 * `.topic-ink` span in `category`'s color, so the reader's highlight pref
 * (topic, one color, off) applies. */
export function KeywordText({
  text,
  tags,
  ink = false,
  category,
  varied = false,
}: {
  text: string;
  tags: string[];
  ink?: boolean;
  category?: string | null;
  /** Each key word takes its own hue, so keywords differ from each other and
   * from the topic color. Implies `ink`. */
  varied?: boolean;
}): ReactElement {
  const style = ink ? topicStyle(category) : undefined;
  return (
    <>
      {highlightKeywords(text, tags).map((s, i) =>
        s.kind ? (
          <span
            key={i}
            className={
              ink || varied ? "topic-ink font-semibold" : KIND_CLASS[s.kind]
            }
            style={varied ? keywordStyle(s.text) : style}
          >
            {s.text}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </>
  );
}
