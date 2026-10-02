#!/usr/bin/env node
// Voice every line of editions/<date>/script.json with HeyGen TTS.
// Writes editions/<date>/voice/<id>.wav and <id>.words.json (word timings for captions).
// Usage: node scripts/voice.mjs 2026-10-02 [--only s3,outro]
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const ROOT = resolve(import.meta.dirname, "..");
const TTS = join(
  homedir(),
  ".claude/skills/media-use/audio/scripts/heygen-tts.mjs"
);

const date = process.argv[2];
if (!date) throw new Error("usage: voice.mjs <date> [--only id,id]");
const onlyIdx = process.argv.indexOf("--only");
const only = onlyIdx > 0 ? new Set(process.argv[onlyIdx + 1].split(",")) : null;

const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
const dir = join(ROOT, "editions", date);
const script = JSON.parse(readFileSync(join(dir, "script.json"), "utf8"));
mkdirSync(join(dir, "voice"), { recursive: true });

export const lines = (s) => [
  { id: "intro", text: s.intro.voice },
  ...s.stories.map((st) => ({ id: `s${st.rank}`, text: st.voice })),
  { id: "outro", text: s.outro.voice },
];

const jobs = lines(script).filter((l) => !only || only.has(l.id));
await Promise.all(
  jobs.map(async ({ id, text }) => {
    const wav = join(dir, "voice", `${id}.wav`);
    if (!only && existsSync(wav)) return console.log(`= ${id} (cached)`);
    const { stdout } = await run(process.execPath, [
      TTS,
      text,
      "-o",
      wav,
      "--words",
      join(dir, "voice", `${id}.words.json`),
      "--voice",
      config.voice.id,
      "--speed",
      String(config.voice.speed),
    ]);
    process.stdout.write(stdout);
  })
);
