import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ImageResponse } from "@cf-wasm/og/node";
import {
  DAY_CARD_CANDIDATES,
  hasDayOgCopy,
  isDayCardPhotoUrl,
} from "../src/lib/day-card-pick";
import {
  DAY_OG_HEIGHT,
  DAY_OG_WIDTH,
  dayCardModel,
  dayOgCard,
} from "../src/lib/day-og";
import type { DbReader } from "../src/lib/db";
import { getDayArchive } from "../src/lib/feed-queries";
import { loadStoryOgFonts } from "../src/lib/og-fonts";
import {
  fetchStoryOgImage,
  type StoryOgImage,
  storyOgImageFromBytes,
} from "../src/lib/story-og";
import type { FeedItem, Lang } from "../src/lib/types";

const USAGE = `usage (from the repo root):
  pnpm exec tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/render-day-cards.ts pull <fixture-dir> <YYYY-MM-DD>...
  pnpm exec tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/render-day-cards.ts render <fixture-dir> <out-dir> [spec...]

pull    reads each day from production D1 (SELECT only, through wrangler) with
        the same getDayArchive the route uses, and downloads its photos.
render  draws every fixture in en and vi. A spec is a fixture date, optionally
        cut to the first N stories published that day ("2026-10-14@3"), or
        "empty:YYYY-MM-DD:pending|settled" for a day with no stories.`;

const LANGS: Lang[] = ["en", "vi"];

interface Fixture {
  date: string;
  items: FeedItem[];
}

function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

function inlineBinds(sql: string, binds: unknown[]): string {
  let i = 0;
  return sql.replace(/\?/g, () => sqlLiteral(binds[i++]));
}

/** The account wrangler.toml deploys to, unless the shell names one. */
function accountId(): string {
  if (process.env.CLOUDFLARE_ACCOUNT_ID)
    return process.env.CLOUDFLARE_ACCOUNT_ID;
  const toml = readFileSync(resolve("apps/web/wrangler.toml"), "utf8");
  const id = /^account_id\s*=\s*"([^"]+)"/m.exec(toml)?.[1];
  if (!id) throw new Error("set CLOUDFLARE_ACCOUNT_ID");
  return id;
}

/** Runs read statements on production D1 through wrangler. Anything that is
 *  not a SELECT throws before it leaves the machine. */
function wranglerSelect(statements: string[]): Array<{ results: unknown[] }> {
  for (const sql of statements) {
    if (!/^\s*SELECT\b/i.test(sql)) throw new Error(`not a SELECT: ${sql}`);
  }
  const out = execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--remote",
      "--json",
      "--command",
      statements.join(";\n"),
    ],
    {
      cwd: resolve("apps/web"),
      encoding: "utf8",
      timeout: 120_000,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        CLOUDFLARE_ACCOUNT_ID: accountId(),
        FORCE_COLOR: "0",
      },
    }
  );
  return JSON.parse(out.slice(out.indexOf("[")));
}

class Statement {
  constructor(
    readonly sql: string,
    readonly binds: unknown[] = []
  ) {}
  bind(...binds: unknown[]) {
    return new Statement(this.sql, binds);
  }
  text() {
    return inlineBinds(this.sql, this.binds);
  }
  async all() {
    return wranglerSelect([this.text()])[0];
  }
  async first() {
    return (await this.all()).results[0] ?? null;
  }
}

const productionReader = {
  prepare: (sql: string) => new Statement(sql),
  batch: async (stmts: Statement[]) =>
    wranglerSelect(stmts.map((s) => s.text())),
} as unknown as DbReader;

function photoPath(dir: string, url: string): string {
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 24);
  return resolve(dir, "photos", hash);
}

async function pull(dir: string, dates: string[]) {
  await mkdir(resolve(dir, "photos"), { recursive: true });
  for (const date of dates) {
    const archive = await getDayArchive(productionReader, date);
    const items = archive.day?.items ?? [];
    await writeFile(
      resolve(dir, `${date}.json`),
      JSON.stringify({ date, items } satisfies Fixture)
    );
    // The day's top candidates, plus its first stories for "@N" cuts.
    const earliest = [...items]
      .sort((a, b) => a.published_at - b.published_at)
      .slice(0, 8);
    const urls = new Set<string>();
    for (const lang of LANGS) {
      for (const item of [
        ...items
          .filter((it) => hasDayOgCopy(it, lang))
          .slice(0, DAY_CARD_CANDIDATES),
        ...earliest,
      ]) {
        if (isDayCardPhotoUrl(item.image_url)) urls.add(item.image_url);
      }
    }
    let ok = 0;
    for (const url of urls) {
      const image = await fetchStoryOgImage(url, { timeoutMs: 8000 });
      const path = photoPath(dir, url);
      if (image) {
        ok++;
        await writeFile(
          path,
          Buffer.from(
            image.dataUri.slice(image.dataUri.indexOf(",") + 1),
            "base64"
          )
        );
      } else {
        await writeFile(`${path}.miss`, url);
      }
    }
    console.log(`${date}: ${items.length} stories, photos ${ok}/${urls.size}`);
  }
}

async function cachedPhoto(
  dir: string,
  url: string
): Promise<StoryOgImage | null> {
  try {
    return storyOgImageFromBytes(
      new Uint8Array(await readFile(photoPath(dir, url)))
    );
  } catch {
    return null;
  }
}

interface Case {
  name: string;
  date: string;
  items: FeedItem[];
  today: boolean;
}

async function loadCase(dir: string, spec: string): Promise<Case> {
  const empty = /^empty:(\d{4}-\d{2}-\d{2}):(pending|settled)$/.exec(spec);
  if (empty) {
    const today = empty[2] === "pending";
    return { name: `empty-${empty[2]}`, date: empty[1], items: [], today };
  }
  const [date, cut] = spec.split("@");
  const fixture = JSON.parse(
    await readFile(resolve(dir, `${date}.json`), "utf8")
  ) as Fixture;
  let items = fixture.items;
  if (cut) {
    const firstIds = new Set(
      [...items]
        .sort((a, b) => a.published_at - b.published_at)
        .slice(0, Number(cut))
        .map((it) => it.id)
    );
    items = items.filter((it) => firstIds.has(it.id));
  }
  // A cut stands for the same day early on, while it is still today.
  return {
    name: cut ? `${date}-first${cut}` : date,
    date,
    items,
    today: Boolean(cut),
  };
}

async function render(dir: string, outDir: string, specs: string[]) {
  const fonts = await loadStoryOgFonts(
    async (path) =>
      (await readFile(resolve("apps/web", `public${path}`)))
        .buffer as ArrayBuffer
  );
  if (fonts.length !== 2) throw new Error("both card font weights must load");
  const all =
    specs.length > 0
      ? specs
      : (await readdir(dir))
          .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
          .map((f) => f.slice(0, 10));
  await mkdir(outDir, { recursive: true });
  for (const spec of all) {
    const c = await loadCase(dir, spec);
    for (const lang of LANGS) {
      const model = await dayCardModel({
        date: c.date,
        lang,
        items: c.items,
        today: c.today,
        fetchPhoto: (url) => cachedPhoto(dir, url),
      });
      const res = await ImageResponse.async(dayOgCard(model), {
        width: DAY_OG_WIDTH,
        height: DAY_OG_HEIGHT,
        fonts,
      });
      const out = resolve(outDir, `${c.name}-${lang}.png`);
      await writeFile(out, new Uint8Array(await res.arrayBuffer()));
      console.log(`${out}  ${model.layout.variant}`);
    }
  }
}

const [, , mode, ...args] = process.argv;
if (mode === "pull" && args.length >= 2) {
  await pull(resolve(args[0]), args.slice(1));
} else if (mode === "render" && args.length >= 2) {
  await render(resolve(args[0]), resolve(args[1]), args.slice(2));
} else {
  throw new Error(USAGE);
}
