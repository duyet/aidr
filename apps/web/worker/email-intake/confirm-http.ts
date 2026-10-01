import type { Env } from "../types.js";
import { escapeHtml } from "./ack.js";
import { confirmContributorEmail } from "./aliases.js";

function page(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>AI;DR contributions</title><style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem}button{font:inherit;padding:.5rem 1rem;cursor:pointer}</style></head><body>${body}</body></html>`,
    {
      status,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "X-Robots-Tag": "noindex",
      },
    }
  );
}

/**
 * `/api/contribute-email/confirm?token=…`. GET only shows a button; POST
 * confirms. Mail security scanners prefetch links, so a GET that confirmed
 * would let anyone who added a victim's address get it confirmed.
 */
export async function handleContributorEmailConfirm(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  if (request.method === "GET") {
    const token = url.searchParams.get("token") ?? "";
    return page(
      `<h1>Confirm this address</h1><p>Allow this address to send contributions to submit@aidr.today for your AI;DR account.</p><form method="post"><input type="hidden" name="token" value="${escapeHtml(token)}"><button type="submit">Confirm</button></form>`
    );
  }
  if (request.method !== "POST") {
    return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
  }
  const form = await request.formData().catch(() => null);
  const token = form?.get("token");
  const ok = await confirmContributorEmail(
    env.DB,
    typeof token === "string" ? token : null
  );
  return ok
    ? page(
        "<h1>Address confirmed</h1><p>You can now send links, fixes and comments from this address to <b>submit@aidr.today</b>.</p>"
      )
    : page(
        "<h1>Link not valid</h1><p>It may have expired or already been used. Add the address again on your contributions page.</p>",
        400
      );
}
