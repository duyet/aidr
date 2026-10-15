// Story scenes (chosen per story by look.mjs, not rotated by date). The story section carries `l-<id>`; the base
// story CSS in template/style.css is the split layout. `image`: needs at least one image on disk. `max`: at most
// this many a day unless pinned. `suits(f)`: how well the scene fits a story, 0 = never; the highest eligible score
// wins. `f` is { index, images, money, thumb }: script position, images on disk, a dollar figure in the English
// bullet, and whether it is the cover (thumb) story. `motion(tl, S, sc, h)` adds to the shared story motion.

export const LAYOUTS = [
  {
    id: "split",
    image: false,
    max: Infinity,
    suits: (f) => (f.images === 0 || f.index % 2 === 0 ? 2 : 1),
    css: "",
  },
  {
    id: "full",
    image: true,
    max: Infinity,
    suits: (f) => (f.index % 2 ? 2 : 1),
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
    suits: (f) => (f.images === 0 ? 1 : f.money ? 3 : 0),
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
  {
    id: "poster",
    image: false,
    max: 1,
    // frame.md Poster Panel: the cover story's copy in ink on a flat yellow panel, its picture on the paper side.
    suits: (f) => (f.thumb ? 5 : 0),
    motion: (tl, S, sc, h) => {
      tl.fromTo(
        h.$(".copy", sc),
        {
          clipPath: h.vertical
            ? "inset(100% 0% 0% 0%)"
            : "inset(0% 100% 0% 0%)",
        },
        { clipPath: "inset(0% 0% 0% 0%)", duration: 0.6, ease: "power3.out" },
        S.start
      );
    },
    css: `
.l-poster .copy {
  background: var(--yellow);
  box-sizing: border-box;
}
.f-16x9 .l-poster .copy {
  left: 0;
  top: 0;
  width: 860px;
  height: 980px;
  padding: 270px 72px 0;
}
.f-9x16 .l-poster .copy {
  left: 0;
  top: 680px;
  width: 1080px;
  height: 620px;
  padding: 44px 64px 0;
}
.f-16x9 .l-poster .media {
  left: 940px;
  top: 170px;
  width: 908px;
  height: 610px;
}
.f-16x9 .l-poster .rank {
  left: 72px;
  top: 134px;
  width: 112px;
  height: 112px;
  font-size: 70px;
}
.l-poster .rank {
  background: var(--ink);
  color: var(--paper);
}
.l-poster .cat,
.l-poster .kicker {
  color: var(--ink);
}
.l-poster .head .mk {
  background-image: linear-gradient(var(--paper), var(--paper));
}
.l-poster .statrow {
  border-top-color: var(--ink);
}
.l-poster .stat-label,
.l-poster .src {
  color: var(--ink);
}
`,
  },
  {
    id: "statement",
    image: false,
    max: 2,
    // frame.md Manifesto: a story with no picture is its headline, centred in large italic serif with the marker.
    suits: (f) => (f.images === 0 && !f.thumb ? 4 : 0),
    motion: (tl, S, sc, h) => {
      h.fit(h.$(".head", sc), h.vertical ? 5 : 3, 48);
      tl.fromTo(
        h.$(".statrow", sc),
        { opacity: 0 },
        { opacity: 1, duration: 0.4, ease: "power1.out" },
        S.start + 0.6
      );
    },
    css: `
.l-statement .media {
  display: none;
}
.l-statement .copy {
  text-align: center;
}
.f-16x9 .l-statement .copy {
  left: 220px;
  top: 300px;
  width: 1480px;
}
.f-9x16 .l-statement .copy {
  left: 64px;
  top: 400px;
  width: 952px;
}
.l-statement .rank {
  background: none;
  font-weight: 500;
}
.f-16x9 .l-statement .rank {
  left: 900px;
  top: 150px;
  width: 120px;
  height: 120px;
  font-size: 120px;
}
.f-9x16 .l-statement .rank {
  left: 470px;
  top: 220px;
  width: 140px;
  height: 140px;
  font-size: 140px;
}
.l-statement .kicker {
  white-space: normal;
}
.l-statement .head {
  font-style: italic;
  line-height: 1.04;
}
.f-16x9 .l-statement .head {
  font-size: 104px;
  margin-top: 22px;
}
.f-9x16 .l-statement .head {
  font-size: 92px;
  margin-top: 26px;
}
.l-statement .statrow {
  display: flex;
  justify-content: center;
  align-items: baseline;
  gap: 24px;
  width: 640px;
  margin-left: auto;
  margin-right: auto;
}
.l-statement .stat {
  font-size: calc(var(--stat) * 0.8);
}
.l-statement .stat-label {
  margin-top: 0;
}
`,
  },
];
