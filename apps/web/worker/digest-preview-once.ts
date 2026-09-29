import { digestFrom, sendSubscriberEmail } from "./mail/send.js";
import { buildDigestEmail } from "./subscribe/send.js";
import type { Env } from "./types.js";

const TO = "duyet.cs@gmail.com";

interface PublicDigest {
  tldr?: {
    date?: string;
    bullets_en?: { text: string; image_url?: string; item_id?: string }[];
  };
}

/** One-shot owner preview. Same builder and subscriber sender as the daily digest. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get("x-preview-once") !== "send") {
      return Response.json({ success: false, error: "forbidden" }, { status: 403 });
    }
    const pub = (await fetch("https://aidr.today/api/public").then((res) =>
      res.json()
    )) as PublicDigest;
    const date = pub.tldr?.date;
    const bullets = pub.tldr?.bullets_en ?? [];
    if (!date || bullets.length === 0) {
      return Response.json(
        { success: false, error: "no public bullets" },
        { status: 502 }
      );
    }
    const { subject, html, text } = buildDigestEmail(
      date,
      bullets,
      "en",
      "preview",
      5
    );
    let provider: unknown = null;
    const email = env.EMAIL;
    if (email) {
      const send = email.send.bind(email);
      email.send = async (message) => {
        provider = await send(message);
        return provider;
      };
    }
    const success = await sendSubscriberEmail(env, {
      to: TO,
      from: digestFrom(env),
      subject,
      html,
      text,
      unsubscribeToken: "preview",
      lang: "en",
    });
    return Response.json({
      recipient: TO,
      subject,
      hero: html.includes('class="mail-hero"'),
      success,
      provider,
    });
  },
};
