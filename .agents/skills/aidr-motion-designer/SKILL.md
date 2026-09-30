---
name: aidr-motion-designer
description: Motion rules for every AI;DR video frame. Use when designing a shot sequence, writing or reviewing a frame's animation, briefing a frame worker, or judging why a frame feels cheap, stiff, frozen or bouncy. Use alongside the hyperframes skills for any file under videos/*/compositions/.
---

# aidr-motion-designer

Two sources, merged: the owner's rules and the HyperFrames motion doctrine. Where they disagree, the house decision is stated below.

## The owner's rules

```
Motion rules for every shot:
- Arrive fast, land soft: each frame covers 12–19% of the remaining distance.
  Never constant speed, never a dead stop.
- Nothing ever freezes: holds keep a slow push-in (~0.25% per frame).
- Every move lasts at least 0.3s; big moves 0.5–0.75s.
- Stagger grouped elements 2–4 frames apart.
- Motion blur follows direction and speed, fades as things settle; fast
  moves get real in-between frames blended, never blended across a cut.
- Text stays still at least 8 frames before it moves.
- One focal point per frame.
- Cuts land on the beat or 2 frames before it; morphs start ~4 frames early.
- Sound supports motion: a click on the press, a whoosh with the move,
  an impact under a big reveal.
```

## The HyperFrames doctrine

- **Smooth long-tail settle.** `power3.out` by default, `expo.out` for a fast arrival. No `back`, `bounce` or `elastic` by default.
- **Reveal in sequence.** Do not put everything on screen in the first quarter of a shot. Each piece arrives on its own beat.
- **No breathing loops** on cards or text.
- **Seek-safe core** (hard rules; the frame is a paused timeline seeked frame by frame):
  - One paused GSAP timeline.
  - Entrances use `fromTo` with an explicit from-state.
  - No `repeat: -1`. No `yoyo` loops.
  - No `Math.random`, no `Date.now`. Variation derives from the element index.
  - No CSS `transition` or `@keyframes` for motion.
  - Animate transforms and paint-only properties. Never `width`, `height`, `top` or `left`.

## House decision: holds

The doctrine prefers a still hold. The owner's rule says nothing freezes. **The owner's rule wins**, in one form only:

- One **linear, finite push** on the frame's root or camera wrapper.
- It runs for the **whole shot from t=0**.
- Never a loop. Never on an individual element. Never a push that starts mid-hold.
- 0.25% per frame is the **ceiling**. At 30fps that compounds to about 7.8% per second.
- Default to **2–4% total scale over a shot**. Cap at 8%.

This keeps the shot alive without the two things the doctrine bans: breathing elements and a camera that starts drifting while the viewer is reading.

## Frames to seconds (30fps)

| Rule | Frames | Seconds |
|------|--------|---------|
| Stagger within a group | 2–4 | 0.067–0.133 |
| Text still before it moves | ≥ 8 | ≥ 0.27 |
| Cut ahead of the beat | 2 | 0.067 |
| Morph starts ahead of the beat | 4 | 0.133 |
| Shortest move | 9 | 0.3 |
| Big move | 15–23 | 0.5–0.75 |

A group's total stagger should still read as one arrival: keep `items × stagger` at or under about 0.5s.

## The parking ease

"Each frame covers 12–19% of the remaining distance" is exponential decay: after `f` frames the remaining distance is `(1 - k)^f`, with `k` between 0.12 and 0.19.

As a seek-safe pure function, normalised so the move ends exactly at rest:

```js
const park = (k = 0.15, fps = 30) => (dur) => (p) =>
  (1 - Math.pow(1 - k, p * dur * fps)) / (1 - Math.pow(1 - k, dur * fps));

tl.fromTo(el, { x: 240, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: park()(0.6) }, t);
```

- At `k = 0.15` an object is within 1% of rest after about 28 frames.
- Higher `k` lands sooner and harder; lower `k` glides longer.
- `expo.out` is the closest built-in. Use it when a custom ease is not worth it.

## Blur

- Blur follows the direction of travel: horizontal move, horizontal blur; vertical move, vertical blur.
- Blur scales with speed and is gone when the element settles.
- Never blend across a cut.

## Reading time and focus

- Text that has just landed holds still for at least 8 frames, and long enough to be read, before anything moves it.
- One focal point per frame. If two things compete, stagger them or dim one.

## Sound

Sound needs the same precision as motion. The strongest part of the sound lands on the strongest part of the visual action, so the two read as one event.

- A **click** lands on the press frame.
- A **whoosh** peaks with the movement, not at its start.
- An **impact** sits under the frame where a large object arrives.
- A sound placed vaguely near the animation feels disconnected. **Tolerance: one frame.**
- Cuts land on the beat or 2 frames before it; morphs start about 4 frames early.

## AI;DR motifs and their rules

Rule ids are from the `hyperframes-animation` rule library (`rules/<id>.md`). Read the rule before building the move.

| Motif | Rule ids |
|-------|----------|
| Semicolon caret blink and a typed line | `discrete-text-sequence`, `context-sensitive-cursor` |
| Marker highlight sweep | `css-marker-patterns` |
| Count from the day's story total down to 8 | `counting-dynamic-scale` |
| Ranked rows arriving on the beat | `kinetic-beat-slam`, `dynamic-content-sequencing` |
| Logo letters drawn or assembled from outlined paths | `svg-path-draw` |
| Camera | `multi-phase-camera`, `viewport-change`, `coordinate-target-zoom` |
| Directional blur | `motion-blur-streak` |
| English / Vietnamese split | `split-tilt-cards` |

## Review a frame

- [ ] Every arrival decelerates into place. Nothing moves at constant speed; nothing stops dead.
- [ ] No move is shorter than 0.3s.
- [ ] Grouped elements are staggered 2–4 frames, not fired together.
- [ ] The hold has one linear root push from t=0, within 2–4% (8% at most). No element breathes.
- [ ] Blur matches direction and clears on settle.
- [ ] Text holds still at least 8 frames and can be read.
- [ ] One focal point.
- [ ] Cuts sit on the beat or 2 frames early.
- [ ] Each sound's peak is within one frame of its visual hit.
- [ ] No bounce, no overshoot, unless the brief asked for it.
- [ ] Seek-safe: one paused timeline, `fromTo`, no infinite repeats, no randomness, transforms only.
- [ ] Nothing from the brand avoid list (`videos/brand/brand.md`).
