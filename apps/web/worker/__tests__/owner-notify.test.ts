import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../bugsink.js", () => ({
  reportPipelineException: vi.fn(async () => {}),
}));

import { resetOwnerDmRejections } from "../owner-alerts.js";
import { notifyOwnerOfNewSubscriber } from "../subscribe/owner-notify.js";
import type { Env } from "../types.js";

const SUBSCRIBER = "reader@example.com";
const CHANNELS = {
  TELEGRAM_VI_CHAT_ID: "-1001111111111",
  TELEGRAM_EN_CHAT_ID: "-1002222222222",
  TELEGRAM_CHAT_ID: "@aihomnay",
};

function mockTelegram() {
  const chatIds: unknown[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      chatIds.push(JSON.parse(String(init.body)).chat_id);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    })
  );
  return chatIds;
}

function envWith(extra: Partial<Env>) {
  const send = vi.fn(async () => {});
  const env = {
    TELEGRAM_BOT_TOKEN: "bot",
    ...CHANNELS,
    OWNER_NOTIFY_EMAIL: "owner@example.com",
    EMAIL: { send },
    ...extra,
  } as unknown as Env;
  return { env, send };
}

const info = { email: SUBSCRIBER, lang: "vi", source: "home", total: 3 };

afterEach(() => {
  resetOwnerDmRejections();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// The new-subscriber ping carries the subscriber's email. The language chat
// ids are public channels (t.me/s/aihomnay), so they must never receive it.
describe("notifyOwnerOfNewSubscriber", () => {
  it("never posts to a channel when the owner chat is unset", async () => {
    const chatIds = mockTelegram();
    const { env, send } = envWith({});
    const out = await notifyOwnerOfNewSubscriber(env, info);
    expect(chatIds).toEqual([]);
    expect(out).toEqual({ telegram: false, email: true });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends the Telegram ping only to the owner chat", async () => {
    const chatIds = mockTelegram();
    const { env } = envWith({ TELEGRAM_OWNER_CHAT_ID: "42" });
    const out = await notifyOwnerOfNewSubscriber(env, info);
    expect(chatIds).toEqual(["42"]);
    expect(out.telegram).toBe(true);
  });

  it.each([CHANNELS.TELEGRAM_VI_CHAT_ID, CHANNELS.TELEGRAM_CHAT_ID])(
    "refuses an owner chat id %s that names a channel",
    async (channel) => {
      const chatIds = mockTelegram();
      vi.spyOn(console, "warn").mockImplementation(() => {});
      const { env } = envWith({ TELEGRAM_OWNER_CHAT_ID: channel });
      const out = await notifyOwnerOfNewSubscriber(env, info);
      expect(chatIds).toEqual([]);
      expect(out.telegram).toBe(false);
    }
  );
});
