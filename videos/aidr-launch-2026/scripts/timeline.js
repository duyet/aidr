// The film's one paused timeline. Inlined by scripts/build.mjs after `const CFG = {...}`, which
// holds the shape (W, H, tall), the time sheet T, the machine anchors and the capture sizes.
// Seek-safe: fromTo with explicit from-states, no repeats, no randomness, transforms and paint only.
(() => {
  const { W, H, tall, T, machine, dims } = CFG;
  const tl = gsap.timeline({ paused: true });
  const $ = (id) => document.getElementById(id);
  const F = 1 / 30;

  // Arrive fast, land soft: each frame covers 15% of the remaining distance (aidr-motion-designer).
  const park = (dur, k = 0.15) => (p) => (1 - (1 - k) ** (p * dur * 30)) / (1 - (1 - k) ** (dur * 30));
  const arrive = (el, from, to, at, dur = 0.6) => tl.fromTo(el, from, { ...to, duration: dur, ease: park(dur) }, at);
  // The one linear push on a shot's root, from its first frame to its last.
  const push = (el, from, to, amount = 0.03) =>
    tl.fromTo(el, { scale: 1 }, { scale: 1 + amount, duration: to - from, ease: "none" }, from);

  // ── 1 Hook ────────────────────────────────────────────────────────────────────────────────
  push($("hook-cam"), 0, T.title);
  const wide = [
    [60, 40], [1110, 30], [60, 860], [1110, 880],
    [150, 170], [990, 300], [230, 560], [1000, 650],
  ];
  const narrow = [
    [60, 70], [120, 1610], [-500, -500], [-500, -500],
    [60, 300], [120, 600], [60, 930], [120, 1210],
  ];
  const spots = tall ? narrow : wide;
  for (let i = 0; i < 8; i += 1) {
    const card = $(`card-${i}`);
    card.style.left = `${spots[i][0]}px`;
    card.style.top = `${spots[i][1]}px`;
    if (i < 4) {
      tl.fromTo(card, { opacity: 0, y: 30 }, { opacity: 0.35, y: 0, duration: 0.5, ease: park(0.5) }, i * 4 * F);
      continue;
    }
    const at = T.hookCards[i - 4];
    arrive(card, { y: 70, opacity: 0 }, { y: 0, opacity: 1 }, at, 0.5);
  }
  const sweep = (i, at) =>
    tl.fromTo($(`mk-${i}`), { scaleX: 0, opacity: 1 }, { scaleX: 1, opacity: 1, duration: 0.4, ease: "power2.inOut" }, at);
  sweep(4, T.markSame);
  sweep(5, T.markSame + 3 * F);
  sweep(6, T.markNew);
  sweep(7, T.markNew + 3 * F);
  // Only the duplicate pair being spoken about stays bright.
  const dim = (i, from, to, at) => tl.fromTo($(`card-${i}`), { opacity: from }, { opacity: to, duration: 0.3, ease: "power1.out" }, at);
  [6, 7].forEach((i) => {
    dim(i, 1, 0.4, T.markSame);
  });
  [6, 7].forEach((i) => {
    dim(i, 0.4, 1, T.markNew - 0.1);
  });
  [4, 5].forEach((i) => {
    dim(i, 1, 0.4, T.markNew - 0.1);
  });
  // Everything collapses into one point, then that point opens to yellow.
  for (let i = 0; i < 8; i += 1) {
    const card = $(`card-${i}`);
    const cx = W / 2 - (spots[i][0] + card.offsetWidth / 2);
    const cy = H / 2 - (spots[i][1] + card.offsetHeight / 2);
    tl.fromTo(card, { x: 0, scale: 1 }, { x: cx, y: cy, scale: 0.15, opacity: 0, duration: 0.6, ease: "power3.in" }, T.collapse + (i % 4) * 2 * F);
  }
  const reach = (Math.hypot(W, H) / 160) * 1.05;
  tl.fromTo($("hook-wipe"), { scale: 0 }, { scale: reach, duration: 0.8, ease: "power2.inOut" }, T.wipe);

  // ── 2 Title ───────────────────────────────────────────────────────────────────────────────
  push($("title-cam"), T.title, T.machineIn + 0.6, 0.04);
  arrive($("title-logo"), { scale: 1.45, opacity: 0 }, { scale: 1, opacity: 1 }, T.title, 0.5);
  arrive($("title-line"), { y: 34, opacity: 0 }, { y: 0, opacity: 1 }, T.titleLine - 0.3, 0.5);
  tl.fromTo($("hatch-top"), { y: 0 }, { y: -H * 0.52, duration: 0.6, ease: "power2.in" }, T.hatch);
  tl.fromTo($("hatch-bottom"), { y: 0 }, { y: H * 0.52, duration: 0.6, ease: "power2.in" }, T.hatch);
  tl.fromTo($("title-cam"), { y: 0 }, { y: -H * 0.52, duration: 0.6, ease: "power2.in" }, T.hatch);

  // ── The machine ───────────────────────────────────────────────────────────────────────────
  const mcam = $("mcam");
  const [vbW, vbH] = machine.viewBox;
  const st = machine.stations;
  const union = (...ids) => {
    const b = ids.map((id) => st[id].bbox);
    const x = Math.min(...b.map((r) => r[0]));
    const y = Math.min(...b.map((r) => r[1]));
    return [x, y, Math.max(...b.map((r) => r[0] + r[2])) - x, Math.max(...b.map((r) => r[1] + r[3])) - y];
  };
  // Screen region each framing fills: clear of the counter, kicker and platform chrome.
  const FULL = tall ? [0, 260, W, H - 260 - 420] : [0, 40, W, H - 120];
  const LEFT = tall ? [0, 560, W, H - 560 - 420] : [0, 230, 1000, 820];
  const view = ([x, y, w, h], [rx, ry, rw, rh], pad = 0.86) => {
    const s = Math.min(rw / w, rh / h) * pad;
    return { x: rx + rw / 2 - s * (x + w / 2), y: ry + rh / 2 - s * (y + h / 2), scale: s };
  };
  const shots = [];
  const move = (box, region, at, dur = 0.75, pad) => shots.push({ to: view(box, region, pad), at, dur });
  const whole = view([0, 0, vbW, vbH], FULL, 0.96);
  if (tall) {
    move(st["st-fetch"].bbox, FULL, T.toSources, 0.9, 0.9);
    move(st["st-sources"].bbox, FULL, T.labels[0] - 0.6, 0.75, 0.95);
  } else move(union("st-sources", "st-fetch"), FULL, T.toSources, 0.9);
  move(st["st-dedupe"].bbox, FULL, T.toDedupe, 0.75, 0.62);
  move(st["st-score"].bbox, FULL, T.toScore, 0.75, 0.62);
  move(st["st-rank"].bbox, LEFT, T.toRank, 0.75, 0.8);
  move(st["st-tldr"].bbox, FULL, T.toTldr, 0.75, 0.62);
  move(st["st-dispatch"].bbox, FULL, T.toDispatch, 0.75, 0.7);
  tl.fromTo(mcam, { ...whole }, { ...whole, scale: whole.scale, duration: 0.01 }, T.machineIn);
  push($("machine-push"), T.machineIn, T.channels[0] + 0.6, 0.025);
  let prev = whole;
  for (const shot of shots) {
    tl.fromTo(mcam, { ...prev }, { ...shot.to, duration: shot.dur, ease: "power3.inOut" }, shot.at);
    prev = shot.to;
  }

  // Belt: resampled to evenly spaced points so array keyframes move at the eased speed.
  const belt = machine.belt;
  const lens = belt.slice(1).map((p, i) => Math.hypot(p[0] - belt[i][0], p[1] - belt[i][1]));
  const total = lens.reduce((a, b) => a + b, 0);
  const at = (f) => {
    let d = f * total;
    for (let i = 0; i < lens.length; i += 1) {
      if (d <= lens[i] || i === lens.length - 1) {
        const t = Math.min(1, d / lens[i]);
        return [belt[i][0] + (belt[i + 1][0] - belt[i][0]) * t, belt[i][1] + (belt[i + 1][1] - belt[i][1]) * t];
      }
      d -= lens[i];
    }
    return belt.at(-1);
  };
  const ride = (el, f0, f1, start, dur) => {
    const pts = Array.from({ length: 24 }, (_, i) => at(f0 + ((f1 - f0) * i) / 23));
    tl.fromTo(
      el,
      { x: pts[0][0], y: pts[0][1] },
      { keyframes: { x: pts.map((p) => p[0]), y: pts.map((p) => p[1]), easeEach: "none" }, ease: "power1.inOut", duration: dur },
      start,
    );
  };

  // 3 Sources: the clock turns, each source gets its plate, cards drop in and ride out.
    tl.fromTo("#needle-clock", { attr: { transform: "rotate(0)" } }, { attr: { transform: "rotate(180)" }, duration: 0.7, ease: park(0.7) }, T.clock);
  arrive($("tag-clock"), { opacity: 0, x: -20 }, { opacity: 1, x: 0 }, T.clock + 0.2, 0.45);
  T.labels.forEach((t, i) => {
    const [full, _short] = $(`plate-${i}`).children;
    arrive(full, { y: 26, opacity: 0 }, { y: 0, opacity: 1 }, t, 0.45);
    if (i < 4) {
      tl.to(full, { y: -16, opacity: 0, duration: 0.25, ease: "power2.in" }, T.labels[i + 1] - 0.2);
    }
    const [hx, hy] = machine.hoppers[i];
    const pk = $(`pk-${i}`);
    tl.fromTo(pk, { x: hx, y: hy - 160, opacity: 0 }, { y: hy, opacity: 1, duration: 0.45, ease: "power2.in" }, t + 0.15);
    tl.to(pk, { opacity: 0, duration: 0.12, ease: "none" }, t + 0.6);
    tl.fromTo(pk, { opacity: 0 }, { opacity: 1, duration: 0.15, ease: "none" }, t + 0.9);
    ride(pk, 0, 0.3, t + 0.9, 3.2);
    tl.to(pk, { opacity: 0, duration: 0.2, ease: "none" }, t + 4.0);
  });
  arrive($("counter"), { y: 24, opacity: 0 }, { y: 0, opacity: 1 }, T.counter, 0.5);
  tl.to($("counter"), { opacity: 0, duration: 0.3, ease: "power1.out" }, T.toRank - 0.3);

  // The live /data page as proof, then away as the camera moves on.
  const dataWin = $("win-data");
  const dw = tall ? [70, 300, 940, 1180] : [300, 110, 1320, 860];
  Object.assign(dataWin.style, { left: `${dw[0]}px`, top: `${dw[1]}px`, width: `${dw[2]}px`, height: `${dw[3]}px` });
  arrive(dataWin, { y: H, opacity: 1 }, { y: 0 }, T.dataIn, 0.9);
  tl.to(dataWin, { y: H, duration: 0.5, ease: "power2.in" }, T.toDedupe - 0.1);

  // 4 Dedupe: two headlines of one story ride in, one card leaves.
  const dd = st["st-dedupe"].center;
  const dir = (() => {
    const i = belt.findIndex((p) => p[0] > dd[0]) || 1;
    const a = belt[Math.max(0, i - 1)];
    const b = belt[Math.min(belt.length - 1, i)];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  })();
  const nrm = [-dir[1], dir[0]];
  const place = (k, n) => ({ x: dd[0] + dir[0] * k + nrm[0] * n, y: dd[1] + dir[1] * k + nrm[1] * n });
  const cardW = 240;
  ["dup-a", "dup-b"].forEach((id, i) => {
    const el = $(id);
    el.style.width = `${cardW}px`;
    const from = place(-330, i ? -95 : 95);
    const to = place(-40, i ? -20 : 20);
    tl.fromTo(el, { x: from.x - cardW / 2, y: from.y - 60, opacity: 0 }, { opacity: 1, duration: 0.3, ease: "none" }, T.toDedupe + 0.5 + i * 3 * F);
    tl.fromTo(el, { x: from.x - cardW / 2, y: from.y - 60 }, { x: to.x - cardW / 2, y: to.y - 60, duration: T.merge - T.toDedupe - 0.7, ease: "power2.inOut" }, T.toDedupe + 0.7);
    tl.to(el, { opacity: 0, duration: 0.1, ease: "none" }, T.merge);
  });
  const one = $("dup-one");
  one.style.width = `${cardW}px`;
  const o0 = place(40, 0);
  const o1 = place(300, 0);
  tl.fromTo(one, { x: o0.x - cardW / 2, y: o0.y - 60, opacity: 0, scale: 0.9 }, { opacity: 1, scale: 1, duration: 0.35, ease: park(0.35) }, T.merge);
  tl.fromTo(one, { x: o0.x - cardW / 2 }, { x: o1.x - cardW / 2, y: o1.y - 60, duration: 1.1, ease: "power2.inOut" }, T.merge + 0.5);
  tl.to(one, { opacity: 0, duration: 0.3, ease: "none" }, T.toScore + 0.3);

  // Score: the plunger presses, the needle reads.
  const mv = machine.moves;
  tl.fromTo("#plunger-score", { x: 0, y: 0 }, { x: mv["plunger-score"][0], y: mv["plunger-score"][1], duration: 0.3, ease: "power2.in" }, T.score);
  tl.to("#plunger-score", { x: 0, y: 0, duration: 0.5, ease: park(0.5) }, T.score + 0.45);
  tl.fromTo("#needle-score", { attr: { transform: "rotate(0)" } }, { attr: { transform: "rotate(74)" }, duration: 0.7, ease: park(0.7) }, T.score + 0.3);

  // 5 Rank: one card per tray on the beat.
  arrive($("rank-line"), { y: 30, opacity: 0 }, { y: 0, opacity: 1 }, T.rankLine, 0.5);
  arrive($("rank-code"), { x: -30, opacity: 0 }, { x: 0, opacity: 1 }, T.rankCode, 0.45);
  T.rankSlots.forEach((t, i) => {
    tl.fromTo("#rank-carriage", { x: mv["rank-carriage"][0] * i, y: mv["rank-carriage"][1] * i }, { x: mv["rank-carriage"][0] * (i + 1), y: mv["rank-carriage"][1] * (i + 1), duration: 0.3, ease: park(0.3) }, t);
    tl.fromTo($(`slot-${i}`), { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: park(0.3) }, t + 0.2);
  });
  const aboutWin = $("win-about");
  const aw = tall ? [70, 1000, 940, 900] : [760, 160, 1100, 860];
  Object.assign(aboutWin.style, { left: `${aw[0]}px`, top: `${aw[1]}px`, width: `${aw[2]}px`, height: `${aw[3]}px` });
  if (!tall) Object.assign(aboutWin.querySelector(".shot img").style, { width: `${aw[2] * 1.7}px`, marginLeft: `${-0.1 * aw[2] * 1.7}px`, marginTop: `${-0.06 * aw[2] * 1.7 * 0.625}px` });
  arrive(aboutWin, { x: tall ? 0 : W - aw[0], y: tall ? H - aw[1] : 0, opacity: 1 }, { x: 0, y: 0 }, T.aboutIn, 0.9);
  for (const id of ["rank-line", "rank-code"]) tl.to($(id), { opacity: 0, duration: 0.3, ease: "power1.out" }, T.toTldr - 0.1);
  tl.to(aboutWin, { x: tall ? 0 : W - aw[0], y: tall ? H - aw[1] : 0, duration: 0.5, ease: "power2.in" }, T.toTldr - 0.1);

  // 6 TL;DR: the press stamps on "edition" and two plates slide out.
  tl.fromTo("#ram-tldr", { x: 0, y: 0 }, { x: mv["ram-tldr"][0], y: mv["ram-tldr"][1], duration: 0.25, ease: "power3.in" }, T.stamp - 0.25);
  tl.to("#ram-tldr", { x: 0, y: 0, duration: 0.45, ease: park(0.45) }, T.stamp + 0.15);
  const tc = st["st-tldr"].center;
  [["plate-en", -1], ["plate-vi", 1]].forEach(([id, side], i) => {
    const el = $(id);
    tl.fromTo(el, { x: tc[0], y: tc[1], opacity: 0 }, { x: tc[0] + dir[0] * 230 + nrm[0] * 80 * side, y: tc[1] + dir[1] * 230 + nrm[1] * 80 * side, opacity: 1, duration: 0.5, ease: park(0.5) }, T.stamp + 0.1 + i * 3 * F);
  });

  for (const id of ["plate-en", "plate-vi"]) tl.to($(id), { opacity: 0, duration: 0.2, ease: "none" }, T.editionIn + 0.2);

  // ── 6 The edition ─────────────────────────────────────────────────────────────────────────
  push($("edition-cam"), T.editionIn, T.toDispatch + 0.7);
  arrive($("ed-head").firstElementChild, { y: 30, opacity: 0 }, { y: 0, opacity: 1 }, T.editionIn, 0.5);
  arrive($("ed-pill"), { x: 30, opacity: 0 }, { x: 0, opacity: 1 }, T.upTo, 0.45);
  const column = (side, t) => {
    const col = $(`ed-${side}`);
    arrive(col.querySelector("h3"), { y: 20, opacity: 0 }, { y: 0, opacity: 1 }, t, 0.45);
    col.querySelectorAll(".b").forEach((b, i) => {
      arrive(b, { y: 26, opacity: 0 }, { y: 0, opacity: 1 }, t + 0.1 + i * 4 * F, 0.5);
    });
  };
  column("en", T.enCol);
  column("vi", T.viCol);
  arrive($("ed-semi"), { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1 }, T.viCol - 0.1, 0.5);
  arrive($("ed-note"), { y: 20, opacity: 0 }, { y: 0, opacity: 1 }, T.viCol + 0.9, 0.5);
  tl.to($("edition-cam"), { y: -H * 0.08, opacity: 0, duration: 0.6, ease: "power2.inOut" }, T.toDispatch);

  // ── 7 Dispatch, then the real screens ────────────────────────────────────────────────────
  ["web", "email", "telegram", "facebook", "youtube"].forEach((id, i) => {
    const p = machine.ports[id];
    const ring = document.createElement("div");
    ring.className = "ring";
    Object.assign(ring.style, { position: "absolute", left: `${p[0] - 24}px`, top: `${p[1] - 24}px`, width: "48px", height: "48px", borderRadius: "50%", border: "6px solid #0a0a0a" });
    mcam.appendChild(ring);
    arrive(ring, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1 }, T.ports + i * 4 * F, 0.4);
  });

  push($("chan-cam"), T.channels[0] - 0.15, T.storyIn + 0.6);
  const winBox = tall ? [70, 560, 940, 1000] : [560, 90, 1300, 900];
  const labBox = tall ? [70, 250, 940] : [64, 330, 460];
  // Desktop captures zoom to the part that proves the claim: [zoom, left, top] as image fractions.
  const FOCUS = { web: [1.3, 0.05, 0], email: [1.9, 0.24, 0], telegram: [1.75, 0.06, 0.02], sub: [1.35, 0.05, 0] };
  if (!tall) for (const [id, [z, fx, fy]] of Object.entries(FOCUS)) {
    const img = $(`win-${id}`).querySelector(".shot img");
    if (!img) continue;
    const key = { web: "home", email: "email", telegram: "telegram", sub: "subscribe" }[id] + (id === "sub" ? "-desktop-full" : "-desktop");
    const d = dims[key];
    const w = winBox[2] * z;
    Object.assign(img.style, { width: `${w}px`, marginLeft: `${-fx * w}px`, marginTop: `${-fy * (w * d[1]) / d[0]}px` });
  }
  const ids = ["web", "email", "telegram", "facebook", "youtube"];
  const all = [...ids, "sub"];
  all.forEach((id, i) => {
    const win = $(`win-${id}`);
    const lab = $(`chan-${id}`);
    Object.assign(win.style, { left: `${winBox[0]}px`, top: `${winBox[1]}px`, width: `${winBox[2]}px`, height: `${winBox[3]}px` });
    Object.assign(lab.style, { left: `${labBox[0]}px`, top: `${labBox[1]}px`, width: `${labBox[2]}px` });
    const t = i < ids.length ? T.channels[i] - 0.15 : T.subscribeIn;
    const next = i + 1 < all.length ? (i + 1 < ids.length ? T.channels[i + 1] - 0.15 : T.subscribeIn) : null;
    arrive(win, { x: tall ? 0 : W - winBox[0] + 40, y: tall ? H - winBox[1] : 0, opacity: 1 }, { x: 0, y: 0 }, t, 0.9);
    arrive(lab, { y: 30, opacity: 0 }, { y: 0, opacity: 1 }, t + 0.15, 0.45);
    if (next !== null) {
      tl.to(win, { scale: 0.94, opacity: 0, duration: 0.3, ease: "power2.in" }, next + 0.1);
      tl.to(lab, { y: -24, opacity: 0, duration: 0.3, ease: "power2.in" }, next);
    }
  });
  // Daily-video thumbnails fan out inside their frame.
  const tw = tall ? 290 : 340;
  [1, 2, 3].forEach((n, i) => {
    const th = $(`thumb-${n}`);
    const d = dims[`daily-video-${n}`] ?? [1, 1];
    const h = (tw * d[1]) / d[0];
    Object.assign(th.style, { width: `${tw}px`, height: `${h}px`, left: `${(winBox[2] - 3 * tw - 40) / 2 + i * (tw + 20)}px`, top: `${(winBox[3] - 44 - h) / 2}px` });
    arrive(th, { y: 60, opacity: 0 }, { y: 0, opacity: 1 }, T.channels[4] + i * 3 * F, 0.5);
  });
  // /subscribe scrolls past.
  const sub = dims[`subscribe-${CFG.form}-full`];
  const imgH = ((tall ? 1 : 1.35) * winBox[2] * sub[1]) / sub[0];
  const travel = Math.max(0, Math.min(imgH - (winBox[3] - 44), imgH * 0.45));
  tl.fromTo($("sub-img"), { y: 0 }, { y: -travel, duration: 3, ease: "expo.inOut" }, T.subscribeIn + 1.2);

  // ── 8 Proof, lockup ──────────────────────────────────────────────────────────────────────
  push($("story-cam"), T.storyIn, T.lockup + 0.4);
  const sw = $("win-story");
  Object.assign(sw.style, { left: `${winBox[0]}px`, top: `${winBox[1]}px`, width: `${winBox[2]}px`, height: `${winBox[3]}px` });
  const sl = $("story-label");
  Object.assign(sl.style, { left: `${labBox[0]}px`, top: `${labBox[1]}px`, width: `${labBox[2]}px` });
  arrive(sw, { y: H, opacity: 1 }, { y: 0 }, T.storyIn, 0.6);
  arrive(sl, { y: 30, opacity: 0 }, { y: 0, opacity: 1 }, T.storyIn + 0.2, 0.45);
  // Key sources block on the story page, as a fraction of the capture (scripts/build.mjs MARKS).
  const mk = CFG.mark;
  const sd = dims[`story-${CFG.form}`];
  const scale = winBox[2] / sd[0];
  const lift = tall ? 0.3 * sd[1] * scale : 0;
  sw.querySelector("img").style.marginTop = `${-lift}px`;
  Object.assign($("story-mark").style, { left: `${mk[0] * sd[0] * scale}px`, top: `${mk[1] * sd[1] * scale - lift}px`, width: `${mk[2] * sd[0] * scale}px`, height: `${mk[3] * sd[1] * scale}px` });
  tl.fromTo($("story-mark"), { scaleX: 0 }, { scaleX: 1, duration: 0.45, ease: "power2.inOut" }, T.proofMark);

  push($("lock-cam"), T.lockup, T.end, 0.04);
  arrive($("lock-logo"), { scale: 1.5, opacity: 0 }, { scale: 1, opacity: 1 }, T.lockup, 0.5);
  T.closingWords.forEach((t, i) => {
    arrive($(`cw-${i}`), { y: 26, opacity: 0 }, { y: 0, opacity: 1 }, t - 0.05, 0.4);
  });
  arrive($("url"), { y: 20, opacity: 0 }, { y: 0, opacity: 1 }, T.url, 0.45);

  tl.to({}, { duration: T.end }, 0);
  window.__timelines.main = tl;
})();
