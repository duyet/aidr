// The AI;DR pipeline as one machine on a long bench, drawn with the anatomy kit.
// `node machine/build.mjs` writes ../assets/machine.svg and ../assets/machine.json.
// Deterministic: no randomness, no clock.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "./kit/iso-kit.mjs";
import * as G from "./kit/lathe.mjs";
import { tubePieces, tubeSvg } from "./kit/tube.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, "..", "assets");

const W = 4000;
const H = 1800;
const AZ = 57;

// World: x along the bench (left to right), y toward the viewer (0 back, 330 front), z up. Bench top at z = 0.
const BENCH = { x: -70, y: 0, w: 3790, d: 330, r: 6 };
const BENCH_T = 40;
const LEG_Z = -190;
const BELT = { x0: 620, x1: 3060, y0: 110, y1: 190, top: 68 };
const ST = {
  "st-sources": [0, 540],
  "st-fetch": [560, 1060],
  "st-dedupe": [1080, 1580],
  "st-score": [1600, 2100],
  "st-rank": [2110, 2620],
  "st-tldr": [2640, 3150],
  "st-dispatch": [3170, 3680],
};
const TOP = { "st-sources": 330, "st-fetch": 380, "st-dedupe": 240, "st-score": 340, "st-rank": 490, "st-tldr": 470, "st-dispatch": 270 };

const P = k.fitProjection(
  [...k.boxCorners(BENCH, LEG_Z - 6, 0), [0, 0, 490], [2160, 20, 490], [2830, 150, 470], [790, 60, 380]],
  W,
  H,
  { pad: 70, azimuth: AZ },
);

const at = (p) => k.iso(p, P);
const r1 = (v) => Math.round(v * 10) / 10;
const pt = (p) => at(p).map(r1);
let SOLIDS = 0;
const S = (paths, style = {}) => {
  SOLIDS++;
  return k.solidSvg(paths, style);
};
const A = (paths, style = {}) => `<g class="acc">${S(paths, { ...style, crease: style.crease ?? "lo" })}</g>`;
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const halo = (plan, z, h = 1, blur = "") => `<path class="iso-halo" d="${k.haloOf(plan, z, h, P)}"${blur ? ` style="filter:blur(${blur}px)"` : ""}/>`;
const slab = (x, y, w, d, z, h, r = 2, steps = 3, bevel = 0.6) => k.slabOf({ x, y, w, d, r }, z, h, P, steps, bevel);
const cyl = (x, y, r, z, h, steps = 32, bevel = 0) => k.cylinder(x, y, r, z, h, P, steps, bevel);
const FY = (x, y, z) => G.frameAlong([x, y, z], [0, 1, 0]);
const FX = (x, y, z) => G.frameAlong([x, y, z], [1, 0, 0]);
const FZ = (x, y, z) => G.frameAlong([x, y, z], [0, 0, 1]);
const byDepth = (list, key = (p) => p) => [...list].sort((a, b) => k.depthOf(key(a), P) - k.depthOf(key(b), P));
const screwRing = (pts, z, r = 3.2) => L(pts.map(([x, y]) => k.ring(x, y, r, z, P, 14)).join(""), { tone: "lo" }) + D(pts.map(([x, y]) => at([x, y, z])), { size: 1 });

// Ticks on a vertical face at y = yf: angle from the top, clockwise as seen from the front.
function faceTicks(cx, yf, cz, r, count, every, [minor, major], from = 0, span = Math.PI * 2) {
  const closed = Math.abs(span - Math.PI * 2) < 1e-9;
  const n = closed ? count : count + 1;
  const out = { minor: [], major: [] };
  for (let i = 0; i < n; i++) {
    const t = from + (i / count) * span;
    const big = i % every === 0;
    const inner = r - (big ? major : minor);
    const p = (rr) => [cx + rr * Math.sin(t), yf, cz + rr * Math.cos(t)];
    (big ? out.major : out.minor).push(k.segment(p(inner), p(r), P));
  }
  return { minor: out.minor.join(""), major: out.major.join("") };
}

// A needle drawn flat in its dial's plane; the animator rotates the inner group about local (0, 0).
function needle(id, cx, yf, cz, length, rest = 0) {
  const tip = length * 0.6;
  const body = `M-2.4 9L-1.2 ${-tip}L0 ${-length}L1.2 ${-tip}L2.4 9Z`;
  const tipPath = `M-1.2 ${-tip}L0 ${-length}L1.2 ${-tip}Z`;
  const svg =
    `<g transform="${k.sideMatrix([cx, yf], cz, P, "left")}">` +
    `<g id="${id}" transform="rotate(${rest})">` +
    `<circle class="needle" cx="0" cy="12" r="3.6"/><path class="needle" d="${body}"/><path class="needle-tip" d="${tipPath}"/>` +
    `<circle class="needle" cx="0" cy="0" r="4.6"/><circle class="needle-hub" cx="0" cy="0" r="1.6"/></g></g>`;
  return { svg, pivot: pt([cx, yf, cz]), matrix: k.sideMatrix([cx, yf], cz, P, "left") };
}

// A label plate lying on a top face: blank, with an inset outline, three rule lines and two screws.
function labelPlate(x, y, w, d, z) {
  const plan = { x, y, w, d, r: 1.5 };
  const rules = [0.62, 0.8, 0.46].map((share, i) => k.lineOnTop([x + 7, y + 6 + i * ((d - 12) / 2)], [x + 7 + (w - 22) * share, y + 6 + i * ((d - 12) / 2)], z + 1.2, P)).join("");
  return (
    S(k.slabOf(plan, z, 1.2, P, 3, 0.5), { tone: "mid" }) +
    L(k.planOutline(k.insetPlan(plan, 2.4), z + 1.2, P, 3), { tone: "faint" }) +
    L(rules, { tone: "lo", free: true }) +
    D([at([x + w - 6, y + 5, z + 1.2]), at([x + w - 6, y + d - 5, z + 1.2])], { size: 0.9 })
  );
}

// A blank plate standing on a front face (+y), for overlaid text.
function facePlate(x, y, w, z, h) {
  const out = S(slab(x, y, w, 3, z, h, 1.2, 2, 0.4), { tone: "mid" });
  const yf = y + 3;
  const inset = k.segment([x + 3, yf, z + 3], [x + w - 3, yf, z + 3], P) + k.segment([x + w - 3, yf, z + 3], [x + w - 3, yf, z + h - 3], P) + k.segment([x + w - 3, yf, z + h - 3], [x + 3, yf, z + h - 3], P) + k.segment([x + 3, yf, z + h - 3], [x + 3, yf, z + 3], P);
  return out + L(inset, { tone: "faint" }) + D([at([x + 6, yf, z + h / 2]), at([x + w - 6, yf, z + h / 2])], { size: 0.8 });
}

function knob(x, y, r, z, h) {
  return S(cyl(x, y, r, z, h, 28, 0.4), { tone: "mid" }) + L(k.knurl(x, y, r, z, z + h, 30, P), { tone: "lo" }) + L(k.lineOnTop([x, y], [x + r * 0.8, y + r * 0.3], z + h, P), { tone: "hi" }) + D([at([x, y, z + h])], { size: 0.9, tone: "hi" });
}

// A round housing on a vertical face that faces the viewer (+y), with a bezel, ribs and bolt dots.
function _frontDisc(x, y0, z, r, depth, tone = "mid") {
  const F = FY(x, y0, z);
  return S(G.disc(0, depth, r, F, P), { tone });
}

function bench() {
  const out = [halo(k.insetPlan(BENCH, -10), LEG_Z, 1), halo(BENCH, -BENCH_T, BENCH_T)];
  const legXs = [-30, 900, 1840, 2780, 3680];
  const legs = [];
  for (const x of legXs) for (const y of [24, 286]) legs.push([x, y]);
  out.push(S(slab(-30, 30, 3730, 14, LEG_Z + 60, 20, 2, 2, 0.4), { tone: "lo" }));
  for (const [x, y] of byDepth(legs, ([x, y]) => [x, y, 0])) {
    out.push(S(cyl(x, y + 10, 22, LEG_Z - 6, 6, 24), { tone: "lo" }));
    out.push(S(cyl(x, y + 10, 16, LEG_Z, 10, 24), { tone: "mid" }));
    out.push(S(slab(x - 16, y - 6, 32, 32, LEG_Z + 10, -BENCH_T - LEG_Z - 10, 2, 2, 0.6), { tone: "mid", inner: L([LEG_Z + 70, -90].map((z) => k.sideSeam({ x: x - 16, y: y - 6, w: 32, d: 32, r: 2 }, z, P, 2)).join(""), { tone: "faint" }) }));
    if (y > 100) out.push(D([at([x - 8, y + 26, -70]), at([x + 8, y + 26, -70]), at([x - 8, y + 26, LEG_Z + 40]), at([x + 8, y + 26, LEG_Z + 40])], { size: 1 }));
  }
  out.push(S(slab(-30, 290, 3730, 14, LEG_Z + 60, 20, 2, 2, 0.4), { tone: "lo" }));
  out.push(D(legXs.slice(0, -1).flatMap((x, i) => [x + 120, (x + legXs[i + 1]) / 2, legXs[i + 1] - 120].map((xx) => at([xx, 304, LEG_Z + 70]))), { size: 0.9 }));
  out.push(S(slab(-56, 8, 3762, 314, -BENCH_T - 26, 26, 3, 3, 0), { tone: "lo" }));
  const mods = [-70, 880, 1830, 2770, 3720];
  for (let i = 0; i < 4; i++) {
    const plan = { x: mods[i], y: 0, w: mods[i + 1] - mods[i], d: 330, r: i === 0 || i === 3 ? 6 : 0.5 };
    out.push(S(k.slabOf(plan, -BENCH_T, BENCH_T, P, 4, 1.4), { tone: "mid", inner: L(k.sideSeam(plan, -BENCH_T + 8, P, 4), { tone: "faint" }) }));
    out.push(L(k.planOutline(k.insetPlan(plan, 8), 0, P, 3), { tone: "faint" }));
    const sc = k.corners(plan, 18);
    out.push(screwRing(sc, 0, 4));
  }
  const strip = { x: -50, y: 312, w: 3750, d: 12, r: 1 };
  out.push(S(k.slabOf(strip, 0, 1, P, 2), { tone: "lo", crease: "none" }));
  const t = k.topTicks(strip.x + 10, strip.x + strip.w - 10, 10, 5, strip.y + 0.6, 1, [4, 8], P);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  out.push(D([at([strip.x + 4, strip.y + 6, 1]), at([strip.x + strip.w - 4, strip.y + 6, 1])], { size: 1 }));
  out.push(L([16, 26].map((y) => k.lineOnTop([-50, y], [3700, y], 0, P)).join(""), { tone: "faint" }));
  return out.join("");
}

function beltSegment(x0, x1, { head = false, tail = false, pedestals = [], base = 0 } = {}) {
  const out = [];
  const { y0, y1, top } = BELT;
  for (const px of pedestals) {
    out.push(S(slab(px - 14, y0 - 2, 28, y1 - y0 + 4, base, 50 - base, 2, 2, 0.5), { tone: "lo" }));
  }
  out.push(S(slab(x0, y0 - 8, x1 - x0, 8, 50, 24, 1, 2, 0.4), { tone: "mid" }));
  const bx0 = tail ? x0 + 8 : x0;
  const bx1 = head ? x1 - 8 : x1;
  const bplan = { x: bx0, y: y0, w: bx1 - bx0, d: y1 - y0, r: 0.2 };
  out.push(S(k.slabOf(bplan, top - 8, 8, P, 2), { tone: "hi", crease: "lo" }));
  const cleats = [];
  for (let x = Math.ceil((bx0 + 6) / 40) * 40; x < bx1 - 4; x += 40) cleats.push(k.lineOnTop([x, y0], [x, y1], top, P));
  out.push(L(cleats.join(""), { tone: "faint" }));
  out.push(L(k.lineOnTop([bx0, (y0 + y1) / 2], [bx1, (y0 + y1) / 2], top, P), { tone: "faint" }));
  if (tail) out.push(S(G.disc(-4, y1 - y0 + 12, 10, FY(x0 + 8, y0 - 6, top - 9), P), { tone: "mid" }), D([at([x0 + 8, y1 + 6, top - 9])], { size: 1.4, tone: "hi" }));
  if (head) out.push(S(G.disc(-4, y1 - y0 + 12, 10, FY(x1 - 8, y0 - 6, top - 9), P), { tone: "mid" }), D([at([x1 - 8, y1 + 6, top - 9])], { size: 1.4, tone: "hi" }));
  const front = { x: x0, y: y1, w: x1 - x0, d: 8, r: 1 };
  out.push(S(k.slabOf(front, 50, 24, P, 2, 0.4), { tone: "mid", inner: L(k.sideSeam(front, 58, P, 2), { tone: "faint" }) }));
  const rivets = [];
  for (let x = x0 + 20; x < x1 - 10; x += 40) rivets.push(at([x, y1 + 8, 66]));
  out.push(D(rivets, { size: 0.9 }));
  return out.join("");
}

const JSON_OUT = { stations: {}, pivots: {}, needleFrames: {}, moves: {}, hoppers: [], ports: {}, rankSlots: [] };

function sources() {
  const out = [];
  const base = { x: 20, y: 50, w: 500, d: 220, r: 8 };
  out.push(halo(base, 0, 16));
  out.push(S(k.slabOf(base, 0, 16, P, 6, 1.2), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(base, 6), 16, P, 4), { tone: "faint" }));
  out.push(screwRing(k.corners(base, 14), 16, 3.4));
  for (const x of [70, 420]) {
    out.push(S(slab(x - 6, 96, 62, 108, 16, 8, 2, 2, 0.5), { tone: "mid" }));
    out.push(S(slab(x, 102, 50, 96, 24, 96, 2, 2, 0.8), { tone: "mid", inner: L(k.sideSeam({ x, y: 102, w: 50, d: 96, r: 2 }, 60, P, 2), { tone: "faint" }) }));
    out.push(D([at([x + 8, 198, 30]), at([x + 42, 198, 30]), at([x + 8, 198, 112]), at([x + 42, 198, 112])], { size: 0.9 }));
  }
  const man = { x: 30, y: 100, w: 480, d: 100, r: 10 };
  out.push(S(k.slabOf(man, 120, 56, P, 6, 1.4), { tone: "mid", inner: L(k.sideSeam(man, 132, P, 6), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(man, 5), 176, P, 4), { tone: "faint" }));
  const bolts = [];
  for (let x = 44; x <= 496; x += 28) bolts.push(at([x, 193, 176]), at([x, 107, 176]));
  out.push(D(bolts, { size: 0.9 }));
  const HX = [70, 170, 270, 370, 470];
  for (let i = 0; i < 4; i++) {
    const cx = (HX[i] + HX[i + 1]) / 2;
    for (const dy of [-26, -10, 6, 22]) out.push(L(k.planOutline({ x: cx - 12, y: 150 + dy - 2, w: 24, d: 4, r: 2 }, 176, P, 3), { tone: "lo" }));
  }
  out.push(S(G.disc(0, 8, 34, FX(510, 150, 148), P), { tone: "mid" }));
  out.push(D(G.dotsOf(FX(510, 150, 148), 8, 27, 8, P, { all: true }), { size: 1 }));
  for (const [i, hx] of HX.entries()) {
    const F = FZ(hx, 150, 176);
    out.push(S(G.disc(0, 6, 24, F, P), { tone: "mid" }));
    out.push(D(G.dotsOf(F, 6, 20, 8, P, { all: true }), { size: 0.9 }));
    out.push(S(G.disc(6, 30, 14, F, P), { tone: "mid" }));
    out.push(L(G.arcOf(F, 18, 14, P), { tone: "faint" }));
    const KF = FY(hx, 164, 192);
    out.push(S(G.disc(0, 6, 4, KF, P), { tone: "mid" }));
    out.push(S(G.disc(6, 14, 7, KF, P), { tone: "mid" }));
    out.push(k.fadedSvg(G.ribsOf(KF, 6, 14, 7, 18, P, { fade: [0.1, 0.55] }), { tone: "lo" }));
    const cone = G.lathe([[30, 0], [30, 14], [104, 40], [104, 0]], F, P);
    out.push(S(cone, { tone: "hi", crease: "lo", inner: L(G.arcOf(F, 62, 14 + 26 * (32 / 74), P, { slope: 26 / 74 }), { tone: "faint" }) }));
    out.push(A(G.ringBand(104, 112, 34, 44, F, P)));
    out.push(`<path class="void" d="${G.circleOf(F, 112, 34, P)}"/>`);
    out.push(L(G.arcOf(F, 106, 34, P, { inward: true, least: -0.2 }), { tone: "lo" }));
    out.push(D(G.dotsOf(F, 112, 39, 14, P, { all: true }), { size: 0.9, tone: "hi" }));
    JSON_OUT.hoppers.push(pt([hx, 150, 288]));
    out.push(facePlate(hx - 30, 200, 60, 132, 34));
    void i;
  }
  out.push(labelPlate(40, 226, 120, 34, 16));
  out.push(knob(470, 240, 10, 16, 10));
  return out.join("");
}

function fetch() {
  const out = [];
  const base = { x: 750, y: 26, w: 80, d: 64, r: 4 };
  out.push(halo(base, 0, 20));
  out.push(S(k.slabOf(base, 0, 20, P, 3, 0.8), { tone: "mid" }));
  out.push(screwRing(k.corners(base, 9), 20, 3));
  out.push(S(cyl(790, 58, 18, 20, 10, 32, 0.6), { tone: "mid" }));
  out.push(S(cyl(790, 58, 10, 30, 196, 28), { tone: "mid", crease: "none", inner: L([90, 160].map((z) => k.sideArc(790, 58, 10, z, P, 16)).join(""), { tone: "faint" }) }));
  out.push(S(slab(774, 44, 32, 30, 226, 24, 2, 2, 0.6), { tone: "mid" }));
  out.push(D([at([780, 74, 238]), at([800, 74, 238])], { size: 0.9 }));
  const C = [790, 315];
  const F = FY(C[0], 66, C[1]);
  out.push(S(G.disc(0, 20, 66, F, P), { tone: "mid" }));
  out.push(k.fadedSvg(G.ribsOf(F, 2, 18, 66, 96, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }));
  out.push(S(G.ringBand(20, 26, 56, 64, F, P), { tone: "mid", crease: "lo" }));
  const yf = 86;
  out.push(L(G.circleOf(F, 20.3, 52, P), { tone: "faint" }));
  const t = faceTicks(C[0], yf, C[1], 52, 60, 5, [4, 10]);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  const half = faceTicks(C[0], yf, C[1], 52, 2, 1, [14, 14]);
  out.push(L(half.major, { tone: "hi" }));
  out.push(L(G.circleOf(F, 20.3, 30, P), { tone: "faint" }));
  const TF = FZ(C[0], 76, C[1] + 66);
  out.push(S(G.disc(-2, 8, 6, TF, P), { tone: "mid" }), S(G.disc(8, 14, 9, TF, P), { tone: "mid" }));
  out.push(k.fadedSvg(G.ribsOf(TF, 8, 14, 9, 20, P, { fade: [0.1, 0.55] }), { tone: "lo" }));
  const n = needle("needle-clock", C[0], yf + 0.6, C[1], 46, 0);
  JSON_OUT.pivots["needle-clock"] = n.pivot;
  JSON_OUT.needleFrames["needle-clock"] = n.matrix;
  out.push(n.svg);
  out.push(beltSegment(620, 1060, { tail: true, pedestals: [660, 960] }));
  const route = G.fillet([[518, 150, 148], [660, 150, 148], [660, 150, 110]], 34, 9, { P, tube: 14 });
  const pieces = tubePieces(route, 14, P, { maxLength: 400, caps: [false, false] });
  for (const piece of pieces) out.push(tubeSvg(piece, { tone: "hi" }));
  const NF = FZ(660, 150, 88);
  out.push(S(G.lathe([[0, 0], [0, 26], [8, 20], [22, 16], [22, 0]], NF, P), { tone: "mid", crease: "lo" }));
  out.push(S(G.disc(22, 28, 22, NF, P), { tone: "mid" }));
  out.push(D(G.dotsOf(NF, 28, 18, 8, P, { all: true }), { size: 0.9 }));
  out.push(S(G.disc(0, 6, 22, FX(518, 150, 148), P), { tone: "mid" }));
  out.push(S(slab(596, 214, 64, 20, 0, 34, 2, 2, 0.5), { tone: "mid" }));
  out.push(S(slab(588, 226, 80, 60, 0, 8, 2, 2, 0.5), { tone: "lo" }));
  const MF = FY(628, 204, 59);
  out.push(S(G.disc(0, 10, 18, MF, P), { tone: "mid" }));
  out.push(S(G.disc(10, 66, 26, MF, P), { tone: "mid" }));
  out.push(k.fadedSvg(G.ribsOf(MF, 14, 62, 26, 36, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }));
  out.push(S(G.solidOf([[66, 26], [72, 22, 1], [76, 14, 1]], MF, P), { tone: "mid" }));
  out.push(S(slab(612, 236, 32, 22, 85, 16, 2, 2, 0.5), { tone: "mid" }));
  out.push(D([at([616, 258, 101]), at([640, 258, 101])], { size: 0.8 }));
  for (const y of [94, 198]) out.push(S(slab(902, y, 14, 8, 50, 70, 1, 2, 0.4), { tone: "mid" }));
  out.push(S(slab(898, 90, 22, 120, 120, 12, 2, 2, 0.6), { tone: "mid" }));
  out.push(S(slab(902, 130, 14, 40, 108, 12, 1, 2, 0.4), { tone: "mid" }));
  out.push(L(k.planOutline({ x: 903, y: 96, w: 12, d: 108, r: 2 }, 132, P, 2), { tone: "faint" }));
  out.push(D([at([909, 100, 132]), at([909, 200, 132])], { size: 0.9 }));
  const box = { x: 860, y: 214, w: 120, d: 70, r: 4 };
  out.push(halo(box, 0, 46));
  out.push(S(k.slabOf(box, 0, 46, P, 3, 1), { tone: "mid", inner: L(k.sideSeam(box, 38, P, 3), { tone: "faint" }) }));
  out.push(screwRing(k.corners(box, 7), 46, 2.4));
  out.push(knob(940, 250, 11, 46, 10));
  out.push(S(cyl(895, 240, 6, 46, 4, 20), { tone: "mid" }), S(cyl(895, 240, 3.6, 50, 4, 20), { tone: "hi", crease: "lo" }));
  out.push(labelPlate(872, 258, 40, 18, 46));
  out.push(labelPlate(700, 290, 110, 22, 0));
  return out.join("");
}

function dedupe() {
  const out = [];
  const RX = [1260, 1380];
  const RZ = BELT.top + 40;
  const RR = 38;
  const cheek = { x: 1196, y: 66, w: 248, d: 18, r: 3 };
  out.push(halo(cheek, 0, 200));
  out.push(S(k.slabOf(cheek, 0, 200, P, 3, 1), { tone: "mid", inner: L(k.sideSeam(cheek, 24, P, 3), { tone: "faint" }) }));
  for (const x of RX) {
    out.push(S(G.disc(0, 10, 30, FY(x, 84, RZ), P), { tone: "mid" }));
    out.push(D(G.dotsOf(FY(x, 84, RZ), 10, 24, 6, P, { all: true }), { size: 0.9 }));
  }
  out.push(D([at([1206, 84, 190]), at([1434, 84, 190]), at([1206, 84, 12]), at([1434, 84, 12])], { size: 1 }));
  const MF = FX(1250, 75, 220);
  out.push(S(slab(1262, 62, 24, 26, 200, 6, 1, 2, 0.4), { tone: "mid" }), S(slab(1342, 62, 24, 26, 200, 6, 1, 2, 0.4), { tone: "mid" }));
  out.push(S(G.solidOf([[-10, 8, 1], [-4, 14, 1], [0, 16]], MF, P), { tone: "mid" }));
  out.push(S(G.disc(0, 120, 18, MF, P), { tone: "mid" }));
  out.push(k.fadedSvg(G.ribsOf(MF, 8, 112, 18, 36, P, { fade: [0.1, 0.55], seams: true }), { tone: "lo" }));
  out.push(S(G.disc(120, 132, 12, MF, P), { tone: "mid" }));
  out.push(S(slab(1290, 70, 34, 20, 238, 12, 2, 2, 0.4), { tone: "mid" }));
  out.push(D([at([1296, 90, 250]), at([1318, 90, 250])], { size: 0.8 }));
  out.push(beltSegment(1060, 1580, { pedestals: [1120, 1520] }));
  const guide = (ring) => S(k.extrude(ring, BELT.top, 14, P, { bevel: 0.5 }), { tone: "mid" });
  out.push(guide([[1090, 112], [1206, 132], [1206, 140], [1090, 120]]));
  const roller = (id, x) => {
    const F = FY(x, 96, RZ);
    return (
      `<g id="${id}">` +
      S(G.disc(-6, 0, 12, F, P), { tone: "mid" }) +
      S(G.disc(0, 108, RR, F, P), { tone: "hi", crease: "lo" }) +
      k.fadedSvg(G.ribsOf(F, 2, 106, RR, 48, P, { fade: [0.08, 0.5], seams: true }), { tone: "lo" }) +
      `</g>`
    );
  };
  out.push(roller("roller-a", RX[0]));
  out.push(roller("roller-b", RX[1]));
  out.push(guide([[1090, 188], [1206, 168], [1206, 160], [1090, 180]]));
  for (const x of [1196, 1424]) out.push(S(slab(x, 212, 20, 18, 0, 200, 2, 2, 0.8), { tone: "mid" }));
  const beam = { x: 1196, y: 208, w: 248, d: 24, r: 3 };
  out.push(S(k.slabOf(beam, 200, 22, P, 3, 1), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(beam, 4), 222, P, 3), { tone: "faint" }));
  for (const x of RX) {
    const HF = FY(x, 204, RZ);
    out.push(S(slab(x - 7, 210, 14, 12, RZ + 26, 200 - RZ - 26, 1, 2, 0.3), { tone: "mid" }));
    out.push(S(G.disc(0, 8, 32, HF, P), { tone: "mid" }));
    out.push(A(G.disc(8, 18, 24, HF, P)));
    out.push(D(G.dotsOf(HF, 18, 18, 6, P, { all: true }), { size: 1, tone: "hi" }));
    out.push(S(G.disc(18, 24, 8, HF, P), { tone: "mid" }));
    out.push(S(cyl(x, 220, 6, 222, 22, 20), { tone: "mid", crease: "none" }));
    out.push(S(cyl(x, 220, 12, 236, 6, 6), { tone: "mid" }));
    out.push(knob(x, 220, 26, 244, 8));
  }
  out.push(S(slab(1470, 98, 14, 8, BELT.top, 52, 1, 2, 0.4), { tone: "mid" }));
  out.push(S(slab(1470, 192, 14, 8, BELT.top, 52, 1, 2, 0.4), { tone: "mid" }));
  out.push(S(slab(1466, 96, 22, 106, BELT.top + 52, 12, 2, 2, 0.6), { tone: "mid" }));
  out.push(L(k.planOutline({ x: 1471, y: 120, w: 12, d: 60, r: 3 }, BELT.top + 64, P, 3), { tone: "lo" }));
  out.push(labelPlate(1240, 266, 120, 34, 0));
  return out.join("");
}

function score() {
  const out = [];
  const CX = 1830;
  const base = { x: 1786, y: 22, w: 92, d: 72, r: 4 };
  out.push(halo(base, 0, 34));
  out.push(S(k.slabOf(base, 0, 14, P, 4, 0.8), { tone: "mid" }));
  out.push(S(k.slabOf(k.insetPlan(base, 2), 14, 22, P, 4, 0.8), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(base, 6), 36, P, 3), { tone: "faint" }));
  out.push(knob(1862, 76, 9, 36, 8));
  out.push(S(cyl(CX, 52, 18, 36, 8, 28), { tone: "mid" }));
  out.push(S(cyl(CX, 52, 11, 44, 282, 28), { tone: "mid", crease: "none", inner: L([110, 200].map((z) => k.sideArc(CX, 52, 11, z, P, 16)).join(""), { tone: "faint" }) }));
  out.push(S(cyl(CX, 52, 13, 326, 6, 28), { tone: "mid" }));
  out.push(S(slab(CX - 18, 34, 36, 36, 280, 32, 3, 3, 0.8), { tone: "mid" }));
  out.push(S(slab(CX - 3, 70, 6, 6, 290, 10, 1, 2), { tone: "mid", crease: "none" }));
  out.push(knob(CX, 81, 7, 287, 14));
  out.push(S(slab(CX - 10, 60, 20, 84, 288, 16, 3, 3, 0.6), { tone: "mid" }));
  out.push(D([at([CX, 80, 304]), at([CX, 130, 304])], { size: 0.9 }));
  // dial housing, face at y = 172, centre z = 236
  const DZ = 236;
  const F = FY(CX, 144, DZ);
  out.push(S(slab(CX - 8, 136, 16, 10, 278, 12, 2, 2, 0.4), { tone: "mid" }));
  out.push(S(G.disc(0, 22, 52, F, P), { tone: "mid" }));
  out.push(k.fadedSvg(G.ribsOf(F, 14, 22, 52, 110, P, { fade: [0.1, 0.55], seams: "first" }), { tone: "lo" }));
  out.push(S(G.ringBand(22, 28, 44, 50, F, P), { tone: "mid", crease: "lo" }));
  const yf = 166;
  const t = faceTicks(CX, yf, DZ, 42, 100, 10, [3, 8]);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  out.push(L(G.circleOf(FY(CX, yf, DZ + 18), 0, 9, P), { tone: "lo" }));
  const sub = faceTicks(CX, yf, DZ + 18, 9, 10, 5, [2, 3.5]);
  out.push(L(sub.minor + sub.major, { tone: "lo" }));
  const KF = FX(CX + 52, 155, DZ);
  out.push(S(G.disc(0, 8, 5, KF, P), { tone: "mid" }), S(G.disc(8, 16, 8, KF, P), { tone: "mid" }));
  out.push(k.fadedSvg(G.ribsOf(KF, 8, 16, 8, 18, P, { fade: [0.1, 0.55] }), { tone: "lo" }));
  const n = needle("needle-score", CX, yf + 0.6, DZ, 38, 0);
  JSON_OUT.pivots["needle-score"] = n.pivot;
  JSON_OUT.needleFrames["needle-score"] = n.matrix;
  out.push(beltSegment(1580, 2100, { pedestals: [1640, 2040] }));
  const SF = FZ(CX, 155, 0);
  out.push(S(G.disc(DZ - 52 - 18, DZ - 50, 9, SF, P), { tone: "mid" }));
  out.push(L(G.arcOf(SF, DZ - 60, 9, P), { tone: "faint" }));
  const stroke = 14;
  out.push(
    `<g id="plunger-score">` +
      S(G.disc(96, DZ - 70, 3.6, SF, P), { tone: "mid", crease: "none" }) +
      S(G.disc(86, 96, 8, SF, P), { tone: "mid" }) +
      A(G.lathe([[78, 0], [78, 5, 1], [80, 7.6, 1], [83, 8, 1], [86, 8]], SF, P)) +
      `</g>`,
  );
  JSON_OUT.moves["plunger-score"] = k.axisVector(P, [0, 0, -stroke]).map(r1);
  out.push(n.svg);
  const box = { x: 1900, y: 220, w: 110, d: 64, r: 4 };
  out.push(halo(box, 0, 40));
  out.push(S(k.slabOf(box, 0, 40, P, 3, 1), { tone: "mid", inner: L(k.sideSeam(box, 32, P, 3), { tone: "faint" }) }));
  for (let i = 0; i < 3; i++) out.push(L(k.planOutline({ x: 1918 + i * 24, y: 236, w: 18, d: 26, r: 2 }, 40, P, 2), { tone: "lo" }));
  out.push(screwRing(k.corners(box, 7), 40, 2.2));
  out.push(knob(1990, 270, 7, 40, 8));
  out.push(labelPlate(1700, 266, 120, 34, 0));
  return out.join("");
}

function rank() {
  const out = [];
  const X0 = 2170;
  const X1 = 2560;
  const PITCH = 22;
  const Z0 = 80;
  const base = { x: X0 - 20, y: 10, w: X1 - X0 + 40, d: 96, r: 4 };
  out.push(halo(base, 0, 470));
  out.push(S(k.slabOf(base, 0, 12, P, 3, 1), { tone: "mid" }));
  out.push(screwRing(k.corners(base, 10), 12, 3));
  out.push(S(slab(X0 + 20, 14, X1 - X0 - 20, 6, 12, 452, 1, 2, 0.4), { tone: "mid" }));
  const perf = [];
  for (let z = 40; z < 74; z += 8) for (let x = X0 + 40; x < X1 - 10; x += 12) perf.push(at([x, 20, z]));
  out.push(D(perf, { size: 1, tone: "lo" }));
  const upright = (x) => S(slab(x, 14, 20, 24, 12, 466, 2, 2, 0.8), { tone: "mid", inner: L([40, 460].map((z) => k.sideSeam({ x, y: 14, w: 20, d: 24, r: 2 }, z, P, 2)).join(""), { tone: "faint" }) });
  out.push(upright(X0));
  for (const x of []) {
    out.push(S(slab(x, 14, 20, 24, 12, 466, 2, 2, 0.8), { tone: "mid", inner: L([40, 460].map((z) => k.sideSeam({ x, y: 14, w: 20, d: 24, r: 2 }, z, P, 2)).join(""), { tone: "faint" }) }));
  }
  // 16 trays, bottom to top (slot 16 lowest)
  const slots = [];
  for (let i = 0; i < 16; i++) {
    const z = Z0 + i * PITCH;
    const tray = { x: X0 + 20, y: 20, w: X1 - X0 - 20, d: 60, r: 1 };
    out.push(S(k.slabOf(tray, z, 3, P, 2), { tone: "mid", crease: "lo" }));
    const lip = { x: X0 + 20, y: 80, w: X1 - X0 - 20, d: 4, r: 0.5 };
    const lipTone = { tone: "mid" };
    out.push(S(k.slabOf(lip, z, 11, P, 2, 0.3), lipTone));
    const ticks = k.sideTicks(X0 + 40, X1 - 30, 10, 5, 84, z + 11, [3, 6], P, "x");
    out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
    out.push(S(slab(X0 + 26, 84, 22, 2, z + 1, 9, 0.5, 2), { tone: "hi", crease: "lo" }));
    slots.push(pt([(X0 + X1 + 20) / 2, 84, z + 6]));
  }
  JSON_OUT.rankSlots = slots.reverse();
  out.push(upright(X1));
  out.push(S(slab(X0 - 6, 10, X1 - X0 + 32, 32, 478, 12, 3, 3, 1), { tone: "mid" }));
  out.push(screwRing([[X0 + 10, 26], [X1 + 10, 26]], 490, 3));
  // guide rails in front of the uprights and the carriage (moves up one slot per step)
  for (const x of [X0 - 14, X1 + 18]) {
    out.push(S(slab(x, 40, 16, 46, 12, 10, 1, 2, 0.4), { tone: "mid" }));
    out.push(S(cyl(x + 8, 92, 6, 12, 466, 20), { tone: "hi", crease: "none" }));
  }
  const cz = Z0 - 6;
  const cplan = { x: X0 - 6, y: 84, w: X1 - X0 + 32, d: 16, r: 2 };
  out.push(
    `<g id="rank-carriage">` +
      S(cyl(X0 + 2, 92, 11, cz - 4, 24, 24), { tone: "mid" }) +
      S(k.slabOf(cplan, cz, 14, P, 3, 0.8), { tone: "mid" }) +
      A(slab(X0 + 120, 98, 150, 6, cz + 2, 10, 1, 2, 0.4)) +
      D([at([X0 + 20, 100, cz + 14]), at([X1 - 4, 100, cz + 14])], { size: 1 }) +
      S(cyl(X1 + 26, 92, 11, cz - 4, 24, 24), { tone: "mid" }) +
      `</g>`,
  );
  JSON_OUT.moves["rank-carriage"] = k.axisVector(P, [0, 0, PITCH]).map(r1);
  out.push(beltSegment(2100, 2620, { pedestals: [2150, 2580] }));
  const bracket = { x: 2330, y: 228, w: 60, d: 70, r: 3 };
  out.push(halo(bracket, 0, 60));
  out.push(S(k.slabOf(bracket, 0, 66, P, 3, 0.8), { tone: "mid", inner: L(k.sideSeam(bracket, 12, P, 3), { tone: "faint" }) }));
  const PF = FY(2360, 300, 82);
  const back = G.frameAlong([2360, 300, 82], [0, -1, 0]);
  out.push(S(G.disc(0, 6, 18, back, P), { tone: "mid" }));
  out.push(S(G.disc(6, 70, 14, back, P), { tone: "mid", crease: "lo" }));
  out.push(S(G.disc(70, 76, 18, back, P), { tone: "mid" }));
  out.push(S(G.disc(76, 96, 4, back, P), { tone: "hi", crease: "none" }));
  out.push(S(slab(2330, 198, 60, 8, 72, 22, 1, 2, 0.4), { tone: "mid" }));
  void PF;
  out.push(labelPlate(2180, 266, 120, 34, 0));
  return out.join("");
}

function tldr() {
  const out = [];
  const CX = [2720, 2940];
  const CY = [62, 238];
  const base = { x: 2680, y: 30, w: 300, d: 240, r: 6 };
  out.push(halo(base, 0, 20));
  out.push(S(k.slabOf(base, 0, 20, P, 4, 1.2), { tone: "mid", inner: L(k.sideSeam(base, 8, P, 4), { tone: "faint" }) }));
  out.push(screwRing(k.corners(base, 14), 20, 3.6));
  const col = (x, y, z0, z1) => S(cyl(x, y, 13, z0, z1 - z0, 28), { tone: "mid", crease: "none" });
  for (const x of CX) out.push(S(cyl(x, CY[0], 22, 20, 10, 6), { tone: "mid" }), col(x, CY[0], 30, 340));
  out.push(beltSegment(2620, 3060, { head: true, pedestals: [2680, 3020], base: 0 }));
  out.push(S(slab(3066, 100, 70, 112, 0, 46, 2, 2, 0.6), { tone: "mid" }));
  out.push(S(slab(3062, 96, 80, 120, 46, 6, 2, 2, 0.6), { tone: "mid" }));
  out.push(A(slab(3074, 104, 58, 48, 52, 4, 1.5, 2, 0.5)));
  out.push(A(slab(3074, 160, 58, 48, 52, 4, 1.5, 2, 0.5)));
  out.push(L(k.planOutline({ x: 3080, y: 110, w: 46, d: 36, r: 1 }, 56, P, 2) + k.planOutline({ x: 3080, y: 166, w: 46, d: 36, r: 1 }, 56, P, 2), { tone: "mid" }));
  for (const x of CX) out.push(S(cyl(x, CY[1], 22, 20, 10, 6), { tone: "mid" }), col(x, CY[1], 30, 214));
  // ram (moves down by the stroke)
  const RZ = 214;
  const ram = { x: 2706, y: 72, w: 248, d: 156, r: 4 };
  let ramSvg = "";
  ramSvg += A(slab(2760, 92, 140, 52, RZ - 20, 20, 2, 2, 0.6));
  ramSvg += A(slab(2760, 156, 140, 52, RZ - 20, 20, 2, 2, 0.6));
  for (const x of CX) ramSvg += S(cyl(x, CY[0], 22, RZ, 56, 28, 0.6), { tone: "mid" });
  ramSvg += S(k.slabOf(ram, RZ, 56, P, 4, 1.2), { tone: "mid", inner: L(k.sideSeam(ram, RZ + 10, P, 4), { tone: "faint" }) });
  const ribs = [];
  for (let x = 2760; x <= 2900; x += 28) ribs.push(k.segment([x, 228, RZ], [x, 228, RZ + 56], P));
  ramSvg += L(ribs.join(""), { tone: "faint" });
  ramSvg += screwRing([[2760, 100], [2900, 100], [2760, 200], [2900, 200]], RZ + 56, 4);
  for (const x of CX) ramSvg += S(cyl(x, CY[1], 22, RZ, 56, 28, 0.6), { tone: "mid" });
  out.push(`<g id="ram-tldr">${ramSvg}</g>`);
  JSON_OUT.moves["ram-tldr"] = k.axisVector(P, [0, 0, -60]).map(r1);
  for (const x of CX) out.push(col(x, CY[1], 270, 340));
  const crown = { x: 2690, y: 40, w: 280, d: 220, r: 6 };
  out.push(S(k.slabOf(crown, 340, 46, P, 4, 1.4), { tone: "mid", inner: L(k.sideSeam(crown, 352, P, 4), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(crown, 8), 386, P, 3), { tone: "faint" }));
  for (const [x, y] of byDepth([[CX[0], CY[0]], [CX[1], CY[0]], [CX[0], CY[1]], [CX[1], CY[1]]], ([x, y]) => [x, y, 0])) {
    out.push(S(cyl(x, y, 22, 386, 12, 6), { tone: "mid" }), S(cyl(x, y, 9, 398, 6, 20), { tone: "mid" }));
  }
  const CF = FZ(2830, 150, 386);
  out.push(S(G.disc(0, 10, 66, CF, P), { tone: "mid" }));
  out.push(D(G.dotsOf(CF, 10, 60, 16, P, { all: true }), { size: 1 }));
  out.push(S(G.disc(10, 72, 54, CF, P), { tone: "mid", crease: "lo", inner: L([30, 52].map((s) => G.arcOf(CF, s, 54, P)).join(""), { tone: "faint" }) }));
  out.push(S(G.disc(72, 80, 60, CF, P), { tone: "mid" }));
  out.push(D(G.dotsOf(CF, 80, 54, 16, P, { all: true }), { size: 1 }));
  out.push(S(G.disc(80, 86, 18, CF, P), { tone: "mid" }));
  const GF = FY(2830, 150 + 54, 386 + 44);
  out.push(S(G.disc(-4, 4, 4, GF, P), { tone: "mid" }));
  out.push(S(G.disc(4, 12, 16, GF, P), { tone: "mid" }));
  out.push(S(G.ringBand(12, 14, 13, 16, GF, P), { tone: "mid" }));
  const gt = faceTicks(2830, 150 + 54 + 12.2, 430, 13, 20, 5, [2, 4], -2.3, 4.6);
  out.push(L(gt.minor, { tone: "lo" }), L(gt.major, { tone: "mid" }));
  out.push(L(k.segment([2830, 216.4, 430], [2830 + 9 * Math.sin(1), 216.4, 430 + 9 * Math.cos(1)], P), { tone: "hi", free: "end" }));
  out.push(labelPlate(2700, 282, 120, 30, 0));
  return out.join("");
}

function dispatch() {
  const out = [];
  const HY = 104;
  const HZ = 176;
  const HR = 26;
  const F = FX(3200, HY, HZ);
  for (const x of [3240, 3560]) {
    const st = { x: x - 18, y: HY - 26, w: 36, d: 52, r: 2 };
    out.push(halo(st, 0, 140));
    out.push(S(slab(x - 28, HY - 34, 56, 68, 0, 10, 2, 2, 0.6), { tone: "mid" }));
    out.push(S(k.slabOf(st, 10, HZ - HR - 14, P, 2, 0.8), { tone: "mid" }));
    out.push(S(slab(x - 22, HY - 30, 44, 60, HZ - HR - 4, 6, 2, 2, 0.6), { tone: "mid" }));
    out.push(screwRing([[x - 22, HY + 24], [x + 22, HY + 24]], 10, 3));
  }
  out.push(S(G.solidOf([[-24, 0.1, 1], [-20, 14, 1], [-14, 22, 1], [-8, 26]], F, P), { tone: "mid" }));
  out.push(S(G.disc(-8, 0, 34, F, P), { tone: "mid" }));
  out.push(D(G.dotsOf(F, -8, 30, 10, P, { fade: [0.04, 0.42] }), { size: 0.9 }));
  out.push(S(G.disc(0, 400, HR, F, P), { tone: "hi", crease: "lo", inner: L([100, 200, 300].map((s) => G.arcOf(F, s, HR, P)).join(""), { tone: "faint" }) }));
  out.push(S(G.disc(400, 408, 34, F, P), { tone: "mid" }));
  out.push(D(G.dotsOf(F, 408, 30, 10, P, { all: true }), { size: 0.9 }));
  out.push(S(G.solidOf([[408, 26], [414, 22, 1], [420, 14, 1], [424, 0.1, 1]], F, P), { tone: "mid" }));
  const IF = FZ(3226, HY, HZ + HR - 4);
  out.push(S(G.disc(0, 14, 12, IF, P), { tone: "mid" }));
  out.push(S(G.lathe([[14, 0], [14, 12], [52, 32], [52, 0]], IF, P), { tone: "hi", crease: "lo" }));
  out.push(S(G.ringBand(52, 58, 28, 34, IF, P), { tone: "mid" }));
  out.push(`<path class="void" d="${G.circleOf(IF, 58, 28, P)}"/>`);
  const GF = FZ(3560, HY, HZ + HR - 2);
  out.push(S(G.disc(0, 12, 5, GF, P), { tone: "mid" }), S(G.disc(12, 20, 16, GF, P), { tone: "mid" }));
  const gt = k.radialTicks(3560, HY, 13, 20, 5, HZ + HR + 18.2, [1.6, 3.4], P, -2.3, 4.6);
  out.push(L(gt.minor, { tone: "lo" }), L(gt.major, { tone: "mid" }));
  out.push(L(k.lineOnTop([3560, HY], [3560 + 9 * Math.sin(0.8), HY - 9 * Math.cos(0.8)], HZ + HR + 18.4, P), { tone: "hi", free: "end" }));
  const names = ["web", "email", "telegram", "facebook", "youtube"];
  const XS = [3270, 3350, 3430, 3510, 3590];
  names.forEach((name, i) => {
    const x = XS[i];
    const out2 = [];
    const BF = FY(x, HY, HZ);
    out2.push(S(G.disc(HR - 4, HR + 10, 15, BF, P), { tone: "mid" }));
    out2.push(S(G.disc(HR + 10, HR + 14, 18, BF, P), { tone: "mid" }));
    const pz = 96;
    const route = G.fillet([[x, HY + HR + 14, HZ], [x, 214, HZ], [x, 214, pz], [x, 262, pz]], 24, 9, { P, tube: 9 });
    const pieces = tubePieces(route, 9, P, { maxLength: 60, caps: [false, false] });
    for (const piece of byDepth(pieces, (p) => p.mid)) out2.push(tubeSvg(piece, { tone: "hi" }));
    const CF = FZ(x, 214, 140);
    out2.push(S(G.disc(0, 6, 12, CF, P), { tone: "mid" }));
    const PF = FY(x, 290, pz);
    let port = "";
    const stand = { x: x - 26, y: 258, w: 52, d: 36, r: 2 };
    port += halo(stand, 0, 60);
    port += S(k.slabOf(stand, 0, pz - 30, P, 2, 0.6), { tone: "mid", inner: L(k.sideSeam(stand, 12, P, 2), { tone: "faint" }) });
    port += S(slab(x - 28, 262, 56, 28, pz - 30, 60, 2, 2, 0.8), { tone: "mid" });
    port += D([at([x - 23, 290, pz - 25]), at([x + 23, 290, pz - 25]), at([x - 23, 290, pz + 25]), at([x + 23, 290, pz + 25])], { size: 1 });
    port += A(G.disc(0, 10, 21, PF, P));
    port += D(G.dotsOf(PF, 10, 17, 6, P, { all: true }), { size: 1, tone: "hi" });
    port += `<path class="void" d="${G.circleOf(PF, 10, 11, P)}"/>`;
    out2.push(`<g id="port-${name}">${port}</g>`);
    JSON_OUT.ports[name] = pt([x, 300, pz]);
    out.push(out2.join(""));
  });
  out.push(labelPlate(3190, 270, 60, 30, 0));
  return out.join("");
}

const groups = [
  ["st-sources", sources],
  ["st-fetch", fetch],
  ["st-dedupe", dedupe],
  ["st-score", score],
  ["st-rank", rank],
  ["st-tldr", tldr],
  ["st-dispatch", dispatch],
];
const body = [`<g id="bench">${bench()}</g>`];
for (const [id, fn] of groups) body.push(`<g id="${id}">${fn()}</g>`);

for (const [id, [x0, x1]] of Object.entries(ST)) {
  const pts = k.boxCorners({ x: x0, y: 0, w: x1 - x0, d: 330 }, 0, TOP[id]).map(at);
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const bx = Math.min(...xs);
  const by = Math.min(...ys);
  const bw = Math.max(...xs) - bx;
  const bh = Math.max(...ys) - by;
  JSON_OUT.stations[id] = { center: [r1(bx + bw / 2), r1(by + bh / 2)], bbox: [r1(bx), r1(by), r1(bw), r1(bh)] };
}
const belt = [];
for (let i = 0; i <= 12; i++) belt.push(pt([640 + i * 200, (BELT.y0 + BELT.y1) / 2, BELT.top]));
JSON_OUT.belt = belt;

const CSS = `
.iso[data-theme="light"]{--anatomy-paper:#F7F7F5;--anatomy-face:#FFFFFF;--anatomy-top:#FDFDFB;--anatomy-shade-0:#D3D3CE;--anatomy-shade-1:#DFDFDA;--anatomy-shade-2:#E9E9E5;--anatomy-shade-3:#F1F1EE;--anatomy-lit-top:#FFFFFF;--anatomy-lit-shade:#ECECE8;--anatomy-hi:#0A0A0A;--anatomy-mid:#55554F;--anatomy-lo:#94948E;--anatomy-faint:#C3C3BD;--anatomy-lit:#0A0A0A;--anatomy-halo:#5A5A52;--anatomy-halo-opacity:.26;--anatomy-dot:#0A0A0A}
.iso-svg{background:transparent}
.iso-svg path,.iso-svg circle{vector-effect:none}
.iso-line{stroke-width:.8}
.iso-edge{stroke-width:1.1}
.tb-edge{stroke-width:1}
.iso-halo{filter:blur(16px)}
.iso-dots circle{opacity:.5}
.acc{--anatomy-paper:#F5C518;--anatomy-face:#F5C518;--anatomy-top:#F7CF3D;--anatomy-shade-0:#C89C0A;--anatomy-shade-1:#D6A90D;--anatomy-shade-2:#E4B511;--anatomy-shade-3:#EFBF15}
.acc .iso-edge,.acc .iso-crease{stroke:#0A0A0A}
.void{fill:#3A3A36;stroke:#0A0A0A;stroke-width:.8}
.needle{fill:#0A0A0A}
.needle-tip{fill:#F5C518;stroke:#0A0A0A;stroke-width:.5;stroke-linejoin:round}
.needle-hub{fill:#F5C518}
`;
const svg =
  `<svg xmlns="http://www.w3.org/2000/svg" class="iso-svg iso" data-theme="light" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="The AI;DR news pipeline as one machine on a long bench: an intake bank of five hoppers, a feed conveyor with a clock dial, a two-roller dedupe press, a dial-indicator scoring station, a sixteen-tray ranking rack, a twin stamping press for the English and Vietnamese editions, and a distribution manifold with five output ports.">` +
  `<style>${k.ISO_CSS}${CSS}</style>${body.join("")}</svg>`;

JSON_OUT.viewBox = [W, H];
JSON_OUT.notes = {
  needles: "needle-clock and needle-score are drawn flat in their dial's plane: the parent <g> carries the face matrix (needleFrames). Set transform=rotate(deg) on the needle group itself; 0 points at 12 o'clock, positive is clockwise. pivots are the screen points of the hubs.",
  moves: "Screen vectors in viewBox units. ram-tldr: full press stroke down. plunger-score: stroke down onto a card. rank-carriage: one slot step up (rest is at slot 16, the bottom tray).",
  rankSlots: "Index 0 is slot 1 (top tray), index 15 is slot 16 (bottom tray); each point is the centre of the tray's front lip.",
  rollers: "roller-a and roller-b are static groups (rotation about the world y axis cannot be a screen transform).",
};
const ordered = { viewBox: JSON_OUT.viewBox, stations: JSON_OUT.stations, pivots: JSON_OUT.pivots, needleFrames: JSON_OUT.needleFrames, moves: JSON_OUT.moves, belt: JSON_OUT.belt, hoppers: JSON_OUT.hoppers, ports: JSON_OUT.ports, rankSlots: JSON_OUT.rankSlots, solids: SOLIDS, notes: JSON_OUT.notes };

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "machine.svg"), svg);
writeFileSync(join(OUT, "machine.json"), `${JSON.stringify(ordered, null, 2)}\n`);
console.log(`scale ${P.scale.toFixed(3)} k ${G.scaleOf(P).toFixed(3)} solids ${SOLIDS} svg ${(svg.length / 1024).toFixed(0)} KB`);
for (const [id, s] of Object.entries(JSON_OUT.stations)) console.log(id, s.bbox.join(" "));
