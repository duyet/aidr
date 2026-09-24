import { createFileRoute } from "@tanstack/react-router";
import {
  buildDigestEmail,
  digestSizeFor,
  snapshotHasBullets,
  type TldrSnapshotRow,
  topBullets,
} from "../../../worker/subscribe/send.js";
import type { Env } from "../../../worker/types.js";
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
  return `<!DOCTYPE html><html><body style="margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f7f7f5;font-family:ui-sans-serif,system-ui,sans-serif;color:#474747;font-size:14px">${msg}</body></html>`;
}

export const Route = createFileRoute("/api/subscribe/preview")({
  server: {
    handlers: {
      GET: async ({ request, context }: HandlerArgs) => {
        const url = new URL(request.url);
        const lang = url.searchParams.get("lang") === "vi" ? "vi" : "en";
        const size = digestSizeFor(Number(url.searchParams.get("n")));

        const env = (await resolveWorkerEnv(context)) as Env | undefined;
        let html = pendingHtml(lang);
        if (env?.DB) {
          try {
            const snapshot = await env.DB.prepare(
              "SELECT date, bullets_en, bullets_vi, sent_at FROM tldr_snapshots ORDER BY date DESC LIMIT 1"
            ).first<TldrSnapshotRow>();
            if (snapshot && snapshotHasBullets(snapshot)) {
              const preferred = topBullets(
                lang === "vi" ? snapshot.bullets_vi : snapshot.bullets_en,
                size
              );
              const bullets =
                preferred.length > 0
                  ? preferred
                  : topBullets(snapshot.bullets_en, size);
              html = buildDigestEmail(
                snapshot.date,
                bullets,
                lang,
                PREVIEW_TOKEN,
                size
              ).html;
              // Rendered inside an iframe — links must open a real tab.
              html = html.replace("<head>", '<head><base target="_blank">');
            }
          } catch (error) {
            console.error("subscribe preview:", error);
          }
        }

        return new Response(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control":
              "public, max-age=300, s-maxage=600, stale-while-revalidate=3600",
          },
        });
      },
    },
  },
});
