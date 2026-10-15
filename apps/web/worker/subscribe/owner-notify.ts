import { notesFrom } from "../mail/send.js";
import { escapeHtml } from "../notify/alert.js";
import { sendOwnerDm } from "../owner-alerts.js";
import type { Env } from "../types.js";

export interface NewSubscriberInfo {
  email: string;
  lang: string;
  source: string;
  total?: number | null;
}

export function buildOwnerTelegramMessage(
  info: NewSubscriberInfo,
  nowMs = Date.now()
): string {
  const when = new Date(nowMs).toISOString().replace("T", " ").slice(0, 19);
  const lines = [
    `🎉 <b>New subscriber</b>`,
    `<code>${escapeHtml(info.email)}</code>`,
    `lang: ${escapeHtml(info.lang)} · source: ${escapeHtml(info.source)}`,
  ];
  if (typeof info.total === "number") {
    lines.push(`total subscribers: <b>${info.total}</b>`);
  }
  lines.push(`<i>${escapeHtml(when)} UTC</i>`);
  return lines.join("\n");
}

export function ownerEmailAddress(env: Env): string {
  return env.OWNER_NOTIFY_EMAIL?.trim() ?? "";
}

async function sendOwnerEmail(
  env: Env,
  info: NewSubscriberInfo
): Promise<boolean> {
  const to = ownerEmailAddress(env);
  if (!to || !env.EMAIL) return false;
  try {
    await env.EMAIL.send({
      to,
      from: notesFrom(env),
      subject: `[aidr] new subscriber: ${info.email}`,
      text: `New subscriber: ${info.email}\nlang: ${info.lang}\nsource: ${info.source}\n${typeof info.total === "number" ? `total: ${info.total}\n` : ""}`,
      html: `<p>New subscriber: <strong>${escapeHtml(info.email)}</strong></p><p>lang: ${escapeHtml(info.lang)} · source: ${escapeHtml(info.source)}${typeof info.total === "number" ? ` · total: ${info.total}` : ""}</p>`,
    });
    return true;
  } catch (error) {
    console.error(
      "owner notify email failed:",
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

export async function notifyOwnerOfNewSubscriber(
  env: Env,
  info: NewSubscriberInfo
): Promise<{ telegram: boolean; email: boolean }> {
  const [dm, email] = await Promise.all([
    sendOwnerDm(env, buildOwnerTelegramMessage(info)),
    sendOwnerEmail(env, info),
  ]);
  return { telegram: dm === "sent", email };
}
