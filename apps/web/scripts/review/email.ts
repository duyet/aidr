/**
 * Scores the daily digest email, EN and VI, for one edition. Renders it the
 * way `renderEditionEmail` does (bullets joined to their items, then
 * `buildDigestEmail`), with a dummy unsubscribe token, and never sends.
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isSiteUrl } from "../../src/lib/locale-url.js";
import { topBullets } from "../../worker/digest/edition.js";
import {
  listUnsubscribeHeaders,
  type MailLang,
} from "../../worker/mail/render.js";
import {
  buildDigestEmail,
  digestBulletsWithItems,
} from "../../worker/subscribe/send.js";
import { looksVietnamese } from "../../worker/tldr-lang.js";
import { carriesToken, digestCampaign } from "../../worker/utm.js";
import {
  type AutoResult,
  emit,
  type RubricRow,
  scoreRubric,
} from "./rubric.js";

/** Gmail hides everything past 102 KB of HTML behind "View entire message".
 *  The repo states no limit of its own; this is Gmail's documented cut. */
export const GMAIL_CLIP_BYTES = 102 * 1024;

export const DUMMY_TOKEN = "review-dummy-token";

export const RUBRIC: RubricRow[] = [
  {
    id: "size",
    points: 2,
    auto: true,
    ask: "HTML under Gmail's 102 KB clip",
  },
  {
    id: "unsubscribe",
    points: 2,
    auto: true,
    ask: "unsubscribe link and List-Unsubscribe header hit real routes",
  },
  {
    id: "plain-text",
    points: 1.5,
    auto: true,
    ask: "plain-text part is non-empty and carries every story link",
  },
  { id: "img-alt", points: 1, auto: true, ask: "every <img> has alt text" },
  {
    id: "subject",
    points: 1.5,
    auto: true,
    ask: "subject in the mail's language, leads with the edition's top story",
  },
  {
    id: "utm",
    points: 1,
    auto: true,
    ask: "every aidr.today link carries the digest UTM",
  },
  {
    id: "mobile-dark",
    points: 1,
    ask: "reads well on a phone and in dark mode",
  },
];

/** One edition as stored: the snapshot bullets and their `items` rows. */
export interface EmailEdition {
  date: string;
  bullets_en: unknown[];
  bullets_vi: unknown[];
  stories: Array<{
    id: string;
    url?: string | null;
    title?: string | null;
    title_vi?: string | null;
    category?: string | null;
    image_url?: string | null;
  }>;
}

/** One rendered mail, as the checks read it. */
export interface EmailCase {
  lang: MailLang;
  date: string;
  /** Item ids of the stories the mail shows, in order. */
  storyIds: string[];
  /** The lead story's headline in this language. */
  leadHeadline: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
}

export interface EmailInput {
  cases: EmailCase[];
  /** Route files under src/routes, relative, e.g. `api/subscribe.ts`. */
  routeFiles: string[];
  /** Status of a token-free GET of the unsubscribe page, when fetched. */
  liveUnsubscribeStatus?: number;
}

export function renderEdition(edition: EmailEdition): EmailCase[] {
  return (["en", "vi"] as const).map((lang) => {
    const raw = lang === "en" ? edition.bullets_en : edition.bullets_vi;
    const bullets = digestBulletsWithItems(
      topBullets(JSON.stringify(raw)),
      edition.stories,
      lang
    );
    const mail = buildDigestEmail(edition.date, bullets, lang, DUMMY_TOKEN);
    return {
      lang,
      date: edition.date,
      storyIds: bullets.flatMap((b) => (b.item_id ? [b.item_id] : [])),
      leadHeadline: bullets[0]?.headline ?? "",
      ...mail,
      headers: listUnsubscribeHeaders(DUMMY_TOKEN, lang),
    };
  });
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) =>
    m[1].replaceAll("&amp;", "&")
  );
}

function textUrls(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s<>)]+/g)].map((m) => m[0]);
}

function parse(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function routeExists(pathname: string, routeFiles: string[]): boolean {
  const base = pathname.replace(/^\/+|\/+$/g, "") || "index";
  return [".tsx", ".ts", "/index.tsx", "/index.ts"].some((ext) =>
    routeFiles.includes(`${base}${ext}`)
  );
}

function checkUnsubscribe(c: EmailCase, input: EmailInput): string[] {
  const why: string[] = [];
  const page = hrefs(c.html)
    .map(parse)
    .find((u) => u?.searchParams.get("unsubscribe") === DUMMY_TOKEN);
  if (!page) why.push(`${c.lang}: no unsubscribe link in the HTML`);
  else if (!routeExists(page.pathname, input.routeFiles))
    why.push(`${c.lang}: unsubscribe link ${page.pathname} has no route`);
  if (!c.text.includes(`unsubscribe=${DUMMY_TOKEN}`))
    why.push(`${c.lang}: no unsubscribe link in the plain text`);
  const header = c.headers["List-Unsubscribe"] ?? "";
  const targets = [...header.matchAll(/<([^>]+)>/g)].map((m) => parse(m[1]));
  if (targets.length === 0) why.push(`${c.lang}: no List-Unsubscribe header`);
  for (const u of targets) {
    if (!u) why.push(`${c.lang}: List-Unsubscribe has a bad URL`);
    else if (!routeExists(u.pathname, input.routeFiles))
      why.push(`${c.lang}: List-Unsubscribe ${u.pathname} has no route`);
  }
  if (c.headers["List-Unsubscribe-Post"] !== "List-Unsubscribe=One-Click")
    why.push(`${c.lang}: no one-click List-Unsubscribe-Post header`);
  return why;
}

function checkUtm(c: EmailCase): string[] {
  const campaign = digestCampaign(c.date);
  const why: string[] = [];
  for (const raw of [...hrefs(c.html), ...textUrls(c.text)]) {
    const u = parse(raw);
    if (!u || !isSiteUrl(raw) || carriesToken(u)) continue;
    const p = u.searchParams;
    if (
      p.get("utm_source") !== "email" ||
      p.get("utm_medium") !== "digest" ||
      p.get("utm_campaign") !== campaign
    )
      why.push(`${c.lang}: ${u.pathname}${u.search} lacks the digest UTM`);
  }
  return [...new Set(why)];
}

function checkSubject(c: EmailCase): string[] {
  const why: string[] = [];
  const vi = looksVietnamese(c.subject);
  if (c.lang === "en" && vi)
    why.push(`en: subject is Vietnamese: "${c.subject}"`);
  if (c.lang === "vi" && !vi)
    why.push(`vi: subject has no Vietnamese: "${c.subject}"`);
  const lead = c.leadHeadline.trim().slice(0, 20);
  if (!lead) why.push(`${c.lang}: lead story ${c.storyIds[0]} has no headline`);
  else if (!c.subject.startsWith(lead))
    why.push(
      `${c.lang}: subject does not lead with story ${c.storyIds[0]?.slice(0, 8)}`
    );
  return why;
}

export function autoChecks(input: EmailInput): AutoResult {
  const each = (fn: (c: EmailCase) => string[]) => input.cases.flatMap(fn);
  const unsubscribe = each((c) => checkUnsubscribe(c, input));
  if (
    input.liveUnsubscribeStatus !== undefined &&
    (input.liveUnsubscribeStatus < 200 || input.liveUnsubscribeStatus >= 400)
  )
    unsubscribe.push(
      `live GET /subscribe answered ${input.liveUnsubscribeStatus}`
    );
  return {
    size: each((c) => {
      const bytes = Buffer.byteLength(c.html, "utf8");
      return bytes < GMAIL_CLIP_BYTES
        ? []
        : [`${c.lang}: HTML is ${bytes} bytes, clips at ${GMAIL_CLIP_BYTES}`];
    }),
    unsubscribe,
    "plain-text": each((c) => {
      if (!c.text.trim()) return [`${c.lang}: plain-text part is empty`];
      const paths = new Set(
        textUrls(c.text).flatMap((u) => parse(u)?.pathname ?? [])
      );
      return c.storyIds
        .filter((id) => !paths.has(`/${id.slice(0, 8)}`))
        .map(
          (id) => `${c.lang}: story ${id.slice(0, 8)} has no plain-text link`
        );
    }),
    "img-alt": each((c) =>
      [...c.html.matchAll(/<img\b[^>]*>/g)]
        .filter((m) => !/\balt="[^"]*[^"\s][^"]*"/.test(m[0]))
        .map((m) => `${c.lang}: <img> without alt: ${m[0].slice(0, 90)}`)
    ),
    subject: each(checkSubject),
    utm: each(checkUtm),
  };
}

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export function listRouteFiles(dir = join(WEB, "src/routes")): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name))
    .map((e) => relative(dir, join(e.parentPath, e.name)));
}

/** Today's live edition from the public API. */
export async function loadEdition(): Promise<EmailEdition> {
  const res = await fetch("https://aidr.today/api/public?lang=en");
  if (!res.ok) throw new Error(`/api/public answered ${res.status}`);
  const body = (await res.json()) as {
    tldr: { date: string; bullets_en: unknown[]; bullets_vi: unknown[] };
    stories: EmailEdition["stories"];
  };
  return { ...body.tldr, stories: body.stories };
}

async function liveUnsubscribeStatus(): Promise<number> {
  const res = await fetch("https://aidr.today/subscribe", { method: "GET" });
  return res.status;
}

async function main(argv: string[]): Promise<void> {
  const at = argv.indexOf("--fixture");
  const fixture = at >= 0 ? argv[at + 1] : undefined;
  const edition: EmailEdition = fixture
    ? JSON.parse(readFileSync(fixture, "utf8"))
    : await loadEdition();
  const input: EmailInput = {
    cases: renderEdition(edition),
    routeFiles: listRouteFiles(),
    ...(fixture
      ? {}
      : { liveUnsubscribeStatus: await liveUnsubscribeStatus() }),
  };
  for (const c of input.cases) {
    console.log(
      `${c.lang} ${c.date}: ${Buffer.byteLength(c.html)} bytes HTML, ${c.text.length} chars text, subject "${c.subject}"`
    );
  }
  emit([scoreRubric(`email ${edition.date}`, RUBRIC, autoChecks(input))], argv);
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
