// AI;DR Daily — one paused GSAP timeline for the whole broadcast.
// Reads window.__DN (absolute times, written by scripts/build.mjs). Deterministic: no clocks, no random.
// Motion rules (aidr-motion-designer): arrive fast / land soft, stagger 2–4 frames, nothing freezes
// (every scene runs one linear camera push), no bounce.
(() => {
  const D = window.__DN;
  const F = 1 / 30;
  const LAND = "expo.out";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  // Clips outside their window are display:none, so the clip is shown (hidden) while fn measures el.
  function measured(el, fn) {
    const clip = el.closest("[data-start]");
    const saved = clip.getAttribute("style");
    clip.style.display = "block";
    clip.style.visibility = "hidden";
    const out = fn();
    if (saved === null) clip.removeAttribute("style");
    else clip.setAttribute("style", saved);
    return out;
  }

  // Shrink a text block until it fits its box (max lines * line-height). Fonts are loaded first.
  function fit(el, maxLines, minPx) {
    if (!el) return;
    measured(el, () => {
      let px = parseFloat(getComputedStyle(el).fontSize);
      const lh = () => parseFloat(getComputedStyle(el).lineHeight) || px * 1.05;
      while (el.offsetHeight > lh() * maxLines + 2 && px > minPx) {
        px -= 2;
        el.style.fontSize = px + "px";
      }
    });
  }

  // Shrink a one-line block until it fits its parent's width; false when even minPx does not fit.
  function fitWidth(el, minPx) {
    if (!el) return;
    return measured(el, () => {
      const over = () => el.scrollWidth > el.parentElement.clientWidth;
      let px = parseFloat(getComputedStyle(el).fontSize);
      while (over() && px > minPx) {
        px -= 1;
        el.style.fontSize = px + "px";
      }
      return !over();
    });
  }

  // Shrink a block until it ends a gap above `below`; hide it when even minPx does not clear
  // (a no-image tile's paper title over its headline, in a short tile).
  function fitAbove(el, below, gapPx, minPx) {
    if (!el) return;
    measured(el, () => {
      let px = parseFloat(getComputedStyle(el).fontSize);
      const over = () =>
        el.getBoundingClientRect().bottom >
        below.getBoundingClientRect().top - gapPx;
      while (over() && px > minPx) {
        px -= 2;
        el.style.fontSize = px + "px";
      }
      if (over()) el.style.display = "none";
    });
  }

  function build() {
    const tl = gsap.timeline({ paused: true });
    const vertical = D.fmt === "9x16";
    // The day's variants (looks/, serialized by build.mjs) get the timeline, their data and these helpers.
    const L = window.__LOOK;
    // A hit element turns fully legible on its hit key: a linear fade of D.fade from its start (choreography.mjs FADE).
    const fadeIn = (el, at) =>
      tl.fromTo(
        el,
        { opacity: 0 },
        { opacity: 1, duration: D.fade, ease: "none" },
        at
      );
    const H = {
      fadeIn,
      $,
      $$,
      fit,
      fitWidth,
      fitAbove,
      measured,
      LAND,
      F,
      vertical,
      IN: D.stinger.in,
      OUT: D.stinger.out,
    };

    // ---------- intro ----------
    const I = D.intro;
    const intro = $("#intro");
    tl.fromTo(
      $(".cam", intro),
      { scale: 1 },
      { scale: 1.04, duration: I.dur, ease: "none" },
      I.start
    );
    tl.fromTo(
      $(".semi", intro),
      { yPercent: 8 },
      { yPercent: -4, duration: I.dur, ease: "none" },
      I.start
    );
    L.intro(tl, I, H);

    // ---------- chrome ----------
    tl.fromTo(
      ".bar",
      { y: -30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: LAND },
      D.chrome.start + 0.2
    );
    tl.fromTo(
      ".ticker",
      { yPercent: 100 },
      { yPercent: 0, duration: 0.5, ease: LAND },
      D.chrome.start + 0.25
    );
    // The chrome clip is display:none at build time, so show it (hidden) while the crawl is measured.
    const crawl = $(".ticker .crawl");
    const chrome = crawl.closest("[data-start]");
    const saved = chrome.getAttribute("style");
    chrome.style.display = "block";
    chrome.style.visibility = "hidden";
    const labelW = $(".ticker .label").offsetWidth;
    const half = crawl.scrollWidth / 2; // crawl content is written twice for a seamless loop
    if (saved === null) chrome.removeAttribute("style");
    else chrome.setAttribute("style", saved);
    const speed = vertical ? 150 : 170; // px per second
    const crawlDur = D.chrome.dur;
    tl.fromTo(
      crawl,
      { x: labelW + 40 },
      {
        x: labelW + 40 - Math.min(speed * crawlDur, half * 2 - 400),
        duration: crawlDur,
        ease: "none",
      },
      D.chrome.start
    );
    tl.fromTo(
      ".live .dot",
      { opacity: 1 },
      {
        opacity: 0.25,
        duration: 0.5,
        ease: "sine.inOut",
        yoyo: true,
        repeat: Math.ceil(D.total) * 2,
      },
      0
    );

    // ---------- stories ----------
    D.stories.forEach((S, i) => {
      const sc = $("#story-" + (i + 1));
      const t = S.start;
      fit($(".head", sc), S.layout === "stat" ? 2 : vertical ? 3 : 4, 40);
      fitWidth($(".kicker", sc), 22);
      fit($(".stat", sc), 1, 48);
      // A long (often Vietnamese) paper title would push the abstract out of the card.
      fit($(".paper .ptitle", sc), vertical ? 3 : 2, 48);

      tl.fromTo(
        $(".cam", sc),
        { scale: 1 },
        { scale: 1.03, duration: S.dur, ease: "none" },
        t
      );
      tl.fromTo(
        $(".counter .seg:nth-child(" + (i + 1) + ") .fill", document),
        { scaleX: 0 },
        { scaleX: 1, duration: 0.4, ease: LAND },
        t + 0.1
      );
      tl.set(
        ".counter .num",
        {
          textContent:
            String(i + 1).padStart(2, "0") +
            "/" +
            String(D.stories.length).padStart(2, "0"),
        },
        t
      );

      // An image far from its box's shape (a wide social card in a narrower box) shows whole over a blurred copy
      // of itself: a cover crop plus the drift would cut through the text baked into it.
      const frames = $$(".media .frame", sc);
      const pic = $(".media .pic", sc);
      const box = pic
        ? measured(pic, () => pic.offsetWidth / pic.offsetHeight)
        : 1;
      frames.forEach((fr) => {
        const ar = parseFloat($("img", fr).dataset.ar);
        if (ar && Math.min(ar / box, box / ar) < 0.9) fr.classList.add("fit");
      });

      // The day's choreography: media reveal, image drift, rank badge, copy lines.
      L.choreography(tl, S, sc, H);
      frames.forEach((fr, k) => {
        if (k > 0)
          tl.fromTo(
            fr,
            { opacity: 0 },
            { opacity: 1, duration: 0.5, ease: "power1.inOut" },
            t + (S.dur * k) / frames.length
          );
      });
      const paper = $(".paper", sc);
      if (paper) {
        tl.fromTo(
          $(".venue", paper),
          { opacity: 0, y: 20 },
          { opacity: 1, y: 0, duration: 0.4, ease: LAND },
          t + 0.5
        );
        tl.fromTo(
          $(".ptitle", paper),
          { opacity: 0, y: 30 },
          { opacity: 1, y: 0, duration: 0.5, ease: LAND },
          t + 0.6
        );
        tl.fromTo(
          $(".rule", paper),
          { scaleX: 0 },
          { scaleX: 1, duration: 0.6, ease: LAND },
          t + 0.8
        );
        tl.fromTo(
          $(".abs", paper),
          { opacity: 0 },
          { opacity: 1, duration: 0.8, ease: "power1.out" },
          t + 1.0
        );
      }

      L.layouts[S.layout]?.(tl, S, sc, H);
      $$(".head .mk", sc).forEach((mk, k) => {
        tl.fromTo(
          mk,
          { backgroundSize: "0% 38%" },
          { backgroundSize: "100% 38%", duration: 0.5, ease: "power2.inOut" },
          t + 1.0 + k * 0.25
        );
      });
      tl.fromTo(
        $(".stat", sc),
        { y: 40, scale: 0.92 },
        { y: 0, scale: 1, duration: 0.6, ease: LAND },
        S.statIn
      );
      fadeIn($(".stat", sc), S.statIn);
      tl.fromTo(
        $(".stat-label", sc),
        { y: 24, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: LAND },
        S.statIn + 4 * F
      );
      // The credit is left out when the story has no source.
      if ($(".src", sc))
        tl.fromTo(
          $(".src", sc),
          { opacity: 0 },
          { opacity: 1, duration: 0.5, ease: "power1.out" },
          S.statIn + 0.4
        );
    });

    // ---------- outro ----------
    const O = D.outro;
    const outro = $("#outro");
    tl.fromTo(
      $(".cam", outro),
      { scale: 1 },
      { scale: 1.04, duration: O.dur, ease: "none" },
      O.start
    );
    tl.fromTo(
      $(".biglogo", outro),
      { scale: 0.6 },
      { scale: 1, duration: 0.6, ease: LAND },
      O.logoIn
    );
    fadeIn($(".biglogo", outro), O.logoIn);
    tl.fromTo(
      $(".title", outro),
      { y: 50, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.6, ease: LAND },
      O.start + 0.5
    );
    tl.fromTo(
      $(".url", outro),
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: LAND },
      O.start + 0.8
    );
    tl.fromTo(
      $(".follow", outro),
      { y: 30, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.5, ease: LAND },
      O.start + 1.0
    );

    // ---------- stingers ----------
    D.wipes.forEach((W, i) => L.transition(tl, $("#wipe-" + i), W, H));

    // ---------- captions: the active word turns ink ----------
    // Yellow belongs to the headline marker alone: a yellow caption word beside it made two focal points.
    D.caps.forEach((C, ci) => {
      const line = $("#cap-" + ci + " .line");
      tl.fromTo(
        line,
        { y: 14, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.18, ease: "power2.out" },
        C.start
      );
      $$(".w", line).forEach((w, k) => {
        const W = C.words[k];
        tl.set(w, { color: "#0a0a0a" }, W.s);
        if (k < C.words.length - 1)
          tl.set(w, { color: "#7a7a7a" }, C.words[k + 1].s);
      });
    });

    window.__timelines["main"] = tl;
  }

  document.fonts.ready.then(build);
})();
