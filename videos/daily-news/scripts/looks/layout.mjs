// Story scenes (chosen per story by look.mjs, not rotated by date). The story section carries `l-<id>`; the base
// story CSS in template/style.css is the split layout. `image`: needs at least one image on disk. `max`: at most
// this many a day unless pinned. `motion(tl, S, sc, h)` adds to the shared story motion.

export const LAYOUTS = [
  { id: "split", image: false, max: Infinity, css: "" },
  {
    id: "full",
    image: true,
    max: Infinity,
    motion: (tl, S, sc, h) => {
      tl.fromTo(
        h.$(".copy", sc),
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 0.55, ease: h.LAND },
        S.start + 0.25
      );
    },
    // The post image fills the frame, copy sits on a paper card like a lower third.
    css: `
.f-16x9 .l-full .media {
  left: 0;
  top: 130px;
  width: 100%;
  height: 850px;
}
.f-9x16 .l-full .media {
  left: 0;
  top: 170px;
  width: 100%;
  height: 1130px;
}
.l-full .media .shade {
  height: 60%;
}
.l-full .copy {
  background: var(--paper);
  padding: 34px 40px 36px;
}
.f-16x9 .l-full .copy {
  left: 72px;
  top: auto;
  bottom: 300px;
  width: 1100px;
}
.f-9x16 .l-full .copy {
  left: 40px;
  top: 600px;
  width: 1000px;
}
.f-16x9 .l-full .rank {
  left: auto;
  right: 72px;
  top: 170px;
}
.f-16x9 .l-full .statrow {
  display: flex;
  align-items: baseline;
  gap: 26px;
}
.f-16x9 .l-full .stat {
  font-size: 80px;
}
.l-full .media .credit {
  top: auto;
  bottom: 24px;
  right: 72px;
}
.f-9x16 .l-full .media .credit {
  bottom: 24px;
  right: 40px;
}
`,
  },
  {
    id: "stat",
    image: false,
    max: 2,
    // The number is the story; the image becomes an inset (or the paper card when there is none).
    css: `
.l-stat .media {
  border: 1px solid var(--hair);
}
.f-16x9 .l-stat .media {
  left: auto;
  right: 72px;
  top: 170px;
  width: 620px;
  height: 420px;
}
.f-16x9 .l-stat .copy {
  left: 72px;
  top: 170px;
  width: 1060px;
}
.f-16x9 .l-stat .rank {
  left: auto;
  right: 640px;
  top: 130px;
  width: 110px;
  height: 110px;
  font-size: 68px;
}
.l-stat .statrow {
  border-top: 0;
  padding-top: 0;
  margin-top: 0;
}
.f-16x9 .l-stat .stat {
  font-size: 300px;
  letter-spacing: -0.03em;
}
.f-9x16 .l-stat .media {
  left: 40px;
  top: 180px;
  width: 1000px;
  height: 400px;
}
.f-9x16 .l-stat .copy {
  top: 620px;
}
.f-9x16 .l-stat .statrow {
  display: block;
  margin-top: 18px;
}
.f-9x16 .l-stat .stat {
  font-size: 190px;
  letter-spacing: -0.03em;
}
.f-9x16 .l-stat .stat-label {
  margin-top: 8px;
}
.l-stat .stat .hl {
  background: var(--yellow);
  padding: 0 18px;
  display: inline-block;
}
.l-stat .head {
  font-size: calc(var(--head) * 0.8);
}
`,
  },
];
