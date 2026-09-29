import { digestFrom, sendSubscriberEmail } from "./mail/send.js";
import {
  buildDigestEmail,
  digestBulletsWithImages,
  topBullets,
} from "./subscribe/send.js";
import type { Env } from "./types.js";

const TO = "duyet.cs@gmail.com";

/** One owner preview of the daily path: snapshot bullets, then item images. */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get("x-preview-once") !== "send") {
      return Response.json({ success: false, error: "forbidden" }, { status: 403 });
    }
    const snapshot = await env.DB.prepare(
      "SELECT date, bullets_en FROM tldr_snapshots ORDER BY date DESC LIMIT 1"
    ).first<{ date: string; bullets_en: string | null }>();
    const bullets = topBullets(snapshot?.bullets_en ?? null, 5);
    if (!snapshot || bullets.length === 0) {
      return Response.json({ success: false, error: "no bullets" }, { status: 502 });
    }
    const ids = [
      ...new Set(
        bullets.flatMap((bullet) => [
          ...(bullet.item_ids ?? []),
          ...(bullet.item_id ? [bullet.item_id] : []),
        ])
      ),
    ];
    const rows =
      ids.length === 0
        ? []
        : (
            await env.DB.prepare(
              `SELECT id, image_url FROM items WHERE id IN (${ids.map(() => "?").join(", ")})`
            )
              .bind(...ids)
              .all<{ id: string; image_url: string | null }>()
          ).results ?? [];
    const withImages = digestBulletsWithImages(bullets, rows);
    const { subject, html, text } = buildDigestEmail(
      snapshot.date,
      withImages,
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
    const hero = html.match(/class="mail-hero" src="([^"]+)"/)?.[1] ?? null;
    return Response.json({
      recipient: TO,
      subject,
      date: snapshot.date,
      hydrated: withImages.some((bullet) => Boolean(bullet.image_url)),
      hero,
      success,
      provider,
    });
  },
};
