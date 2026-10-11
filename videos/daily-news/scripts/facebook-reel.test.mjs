// node --test videos/daily-news/scripts/*.test.mjs
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { DEFAULT_GRAPH_VERSION, findReel, graphVersion, postReel, reelCaption, reelLink, reelRequest } from "./facebook-reel.mjs";

const cfg = { pageId: "123456", token: "PAGE_TOKEN", version: "v26.0" };
const ok = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) });
const tmpFile = (content) => {
  const file = join(mkdtempSync(join(tmpdir(), "reel-")), "r.mp4");
  writeFileSync(file, content);
  return file;
};

/** A fetch that answers calls from `answers` in order and records the requests. */
function fakeFetch(answers) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const a = answers.shift();
    if (!a) throw new Error(`unexpected call ${url}`);
    return a;
  };
  fn.calls = calls;
  return fn;
}

test("graph version default matches the Worker channel", () => {
  const ts = readFileSync(resolve(import.meta.dirname, "../../../apps/web/worker/notify/facebook.ts"), "utf8");
  assert.equal(ts.match(/DEFAULT_GRAPH_VERSION = "(v[\d.]+)"/)[1], DEFAULT_GRAPH_VERSION);
  assert.equal(graphVersion(""), DEFAULT_GRAPH_VERSION);
  assert.equal(graphVersion("v25.0"), "v25.0");
  assert.throws(() => graphVersion("26"));
});

test("start, upload and finish requests follow the Reels publishing API", () => {
  const start = reelRequest("start", cfg);
  assert.equal(start.url, "https://graph.facebook.com/v26.0/123456/video_reels");
  assert.deepEqual(JSON.parse(start.init.body), { upload_phase: "start", access_token: "PAGE_TOKEN" });

  const up = reelRequest("upload", { ...cfg, videoId: "987", bytes: 42, data: Buffer.alloc(42) });
  assert.equal(up.url, "https://rupload.facebook.com/video-upload/v26.0/987");
  assert.equal(up.init.headers.Authorization, "OAuth PAGE_TOKEN");
  assert.equal(up.init.headers.offset, "0");
  assert.equal(up.init.headers.file_size, "42");

  const fin = JSON.parse(reelRequest("finish", { ...cfg, videoId: "987", description: "hello" }).init.body);
  assert.deepEqual(fin, { upload_phase: "finish", video_id: "987", video_state: "PUBLISHED", description: "hello", access_token: "PAGE_TOKEN" });
});

test("postReel saves the id before uploading, sends the file, and waits until published", async () => {
  const file = tmpFile(Buffer.alloc(1000, 1));
  const f = fakeFetch([
    ok({ video_id: "987", upload_url: "https://rupload.facebook.com/video-upload/v26.0/987" }),
    ok({ success: true }),
    ok({ success: true }),
    ok({ status: { video_status: "processing", publishing_phase: { status: "not_started" } } }),
    ok({ status: { video_status: "ready", publishing_phase: { status: "complete", publish_status: "published" } } }),
  ]);
  const saved = [];
  const out = await postReel({
    ...cfg,
    file,
    description: "Today in AI",
    fetchImpl: f,
    onVideoId: (id) => saved.push([id, f.calls.length]),
    wait: { sleep: async () => {} },
  });
  assert.equal(out.videoId, "987");
  assert.deepEqual(saved, [["987", 1]]); // recorded after start, before the upload
  assert.equal(f.calls[1].init.body.length, 1000);
  assert.match(f.calls[3].url, /\/987\?fields=status/);
});

test("an unclear finish answer polls the status instead of publishing twice", async () => {
  const f = fakeFetch([
    ok({ video_id: "1" }),
    ok({ success: true }),
    { ok: false, status: 502, text: async () => "<html>bad gateway</html>" },
    ok({ status: { video_status: "ready", publishing_phase: { publish_status: "published" } } }),
  ]);
  const out = await postReel({ ...cfg, file: tmpFile("x"), description: "d", fetchImpl: f, wait: { sleep: async () => {} } });
  assert.equal(out.videoId, "1");
  assert.equal(f.calls.filter((c) => typeof c.init.body === "string" && c.init.body.includes('"finish"')).length, 1);
});

test("a permission error names the scopes and never leaks the token", async () => {
  const f = fakeFetch([
    { ok: false, status: 403, text: async () => JSON.stringify({ error: { code: 200, message: "Requires pages_manage_posts PAGE_TOKEN" } }) },
  ]);
  await assert.rejects(postReel({ ...cfg, file: tmpFile("x"), description: "d", fetchImpl: f }), (e) => {
    assert.match(e.message, /pages_read_engagement/);
    assert.doesNotMatch(e.message, /PAGE_TOKEN/);
    return true;
  });
});

test("engagement bait is refused before any request", async () => {
  const f = fakeFetch([]);
  await assert.rejects(postReel({ ...cfg, file: "/nope", description: "Like and share!", fetchImpl: f }), /engagement bait/);
  assert.equal(f.calls.length, 0);
});

const published = ok({ status: { video_status: "ready", publishing_phase: { publish_status: "published" } } });

test("a resumed post that is already published only polls", async () => {
  const f = fakeFetch([published, published]);
  const out = await postReel({ ...cfg, file: "/nope", description: "d", fetchImpl: f, resumeVideoId: "55", wait: { sleep: async () => {} } });
  assert.equal(out.resumed, true);
  assert.ok(f.calls.every((c) => c.init.method === "GET"));
});

test("a resumed post that uploaded but never published is finished once", async () => {
  const f = fakeFetch([
    ok({ status: { video_status: "upload_complete", uploading_phase: { status: "complete" }, publishing_phase: { status: "not_started" } } }),
    ok({ success: true }),
    published,
  ]);
  const out = await postReel({ ...cfg, file: "/nope", description: "d", fetchImpl: f, resumeVideoId: "55", wait: { sleep: async () => {} } });
  assert.equal(out.videoId, "55");
  assert.equal(JSON.parse(f.calls[1].init.body).upload_phase, "finish");
  assert.equal(JSON.parse(f.calls[1].init.body).video_id, "55");
});

test("a resumed post whose upload failed starts a new session", async () => {
  const f = fakeFetch([
    ok({ status: { video_status: "upload_failed", publishing_phase: { status: "not_started" } } }),
    ok({ video_id: "77" }),
    ok({ success: true }),
    ok({ success: true }),
    published,
  ]);
  const out = await postReel({ ...cfg, file: tmpFile("x"), description: "d", fetchImpl: f, resumeVideoId: "55", wait: { sleep: async () => {} } });
  assert.equal(out.videoId, "77");
});

test("findReel matches the day link in a Reel description", async () => {
  const f = fakeFetch([
    ok({ data: [{ id: "a", description: "other" }, { id: "b", description: "x https://aidr.today/date/2026-10-10?utm_source=facebook" }] }),
  ]);
  assert.equal((await findReel({ ...cfg, marker: "aidr.today/date/2026-10-10", fetchImpl: f })).id, "b");
  assert.match(f.calls[0].url, /\/123456\/video_reels\?fields=id,description,created_time/);
});

test("the caption is the posts.md Facebook block with the reel-attributed day link", () => {
  const md = readFileSync(resolve(import.meta.dirname, "../editions/2026-10-10/posts.md"), "utf8");
  const cap = reelCaption(md, "2026-10-10", "en");
  assert.match(cap, /^Today in AI:/);
  assert.ok(cap.includes(reelLink("2026-10-10")));
  assert.equal(reelLink("2026-10-10"), "https://aidr.today/date/2026-10-10?utm_source=facebook&utm_medium=reel");
  assert.doesNotMatch(cap, /## X/);
});
