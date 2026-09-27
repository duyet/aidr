import { afterEach, describe, expect, it, vi } from "vitest";
import { SITE_NAME } from "../../src/lib/site.js";
import type { FeedItem } from "../../src/lib/types.js";
import {
  checkIvCaption,
  checkIvDimensions,
  evaluateIvFieldGate,
  IV_MEDIA_PROBE_BYTES,
  IV_UNRESOLVED,
  isIvStoryId,
  ivCardUrl,
  ivPreflightMissing,
  ivPreflightVerdict,
  normalizePublishedAtSeconds,
  preflightIvRemoteMedia,
  RHASH_PLACEHOLDER,
  rejectIvMediaUrl,
  renderIvChecklist,
  sniffIvImageHeader,
  TELEGRAM_IV_LIMITS,
  TELEGRAM_IV_LINK_SHAPE,
} from "../telegram-iv.js";

afterEach(() => vi.unstubAllGlobals());

const item = (over: Partial<FeedItem> = {}): FeedItem => ({
  id: "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
  url: "https://example.com/story",
  title: "OpenAI ships GPT-6",
  title_vi: "OpenAI ra mắt GPT-6",
  summary: "First paragraph of the English summary.\n\nSecond paragraph.",
  summary_vi: "Đoạn tóm tắt tiếng Việt.",
  category: "llm",
  published_at: 1_757_000_000,
  points: 120,
  comments: 45,
  rank_score: 30,
  source_id: "src",
  tags: ["llm"],
  sources: [
    {
      kind: "source",
      author: null,
      posted_at: null,
      quote: null,
      url: "https://example.com/story",
    },
  ],
  llm_tokens: 100,
  image_url: "https://img.example/thumb.jpg",
  ...over,
});

/** Minimal valid PNG header for 1200x630 (the generated card's shape). */
function pngBytes(width: number, height: number, padTo = 0): Uint8Array {
  const buf = new Uint8Array(Math.max(24, padTo));
  const view = new DataView(buf.buffer);
  view.setUint32(0, 0x89504e47);
  view.setUint32(4, 0x0d0a1a0a);
  view.setUint32(8, 13);
  view.setUint32(12, 0x49484452);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return buf;
}

function imageResponse(
  body: Uint8Array,
  contentType = "image/png",
  contentLength?: number
): Response {
  const headers = new Headers({ "content-type": contentType });
  if (contentLength !== undefined) {
    headers.set("content-length", String(contentLength));
  }
  return new Response(new Blob([body.slice().buffer]), {
    status: 200,
    headers,
  });
}

describe("normalizePublishedAtSeconds boundary", () => {
  it("normalizes a millisecond published_at to Unix seconds, never year 2286", () => {
    const seconds = 1_757_000_000;
    const result = normalizePublishedAtSeconds(seconds * 1000);
    expect(result.ok).toBe(true);
    expect(result.unixSeconds).toBe(seconds);
    expect(result.normalizedFromMilliseconds).toBe(true);
    const rendered = new Date((result.unixSeconds as number) * 1000);
    expect(rendered.getUTCFullYear()).toBe(2025);
    expect(rendered.getUTCFullYear()).not.toBe(2286);
  });

  it("rejects a millisecond value that does not normalize into the window", () => {
    const result = normalizePublishedAtSeconds(1e18);
    expect(result.ok).toBe(false);
    expect(result.unixSeconds).toBeNull();
    expect(result.reason).toBe("published_at_out_of_range");
  });

  it("rejects missing / non-finite / non-positive values", () => {
    for (const value of [null, undefined, Number.NaN, 0, -1, "1757000000"]) {
      const result = normalizePublishedAtSeconds(value);
      expect(result.ok).toBe(false);
      expect(result.unixSeconds).toBeNull();
    }
  });
});

describe("checkIvDimensions boundary", () => {
  it("accepts width + height exactly at the 10,000 px ceiling", () => {
    const result = checkIvDimensions(5_000, 5_000);
    expect(result.ok).toBe(true);
    expect(result.width + result.height).toBe(10_000);
  });

  it("rejects width + height one pixel over 10,000", () => {
    const result = checkIvDimensions(5_001, 5_000);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("image_dimensions_exceeded");
  });

  it("accepts an aspect ratio of exactly 20", () => {
    const result = checkIvDimensions(1_000, 50);
    expect(result.aspectRatio).toBe(20);
    expect(result.ok).toBe(true);
  });

  it("rejects an aspect ratio just over 20", () => {
    const result = checkIvDimensions(1_000, 49);
    expect(result.aspectRatio).toBeCloseTo(1000 / 49, 5);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("image_aspect_exceeded");
  });

  it("fails closed when dimensions cannot be proven", () => {
    expect(checkIvDimensions(null, 100).reason).toBe(
      "image_dimensions_unknown"
    );
    expect(checkIvDimensions(0, 0).reason).toBe("image_dimensions_unknown");
  });

  it("keeps the generated 1200x630 card under both ceilings", () => {
    const result = checkIvDimensions(1_200, 630);
    expect(result.ok).toBe(true);
    expect(result.width + result.height).toBeLessThanOrEqual(
      TELEGRAM_IV_LIMITS.dimensionSumPx
    );
  });
});

describe("checkIvCaption boundary", () => {
  it("accepts a caption of exactly 1024 characters", () => {
    const result = checkIvCaption("x".repeat(TELEGRAM_IV_LIMITS.captionChars));
    expect(result.length).toBe(1_024);
    expect(result.ok).toBe(true);
    expect(result.remaining).toBe(0);
  });

  it("rejects a caption one character over 1024", () => {
    const result = checkIvCaption("x".repeat(1_025));
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("caption_too_long");
    expect(result.remaining).toBe(-1);
  });
});

describe("Telegram limit constants", () => {
  it("encodes the documented ceilings", () => {
    expect(TELEGRAM_IV_LIMITS.httpUrlPhotoBytes).toBe(5 * 1024 * 1024);
    expect(TELEGRAM_IV_LIMITS.multipartUploadPhotoBytes).toBe(10 * 1024 * 1024);
    expect(TELEGRAM_IV_LIMITS.dimensionSumPx).toBe(10_000);
    expect(TELEGRAM_IV_LIMITS.aspectRatio).toBe(20);
    expect(TELEGRAM_IV_LIMITS.captionChars).toBe(1_024);
  });
});

describe("sniffIvImageHeader", () => {
  it("reads PNG IHDR dimensions", () => {
    expect(sniffIvImageHeader(pngBytes(1_200, 630))).toEqual({
      mime: "image/png",
      width: 1_200,
      height: 630,
    });
  });

  it("reads JPEG SOF0 dimensions past an APP0 segment", () => {
    const buf = new Uint8Array(64);
    const view = new DataView(buf.buffer);
    buf[0] = 0xff;
    buf[1] = 0xd8; // SOI
    buf[2] = 0xff;
    buf[3] = 0xe0; // APP0
    view.setUint16(4, 16); // segment length -> next marker at 20
    buf[20] = 0xff;
    buf[21] = 0xc0; // SOF0
    view.setUint16(22, 17); // segment length
    buf[24] = 8; // precision
    view.setUint16(25, 630); // height
    view.setUint16(27, 1_200); // width
    expect(sniffIvImageHeader(buf)).toEqual({
      mime: "image/jpeg",
      width: 1_200,
      height: 630,
    });
  });

  it("returns null for an unsupported container", () => {
    expect(sniffIvImageHeader(new TextEncoder().encode("<svg/>"))).toBeNull();
  });
});

describe("rejectIvMediaUrl — fail closed", () => {
  it("rejects a missing image", () => {
    expect(rejectIvMediaUrl("")).toBe("image_missing");
    expect(rejectIvMediaUrl(null)).toBe("image_missing");
  });

  it("rejects plain HTTP", () => {
    expect(rejectIvMediaUrl("http://img.example/a.png")).toBe(
      "image_url_not_https"
    );
  });

  it("rejects a private-literal host", () => {
    expect(rejectIvMediaUrl("https://127.0.0.1/a.png")).toBe(
      "image_url_private_host"
    );
    expect(rejectIvMediaUrl("https://169.254.169.254/a.png")).toBe(
      "image_url_private_host"
    );
    expect(rejectIvMediaUrl("https://[::1]/a.png")).toBe(
      "image_url_private_host"
    );
  });

  it("rejects a credentialed URL", () => {
    expect(rejectIvMediaUrl("https://user:pw@img.example/a.png")).toBe(
      "image_url_credentialed"
    );
  });

  it("rejects a non-default port and a malformed URL", () => {
    expect(rejectIvMediaUrl("https://img.example:8443/a.png")).toBe(
      "image_url_non_default_port"
    );
    expect(rejectIvMediaUrl("not a url")).toBe("image_url_malformed");
  });

  it("rejects a non-fetchable and a generic/unsafe image URL", () => {
    expect(rejectIvMediaUrl("ftp://img.example/a.png")).toBe(
      "image_url_not_https"
    );
    expect(rejectIvMediaUrl("https://metadata.google.internal/a.png")).toBe(
      "image_url_private_host"
    );
  });
});

describe("preflightIvRemoteMedia", () => {
  it("accepts a 5 MB-bound PNG probe and never reads the whole file", async () => {
    const bytes = pngBytes(1_200, 630, IV_MEDIA_PROBE_BYTES + 1_000);
    const fetchMock = vi
      .fn()
      .mockResolvedValue(imageResponse(bytes, "image/png", bytes.length));
    vi.stubGlobal("fetch", fetchMock);

    const result = await preflightIvRemoteMedia("https://img.example/a.png");
    expect(result.ok).toBe(true);
    expect(result.mime).toBe("image/png");
    expect(result.dimensions?.width).toBe(1_200);
    expect(result.dimensions?.height).toBe(630);
    // Bounded: at most the probe window, never the declared file size.
    expect(result.probeBytes).toBeLessThanOrEqual(IV_MEDIA_PROBE_BYTES);
    expect(result.probeBytes).toBeLessThan(bytes.length);
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).Range).toBe(
      `bytes=0-${IV_MEDIA_PROBE_BYTES - 1}`
    );
  });

  it("rejects exactly at 5 MB + 1 byte declared", async () => {
    const oversize = TELEGRAM_IV_LIMITS.httpUrlPhotoBytes + 1;
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          imageResponse(pngBytes(10, 10), "image/png", oversize)
        )
    );
    const result = await preflightIvRemoteMedia("https://img.example/big.png");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("image_oversized");
    expect(result.declaredBytes).toBe(oversize);
  });

  it("accepts exactly at 5 MB declared", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          imageResponse(
            pngBytes(1_200, 630),
            "image/png",
            TELEGRAM_IV_LIMITS.httpUrlPhotoBytes
          )
        )
    );
    const result = await preflightIvRemoteMedia(
      "https://img.example/exact.png"
    );
    expect(result.ok).toBe(true);
    expect(result.declaredBytes).toBe(TELEGRAM_IV_LIMITS.httpUrlPhotoBytes);
  });

  it("rejects an unsupported container by content type", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          imageResponse(new TextEncoder().encode("<svg/>"), "image/svg+xml")
        )
    );
    const result = await preflightIvRemoteMedia(
      "https://img.example/figure.svg"
    );
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("image_unsupported_container");
  });

  it("rejects a declared PNG whose bytes are not a PNG", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          imageResponse(
            new TextEncoder().encode("<html>not an image</html>"),
            "image/png"
          )
        )
    );
    const result = await preflightIvRemoteMedia("https://img.example/liar.png");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("image_unsupported_container");
  });

  it("rejects dimensions over the ceilings", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(imageResponse(pngBytes(9_000, 2_000)))
    );
    const result = await preflightIvRemoteMedia("https://img.example/huge.png");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("image_dimensions_exceeded");
  });

  it("fails closed on an unreachable candidate and never probes the body", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);
    const result = await preflightIvRemoteMedia("https://img.example/gone.png");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("image_unreachable");
    expect(result.probeBytes).toBe(0);
  });

  it("fails closed on a non-200 response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("nope", { status: 404 }))
    );
    const result = await preflightIvRemoteMedia("https://img.example/404.png");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("image_unreachable");
    expect(result.httpStatus).toBe(404);
  });

  it("never emits a signed query string in the redacted URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(imageResponse(pngBytes(1_200, 630)))
    );
    const result = await preflightIvRemoteMedia(
      "https://cdn.example/a.png?X-Amz-Signature=deadbeefcafe&policy=zzz"
    );
    expect(result.redactedUrl).toBe("https://cdn.example/[path-redacted]");
    expect(result.redactedUrl).not.toContain("deadbeefcafe");
    expect(JSON.stringify(result)).not.toContain("deadbeefcafe");
  });

  it("rejects a private-literal URL before any network call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await preflightIvRemoteMedia("https://127.0.0.1/a.png");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("image_url_private_host");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("evaluateIvFieldGate — field contract", () => {
  it("accepts a fully eligible story and points at the generated card", () => {
    const gate = evaluateIvFieldGate(item(), "en");
    expect(gate.iv_eligible).toBe(true);
    expect(gate.reason).toBe("ok");
    expect(gate.fields.image_url.value).toBe(
      "https://aidr.today/api/og/abcdef12.png?lang=en"
    );
    expect(gate.fields.image_url.detail?.kind).toBe(
      "generated_first_party_card"
    );
    expect(gate.fields.site_name.value).toBe(SITE_NAME);
    expect(gate.fields.published_date.detail?.unix_seconds).toBe(1_757_000_000);
  });

  it("reads site_name from the single shared constant, never a literal", () => {
    const gate = evaluateIvFieldGate(item(), "en");
    expect(gate.fields.site_name.detail?.source).toContain("site.ts");
    expect(gate.fields.site_name.value).toBe(SITE_NAME);
  });

  it("resolves the Vietnamese title when title_vi exists", () => {
    const gate = evaluateIvFieldGate(item(), "vi");
    expect(gate.fields.title.value).toBe("OpenAI ra mắt GPT-6");
    expect(gate.rendered_lang).toBe("vi");
    expect(gate.fallback_from_en).toBe(false);
  });

  it("reports an EXPLICIT EN fallback when title_vi is missing", () => {
    const gate = evaluateIvFieldGate(
      item({ title_vi: null, summary_vi: null, title: "OpenAI ships GPT-6" }),
      "vi"
    );
    // Not a Vietnamese render, and never a machine translation.
    expect(gate.fallback_from_en).toBe(true);
    expect(gate.rendered_lang).toBe("en");
    expect(gate.fields.title.value).toBe("OpenAI ships GPT-6");
    expect(gate.fields.title.detail?.fallback_from_en).toBe(true);
    expect(gate.fields.title.detail?.rendered_lang).toBe("en");
  });

  it("keeps the EN fallback explicit when only the summary is translated", () => {
    // A Vietnamese summary with an English headline is still an English
    // title render; the badge must not be suppressed.
    const gate = evaluateIvFieldGate(
      item({ title_vi: null, title: "OpenAI ships GPT-6" }),
      "vi"
    );
    expect(gate.fallback_from_en).toBe(true);
    expect(gate.fields.title.value).toBe("OpenAI ships GPT-6");
  });

  it("treats a blank title_vi as missing", () => {
    const gate = evaluateIvFieldGate(item({ title_vi: "   " }), "vi");
    expect(gate.fallback_from_en).toBe(true);
  });

  it("uses the first summary paragraph of the rendered locale as description", () => {
    const en = evaluateIvFieldGate(item(), "en");
    expect(en.fields.description.value).toBe(
      "First paragraph of the English summary."
    );
    const vi = evaluateIvFieldGate(item(), "vi");
    expect(vi.fields.description.value).toBe("Đoạn tóm tắt tiếng Việt.");
  });

  it("fails closed when the rendered body has no source link", () => {
    // An unsafe article URL is dropped by the Markdown renderer, so the body
    // renders with no source link at all.
    const gate = evaluateIvFieldGate(
      item({ url: "javascript:alert(1)", sources: [] }),
      "en"
    );
    expect(gate.iv_eligible).toBe(false);
    expect(gate.reasons).toContain("body_missing_source_links");
  });

  it("fails closed when the body has no real summary", () => {
    const gate = evaluateIvFieldGate(
      item({ summary: null, summary_vi: null }),
      "en"
    );
    expect(gate.iv_eligible).toBe(false);
    // The renderer substitutes "No summary is available."; the gate must
    // NOT accept that placeholder as a body.
    expect(gate.reasons).toContain("body_missing_summary");
  });

  it("fails closed on a millisecond published_at instead of emitting 2286", () => {
    // A millisecond value must normalize, and must never reach Telegram as
    // a year-2286 timestamp.
    const gate = evaluateIvFieldGate(
      item({ published_at: 1_757_000_000_000 }),
      "en"
    );
    const field = gate.fields.published_date;
    expect(field.ok).toBe(true);
    expect(field.detail?.normalized_from_milliseconds).toBe(true);
    expect(field.detail?.unix_seconds).toBe(1_757_000_000);
    expect(field.value).toBe("2025-09-04T15:33:20.000Z");
    expect(field.value).not.toContain("2286");
  });

  it("fails closed on an out-of-window published_at", () => {
    const gate = evaluateIvFieldGate(item({ published_at: 1e18 }), "en");
    expect(gate.iv_eligible).toBe(false);
    expect(gate.reasons).toContain("published_at_out_of_range");
  });

  it("fails closed on a missing title and description", () => {
    const gate = evaluateIvFieldGate(
      item({ title: "   ", summary: null, summary_vi: null }),
      "en"
    );
    expect(gate.iv_eligible).toBe(false);
    expect(gate.reasons).toContain("title_missing");
    expect(gate.reasons).toContain("description_missing");
  });

  it("fails closed on a non-hex story id prefix", () => {
    const gate = evaluateIvFieldGate(item({ id: "NOTHEX12zz" }), "en");
    expect(gate.iv_eligible).toBe(false);
    expect(gate.reasons).toContain("image_missing");
  });

  it("isIvStoryId accepts only the 8-hex permalink prefix", () => {
    expect(isIvStoryId("abcdef12")).toBe(true);
    expect(isIvStoryId("ABCDEF12")).toBe(false);
    expect(isIvStoryId("abcdef123")).toBe(false);
    expect(isIvStoryId("")).toBe(false);
  });

  it("builds a card URL without a fragment and with exactly one lang", () => {
    const url = new URL(ivCardUrl("abcdef12", "vi"));
    expect(url.origin).toBe("https://aidr.today");
    expect(url.pathname).toBe("/api/og/abcdef12.png");
    expect(url.searchParams.getAll("lang")).toEqual(["vi"]);
    expect(url.hash).toBe("");
  });
});

describe("ivPreflightVerdict — the record's hard rules", () => {
  it("keeps editor_query_template null and rhash a labelled placeholder", () => {
    const verdict = ivPreflightVerdict(item(), "vi", 1_757_000_000_000);
    expect(verdict.editor_query_template).toBeNull();
    expect(verdict.iv_link_shape).toBe(TELEGRAM_IV_LINK_SHAPE);
    expect(verdict.iv_link_shape).toContain(RHASH_PLACEHOLDER);
    const rhash = verdict.unresolved.find((u) => u.key === "rhash");
    expect(rhash?.value).toBe(RHASH_PLACEHOLDER);
    expect(rhash?.note).toMatch(/never fabricated/i);
  });

  it("prints the exact source URL with no UTM and no fragment", () => {
    const verdict = ivPreflightVerdict(item(), "en");
    expect(verdict.source_url).toBe("https://aidr.today/abcdef12?lang=en");
    expect(verdict.source_url).not.toContain("utm_");
  });

  it("never emits a credential-shaped string in the report text", () => {
    const verdict = ivPreflightVerdict(
      item({
        title: "Token abc: sk-abcdefghijklmnop and Bearer zzz",
        summary_vi: "password: hunter2",
      }),
      "vi"
    );
    const text = JSON.stringify(verdict);
    expect(text).not.toMatch(/sk-abcdefghijklmnop/);
    expect(text).not.toMatch(/Bearer zzz/);
    expect(text).not.toMatch(/hunter2/);
    expect(text).toContain("[redacted]");
  });

  it("lists every unresolved item the record still owes a human", () => {
    const keys = IV_UNRESOLVED.map((entry) => entry.key);
    expect(keys).toContain("rhash");
    expect(keys).toContain("editor_query_template");
    expect(keys).toContain("telegram_acceptance");
  });

  it("keeps the digest explicitly excluded from IV", () => {
    // The digest is a changing list, not an article: no digest-shaped
    // candidate is ever produced by the gate.
    const verdict = ivPreflightVerdict(item(), "vi");
    expect(verdict.source_url).toMatch(
      /^\/api\/og\/|aidr\.today\/[0-9a-f]{8}\?lang=/
    );
    expect(verdict.source_url).not.toContain("digest");
  });

  it("the printed checklist carries no invented rhash and no credential", () => {
    const verdict = ivPreflightVerdict(
      item({ title: "Leak: token=abcd1234 and Bearer zzzyyyy" }),
      "vi"
    );
    const text = renderIvChecklist(verdict, {
      url: "https://aidr.today/api/og/abcdef12.png?lang=vi",
      status: 200,
      content_type: "image/png",
      width: 1_200,
      height: 630,
      within_limits: true,
      error: null,
    });
    // The only rhash token present is the literal placeholder.
    const rhashTokens = text.match(/rhash=\S+/g) ?? [];
    expect(rhashTokens).toEqual([`rhash=${RHASH_PLACEHOLDER}`]);
    expect(text).toContain(RHASH_PLACEHOLDER);
    expect(text).not.toMatch(/rhash=[A-Za-z0-9]{8,}/);
    // No credential-shaped string survives into the report.
    expect(text).not.toContain("abcd1234");
    expect(text).not.toContain("zzzyyyy");
    expect(text).not.toContain("TELEGRAM_CHAT_ID");
    expect(text).not.toMatch(/\b-100\d{6,}\b/);
    expect(text).not.toMatch(/bot\d{6,}:/);
  });

  it("the checklist never emits a query template", () => {
    const verdict = ivPreflightVerdict(item(), "en");
    const text = renderIvChecklist(verdict);
    expect(text).toContain("editor_query_template = null");
    expect(text).not.toMatch(/editor_query_template\s*=\s*"(?!null)/);
    // Exactly one t.me/iv mention, and it is the documentation shape.
    expect(text.match(/t\.me\/iv/g)).toHaveLength(1);
  });

  it("a missing/ambiguous id yields a structured fail-closed verdict", () => {
    const missing = ivPreflightMissing("abcdef12", "story_not_found", "vi");
    expect(missing.iv_eligible).toBe(false);
    expect(missing.reason).toBe("story_not_found");
    expect(missing.source_url).toBe("https://aidr.today/abcdef12?lang=vi");

    const ambiguous = ivPreflightMissing(
      "abcdef12",
      "ambiguous_id_prefix",
      "en"
    );
    expect(ambiguous.reason).toBe("ambiguous_id_prefix");

    const invalid = ivPreflightMissing("zz", "invalid_id_prefix", "en");
    expect(invalid.source_url).toBe("");
    expect(invalid.fields.image_url.ok).toBe(false);
  });
});
