#!/usr/bin/env python3
"""Measure frame-to-frame change and audio onsets in a rendered video.

Flags the defects the review skill cares about:
  dead_stop       a fast move followed by a still frame (reads as "choppy")
  constant_speed  a move that travels at uniform speed (no ease)
  frozen          a hold with no change at all (owner rule: nothing freezes)
  audio_offset    a sound onset that misses its nearest visual hit

Needs ffmpeg and ffprobe on PATH. Standard library only.
Usage: motion_report.py render.mp4 [--json out.json] [--from SEC --to SEC]
"""

import argparse
import json
import re
import subprocess
import sys

# Mean absolute luma difference between consecutive frames, 0-255, at 320px wide.
CUT = 18.0        # a single-frame spike above this, isolated, is a cut
MOVE = 1.2        # above this something substantial is travelling
STILL = 0.12      # below this the frame reads as not moving
FROZEN = 0.015    # below this nothing at all changed
FROZEN_RUN = 12   # frames of FROZEN before a hold counts as dead
LINEAR_RUN = 8    # frames of near-equal change before a move counts as uniform
LINEAR_TOL = 0.06
ONSET_DB = 9.0    # rise over the previous blocks that counts as a sound onset
ONSET_FLOOR = -42.0
SYNC_WINDOW = 6   # frames; an onset further than this from any hit is unpaired


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def probe(path):
    out = run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
               "stream=r_frame_rate,nb_frames", "-of", "json", path])
    stream = json.loads(out.stdout)["streams"][0]
    num, den = stream["r_frame_rate"].split("/")
    audio = run(["ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                 "stream=codec_name", "-of", "csv=p=0", path]).stdout.strip()
    return float(num) / float(den), bool(audio)


def window(args):
    flags = []
    if args.start is not None:
        flags += ["-ss", str(args.start)]
    if args.end is not None:
        flags += ["-to", str(args.end)]
    return flags


def video_diffs(path, args):
    vf = ("scale=320:-2,format=gray,tblend=all_mode=difference,signalstats,"
          "metadata=print:key=lavfi.signalstats.YAVG:file=-")
    out = run(["ffmpeg", "-v", "error", *window(args), "-i", path, "-an", "-vf", vf,
               "-f", "null", "-"])
    if out.returncode != 0:
        sys.exit(f"ffmpeg failed measuring video:\n{out.stderr}")
    # tblend's first output frame has no predecessor, so index i is the change INTO frame i+1.
    return [float(v) for v in re.findall(r"YAVG=([0-9.]+)", out.stdout)][1:]


def audio_rms(path, fps, args):
    block = round(48000 / fps)
    af = (f"aresample=48000,asetnsamples=n={block}:p=0,astats=metadata=1:reset=1,"
          "ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-")
    out = run(["ffmpeg", "-v", "error", *window(args), "-i", path, "-vn", "-af", af,
               "-f", "null", "-"])
    if out.returncode != 0:
        sys.exit(f"ffmpeg failed measuring audio:\n{out.stderr}")
    levels = []
    for value in re.findall(r"RMS_level=(\S+)", out.stdout):
        levels.append(-120.0 if value in ("-inf", "nan") else float(value))
    return levels


def find_cuts(d):
    cuts = set()
    for i, v in enumerate(d):
        before = d[i - 1] if i else 0.0
        after = d[i + 1] if i + 1 < len(d) else 0.0
        if v >= CUT and v > 3 * max(before, after, 0.01):
            cuts.add(i)
    return cuts


def analyse(d, cuts, offset):
    issues = []

    def frame(i):  # diff index -> frame number in the file
        return i + 1 + offset

    for i in range(len(d) - 1):
        if i in cuts or i + 1 in cuts:
            continue
        moving = i > 0 and d[i - 1] >= MOVE * 0.5  # a one-frame pop (a blink, a toggle) is not a move
        if moving and d[i] >= MOVE and d[i + 1] < STILL and d[i + 1] <= 0.2 * d[i]:
            issues.append({"type": "dead_stop", "frame": frame(i + 1),
                           "detail": f"change drops {d[i]:.2f} -> {d[i + 1]:.2f} in one frame; "
                                     "the move has no deceleration tail"})

    i = 0
    while i < len(d):
        if d[i] >= MOVE and i not in cuts:
            j = i
            while (j + 1 < len(d) and j + 1 not in cuts and d[j + 1] >= MOVE
                   and abs(d[j + 1] - d[i]) <= LINEAR_TOL * d[i]):
                j += 1
            if j - i + 1 >= LINEAR_RUN:
                issues.append({"type": "constant_speed", "frame": frame(i),
                               "detail": f"{j - i + 1} frames at uniform change {d[i]:.2f}; "
                                         "no ease in or out"})
            i = j + 1
        else:
            i += 1

    i = 0
    while i < len(d):
        if d[i] < FROZEN:
            j = i
            while j + 1 < len(d) and d[j + 1] < FROZEN:
                j += 1
            if j - i + 1 >= FROZEN_RUN:
                issues.append({"type": "frozen", "frame": frame(i),
                               "detail": f"{j - i + 1} frames with no change at all; "
                                         "the hold needs its slow push"})
            i = j + 1
        else:
            i += 1
    return issues


def visual_hits(d, cuts):
    hits = set(cuts)
    for i in range(1, len(d) - 1):
        if d[i] >= MOVE * 2 and d[i] >= d[i - 1] and d[i] > d[i + 1]:
            hits.add(i)
    return sorted(hits)


def audio_issues(levels, hits, offset):
    issues, onsets = [], []
    for i in range(2, len(levels)):
        base = max((levels[i - 1] + levels[i - 2]) / 2, -90.0)
        if levels[i] > ONSET_FLOOR and levels[i] - base >= ONSET_DB:
            if not onsets or i - onsets[-1] > 2:
                onsets.append(i)
    for onset in onsets:
        if not hits:
            break
        nearest = min(hits, key=lambda h: abs((h + 1) - onset))
        delta = onset - (nearest + 1)
        if abs(delta) > SYNC_WINDOW:
            issues.append({"type": "audio_unpaired", "frame": onset + offset,
                           "detail": "sound onset with no visual hit within "
                                     f"{SYNC_WINDOW} frames"})
        elif abs(delta) > 1:
            word = "late" if delta > 0 else "early"
            issues.append({"type": "audio_offset", "frame": onset + offset,
                           "detail": f"sound lands {abs(delta)} frames {word} of the visual hit "
                                     f"at frame {nearest + 1 + offset}"})
    return issues, onsets


def main():
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("video")
    parser.add_argument("--json", dest="json_out")
    parser.add_argument("--from", dest="start", type=float)
    parser.add_argument("--to", dest="end", type=float)
    args = parser.parse_args()

    fps, has_audio = probe(args.video)
    offset = round((args.start or 0) * fps)
    d = video_diffs(args.video, args)
    cuts = find_cuts(d)
    issues = analyse(d, cuts, offset)
    onsets = []
    if has_audio:
        extra, onsets = audio_issues(audio_rms(args.video, fps, args), visual_hits(d, cuts), offset)
        issues += extra
    issues.sort(key=lambda item: item["frame"])

    report = {"video": args.video, "fps": fps, "frames_measured": len(d) + 1,
              "has_audio": has_audio, "cuts": [c + 1 + offset for c in sorted(cuts)],
              "audio_onsets": [o + offset for o in onsets], "issues": issues}
    if args.json_out:
        with open(args.json_out, "w") as handle:
            json.dump(report, handle, indent=2)

    print(f"{args.video}: {fps:g} fps, {len(d) + 1} frames, audio={'yes' if has_audio else 'NO'}")
    print(f"cuts at frames: {report['cuts'] or 'none'}")
    if not issues:
        print("no measured defects (this does not replace the visual review)")
    for item in issues:
        seconds = item["frame"] / fps
        print(f"  frame {item['frame']:>5} ({seconds:6.2f}s)  {item['type']:<15} {item['detail']}")
    sys.exit(1 if issues else 0)


if __name__ == "__main__":
    main()
