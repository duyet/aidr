import { sha256Hex } from "../hash.js";
import type { Env } from "../types.js";
import { listUnsubscribeHeaders, NEWS_FROM, NOTES_FROM } from "./render.js";

export type MailFrom = { email: string; name: string };

export function digestFrom(env: Env): MailFrom {
  return {
    email: env.EMAIL_FROM?.trim() || NEWS_FROM.email,
    name: env.EMAIL_FROM_NAME?.trim() || NEWS_FROM.name,
  };
}

export function notesFrom(env: Env): MailFrom {
  return {
    email: env.EMAIL_NOTES_FROM?.trim() || NOTES_FROM.email,
    name: env.EMAIL_FROM_NAME?.trim() || NOTES_FROM.name,
  };
}

export async function logMailFailure(
  label: string,
  email: string,
  error: unknown
): Promise<void> {
  const hash = (await sha256Hex(email.toLowerCase())).slice(0, 12);
  const message = error instanceof Error ? error.message : String(error);
  console.error(`${label} failed hash=${hash}: ${message}`);
}

export interface SubscriberMail {
  to: string;
  from: MailFrom;
  subject: string;
  html: string;
  text: string;
  unsubscribeToken: string;
}

/** Sends one subscriber email. Returns false when EMAIL is unbound or send throws. */
export async function sendSubscriberEmail(
  env: Env,
  mail: SubscriberMail
): Promise<boolean> {
  if (!env.EMAIL) {
    console.error("EMAIL binding not configured; skip send");
    return false;
  }
  try {
    await env.EMAIL.send({
      to: mail.to,
      from: mail.from,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      headers: listUnsubscribeHeaders(mail.unsubscribeToken),
    });
    return true;
  } catch (error) {
    await logMailFailure("email send", mail.to, error);
    return false;
  }
}
