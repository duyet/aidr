import { notesFrom } from "../mail/send.js";
import { escapeHtml } from "../notify/alert.js";
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

async function sendOwnerTelegram(env: Env, text: string): Promise<boolean> {
  const token = env.TELEGRAM_BOT_TOKEN?.trim() ?? "";
  const chatId = env.TELEGRAM_CHAT_ID?.trim() ?? "";
  if (!token || !chatId) return false;
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          link_preview_options: { is_disabled: true },
        }),
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!res.ok) {
      console.error(`owner notify telegram failed: HTTP ${res.status}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      "owner notify telegram failed:",
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
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
  const text = buildOwnerTelegramMessage(info);
  const [telegram, email] = await Promise.all([
    sendOwnerTelegram(env, text),
    sendOwnerEmail(env, info),
  ]);
  return { telegram, email };
}
