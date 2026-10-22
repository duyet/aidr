// The promo's one paused timeline. Inlined by scripts/build.mjs after `const CFG = {...}`.
// Seek-safe: fromTo with explicit from-states, no repeats, no randomness, transforms and paint only.
(() => {
  const { H, T, R, SHOT, L, CHUNKS, TOTAL } = CFG;
  const tl = gsap.timeline({ paused: true });
  const $ = (id) => document.getElementById(id);
  const [, , ww, wh] = L.win;

  // Arrive fast, land soft: each frame covers 15% of the remaining distance (aidr-motion-designer).
  const park = (dur, k = 0.15) => (p) => (1 - (1 - k) ** (p * dur * 30)) / (1 - (1 - k) ** (dur * 30));
  const arrive = (el, from, to, at, dur = 0.6, later = false) =>
    tl.fromTo(el, from, { ...to, duration: dur, ease: park(dur), immediateRender: !later }, at);
  const push = (el, from, to, amount = 0.03) =>
    tl.fromTo(el, { scale: 1 }, { scale: 1 + amount, duration: to - from, ease: "none" }, from);

  // Camera: the transform that frames a capture region in the window, clamped to the capture edges.
  const fit = ([x, y, w, h], pad = 1.06) => {
    const s = Math.min(ww / (w * pad), wh / (h * pad));
    const clamp = (v, size, view) => (size * s <= view ? (view - size * s) / 2 : Math.min(0, Math.max(view - size * s, v)));
    return {
      x: clamp(ww / 2 - (x + w / 2) * s, SHOT.w, ww),
      y: clamp(wh / 2 - (y + h / 2) * s, SHOT.h, wh),
      scale: s,
    };
  };

  // 1 Hook
  push($("hook-cam"), 0, T.tab);
  arrive($("f-0"), { y: 70, opacity: 0 }, { y: 0, opacity: 1 }, T.forget, 0.5);
  arrive($("f-1"), { y: 70, opacity: 0 }, { y: 0, opacity: 1 }, T.forget2, 0.5);
  arrive($("h-logo"), { scale: 0.55, opacity: 0 }, { scale: 1, opacity: 1 }, T.logo, 0.5);
  arrive($("h-0"), { y: 40, opacity: 0 }, { y: 0, opacity: 1 }, T.has, 0.45);
  arrive($("h-1"), { y: 40, opacity: 0 }, { y: 0, opacity: 1 }, T.has + 0.1, 0.45);
  arrive($("h-mk"), { scaleX: 0 }, { scaleX: 1 }, T.marker, 0.45);
  tl.fromTo($("hook-wipe"), { yPercent: 100 }, { yPercent: 0, duration: T.tab - T.wipe, ease: "power3.in" }, T.wipe);

  // 2 New tab
  const win = $("win");
  arrive(win, { y: H * 0.7 }, { y: 0 }, T.tab, 0.6);
  push(win, T.tab, T.end, 0.025);
  arrive($("label-tab"), { y: 16, opacity: 0 }, { y: 0, opacity: 1 }, T.tab + 0.2, 0.4);

  const tab = $("view-tab");
  const page = fit(L.tall ? R.card : R.page, 1);
  const card = fit(L.tall ? R.cardLeft : R.card, 1.04);
  const toggle = fit(L.tall ? R.toggleViewTall : R.toggleView, 1);
  tl.set(tab, { ...page }, 0);
  arrive(tab, { ...page }, { ...card }, T.stories, 0.75, true);
  arrive(tab, { ...card }, { ...toggle }, T.english - 0.1, 0.6, true);
  arrive($("ring-toggle"), { scale: 1.35, opacity: 0 }, { scale: 1, opacity: 1 }, T.english + 0.4, 0.4);

  // Store listing slides in from the right; the new tab leaves to the left.
  const store = fit(L.tall ? R.storeTall : R.store, 1.04);
  const st = $("view-store");
  tl.set(st, { ...store, x: store.x + ww * 1.1, opacity: 0 }, 0);
  tl.set(st, { opacity: 1 }, T.store);
  tl.set(tab, { opacity: 0 }, T.store + 0.5);
  arrive(tab, { ...toggle }, { ...toggle, x: toggle.x - ww * 1.1 }, T.store, 0.75, true);
  arrive(st, { ...store, x: store.x + ww * 1.1, filter: "blur(10px)" }, { ...store, filter: "blur(0px)" }, T.store, 0.75, true);
  arrive($("label-tab"), { opacity: 1 }, { opacity: 0 }, T.store, 0.3, true);
  arrive($("label-store"), { y: 16, opacity: 0 }, { y: 0, opacity: 1 }, T.store + 0.3, 0.4);
  if (L.tall) {
    const add = fit(R.addTall, 1);
    arrive(st, { ...store }, { ...add }, T.free - 0.1, 0.45, true);
  }
  arrive($("ring-add"), { scale: 1.35, opacity: 0 }, { scale: 1, opacity: 1 }, T.free + 0.35, 0.35);

  // 3 End card
  push($("end-cam"), T.end, TOTAL);
  arrive($("end-logo"), { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1 }, T.end, 0.5);
  arrive($("end-url"), { y: 60, opacity: 0 }, { y: 0, opacity: 1 }, T.end + 0.1, 0.55);
  arrive($("end-sub"), { y: 30, opacity: 0 }, { y: 0, opacity: 1 }, T.end + 0.2, 0.5);
  arrive($("end-mk"), { scaleX: 0 }, { scaleX: 1 }, T.slash, 0.45);

  // Captions, one chunk at a time
  CHUNKS.forEach((c, i) => {
    const el = $(`cap-${i}`);
    tl.set(el, { xPercent: -50 }, 0);
    arrive(el, { y: 14, opacity: 0 }, { y: 0, opacity: 1 }, c.at, 0.3);
    tl.set(el, { opacity: 0 }, c.end);
  });

  window.__timelines = window.__timelines || {};
  window.__timelines.main = tl;
})();
