/**
 * What a stored inbound email becomes. The `aidr-email` Worker (apps/email)
 * already split the user's own text from quoted mail, extracted links and
 * found the story reference; this decides the outcome by fixed rules (see
 * docs/decisions/email-contributions.md, "Message types"). No model reads
 * the text here.
 */

export interface InboundFields {
  subject: string;
  ownText: string;
  /** Story links in the user's own text. */
  links: string[];
  /** Story links in a forwarded message's quoted part. */
  forwardedLinks: string[];
  isForward: boolean;
  isReply: boolean;
  storyRef: string | null;
  storyLang: "vi" | "en" | null;
}

export type EmailIntent =
  | { kind: "submission"; url: string; title: string; note: string }
  | {
      kind: "suggestion";
      field: "title" | "summary" | "auto";
      text: string;
    }
  | { kind: "comment"; text: string };

/** Notes and one-link messages: at most this much text besides the link. */
const MAX_LINK_NOTE_CHARS = 280;

/** Subject without reply/forward prefixes and our marker. */
export function cleanSubject(subject: string): string {
  let out = subject.replace(/\[aidr:[^\]]*\]/gi, "");
  for (let i = 0; i < 5; i++) {
    const next = out.replace(
      /^\s*(re|fwd?|tr|wg|aw|rv|sv|chuyển tiếp)\s*:\s*/i,
      ""
    );
    if (next === out) break;
    out = next;
  }
  return out.trim();
}

/** `title: …` / `summary: …` (or the Vietnamese labels) on the first line. */
export function parseFieldEdit(
  text: string
): { field: "title" | "summary"; text: string } | null {
  const match = text.match(
    /^\s*(title|summary|tiêu đề|tóm tắt)\s*:\s*([\s\S]+)$/i
  );
  if (!match) return null;
  const value = match[2].trim();
  if (!value) return null;
  const label = match[1].toLowerCase();
  return {
    field: label === "title" || label === "tiêu đề" ? "title" : "summary",
    text: value,
  };
}

function withoutLinks(text: string): string {
  return text.replace(/https?:\/\/\S+/g, "").trim();
}

export function classifyInbound(fields: InboundFields): EmailIntent {
  const own = fields.ownText.trim();

  if (fields.storyRef && own) {
    const edit = parseFieldEdit(own);
    return edit
      ? { kind: "suggestion", field: edit.field, text: edit.text }
      : { kind: "suggestion", field: "auto", text: own };
  }

  if (!fields.storyRef && fields.isForward) {
    const links =
      fields.links.length > 0 ? fields.links : fields.forwardedLinks;
    if (links.length === 1) {
      return {
        kind: "submission",
        url: links[0],
        title: cleanSubject(fields.subject),
        note: own,
      };
    }
  }

  // A new message (not a reply) whose only content is one link. A reply
  // with a link is an opinion about our mail, so it stays a comment.
  if (!fields.storyRef && !fields.isForward && !fields.isReply) {
    const note = withoutLinks(own);
    if (fields.links.length === 1 && note.length <= MAX_LINK_NOTE_CHARS) {
      return {
        kind: "submission",
        url: fields.links[0],
        title: cleanSubject(fields.subject),
        note,
      };
    }
  }

  // Only the user's own words are kept; for an ambiguous forward, its links.
  return {
    kind: "comment",
    text: own || fields.forwardedLinks.join("\n"),
  };
}
