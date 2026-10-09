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

  // Shrink a text block until it fits its box (max lines * line-height). Fonts are loaded first.
  // Clips outside their window are display:none, so the scene is shown while it is measured.
  function fit(el, maxLines, minPx) {
    if (!el) return;
    const clip = el.closest("[data-start]");
    const saved = clip.getAttribute("style");
    clip.style.display = "block";
    clip.style.visibility = "hidden";
    let px = parseFloat(getComputedStyle(el).fontSize);
    const lh = () => parseFloat(getComputedStyle(el).lineHeight) || px * 1.05;
    while (el.offsetHeight > lh() * maxLines + 2 && px > minPx) {
      px -= 2;
      el.style.fontSize = px + "px";
    }
    if (saved === null) clip.removeAttribute("style");
    else clip.setAttribute("style", saved);
  }

  function fitWidth(el, minPx) {
    if (!el) return;
    const clip = el.closest("[data-start]");
    const saved = clip.getAttribute("style");
    clip.style.display = "block";
    clip.style.visibility = "hidden";
    let px = parseFloat(getComputedStyle(el).fontSize);
    while (el.scrollWidth > el.parentElement.clientWidth && px > minPx) {
      px -= 1;
      el.style.fontSize = px + "px";
    }
    if (saved === null) clip.removeAttribute("style");
    else clip.setAttribute("style", saved);
  }

  function build() {
    const tl = gsap.timeline({ paused: true });
    const vertical = D.fmt === "9x16";

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
    if (I.variant === "grid") {
      // Frame 0 is the finished grid (title included). Then each tile is underlined in turn, and the grid drifts.
      tl.fromTo(
        ".tiles",
        { y: 0 },
        { y: vertical ? -18 : -10, duration: I.dur, ease: "none" },
        I.start
      );
      $$(".tile").forEach((tile, i) => {
        tl.fromTo(
          $(".tbar", tile),
          { scaleX: 0 },
          { scaleX: 1, duration: 0.35, ease: LAND },
          I.start + 0.8 + i * 0.3
        );
        tl.fromTo(
          $("img", tile) || $(".tpaper", tile),
          { scale: 1.0 },
          { scale: 1.08, duration: I.dur, ease: "none" },
          I.start
        );
      });
      // A tile lifts while the intro names its story; the others step back.
      const F = I.focus ?? [];
      F.forEach((f) => {
        const tile = $(`.tile[data-rank="${f.rank}"]`);
        const others = $$(".tile").filter((t) => t !== tile);
        tl.to(
          tile,
          { scale: 1.06, opacity: 1, zIndex: 2, duration: 0.3, ease: LAND },
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
    } else if (I.variant === "date-slam") {
      tl.fromTo(
        ".slam .dow",
        { y: -60, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: LAND },
        I.start + 0.15
      );
      tl.fromTo(
        ".slam .day",
        { scale: 1.9, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.55, ease: LAND },
        I.start + 0.3
      );
      tl.fromTo(
        ".slam .mon",
        { y: 60, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: LAND },
        I.start + 0.45
      );
      tl.fromTo(
        ".slam-tail .title",
        { y: 50, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: LAND },
        I.start + 1.2
      );
      tl.fromTo(
        ".slam-tail .with",
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: LAND },
        I.start + 1.2 + 4 * F
      );
    } else if (I.variant === "headline-stack") {
      tl.fromTo(
        ".hstack .hdate",
        { y: -30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: LAND },
        I.start + 0.1
      );
      $$(".hstack .row").forEach((row, i) => {
        tl.fromTo(
          row,
          { x: -80, opacity: 0 },
          { x: 0, opacity: 1, duration: 0.5, ease: LAND },
          I.start + 0.25 + i * 0.22
        );
      });
      tl.fromTo(
        ".hstack",
        { y: 0 },
        { y: vertical ? -40 : -20, duration: I.dur, ease: "none" },
        I.start
      );
    } else {
      // countdown
      tl.fromTo(
        ".stack .biglogo",
        { scale: 0.6, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.6, ease: LAND },
        I.start + 0.2
      );
      tl.fromTo(
        ".stack .eyebrow",
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: LAND },
        I.start + 0.45
      );
      tl.fromTo(
        ".stack .title",
        { y: 50, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.6, ease: LAND },
        I.start + 0.55
      );
      tl.fromTo(
        ".stack .date",
        { y: 30, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: LAND },
        I.start + 0.7
      );
      $$(".dots span").forEach((d, i) => {
        tl.fromTo(
          d,
          { y: 40, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.4, ease: LAND },
          I.start + 1.3 + i * 0.2
        );
      });
    }

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

      const media = $(".media", sc);
      tl.fromTo(
        media,
        { clipPath: "inset(0% 100% 0% 0%)" },
        { clipPath: "inset(0% 0% 0% 0%)", duration: 0.7, ease: "power3.out" },
        t + 0.05
      );
      const imgs = $$(".media img", sc);
      imgs.forEach((img, k) => {
        const from =
          k % 2 ? { scale: 1.02, xPercent: -2 } : { scale: 1.14, xPercent: 2 };
        const to =
          k % 2 ? { scale: 1.12, xPercent: 2 } : { scale: 1.02, xPercent: 0 };
        tl.fromTo(img, from, { ...to, duration: S.dur, ease: "none" }, t);
        if (k > 0)
          tl.fromTo(
            img,
            { opacity: 0 },
            { opacity: 1, duration: 0.5, ease: "power1.inOut" },
            t + (S.dur * k) / imgs.length
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

      tl.fromTo(
        $(".rank", sc),
        { scale: 0.4, rotation: -10, opacity: 0 },
        { scale: 1, rotation: 0, opacity: 1, duration: 0.5, ease: LAND },
        t + 0.2
      );
      const copyBits = [".cat", ".kicker", ".head"].map((s) => $(s, sc));
      copyBits.forEach((el, k) => {
        tl.fromTo(
          el,
          { y: 36, opacity: 0 },
          { y: 0, opacity: 1, duration: 0.55, ease: LAND },
          t + 0.3 + k * 3 * F
        );
      });
      if (S.layout === "full")
        tl.fromTo(
          $(".copy", sc),
          { opacity: 0, y: 40 },
          { opacity: 1, y: 0, duration: 0.55, ease: LAND },
          t + 0.25
        );
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
        { y: 40, opacity: 0, scale: 0.92 },
        { y: 0, opacity: 1, scale: 1, duration: 0.6, ease: LAND },
        S.statAt
      );
      tl.fromTo(
        $(".stat-label", sc),
        { y: 24, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.5, ease: LAND },
        S.statAt + 4 * F
      );
      // The credit is left out when the story has no source.
      if ($(".src", sc))
        tl.fromTo(
          $(".src", sc),
          { opacity: 0 },
          { opacity: 1, duration: 0.5, ease: "power1.out" },
          S.statAt + 0.4
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
      { scale: 0.6, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.6, ease: LAND },
      O.start + 0.3
    );
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
    D.wipes.forEach((W, i) => {
      const w = $("#wipe-" + i);
      const IN = 0.32;
      const OUT = 0.4;
      const a = W.at - IN;
      if (D.transition === "shutter") {
        tl.fromTo(
          $(".half.top", w),
          { yPercent: -100 },
          { yPercent: 0, duration: IN, ease: "power3.in" },
          a
        );
        tl.fromTo(
          $(".half.bot", w),
          { yPercent: 100 },
          { yPercent: 0, duration: IN, ease: "power3.in" },
          a
        );
        tl.to(
          $(".half.top", w),
          { yPercent: -100, duration: OUT, ease: "power3.out" },
          W.at + 0.06
        );
        tl.to(
          $(".half.bot", w),
          { yPercent: 100, duration: OUT, ease: "power3.out" },
          W.at + 0.06
        );
      } else {
        const panel = $(".panel, .ink-panel", w);
        tl.fromTo(
          panel,
          { xPercent: -101 },
          { xPercent: 0, duration: IN, ease: "power3.in" },
          a
        );
        tl.fromTo(
          $(".n", w),
          { scale: 0.7, opacity: 0 },
          { scale: 1, opacity: 1, duration: 0.3, ease: LAND },
          a + 0.12
        );
        tl.to(
          panel,
          { xPercent: 101, duration: OUT, ease: "power3.out" },
          W.at + 0.06
        );
      }
    });

    // ---------- captions: active word gets the marker ----------
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
        tl.set(w, { backgroundColor: "#f5c518" }, W.s);
        if (k < C.words.length - 1)
          tl.set(w, { backgroundColor: "#f7f7f5" }, C.words[k + 1].s);
      });
    });

    window.__timelines["main"] = tl;
  }

  document.fonts.ready.then(build);
})();
