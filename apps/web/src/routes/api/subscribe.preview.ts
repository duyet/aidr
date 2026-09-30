import { createFileRoute } from "@tanstack/react-router";
import { editionBullets } from "../../../worker/digest/edition.js";
import { normalizeMailFormat } from "../../../worker/mail/render.js";
import {
  buildDigestEmail,
  digestSizeFor,
  type TldrSnapshotRow,
} from "../../../worker/subscribe/send.js";
import type { Env } from "../../../worker/types.js";
import { resolveApiRequestLocale } from "../../lib/locale-response";
import { localeCacheControl } from "../../lib/locale-url";
import { resolveWorkerEnv } from "../../lib/system-api";

// type alias (not interface): TanStack routeTree.gen must re-export handler
// shapes; a non-exported interface triggers TS4023 on ApiSubscribePreviewRoute.
type HandlerArgs = { request: Request; context: any };

/** Footer links need a token; "preview" renders real URLs that simply 404
 *  if clicked — the point is the layout, not working unsubscribe. */
const PREVIEW_TOKEN = "preview";

function pendingHtml(lang: "en" | "vi"): string {
  const msg =
    lang === "vi"
      ? "Bản tin đầu tiên đang được chuẩn bị — quay lại sau."
      : "The first digest is still being prepared — check back soon.";
  return `<!DOCTYPE html><html lang="${lang}"><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f7f7f5;font-family:ui-sans-serif,system-ui,sans-serif;color:#474747;font-size:14px">${msg}</body></html>`;
}

function previewError(lang: "en" | "vi"): Response {
  return new Response(pendingHtml(lang), {
    status: 500,
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Language": lang,
      "Content-Type": "text/html; charset=utf-8",
      Vary: "Cookie, Accept-Language",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

export const Route = createFileRoute("/api/subscribe/preview")({
  server: {
    handlers: {
      GET: async ({ request, context }: HandlerArgs) => {
        const locale = resolveApiRequestLocale(request);
        if (!locale.ok) return locale.response;
        const lang = locale.locale.lang;
        const url = new URL(request.url);
        const size = digestSizeFor(Number(url.searchParams.get("n")));
        const format = normalizeMailFormat(url.searchParams.get("format"));

        let env: Env | undefined;
        try {
          env = (await resolveWorkerEnv(context)) as Env | undefined;
        } catch (error) {
          console.error("subscribe preview env:", error);
          return previewError(lang);
        }
        let contentLang = lang;
        let html = pendingHtml(lang);
        let ready = false;
        if (env?.DB) {
          try {
            const snapshot = await env.DB.prepare(
              "SELECT date, bullets_en, bullets_vi, sent_at FROM tldr_snapshots ORDER BY date DESC LIMIT 1"
            ).first<TldrSnapshotRow>();
            const bullets = snapshot
              ? editionBullets(snapshot, lang, size)
              : [];
            if (snapshot && bullets.length > 0) {
              contentLang = lang;
              html = buildDigestEmail(
                snapshot.date,
                bullets,
                contentLang,
                PREVIEW_TOKEN,
                size,
                format
              ).html;
              // Rendered inside an iframe — links must open a real tab.
              html = html.replace("<head>", '<head><base target="_blank">');
              ready = true;
            }
          } catch (error) {
            // A failed D1 read must not be cached as a good preview.
            console.error("subscribe preview:", error);
            return previewError(lang);
          }
        }

        // The "still preparing" page is short-lived so a new edition shows soon.
        const policy = localeCacheControl(
          url.search,
          ready
            ? "public, max-age=300, s-maxage=600, stale-while-revalidate=3600"
            : "public, max-age=30, s-maxage=60"
        );
        return new Response(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": policy.cacheControl,
            "Content-Language": contentLang,
            ...(policy.vary ? { Vary: policy.vary } : {}),
          },
        });
      },
    },
  },
});
