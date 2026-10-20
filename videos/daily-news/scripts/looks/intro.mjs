// Intro variants (look axis "intro"). Each entry is the whole variant: its markup, its CSS, its motion and its
// sound cues. `html(c)` gets the build's context (stories, date parts, labels, helpers); `motion(tl, I, h)` runs in
// the page with the paused timeline, `__DN.intro` and the shared helpers; `cues(c)` returns [cue, at, gain] for
// config.sfx.cues. `auto` puts it in the daily rotation. Motion functions are serialized into the page, so they use
// only their arguments and page globals.
import { gridCss } from "../grid.mjs";

const plain = (headline) => headline.replace(/\*/g, "");
const category = (c, s) => s.category ?? c.byRank[s.rank]?.category ?? "";
// A story's picture, else its paper card (venue and title) when it has none, so no frame shows an empty box.
const face = (c, s) => {
  const img = c.firstImage(s);
  return img
    ? `<img src="${c.esc(img)}" alt="" />`
    : `<div class="pcard"><span>${c.esc(s.paper?.venue ?? c.byRank[s.rank]?.source ?? "")}</span><b>${c.esc(s.paper?.title ?? s.kicker)}</b></div>`;
};
// A `.face` box holds a picture or a paper card; each intro positions the box. The card's type is sized in container
// units, so one rule fits a strip cell, a square and a half-frame panel.
const FACE_CSS = `
#intro .face {
  overflow: hidden;
  container-type: size;
  background: var(--ink);
}
#intro .face > img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
#intro .pcard {
  position: absolute;
  inset: 0;
  background: var(--soft);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3cqh;
  padding: 0 8cqw;
  text-align: left;
}
#intro .pcard span {
  font-weight: 800;
  font-size: max(13px, min(5cqw, 8cqh));
  letter-spacing: 0.12em;
  color: #b31b1b;
}
#intro .pcard b {
  font-family: var(--serif);
  font-weight: 500;
  font-size: max(16px, min(9cqw, 13cqh));
  line-height: 1.02;
  color: var(--ink);
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 4;
  overflow: hidden;
}
`;

export const INTROS = [
  {
    id: "grid",
    auto: true,
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
      ...c.focus.map((f) => ["tick", f.at, 0.8]),
    ],
    motion: (tl, I, h) => {
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
          f.at
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
          f.at
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
    id: "cover",
    auto: true,
    // frame.md's Cover: the cover still's story as a half-frame picture with a date tab, its hook as the display,
    // and a footer band naming the other stories. Then the picture pushes in, the band is underlined cell by cell,
    // and a story the intro names takes the picture and the band.
    html: (c) => {
      const others = c.stories.filter((s) => s !== c.lead);
      const alts = others
        .filter((s) => c.firstImage(s))
        .map(
          (s) =>
            `<img class="cv-alt" data-rank="${s.rank}" src="${c.esc(c.firstImage(s))}" alt="" />`
        )
        .join("");
      const cells = others
        .map(
          (s) =>
            `<div class="cv-cell" data-rank="${s.rank}"><span class="cv-bar"></span><b>${s.rank}</b><span>${c.esc(s.kicker)}</span></div>`
        )
        .join("");
      const cols =
        others.length <= 4 ? others.length : Math.ceil(others.length / 2);
      return `<div class="cv-media face">${face(c, c.lead)}${alts}</div>
<div class="cv-date"><b>${c.pad2(c.DAY)}</b><span>${c.esc(c.MON.toUpperCase())}</span></div>
<div class="cv-label">${c.logo("")}<span>${c.esc(c.UI.daily)} · ${c.esc(c.UI.topIn(c.stories.length))}</span></div>
<div class="cv-col"><div class="cv-copy"><div class="cv-cat"><b>${c.lead.rank}</b>${c.esc(category(c, c.lead))}</div><div class="cv-hook">${c.esc(c.hook)}</div><div class="cv-head">${c.esc(plain(c.lead.headline))}</div></div>${
        others.length
          ? `<div class="cv-band" style="--cols:${cols}">${cells}</div>`
          : ""
      }</div>`;
    },
    cues: (c) => [
      ...c.stories.slice(1).map((_, i) => ["tick", 0.8 + i * 0.25, 0.7]),
      ...c.focus.map((f) => ["tick", f.at, 0.8]),
    ],
    motion: (tl, I, h) => {
      h.fit(h.$(".cv-hook"), 3, 56);
      h.fit(h.$(".cv-head"), 2, 26);
      tl.fromTo(
        ".cv-media > *",
        { scale: 1 },
        { scale: 1.08, duration: I.dur, ease: "none" },
        I.start
      );
      tl.fromTo(
        ".cv-col",
        { y: 0 },
        { y: h.vertical ? -14 : -10, duration: I.dur, ease: "none" },
        I.start
      );
      const cells = h.$$(".cv-cell");
      cells.forEach((cell, i) => {
        tl.fromTo(
          h.$(".cv-bar", cell),
          { scaleX: 0 },
          { scaleX: 1, duration: 0.35, ease: h.LAND },
          I.start + 0.8 + i * 0.25
        );
      });
      // A named story in the band takes the picture; naming the lead (or a story with no picture) gives it back.
      const F = I.focus ?? [];
      F.forEach((f, k) => {
        const cell = h.$(`.cv-cell[data-rank="${f.rank}"]`);
        const alt = h.$(`.cv-alt[data-rank="${f.rank}"]`);
        tl.to(
          cells.filter((x) => x !== cell),
          { opacity: 0.35, duration: 0.3, ease: "power2.out" },
          f.at
        );
        if (cell)
          tl.to(cell, { opacity: 1, duration: 0.3, ease: h.LAND }, f.at);
        if (alt)
          tl.fromTo(
            alt,
            { opacity: 0, zIndex: 2 + k },
            {
              opacity: 1,
              duration: 0.4,
              ease: "power2.out",
              immediateRender: false,
            },
            f.at
          );
        else
          tl.to(
            ".cv-alt",
            { opacity: 0, duration: 0.4, ease: "power2.out" },
            f.at
          );
      });
      if (F.length) {
        tl.to(
          cells,
          { opacity: 1, duration: 0.3, ease: "power2.inOut" },
          I.dur - 0.45
        );
        tl.to(
          ".cv-alt",
          { opacity: 0, duration: 0.3, ease: "power2.inOut" },
          I.dur - 0.45
        );
      }
    },
    css: `${FACE_CSS}
.cv-media {
  position: absolute;
}
.cv-media > :first-child {
  z-index: 1;
}
.f-16x9 .cv-media {
  left: 1060px;
  right: 0;
  top: 0;
  bottom: 0;
}
.f-9x16 .cv-media {
  left: 0;
  right: 0;
  top: 0;
  height: 720px;
}
.cv-date {
  position: absolute;
  z-index: 2;
  width: 176px;
  height: 176px;
  background: var(--yellow);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}
.f-16x9 .cv-date {
  left: 1060px;
  top: 0;
}
.f-9x16 .cv-date {
  left: 0;
  top: 544px;
}
.cv-date b {
  font-family: var(--serif);
  font-weight: 600;
  font-size: 108px;
  line-height: 0.8;
  letter-spacing: -0.03em;
}
.cv-date span {
  font-weight: 800;
  font-size: 18px;
  letter-spacing: 0.18em;
  text-align: center;
}
.cv-label {
  position: absolute;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--ink);
  color: var(--paper);
  padding: 10px 22px 10px 10px;
  font-weight: 800;
  font-size: 20px;
  letter-spacing: 0.14em;
}
.cv-label svg {
  width: 48px;
  height: 48px;
  display: block;
}
.field ~ .cam .cv-label svg rect {
  fill: var(--yellow);
}
.field ~ .cam .cv-label svg path {
  fill: var(--ink);
}
.f-16x9 .cv-label {
  left: 72px;
  top: 64px;
}
.f-9x16 .cv-label {
  left: 40px;
  top: 140px;
}
.cv-col {
  position: absolute;
  display: flex;
  flex-direction: column;
}
.cv-copy {
  margin: auto 0;
}
.f-16x9 .cv-col {
  left: 72px;
  width: 916px;
  top: 190px;
  bottom: 60px;
}
.f-9x16 .cv-col {
  left: 56px;
  right: 120px;
  top: 760px;
  bottom: 540px;
}
.cv-cat {
  display: flex;
  align-items: baseline;
  gap: 14px;
  font-weight: 800;
  font-size: 24px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}
.cv-cat b {
  font-family: var(--serif);
  font-weight: 600;
  font-size: 40px;
  letter-spacing: 0;
}
.cv-hook {
  font-family: var(--serif);
  font-weight: 500;
  font-size: 136px;
  line-height: 0.98;
  letter-spacing: -0.015em;
  margin-top: 12px;
}
.f-9x16 .cv-hook {
  font-size: 104px;
}
.cv-head {
  font-family: var(--serif);
  font-weight: 500;
  font-size: 42px;
  line-height: 1.1;
  margin-top: 22px;
}
.f-9x16 .cv-head {
  font-size: 38px;
  margin-top: 16px;
}
.cv-band {
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  column-gap: 24px;
  row-gap: 18px;
}
.f-9x16 .cv-band {
  grid-template-columns: repeat(min(var(--cols), 2), 1fr);
  row-gap: 12px;
}
.cv-cell {
  position: relative;
  display: flex;
  align-items: baseline;
  gap: 12px;
  border-top: 1px solid var(--ink);
  padding-top: 12px;
}
.cv-cell b {
  font-family: var(--serif);
  font-weight: 600;
  font-size: 32px;
  line-height: 1;
}
.cv-cell span {
  font-weight: 700;
  font-size: 22px;
  line-height: 1.15;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}
.cv-cell .cv-bar {
  position: absolute;
  left: 0;
  right: 0;
  top: -1px;
  height: 5px;
  background: var(--ink);
  transform-origin: 0 50%;
  display: block;
}
`,
  },
  {
    id: "date-slam",
    auto: true,
    // frame.md's Poster Panel: the cover still's picture full bleed, and a flat yellow panel with the date set big
    // and the intro title. The rule under the date sweeps on the hit, the picture pushes in, and a story the intro
    // names takes the picture.
    html: (c) => {
      const alts = c.stories
        .filter((s) => s !== c.lead && c.firstImage(s))
        .map(
          (s) =>
            `<img class="ds-alt" data-rank="${s.rank}" src="${c.esc(c.firstImage(s))}" alt="" />`
        )
        .join("");
      return `<div class="ds-media face">${face(c, c.lead)}${alts}</div>
<div class="ds-panel"><span class="ds-dow">${c.esc(c.DOW.toUpperCase())}</span><span class="ds-day">${c.pad2(c.DAY)}</span><span class="ds-mon">${c.esc(c.MON.toUpperCase())} ${c.year}</span><span class="ds-rule"></span><div class="ds-title">${c.esc(c.title)}</div><div class="ds-brand">${c.logo("")}<span>${c.esc(c.UI.daily)} · ${c.esc(c.UI.topIn(c.stories.length))}</span></div></div>`;
    },
    cues: (c) => [
      ["rankHit", 0.45, 0.9],
      ...c.focus.map((f) => ["tick", f.at, 0.8]),
    ],
    motion: (tl, I, h) => {
      h.fit(h.$(".ds-title"), h.vertical ? 3 : 4, 36);
      tl.fromTo(
        ".ds-media > *",
        { scale: 1.02, xPercent: 0 },
        { scale: 1.12, xPercent: -1.5, duration: I.dur, ease: "none" },
        I.start
      );
      tl.fromTo(
        ".ds-panel",
        { y: 0 },
        { y: h.vertical ? -12 : -8, duration: I.dur, ease: "none" },
        I.start
      );
      tl.fromTo(
        ".ds-rule",
        { scaleX: 0 },
        { scaleX: 1, duration: 0.45, ease: h.LAND },
        I.start + 0.45
      );
      const F = I.focus ?? [];
      F.forEach((f, k) => {
        const alt = h.$(`.ds-alt[data-rank="${f.rank}"]`);
        if (alt)
          tl.fromTo(
            alt,
            { opacity: 0, zIndex: 2 + k },
            {
              opacity: 1,
              duration: 0.45,
              ease: "power2.out",
              immediateRender: false,
            },
            f.at
          );
        else
          tl.to(
            ".ds-alt",
            { opacity: 0, duration: 0.45, ease: "power2.out" },
            f.at
          );
      });
    },
    css: `${FACE_CSS}
.ds-media {
  position: absolute;
  inset: 0;
}
.ds-media > :first-child {
  z-index: 1;
}
.ds-panel {
  position: absolute;
  z-index: 3;
  background: var(--yellow);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.f-16x9 .ds-panel {
  left: 72px;
  top: 72px;
  bottom: 72px;
  width: 640px;
  padding: 52px 56px 44px;
}
.f-9x16 .ds-panel {
  left: 40px;
  right: 120px;
  top: 680px;
  bottom: 540px;
  padding: 40px 44px 36px;
}
.ds-dow,
.ds-mon {
  font-weight: 800;
  font-size: 34px;
  letter-spacing: 0.3em;
  line-height: 1;
  display: block;
}
.ds-day {
  font-family: var(--serif);
  font-weight: 600;
  font-size: 330px;
  line-height: 0.8;
  letter-spacing: -0.04em;
  margin: 26px 0 22px -0.04em;
  display: block;
}
.f-9x16 .ds-day {
  font-size: 300px;
  margin: 18px 0 14px -0.04em;
}
.f-9x16 .ds-dow,
.f-9x16 .ds-mon {
  font-size: 30px;
}
.ds-rule {
  align-self: stretch;
  height: 1px;
  background: var(--ink);
  margin: 30px 0 26px;
  transform-origin: 0 50%;
  display: block;
}
.f-9x16 .ds-rule {
  margin: 22px 0 18px;
}
.ds-title {
  font-family: var(--serif);
  font-weight: 500;
  font-size: 72px;
  line-height: 1.02;
  letter-spacing: -0.01em;
}
.f-9x16 .ds-title {
  font-size: 72px;
}
.ds-brand {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: 14px;
  font-weight: 800;
  font-size: 20px;
  letter-spacing: 0.14em;
}
.ds-brand svg {
  width: 48px;
  height: 48px;
  display: block;
}
`,
  },
  {
    id: "chapter",
    auto: true,
    // frame.md's Chapter Divider: the story count as a jumbo numeral, a rail label up the left edge (across the
    // top in 9:16), the intro title, and every story's picture in a strip. Then the numeral drifts, each strip cell
    // is underlined in turn, and a cell the intro names lifts while the others step back.
    html: (c) => {
      const n = c.stories.length;
      const cells = c.stories
        .map(
          (s) =>
            `<div class="ch-cell face" data-rank="${s.rank}">${face(c, s)}<span class="ch-rank">${s.rank}</span><div class="ch-cap">${c.esc(s.kicker)}</div><span class="ch-bar"></span></div>`
        )
        .join("");
      return `<div class="ch-rail"><span><b>${c.esc(c.UI.daily)} · </b>${c.esc(c.dateline)}</span></div>
<div class="ch-num">${n}</div>
<div class="ch-side"><div class="ch-label">${c.esc(c.UI.topIn(n))}</div><div class="ch-title">${c.esc(c.title)}</div></div>
<div class="ch-strip" data-n="${n}" style="--n:${n};--cols:${n <= 4 ? n : Math.ceil(n / 2)}">${cells}</div>`;
    },
    cues: (c) => [
      ...c.stories.map((_, i) => ["tick", 0.8 + i * 0.2, 0.7]),
      ...c.focus.map((f) => ["tick", f.at, 0.8]),
    ],
    motion: (tl, I, h) => {
      // A cross-year week's range is too long for the rail even at 14px, so it drops the show name.
      const rail = h.$(".ch-rail span");
      if (!h.fitWidth(rail, 14)) {
        h.$("b", rail).remove();
        rail.style.fontSize = "";
        h.fitWidth(rail, 14);
      }
      h.fit(h.$(".ch-title"), h.vertical ? 2 : 3, 44);
      if (h.vertical) h.fitAbove(h.$(".ch-title"), h.$(".ch-strip"), 24, 28);
      tl.fromTo(
        ".ch-num",
        { y: 0 },
        { y: h.vertical ? -20 : -14, duration: I.dur, ease: "none" },
        I.start
      );
      const cells = h.$$(".ch-cell");
      cells.forEach((cell, i) => {
        tl.fromTo(
          h.$("img", cell) || h.$(".pcard", cell),
          { scale: 1 },
          { scale: 1.1, duration: I.dur, ease: "none" },
          I.start
        );
        tl.fromTo(
          h.$(".ch-bar", cell),
          { scaleX: 0 },
          { scaleX: 1, duration: 0.35, ease: h.LAND },
          I.start + 0.8 + i * 0.2
        );
      });
      const F = I.focus ?? [];
      F.forEach((f) => {
        const cell = h.$(`.ch-cell[data-rank="${f.rank}"]`);
        if (!cell) return;
        tl.to(
          cell,
          { scale: 1.04, opacity: 1, zIndex: 2, duration: 0.3, ease: h.LAND },
          f.at
        );
        tl.to(
          cells.filter((x) => x !== cell),
          {
            scale: 1,
            opacity: 0.4,
            zIndex: 1,
            duration: 0.3,
            ease: "power2.out",
          },
          f.at
        );
      });
      if (F.length)
        tl.to(
          cells,
          { scale: 1, opacity: 1, duration: 0.3, ease: "power2.inOut" },
          I.dur - 0.45
        );
    },
    css: `${FACE_CSS}
/* The rail's box bounds its length (rotated, its width runs up from y=640), and the motion fits the text to it. */
.ch-rail {
  position: absolute;
  overflow: hidden;
  font-weight: 600;
  font-size: 20px;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  white-space: nowrap;
}
.ch-rail span {
  display: inline-block;
}
.ch-rail b {
  font-weight: inherit;
}
.f-16x9 .ch-rail {
  left: 70px;
  top: 640px;
  width: 590px;
  transform: rotate(-90deg);
  transform-origin: 0 0;
}
.f-9x16 .ch-rail {
  left: 40px;
  right: 40px;
  top: 140px;
  text-align: center;
  font-size: 22px;
  letter-spacing: 0.2em;
}
.ch-num {
  position: absolute;
  font-family: var(--serif);
  font-weight: 500;
  line-height: 0.8;
  letter-spacing: -0.04em;
}
.f-16x9 .ch-num {
  left: 130px;
  top: 64px;
  font-size: 680px;
}
.f-9x16 .ch-num {
  left: 0;
  right: 0;
  top: 190px;
  text-align: center;
  font-size: 600px;
}
.ch-side {
  position: absolute;
}
.f-16x9 .ch-side {
  left: 560px;
  right: 72px;
  top: 110px;
  bottom: 460px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}
.f-9x16 .ch-side {
  left: 56px;
  right: 56px;
  top: 690px;
  text-align: center;
}
.ch-label {
  font-weight: 800;
  font-size: 26px;
  letter-spacing: 0.2em;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--ink);
}
.f-9x16 .ch-label {
  display: inline-block;
  padding: 0 0 14px;
}
.ch-title {
  font-family: var(--serif);
  font-weight: 500;
  font-size: 120px;
  line-height: 0.98;
  letter-spacing: -0.015em;
  margin-top: 26px;
}
.f-9x16 .ch-title {
  font-size: 86px;
  margin-top: 20px;
}
.ch-strip {
  position: absolute;
  display: grid;
}
.f-16x9 .ch-strip {
  left: 0;
  right: 0;
  bottom: 0;
  height: 360px;
  grid-template-columns: repeat(var(--n), 1fr);
  gap: 8px;
}
.f-9x16 .ch-strip {
  left: 40px;
  right: 120px;
  bottom: 540px;
  height: 330px;
  grid-template-columns: repeat(var(--cols), 1fr);
  gap: 10px;
}
.f-9x16 .ch-strip[data-n="5"],
.f-9x16 .ch-strip[data-n="6"],
.f-9x16 .ch-strip[data-n="7"],
.f-9x16 .ch-strip[data-n="8"] {
  height: 430px;
}
.ch-cell {
  position: relative;
}
.ch-rank {
  position: absolute;
  z-index: 1;
  left: 0;
  top: 0;
  width: 56px;
  height: 56px;
  background: var(--yellow);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--serif);
  font-weight: 600;
  font-size: 40px;
  line-height: 1;
}
.ch-cap {
  position: absolute;
  z-index: 1;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--ink);
  color: var(--paper);
  font-weight: 700;
  font-size: 22px;
  line-height: 1.15;
  padding: 12px 16px 14px;
}
.ch-bar {
  position: absolute;
  z-index: 2;
  left: 0;
  right: 0;
  bottom: 0;
  height: 6px;
  background: var(--yellow);
  transform-origin: 0 50%;
  display: block;
}
`,
  },
  {
    id: "hinge",
    auto: true,
    // The semicolon hinge (brand.md): two stories' pictures either side of a yellow band carrying the date, a
    // jumbo semicolon and the count. The intro's named stories take the two sides when they can. Then the pictures
    // push in opposite ways, each caption is underlined, and the side the intro names holds while the other steps
    // back.
    html: (c) => {
      const named = c.focus
        .map((f) => c.stories.find((s) => s.rank === f.rank))
        .filter(Boolean);
      // Pictures first: a named story with one, the cover's story, any story with one, then the rest.
      const pair = [
        ...new Set([
          ...named.filter((s) => c.firstImage(s)),
          c.lead,
          ...c.stories.filter((s) => c.firstImage(s)),
          ...named,
          ...c.stories,
        ]),
      ]
        .slice(0, 2)
        .sort((a, b) => a.rank - b.rank);
      const side = (s, k) =>
        `<div class="hg-side hg-${k} face" data-rank="${s.rank}">${face(c, s)}<div class="hg-cap"><b>${s.rank}</b><span>${c.esc(s.kicker)}</span><p>${c.esc(plain(s.headline))}</p></div><span class="hg-bar"></span></div>`;
      const second = pair[1]
        ? side(pair[1], "b")
        : `<div class="hg-side hg-b hg-note"><span>${c.esc(c.UI.daily)}</span><b>${c.esc(c.title)}</b></div>`;
      return `${side(pair[0], "a")}
<div class="hg-band"><div class="hg-date"><b>${c.pad2(c.DAY)}</b><span>${c.esc(c.MON.toUpperCase())}</span></div><div class="hg-semi">;</div><div class="hg-top">${c.logo("")}<span>${c.esc(c.UI.topIn(c.stories.length))}</span></div></div>
${second}`;
    },
    cues: (c) => [
      ["tick", 0.8, 0.7],
      ["tick", 1.1, 0.7],
      ...c.focus.map((f) => ["tick", f.at, 0.8]),
    ],
    motion: (tl, I, h) => {
      for (const p of h.$$(".hg-cap p")) h.fit(p, 2, 26);
      h.fit(h.$(".hg-note b"), 4, 48);
      tl.fromTo(
        ".hg-a > img, .hg-a > .pcard",
        { scale: 1.02 },
        { scale: 1.1, duration: I.dur, ease: "none" },
        I.start
      );
      tl.fromTo(
        ".hg-b > img, .hg-b > .pcard",
        { scale: 1.1 },
        { scale: 1.02, duration: I.dur, ease: "none" },
        I.start
      );
      tl.fromTo(
        ".hg-semi",
        { yPercent: 0 },
        { yPercent: -5, duration: I.dur, ease: "none" },
        I.start
      );
      h.$$(".hg-bar").forEach((bar, i) => {
        tl.fromTo(
          bar,
          { scaleX: 0 },
          { scaleX: 1, duration: 0.4, ease: h.LAND },
          I.start + 0.8 + i * 0.3
        );
      });
      const F = I.focus ?? [];
      const sides = h.$$(".hg-side");
      F.forEach((f) => {
        const on = h.$(`.hg-side[data-rank="${f.rank}"]`);
        if (!on) return;
        tl.to(on, { opacity: 1, duration: 0.3, ease: h.LAND }, f.at);
        tl.to(
          sides.filter((x) => x !== on),
          { opacity: 0.45, duration: 0.3, ease: "power2.out" },
          f.at
        );
      });
      if (F.length)
        tl.to(
          sides,
          { opacity: 1, duration: 0.3, ease: "power2.inOut" },
          I.dur - 0.45
        );
    },
    css: `${FACE_CSS}
.hg-side {
  position: absolute;
}
.f-16x9 .hg-a {
  left: 0;
  top: 0;
  bottom: 0;
  width: 830px;
}
.f-16x9 .hg-b {
  right: 0;
  top: 0;
  bottom: 0;
  width: 830px;
}
.f-9x16 .hg-a {
  left: 0;
  right: 0;
  top: 0;
  height: 700px;
}
.f-9x16 .hg-b {
  left: 0;
  right: 0;
  top: 930px;
  height: 450px;
}
.hg-cap {
  position: absolute;
  z-index: 1;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--ink);
  color: var(--paper);
  padding: 22px 36px 28px 116px;
  min-height: 132px;
}
.f-9x16 .hg-cap {
  padding: 18px 140px 22px 108px;
}
.hg-cap b {
  position: absolute;
  left: 0;
  top: 0;
  width: 84px;
  height: 84px;
  background: var(--yellow);
  color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--serif);
  font-weight: 600;
  font-size: 58px;
  line-height: 1;
}
.hg-cap span {
  display: block;
  font-weight: 800;
  font-size: 20px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.hg-cap p {
  font-family: var(--serif);
  font-weight: 500;
  font-size: 44px;
  line-height: 1.05;
  margin-top: 8px;
}
.f-9x16 .hg-cap p {
  font-size: 40px;
}
.hg-bar {
  position: absolute;
  z-index: 2;
  left: 0;
  right: 0;
  bottom: 0;
  height: 8px;
  background: var(--yellow);
  transform-origin: 0 50%;
  display: block;
}
.hg-note {
  background: var(--soft);
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 24px;
  padding: 0 72px;
}
.hg-note span {
  font-weight: 800;
  font-size: 24px;
  letter-spacing: 0.18em;
}
.hg-note b {
  font-family: var(--serif);
  font-weight: 500;
  font-size: 96px;
  line-height: 1;
}
.hg-band {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.f-16x9 .hg-band {
  left: 830px;
  width: 260px;
  top: 0;
  bottom: 0;
  flex-direction: column;
  padding: 64px 0 60px;
}
.f-9x16 .hg-band {
  left: 56px;
  right: 120px;
  top: 700px;
  height: 230px;
}
.hg-date {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.hg-date b {
  font-family: var(--serif);
  font-weight: 600;
  font-size: 120px;
  line-height: 0.8;
  letter-spacing: -0.03em;
}
.hg-date span {
  font-weight: 800;
  font-size: 20px;
  letter-spacing: 0.2em;
  text-align: center;
}
.hg-semi {
  font-family: var(--serif);
  font-weight: 500;
  font-size: 560px;
  line-height: 0.62;
}
.f-9x16 .hg-semi {
  font-size: 250px;
  line-height: 0.62;
  padding-bottom: 40px;
}
.hg-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  font-weight: 800;
  font-size: 18px;
  letter-spacing: 0.14em;
  text-align: center;
}
.hg-top svg {
  width: 72px;
  height: 72px;
  display: block;
}
`,
  },
  {
    id: "headline-stack",
    auto: true,
    // frame.md's Strand List: a dated header, the intro title, then one numbered row per story with its picture,
    // kicker and headline over hairline rules. Then the list drifts, each row is underlined in turn, and a row the
    // intro names holds while the others step back.
    html: (c) =>
      `<div class="hs" style="--n:${c.stories.length}"><div class="hs-top"><span>${c.esc(c.DOW.toUpperCase())} ${c.pad2(c.DAY)} ${c.esc(c.MON.toUpperCase())}</span><span>${c.esc(c.UI.daily)} · ${c.esc(c.UI.topIn(c.stories.length))}</span></div><div class="hs-title">${c.esc(c.title)}</div><div class="hs-rows">${c.stories
        .map(
          (s) =>
            `<div class="hs-row" data-rank="${s.rank}"><span class="hs-n">${s.rank}</span><div class="hs-th face">${face(c, s)}</div><div class="hs-t"><span class="hs-k">${c.esc(s.kicker)}</span><span class="hs-h">${c.esc(plain(s.headline))}</span></div><span class="hs-bar"></span></div>`
        )
        .join("")}</div></div>`,
    cues: (c) => [
      ...c.stories.map((_, i) => ["tick", 0.7 + i * 0.22, 0.7]),
      ...c.focus.map((f) => ["tick", f.at, 0.8]),
    ],
    motion: (tl, I, h) => {
      h.fit(h.$(".hs-title"), h.vertical ? 2 : 1, 44);
      const rows = h.$$(".hs-row");
      rows.forEach((row, i) => {
        h.fit(h.$(".hs-h", row), 2, 22);
        tl.fromTo(
          h.$(".hs-bar", row),
          { scaleX: 0 },
          { scaleX: 1, duration: 0.4, ease: h.LAND },
          I.start + 0.7 + i * 0.22
        );
        tl.fromTo(
          h.$(".hs-th > *", row),
          { scale: 1 },
          { scale: 1.1, duration: I.dur, ease: "none" },
          I.start
        );
      });
      tl.fromTo(
        ".hs-rows",
        { y: 0 },
        { y: h.vertical ? -16 : -10, duration: I.dur, ease: "none" },
        I.start
      );
      const F = I.focus ?? [];
      F.forEach((f) => {
        const row = h.$(`.hs-row[data-rank="${f.rank}"]`);
        if (!row) return;
        tl.to(row, { opacity: 1, duration: 0.3, ease: h.LAND }, f.at);
        tl.to(
          rows.filter((x) => x !== row),
          { opacity: 0.35, duration: 0.3, ease: "power2.out" },
          f.at
        );
      });
      if (F.length)
        tl.to(
          rows,
          { opacity: 1, duration: 0.3, ease: "power2.inOut" },
          I.dur - 0.45
        );
    },
    css: `${FACE_CSS}
.hs {
  position: absolute;
  display: flex;
  flex-direction: column;
}
.f-16x9 .hs {
  left: 120px;
  right: 120px;
  top: 64px;
  bottom: 56px;
}
.f-9x16 .hs {
  left: 56px;
  right: 120px;
  top: 140px;
  bottom: 540px;
}
.hs-top {
  display: flex;
  justify-content: space-between;
  gap: 24px;
  font-weight: 800;
  font-size: 24px;
  letter-spacing: 0.18em;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--ink);
}
.f-9x16 .hs-top {
  flex-direction: column;
  gap: 8px;
  font-size: 22px;
}
.hs-title {
  font-family: var(--serif);
  font-weight: 500;
  font-size: 84px;
  line-height: 1;
  letter-spacing: -0.015em;
  margin: 28px 0 24px;
}
.f-9x16 .hs-title {
  font-size: 80px;
}
.hs-rows {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.hs-row {
  position: relative;
  flex: 0 1 220px;
  min-height: 0;
  container-type: size;
  display: flex;
  align-items: center;
  gap: 28px;
  border-bottom: 1px solid rgba(10, 10, 10, 0.2);
}
.hs-n {
  font-family: var(--serif);
  font-weight: 600;
  font-size: min(64cqh, 120px);
  line-height: 1;
  width: 0.62em;
  flex: none;
  display: block;
}
.hs-th {
  position: relative;
  height: 80cqh;
  aspect-ratio: 4 / 3;
  flex: none;
}
.hs-t {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.hs-k {
  font-weight: 800;
  font-size: clamp(15px, 13cqh, 24px);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hs-h {
  font-family: var(--serif);
  font-weight: 500;
  font-size: clamp(24px, 30cqh, 60px);
  line-height: 1.04;
  display: block;
}
.hs-bar {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 4px;
  background: var(--ink);
  transform-origin: 0 50%;
  display: block;
}
`,
  },
  {
    id: "countdown",
    auto: true,
    // The masthead: the logo, the show line, the intro title and the dateline, centred over a row of numbered
    // squares, one per story picture. Then the squares are underlined from the last rank to the first, and a square
    // the intro names lifts while the others step back.
    html: (c) =>
      `<div class="cd">${c.logo("cd-logo")}<div class="cd-eyebrow">AI;DR ${c.esc(c.UI.brief)}${c.esc(c.issueTag)}</div><div class="cd-title">${c.esc(c.title)}</div><div class="cd-date">${c.esc(c.dateline)}</div><div class="cd-row" data-n="${c.stories.length}" style="--n:${c.stories.length}">${c.stories
        .map(
          (s) =>
            `<div class="cd-sq face" data-rank="${s.rank}">${face(c, s)}<span class="cd-n">${s.rank}</span><span class="cd-bar"></span></div>`
        )
        .join("")}</div></div>`,
    cues: (c) => {
      const n = c.stories.length;
      return [
        ...c.stories.map((_, i) =>
          i === n - 1
            ? ["rankHit", 0.8 + i * 0.25, 0.8]
            : ["tick", 0.8 + i * 0.25, 0.7]
        ),
        ...c.focus.map((f) => ["tick", f.at, 0.8]),
      ];
    },
    motion: (tl, I, h) => {
      h.fit(h.$(".cd-title"), 2, 48);
      tl.fromTo(
        ".cd-logo",
        { scale: 1 },
        { scale: 1.06, duration: I.dur, ease: "none" },
        I.start
      );
      const sq = h.$$(".cd-sq");
      sq.forEach((s, i) => {
        tl.fromTo(
          h.$("img", s) || h.$(".pcard", s),
          { scale: 1 },
          { scale: 1.12, duration: I.dur, ease: "none" },
          I.start
        );
        // Last rank first: the row counts down to the lead.
        tl.fromTo(
          h.$(".cd-bar", s),
          { scaleX: 0 },
          { scaleX: 1, duration: 0.35, ease: h.LAND },
          I.start + 0.8 + (sq.length - 1 - i) * 0.25
        );
      });
      const F = I.focus ?? [];
      F.forEach((f) => {
        const on = h.$(`.cd-sq[data-rank="${f.rank}"]`);
        if (!on) return;
        tl.to(
          on,
          { scale: 1.08, opacity: 1, zIndex: 2, duration: 0.3, ease: h.LAND },
          f.at
        );
        tl.to(
          sq.filter((x) => x !== on),
          {
            scale: 1,
            opacity: 0.4,
            zIndex: 1,
            duration: 0.3,
            ease: "power2.out",
          },
          f.at
        );
      });
      if (F.length)
        tl.to(
          sq,
          { scale: 1, opacity: 1, duration: 0.3, ease: "power2.inOut" },
          I.dur - 0.45
        );
    },
    css: `${FACE_CSS}
.cd {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.f-16x9 .cd {
  top: 110px;
  padding: 0 160px;
}
.f-9x16 .cd {
  top: 200px;
  padding: 0 60px;
}
.cd-logo {
  width: 132px;
  height: 132px;
  display: block;
}
.cd-eyebrow {
  margin-top: 36px;
  font-weight: 800;
  font-size: 26px;
  letter-spacing: 0.22em;
}
.cd-title {
  margin-top: 18px;
  font-family: var(--serif);
  font-weight: 500;
  font-size: 100px;
  line-height: 1;
  letter-spacing: -0.015em;
}
.f-9x16 .cd-title {
  font-size: 96px;
}
.cd-date {
  margin-top: 22px;
  font-size: 30px;
  font-weight: 600;
}
/* One row in 16:9; in 9:16 at most two rows, each square as big as its count allows. */
.cd-row {
  margin-top: 48px;
  display: grid;
  grid-template-columns: repeat(var(--cols), var(--sq));
  grid-auto-rows: var(--sq);
  justify-content: center;
  gap: 18px;
}
.cd-sq {
  position: relative;
}
.f-16x9 .cd-row {
  --cols: var(--n);
  --sq: 190px;
}
.f-16x9 .cd-row[data-n="1"],
.f-16x9 .cd-row[data-n="2"],
.f-16x9 .cd-row[data-n="3"] {
  --sq: 360px;
}
.f-16x9 .cd-row[data-n="4"] {
  --sq: 330px;
}
.f-16x9 .cd-row[data-n="5"] {
  --sq: 290px;
}
.f-16x9 .cd-row[data-n="6"] {
  --sq: 230px;
}
.f-9x16 .cd-row {
  --cols: 4;
  --sq: 210px;
  gap: 16px;
}
.f-9x16 .cd-row[data-n="1"] {
  --cols: 1;
  --sq: 440px;
}
.f-9x16 .cd-row[data-n="2"] {
  --cols: 2;
  --sq: 400px;
}
.f-9x16 .cd-row[data-n="3"] {
  --cols: 3;
  --sq: 290px;
}
.f-9x16 .cd-row[data-n="4"] {
  --cols: 2;
  --sq: 320px;
}
.f-9x16 .cd-row[data-n="5"],
.f-9x16 .cd-row[data-n="6"] {
  --cols: 3;
  --sq: 260px;
}
.cd-n {
  position: absolute;
  z-index: 1;
  left: 0;
  top: 0;
  width: 52px;
  height: 52px;
  background: var(--yellow);
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--serif);
  font-weight: 600;
  font-size: 38px;
  line-height: 1;
}
.cd-bar {
  position: absolute;
  z-index: 2;
  left: 0;
  right: 0;
  bottom: 0;
  height: 8px;
  background: var(--ink);
  transform-origin: 0 50%;
  display: block;
}
`,
  },
];
