import { cache, ImageResponse } from "@cf-wasm/og/workerd";
import { createFileRoute } from "@tanstack/react-router";
import { readSession } from "../../lib/db";
import { idPrefixFromSlug } from "../../lib/slug";
import { getStory } from "../../lib/story-queries";
import type { FeedItem } from "../../lib/types";

/** Story OG cards are deterministic per item id; rendered PNGs are
 * edge-cacheable for a week. */
const OG_CACHE_CONTROL =
  "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400";

const PAPER = "#f7f7f5";
const INK = "#0a0a0a";
const MUTED = "#6b6b6b";
const YELLOW = "#f5c518";

type AssetEnv = { ASSETS?: { fetch: (r: Request) => Promise<Response> } };

function assetsGet(path: string): Request {
  // Same trick as worker/public-assets.ts — bypass SPA not_found handling.
  return new Request(`https://assets.local${path}`, {
    method: "GET",
    headers: { Accept: "*/*" },
  });
}

async function loadFont(
  env: AssetEnv | undefined,
  path: string
): Promise<ArrayBuffer | null> {
  try {
    const res = await env?.ASSETS?.fetch(assetsGet(path));
    if (!res?.ok) return null;
    const buf = await res.arrayBuffer();
    return buf.byteLength > 1000 ? buf : null;
  } catch {
    return null;
  }
}

function storyDomain(item: FeedItem): string {
  try {
    return new URL(item.url).hostname.replace(/^www\./, "");
  } catch {
    return "aidr.today";
  }
}

function storyDate(item: FeedItem): string {
  return new Date(item.published_at * 1000).toISOString().slice(0, 10);
}

function ogCard(item: FeedItem) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "1200px",
        height: "630px",
        backgroundColor: PAPER,
        color: INK,
        padding: "48px 56px 0",
        fontFamily: "EB Garamond",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: "22px",
          borderBottom: `3px solid ${INK}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "52px",
              height: "52px",
              backgroundColor: YELLOW,
              color: INK,
              fontSize: "30px",
              fontWeight: 700,
            }}
          >
            ;
          </div>
          <div style={{ fontSize: "40px", fontWeight: 700 }}>AI;DR</div>
        </div>
        <div style={{ fontSize: "24px", color: MUTED }}>aidr.today</div>
      </div>
      <div
        style={{
          display: "flex",
          flex: 1,
          alignItems: "center",
          padding: "24px 0",
        }}
      >
        <div
          style={{
            fontSize: "56px",
            fontWeight: 500,
            lineHeight: 1.2,
            display: "-webkit-box",
            overflow: "hidden",
          }}
        >
          {item.title}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "20px 0 28px",
          fontSize: "24px",
          color: MUTED,
        }}
      >
        <div style={{ display: "flex", gap: "20px" }}>
          <span>{storyDomain(item)}</span>
          <span>·</span>
          <span>{storyDate(item)}</span>
          {item.category ? (
            <>
              <span>·</span>
              <span>{item.category}</span>
            </>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: "20px" }}>
          <span>{item.points} points</span>
          <span>·</span>
          <span>{item.comments} comments</span>
        </div>
      </div>
      <div style={{ height: "10px", backgroundColor: YELLOW }} />
    </div>
  );
}

export const Route = createFileRoute("/api/og/$id")({
  server: {
    handlers: {
      GET: async ({
        params,
        context,
      }: {
        params: { id: string };
        context: any;
      }) => {
        let env =
          context?.cloudflare?.env ||
          context?.env ||
          (globalThis as any).CF_ENV;
        if (!env?.DB) {
          try {
            env = (await import("cloudflare:workers")).env;
          } catch {
            // not running in a workers runtime
          }
        }
        const ctx = context?.cloudflare?.ctx ?? context?.ctx;
        if (ctx?.waitUntil) cache.setExecutionContext(ctx);
        const db: D1Database | undefined = env?.DB;
        if (!db) {
          return Response.json(
            { error: "D1 binding DB not configured" },
            { status: 500 }
          );
        }
        // substr-prefix match treats "" as a wildcard — require a real
        // hex prefix like the permalink route does.
        const idPrefix = idPrefixFromSlug(
          params.id.replace(/\.png$/i, "").slice(0, 64)
        );
        if (!idPrefix) {
          return Response.json({ error: "not found" }, { status: 404 });
        }
        const item = await getStory(readSession(db), idPrefix);
        if (!item) {
          return Response.json({ error: "not found" }, { status: 404 });
        }
        const [medium, bold] = await Promise.all([
          loadFont(env, "/fonts/eb-garamond-500.ttf"),
          loadFont(env, "/fonts/eb-garamond-700.ttf"),
        ]);
        const fonts = [
          medium && {
            name: "EB Garamond",
            data: medium,
            weight: 500 as const,
            style: "normal" as const,
          },
          bold && {
            name: "EB Garamond",
            data: bold,
            weight: 700 as const,
            style: "normal" as const,
          },
        ].filter((f): f is NonNullable<typeof f> => Boolean(f));
        return await ImageResponse.async(ogCard(item), {
          width: 1200,
          height: 630,
          ...(fonts.length ? { fonts } : {}),
          headers: { "Cache-Control": OG_CACHE_CONTROL },
        });
      },
    },
  },
});
