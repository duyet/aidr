#!/usr/bin/env tsx
/**
 * Run the Telegram IV field gate from the repo root, without a browser and
 * without any Telegram credential.
 *
 * Reads the public `/api/story/{id8}` representation — the same row and the
 * same `?lang` contract the permalink page renders — feeds it to the exact
 * gate the Worker exposes at `GET /api/admin/notify/iv`, then probes the
 * generated first-party card over HTTP so the report also proves the image
 * Telegram would fetch really answers 200 image/png at 1200x630.
 *
 * It enables nothing. There is no template, no `rhash`, and no query template
 * here: the report prints the unresolved items as clearly-labelled
 * placeholders, exactly as `docs/decisions/telegram-instant-view.md` requires.
 *
 * Usage:
 *   pnpm --filter @aidr/web exec tsx scripts/telegram-iv-gate.ts \
 *     --id <8hex> --lang vi|en [--base https://aidr.today] [--image <https url>]
 */
import { isLang } from "../src/lib/lang";
import type { FeedItem, Lang } from "../src/lib/types";
import {
  IV_MEDIA_PROBE_BYTES,
  type IvCardProbe,
  isIvStoryId,
  ivPreflightVerdict,
  preflightIvRemoteMedia,
  renderIvChecklist,
  TELEGRAM_IV_LIMITS,
} from "../worker/telegram-iv";

const DEFAULT_BASE = "https://aidr.today";
const PROBE_TIMEOUT_MS = 20_000;

interface Args {
  base: string;
  id: string;
  lang: Lang;
  image: string;
}

function fail(message: string): never {
  process.stdout.write(`${JSON.stringify({ ok: false, error: message })}\n`);
  process.exit(1);
}

function parseArgs(argv: string[]): Args {
  const out: Record<string, string> = { base: DEFAULT_BASE, lang: "vi" };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (
      flag === "--id" ||
      flag === "--lang" ||
      flag === "--base" ||
      flag === "--image"
    ) {
      out[flag.slice(2)] = argv[++i] ?? "";
    } else {
      fail(`unknown argument: ${flag}`);
    }
  }
  const id = (out.id ?? "").trim().toLowerCase();
  if (!isIvStoryId(id)) {
    fail(
      "--id must be exactly 8 lowercase hex characters (the story_id8 prefix)"
    );
  }
  const lang = (out.lang ?? "vi").trim();
  if (!isLang(lang)) fail("--lang must be vi or en");
  return {
    base: (out.base || DEFAULT_BASE).replace(/\/+$/, ""),
    id,
    lang,
    image: (out.image ?? "").trim(),
  };
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
  });
  if (!res.ok) fail(`GET ${url} returned ${res.status}`);
  return (await res.json()) as unknown;
}

/** Read at most `IV_MEDIA_PROBE_BYTES`, then cancel. */
async function readWindow(res: Response): Promise<Uint8Array> {
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < IV_MEDIA_PROBE_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    chunks.push(value);
    total += value.byteLength;
  }
  try {
    await reader.cancel();
  } catch {
    /* already closed */
  }
  const window = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= total) break;
    window.set(chunk.subarray(0, total - offset), offset);
    offset += chunk.byteLength;
  }
  return window;
}

/**
 * Range-probe the generated card and read the PNG IHDR, so "1200x630" is
 * proven from the bytes rather than asserted from a constant.
 */
async function probeGeneratedCard(url: string): Promise<IvCardProbe> {
  const base: IvCardProbe = {
    url,
    status: null,
    content_type: null,
    width: null,
    height: null,
    within_limits: false,
    error: null,
  };
  if (!url) return { ...base, error: "no-card-url" };
  try {
    const res = await fetch(url, {
      headers: { Range: `bytes=0-${IV_MEDIA_PROBE_BYTES - 1}` },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    const content_type = res.headers.get("content-type");
    if (!res.ok && res.status !== 206) {
      return { ...base, status: res.status, content_type, error: "not-ok" };
    }
    const window = await readWindow(res);
    const view =
      window.length >= 24
        ? new DataView(window.buffer, window.byteOffset, window.byteLength)
        : null;
    const isPng =
      view !== null &&
      view.getUint32(0) === 0x89504e47 &&
      view.getUint32(4) === 0x0d0a1a0a;
    const width = isPng && view ? view.getUint32(16) : null;
    const height = isPng && view ? view.getUint32(20) : null;
    const withinLimits =
      width !== null &&
      height !== null &&
      width + height <= TELEGRAM_IV_LIMITS.dimensionSumPx &&
      Math.max(width, height) / Math.min(width, height) <=
        TELEGRAM_IV_LIMITS.aspectRatio;
    return {
      url,
      status: res.status,
      content_type,
      width,
      height,
      within_limits: withinLimits,
      error: isPng ? null : "not-a-png",
    };
  } catch (error) {
    return {
      ...base,
      error: error instanceof Error ? error.message : "fetch-failed",
    };
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const storyUrl = `${args.base}/api/story/${args.id}?lang=${args.lang}`;
  const item = (await fetchJson(storyUrl)) as FeedItem;
  if (!item || typeof item !== "object" || typeof item.id !== "string") {
    fail(`GET ${storyUrl} did not return a story object`);
  }

  // The same verdict the Worker's GET /api/admin/notify/iv returns, from the
  // same module, so the CLI and the API cannot drift.
  const verdict = ivPreflightVerdict(item, args.lang);
  const card = await probeGeneratedCard(verdict.fields.image_url.value ?? "");
  const media = args.image ? await preflightIvRemoteMedia(args.image) : null;
  if (media) {
    verdict.remote_candidate = {
      ok: media.ok,
      reason: media.reason,
      redacted_url: media.redactedUrl,
      http_status: media.httpStatus,
      declared_bytes: media.declaredBytes,
      mime: media.mime,
      width: media.dimensions?.width ?? null,
      height: media.dimensions?.height ?? null,
      probe_bytes: media.probeBytes,
      max_bytes: verdict.limits.httpUrlPhotoBytes,
      note: "Bounded range probe; the Worker never downloads or proxies the file.",
    };
  }

  process.stdout.write(
    `${renderIvChecklist(verdict, card)}\n\n${JSON.stringify({ ...verdict, card }, null, 2)}\n`
  );
  if (!verdict.iv_eligible) process.exit(1);
}

main().catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});
