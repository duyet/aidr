// The cache of one voiced sentence: <name>.wav plus <name>.words.json, present together or not at all.
import { existsSync, renameSync, rmSync } from "node:fs";

let seq = 0;

export const wordsFor = (wav) => wav.replace(/\.wav$/, ".words.json");

export const isCached = (wav) => existsSync(wav) && existsSync(wordsFor(wav));

/** Run `synth(tmpWav, tmpWords)`, then move both files into place. A failed synthesis leaves no cache entry, and the
 *  wav is renamed last so a wav at its final name always has its words. */
export async function synthesizeAtomic(wav, synth) {
  const stem = wav.replace(/\.wav$/, "");
  const tag = `${process.pid}-${seq++}`;
  const tmpWav = `${stem}.tmp-${tag}.wav`;
  const tmpWords = `${stem}.tmp-${tag}.words.json`;
  const scraps = [tmpWav, tmpWords, `${tmpWav}.mp3`];
  try {
    await synth(tmpWav, tmpWords);
    if (!existsSync(tmpWav) || !existsSync(tmpWords))
      throw new Error(`synthesis wrote no wav or words for ${wav}`);
    renameSync(tmpWords, wordsFor(wav));
    renameSync(tmpWav, wav);
  } finally {
    for (const f of scraps) rmSync(f, { force: true });
  }
}
