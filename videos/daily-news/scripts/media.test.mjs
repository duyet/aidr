import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { downloadImages, imageSize } from "./media.mjs";

const png = (w, h) => {
  const b = Buffer.alloc(33);
  Buffer.from("\x89PNG\r\n\x1a\n", "latin1").copy(b);
  b.write("IHDR", 12, "latin1");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
};
// SOI, an APP0 segment, then SOF0 with height before width.
const jpeg = (w, h) => {
  const b = Buffer.alloc(40);
  b.set([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10], 0);
  b.set([0xff, 0xc0, 0x00, 0x11, 0x08], 20);
  b.writeUInt16BE(h, 25);
  b.writeUInt16BE(w, 27);
  return b;
};
const webpX = (w, h) => {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "latin1");
  b.write("WEBPVP8X", 8, "latin1");
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
};

test("imageSize reads width and height from PNG, JPEG, WebP and GIF headers", () => {
  assert.deepEqual(imageSize(png(1200, 630)), { width: 1200, height: 630 });
  assert.deepEqual(imageSize(jpeg(96, 80)), { width: 96, height: 80 });
  assert.deepEqual(imageSize(webpX(2048, 1536)), { width: 2048, height: 1536 });
  const gif = Buffer.from("GIF89a\x40\x01\xc8\x00", "latin1");
  assert.deepEqual(imageSize(gif), { width: 320, height: 200 });
  assert.equal(imageSize(Buffer.from("not an image")), null);
});

let dir;
let realFetch;
let fetched;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "dn-media-"));
  mkdirSync(join(dir, "assets"));
  realFetch = globalThis.fetch;
  fetched = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
  rmSync(dir, { recursive: true, force: true });
});
const serve = (bodies) => {
  globalThis.fetch = async (url) => {
    fetched.push(url);
    return new Response(bodies[url], {
      headers: { "content-type": "image/png" },
    });
  };
};

test("a story keeps only real pictures: no avatar, no logo, nothing under 300px on its short side", async () => {
  // The Epic Games story's picture was a 96px Gravatar default, enlarged to a white blob on screen.
  const urls = [
    "https://secure.gravatar.com/avatar/0a1b2c?s=96&d=mm",
    "https://example.com/assets/site-logo.png",
    "https://example.com/small.png",
    "https://example.com/story.png",
    "https://example.com/second.png",
  ];
  serve({
    "https://example.com/small.png": png(400, 96),
    "https://example.com/story.png": png(1200, 630),
    "https://example.com/second.png": png(800, 800),
  });
  const images = await downloadImages(dir, urls, "s1");
  assert.deepEqual(images, [
    { url: "https://example.com/story.png", local: "assets/s1-1.png" },
    { url: "https://example.com/second.png", local: "assets/s1-2.png" },
  ]);
  assert.ok(
    !fetched.some((u) => /gravatar|logo/.test(u)),
    "generic URLs are never fetched"
  );
  assert.deepEqual(readdirSync(join(dir, "assets")).sort(), [
    "s1-1.png",
    "s1-2.png",
  ]);
});

test("a rejected picture does not use up one of the story's three slots", async () => {
  const urls = [
    "https://example.com/a.png",
    "https://example.com/tiny.png",
    "https://example.com/b.png",
    "https://example.com/c.png",
  ];
  serve({
    "https://example.com/a.png": png(1200, 800),
    "https://example.com/tiny.png": png(120, 120),
    "https://example.com/b.png": png(1200, 800),
    "https://example.com/c.png": png(1200, 800),
  });
  const images = await downloadImages(dir, urls, "s2");
  assert.deepEqual(
    images.map((im) => im.url),
    [
      "https://example.com/a.png",
      "https://example.com/b.png",
      "https://example.com/c.png",
    ]
  );
});
