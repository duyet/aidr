#!/usr/bin/env node
// Voice data/script.json with ElevenLabs (the cast in videos/brand/voices.json) into
// assets/voice/<id>.wav and <id>.words.json. A line is re-voiced only when its text, host or
// speed changes (assets/voice/cache.json). Needs $ELEVENLABS_API_KEY and ffmpeg on PATH.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const TTS = resolve(ROOT, "../releases/scripts/tts-elevenlabs.mjs");
const cast = JSON.parse(readFileSync(resolve(ROOT, "../brand/voices.json"), "utf8"));
const script = JSON.parse(readFileSync(join(ROOT, "data/script.json"), "utf8"));
const dir = join(ROOT, "assets/voice");
const cacheFile = join(dir, "cache.json");
mkdirSync(dir, { recursive: true });
const cache = existsSync(cacheFile) ? JSON.parse(readFileSync(cacheFile, "utf8")) : {};

for (const line of script.lines) {
  const host = cast.en.find((v) => v.name === line.host);
  if (!host) throw new Error(`no English host named ${line.host}`);
  const say = line.say ?? line.text;
  const key = `${host.id}|${script.speed}|${say}`;
  const wav = join(dir, `${line.id}.wav`);
  if (cache[line.id] === key && existsSync(wav)) continue;
  execFileSync("node", [TTS, host.id, say, "-o", wav, "--words", join(dir, `${line.id}.words.json`),
    "--speed", String(script.speed), "--settings", JSON.stringify(cast.settings)], { stdio: "inherit" });
  cache[line.id] = key;
  writeFileSync(cacheFile, JSON.stringify(cache, null, 2));
}
