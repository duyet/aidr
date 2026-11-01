import type { ReactElement } from "react";
import { highlightKeywords } from "../../lib/keyword-highlight";

const KIND_CLASS = { num: "kw-num", entity: "kw-entity" } as const;

/** Story-page text with `.kw-num` / `.kw-entity` spans. Plain text only,
 * never HTML, so a summary cannot inject markup. */
export function KeywordText({
  text,
  tags,
}: {
  text: string;
  tags: string[];
}): ReactElement {
  return (
    <>
      {highlightKeywords(text, tags).map((s, i) =>
        s.kind ? (
          <span key={i} className={KIND_CLASS[s.kind]}>
            {s.text}
          </span>
        ) : (
          <span key={i}>{s.text}</span>
        )
      )}
    </>
  );
}
