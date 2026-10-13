#!/usr/bin/env tsx
/**
 * Swap the generated OG card for the story's real image on recent Telegram
 * story posts, with every live edit logged to production `admin_audit`.
 *
 * A post went out with the card (`/api/og/<id8>.png`, 1200x630) when the story
 * had no image at send time, or when Telegram rejected the gallery image. Once
 * the story has a real image (PR 622: marketbrief suffix, avatar filter, arXiv
 * figure), `editMessageMedia` puts it on the post and resends the caption,
 * entities and button exactly as they were, read by forwarding the post to the
 * staging chat.
 *
 * Evidence, both required before an edit:
 * - D1. `last_error` shows a gallery fallback that ended on the card
 *   (`fallback_to_card`), or the stored image fields give an empty gallery
 *   (`no_image_at_send`). The second is an approximation of the pre-622
 *   rules: no `image_url` and no image or poster in `media_manifest`, read
 *   from the item row as it is now, not as it was at send time. Fallback
 *   notes exist only since #601 (2026-10-11); an older fallback is invisible.
 *   After 622 deploys, a `sendPhoto:` note can also mean a later gallery
 *   photo landed; only the size check below tells that post from the card.
 * - Telegram. The forwarded post's largest photo is exactly 1200x630. A real
 *   og:image of that size would pass too; the D1 gate keeps that rare.
 *
 * Env: TELEGRAM_BOT_TOKEN, TELEGRAM_STAGING_CHAT_ID (repo-root .env.local),
 * CLOUDFLARE_ACCOUNT_ID for `cf d1`.
 *
 * Usage:
 *   pnpm --filter @aidr/web telegram-swap-card [--days 7] [--only <story8>] [--apply]
 *
 * The default is a dry run: plans plus staging test sends, one
 * `telegram.edit_media.plan` audit row, nothing edited live. Rerunning after
 * `--apply` edits nothing: edited posts are `already_real` from the audit log
 * and from their photo size, and Telegram's "not modified" counts as done.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { STORY_OG_HEIGHT, STORY_OG_WIDTH } from "../src/lib/story-og.js";
import type { Lang } from "../src/lib/types.js";
import { fetchArxivFigure } from "../worker/enrich.js";
import { parseMediaManifest } from "../worker/media.js";
import { hydrateStory } from "../worker/notify/index.js";
import { resolveStoryMedia } from "../worker/notify/telegram.js";
import { cf, D1_DATABASE_ID, d1ResultRows } from "./cf-d1.js";

export type Evidence = "no_image_at_send" | "fallback_to_card";
export type Skip = "text_post" | "no_real_image" | "already_real" | "not_card";
export type ReplacementSource = "gallery" | "arxiv_figure";

const TOOL = "apps/web/scripts/telegram-swap-card.ts";
const EDIT_ACTION = "telegram.edit_media";
const PLAN_ACTION = "telegram.edit_media.plan";
/** Same bound as the notifier's gallery retries. */
const REPLACEMENT_ATTEMPTS = 3;
const CHANNEL_LANG: Record<string, Lang> = {
  telegram: "vi",
  "telegram-en": "en",
};

/** One Telegram story post as production D1 recorded it. */
export interface StorySend {
  itemId: string;
  channel: string;
  lang: Lang;
  /** `notifications.target`: the chat the message lives in. */
  chat: string;
  messageId: number;
  lastError: string | null;
  url: string;
  title: string;
  imageUrl: string | null;
  mediaManifest: string | null;
}

export interface PhotoSize {
  width: number;
  height: number;
}

/** What the live post carries: its largest photo, other media, or nothing. */
export type PostMedia =
  | ({ kind: "photo" } & PhotoSize)
  | { kind: "other"; type: string }
  | { kind: "text" };

interface PlanBase {
  story: string;
  channel: string;
  lang: Lang;
  chat: string;
  messageId: number;
  from: string;
  evidence: Evidence | null;
  /** The live post's media, absent when it was not read. */
  media?: PostMedia;
}

export type EditPlan = PlanBase &
  (
    | { skip: Skip; to: null; source: null; candidates: string[] }
    | {
        skip?: undefined;
        to: string;
        source: ReplacementSource;
        candidates: string[];
      }
  );

export interface PlanFacts {
  /** A prior `telegram.edit_media` row already put a real image here. */
  edited: boolean;
  /** Read from the forwarded post; required once the D1 evidence holds. */
  media?: PostMedia;
  /** First figure of an arXiv paper, looked up when the gallery is empty. */
  arxivFigure: string | null;
}

/** What D1 says went out: the card, a text post, or (null) a real image. */
export function sendEvidence(send: StorySend): Evidence | "text_post" | null {
  const note = send.lastError ?? "";
  // Pre-622 notifier: every photo path that ended in text pushed this marker.
  if (note.includes("photo:none_sent")) return "text_post";
  // A gallery photo was rejected and the post still went out: on the card.
  if (note.includes("sendPhoto:")) return "fallback_to_card";
  return hadNoImageAtSend(send) ? "no_image_at_send" : null;
}

function hadNoImageAtSend(send: StorySend): boolean {
  if (send.imageUrl?.trim()) return false;
  const manifest = parseMediaManifest(send.mediaManifest);
  return !manifest.assets.some(
    (asset) =>
      asset.type === "image" ||
      (asset.type === "video" && Boolean(asset.poster_url))
  );
}

function storyFor(send: StorySend) {
  return hydrateStory({
    id: send.itemId,
    url: send.url,
    title: send.title,
    summary: null,
    image_url: send.imageUrl,
    media_manifest: send.mediaManifest,
    category: null,
    points: 0,
    comments: 0,
    rank_score: 0,
    llm_importance: null,
    lang: send.lang,
  });
}

/** The images production would send for this story today. */
export function replacementGallery(send: StorySend): string[] {
  return resolveStoryMedia(storyFor(send)).gallery.slice(
    0,
    REPLACEMENT_ATTEMPTS
  );
}

export function cardUrl(send: StorySend): string {
  const { card } = resolveStoryMedia(storyFor(send));
  if (!card) throw new Error(`story ${send.itemId} cannot address a card`);
  return card;
}

export function isCardSize(photo: PhotoSize): boolean {
  return photo.width === STORY_OG_WIDTH && photo.height === STORY_OG_HEIGHT;
}

export function buildEditPlan(send: StorySend, facts: PlanFacts): EditPlan {
  const evidence = sendEvidence(send);
  const base = {
    story: send.itemId.slice(0, 8),
    channel: send.channel,
    lang: send.lang,
    chat: send.chat,
    messageId: send.messageId,
    from: cardUrl(send),
    ...(facts.media ? { media: facts.media } : {}),
  };
  const skip = (reason: Skip): EditPlan => ({
    ...base,
    evidence: evidence === "text_post" ? null : evidence,
    skip: reason,
    to: null,
    source: null,
    candidates: [],
  });
  if (evidence === null) return skip("not_card");
  if (evidence === "text_post") return skip("text_post");
  if (facts.edited) return skip("already_real");
  if (!facts.media) {
    throw new Error(`post ${send.chat}#${send.messageId} was not read`);
  }
  if (facts.media.kind === "text") return skip("text_post");
  if (facts.media.kind === "other" || !isCardSize(facts.media)) {
    return skip("already_real");
  }

  const gallery = replacementGallery(send);
  const candidates =
    gallery.length > 0 ? gallery : facts.arxivFigure ? [facts.arxivFigure] : [];
  if (candidates.length === 0) return skip("no_real_image");
  return {
    ...base,
    evidence,
    to: candidates[0],
    source: gallery.length > 0 ? "gallery" : "arxiv_figure",
    candidates,
  };
}

export type EditResult = "ok" | "unchanged" | "failed";

export interface EditContext {
  runId: string;
  gitSha: string;
  captionChars: number;
}

export function editAuditDetail(
  plan: EditPlan & { skip?: undefined },
  result: EditResult,
  description: string,
  context: EditContext
) {
  return {
    v: 1,
    story: plan.story,
    lang: plan.lang,
    chat: plan.chat,
    message_id: plan.messageId,
    evidence: plan.evidence,
    from: plan.from,
    to: plan.to,
    source: plan.source,
    result,
    description,
    caption_chars: context.captionChars,
    dry_run: false,
    tool: TOOL,
    git_sha: context.gitSha,
    run_id: context.runId,
  };
}

/** Parameterized: the detail JSON rides as a bound value, never inside SQL. */
export function auditInsert(action: string, ts: number, detail: unknown) {
  return {
    sql: "INSERT INTO admin_audit (ts, action, detail) VALUES (CAST(? AS INTEGER), ?, ?) RETURNING id",
    params: [ts, action, JSON.stringify(detail)],
  };
}

export function editResult(response: TelegramResponse): EditResult {
  if (response.ok) return "ok";
  return /message is not modified/i.test(response.description ?? "")
    ? "unchanged"
    : "failed";
}

interface TelegramResponse {
  ok: boolean;
  result?: unknown;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
}

const OTHER_MEDIA = [
  "animation",
  "video",
  "document",
  "audio",
  "video_note",
  "sticker",
] as const;

interface ForwardedPost
  extends Partial<Record<(typeof OTHER_MEDIA)[number], unknown>> {
  photo?: PhotoSize[];
  caption?: string;
  caption_entities?: unknown[];
  reply_markup?: unknown;
  message_id: number;
}

interface LivePost {
  media: PostMedia;
  caption: string | null;
  captionEntities: unknown[];
  replyMarkup: unknown;
}

interface StagingAttempt {
  url: string;
  ok: boolean;
  description?: string;
}

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} must be set`);
  return value;
}

async function telegram(
  method: string,
  body: Record<string, unknown>
): Promise<TelegramResponse> {
  const token = requireEnv("TELEGRAM_BOT_TOKEN");
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const json = (await res.json()) as TelegramResponse;
    if (json.ok || json.error_code !== 429 || attempt >= 3) return json;
    await sleep((json.parameters?.retry_after ?? 5) * 1000 + 500);
  }
}

function d1(sql: string, params: unknown[]): Record<string, unknown>[] {
  const rows = d1ResultRows(
    cf([
      "d1",
      "query",
      D1_DATABASE_ID,
      "--body",
      JSON.stringify({ sql, params }),
    ])
  );
  if (!Array.isArray(rows)) throw new Error("cf d1 returned no rows array");
  return rows as Record<string, unknown>[];
}

function loadSends(days: number, only: string | null): StorySend[] {
  const rows = d1(
    `SELECT n.channel, n.item_id, n.target, n.message_id, n.last_error,
            i.url, i.title, i.image_url, i.media_manifest
     FROM notifications n JOIN items i ON i.id = n.item_id
     WHERE n.channel IN ('telegram', 'telegram-en') AND n.status = 'sent'
       AND n.item_id NOT LIKE 'digest:%' AND n.message_id IS NOT NULL
       AND n.posted_at >= ? AND n.item_id LIKE ?
     ORDER BY n.posted_at, n.channel`,
    [Date.now() - days * 86_400_000, `${only ?? ""}%`]
  );
  return rows.map((row) => ({
    itemId: String(row.item_id),
    channel: String(row.channel),
    lang: CHANNEL_LANG[String(row.channel)],
    chat: String(row.target),
    messageId: Number(row.message_id),
    lastError: (row.last_error as string | null) ?? null,
    url: String(row.url),
    title: String(row.title ?? ""),
    imageUrl: (row.image_url as string | null) ?? null,
    mediaManifest: (row.media_manifest as string | null) ?? null,
  }));
}

/** Posts a prior run (or the hand backfill) already moved off the card. */
function loadEditedPosts(): Set<string> {
  const edited = new Set<string>();
  for (const row of d1("SELECT detail FROM admin_audit WHERE action = ?", [
    EDIT_ACTION,
  ])) {
    const detail = JSON.parse(String(row.detail)) as {
      chat: string;
      message_id: number;
      result: EditResult;
    };
    if (detail.result !== "failed") {
      edited.add(`${detail.chat}#${detail.message_id}`);
    }
  }
  return edited;
}

/** Forward the live post to staging to read it, then delete the copy. */
async function readLivePost(send: StorySend, staging: string) {
  const res = await telegram("forwardMessage", {
    chat_id: staging,
    from_chat_id: send.chat,
    message_id: send.messageId,
    disable_notification: true,
  });
  if (!res.ok) {
    throw new Error(
      `forward ${send.chat}#${send.messageId} failed: ${res.description}`
    );
  }
  const post = res.result as ForwardedPost;
  await telegram("deleteMessage", {
    chat_id: staging,
    message_id: post.message_id,
  });
  const largest = (post.photo ?? []).reduce<PhotoSize | null>(
    (best, size) =>
      !best || size.width * size.height > best.width * best.height
        ? { width: size.width, height: size.height }
        : best,
    null
  );
  const other = OTHER_MEDIA.find((type) => post[type] !== undefined);
  return {
    media: largest
      ? { kind: "photo", ...largest }
      : other
        ? { kind: "other", type: other }
        : { kind: "text" },
    caption: post.caption ?? null,
    captionEntities: post.caption_entities ?? [],
    replyMarkup: post.reply_markup ?? null,
  } satisfies LivePost;
}

function photoMedia(url: string, post: LivePost) {
  return {
    type: "photo",
    media: url,
    caption: post.caption,
    caption_entities: post.captionEntities,
  };
}

/** First candidate staging accepts with the post's own caption and button. */
async function stageReplacement(
  plan: EditPlan & { skip?: undefined },
  post: LivePost,
  staging: string
): Promise<StagingAttempt[]> {
  if (!post.caption || !post.replyMarkup) {
    // An edit without them would strip the caption and the Read button.
    return [
      {
        url: plan.to,
        ok: false,
        description: "live post has no caption or button",
      },
    ];
  }
  const attempts: StagingAttempt[] = [];
  for (const url of plan.candidates) {
    const res = await telegram("sendPhoto", {
      chat_id: staging,
      photo: url,
      caption: post.caption,
      caption_entities: post.captionEntities,
      reply_markup: post.replyMarkup,
      disable_notification: true,
    });
    attempts.push({ url, ok: res.ok, description: res.description });
    if (res.ok) break;
  }
  return attempts;
}

function gitSha(): string {
  return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
    encoding: "utf8",
  }).trim();
}

function describeMedia(media: PostMedia | undefined): string {
  if (!media) return "-";
  if (media.kind === "photo") return `${media.width}x${media.height}`;
  return media.kind === "other" ? media.type : "text";
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const days = Number(flag("--days") ?? 7);
  const only = flag("--only") ?? null;
  const apply = args.includes("--apply");
  if (!Number.isFinite(days) || days <= 0)
    throw new Error("--days must be > 0");
  if (only !== null && !/^[0-9a-f]{8}$/.test(only)) {
    throw new Error("--only takes a story8 id");
  }
  const staging = requireEnv("TELEGRAM_STAGING_CHAT_ID");
  requireEnv("TELEGRAM_BOT_TOKEN");

  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(16).slice(2, 6)}`;
  const sha = gitSha();
  const logDir = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../.telegram-edits"
  );
  mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `${runId}.jsonl`);
  const unrecorded: unknown[] = [];

  /** Local copy first, so a crash or an unreachable D1 still leaves a record. */
  function audit(action: string, detail: unknown): number | null {
    const ts = Date.now();
    const line = { action, ts, detail };
    appendFileSync(logFile, `${JSON.stringify(line)}\n`);
    const { sql, params } = auditInsert(action, ts, detail);
    try {
      return Number(d1(sql, params)[0]?.id);
    } catch (error) {
      console.error(
        `AUDIT INSERT FAILED (${(error as Error).message}); insert by hand:\n${JSON.stringify(line)}`
      );
      unrecorded.push(line);
      return null;
    }
  }

  const sends = loadSends(days, only);
  const edited = loadEditedPosts();
  const posts = new Map<EditPlan, LivePost>();
  const staged = new Map<EditPlan, StagingAttempt[]>();
  const plans: EditPlan[] = [];

  for (const send of sends) {
    const isEdited = edited.has(`${send.chat}#${send.messageId}`);
    const evidence = sendEvidence(send);
    let post: LivePost | undefined;
    let arxivFigure: string | null = null;
    if (evidence && evidence !== "text_post" && !isEdited) {
      post = await readLivePost(send, staging);
      if (replacementGallery(send).length === 0) {
        arxivFigure = (await fetchArxivFigure(send.url))?.url ?? null;
      }
    }
    let plan = buildEditPlan(send, {
      edited: isEdited,
      media: post?.media,
      arxivFigure,
    });
    if (!plan.skip && post) {
      const attempts = await stageReplacement(plan, post, staging);
      const accepted = attempts.find((attempt) => attempt.ok);
      plan = accepted
        ? { ...plan, to: accepted.url }
        : { ...plan, skip: "no_real_image", to: null, source: null };
      staged.set(plan, attempts);
      posts.set(plan, post);
    }
    plans.push(plan);
  }

  for (const plan of plans) {
    const outcome = plan.skip
      ? `skip ${plan.skip}`
      : `-> ${plan.source} ${plan.to}`;
    const attempts = staged.get(plan) ?? [];
    const stagingNote = attempts
      .map((a) => (a.ok ? "staging ok" : `staging rejected: ${a.description}`))
      .join("; ");
    console.log(
      [
        plan.story,
        plan.channel,
        `#${plan.messageId}`,
        plan.evidence ?? "-",
        describeMedia(plan.media),
        outcome,
        stagingNote,
      ]
        .filter(Boolean)
        .join("  ")
    );
  }

  const planRowId = audit(PLAN_ACTION, {
    v: 1,
    run_id: runId,
    days,
    only,
    dry_run: !apply,
    tool: TOOL,
    git_sha: sha,
    plans: plans.map((plan) => ({
      ...plan,
      staging: staged.get(plan) ?? [],
    })),
  });
  console.log(`plan audit row: ${planRowId ?? "NOT RECORDED"} (${logFile})`);

  if (apply && planRowId === null) {
    throw new Error("D1 audit is unreachable; no live edit was attempted");
  }
  let failed = 0;
  if (apply) {
    for (const plan of plans) {
      if (plan.skip) continue;
      const post = posts.get(plan);
      if (!post) throw new Error(`no live post read for ${plan.story}`);
      let result: EditResult;
      let description: string;
      try {
        const res = await telegram("editMessageMedia", {
          chat_id: plan.chat,
          message_id: plan.messageId,
          media: photoMedia(plan.to, post),
          reply_markup: post.replyMarkup,
        });
        result = editResult(res);
        description = res.description ?? "edited";
      } catch (error) {
        // A timeout may still have landed; the next run's size check sees it.
        result = "failed";
        description = `threw: ${(error as Error).message}; outcome unknown`;
      }
      if (result === "failed") failed++;
      const id = audit(
        EDIT_ACTION,
        editAuditDetail(plan, result, description, {
          runId,
          gitSha: sha,
          captionChars: post.caption?.length ?? 0,
        })
      );
      console.log(
        `edit ${plan.story} ${plan.channel} #${plan.messageId}: ${result} (audit ${id ?? "NOT RECORDED"})`
      );
    }
  }

  if (unrecorded.length > 0) {
    console.error(
      `${unrecorded.length} audit row(s) missing from D1; see ${logFile}`
    );
    process.exit(2);
  }
  if (failed > 0) process.exit(1);
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  await main();
}
