#!/usr/bin/env node
// Voice every line of editions/<date>/script.json, one or more anchors per line.
// Anchors are the ElevenLabs cast in videos/brand/voices.json (config.voice.cast), keyed by name slug;
// HeyGen (config.voice.heygen) is the fallback when ElevenLabs is unavailable, picked by the host's gender.
// A line is a string (spoken by the segment's anchor) or a list of { anchor, text } parts, which are
// voiced separately and joined with a short breath into one segment file.
// Writes editions/<date>/voice/<id>.wav and <id>.words.json (word timings for captions and cues).
// Parts are cached by provider + voice + text, so editing one sentence re-voices only that sentence.
// Usage: node scripts/voice.mjs 2026-10-02 [--lang vi]
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { castProblems, hostOrder, loadCast } from "./cast.mjs";
import { cutOf } from "./lang.mjs";

const run = promisify(execFile);
const ROOT = resolve(import.meta.dirname, "..");
const TTS = resolve(
  ROOT,
  "../../.agents/skills/media-use/audio/scripts/heygen-tts.mjs"
);
// HeyGen needs an interactive sign-in, so unattended runs (CI, a Managed Agents sandbox) set
// AIDR_NO_HEYGEN=1: a part ElevenLabs cannot voice then fails the run instead of falling back.
const NO_HEYGEN = process.env.AIDR_NO_HEYGEN === "1" || process.env.CI === "true";

const date = process.argv[2];
if (!date) throw new Error("usage: voice.mjs <date> [--lang vi]");
const cut = cutOf(process.argv);

const config = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
const { gap, heygen } = config.voice;
const cast = loadCast(config, cut.lang);
const dir = join(ROOT, "editions", date);
const script = JSON.parse(readFileSync(join(dir, cut.script), "utf8"));
mkdirSync(join(dir, cut.voice, "parts"), { recursive: true });

// Segments without a named anchor follow the seeded host order.
const order = hostOrder(Object.keys(cast.hosts), date);
const segments = [
  { id: "intro", line: script.intro.voice, anchor: script.intro.anchor },
  ...script.stories.map((s) => ({
    id: `s${s.rank}`,
    line: s.voice,
    anchor: s.anchor,
  })),
  { id: "outro", line: script.outro.voice, anchor: script.outro.anchor },
].map((seg, i) => ({
  ...seg,
  parts: (typeof seg.line === "string" ? [{ text: seg.line }] : seg.line).map(
    (p) => ({
      anchor: p.anchor ?? seg.anchor ?? order[i % order.length],
      text: p.text,
    })
  ),
}));

const problems = castProblems(segments.flatMap((s) => s.parts));
if (problems.length)
  throw new Error(`script.json anchors:\n- ${problems.join("\n- ")}`);

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

// ElevenLabs allows few concurrent requests on small plans: run two at a time, retry on 429.
let slots = 2;
const waiting = [];
async function limited(fn) {
  while (slots === 0) await new Promise((r) => waiting.push(r));
  slots--;
  try {
    return await fn();
  } finally {
    slots++;
    waiting.shift()?.();
  }
}

// ElevenLabs with-timestamps: mp3 → 48 kHz mono wav, character alignment → [{ id, text, start, end }].
async function elevenlabs(voiceId, text, wav, wordsFile) {
  if (!process.env.ELEVENLABS_API_KEY)
    throw new Error("ELEVENLABS_API_KEY is not set");
  const call = () =>
    fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": process.env.ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text,
          model_id: cast.model,
          voice_settings: cast.settings,
        }),
      }
    );
  let res = await limited(call);
  for (let k = 1; res.status === 429 && k <= 4; k++) {
    await new Promise((r) => setTimeout(r, 2000 * k));
    res = await limited(call);
  }
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const mp3 = `${wav}.mp3`;
  writeFileSync(mp3, Buffer.from(data.audio_base64, "base64"));
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-y",
    "-i",
    mp3,
    "-ar",
    "48000",
    "-ac",
    "1",
    wav,
  ]);
  rmSync(mp3);
  const {
    characters: ch,
    character_start_times_seconds: st,
    character_end_times_seconds: en,
  } = data.alignment;
  const words = [];
  let cur = null;
  ch.forEach((c, i) => {
    if (/\s/.test(c)) {
      cur = null;
      return;
    }
    if (!cur) {
      cur = { id: `w${words.length}`, text: "", start: st[i], end: en[i] };
      words.push(cur);
    }
    cur.text += c;
    cur.end = en[i];
  });
  writeFileSync(wordsFile, JSON.stringify(words, null, 2));
}

async function heygenTts(a, text, wav, wordsFile) {
  await run(process.execPath, [
    TTS,
    text,
    "-o",
    wav,
    "--words",
    wordsFile,
    "--voice",
    a.id,
    "--speed",
    String(a.speed),
  ]);
}

// One part: the cast host via ElevenLabs, else the HeyGen anchor of the same gender.
async function voicePart({ anchor, text }) {
  const host = cast.hosts[anchor];
  const hg =
    heygen.anchors[anchor] ?? heygen.anchors[heygen.byGender[host?.gender]];
  if (!host && !heygen.anchors[anchor])
    throw new Error(
      `unknown anchor "${anchor}": use a host from ${config.voice.cast} (${Object.keys(cast.hosts).join(", ")})`
    );
  const file = (provider, id) => {
    const key = createHash("sha1")
      .update(
        `${provider}|${id}|${JSON.stringify(provider === "heygen" ? hg.speed : cast.settings)}|${text}`
      )
      .digest("hex")
      .slice(0, 12);
    return join(dir, cut.voice, "parts", `${anchor}-${key}.wav`);
  };
  let wav = null;
  if (host && config.voice.provider === "elevenlabs") {
    wav = file("elevenlabs", host.id);
    if (!existsSync(wav)) {
      try {
        await elevenlabs(
          host.id,
          text,
          wav,
          wav.replace(/\.wav$/, ".words.json")
        );
        console.log(`+ ${anchor} (elevenlabs): ${text.slice(0, 60)}`);
      } catch (e) {
        if (NO_HEYGEN)
          throw new Error(
            `ElevenLabs failed for ${anchor} and the HeyGen fallback is off (AIDR_NO_HEYGEN/CI): ${e.message.slice(0, 200)}`
          );
        console.warn(
          `! ElevenLabs failed for ${anchor}, falling back to HeyGen: ${e.message.slice(0, 200)}`
        );
        wav = null;
      }
    }
  }
  if (!wav) {
    if (NO_HEYGEN)
      throw new Error(
        `${anchor}: no ElevenLabs voice for this part and the HeyGen fallback is off (AIDR_NO_HEYGEN/CI)`
      );
    wav = file("heygen", hg.id);
    if (!existsSync(wav)) {
      await heygenTts(hg, text, wav, wav.replace(/\.wav$/, ".words.json"));
      console.log(`+ ${anchor} (heygen ${hg.name}): ${text.slice(0, 60)}`);
    }
  }
  return {
    wav,
    words: JSON.parse(
      readFileSync(wav.replace(/\.wav$/, ".words.json"), "utf8")
    ),
    dur: probe(wav),
    anchor,
  };
}

await Promise.all(
  segments.map(async (seg) => {
    const parts = await Promise.all(seg.parts.map(voicePart));
    const out = join(dir, cut.voice, `${seg.id}.wav`);
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
      join(dir, cut.voice, `${seg.id}.words.json`),
      JSON.stringify(words, null, 2)
    );
    console.log(
      `✓ ${seg.id} ${probe(out).toFixed(2)}s · ${parts.map((p) => p.anchor).join(" + ")}`
    );
  })
);
