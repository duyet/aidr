import { normalizeMailFormat } from "../../src/lib/mail-format.js";
import { loadEdition } from "../digest/edition.js";
import { DEFAULT_TIMEZONE } from "../subscribe/handlers.js";
import {
  digestSizeFor,
  getLocalHourAndDate,
  renderEditionEmail,
} from "../subscribe/send.js";
import type { Env } from "../types.js";

/**
 * `GET /api/admin/mail/preview?date=&lang=&format=&n=`: the digest mail for
 * one stored edition, rendered exactly as the lane sends it, as an HTML page.
 * `date` defaults to today in the audience zone; `lang` to `vi`; `format` to
 * `design`; `n` to the default digest size. Nothing is sent or stamped.
 */
export async function renderDigestPreview(
  env: Pick<Env, "DB" | "MAIL_POSTAL_ADDRESS">,
  params: URLSearchParams
): Promise<Response> {
  const rawDate = params.get("date")?.trim();
  const date =
    rawDate && /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
      ? rawDate
      : getLocalHourAndDate(Date.now(), DEFAULT_TIMEZONE).date;
  const lang = params.get("lang") === "en" ? "en" : "vi";
  const format = normalizeMailFormat(params.get("format"));
  const size = digestSizeFor(Number(params.get("n")));
  const edition = await loadEdition(env, date, lang, size);
  if (!edition) {
    return Response.json(
      { error: `no ${lang} edition for ${date}` },
      { status: 404 }
    );
  }
  const { subject, html } = await renderEditionEmail(
    env,
    edition,
    "preview",
    size,
    format
  );
  return new Response(html, {
    headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": "text/html; charset=utf-8",
      "X-Mail-Subject": encodeURIComponent(subject),
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
