#!/usr/bin/env python3
"""Build the launch film's sound: time the narration, cut the music bed, place the effects.

Run from the project root after the narration engine has written audio_meta.json
(`audio.mjs --script SCRIPT.md ...`). Rewrites audio_meta.json in the shape the assembler reads.
Needs ffmpeg. Standard library only.

Every effect is placed so its PEAK (not its start) lands on the visual hit.
"""

import json
import os
import shutil
import subprocess

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SFX_LIBRARY = os.path.expanduser("~/.claude/skills/media-use/audio/assets/sfx")

# On-screen frame starts (s). Frame 1 plays at x1.35, the rest at x0.9 of authored time.
FRAME_START = {1: 0.0, 2: 5.4, 3: 9.0, 4: 12.6, 5: 18.0, 6: 21.6, 7: 27.0}
FRAME_LENGTH = {1: 5.4, 2: 3.6, 3: 3.6, 4: 5.4, 5: 3.6, 6: 5.4, 7: 3.6}
SCALE = {1: 1.35, 2: 0.9, 3: 0.9, 4: 0.9, 5: 0.9, 6: 0.9, 7: 0.9}
TOTAL = 30.6


def at(frame, authored):
    """On-screen time of a moment written in the storyboard's authored seconds."""
    return FRAME_START[frame] + authored * SCALE[frame]


# Narration: seconds after the frame starts at which the first word is spoken.
# Line 2 is timed so the word "eight" (0.42s into the line) lands with the 8.
VOICE_LEAD = {1: 0.7, 2: at(2, 2.5) - FRAME_START[2] - 0.42, 3: 0.3, 4: 0.2, 5: 0.6, 6: 1.0, 7: 0.2}

# Music: library track "News Theme" (HeyGen id 225457110ee14caaa223b7abc295a64b), a steady
# 120 BPM. Played 10/9 faster it is 133.3 BPM, so a bar is 1.8s and every frame cut is a bar line.
BGM_SOURCE = "assets/bgm/news-theme-source.mp3"
BGM_OUT = "assets/bgm/score.mp3"
BGM_VOLUME = 0.2

# Seconds from the start of each bundled effect file to its loudest point (measured).
PEAK = {"click-soft": 0.053, "typing": 0.45, "whoosh": 0.164, "whoosh-short": 0.164,
        "impact-bass-1": 0.077, "pop": 0.122}

# (effect, on-screen time of the visual hit, volume)
HITS = (
    [("click-soft", at(1, t), 0.18) for t in (0.5, 0.75, 1.0, 1.25)]          # caret blinks
    + [("typing", at(1, 1.5), 0.25)]                                          # the typed line starts
    + [("whoosh", at(2, 0.0), 0.3)]                                           # dive through the dot
    + [("impact-bass-1", at(2, 2.5), 0.3)]                                    # the 8 lands
    + [("whoosh-short", at(3, t + 0.2), 0.15) for t in (1.0, 1.5, 2.0)]       # marker strokes, mid-sweep
    + [("click-soft", at(3, 3.1), 0.2)]                                       # headline locks
    + [("click-soft", at(4, 0.75 + 0.25 * i), 0.2) for i in range(7)]         # rows 2-8 land
    + [("pop", at(4, 2.75), 0.15)]                                            # footer
    + [("pop", at(4, 4.75), 0.22)]                                            # AnyRouter mark lands
    + [("whoosh-short", at(5, 0.5), 0.15), ("whoosh-short", at(5, 2.0), 0.2)]  # pair in, pair swap
    + [("whoosh-short", at(6, 0.4), 0.2)]                                     # window rises
    + [("pop", at(6, t), 0.22) for t in (3.0, 3.5, 4.0, 4.5)]                 # delivery chips
    + [("whoosh", at(7, 0.0), 0.3)]                                           # into the lockup
    + [("impact-bass-1", at(7, 1.4), 0.35)]                                   # wordmark locks
    + [("click-soft", at(7, 3.0), 0.2)]                                       # aidr.today
)


def ffmpeg(*args):
    subprocess.run(["ffmpeg", "-v", "error", "-y", *args], check=True, cwd=ROOT)


def duration(path):
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of",
                          "csv=p=0", path], capture_output=True, text=True, check=True, cwd=ROOT)
    return float(out.stdout.strip())


def build_voices(meta):
    os.makedirs(os.path.join(ROOT, "assets/voice/timed"), exist_ok=True)
    voices = []
    for voice in meta["voices"]:
        frame = voice["frame"]
        raw = f"assets/voice/{frame:02d}.wav"
        first, last = voice["words"][0]["start"], voice["words"][-1]["end"]
        lead = VOICE_LEAD[frame]
        spoken = last - first
        if lead + spoken > FRAME_LENGTH[frame]:
            raise SystemExit(f"line {frame}: {spoken:.2f}s of speech after a {lead:.2f}s lead does "
                             f"not fit the {FRAME_LENGTH[frame]}s frame; shorten the line")
        out = f"assets/voice/timed/{frame:02d}.wav"
        trim = max(first - 0.04, 0)
        ffmpeg("-i", raw, "-af",
               f"atrim=start={trim:.3f}:end={last + 0.12:.3f},asetpts=PTS-STARTPTS,"
               f"adelay={round((lead - 0.04) * 1000)}:all=1", out)
        voices.append({"frame": frame, "path": out})
        print(f"  voice {frame}: speaks {FRAME_START[frame] + lead:6.2f} → "
              f"{FRAME_START[frame] + lead + spoken:6.2f}s")
    return voices


def build_bgm():
    ffmpeg("-i", BGM_SOURCE, "-af",
           f"atempo={10 / 9:.6f},afade=t=in:d=0.03,afade=t=out:st={TOTAL - 1.3}:d=1.5",
           "-t", f"{TOTAL + 0.4:.3f}", "-b:a", "192k", BGM_OUT)
    print(f"  bgm: {BGM_OUT} ({duration(BGM_OUT):.2f}s)")
    return {"path": BGM_OUT, "volume": BGM_VOLUME}


def build_sfx():
    cues = []
    for name, hit, volume in HITS:
        target = f"assets/sfx/{name}.mp3"
        if not os.path.exists(os.path.join(ROOT, target)):
            shutil.copy(os.path.join(SFX_LIBRARY, f"{name}.mp3"), os.path.join(ROOT, target))
        start = hit - PEAK[name]
        frame = max(f for f, s in FRAME_START.items() if s <= start + 1e-6)
        cues.append({"frame": frame, "file": target, "offset_s": round(start - FRAME_START[frame], 3),
                     "duration_s": round(duration(target), 3), "volume": volume})
    print(f"  sfx: {len(cues)} cues")
    return cues


def main():
    path = os.path.join(ROOT, "audio_meta.json")
    with open(path) as handle:
        meta = json.load(handle)
    timings = os.path.join(ROOT, "audio/narration_timings.json")
    if all("words" in v for v in meta.get("voices", [])) and meta.get("voices"):
        with open(timings, "w") as handle:  # fresh engine output: keep its word timings
            json.dump(meta["voices"], handle, indent=1)
    with open(timings) as handle:  # a re-run after this script rewrote audio_meta.json
        meta["voices"] = json.load(handle)
    built = {"bgm": build_bgm(), "bgm_pending": False, "voices": build_voices(meta),
             "sfx": build_sfx()}
    with open(path, "w") as handle:
        json.dump(built, handle, indent=2)
    print("✓ audio_meta.json rewritten")


if __name__ == "__main__":
    main()
