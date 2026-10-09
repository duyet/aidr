// The single paused timeline for a release film. Inlined into both compositions by build.mjs,
// which sets window.__FILM (all times in seconds). Motion rules: aidr-motion-designer.
(function () {
  const F = window.__FILM;
  const tl = gsap.timeline({ paused: true });

  // Parking ease: each frame covers k of the remaining distance, normalised to end at rest.
  const park = (dur, k = 0.15) => (p) =>
    (1 - Math.pow(1 - k, p * dur * 30)) / (1 - Math.pow(1 - k, dur * 30));
  const arrive = (target, from, at, dur = 0.6, k = 0.15) =>
    tl.fromTo(target, from, { x: 0, y: 0, opacity: 1, filter: "blur(0px)", duration: dur, ease: park(dur, k) }, at);
  // The one linear root push per section, from its first frame.
  const push = (target, at, dur, to = 1.025) =>
    tl.fromTo(target, { scale: 1 }, { scale: to, duration: dur, ease: "none" }, at);
  // Leave left with horizontal blur, ahead of the next section's entrance.
  const leave = (target, end) =>
    tl.to(target, { x: -150, filter: "blur(6px)", duration: F.EXIT, ease: "power3.in" }, end - F.EXIT);
  const sweep = (target, at, dur = 0.4) =>
    tl.fromTo(target, { scaleX: 0 }, { scaleX: 1, duration: dur, ease: "power2.out" }, at);

  // ── title ──────────────────────────────────────────────
  push("#title-push", 0, F.title.dur, 1.03);
  tl.fromTo("#wm-dot", { scale: 0, transformOrigin: "50% 50%" }, { scale: 1, duration: 0.36, ease: park(0.36, 0.19) }, 0.05);
  tl.fromTo("#wm-comma", { scale: 0, transformOrigin: "50% 20%" }, { scale: 1, duration: 0.36, ease: park(0.36, 0.19) }, 0.12);
  tl.fromTo("#wm-ai", { x: 150, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: park(0.6) }, 0.7);
  tl.fromTo("#wm-dr", { x: -150, opacity: 0 }, { x: 0, opacity: 1, duration: 0.6, ease: park(0.6) }, 0.76);
  arrive("#t-ver", { x: 0, y: 40, opacity: 0, filter: "blur(8px)" }, 1.4, 0.5, 0.19);
  sweep("#t-hl", 1.8);
  arrive("#t-kicker", { y: -16, opacity: 0, filter: "blur(4px)" }, 1.9, 0.5);
  arrive("#t-head", { y: 26, opacity: 0, filter: "blur(6px)" }, 2.1, 0.6);
  arrive("#t-dates", { y: 16, opacity: 0, filter: "blur(4px)" }, 2.35, 0.5);
  leave("#title-out", F.title.dur);

  // ── highlights ─────────────────────────────────────────
  F.scenes.forEach((s, i) => {
    const t = s.start;
    const S = F.S;
    const id = "#s" + i;
    push(id + "-push", t, s.dur, 1.022);
    arrive(id + "-win", { x: 260, y: 0, opacity: 1, filter: "blur(12px)" }, t + S.win, 0.6, 0.17);
    tl.fromTo(id + "-cam", s.from, { x: s.to.x, y: s.to.y, scale: s.to.scale, duration: 1.1, ease: park(1.1, 0.12) }, t + S.cam);
    arrive(id + "-chrome", { y: -12, opacity: 1 }, t + 0.05, 0.5);
    arrive(id + "-num", { x: -60, opacity: 1, filter: "blur(6px)" }, t + S.num, 0.6);
    arrive(id + "-label", { x: -40, opacity: 0 }, t + S.label, 0.5);
    arrive(id + "-title", { x: -50, opacity: 0, filter: "blur(6px)" }, t + S.title, 0.6);
    sweep(id + "-title .hl", t + S.marker);
    for (let r = 0; r < s.rows; r++) {
      arrive(id + "-r" + r, { y: 24, opacity: 0 }, t + S.rows + r * 0.1, 0.5);
    }
    if (s.focus) {
      tl.fromTo(id + "-focus", { opacity: 0, scale: 1.04, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.45, ease: park(0.45) }, t + S.focus);
    }
    leave(id + "-out", t + s.dur);
  });

  // ── in numbers ─────────────────────────────────────────
  const st = F.stats.start;
  push("#stats-push", st, F.stats.dur, 1.025);
  arrive("#st-label", { x: -40, opacity: 1 }, st, 0.5);
  for (let i = 0; i < F.stats.count; i++) {
    const el = document.querySelector("#st" + i + " .sv");
    const pre = el.dataset.pre, post = el.dataset.post, num = Number(el.dataset.num);
    const at = st + 0.1 + i * 0.1;
    arrive("#st" + i, { y: 40, opacity: i === 0 ? 1 : 0, filter: "blur(6px)" }, at, 0.6);
    const box = { v: 0 };
    tl.fromTo(box, { v: 0 }, {
      v: num, duration: 0.6, ease: park(0.6, 0.15),
      onUpdate: () => { el.textContent = pre + Math.round(box.v) + post; },
    }, at);
  }
  arrive("#st-also", { y: 26, opacity: 0, filter: "blur(4px)" }, st + 1.2, 0.6);
  leave("#stats-out", st + F.stats.dur);

  // ── close ──────────────────────────────────────────────
  const c = F.close.start;
  push("#close-push", c, F.close.dur, 1.03);
  tl.fromTo("#c-tile", { scale: 0.7, opacity: 1, filter: "blur(8px)" }, { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.6, ease: park(0.6, 0.17) }, c);
  arrive("#c-line", { y: 30, opacity: 0, filter: "blur(6px)" }, c + 0.8, 0.6);
  arrive("#c-url", { y: 24, opacity: 0, filter: "blur(4px)" }, c + 1.2, 0.5);
  sweep("#c-hl", c + 1.45);
  arrive("#c-notes", { y: 16, opacity: 0 }, c + 1.9, 0.5);

  // ── captions: each line rises in, the spoken word gets the marker ──
  F.caps.forEach((C, ci) => {
    const line = document.querySelector("#cap-" + ci + " .line");
    tl.fromTo(line, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.18, ease: "power2.out" }, C.start);
    line.querySelectorAll(".w").forEach((w, k) => {
      tl.set(w, { backgroundColor: "#f5c518" }, C.words[k]);
      if (k < C.words.length - 1) tl.set(w, { backgroundColor: "#f7f7f5" }, C.words[k + 1]);
    });
  });

  tl.to({}, { duration: F.TOTAL }, 0);
  window.__timelines["main"] = tl;
})();
