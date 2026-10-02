#!/usr/bin/env node
// Voice every line of editions/<date>/script.json with HeyGen TTS, one or more anchors per line.
// A line is a string (spoken by the segment's anchor) or a list of { anchor, text } parts, which are
// voiced separately and joined with a short breath into one segment file.
// Writes editions/<date>/voice/<id>.wav and <id>.words.json (word timings for captions and cues).
// Parts are cached by anchor + text, so editing one sentence re-voices only that sentence.
// Usage: node scripts/voice.mjs 2026-10-02
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
if (!date) throw new Error("usage: voice.mjs <date>");

const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
const { anchors, defaultAnchor, gap } = config.voice;
const dir = join(ROOT, "editions", date);
const script = JSON.parse(readFileSync(join(dir, "script.json"), "utf8"));
mkdirSync(join(dir, "voice/parts"), { recursive: true });

// Stories alternate anchors unless the script names one.
const names = Object.keys(anchors);
const segments = [
  { id: "intro", line: script.intro.voice, anchor: script.intro.anchor },
  ...script.stories.map((s, i) => ({
    id: `s${s.rank}`,
    line: s.voice,
    anchor: s.anchor ?? names[i % names.length],
  })),
  { id: "outro", line: script.outro.voice, anchor: script.outro.anchor },
].map((seg) => ({
  ...seg,
  parts: (typeof seg.line === "string" ? [{ text: seg.line }] : seg.line).map(
    (p) => ({
      anchor: p.anchor ?? seg.anchor ?? defaultAnchor,
      text: p.text,
    })
  ),
}));

const probe = (f) =>
  Number(
    execFileSync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      f,
    ])
      .toString()
      .trim()
  );

async function voicePart({ anchor, text }) {
  const a = anchors[anchor];
  if (!a) throw new Error(`unknown anchor "${anchor}" (config.voice.anchors)`);
  const key = createHash("sha1")
    .update(`${a.id}|${a.speed}|${text}`)
    .digest("hex")
    .slice(0, 12);
  const wav = join(dir, "voice/parts", `${anchor}-${key}.wav`);
  const words = wav.replace(/\.wav$/, ".words.json");
  if (!existsSync(wav)) {
    await run(process.execPath, [
      TTS,
      text,
      "-o",
      wav,
      "--words",
      words,
      "--voice",
      a.id,
      "--speed",
      String(a.speed),
    ]);
    console.log(`+ ${anchor}: ${text.slice(0, 60)}`);
  }
  return {
    wav,
    words: JSON.parse(readFileSync(words, "utf8")),
    dur: probe(wav),
    anchor,
  };
}

await Promise.all(
  segments.map(async (seg) => {
    const parts = await Promise.all(seg.parts.map(voicePart));
    const out = join(dir, "voice", `${seg.id}.wav`);
    const inputs = parts.flatMap((p) => ["-i", p.wav]);
    const chain = parts
      .map(
        (_, k) =>
          `[${k}:a]aresample=48000,aformat=channel_layouts=mono${k < parts.length - 1 ? `,apad=pad_dur=${gap}` : ""}[p${k}]`
      )
      .join(";");
    execFileSync("ffmpeg", [
      "-v",
      "error",
      "-y",
      ...inputs,
      "-filter_complex",
      `${chain};${parts.map((_, k) => `[p${k}]`).join("")}concat=n=${parts.length}:v=0:a=1[out]`,
      "-map",
      "[out]",
      out,
    ]);
    let offset = 0;
    const words = [];
    for (const p of parts) {
      for (const w of p.words)
        words.push({
          ...w,
          id: `w${words.length}`,
          start: w.start + offset,
          end: w.end + offset,
          anchor: p.anchor,
        });
      offset += p.dur + gap;
    }
    writeFileSync(
      join(dir, "voice", `${seg.id}.words.json`),
      JSON.stringify(words, null, 2)
    );
    console.log(
      `✓ ${seg.id} ${probe(out).toFixed(2)}s · ${parts.map((p) => p.anchor).join(" + ")}`
    );
  })
);
