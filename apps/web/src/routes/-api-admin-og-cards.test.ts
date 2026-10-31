import { describe, expect, it } from "vitest";
import { pngBytes } from "../lib/__fixtures__/raster";
import { MAX_CARD_UPLOAD_BYTES } from "../lib/og-cards";

const { Route } = await import("./api/admin.$");

type Handler = (args: {
  request: Request;
  params: { _splat: string };
  context: unknown;
}) => Promise<Response>;

const put: Handler = (
  Route as unknown as {
    options: { server: { handlers: { PUT: Handler } } };
  }
).options.server.handlers.PUT;

const TOKEN = ["og", "upload", "test"].join("-");
const HASH = "ab".repeat(32);
const PNG = pngBytes(40, 21);

interface Put {
  key: string;
  bytes: Uint8Array;
  options: R2PutOptions;
}

function bucket(existing: string[] = []) {
  const keys = new Set(existing);
  const puts: Put[] = [];
  return {
    puts,
    binding: {
      async put(key: string, bytes: Uint8Array, options: R2PutOptions) {
        const createOnly =
          options.onlyIf instanceof Headers &&
          options.onlyIf.get("If-None-Match") === "*";
        if (createOnly && keys.has(key)) return null;
        keys.add(key);
        puts.push({ key, bytes, options });
        return { key };
      },
    } as unknown as R2Bucket,
  };
}

function upload(
  splat: string,
  {
    body = PNG,
    token = TOKEN,
    type = "image/png",
    r2 = bucket(),
  }: {
    body?: Uint8Array;
    token?: string | null;
    type?: string;
    r2?: ReturnType<typeof bucket>;
  } = {}
) {
  const headers = new Headers({
    "content-type": type,
    "content-length": String(body.byteLength),
  });
  if (token !== null) headers.set("authorization", `Bearer ${token}`);
  const request = new Request(`https://aidr.today/api/admin/${splat}`, {
    method: "PUT",
    headers,
    body: body as Uint8Array<ArrayBuffer>,
  });
  const env = {
    DB: { prepare: () => ({}) },
    NEWS_ADMIN_TOKEN: TOKEN,
    OG_CACHE: r2.binding,
  };
  return put({
    request,
    params: { _splat: splat },
    context: { cloudflare: { env } },
  });
}

describe("PUT /api/admin/og-cards/<hash>/<lang>.png", () => {
  it("stores a card at its static key, immutable, and only once", async () => {
    const r2 = bucket();
    const first = await upload(`og-cards/${HASH}/vi.png`, { r2 });
    expect(first.status).toBe(201);
    expect(await first.json()).toEqual({
      key: `og-story/${HASH}/vi.png`,
      stored: true,
    });
    expect(r2.puts).toHaveLength(1);
    expect(r2.puts[0]?.bytes).toEqual(PNG);
    expect(r2.puts[0]?.options.httpMetadata).toEqual({
      contentType: "image/png",
      cacheControl: "public, max-age=31536000, immutable",
    });

    // og.aidr.today serves the key as immutable, so a second upload must
    // never replace the bytes already handed out.
    const again = await upload(`og-cards/${HASH}/vi.png`, { r2 });
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ stored: false });
    expect(r2.puts).toHaveLength(1);
  });

  it("refuses a request without the admin token", async () => {
    for (const token of [null, "wrong-token"]) {
      const r2 = bucket();
      const response = await upload(`og-cards/${HASH}/en.png`, { token, r2 });
      expect(response.status, String(token)).toBe(401);
      expect(r2.puts).toEqual([]);
    }
  });

  it("refuses a key outside og-story/<sha256>/<en|vi>.png", async () => {
    for (const splat of [
      `og-cards/${HASH}/fr.png`,
      `og-cards/${HASH}/vi`,
      `og-cards/${HASH.slice(2)}/vi.png`,
      `og-cards/${"Z".repeat(64)}/vi.png`,
      "og-cards/..%2Fog-day/vi.png",
    ]) {
      const r2 = bucket();
      const response = await upload(splat, { r2 });
      expect(response.status, splat).toBe(400);
      expect(r2.puts).toEqual([]);
    }
    const nested = bucket();
    const response = await upload(`og-cards/x/${HASH}/vi.png`, { r2: nested });
    expect(response.status).toBe(404);
    expect(nested.puts).toEqual([]);
  });

  it("refuses a body that is not a PNG or is too large", async () => {
    const jpegType = await upload(`og-cards/${HASH}/en.png`, {
      type: "image/jpeg",
    });
    expect(jpegType.status).toBe(415);

    const notPng = await upload(`og-cards/${HASH}/en.png`, {
      body: new TextEncoder().encode("<svg></svg>"),
    });
    expect(notPng.status).toBe(415);

    const big = new Uint8Array(MAX_CARD_UPLOAD_BYTES + 1);
    big.set(PNG.subarray(0, 8));
    const r2 = bucket();
    const tooBig = await upload(`og-cards/${HASH}/en.png`, { body: big, r2 });
    expect(tooBig.status).toBe(413);
    expect(r2.puts).toEqual([]);
  });
});
