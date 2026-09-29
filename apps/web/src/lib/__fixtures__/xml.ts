/**
 * Test-only strict XML well-formedness checks for the generated syndication
 * documents (`/feed.xml`, `/sitemap.xml` and its children, `/news.xml`).
 *
 * These documents are read by third parties with a real XML parser, and a
 * single unescaped `&` in a publisher headline makes the whole file — and
 * every URL in it — unparseable. `DOMParser` is deliberately not used as the
 * only gate: happy-dom's XML mode accepts a raw `&` in character data, which
 * is exactly the bug class these documents must not have.
 *
 * `xmllint --noout` is run as well whenever the binary is available, so the
 * local/CI run agrees with what a feed validator would say.
 */
import { execFileSync } from "node:child_process";

/** XML 1.0 name production, restricted to what these documents use. */
const NAME_RE = /^[A-Za-z_][\w.-]*(?::[A-Za-z_][\w.-]*)?$/;
const ENTITY_RE = /^&(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9A-Fa-f]+);/;

export interface XmlProblem {
  offset: number;
  message: string;
}

/**
 * Scan for the well-formedness errors a lenient parser would let through:
 * unbalanced tags, unquoted attributes, a raw `&` that is not an entity, a
 * `<` in character data, and characters XML 1.0 forbids.
 */
export function findXmlProblems(xml: string): XmlProblem[] {
  const problems: XmlProblem[] = [];
  const stack: string[] = [];
  let index = 0;

  // The rule under test, so matching these characters is the whole point.
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rule under test
  const illegal = /[\u0000-\u0008\u000B\u000C\u000E-\u001F]/;
  while (index < xml.length) {
    const char = xml[index] ?? "";
    if (illegal.test(char)) {
      problems.push({ offset: index, message: `illegal XML 1.0 character` });
    }
    if (char !== "<") {
      if (char === "&") {
        const entity = /^&[^;\s<]{0,32};?/.exec(xml.slice(index))?.[0] ?? "";
        if (!ENTITY_RE.test(entity)) {
          problems.push({
            offset: index,
            message: `unescaped & in character data`,
          });
        }
        index += entity.length || 1;
        continue;
      }
      index += 1;
      continue;
    }

    if (xml.startsWith("<!--", index)) {
      const end = xml.indexOf("-->", index);
      if (end < 0) {
        problems.push({ offset: index, message: "unterminated comment" });
        break;
      }
      index = end + 3;
      continue;
    }
    if (xml.startsWith("<?", index)) {
      const end = xml.indexOf("?>", index);
      if (end < 0) {
        problems.push({
          offset: index,
          message: "unterminated processing instruction",
        });
        break;
      }
      index = end + 2;
      continue;
    }

    const end = findTagEnd(xml, index);
    if (end < 0) {
      problems.push({ offset: index, message: "unterminated tag" });
      break;
    }
    const raw = xml.slice(index + 1, end).trim();
    if (raw.startsWith("/")) {
      const name = raw.slice(1).trim();
      const open = stack.pop();
      if (open !== name) {
        problems.push({
          offset: index,
          message: `closing </${name}> does not match <${open ?? "nothing"}>`,
        });
      }
      index = end + 1;
      continue;
    }
    if (raw.endsWith("/")) {
      // Self-closing: attributes still have to be well quoted.
      checkAttributes(raw.slice(0, -1).trim(), index, problems);
      index = end + 1;
      continue;
    }
    const name = /^([^\s/>]+)/.exec(raw)?.[1] ?? "";
    if (!NAME_RE.test(name)) {
      problems.push({
        offset: index,
        message: `invalid element name "${name}"`,
      });
    }
    checkAttributes(raw.slice(name.length), index, problems);
    stack.push(name);
    index = end + 1;
  }

  for (const name of stack) {
    problems.push({ offset: xml.length, message: `unclosed <${name}>` });
  }
  return problems;
}

/** A `>` inside a quoted attribute value does not close the tag. */
function findTagEnd(xml: string, start: number): number {
  let quote: string | null = null;
  for (let i = start + 1; i < xml.length; i += 1) {
    const char = xml[i];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === ">") return i;
    if (char === "<") return -1;
  }
  return -1;
}

function checkAttributes(
  input: string,
  offset: number,
  problems: XmlProblem[]
): void {
  const attrRe = /([^\s=/>]+)\s*(=\s*("([^"]*)"|'([^']*)'|([^\s"'>]*)))?/g;
  let consumed = 0;
  let match = attrRe.exec(input);
  while (match !== null) {
    if (match.index > consumed) {
      const gap = input.slice(consumed, match.index);
      if (gap.trim().length > 0) {
        problems.push({
          offset: offset + match.index,
          message: `malformed attribute list: "${gap.trim()}"`,
        });
      }
    }
    consumed = match.index + match[0].length;
    const name = match[1] ?? "";
    if (!NAME_RE.test(name)) {
      problems.push({
        offset: offset + match.index,
        message: `invalid attribute "${name}"`,
      });
    }
    const value = match[4] ?? match[5] ?? match[6];
    if (
      value !== undefined &&
      !/&(?:#[0-9]+|#x[0-9A-Fa-f]+|amp|lt|gt|quot|apos);|[^&]/.test(value)
    ) {
      problems.push({
        offset: offset + match.index,
        message: `unescaped & in ${name}`,
      });
    }
    match = attrRe.exec(input);
  }
  const tail = input.slice(consumed);
  if (tail.trim().length > 0) {
    problems.push({
      offset: offset + consumed,
      message: `malformed attribute list: "${tail.trim()}"`,
    });
  }
}

function xmllintAvailable(): boolean {
  try {
    execFileSync("xmllint", ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Throws with a readable message when the document is not well-formed. Runs
 * `xmllint --noout` too when the binary exists, so the strongest available
 * parser is always the final word.
 */
export function expectWellFormedXml(xml: string, label = "document"): void {
  const problems = findXmlProblems(xml);
  if (problems.length > 0) {
    const first = problems[0];
    throw new Error(
      `${label} is not well-formed XML at offset ${first?.offset}: ${first?.message}` +
        (problems.length > 1 ? ` (+${problems.length - 1} more)` : "")
    );
  }
  if (xmllintAvailable()) {
    try {
      execFileSync("xmllint", ["--noout", "-"], {
        input: xml,
        stdio: ["pipe", "ignore", "pipe"],
      });
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr ?? "";
      throw new Error(`${label} failed xmllint --noout: ${stderr.trim()}`);
    }
  }
}
