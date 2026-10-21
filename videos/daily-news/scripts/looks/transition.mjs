// Stinger variants between segments (look axis "transition"). `html(w)` is the inside of one stinger clip
// (w.label: the next rank, or ";" before the outro); `motion(tl, w, W, h)` animates that clip around W.at, the cut,
// coming in over h.IN seconds and leaving over h.OUT.
// The arrival eases in and out, so it is fastest at W.hit, halfway in, and settles into full cover at W.at instead
// of stopping dead on it. W.hit is also where the storyIn effect peaks (sound.mjs cuesFor).

export const STINGER = { in: 0.32, out: 0.4 };

const slide = (tl, w, W, h) => {
  const panel = h.$(".panel, .ink-panel", w);
  tl.fromTo(
    panel,
    { xPercent: -101 },
    { xPercent: 0, duration: h.IN, ease: "expo.inOut" },
    W.hit - h.IN / 2
  );
  tl.fromTo(
    h.$(".n", w),
    { scale: 0.7, opacity: 0 },
    { scale: 1, opacity: 1, duration: 0.3, ease: h.LAND },
    W.hit - h.IN / 2 + 0.12
  );
  tl.to(
    panel,
    { xPercent: 101, duration: h.OUT, ease: "power3.out" },
    W.at + 0.06
  );
};

export const TRANSITIONS = [
  {
    id: "wipe",
    auto: true,
    html: (w, esc) =>
      `<div class="panel"><span class="n">${esc(w.label)}</span><div class="edge"></div></div>`,
    motion: slide,
    css: `
.wipe .panel {
  position: absolute;
  inset: 0;
  background: var(--yellow);
  display: flex;
  align-items: center;
  justify-content: center;
}
.wipe .panel .n {
  font-family: var(--serif);
  font-weight: 600;
  font-size: 520px;
  line-height: 1;
  display: block;
}
.f-9x16 .wipe .panel .n {
  font-size: 600px;
}
`,
  },
  {
    id: "ink",
    auto: true,
    html: (w, esc) =>
      `<div class="ink-panel"><span class="n">${esc(w.label)}</span><div class="edge" style="background:#f5c518"></div></div>`,
    motion: slide,
    css: `
.wipe .ink-panel {
  position: absolute;
  inset: 0;
  background: var(--ink);
  color: var(--yellow);
  display: flex;
  align-items: center;
  justify-content: center;
}
.wipe .ink-panel .n {
  font-family: var(--serif);
  font-weight: 600;
  font-size: 520px;
  line-height: 1;
  display: block;
}
`,
  },
  {
    id: "shutter",
    auto: true,
    html: () => `<div class="half top"></div><div class="half bot"></div>`,
    motion: (tl, w, W, h) => {
      const a = W.hit - h.IN / 2;
      tl.fromTo(
        h.$(".half.top", w),
        { yPercent: -100 },
        { yPercent: 0, duration: h.IN, ease: "expo.inOut" },
        a
      );
      tl.fromTo(
        h.$(".half.bot", w),
        { yPercent: 100 },
        { yPercent: 0, duration: h.IN, ease: "expo.inOut" },
        a
      );
      tl.to(
        h.$(".half.top", w),
        { yPercent: -100, duration: h.OUT, ease: "power3.out" },
        W.at + 0.06
      );
      tl.to(
        h.$(".half.bot", w),
        { yPercent: 100, duration: h.OUT, ease: "power3.out" },
        W.at + 0.06
      );
    },
    css: `
.wipe .half {
  position: absolute;
  left: 0;
  right: 0;
  height: 50%;
  background: var(--ink);
}
.wipe .half.top {
  top: 0;
}
.wipe .half.bot {
  bottom: 0;
}
.wipe .half .n {
  position: absolute;
  left: 0;
  right: 0;
  text-align: center;
  font-family: var(--serif);
  font-weight: 600;
  line-height: 1;
}
`,
  },
];
