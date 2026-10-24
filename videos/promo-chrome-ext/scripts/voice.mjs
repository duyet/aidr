#!/usr/bin/env node
// Voice data/script.json with ElevenLabs into assets/voice/<id>.wav and <id>.words.json, one
// announcer (`host`, from videos/brand/voices.json) with the script's own settings. A line is
// re-voiced only when its text, host, speed or settings change (assets/voice/cache.json). Each line is
// loudness-normalized to -20 LUFS.
// Needs $ELEVENLABS_API_KEY and ffmpeg on PATH.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const TTS = resolve(ROOT, "../releases/scripts/tts-elevenlabs.mjs");
const cast = JSON.parse(readFileSync(resolve(ROOT, "../brand/voices.json"), "utf8"));
const script = JSON.parse(readFileSync(join(ROOT, "data/script.json"), "utf8"));
const dir = join(ROOT, "assets/voice");
const cacheFile = join(dir, "cache.json");
mkdirSync(dir, { recursive: true });
const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};

const host = cast.en.find((v) => v.name === script.host);
if (!host) throw new Error(`no English host named ${script.host}`);
const settings = JSON.stringify(script.settings);
for (const line of script.lines) {
  const say = line.say ?? line.text;
  const key = `${host.id}|${script.speed}|${settings}|${say}`;
  const wav = join(dir, `${line.id}.wav`);
  if (cache[line.id] === key && existsSync(wav)) continue;
  execFileSync("node", [TTS, host.id, say, "-o", wav, "--words", join(dir, `${line.id}.words.json`),
    "--speed", String(script.speed), "--settings", settings], { stdio: "inherit" });
  // The engine's level varies by line (one "Blank." take came out 15 dB under the rest); even them out.
  const tmp = wav.replace(/\.wav$/, ".norm.wav");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", wav, "-af", "loudnorm=I=-20:TP=-2:LRA=11", "-ar", "48000", tmp]);
  renameSync(tmp, wav);
  cache[line.id] = key;
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
}
