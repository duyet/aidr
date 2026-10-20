// node --test videos/daily-news/scripts/part-cache.test.mjs
import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { isCached, synthesizeAtomic, wordsFor } from "./part-cache.mjs";

const scratch = () => mkdtempSync(join(tmpdir(), "part-cache-"));

test("a failure after the wav is written leaves nothing in the cache", async () => {
  const dir = scratch();
  const wav = join(dir, "host-abc.wav");
  await assert.rejects(
    synthesizeAtomic(wav, async (tmpWav) => {
      writeFileSync(tmpWav, "partial audio");
      throw new Error("alignment failed");
    }),
    /alignment failed/
  );
  assert.equal(isCached(wav), false);
  assert.deepEqual(readdirSync(dir), []);
  rmSync(dir, { recursive: true });
});

test("a run after a failed one synthesizes again", async () => {
  const dir = scratch();
  const wav = join(dir, "host-abc.wav");
  await synthesizeAtomic(wav, async (tmpWav) => {
    writeFileSync(tmpWav, "truncated");
    throw new Error("ffmpeg died");
  }).catch(() => {});
  let calls = 0;
  await synthesizeAtomic(wav, async (tmpWav, tmpWords) => {
    calls++;
    writeFileSync(tmpWav, "full audio");
    writeFileSync(tmpWords, "[]");
  });
  assert.equal(calls, 1);
  assert.equal(readFileSync(wav, "utf8"), "full audio");
  assert.equal(readFileSync(wordsFor(wav), "utf8"), "[]");
  assert.equal(isCached(wav), true);
  assert.deepEqual(readdirSync(dir).sort(), [
    "host-abc.wav",
    "host-abc.words.json",
  ]);
  rmSync(dir, { recursive: true });
});

test("a wav without words.json (cache of an older failed run) is not cached", () => {
  const dir = scratch();
  const wav = join(dir, "host-abc.wav");
  writeFileSync(wav, "orphan");
  assert.equal(isCached(wav), false);
  writeFileSync(wordsFor(wav), "[]");
  assert.equal(isCached(wav), true);
  assert.equal(existsSync(wav), true);
  rmSync(dir, { recursive: true });
});

test("a synth that writes no words.json is an error, not a cache entry", async () => {
  const dir = scratch();
  const wav = join(dir, "host-abc.wav");
  await assert.rejects(
    synthesizeAtomic(wav, async (tmpWav) => writeFileSync(tmpWav, "audio")),
    /words/
  );
  assert.equal(isCached(wav), false);
  assert.deepEqual(readdirSync(dir), []);
  rmSync(dir, { recursive: true });
});
