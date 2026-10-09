#!/usr/bin/env node
// ElevenLabs TTS with word timings, in the same output shape as media-use's heygen-tts.mjs:
// a wav plus a words JSON of [{ id, text, start, end }].
//
//   node scripts/tts-elevenlabs.mjs <voice-id> "Text" -o line.wav --words line.words.json [--speed 1.0] [--settings '{...}']
//
// Needs $ELEVENLABS_API_KEY and ffmpeg. Word times come from the API's character alignment.
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const [voice, text, ...rest] = process.argv.slice(2);
const opt = (name, def) => {
  const i = rest.indexOf(name);
  return i < 0 ? def : rest[i + 1];
};
const out = opt("-o");
const wordsOut = opt("--words");
const speed = Number(opt("--speed", "1"));
// Voice settings default to a natural read; --settings takes a JSON object (videos/brand/voices.json).
const settings = { stability: 0.4, similarity_boost: 0.75, style: 0.1, use_speaker_boost: true, ...JSON.parse(opt("--settings", "{}")) };
if (!voice || !text || !out) throw new Error("usage: tts-elevenlabs.mjs <voice-id> <text> -o out.wav [--words w.json] [--speed n]");
if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not set");

const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, {
  method: "POST",
  headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({
    text,
    model_id: "eleven_multilingual_v2",
    // Lower stability lets the read move like speech; low style keeps it from performing.
    voice_settings: { ...settings, speed },
  }),
});
if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
const data = await res.json();

const mp3 = `${out}.mp3`;
writeFileSync(mp3, Buffer.from(data.audio_base64, "base64"));
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", mp3, "-ar", "48000", "-ac", "1", out]);
execFileSync("rm", ["-f", mp3]);

if (wordsOut) {
  const { characters: ch, character_start_times_seconds: st, character_end_times_seconds: en } = data.alignment;
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
  writeFileSync(wordsOut, JSON.stringify(words, null, 2));
}
console.log(`✓ ${out}`);
