# Review brief: v0.1.16 release film

Every reviewer of this film gets this brief and scores the same way. It applies the `aidr-video-review` skill to a release film. Read that skill's sections 2 to 4 for how to look. This file fixes what each rubric row is worth.

You did not build this film. Default to reject. Nothing ships below 8 of 10.

## Inputs

| What | Where |
| --- | --- |
| Draft render (EN 16:9, 1080p) | `renders/draft-en-16x9.mp4` |
| Effects-only mix, for sync | `assets/audio/sfx-en.wav` (mux it onto the draft) |
| Captions | `captions-en.srt` |
| Timed voice parts | `assets/audio/vo-en.json` |
| Covers, all four cuts | `renders/aidr-v0.1.16-{en,vi}-{16x9,9x16}-cover.png` |
| Plan | `STORYBOARD.md`, `BRIEF.md` |
| Copy and crops | `film.json` |
| Facts | `apps/web/src/content/releases/v0.1.16.ts` |

Paths are relative to `videos/releases/v0.1.16/` unless they start with `apps/`.

## Commands

```bash
export PATH=/usr/lib/jellyfin-ffmpeg:$PATH
python3 .agents/skills/aidr-video-review/scripts/motion_report.py videos/releases/v0.1.16/renders/draft-en-16x9.mp4 --json /tmp/motion.json
node videos/releases/scripts/vo-report.mjs v0.1.16 en
ffmpeg -i videos/releases/v0.1.16/renders/aidr-v0.1.16-en-16x9-cover.png -vf scale=320:-2 /tmp/small.png
```

Run the motion report on the draft as rendered. Its `audio_*` flags fire on every spoken word, so judge effect sync on a mux with `sfx-en.wav` instead.

## Rows

A row earns full, half or zero. Half is for a defect that sits in one spot. Two or more spots, or one that breaks the row's purpose, earn zero. Cite the frame or line for every lost point.

| Row | Points | Full | Half | Zero |
| --- | --- | --- | --- | --- |
| style.motion | 1 | motion_report shows no `dead_stop` and no `frozen` flag outside a deliberate cut | one flag, at one spot | two or more flags |
| style.focus | 1 | one obvious focal point per frame; every line holds still 8+ frames after it lands; grouped entrances staggered | one frame with two competing focal points, or one line that moves before it can be read | the eye has no clear target in two or more shots |
| style.sound | 1 | every effect peaks within one frame of its visual hit (checked on the `sfx-en.wav` mux); the bed ducks under the voice | one effect off by 2+ frames, or one spot where the bed fights the voice | several effects off, or no audio |
| content.facts | 1 | every figure and claim on screen and in the voice traces to the release file, BRIEF.md or a capture | n/a (automatic in spirit: any untraceable claim is zero) | one claim that does not trace |
| content.read | 1 | no clipped or overflowing text in any window, tag, title or caption; on-screen titles, tags and the close add a fact the voice does not say | one clipped word, or one title that only repeats its voice line | two or more of either |
| vo.pacing | 1 | no voice sentence over 18 words (`PACING.sentence`); the title section's parts are 7 words or fewer each | n/a | any sentence over the limit |
| vo.length | 0.5 | voiced, and 30 to 45 s (the owner's release-film length) | n/a | silent, or outside 30 to 45 s |
| vo.natural | 1.5 | `vo-report.mjs` prints PASS: no part faster than 1.35 x the reading rate (EN 2.6, VI 3.2 words/s), no pause over 0.6 s inside one section, no sentence over 18 words, no spoken list of three. Hand-offs between hosts land on a scene change. Numbers are written as a person says them. | the report passes but one line reads unnatural in the transcript (a number read digit by digit, a clipped last word in the word timings) | the report prints FAIL |
| thumb.hook | 0.5 | each cover's hook is 3 to 7 words and is about the scene the cover shows | n/a | outside 3 to 7 words, or about another scene |
| thumb.small | 1 | at 320 px wide the hook reads and one thing leads, on all four covers | one cover fails at 320 px | two or more fail |
| thumb.claim | 0.5 | the hook states a fact (a name, a number, an action), not a topic label or a slogan | n/a | a label or slogan |

Total is out of 10.

### Notes that fix the scoring

- **vo.natural.** You can't listen, so score it from the transcript and the voice report. When the report prints PASS and the transcript reads naturally, the row earns full. Do not cap it at half because you could not hear the audio. A silence between two scenes is a scene change, not a pause; the report only counts silences inside a section.
- **content.read.** The tags sit on the spoken word they belong to, so they share the moment with the voice; they still have to say something the voice does not. A caption repeats the voice by design and does not count against this row.
- **Blockers.** A blocker is any automatic-style failure (style.motion with 2+ flags, content.facts, vo.pacing, vo.length, thumb.hook) or a clipped word. A score of 8 or more with a blocker does not ship.

## Report

1. The row table with points and, for each lost point, the frame (or timecode) and the exact fix.
2. The total out of 10, and whether there is a blocker.
3. The five fixes that improve the film most, in order.
4. What you could not check.
