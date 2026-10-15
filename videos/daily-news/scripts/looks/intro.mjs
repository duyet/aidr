// Intro variants (look axis "intro"). Each entry is the whole variant: its markup, its CSS, its motion and its
// sound cues. `html(c)` gets the build's context (stories, date parts, labels, helpers); `motion(tl, I, h)` runs in
// the page with the paused timeline, `__DN.intro` and the shared helpers; `cues(c)` returns [cue, at, gain] for
// config.sfx.cues. `auto` puts it in the daily rotation. Motion functions are serialized into the page, so they use
// only their arguments and page globals.
import { gridCss } from "../grid.mjs";

export const INTROS = [
  {
    id: "grid",
    auto: true,
    // The summary grid: every story at once, fully drawn on frame 0 (the auto-thumbnail frame).
    html: (c) => {
      const tiles = c.stories
        .map((s) => {
          const img = c.firstImage(s);
          const face = img
            ? `<img id="g${s.rank}-img" src="${c.esc(img)}" alt="" /><div class="tshade"></div>`
            : `<div class="tpaper"><span>${c.esc(s.paper?.venue ?? c.byRank[s.rank]?.source ?? "")}</span><b>${c.esc(s.paper?.title ?? s.kicker)}</b></div>`;
          return `<div class="tile${img ? "" : " noimg"}" data-rank="${s.rank}">${face}<span class="tr">${s.rank}</span><div class="tt"><div class="tk">${c.esc(s.kicker)}</div><div class="th">${c.esc(s.headline.replace(/\*/g, ""))}</div></div><span class="tbar"></span></div>`;
        })
        .join("");
      return `<div class="ghead"><div class="gdate"><span class="gday">${c.pad2(c.DAY)}</span><span class="gmon">${c.esc(c.DOW.toUpperCase())}<br/>${c.esc(c.MON.toUpperCase())} ${c.year}</span></div><div class="gbrand">${c.logo("")}<span>${c.esc(c.UI.daily)}<br/>${c.esc(c.UI.topIn(c.stories.length))}</span></div></div><style>${gridCss(c.stories.length)}</style><div class="tiles" data-n="${c.stories.length}">${tiles}</div><div class="gfoot">${c.esc(c.title)}</div>`;
    },
    cues: (c) => [
      ...c.stories.map((_, i) => ["tick", 0.8 + i * 0.3, 0.7]),
      ...c.focus.map((f) => ["tick", f.at - 0.05, 0.8]),
    ],
    motion: (tl, I, h) => {
      // Frame 0 is the finished grid (title included). Then each tile is underlined in turn, and the grid drifts.
      tl.fromTo(
        ".tiles",
        { y: 0 },
        { y: h.vertical ? -18 : -10, duration: I.dur, ease: "none" },
        I.start
      );
      h.$$(".tile").forEach((tile, i) => {
        h.fit(h.$(".th", tile), 3, 20);
        if (tile.classList.contains("noimg"))
          h.fitAbove(h.$(".tpaper b", tile), h.$(".tt", tile), 16, 22);
        tl.fromTo(
          h.$(".tbar", tile),
          { scaleX: 0 },
          { scaleX: 1, duration: 0.35, ease: h.LAND },
          I.start + 0.8 + i * 0.3
        );
        tl.fromTo(
          h.$("img", tile) || h.$(".tpaper", tile),
          { scale: 1.0 },
          { scale: 1.08, duration: I.dur, ease: "none" },
          I.start
        );
      });
      // A tile lifts while the intro names its story; the others step back. The lift grows a tile by
      // about 36px whatever its size (1.06 for a six-story tile), so a hero or half-frame tile stays
      // inside the frame.
      const F = I.focus ?? [];
      F.forEach((f) => {
        const tile = h.$(`.tile[data-rank="${f.rank}"]`);
        const others = h.$$(".tile").filter((t) => t !== tile);
        const lift = h.measured(tile, () =>
          Math.min(1.06, 1 + 36 / Math.max(tile.offsetWidth, tile.offsetHeight))
        );
        tl.to(
          tile,
          { scale: lift, opacity: 1, zIndex: 2, duration: 0.3, ease: h.LAND },
          f.at - 0.1
        );
        tl.to(
          others,
          {
            scale: 1,
            opacity: 0.4,
            zIndex: 1,
            duration: 0.3,
            ease: "power2.out",
          },
          f.at - 0.1
        );
      });
      if (F.length)
        tl.to(
          ".tile",
          { scale: 1, opacity: 1, duration: 0.3, ease: "power2.inOut" },
          I.dur - 0.45
        );
    },
    css: `
.ghead {
  position: absolute;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.f-16x9 .ghead {
  left: 60px;
  right: 60px;
  top: 34px;
  height: 120px;
}
.f-9x16 .ghead {
  left: 40px;
  right: 40px;
  top: 120px;
  height: 200px;
}
.gdate {
  display: flex;
  align-items: center;
  gap: 22px;
}
.gday {
  font-family: var(--serif);
  font-weight: 600;
  line-height: 0.85;
  letter-spacing: -0.03em;
  font-size: 128px;
  display: block;
}
.f-9x16 .gday {
  font-size: 190px;
}
.gmon {
  font-weight: 800;
  letter-spacing: 0.18em;
  font-size: 30px;
  line-height: 1.25;
  display: block;
}
.f-9x16 .gmon {
  font-size: 36px;
}
.gbrand {
  display: flex;
  align-items: center;
  gap: 16px;
  background: var(--ink);
  color: var(--paper);
  padding: 12px 24px 12px 12px;
  font-weight: 800;
  letter-spacing: 0.12em;
  font-size: 22px;
  line-height: 1.25;
}
.gbrand svg {
  width: 64px;
  height: 64px;
  display: block;
}
.f-9x16 .gbrand {
  font-size: 24px;
}
.field ~ .cam .gbrand svg rect {
  fill: var(--yellow);
}
.field ~ .cam .gbrand svg path {
  fill: var(--ink);
}
/* Columns, rows and areas per story count come from scripts/grid.mjs (the markup inlines them), and so
   does --type, the scale of each tile's text and badge (1 = the six-story grid). */
.tiles {
  position: absolute;
  display: grid;
}
.f-16x9 .tiles {
  left: 60px;
  right: 60px;
  top: 174px;
  bottom: 46px;
  gap: 18px;
}
/* The grid ends by 72% and clears the right-side buttons of TikTok, Reels and Shorts. */
.f-9x16 .tiles {
  left: 40px;
  right: 120px;
  top: 340px;
  bottom: 560px;
  gap: 16px;
}
.tile {
  position: relative;
  overflow: hidden;
  background: var(--ink);
}
.tile img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.tile .tshade {
  position: absolute;
  inset: 0;
  background: linear-gradient(rgba(10, 10, 10, 0) 30%, rgba(10, 10, 10, 0.88));
}
.tile.noimg {
  background: var(--soft);
}
.tpaper {
  position: absolute;
  inset: 0;
  padding: calc(70px * var(--type)) calc(26px * var(--type)) 0;
  display: flex;
  flex-direction: column;
  gap: calc(10px * var(--type));
}
.tpaper span {
  font-weight: 800;
  font-size: calc(18px * var(--type));
  letter-spacing: 0.12em;
  color: #b31b1b;
}
.tpaper b {
  font-family: var(--serif);
  font-weight: 500;
  font-size: calc(46px * var(--type));
  line-height: 1;
  color: var(--ink);
}
.tr {
  position: absolute;
  left: 0;
  top: 0;
  width: calc(64px * var(--type));
  height: calc(64px * var(--type));
  background: var(--yellow);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--serif);
  font-weight: 600;
  font-size: calc(44px * var(--type));
  line-height: 1;
}
.tt {
  position: absolute;
  left: calc(22px * var(--type));
  right: calc(22px * var(--type));
  bottom: calc(22px * var(--type));
}
.tk {
  font-weight: 800;
  font-size: calc(20px * var(--type));
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--yellow);
}
.th {
  font-family: var(--serif);
  font-weight: 500;
  font-size: calc(34px * var(--type));
  line-height: 1.05;
  color: var(--paper);
  margin-top: calc(6px * var(--type));
}
.noimg .tk {
  color: var(--amber);
}
.noimg .th {
  color: var(--ink);
}
.f-9x16 .th {
  font-size: calc(32px * var(--type));
}
.f-9x16 .tpaper b {
  font-size: calc(38px * var(--type));
}
.f-9x16 .tk {
  font-size: calc(21px * var(--type));
}
.tbar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: calc(8px * var(--type));
  background: var(--yellow);
  transform-origin: 0 50%;
  display: block;
}
.gfoot {
  position: absolute;
  left: 40px;
  right: 40px;
  font-family: var(--serif);
  font-weight: 500;
  text-align: center;
  line-height: 1;
}
.f-16x9 .gfoot {
  display: none;
}
.f-9x16 .gfoot {
  display: none;
}
`,
  },
  {
    id: "date-slam",
    auto: false,
    html: (c) =>
      `<div class="slam"><span class="dow">${c.esc(c.DOW.toUpperCase())}</span><span class="day">${c.pad2(c.DAY)}</span><span class="mon">${c.esc(c.MON.toUpperCase())}</span></div>
      <div class="slam-tail"><div class="title">${c.esc(c.title)}</div><div class="with">${c.logo("")}<span>AI;DR ${c.esc(c.UI.brief)}</span></div></div>`,
    cues: () => [["rankHit", 0.45, 0.9]],
    motion: (tl, I, h) => {
      tl.fromTo(
        ".slam .dow",
        { y: -60, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: h.LAND },
        I.start + 0.15
      );
      tl.fromTo(
        ".slam .day",
        { scale: 1.9, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.55, ease: h.LAND },
        I.start + 0.3
      );
      tl.fromTo(
        ".slam .mon",
        { y: 60, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: h.LAND },
        I.start + 0.45
      );
      tl.fromTo(
        ".slam-tail .title",
        { y: 50, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: h.LAND },
        I.start + 1.2
      );
      tl.fromTo(
        ".slam-tail .with",
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: h.LAND },
        I.start + 1.2 + 4 * h.F
      );
    },
    css: `
.slam {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.f-16x9 .slam {
  top: 120px;
}
.f-9x16 .slam {
  top: 440px;
}
.slam .dow {
  font-weight: 800;
  font-size: 64px;
  letter-spacing: 0.4em;
  margin-right: -0.4em;
}
.slam .day {
  font-family: var(--serif);
  font-weight: 600;
  font-size: 440px;
  line-height: 0.9;
  letter-spacing: -0.04em;
}
.slam .mon {
  font-weight: 800;
  font-size: 64px;
  letter-spacing: 0.4em;
  margin-right: -0.4em;
}
.f-9x16 .slam .day {
  font-size: 520px;
}
.slam-tail {
  position: absolute;
  left: 0;
  right: 0;
  text-align: center;
}
.f-16x9 .slam-tail {
  top: 770px;
}
.f-9x16 .slam-tail {
  top: 1330px;
  padding: 0 60px;
}
.slam-tail .title {
  font-family: var(--serif);
  font-weight: 500;
  font-size: 84px;
  line-height: 1.02;
}
.slam-tail .with {
  display: inline-flex;
  align-items: center;
  gap: 18px;
  margin-top: 22px;
  font-weight: 800;
  font-size: 30px;
  letter-spacing: 0.18em;
}
.slam-tail .with svg {
  width: 58px;
  height: 58px;
  display: block;
}
`,
  },
  {
    id: "headline-stack",
    auto: false,
    html: (c) =>
      `<div class="hstack"><div class="hdate"><span>${c.esc(c.DOW.toUpperCase())} ${c.pad2(c.DAY)} ${c.esc(c.MON.toUpperCase())}</span><span>AI;DR TOP ${c.stories.length}</span></div>${c.stories.map((s) => `<div class="row"><span class="n">${s.rank}</span><span class="t">${c.esc(s.kicker)}</span></div>`).join("")}</div>`,
    cues: (c) => c.stories.map((_, i) => ["tick", 0.25 + i * 0.22 + 0.1, 0.7]),
    motion: (tl, I, h) => {
      tl.fromTo(
        ".hstack .hdate",
        { y: -30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: h.LAND },
        I.start + 0.1
      );
      h.$$(".hstack .row").forEach((row, i) => {
        tl.fromTo(
          row,
          { x: -80, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.5, ease: h.LAND },
          I.start + 0.25 + i * 0.22
        );
      });
      tl.fromTo(
        ".hstack",
        { y: 0 },
        { y: h.vertical ? -40 : -20, duration: I.dur, ease: "none" },
        I.start
      );
    },
    css: `
.hstack {
  position: absolute;
  display: flex;
  flex-direction: column;
}
.f-16x9 .hstack {
  left: 120px;
  top: 150px;
  width: 1680px;
  gap: 14px;
}
.f-9x16 .hstack {
  left: 60px;
  top: 300px;
  width: 960px;
  gap: 18px;
}
.hstack .row {
  display: flex;
  align-items: baseline;
  gap: 26px;
  border-bottom: 1px solid rgba(10, 10, 10, 0.25);
  padding-bottom: 12px;
}
.hstack .row .n {
  font-family: var(--serif);
  font-weight: 600;
  font-size: 64px;
  width: 70px;
  display: block;
}
.hstack .row .t {
  font-family: var(--serif);
  font-weight: 500;
  font-size: 60px;
  line-height: 1.05;
  display: block;
}
.f-9x16 .hstack .row .t {
  font-size: 58px;
}
.hdate {
  font-weight: 800;
  font-size: 34px;
  letter-spacing: 0.2em;
  padding-bottom: 18px;
  display: flex;
  justify-content: space-between;
  border-bottom: 3px solid var(--ink);
}
`,
  },
  {
    id: "countdown",
    auto: false,
    html: (c) =>
      `<div class="stack">${c.logo("biglogo")}<div class="eyebrow">AI;DR ${c.esc(c.UI.brief)}${c.esc(c.issueTag)}</div><div class="title">${c.esc(c.title)}</div><div class="date">${c.esc(c.dateline)}</div>
      <div class="dots">${c.stories.map((s) => `<span>${s.rank}</span>`).join("")}</div></div>`,
    cues: (c) => c.stories.map((_, i) => ["tick", 1.3 + i * 0.2 + 0.1, 0.7]),
    motion: (tl, I, h) => {
      tl.fromTo(
        ".stack .biglogo",
        { scale: 0.6, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.6, ease: h.LAND },
        I.start + 0.2
      );
      tl.fromTo(
        ".stack .eyebrow",
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: h.LAND },
        I.start + 0.45
      );
      tl.fromTo(
        ".stack .title",
        { y: 50, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: h.LAND },
        I.start + 0.55
      );
      tl.fromTo(
        ".stack .date",
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: h.LAND },
        I.start + 0.7
      );
      h.$$(".dots span").forEach((d, i) => {
        tl.fromTo(
          d,
          { y: 40, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.4, ease: h.LAND },
          I.start + 1.3 + i * 0.2
        );
      });
    },
    css: `
.stack .eyebrow {
  margin-top: 44px;
  font-weight: 800;
  font-size: 28px;
  letter-spacing: 0.22em;
}
.stack .date {
  margin-top: 26px;
  font-size: 32px;
  font-weight: 600;
}
.dots {
  display: flex;
  gap: 22px;
  margin-top: 48px;
}
.dots span {
  width: 76px;
  height: 76px;
  border: 2px solid var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--serif);
  font-weight: 600;
  font-size: 44px;
}
.f-9x16 .dots {
  flex-wrap: wrap;
  justify-content: center;
  width: 400px;
}
.f-9x16 .dots span {
  width: 110px;
  height: 110px;
  font-size: 60px;
}
`,
  },
];
