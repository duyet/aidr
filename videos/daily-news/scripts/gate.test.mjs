// node --test videos/daily-news/scripts/*.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { test } from "node:test";
import { ENGAGEMENT_BAIT, gateVideo, lintText } from "./gate.mjs";

const probe = (o = {}) => ({
  format: { duration: String(o.duration ?? 75) },
  bytes: o.bytes ?? 40e6,
  streams: [
    ...(o.noVideo
      ? []
      : [
          {
            codec_type: "video",
            codec_name: "h264",
            width: o.w ?? 1080,
            height: o.h ?? 1920,
            avg_frame_rate: o.fps ?? "30/1",
          },
        ]),
    ...(o.noAudio
      ? []
      : [
          {
            codec_type: "audio",
            codec_name: "aac",
            sample_rate: "48000",
            channels: 2,
          },
        ]),
  ],
});

test("a 1080x1920 75 s cut with sound passes", () =>
  assert.deepEqual(gateVideo(probe()), []));

test("over 90 s fails the Reel gate but not the plain one (YouTube still takes it)", () => {
  assert.match(gateVideo(probe({ duration: 117 })).join(), /90s Reel limit/);
  assert.deepEqual(gateVideo(probe({ duration: 117 }), "any"), []);
});

test("too short, wrong shape, low resolution, odd fps", () => {
  assert.match(gateVideo(probe({ duration: 2 })).join(), /shorter/);
  assert.match(gateVideo(probe({ w: 1920, h: 1080 })).join(), /not 9:16/);
  assert.match(gateVideo(probe({ w: 360, h: 640 })).join(), /under 540x960/);
  assert.match(gateVideo(probe({ fps: "120/1" })).join(), /fps/);
});

test("missing streams fail every gate", () => {
  assert.match(gateVideo(probe({ noAudio: true }), "any").join(), /no audio/);
  assert.match(gateVideo(probe({ noVideo: true }), "any").join(), /no video/);
});

test("text lint: bait, TODO, empty", () => {
  assert.deepEqual(lintText("x", "Today in AI: three stories."), []);
  assert.match(
    lintText("x", "Tag a friend who needs this").join(),
    /engagement bait/
  );
  assert.match(lintText("x", "TODO one sentence").join(), /TODO/);
  assert.match(lintText("x", " ").join(), /empty/);
});

test("the bait pattern is the Worker's, so the two channels refuse the same lines", () => {
  const ts = readFileSync(
    resolve(import.meta.dirname, "../../../apps/web/worker/notify/facebook.ts"),
    "utf8"
  );
  assert.equal(
    ts.match(/const ENGAGEMENT_BAIT =\s*(\/.+\/i);/)[1],
    ENGAGEMENT_BAIT.toString()
  );
});
