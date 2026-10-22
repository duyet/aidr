// The film's one paused timeline. Inlined by build.mjs after `const CFG = {...}` (shape, section
// times, word-timed tag hits, machine anchors, capture sizes). Seek-safe: one timeline, explicit
// from-states, no repeats, no randomness, transforms and opacity only.
(() => {
  const { W, H, tall, TOTAL, title, close, scenes, machine } = CFG;
  const tl = gsap.timeline({ paused: true });
  const $ = (id) => document.getElementById(id);
  const F = 1 / 30;
  // Arrive fast, land soft: each frame covers 15% of the remaining distance (aidr-motion-designer).
  const park = (dur, k = 0.15) => (p) => (1 - (1 - k) ** (p * dur * 30)) / (1 - (1 - k) ** (dur * 30));
  const go = (el, from, to, at, dur, ease) => tl.fromTo(el, from, { ...to, duration: dur, ease: ease ?? park(dur), immediateRender: false }, at);
  const arrive = (el, from, to, at, dur = 0.6) => go(el, from, to, at, dur);
  const leave = (el, to, at, dur = 0.3) => tl.to(el, { ...to, duration: dur, ease: "power2.in" }, at);
  const push = (el, from, to, amount = 0.03) => tl.fromTo(el, { scale: 1 }, { scale: 1 + amount, duration: to - from, ease: "none" }, from);

  // Title on yellow; the hatch opens onto the machine.
  const titleEnd = title.start + title.dur;
  push($("title-cam"), 0, titleEnd + 0.6, 0.04);
  tl.fromTo($("title-lock"), { scale: 1.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: park(0.5) }, 0.1);
  arrive($("title-head"), { y: 34, opacity: 0 }, { y: 0, opacity: 1 }, 0.62, 0.5);
  arrive($("title-dates"), { y: 20, opacity: 0 }, { y: 0, opacity: 1 }, 0.9, 0.5);
  const hatch = titleEnd - 0.4;
  go($("hatch-top"), { y: 0 }, { y: -H * 0.52 }, hatch, 0.6, "power2.in");
  go($("hatch-bottom"), { y: 0 }, { y: H * 0.52 }, hatch, 0.6, "power2.in");
  go($("title-cam"), { y: 0 }, { y: -H * 0.52 }, hatch, 0.6, "power2.in");
  go($("title-cam"), { opacity: 1 }, { opacity: 0 }, hatch - 0.15, 0.22, "power2.in");

  // The machine camera: frames one station per highlight inside the region left of the window.
  const st = machine.stations;
  const [vbW, vbH] = machine.viewBox;
  const REGION = tall ? [0, 470, W, 520] : [0, 280, 1010, 660];
  const view = ([x, y, w, h], [rx, ry, rw, rh], pad) => {
    const s = Math.min(rw / w, rh / h) * pad;
    return { x: rx + rw / 2 - s * (x + w / 2), y: ry + rh / 2 - s * (y + h / 2), scale: s };
  };
  const around = ([cx, cy], w, h) => [cx - w / 2, cy - h / 2, w, h];
  const FRAME = {
    fetch: () => view(st["st-fetch"].bbox, REGION, 0.92),
    "tldr-vi": () => view(st["st-tldr"].bbox, REGION, 0.92),
    tldr: () => view(st["st-tldr"].bbox, REGION, 0.92),
    email: () => view(around(machine.ports.email, 520, 470), REGION, 0.95),
    telegram: () => view(around(machine.ports.telegram, 520, 470), REGION, 0.95),
    rss: () => view(around(machine.ports.web, 520, 470), REGION, 0.95),
  };
  const mcam = $("mcam");
  const machineIn = hatch;
  const whole = view([0, 0, vbW, vbH], tall ? [0, 300, W, 1300] : [0, 60, W, 960], 0.96);
  tl.fromTo(mcam, whole, { ...whole, duration: 0.01 }, machineIn);
  push($("machine-push"), machineIn, close.start + 0.6, 0.025);
  let prev = whole;
  scenes.forEach((s, i) => {
    const to = FRAME[s.station]();
    const at = i === 0 ? s.start + 0.05 : s.start - 0.1;
    go(mcam, prev, to, at, i === 0 ? 1.0 : 0.8, "power3.inOut");
    prev = to;
  });

  // Tags float above the station's anchor, stacked; they keep the size a reader can take in.
  const tagScale = (s) => (tall ? 1.05 : 1) / Math.max(0.6, FRAME[s.station]().scale);
  const ring = $("ring");
  const beltAt = (u) => [0, 1].map((k) => machine.belt[0][k] + (machine.belt[2][k] - machine.belt[0][k]) * u);
  const front = (len) => [-0.42 * len, 0.9 * len]; // toward the viewer in screen space

  scenes.forEach((s, i) => {
    const t = s.start;
    const out = t + s.dur - 0.3;
    // header
    arrive($(`h${i}-num`), { y: 20, opacity: 0 }, { y: 0, opacity: 1 }, t + 0.02, 0.45);
    arrive($(`h${i}-label`), { y: 20, opacity: 0 }, { y: 0, opacity: 1 }, t + 0.02 + 3 * F, 0.45);
    arrive($(`h${i}-title`), { y: 30, opacity: 0 }, { y: 0, opacity: 1 }, t + 0.02 + 6 * F, 0.55);
    const hl = $(`h${i}-title`).querySelector(".hl");
    if (hl) go(hl, { scaleX: 0 }, { scaleX: 1 }, t + 0.95, 0.4, "power2.inOut");
    leave($(`h${i}`), { y: -20, opacity: 0 }, out);
    tl.set($(`h${i}`), { y: 0, opacity: 1 }, t);
    // window with the real capture
    const win = $(`w${i}`);
    const img = $(`w${i}-img`);
    const [iw, ih] = s.size;
    const [vx, vy, vw] = s.view;
    const ww = win.offsetWidth;
    const k = ww / (vw * iw);
    // A capture shorter than the window (the day card) gets a window cut to its height.
    const shown = (ih - vy * ih) * k + 46;
    if (shown < win.offsetHeight) Object.assign(win.style, { height: `${shown}px`, top: `${win.offsetTop + (win.offsetHeight - shown) / 2}px` });
    Object.assign(img.style, { width: `${iw}px`, height: `${ih}px`, transform: `translate(${-vx * iw * k}px, ${-vy * ih * k}px) scale(${k})` });
    // k 0.2 leaves under a pixel for the last frame, so the window settles instead of stopping.
    go(win, tall ? { y: H - 1000, opacity: 1 } : { x: W - 1010, opacity: 1 }, { x: 0, y: 0 }, t + 0.1, 0.9, park(0.9, 0.2));
    leave(win, tall ? { y: H - 1000 } : { x: W - 1010 }, out, 0.35);
    // Tags on their spoken words, one at a time, on the side of the anchor with room.
    const ts = tagScale(s);
    const cam = FRAME[s.station]();
    // Right of the anchor when it fits the machine region, else left of it, never off its edges.
    s.tags.forEach((at, j) => {
      // The fetch scene's "skipped" tag points at the item that stopped on the belt.
      const [ax, ay] = s.station === "fetch" && j === 1 ? beltAt(0.32) : s.at;
      const sx = cam.x + cam.scale * ax;
      const tag = $(`t${i}-${j}`);
      const span = tag.firstElementChild;
      const w = span.offsetWidth * ts * cam.scale;
      const gap = 70 * cam.scale;
      const limit = REGION[0] + REGION[2] - 60;
      const want = sx + gap + w <= limit ? sx + gap : sx - gap - w;
      const left = Math.min(Math.max(want, REGION[0] + 60), limit - w);
      tag.style.left = `${(left - cam.x) / cam.scale}px`;
      const h = span.offsetHeight * ts * cam.scale;
      const top = Math.max(cam.y + cam.scale * (ay - 90), REGION[1] + 40 + h);
      tag.style.top = `${(top - cam.y) / cam.scale}px`;
      Object.assign(span.style, { transform: `scale(${ts})`, transformOrigin: "0 100%" });
      arrive(tag, { y: 24, opacity: 0 }, { y: 0, opacity: 1 }, at, 0.45);
      const next = s.tags[j + 1];
      leave(tag, next ? { y: -24, opacity: 0 } : { opacity: 0 }, next ? next - 0.25 : out, 0.25);
    });
  });

  const byStation = (name) => scenes.find((s) => s.station === name);
  const ringOn = (s, [x, y], scale = 1) => {
    arrive(ring, { x, y, scale: 0.4 * scale, opacity: 0 }, { x, y, scale, opacity: 1 }, s.tags[0] - 0.05, 0.45);
    leave(ring, { opacity: 0 }, s.start + s.dur - 0.35, 0.25);
  };

  // Fetch: the clock sweeps half a turn; three items ride the belt, the one that fails the same
  // way stops at the gate and is not sent round again.
  const fetchS = byStation("fetch");
  if (fetchS) {
    tl.fromTo("#needle-clock", { attr: { transform: "rotate(0)" } }, { attr: { transform: "rotate(180)" }, duration: 0.7, ease: park(0.7), immediateRender: false }, fetchS.tags[0]);
    ringOn(fetchS, machine.pivots ? machine.pivots["needle-clock"] : fetchS.at, 1.5);
    [0, 1, 2].forEach((p) => {
      const pk = $(`pk-${p}`);
      const s0 = beltAt(0.05);
      const stop = beltAt(p === 1 ? 0.32 : 0.95);
      const start = fetchS.start + 0.9 + p * 0.5;
      const end = p === 1 ? fetchS.tags[1] : fetchS.start + fetchS.dur - 0.4;
      arrive(pk, { x: s0[0], y: s0[1], opacity: 0 }, { opacity: 1 }, start, 0.3);
      go(pk, { x: s0[0], y: s0[1] }, { x: stop[0], y: stop[1] }, start, end - start, p === 1 ? park(end - start, 0.08) : "none");
      if (p === 1) go(pk, { opacity: 1 }, { opacity: 0.25 }, fetchS.tags[1], 0.4, "power1.out");
      leave(pk, { opacity: 0 }, fetchS.start + fetchS.dur - 0.35, 0.25);
    });
  }

  // TL;DR press: the ram stamps, a plate slides out to the front.
  const mv = machine.moves;
  const tc = st["st-tldr"].center;
  [["tldr-vi", "plate"], ["tldr", "plate-day"]].forEach(([name, id]) => {
    const s = byStation(name);
    if (!s) return;
    const hit = s.tags[0];
    go("#ram-tldr", { x: 0, y: 0 }, { x: mv["ram-tldr"][0], y: mv["ram-tldr"][1] }, hit - 0.25, 0.25, "power3.in");
    go("#ram-tldr", { x: mv["ram-tldr"][0], y: mv["ram-tldr"][1] }, { x: 0, y: 0 }, hit + 0.15, 0.45);
    const [fx, fy] = front(250);
    const el = $(id);
    arrive(el, { x: tc[0], y: tc[1], opacity: 0 }, { x: tc[0] + fx, y: tc[1] + fy, opacity: 1 }, hit + 0.05, 0.55);
    ringOn(s, [tc[0] + fx, tc[1] + fy], 1.6);
    leave(el, { opacity: 0 }, s.start + s.dur - 0.35, 0.25);
  });

  // Email port: one message leaves; the overlapping second run's copy is turned back.
  const mail = byStation("email");
  if (mail) {
    const [px, py] = machine.ports.email;
    const [fx, fy] = front(170);
    ringOn(mail, [px, py]);
    const m0 = $("msg-0");
    arrive(m0, { x: px, y: py, opacity: 0 }, { x: px + fx, y: py + fy, opacity: 1 }, mail.tags[0], 0.6);
    const m1 = $("msg-1");
    arrive(m1, { x: px + fx * 1.9 + 60, y: py + fy * 0.8, opacity: 0 }, { x: px + fx * 1.2 + 40, y: py + fy * 0.6, opacity: 1 }, mail.tags[1] - 0.5, 0.5);
    go(m1, { opacity: 1 }, { opacity: 0.2 }, mail.tags[1], 0.35, "power1.out");
    for (const m of [m0, m1]) leave(m, { opacity: 0 }, mail.start + mail.dur - 0.35, 0.25);
  }

  // Telegram port: every story leaves, numbered, one after another.
  const tg = byStation("telegram");
  if (tg) {
    const [px, py] = machine.ports.telegram;
    ringOn(tg, [px, py]);
    for (let m = 2; m < 7; m += 1) {
      const el = $(`msg-${m}`);
      const [fx, fy] = front(tall ? 80 + (m - 2) * 34 : 110 + (m - 2) * 46);
      arrive(el, { x: px, y: py, opacity: 0 }, { x: px + fx, y: py + fy, opacity: 1 }, tg.tags[0] + 0.1 + (m - 2) * 4 * F, 0.55);
      leave(el, { opacity: 0 }, tg.start + tg.dur - 0.35, 0.25);
    }
  }

  // Web port: the feed leaves three times, one per reader.
  const rss = byStation("rss");
  if (rss) {
    const [px, py] = machine.ports.web;
    ringOn(rss, [px, py]);
    [0, 1, 2].forEach((m) => {
      const el = $(`feed-${m}`);
      const [fx, fy] = front(tall ? 90 + m * 50 : 120 + m * 66);
      arrive(el, { x: px, y: py, opacity: 0 }, { x: px + fx, y: py + fy, opacity: 1 }, rss.tags[1] + m * 4 * F, 0.55);
      leave(el, { opacity: 0 }, rss.start + rss.dur - 0.35, 0.25);
    });
  }

  // Close: yellow rises over the machine, the tile lands, the address.
  go($("s-close"), { y: H }, { y: 0 }, close.start, 0.55, "power3.out");
  push($("close-cam"), close.start, TOTAL, 0.04);
  arrive($("close-lock"), { scale: 1.3, opacity: 0 }, { scale: 1, opacity: 1 }, close.start + 0.45, 0.5);
  arrive($("close-line"), { y: 30, opacity: 0 }, { y: 0, opacity: 1 }, close.start + 0.9, 0.5);
  arrive($("close-url"), { y: 20, opacity: 0 }, { y: 0, opacity: 1 }, close.start + 1.3, 0.5);

  // Captions: each line shows for its own span only, and cuts in without a tween so the tag
  // hit stays the one thing moving. The title and close carry no caption: the lockup says it.
  document.querySelectorAll(".cap").forEach((cap) => {
    const a = Number(cap.dataset.start);
    const b = a + Number(cap.dataset.duration);
    cap = cap.firstElementChild;
    tl.set(cap, { opacity: 1 }, a);
    tl.set(cap, { opacity: 0 }, b);
  });

  tl.to({}, { duration: TOTAL }, 0);
  window.__timelines = window.__timelines || {};
  window.__timelines.main = tl;
})();
