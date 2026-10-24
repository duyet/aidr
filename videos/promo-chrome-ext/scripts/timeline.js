// The spot's one paused timeline. Inlined by scripts/build.mjs after `const CFG = {...}`.
// Seek-safe: fromTo with explicit from-states, no repeats, no randomness, transforms and paint only.
(() => {
  const { W, H, T, L, CARDS, TOTAL, FPS } = CFG;
  const tl = gsap.timeline({ paused: true });
  const $ = (id) => document.getElementById(id);

  // Arrive fast, land soft: each frame covers 15% of the remaining distance (aidr-motion-designer).
  const park = (dur, k = 0.15) => (p) => (1 - (1 - k) ** (p * dur * FPS)) / (1 - (1 - k) ** (dur * FPS));
  const arrive = (el, from, to, at, dur = 0.6, k = 0.15) =>
    tl.fromTo(el, from, { ...to, duration: dur, ease: park(dur, k), immediateRender: false }, at);
  const push = (el, from, to, amount = 0.03) =>
    tl.fromTo(el, { scale: 1 }, { scale: 1 + amount, duration: to - from, ease: "none" }, from);
  const hide = (el, at) => tl.set(el, { autoAlpha: 0 }, at);

  // A card's transform that centres it at (cx, cy) at a given on-screen width.
  const place = (el, cx, cy, w, extra = {}) => {
    const c = CARDS[el.dataset.card];
    return { x: cx - c.w / 2, y: cy - c.h / 2, scale: w / c.w, ...extra };
  };

  // 1 Hook: a blank tab slams in on each "Blank.", the word lands with it, the older words step back.
  push($("hook-cam"), 0, T.open, 0.04);
  L.ghost.forEach(([gx, gy, r], i) => {
    const g = $(`ghost-${i}`);
    tl.set(g, { autoAlpha: 0 }, 0);
    arrive(g, { x: gx * 0.4, y: gy * 0.4, z: -1600, rotationY: i % 2 ? 40 : -40, rotation: 0, autoAlpha: 1 },
      { x: gx, y: gy, z: 0, rotationY: i % 2 ? -10 : 10, rotation: r }, T.blank[i], 0.45, 0.19);
    const b = $(`blank-${i}`);
    tl.set(b, { autoAlpha: 0 }, 0);
    arrive(b, { y: 70, scale: 1.18, autoAlpha: 1 }, { y: 0, scale: 1 }, T.blank[i], 0.35, 0.19);
    if (i > 0) arrive($(`blank-${i - 1}`), { opacity: 1 }, { opacity: 0.28 }, T.blank[i], 0.3);
  });
  tl.set($("hook-wipe"), { skewX: -12, xPercent: 120 }, 0);
  tl.fromTo($("hook-wipe"), { xPercent: 120 }, { xPercent: 0, duration: 0.3, ease: "power3.in", immediateRender: false }, T.open - 0.3);

  // 2 Hero: the light tab flies in out of depth and parks at an angle; its twins stack behind it.
  push($("hero-cam"), T.open, T.close, 0.035);
  const { cx, cy, w } = L.heroCard;
  const rest = { z: 0, rotationY: L.tall ? -6 : -18, rotationX: 10, rotation: L.tall ? -4 : -3 };
  const hero = $("hero-card");
  arrive(hero, place(hero, cx, cy, w, { z: -2600, rotationY: -60, rotationX: 24, rotation: -14, autoAlpha: 1 }),
    place(hero, cx, cy, w, rest), T.open, 0.7, 0.17);
  [0, 1].forEach((i) => {
    const el = $(`hero-back-${i}`);
    const dx = (i + 1) * (L.tall ? 60 : 90);
    const dy = -(i + 1) * (L.tall ? 70 : 60);
    const z = -(i + 1) * 260;
    arrive(el, place(el, cx + dx + 300, cy + dy, w, { ...rest, z: z - 1400, autoAlpha: 1 }),
      place(el, cx + dx, cy + dy, w, { ...rest, z }), T.worth + i * 0.1, 0.6);
  });
  document.querySelectorAll(".type .w").forEach((el, i) => {
    tl.set(el, { yPercent: 110 }, 0);
    // Lead the voice slightly so the whole line has landed 0.8 s or more before the cut at T.close.
    arrive(el, { yPercent: 110 }, { yPercent: 0 }, Math.min(T.line[i], T.line[0] + i * 0.18), 0.3, 0.22);
  });

  // 3 Showcase: a close, tilted pass across the light tab, a match cut to the dark one on the beat,
  // then all three fan out.
  push($("show-cam"), T.close, T.end, 0.03);
  const close = (el) => place(el, W / 2, H / 2, L.showW, { z: 0, rotationX: 14, rotationY: 0, rotation: -5 });
  const light = $("show-light");
  const dark = $("show-dark");
  arrive(light, { ...close(light), z: 900, rotation: -2, autoAlpha: 1 }, close(light), T.close, 0.6);
  tl.fromTo($("show-stage"), { x: 40, y: 12 }, { x: -40, y: -12, duration: T.fan - T.close, ease: "sine.inOut" }, T.close);
  hide(light, T.match);
  tl.set(dark, { ...close(dark), autoAlpha: 1 }, T.match);
  hide(dark, T.fan);

  const F = L.fan;
  [0, 1, 2].forEach((i) => {
    const el = $(`fan-${i}`);
    const k = i - 1;
    const to = place(el, W / 2 + k * F.gapX + F.dx, H / 2 + k * F.gapY + F.dy, el.dataset.card === "list" ? F.w * 0.78 : F.w, {
      z: k ? -220 : 0,
      rotationY: L.tall ? 0 : -k * F.rot,
      rotationX: L.tall ? -k * F.rot * 0.6 + 6 : 6,
      rotation: k * 2,
    });
    arrive(el, { ...to, x: W / 2 - CARDS[el.dataset.card].w / 2, y: H / 2 - CARDS[el.dataset.card].h / 2, z: -500, rotationY: 0, autoAlpha: 1 }, to, T.fan, 0.45, 0.19);
  });
  arrive($("label"), { y: 60, autoAlpha: 0 }, { y: 0, autoAlpha: 1 }, T.aidr, 0.4);

  // 4 End card: hard cut on the drop; "/c" gets its ink block on "slash".
  push($("end-cam"), T.end, TOTAL, 0.03);
  arrive($("end-logo"), { scale: 0.55, rotation: -12 }, { scale: 1, rotation: 0 }, T.end, 0.5, 0.19);
  arrive($("end-url"), { y: 80, autoAlpha: 0 }, { y: 0, autoAlpha: 1 }, T.end + 0.1, 0.5);
  arrive($("end-sub"), { y: 40, autoAlpha: 0 }, { y: 0, autoAlpha: 1 }, T.end + 0.2, 0.5);
  tl.set($("end-mk"), { scaleX: 0 }, 0);
  arrive($("end-mk"), { scaleX: 0 }, { scaleX: 1 }, T.slash, 0.35, 0.19);
  tl.fromTo($("end-mk").parentElement, { color: "#0a0a0a" }, { color: "#f5c518", duration: 0.12, ease: "none", immediateRender: false }, T.slash + 0.06);

  // Grain: the tile jumps to a new offset every second frame, derived from the frame index.
  const grain = $("grain");
  for (let i = 0; i * 2 < TOTAL * FPS; i++)
    tl.set(grain, { x: ((i * 73) % 128) - 64, y: ((i * 151) % 128) - 64 }, (i * 2) / FPS);

  window.__timelines = window.__timelines || {};
  window.__timelines.main = tl;
})();
