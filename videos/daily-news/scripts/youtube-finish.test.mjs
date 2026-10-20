// node --test videos/daily-news/scripts/youtube-finish.test.mjs
// A video that reached YouTube but missed its thumbnail or playlist is finished on a rerun, never left public and bare.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { pathToFileURL } from "node:url";
import {
  finishSteps,
  finishTodo,
  parseUpload,
  pendingSteps,
  uploadArgs,
} from "./status.mjs";

const UPLOADER = resolve(
  import.meta.dirname,
  "../../../.agents/skills/aidr-youtube-upload/bin/yt-upload-api.mjs"
);
const ID = "abcdefghijk";

const work = mkdtempSync(join(tmpdir(), "yt-finish-"));
after(() => rmSync(work, { recursive: true, force: true }));
const log = join(work, "calls.log");
const stub = join(work, "stub.mjs");
const mp4 = join(work, "cut.mp4");
const cover = join(work, "cover.png");
const meta = join(work, "meta.json");
writeFileSync(mp4, "video");
writeFileSync(cover, "png");
writeFileSync(meta, JSON.stringify({ title: "T", desc: "D", tags: "a,b" }));
writeFileSync(
  stub,
  `import { appendFileSync } from "node:fs";
const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers });
globalThis.fetch = async (url, init = {}) => {
  const u = String(url);
  appendFileSync(process.env.STUB_LOG, \`\${init.method ?? "GET"} \${u.replace(/\\?.*/, "")}\\n\`);
  if (u.includes("oauth2.googleapis.com")) return json({ access_token: "t" });
  if (u.includes("/channels"))
    return json({ items: [{ id: "UCGDB5uD8znydgMg2XLOj04w", snippet: { title: "AI;DR" } }] });
  if (u.includes("uploadType=resumable"))
    return new Response("", { status: 200, headers: { location: "https://upload.stub/session" } });
  if (u === "https://upload.stub/session") return json({ id: "${ID}" });
  if (u.includes("/thumbnails/set"))
    return process.env.STUB_FAIL === "thumbnail" ? json({ error: { message: "boom" } }, 500) : json({});
  if (u.includes("/playlists")) return json({ items: [{ id: "PL1", snippet: { title: "AI;DR" } }] });
  if (u.includes("/playlistItems") && (init.method ?? "GET") === "GET")
    return json({ items: process.env.STUB_IN_PLAYLIST ? [{ id: "PLI1" }] : [] });
  if (u.includes("/playlistItems"))
    return process.env.STUB_FAIL === "playlist" ? json({ error: { message: "boom" } }, 503) : json({});
  if (u.includes("oembed")) return new Response("{}", { status: 200 });
  throw new Error(\`unstubbed fetch \${u}\`);
};
`
);

function runUploader(args, fail = "", inPlaylist = false) {
  writeFileSync(log, "");
  const r = spawnSync(
    process.execPath,
    ["--import", pathToFileURL(stub).href, UPLOADER, ...args],
    {
      encoding: "utf8",
      env: {
        ...process.env,
        YOUTUBE_CLIENT_ID: "x",
        YOUTUBE_CLIENT_SECRET: "x",
        YOUTUBE_REFRESH_TOKEN: "x",
        STUB_LOG: log,
        STUB_FAIL: fail,
        STUB_IN_PLAYLIST: inPlaylist ? "1" : "",
      },
    }
  );
  return {
    code: r.status,
    out: r.stdout,
    up: parseUpload(r.stdout),
    calls: readFileSync(log, "utf8"),
  };
}

function upload(extra, fail = "", inPlaylist = false) {
  return runUploader(
    [
      mp4,
      "--meta",
      meta,
      "--lang",
      "en",
      "--kind",
      "long",
      "--cover",
      cover,
      ...extra,
    ],
    fail,
    inPlaylist
  );
}

test("a thumbnail failure after the upload prints the id and no finished steps", () => {
  const r = upload([], "thumbnail");
  assert.equal(r.code, 1);
  assert.equal(r.up.id, ID);
  assert.deepEqual(r.up.done, []);
  assert.match(r.up.fail, /^thumbnail/);
});

test("a playlist failure keeps the thumbnail as done", () => {
  const r = upload([], "playlist");
  assert.equal(r.code, 1);
  assert.deepEqual(r.up.done, ["thumb"]);
});

test("--finish sets the missing steps on the existing video without uploading", () => {
  const r = upload(["--finish", ID, "--steps", "thumb,playlist,oembed"]);
  assert.equal(r.code, 0);
  assert.equal(r.up.id, ID);
  assert.deepEqual(r.up.done, ["thumb", "playlist", "oembed"]);
  assert.doesNotMatch(
    r.calls,
    /upload\.stub|uploadType|\/upload\/youtube\/v3\/videos/
  );
  assert.match(r.calls, /thumbnails\/set/);
});

test("--steps limits --finish to the steps still pending", () => {
  const r = upload(["--finish", ID, "--steps", "playlist"]);
  assert.equal(r.code, 0);
  assert.deepEqual(r.up.done, ["playlist"]);
  assert.doesNotMatch(r.calls, /thumbnails\/set/);
});

test("a full upload reports every step done", () => {
  const r = upload([]);
  assert.equal(r.code, 0);
  assert.deepEqual(r.up.done, ["thumb", "playlist", "oembed"]);
});

test("pending steps are what the uploader did not report done", () => {
  const long = { fmt: "16x9", cover };
  const short = { fmt: "9x16", cover };
  assert.deepEqual(finishSteps(long, "public"), [
    "thumb",
    "playlist",
    "oembed",
  ]);
  assert.deepEqual(finishSteps(short, "public"), ["playlist", "oembed"]);
  assert.deepEqual(finishSteps(long, "unlisted"), ["thumb", "playlist"]);
  assert.deepEqual(
    pendingSteps(
      finishSteps(long, "public"),
      parseUpload("ID=x\nDONE=thumb\nFAIL: playlist\n")
    ),
    ["playlist", "oembed"]
  );
});

test("a cut with pending steps is finished on rerun; a clean or seeded one is not", () => {
  const rows = [
    {
      cut: "a",
      lang: "en",
      youtube: { id: ID, pending: ["thumb", "playlist"] },
    },
    { cut: "b", lang: "en", youtube: { id: ID } },
    { cut: "c", lang: "vi", youtube: { id: ID, pending: ["playlist"] } },
    { cut: "d", lang: "en" },
  ];
  assert.deepEqual(
    finishTodo(rows, ["en"]).map((r) => r.cut),
    ["a"]
  );
  assert.deepEqual(
    finishTodo(rows, ["en", "vi"]).map((r) => r.cut),
    ["a", "c"]
  );
});

const gone = join(work, "no-such-cover.png");
const row = (over = {}) => ({
  lang: "en",
  fmt: "16x9",
  path: mp4,
  cover,
  ...over,
});

// The uploader call a row gets from publish.mjs, with the meta swapped for the test's JSON.
const rowArgs = (r) => {
  const args = uploadArgs(r, work);
  args[args.indexOf("--meta") + 1] = meta;
  return args;
};

test("a cover-less 16:9 does not list thumb, so it cannot stay pending forever", () => {
  for (const r of [
    row({ cover: gone }),
    row({ cover: "" }),
    row({ cover: undefined }),
  ])
    assert.deepEqual(finishSteps(r, "public"), ["playlist", "oembed"]);
  assert.deepEqual(finishSteps(row(), "public"), [
    "thumb",
    "playlist",
    "oembed",
  ]);
});

test("uploadArgs passes --cover only when the cover file exists", () => {
  assert.ok(uploadArgs(row(), work).includes("--cover"));
  assert.ok(!uploadArgs(row({ cover: gone }), work).includes("--cover"));
  assert.ok(!uploadArgs(row({ cover: "" }), work).includes("--cover"));
});

test("pending to --finish to done: a playlist failure is retried and nothing stays pending", () => {
  const r = row();
  const needed = finishSteps(r, "public");
  const first = runUploader(rowArgs(r), "playlist");
  assert.equal(first.code, 1);
  const pending = pendingSteps(needed, first.up);
  assert.deepEqual(pending, ["playlist", "oembed"]);

  const second = runUploader([
    ...rowArgs(r),
    "--finish",
    first.up.id,
    "--steps",
    pending.join(","),
  ]);
  assert.equal(second.code, 0);
  assert.deepEqual(pendingSteps(pending, second.up), []);
  assert.doesNotMatch(second.calls, /uploadType|upload\.stub|thumbnails\/set/);
});

test("pending to --finish to done for a cover-less cut: no thumb is asked for or waited on", () => {
  const r = row({ cover: gone });
  const needed = finishSteps(r, "public");
  assert.deepEqual(needed, ["playlist", "oembed"]);
  const first = runUploader(rowArgs(r), "playlist");
  assert.equal(first.code, 1);
  assert.doesNotMatch(first.calls, /thumbnails\/set/);
  const pending = pendingSteps(needed, first.up);
  assert.deepEqual(pending, ["playlist", "oembed"]);

  const second = runUploader([
    ...rowArgs(r),
    "--finish",
    first.up.id,
    "--steps",
    pending.join(","),
  ]);
  assert.equal(second.code, 0);
  assert.deepEqual(second.up.done, ["playlist", "oembed"]);
  assert.deepEqual(pendingSteps(pending, second.up), []);
});

test("a cover-less full upload reports every needed step done", () => {
  const r = row({ cover: gone });
  const up = runUploader(rowArgs(r)).up;
  assert.deepEqual(pendingSteps(finishSteps(r, "public"), up), []);
});

test("the playlist step adds the video once: a video already in the playlist is done without an insert", () => {
  const r = upload(["--finish", ID, "--steps", "playlist"], "", true);
  assert.equal(r.code, 0);
  assert.deepEqual(r.up.done, ["playlist"]);
  assert.doesNotMatch(r.calls, /POST .*playlistItems/);
  const fresh = upload(["--finish", ID, "--steps", "playlist"]);
  assert.match(fresh.calls, /POST .*playlistItems/);
});
