// node --test videos/daily-news/scripts/*.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const ROOT = resolve(import.meta.dirname, "..");
const css = readFileSync(join(ROOT, "template/style.css"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  ""
);
const motion = readFileSync(join(ROOT, "template/motion.js"), "utf8");
const { formats } = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
const LAYOUTS = ["split", "stat", "full"];
// build.mjs throws on a `full` story with no image, so only these layouts can show the paper card.
const PAPER_LAYOUTS = ["split", "stat"];

// Declarations of every rule whose selector list contains exactly `selector`, later rules winning.
const decls = (selector) => {
  const out = {};
  for (const [, sel, body] of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!sel.split(",").some((s) => s.trim() === selector)) continue;
    for (const d of body.split(";")) {
      const k = d.indexOf(":");
      if (k > 0) out[d.slice(0, k).trim()] = d.slice(k + 1).trim();
    }
  }
  return out;
};

// Every story's .cam pushes in linearly over the story, so the last frame is the largest.
const push = Number(
  /\$\("\.cam", sc\),\s*\{ scale: 1 \},\s*\{ scale: ([\d.]+)/.exec(motion)[1]
);

// Lengths, boxes and the camera push in one format's frame, read from its `.f-<fmt>` variables.
const frame = (fmt) => {
  const FRAME = { w: formats[fmt].width, h: formats[fmt].height };
  const vars = decls(`.f-${fmt}`);
  const px = (v, full) => {
    const m = /^var\((--[\w-]+)\)$/.exec(v);
    if (m) return px(vars[m[1]], full);
    if (v.endsWith("%")) return (Number.parseFloat(v) / 100) * full;
    assert.match(v, /^-?[\d.]+px$/, `unsupported length ${v}`);
    return Number.parseFloat(v);
  };
  // The box an absolutely placed element gets from its base rule plus this format's rule for one layout.
  const rect = (base, layout) => {
    const d = { ...decls(base), ...decls(`.f-${fmt} .l-${layout} ${base}`) };
    const w = px(d.width, FRAME.w);
    const h = px(d.height, FRAME.h);
    const x =
      d.left !== undefined && d.left !== "auto"
        ? px(d.left, FRAME.w)
        : FRAME.w - px(d.right, FRAME.w) - w;
    return { x, y: px(d.top, FRAME.h), w, h };
  };
  const camOrigin = decls(".cam")["transform-origin"].split(/\s+/);
  const origin = {
    x: px(camOrigin[0], FRAME.w),
    y: px(camOrigin[1], FRAME.h),
  };
  const pushed = (r, s) => ({
    x: origin.x + (r.x - origin.x) * s,
    y: origin.y + (r.y - origin.y) * s,
    w: r.w * s,
    h: r.h * s,
  });
  return { FRAME, vars, px, rect, pushed };
};

const overlap = (a, b) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const show = (r) =>
  `x ${r.x.toFixed(1)} y ${r.y.toFixed(1)} w ${r.w.toFixed(1)} h ${r.h.toFixed(1)}`;

for (const fmt of Object.keys(formats)) {
  const { FRAME, vars, px, rect, pushed } = frame(fmt);
  const name = fmt.replace("x", ":");

  test(`${name} rank box stays clear of the top bar and logo through the camera push`, () => {
    assert.ok(push > 1, `story camera push ${push}`);
    const pad = px(vars["--pad"]);
    const bar = {
      x: pad,
      y: px(vars["--bar-top"]),
      w: FRAME.w - 2 * pad,
      h: px(vars["--bar-h"]),
    };
    for (const layout of LAYOUTS)
      for (const s of [1, push]) {
        const rank = pushed(rect(".rank", layout), s);
        assert.ok(
          !overlap(rank, bar),
          `${layout} at scale ${s}: rank ${show(rank)} overlaps bar ${show(bar)}`
        );
      }
  });

  test(`${name} rank box stays clear of the paper card's venue and title through the camera push`, () => {
    const [padTop, padX] = decls(".paper")
      .padding.split(/\s+/)
      .map((v) => px(v));
    const venueSize = px(decls(".paper .venue")["font-size"]);
    // The venue is a short domain ("arxiv.org") on a ~1.2 line, so only its first 6em is certain to
    // hold text. It can also be empty (10-10 story 6), and the empty div collapses, so the title can
    // start right at the padding plus its margin and run the card's full width.
    const venueLine = venueSize * 1.2;
    const titleTop = padTop + px(decls(".paper .ptitle")["margin-top"]);
    for (const layout of PAPER_LAYOUTS) {
      const media = rect(".media", layout);
      const text = {
        venue: {
          x: media.x + padX,
          y: media.y + padTop,
          w: venueSize * 6,
          h: venueLine,
        },
        title: {
          x: media.x + padX,
          y: media.y + titleTop,
          w: media.w - 2 * padX,
          h: FRAME.h,
        },
      };
      for (const s of [1, push])
        for (const [part, r] of Object.entries(text)) {
          const rank = pushed(rect(".rank", layout), s);
          const t = pushed(r, s);
          assert.ok(
            !overlap(rank, t),
            `${layout} at scale ${s}: rank ${show(rank)} overlaps the paper ${part} ${show(t)}`
          );
        }
    }
  });
}
