#!/usr/bin/env tsx
/**
 * Scores the Telegram (EN, VI) and Facebook (EN) posts of one edition.
 *
 * `notify_posts` stores the caption of a sent Telegram story post, but the
 * digest messages, the Facebook posts and any story posted before migration
 * 0070 have no stored text. For those the text is rebuilt from stored items
 * with the worker's own pure builders, so the score is for rebuilt text.
 * Nothing is sent: no Telegram or Facebook call, no LLM, SELECT-only D1.
 *
 * Usage (cwd: repo root):
 *   pnpm --filter @aidr/web exec tsx scripts/review/post.ts \
 *     [--date YYYY-MM-DD] [--fixture <json>] [--save <json>] [--json <out>]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isSiteUrl } from "../../src/lib/locale-url";
import type { Lang } from "../../src/lib/types";
import { loadEdition } from "../../worker/digest/edition";
import { loadDayCard } from "../../worker/notify/day-card";
import {
  buildFacebookDigest,
  buildFacebookStory,
} from "../../worker/notify/facebook";
import { normalizeSpace } from "../../worker/notify/fit-text";
import { withoutRestatedHeadline } from "../../worker/notify/headline-repeat";
import {
  type ChannelCopyRow,
  hydrateStory,
  type StoryRow as NotifyStoryRow,
  postableCopy,
  storyCopySql,
} from "../../worker/notify/index";
import { postability } from "../../worker/notify/post-quality";
import { readsAsSourceCopy } from "../../worker/notify/story-summary";
import {
  buildAlbumCaption,
  buildDigestMessage,
  buildDigestReplyMarkup,
  buildStoryCaption,
  buildStoryReplyMarkup,
  DIGEST_STORIES,
  digestCardUrl,
  digestDayUrl,
  fitHighlightDigest,
  resolveStoryMedia,
  storyTextLinkPreview,
} from "../../worker/notify/telegram";
import {
  imageVerdict,
  previewVerdict,
} from "../../worker/notify/telegram-media-guard";
import type { DailyDigest, StoryPayload } from "../../worker/notify/types";
import { TELEGRAM_IV_LIMITS } from "../../worker/telegram-iv";
import { AUDIENCE_TIMEZONE, localCalendarDate } from "../../worker/time";
import { loadActiveRules } from "../../worker/translation-knowledge";
import {
  hasSourceChrome,
  stripEmbeddedChrome,
} from "../../worker/translation-terms";
import { STORY_CAMPAIGN } from "../../worker/utm";
import { wranglerSelect, wranglerSelectEnv } from "../cf-d1";
import {
  type AutoResult,
  emit,
  type Report,
  type RubricRow,
  scoreRubric,
} from "./rubric";

export const RUBRIC: RubricRow[] = [
  {
    id: "caption_cap",
    points: 2,
    auto: true,
    ask: "Telegram photo/album caption is 1024 visible characters or fewer; text posts and the digest message fit 4096; the Facebook message fits Graph's cap.",
  },
  {
    id: "headline_repeat",
    points: 1.5,
    auto: true,
    ask: "The summary does not repeat the headline: no restating lead clause (headline-repeat.ts), no line equal to the headline.",
  },
  {
    id: "utm",
    points: 1.5,
    auto: true,
    ask: "Every aidr.today link carries utm_source for its channel, utm_medium=social and the right campaign; a story link's utm_content ends with the story id8.",
  },
  {
    id: "image",
    points: 1.5,
    auto: true,
    ask: "The post has an image the media guard accepts, or a derivable fallback: publisher preview for a Telegram text post, the day card for a digest, the linked page's og:image on Facebook.",
  },
  {
    id: "hashtags",
    points: 0.5,
    auto: true,
    ask: "A Telegram story caption ends with a well-formed #category line (then optional points, comments, extra-image counts).",
  },
  {
    id: "postability",
    points: 1,
    auto: true,
    ask: "The story copy is postable: not chrome, not short, not missing, passes the translation gate, is not withheld as source copy. A digest bullet is not empty or chrome.",
  },
  {
    id: "hook_news",
    points: 1,
    ask: "The headline and first summary line read like news: the fact first, no teaser, no clickbait, no source-page chrome.",
  },
  {
    id: "vi_natural",
    points: 1,
    ask: "Vietnamese posts read as natural Vietnamese a reader would write, not translated word for word; names and numbers kept.",
  },
];

export type PostChannel = "telegram" | "telegram-en" | "facebook-en";

export interface PostMedia {
  /** gallery: story photos; card: the digest day card; preview: a link
   *  preview standing in for a photo; og: the linked page's own image;
   *  none: no image and no fallback. */
  kind: "gallery" | "card" | "preview" | "og" | "none";
  urls: string[];
  /** Images the media guard left out, with its reasons. */
  dropped: string[];
}

export interface PostItem {
  channel: PostChannel;
  lang: Lang;
  kind: "story" | "digest";
  /** The story id, or `digest:<date>`. */
  id: string;
  /** `stored`: the text as sent (`notify_posts`). `rebuilt`: built now from
   *  stored items with the worker's builders. */
  source: "stored" | "rebuilt";
  form: "photo" | "album" | "text" | "digest" | "link";
  /** Telegram HTML, or the Facebook message. Empty when nothing could be built. */
  text: string;
  /** Links outside the text: Telegram buttons, the Facebook link attachment. */
  links: string[];
  /** The channel-language headline and summary of the story. */
  title: string | null;
  summary: string | null;
  category: string | null;
  /** Result of the send-time gate (`postableCopy`). */
  gate: { ok: true } | { ok: false; reason: string };
  /** Set when the real send would withhold the post. */
  withheld?: string;
  media: PostMedia;
  /** Digest only: the bullet lines as sent. */
  bullets?: { text: string; lead?: string }[];
}

export interface PostInput {
  date: string;
  posts: PostItem[];
  /** What the loader could not find or had to substitute. */
  notes?: string[];
}

const TELEGRAM_MESSAGE_CHARS = 4096;
const FACEBOOK_MESSAGE_CHARS = 63_206;
const SOURCE_UTM: Record<PostChannel, string> = {
  telegram: "telegram",
  "telegram-en": "telegram",
  "facebook-en": "facebook",
};
const READ_LABELS = new Set(["Read →", "Đọc bài →"]);
const META_HEAD = /^(#[A-Za-z0-9_]+|▲ \d+|💬 \d+|📎 )/u;
const HASHTAG_LINE = /^#[A-Za-z0-9_]+((?: {2}· {2}(?:▲ \d+|💬 \d+|📎 .+))*)$/u;

const label = (post: PostItem) =>
  `${post.channel} ${post.kind === "digest" ? post.id : post.id.slice(0, 8)}`;

/** Telegram counts a caption after entity parsing: tags are gone and
 *  `&lt;` is one character. */
export function visibleText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function hrefs(html: string): string[] {
  return [...html.matchAll(/href="([^"]+)"/g)].map((m) =>
    (m[1] ?? "").replace(/&amp;/g, "&")
  );
}

function bareUrls(text: string): string[] {
  return text.match(/https?:\/\/[^\s<>"]+/g) ?? [];
}

interface Caption {
  title: string;
  summary: string;
  /** The summary's paragraphs, one per line of the post. */
  lines: string[];
  meta: string | null;
}

/** Title, summary and meta line of a story post. Telegram: bold headline
 *  with a leading mark, summary, meta, and for an album a Read link line.
 *  Facebook: headline, then summary paragraphs. */
function splitCaption(post: PostItem): Caption {
  const paragraphs = visibleText(post.text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const telegram = post.channel !== "facebook-en";
  const title = (paragraphs.shift() ?? "").replace(/^🔥\s*/u, "");
  if (telegram && READ_LABELS.has(paragraphs.at(-1) ?? "")) paragraphs.pop();
  let meta: string | null = null;
  if (telegram && META_HEAD.test(paragraphs.at(-1) ?? "")) {
    meta = paragraphs.pop() ?? null;
  }
  return { title, summary: paragraphs.join(" "), lines: paragraphs, meta };
}

function capFor(post: PostItem): number {
  if (post.channel === "facebook-en") return FACEBOOK_MESSAGE_CHARS;
  return post.form === "photo" || post.form === "album"
    ? TELEGRAM_IV_LIMITS.captionChars
    : TELEGRAM_MESSAGE_CHARS;
}

function captionCap(post: PostItem): string[] {
  if (!post.text) return [];
  const length = visibleText(post.text).length;
  const cap = capFor(post);
  return length > cap
    ? [
        `${label(post)}: ${length} visible characters, cap ${cap} (${post.form})`,
      ]
    : [];
}

function headlineRepeat(post: PostItem): string[] {
  if (!post.text) return [];
  const bullets = post.bullets ?? [];
  if (post.kind === "digest") {
    return bullets.flatMap((bullet) => {
      if (!bullet.lead || bullet.text === bullet.lead) return [];
      const rest = normalizeSpace(
        bullet.text.slice(bullet.lead.length).replace(/^\s*[—–-]\s*/, "")
      );
      if (!rest) return [];
      return withoutRestatedHeadline(bullet.lead, rest) === rest
        ? []
        : [
            `${label(post)}: bullet "${bullet.lead.slice(0, 50)}" repeats its headline`,
          ];
    });
  }
  const { title, summary, lines } = splitCaption(post);
  const text = normalizeSpace(summary);
  if (!text) return [];
  const bare = (value: string) =>
    normalizeSpace(value)
      .replace(/[.!]+$/, "")
      .toLowerCase();
  if (lines.some((line) => bare(line) === bare(title))) {
    return [`${label(post)}: summary is the headline`];
  }
  return withoutRestatedHeadline(title, text) === text
    ? []
    : [
        `${label(post)}: summary opens with a clause that restates "${title.slice(0, 50)}"`,
      ];
}

function utmProblems(post: PostItem, url: string): string[] {
  const u = new URL(url);
  const get = (key: string) => u.searchParams.get(key);
  const expectSource = SOURCE_UTM[post.channel];
  const problems: string[] = [];
  if (get("utm_source") !== expectSource) {
    problems.push(
      `utm_source ${get("utm_source") ?? "missing"}, want ${expectSource}`
    );
  }
  if (get("utm_medium") !== "social") {
    problems.push(`utm_medium ${get("utm_medium") ?? "missing"}, want social`);
  }
  const campaign = get("utm_campaign");
  const wanted =
    post.kind === "digest"
      ? `digest-${post.id.slice("digest:".length)}`
      : STORY_CAMPAIGN;
  if (campaign !== wanted) {
    problems.push(`utm_campaign ${campaign ?? "missing"}, want ${wanted}`);
  }
  if (
    post.kind === "story" &&
    !get("utm_content")?.endsWith(`-${post.id.slice(0, 8)}`)
  ) {
    problems.push(
      `utm_content ${get("utm_content") ?? "missing"}, want <slot>-${post.id.slice(0, 8)}`
    );
  }
  return problems;
}

function utm(post: PostItem): string[] {
  if (!post.text && post.links.length === 0) return [];
  const all = [
    ...new Set([
      ...hrefs(post.text),
      ...bareUrls(visibleText(post.text)),
      ...post.links,
    ]),
  ].filter(isSiteUrl);
  if (all.length === 0)
    return [`${label(post)}: no aidr.today link in the post`];
  return all.flatMap((url) =>
    utmProblems(post, url).map(
      (p) => `${label(post)}: ${url.slice(0, 80)} ${p}`
    )
  );
}

function image(post: PostItem): string[] {
  if (!post.text) return [];
  const { kind, urls } = post.media;
  const bad = (reason: string) => [`${label(post)}: ${reason}`];
  if (kind === "none" || urls.length === 0) {
    const why = post.media.dropped.length
      ? ` (guard dropped: ${post.media.dropped.join(", ")})`
      : "";
    return bad(`no image and no preview fallback${why}`);
  }
  if (kind === "og") {
    return urls.every(isSiteUrl)
      ? []
      : bad(
          "link attachment is not an aidr.today page, so no og:image to show"
        );
  }
  return urls.flatMap((url) => {
    const verdict =
      kind === "preview"
        ? previewVerdict(post.kind === "digest" ? "digest" : "story", { url })
        : imageVerdict(post.kind === "digest" ? "digest" : "story", url);
    return verdict.ok
      ? []
      : bad(`${url.slice(0, 80)} refused: ${verdict.reason}`);
  });
}

function hashtags(post: PostItem): string[] {
  if (post.kind !== "story" || post.channel === "facebook-en" || !post.text) {
    return [];
  }
  const { meta } = splitCaption(post);
  if (!meta?.startsWith("#")) {
    return [
      `${label(post)}: no #category line${post.category ? "" : " (story has no category)"}`,
    ];
  }
  return HASHTAG_LINE.test(meta)
    ? []
    : [`${label(post)}: malformed category line "${meta.slice(0, 60)}"`];
}

function postabilityRow(post: PostItem): string[] {
  if (post.kind === "digest") {
    const bullets = post.bullets ?? [];
    if (!post.text) return [`${label(post)}: no digest bullets to post`];
    return bullets.flatMap((bullet, i) => {
      const text = bullet.text.trim();
      if (!text) return [`${label(post)}: bullet ${i + 1} is empty`];
      return hasSourceChrome(text)
        ? [`${label(post)}: bullet ${i + 1} carries source-page chrome`]
        : [];
    });
  }
  const problems: string[] = [];
  if (!post.gate.ok) problems.push(`gate:${post.gate.reason}`);
  else if (post.title !== null) {
    const verdict = postability({ title: post.title, summary: post.summary });
    if (!verdict.ok) problems.push(verdict.reason);
  }
  if (post.withheld) problems.push(post.withheld);
  return problems.map((p) => `${label(post)}: ${p}`);
}

/** One entry per automatic row; [] is a pass. Pure over plain data. */
export function autoChecks(input: PostInput): AutoResult {
  const run = (check: (post: PostItem) => string[]) =>
    input.posts.flatMap(check);
  if (input.posts.length === 0) {
    const none = ["no posts to review for this edition"];
    return {
      caption_cap: none,
      headline_repeat: none,
      utm: none,
      image: none,
      hashtags: none,
      postability: none,
    };
  }
  return {
    caption_cap: run(captionCap),
    headline_repeat: run(headlineRepeat),
    utm: run(utm),
    image: run(image),
    hashtags: run(hashtags),
    postability: run(postabilityRow),
  };
}

export function scorePosts(input: PostInput): Report {
  return scoreRubric(`post review ${input.date}`, RUBRIC, autoChecks(input));
}

// ---------------------------------------------------------------------------
// Rebuilding, pure over stored data and the worker's builders.

const channelFor = (lang: Lang): PostChannel =>
  lang === "vi" ? "telegram" : "telegram-en";

function buttonUrls(markup: object): string[] {
  const rows = (markup as { inline_keyboard?: { url?: string }[][] })
    .inline_keyboard;
  return (rows ?? []).flat().flatMap((b) => (b.url ? [b.url] : []));
}

function storyMedia(story: StoryPayload): {
  media: PostMedia;
  form: PostItem["form"];
} {
  const { gallery, dropped } = resolveStoryMedia(story);
  if (gallery.length > 0) {
    return {
      media: { kind: "gallery", urls: gallery, dropped },
      form: gallery.length >= 2 ? "album" : "photo",
    };
  }
  const preview = storyTextLinkPreview(story);
  const url = (preview as { url?: string }).url;
  return {
    media: url
      ? { kind: "preview", urls: [url], dropped }
      : { kind: "none", urls: [], dropped },
    form: "text",
  };
}

type Gate = PostItem["gate"];

export function rebuildTelegramStory(
  lang: Lang,
  story: StoryPayload,
  gate: Gate,
  stored?: { kind: PostItem["form"]; caption: string }
): PostItem {
  const { media, form } = storyMedia(story);
  const built =
    form === "album" ? buildAlbumCaption(story) : buildStoryCaption(story);
  const withheld =
    !story.caption_summary &&
    lang === "vi" &&
    readsAsSourceCopy(story.summary ?? "", "vi")
      ? "withheld: the summary reads as source copy and has no clean rewrite"
      : undefined;
  return {
    channel: channelFor(lang),
    lang,
    kind: "story",
    id: story.id,
    source: stored ? "stored" : "rebuilt",
    form: stored?.kind ?? form,
    text: stored?.caption ?? built,
    links: buttonUrls(buildStoryReplyMarkup(story)),
    title: story.title,
    summary: story.summary,
    category: story.category,
    gate,
    ...(withheld ? { withheld } : {}),
    media,
  };
}

export function rebuildFacebookStoryPost(
  story: StoryPayload,
  gate: Gate
): PostItem {
  const post = buildFacebookStory(story);
  return {
    channel: "facebook-en",
    lang: "en",
    kind: "story",
    id: story.id,
    source: "rebuilt",
    form: "link",
    text: post.message,
    links: [post.link],
    title: story.title,
    summary: story.summary,
    category: story.category,
    gate,
    media: { kind: "og", urls: [post.link], dropped: [] },
  };
}

export function rebuildTelegramDigest(
  digest: DailyDigest,
  card: { version: string; youtubeId: string | null } | null
): PostItem {
  const shown = {
    ...digest,
    bullets: digest.bullets.slice(0, DIGEST_STORIES),
  };
  const fitted = fitHighlightDigest(shown);
  return {
    channel: channelFor(digest.lang),
    lang: digest.lang,
    kind: "digest",
    id: `digest:${digest.date}`,
    source: "rebuilt",
    form: "digest",
    text: fitted.bullets.length ? buildDigestMessage(fitted) : "",
    links: buttonUrls(buildDigestReplyMarkup(digest, card?.youtubeId)),
    title: null,
    summary: null,
    category: null,
    gate: { ok: true },
    media: card
      ? {
          kind: "card",
          urls: [digestCardUrl(digest, card.version)],
          dropped: [],
        }
      : {
          kind: "preview",
          urls: [digestDayUrl(digest, "preview")],
          dropped: [],
        },
    bullets: fitted.bullets.map(({ text, lead }) => ({
      text,
      ...(lead ? { lead } : {}),
    })),
  };
}

export function rebuildFacebookDigestPost(digest: DailyDigest): PostItem {
  const post = buildFacebookDigest(digest);
  return {
    channel: "facebook-en",
    lang: "en",
    kind: "digest",
    id: `digest:${digest.date}`,
    source: "rebuilt",
    form: "link",
    text: digest.bullets.length ? post.message : "",
    links: [post.link],
    title: null,
    summary: null,
    category: null,
    gate: { ok: true },
    media: { kind: "og", urls: [post.link], dropped: [] },
    bullets: digest.bullets.map(({ text }) => ({ text })),
  };
}

// ---------------------------------------------------------------------------
// Live loading, SELECT-only.

function literal(value: unknown): string {
  if (typeof value === "number") return String(value);
  if (typeof value === "string") return `'${value.replace(/'/g, "''")}'`;
  if (value === null || value === undefined) return "NULL";
  throw new Error(`cannot bind ${typeof value}`);
}

interface Statement {
  bind(...values: unknown[]): Statement;
  all(): Promise<{ results: Record<string, unknown>[] }>;
  first(): Promise<Record<string, unknown> | null>;
  run$(): { results: Record<string, unknown>[] };
}

function statement(sql: string, values: unknown[] = []): Statement {
  const run$ = () => {
    let at = 0;
    const text = sql
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\?/g, () => literal(values[at++]));
    return { results: wranglerSelect(text) };
  };
  return {
    bind: (...next) => statement(sql, next),
    all: async () => run$(),
    first: async () => run$().results[0] ?? null,
    run$,
  };
}

/** An `Env` whose D1 answers `prepare().bind().all()/first()` and `batch()`
 *  through `wranglerSelect`, so the worker's own loaders run read-only. */
function readOnlyEnv() {
  const env = wranglerSelectEnv();
  const DB = {
    prepare: (sql: string) => statement(sql),
    batch: async (statements: Statement[]) => statements.map((s) => s.run$()),
  };
  return { ...env, DB } as unknown as Parameters<typeof loadDayCard>[0] &
    Parameters<typeof loadActiveRules>[0];
}

type StoryRow = ChannelCopyRow & Record<string, unknown> & { id: string };

function ids(list: string[]): string {
  return list.map(literal).join(", ");
}

export async function loadLive(date: string): Promise<PostInput> {
  const env = readOnlyEnv();
  const rules = await loadActiveRules(env);
  const startMs = Date.parse(`${date}T00:00:00+07:00`);
  const endMs = startMs + 24 * 3600 * 1000;
  const channels: PostChannel[] = ["telegram", "telegram-en", "facebook-en"];
  const inChannels = ids(channels);

  const sent = wranglerSelect(
    `SELECT channel, item_id, story_id FROM notifications
     WHERE channel IN (${inChannels}) AND status = 'sent'
       AND posted_at >= ${startMs} AND posted_at < ${endMs}`
  ) as { channel: PostChannel; item_id: string; story_id: string | null }[];
  const storedCaptions = new Map(
    (
      wranglerSelect(
        `SELECT channel, item_id, kind, caption FROM notify_posts
         WHERE channel IN (${inChannels})
           AND sent_at >= ${startMs} AND sent_at < ${endMs}`
      ) as {
        channel: string;
        item_id: string;
        kind: PostItem["form"];
        caption: string;
      }[]
    ).map((row) => [`${row.channel}|${row.item_id}`, row])
  );

  const posts: PostItem[] = [];
  const notes: string[] = [];
  const cards = new Map<Lang, Awaited<ReturnType<typeof loadDayCard>>>();
  for (const lang of ["vi", "en"] as const) {
    cards.set(lang, await loadDayCard(env, date, lang));
  }

  for (const lang of ["vi", "en"] as const) {
    const card = cards.get(lang) ?? null;
    let digest: DailyDigest | null = card
      ? { lang, date, bullets: card.bullets }
      : null;
    if (!digest) {
      const edition = await loadEdition(
        env,
        date,
        lang,
        Number.POSITIVE_INFINITY
      );
      if (edition) {
        digest = {
          lang,
          date,
          bullets: edition.bullets
            .map((b) => ({ text: stripEmbeddedChrome(b.text), url: null }))
            .filter((b) => b.text.length > 0),
        };
      }
    }
    if (!digest) {
      notes.push(`no ${lang} day card or snapshot for ${date}`);
      continue;
    }
    posts.push(
      rebuildTelegramDigest(
        digest,
        card ? { version: card.version, youtubeId: card.youtubeId } : null
      )
    );
    if (lang === "en") {
      const edition = await loadEdition(
        env,
        date,
        "en",
        Number.POSITIVE_INFINITY
      );
      if (edition) {
        posts.push(
          rebuildFacebookDigestPost({
            lang: "en",
            date,
            bullets: edition.bullets
              .map((b) => ({ text: stripEmbeddedChrome(b.text), url: null }))
              .filter((b) => b.text.length > 0),
          })
        );
      }
    }
  }

  // Stories: those sent in the window; with none on a channel, the highlight
  // the digest would post.
  const storyIds = new Map<PostChannel, string[]>();
  for (const channel of channels) {
    const own = sent
      .filter((row) => row.channel === channel)
      .map(
        (row) =>
          row.story_id ??
          (row.item_id.startsWith("digest:") ? null : row.item_id)
      )
      .filter((id): id is string => Boolean(id));
    if (own.length === 0) {
      const lang: Lang = channel === "telegram" ? "vi" : "en";
      const top = (cards.get(lang)?.itemIds ?? []).slice(0, 3);
      if (top.length > 0) {
        storyIds.set(channel, top);
        notes.push(
          `${channel}: nothing sent yet, rebuilt the highlight candidates`
        );
        continue;
      }
    }
    storyIds.set(channel, [...new Set(own)]);
  }

  const rowCache = new Map<string, StoryRow | null>();
  const loadRow = (id: string, lang: Lang): StoryRow | null => {
    const key = `${lang}|${id}`;
    if (!rowCache.has(key)) {
      const copy = storyCopySql(lang);
      const rows = wranglerSelect(
        `SELECT ${copy.columns} FROM items i ${copy.join} WHERE i.id = ${literal(id)}`
      ) as StoryRow[];
      rowCache.set(key, rows[0] ?? null);
    }
    return rowCache.get(key) ?? null;
  };

  for (const channel of channels) {
    const lang: Lang = channel === "telegram" ? "vi" : "en";
    const candidates = storyIds.get(channel) ?? [];
    const sentHere = sent.some((row) => row.channel === channel);
    for (const id of candidates) {
      const row = loadRow(id, lang);
      const stored = storedCaptions.get(`${channel}|${id}`);
      const gated = row ? postableCopy(row, lang, rules) : null;
      if (!(row && gated?.ok)) {
        const reason = !row
          ? "story_not_found"
          : !gated
            ? "no_copy"
            : gated.ok
              ? "unknown"
              : gated.reason;
        if (!sentHere) continue;
        posts.push({
          channel,
          lang,
          kind: "story",
          id,
          source: stored ? "stored" : "rebuilt",
          form: stored?.kind ?? "text",
          text: stored?.caption ?? "",
          links: [],
          title: null,
          summary: null,
          category: null,
          gate: { ok: false, reason },
          media: { kind: "none", urls: [], dropped: [] },
        });
        continue;
      }
      const story = hydrateStory(gated.copy as unknown as NotifyStoryRow);
      if (channel === "facebook-en") {
        posts.push(rebuildFacebookStoryPost(story, { ok: true }));
      } else {
        const summary = wranglerSelect(
          `SELECT text FROM notify_summaries WHERE item_id = ${literal(id)} AND lang = ${literal(lang)}`
        )[0]?.text;
        const withSummary =
          typeof summary === "string" && summary
            ? { ...story, caption_summary: summary }
            : story;
        posts.push(
          rebuildTelegramStory(lang, withSummary, { ok: true }, stored)
        );
      }
      if (!sentHere) break;
    }
  }
  return { date, posts, notes };
}

// ---------------------------------------------------------------------------
// CLI

function flag(argv: readonly string[], name: string): string | undefined {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
}

export function describe(input: PostInput): string {
  const lines = [
    "",
    "## Posts reviewed (judge hook_news and vi_natural from these)",
    ...(input.notes ?? []).map((note) => `note: ${note}`),
  ];
  for (const post of input.posts) {
    lines.push(
      "",
      `### ${label(post)} | ${post.source} | ${post.form} | ${post.lang}`,
      post.kind === "digest" && post.bullets
        ? post.bullets.map((b) => `- ${b.text}`).join("\n")
        : visibleText(post.text) || "(no text built)"
    );
  }
  return lines.join("\n");
}

async function main(argv: string[]): Promise<void> {
  const fixture = flag(argv, "--fixture");
  const date =
    flag(argv, "--date") ?? localCalendarDate(Date.now(), AUDIENCE_TIMEZONE);
  const input: PostInput = fixture
    ? (JSON.parse(readFileSync(fixture, "utf8")) as PostInput)
    : await loadLive(date);
  const save = flag(argv, "--save");
  if (save) writeFileSync(save, `${JSON.stringify(input, null, 2)}\n`);
  emit([scorePosts(input)], argv);
  console.log(describe(input));
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
