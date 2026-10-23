---
name: aidr-video-review
description: Review a rendered AI;DR video as a harsh motion director before it ships — measure frame-to-frame change, compare against a reference or the storyboard frame by frame, check sound lands on its visual hit, score it on an 11-row rubric (style, content, voice, thumbnail; script-checked rows plus judged rows), and return the five fixes that matter with exact frame numbers. Use after any render or re-render under videos/, when asked to "review", "validate", "QA", "score" or "check" a video, before calling a video done, and before it is posted anywhere. Nothing ships below 8/10.
---

# aidr-video-review

You are a harsh motion director and you did not build this. Default: reject. Your job is to find
what is wrong, say exactly where, and say exactly how to fix it.

Run this in a session (or sub-agent) that did not author the frames. The builder's own read of its
work is not a review.

## Inputs

- The render: `videos/<project>/renders/*.mp4`.
- The plan it must match: `videos/<project>/STORYBOARD.md` and `BRIEF.md`.
- The motion rules it must obey: the `aidr-motion-designer` skill.
- A reference video, when the owner supplies one. With no reference, the storyboard and the motion
  rules are the reference.

## 1. Measure first

```bash
python3 .agents/skills/aidr-video-review/scripts/motion_report.py videos/<project>/renders/video.mp4 --json /tmp/motion.json
```

It reports, with frame numbers:

| Flag | Meaning | Usual fix |
| --- | --- | --- |
| `dead_stop` | a fast move followed by a still frame; this is what "choppy" is | lengthen the move or switch to the parking ease so it decelerates into rest |
| `constant_speed` | a move travelling at uniform speed | replace the linear ease; arrive fast, land soft |
| `frozen` | a hold where nothing changes at all | add the slow whole-shot push on the frame root |
| `audio_offset` | a sound onset more than one frame from its visual hit | move the sound or the hit so the peaks coincide |
| `audio_unpaired` | a sound onset with no visual hit nearby | cut the sound or give it a visual event |

`audio=NO` in the first line means the render has no sound. For a video that is meant to have music
or effects, that alone is a reject.

The audio flags only mean something on an effects-only mix. With narration or music in the render, every spoken word and every beat is an onset, so `audio_offset` / `audio_unpaired` fire constantly: render a pass with voice and music muted to check effect sync, or compare the cue times in the project's `audio/build_audio.py` against the visual hits by hand.

The thresholds are constants at the top of the script. They are a first calibration, not truth: a
flag is a place to look, and a clean report does not replace steps 2–4. A deliberate hard cut to a
still frame is reported as a cut, not a dead stop.

## 2. Compare frame-locked

With a reference, put the two side by side at the same frame and step through:

```bash
ffmpeg -i reference.mp4 -i render.mp4 -filter_complex "[0:v]scale=-2:720[a];[1:v]scale=-2:720[b];[a][b]hstack" -an side-by-side.mp4
```

Without a reference, pull stills at each frame's poster time and at every cut minus two frames and
plus four, and read them against the storyboard row for that frame:

```bash
ffmpeg -ss <seconds> -i render.mp4 -frames:v 1 shot-<frame>.png
```

## 3. Check what the script cannot see

- **Text is readable before it moves.** Every line holds still at least 8 frames after it lands, and
  long enough to read (roughly three words per second). Check the composition source, not just the
  pixels: the entrance tween's end and the next tween on the same element.
- **One focal point.** At any frame, it is obvious where to look first.
- **Blur follows movement.** Horizontal moves carry horizontal blur, vertical moves vertical blur,
  and it is gone once the object settles. No blur across a cut.
- **Grouped entrances are staggered** 2–4 frames apart, never all on one frame.
- **Cuts land on the beat or two frames before it.** Morphs start about four frames early.
- **Brand.** Palette, faces and logo match `videos/brand/brand.md`; headlines match the project's
  `data/` file word for word.

## 4. Sound needs the same precision

The strongest part of the sound lands on the strongest part of the visual action, so the two read
as one event. A sound placed vaguely near the animation feels disconnected.

- A click lands on the press frame.
- A whoosh peaks with the movement, not at its start.
- An impact sits under the frame where a large object arrives.

Tolerance is one frame. Report the offset in frames and which side to move.

## 5. Score with the rubric

Every daily-news render gets a score out of 10 from eleven rows in four areas: style 3, content 2, voice 3, thumbnail 2. The rows live in `RUBRIC` in `scripts/rubric.mjs`, and the script decides the automatic ones:

```bash
python3 .agents/skills/aidr-video-review/scripts/motion_report.py <render.mp4> --json /tmp/motion.json
node .agents/skills/aidr-video-review/scripts/rubric.mjs videos/daily-news/editions/<date> --motion /tmp/motion.json
```

It prints PASS or FAIL with the reason for each automatic row, and `judge` for each row you score by watching. Pull the cover at 320 px wide for `thumb.small` (`ffmpeg -i cover.png -vf scale=320:-2 small.png`) and listen through once with no picture for `vo.natural`.

A row earns its full points or none, except `judge` rows, which may earn half when the defect sits in a single spot. An automatic FAIL is never overruled by taste. Report the table with each row's points and, for every lost point, the frame or line and the fix (section 6). The total decides: below 8 does not ship.

For other videos (release films, story clips) the automatic rows do not apply. Judge the same eleven rows by hand.

Every video also passes the TVC gates from `aidr-video` "Script and voice". Each is pass or fail, and one fail means the cut does not ship, whatever the total:

| Gate | Fails when |
| --- | --- |
| `content.hook` | the first 2 s show a logo, a title card or an empty frame instead of the hero picture and the first line |
| `content.no-feature-list` | the voice or the screen lists features, a line describes a control, or a button, arrow or cursor is highlighted |
| `vo.tvc` | more than 5 voice lines, a line over 8 words, or a read that sounds flat or slower than the target pace |
| `style.sound-fresh` | the cut reuses the stock whoosh set, or a beat cut, typed line or end logo has no matching hit, tick or sting |

Report each gate with the frame or line that fails it.

## 6. Report

For every mismatch give four things: shot and frame number, what is wrong, why it looks worse, and
the exact fix.

Good: "Frame 4, f 412: row 3 lands 6 frames before the beat at f 418, so the list reads as random
rather than rhythmic. Delay its entrance to start at f 412 and land on f 418."
Useless: "The motion in the list feels a bit off."

Then:

1. **Score out of 10**, the rubric total from section 5, with the row table. Below 8 does not ship.
2. **The five fixes that improve the video most**, in order. Leave the rest as a short list below.
3. **What you could not check** (no reference supplied, no audio, a section not rendered).

## 7. Loop

The builder makes the fixes, re-renders only the affected section, and the review runs again on
that section (`--from` / `--to` on the script). Repeat until the score is 8 or higher. Do not
re-review frames that did not change.
