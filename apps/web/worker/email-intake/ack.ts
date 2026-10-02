import { SUBMIT_EMAIL } from "../../src/lib/site.js";
import { notesFrom } from "../mail/send.js";
import type { Env } from "../types.js";

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface AckMail {
  /** The validated sender address; never a Reply-To the sender chose. */
  to: string;
  subject: string;
  inReplyTo: string | null;
  lines: string[];
  siteUrl: string;
}

/** Threading and loop headers: replies thread under the user's message, and
 *  `Auto-Submitted` keeps their auto-responders from answering us. */
export function ackHeaders(inReplyTo: string | null): Record<string, string> {
  const headers: Record<string, string> = { "Auto-Submitted": "auto-replied" };
  if (inReplyTo && /^<[^<>\s]{1,900}>$/.test(inReplyTo)) {
    headers["In-Reply-To"] = inReplyTo;
    headers.References = inReplyTo;
  }
  return headers;
}

export async function sendAck(env: Env, mail: AckMail): Promise<boolean> {
  if (!env.EMAIL) return false;
  const history = `${mail.siteUrl}/submit`;
  const text = `${mail.lines.join("\n\n")}\n\nYour contributions: ${history}\n`;
  const html = `${mail.lines
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("")}<p><a href="${escapeHtml(history)}">Your contributions</a></p>`;
  try {
    await env.EMAIL.send({
      to: mail.to,
      from: notesFrom(env),
      subject: mail.subject.slice(0, 200),
      // Replies to an ack or verdict come back to the intake, threaded by
      // the subject marker. A responder that ignores Auto-Submitted is
      // bounded by the daily per-user cap.
      replyTo: SUBMIT_EMAIL,
      text,
      html,
      headers: ackHeaders(mail.inReplyTo),
    });
    return true;
  } catch (error) {
    console.error(
      "email-intake ack failed:",
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

/** User text echoed into an ack: one line, short. */
export function quote(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 300 ? `${flat.slice(0, 297)}...` : flat;
}
