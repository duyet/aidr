import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Builds public/how-it-works.html, the interactive figure on /about.
//   node apps/web/scripts/how-it-works/build.mjs           -> public/how-it-works.html
//   node apps/web/scripts/how-it-works/build.mjs --preview  -> standalone dark + light pages here
// kit/iso-kit.mjs is the isometric drawing kit from the "anatomy" skill, vendored.
import * as k from "./kit/iso-kit.mjs";
import * as M from "./model.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const kitScript = () =>
  readFileSync(join(HERE, "kit/iso-kit.mjs"), "utf8").replace(/^export /gm, "");
const theme = process.argv.includes("--light") ? "light" : "dark";
const WIDTH = 760,
  HEIGHT = 320;

// World plan (x along the line, y toward the front, z up).
const PLATE = { x: -280, y: -62, w: 560, d: 124, r: 9 };
const PLATE_H = 12,
  FOOT_H = 5;
const BELT = { x: -206, y: -8, w: 150, d: 16, r: 2 };
const BELT_Z = 7,
  BELT_TOP = 11;
const HOP = [-224, 0];
const GANTRY_X = -132;
const DIAL_R = 13,
  DIAL_TOP = 56;
const RACK = { x: -48, y: -22, w: 176, d: 34, r: 2 };
const RACK_TOP = 6;
const SLOT = 8.4,
  BAR_W = 6.2,
  BAR_D = 18,
  BAR_Y = -14;
const slotX = (i) => RACK.x + 4 + i * SLOT;
const GATE_X = slotX(M.TLDR_MAX) - (SLOT - BAR_W) / 2 - 0.2;
const PRESS = { x: 150, y: -24, w: 52, d: 48, r: 3 };
const OUT_X = [226, 246, 266];
const CLOCK = [-246, 38];
const RULER = { x: -60, y: 44, w: 330, d: 8, r: 1 };
const HOURS = 30;
const hourX = (t) => RULER.x + 6 + (t / HOURS) * (RULER.w - 12);

const P = k.fitProjection(
  [
    ...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
    [RACK.x, RACK.y, 84],
    [PRESS.x, PRESS.y, 116],
    [HOP[0], HOP[1], 58],
  ],
  WIDTH,
  HEIGHT,
  { pad: 22, azimuth: 71 }
);
const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (pts, style) => k.dotsSvg(pts, style);
const slab = (plan, z, h, steps = 3, bevel = 0.5) =>
  k.slabOf(plan, z, h, P, steps, bevel);
const cyl = (x, y, r, z, h, steps = 28, bevel = 0) =>
  k.cylinder(x, y, r, z, h, P, steps, bevel);
const depth = ([x, y]) => k.depthOf([x, y, 0], P);
const byDepth = (pts) => [...pts].sort((a, b) => depth(a) - depth(b));
const screw = (x, y, z) =>
  L(k.ring(x, y, 1.6, z, P, 14), { tone: "lo" }) +
  D([at([x, y, z])], { size: 0.45 });

function plate() {
  const out = [
    `<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`,
  ];
  for (const [x, y] of byDepth(k.corners(PLATE, 24))) {
    out.push(S(cyl(x, y, 8, -PLATE_H - FOOT_H, 1.6), { tone: "lo" }));
    out.push(
      S(cyl(x, y, 6, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6), { tone: "mid" })
    );
  }
  out.push(
    S(slab(PLATE, -PLATE_H, PLATE_H, 8, 1.6), {
      tone: "mid",
      inner: k.sideSeam(PLATE, -5, P),
    })
  );
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  out.push(
    k
      .corners(PLATE, 11)
      .map(([x, y]) => screw(x, y, 0))
      .join("")
  );
  // hours ruler along the front edge: the clock the whole figure runs on
  out.push(S(slab(RULER, 0, 0.6, 3), { tone: "lo", crease: "none" }));
  for (let h = 0; h <= HOURS; h += 0.5) {
    const x = hourX(h),
      big = h % 6 === 0,
      mid = h % 1 === 0;
    out.push(
      L(
        k.lineOnTop(
          [x, RULER.y + 0.6],
          [x, RULER.y + 0.6 + (big ? 4.4 : mid ? 3 : 1.8)],
          0.6,
          P
        ),
        { tone: big ? "mid" : "lo" }
      )
    );
  }
  for (let h = 0; h <= HOURS; h += 6) {
    const clock = String((M.START_HOUR + h) % 24).padStart(2, "0");
    out.push(
      k.faceTextSvg(
        k.topMatrix([hourX(h), RULER.y + 7.2], 0.6, P, "x"),
        clock,
        { size: 2.6, tone: "lo", anchor: "middle" }
      )
    );
  }
  out.push(
    D(
      [
        at([RULER.x + 2.4, RULER.y + 4, 0.6]),
        at([RULER.x + RULER.w - 2.4, RULER.y + 4, 0.6]),
      ],
      { size: 0.45 }
    )
  );
  // label plate, back right
  const label = { x: 214, y: -52, w: 46, d: 14, r: 1.2 };
  out.push(S(slab(label, 0, 0.8, 3), { tone: "lo", crease: "none" }));
  out.push(
    k.faceTextSvg(
      k.topMatrix([label.x + 4, label.y + 6], 0.8, P, "x"),
      "AI;DR",
      { size: 4, tone: "mid" }
    )
  );
  out.push(
    L(
      [9.4, 11.4]
        .map((y) =>
          k.lineOnTop(
            [label.x + 4, label.y + y],
            [label.x + 34, label.y + y],
            0.8,
            P
          )
        )
        .join(""),
      { tone: "faint", free: "end" }
    )
  );
  out.push(
    D(
      [
        at([label.x + 41, label.y + 3.2, 0.8]),
        at([label.x + 41, label.y + 10.8, 0.8]),
      ],
      { size: 0.4 }
    )
  );
  return out.join("");
}

// Fetch: four source canisters feed a hopper; a sieve under it drops seen ids into a reject bin.
function intake() {
  const out = [];
  const cans = [
    [-262, -40],
    [-262, -22],
    [-244, -46],
    [-244, -28],
  ];
  out.push(
    S(slab({ x: -272, y: -54, w: 46, d: 42, r: 3 }, 0, 4, 4, 0.6), {
      tone: "mid",
    })
  );
  for (const [x, y] of byDepth(cans)) {
    const h = 20 + ((((x + y) % 7) + 7) % 7);
    out.push(S(cyl(x, y, 6.4, 4, h, 32, 0.6), { tone: "mid" }));
    out.push(L(k.sideArc(x, y, 6.4, 4 + h - 4, P, 18), { tone: "faint" }));
    out.push(S(cyl(x, y, 4.6, 4 + h, 2.4, 28), { tone: "mid" }));
    out.push(L(k.knurl(x, y, 4.6, 4 + h, 6.4 + h, 26, P), { tone: "lo" }));
    out.push(D([at([x, y, 6.4 + h])], { size: 0.5, tone: "hi" }));
  }
  // hopper on four legs
  const [hx, hy] = HOP;
  for (const [x, y] of byDepth(
    k.corners({ x: hx - 13, y: hy - 13, w: 26, d: 26 }, 2)
  )) {
    out.push(
      S(slab({ x: x - 1.6, y: y - 1.6, w: 3.2, d: 3.2, r: 0.6 }, 0, 32, 2, 0), {
        tone: "mid",
        crease: "none",
      })
    );
  }
  out.push(
    S(slab({ x: hx - 8, y: hy - 8, w: 16, d: 16, r: 1 }, 22, 10, 3, 0.4), {
      tone: "mid",
    })
  );
  out.push(
    S(slab({ x: hx - 14, y: hy - 14, w: 28, d: 28, r: 2 }, 32, 8, 3, 0.4), {
      tone: "mid",
    })
  );
  out.push(
    S(slab({ x: hx - 18, y: hy - 18, w: 36, d: 36, r: 2.4 }, 40, 14, 4, 0.6), {
      tone: "hi",
      crease: "lo",
      inner: k.sideSeam(
        { x: hx - 18, y: hy - 18, w: 36, d: 36, r: 2.4 },
        47,
        P,
        4
      ),
    })
  );
  out.push(
    S(
      k.slabOf({ x: hx - 15, y: hy - 15, w: 30, d: 30, r: 1.6 }, 54, 0.1, P, 4),
      { tone: "lo", flat: true }
    )
  );
  // fetched stories waiting in the hopper, one stack per source
  [
    [-6, -6],
    [6, -6],
    [-6, 6],
    [6, 6],
  ].forEach(([dx, dy], i) => {
    for (let j = 0; j < 2 + (i % 2); j++)
      out.push(
        S(
          slab(
            { x: hx + dx - 4, y: hy + dy - 5, w: 8, d: 10, r: 0.8 },
            54 + j * 1.4,
            1.2,
            2,
            0.2
          ),
          { tone: j === 1 + (i % 2) ? "hi" : "mid", crease: "lo" }
        )
      );
  });
  out.push(
    D(
      k
        .corners({ x: hx - 18, y: hy - 18, w: 36, d: 36 }, 2.6)
        .map(([x, y]) => at([x, y, 54])),
      { size: 0.45 }
    )
  );
  // sieve plate: one hole per sha256 slot
  const sieve = { x: hx - 12, y: hy - 12, w: 24, d: 24, r: 1 };
  out.push(S(slab(sieve, 18, 2, 3, 0.3), { tone: "mid" }));
  const holes = [];
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++)
      holes.push(
        k.ring(sieve.x + 4 + i * 5.3, sieve.y + 4 + j * 5.3, 1.1, 20, P, 10)
      );
  out.push(L(holes.join(""), { tone: "lo" }));
  // reject chute and bin (front)
  const bin = { x: hx - 10, y: 22, w: 22, d: 16, r: 1.4 };
  out.push(
    S(slab({ x: hx - 3, y: hy + 10, w: 6, d: 13, r: 0.8 }, 16, 2, 2, 0.2), {
      tone: "lo",
    })
  );
  out.push(
    S(slab({ x: hx - 2, y: 30, w: 4, d: 2, r: 0.4 }, 10, 6, 2, 0), {
      tone: "mid",
      crease: "none",
    })
  );
  out.push(S(slab(bin, 0, 10, 3, 0.5), { tone: "mid" }));
  out.push(
    S(k.slabOf(k.insetPlan(bin, 1.6), 10, 0.1, P, 3), {
      tone: "faint",
      flat: true,
    })
  );
  out.push(
    `<g data-part="rejects">${[0, 1, 2].map((i) => S(slab({ x: bin.x + 4 + i * 5, y: bin.y + 5, w: 4, d: 6, r: 0.6 }, 10, 0.8, 2), { tone: "lo", crease: "none" })).join("")}</g>`
  );
  return out.join("");
}

// Coalesce clock: one turn = one 30-minute run slot; the arc marks the 25-minute coalesce.
function clock() {
  const [x, y] = CLOCK,
    R = 13,
    Z = 16;
  const out = [];
  out.push(S(cyl(x, y, R + 2.6, 0, 3, 40), { tone: "lo" }));
  out.push(S(cyl(x, y, 3, 3, Z - 4, 18), { tone: "mid", crease: "none" }));
  out.push(S(cyl(x, y, R, Z - 4, 4, 48, 0.6), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(x, y, R, Z - 4, Z, 60, P, 0.5), { tone: "lo" }));
  const ticks = k.radialTicks(x, y, R - 1.6, 30, 5, Z, [1, 2.4], P);
  out.push(L(ticks.minor, { tone: "lo" }), L(ticks.major, { tone: "mid" }));
  const arc = [];
  for (let i = 0; i <= 25; i++) {
    const a = (i / 30) * Math.PI * 2;
    arc.push([x + Math.sin(a) * (R - 5), y - Math.cos(a) * (R - 5)]);
  }
  out.push(L(k.onTop(arc, Z, P), { tone: "mid" }));
  out.push(
    D(
      [
        at([x + Math.sin(0) * (R - 5), y - (R - 5), Z]),
        at([
          x + Math.sin((25 / 30) * 2 * Math.PI) * (R - 5),
          y - Math.cos((25 / 30) * 2 * Math.PI) * (R - 5),
          Z,
        ]),
      ],
      { size: 0.5, tone: "mid" }
    )
  );
  out.push(L(k.ring(x, y, 1.4, Z, P, 12), { tone: "mid" }));
  return out.join("");
}
const clockNeedle = (turn) => {
  const a = turn * Math.PI * 2,
    [x, y] = CLOCK,
    Z = 16.2;
  return k.lineOnTop(
    [x - Math.sin(a) * 2.4, y + Math.cos(a) * 2.4],
    [x + Math.sin(a) * 10.6, y - Math.cos(a) * 10.6],
    Z,
    P
  );
};

function belt() {
  const out = [];
  for (const x of [BELT.x + 6, BELT.x + BELT.w - 6])
    for (const y of [-11, 11]) {
      out.push(
        S(
          slab(
            { x: x - 2.4, y: y - 1.4, w: 4.8, d: 2.8, r: 0.6 },
            0,
            BELT_Z,
            2,
            0
          ),
          { tone: "mid", crease: "none" }
        )
      );
    }
  out.push(
    S(
      slab(
        { x: BELT.x, y: -12, w: BELT.w, d: 2, r: 0.4 },
        BELT_Z - 1,
        5,
        2,
        0.2
      ),
      { tone: "mid" }
    )
  );
  out.push(
    S(slab(BELT, BELT_Z, BELT_TOP - BELT_Z, 3, 0.4), {
      tone: "lo",
      crease: "faint",
    })
  );
  const ribs = [];
  for (let x = BELT.x + 4; x < BELT.x + BELT.w - 2; x += 5)
    ribs.push(k.lineOnTop([x, BELT.y], [x, BELT.y + BELT.d], BELT_TOP, P));
  out.push(L(ribs.join(""), { tone: "faint" }));
  out.push(
    S(
      slab(
        { x: BELT.x, y: 10, w: BELT.w, d: 2, r: 0.4 },
        BELT_Z - 1,
        5,
        2,
        0.2
      ),
      { tone: "mid" }
    )
  );
  out.push(
    D(
      [BELT.x + 6, BELT.x + BELT.w / 2, BELT.x + BELT.w - 6].map((x) =>
        at([x, 12, BELT_Z + 2])
      ),
      { size: 0.45 }
    )
  );
  return out.join("");
}
const TOKEN = { x: -4, y: -5, w: 8, d: 10, r: 0.8 };
const token = () =>
  S(slab(TOKEN, BELT_TOP, 1.6, 2, 0.2), { tone: "hi", crease: "lo" }) +
  L(
    k.lineOnTop([-2, -2.4], [2.4, -2.4], BELT_TOP + 1.6, P) +
      k.lineOnTop([-2, 0], [2.4, 0], BELT_TOP + 1.6, P),
    { tone: "lo", free: "both" }
  );

// Score: a gantry over the belt carries the gauge; five pockets beside it are one LLM batch.
function gantryBack() {
  const x = GANTRY_X,
    out = [];
  const tray = { x: x - 22, y: -46, w: 44, d: 14, r: 1.4 };
  out.push(S(slab(tray, 0, 4, 3, 0.4), { tone: "mid" }));
  for (let i = 0; i < M.SCORE_BATCH; i++)
    out.push(
      L(
        k.planOutline(
          { x: tray.x + 2.5 + i * 8, y: tray.y + 2.5, w: 7, d: 9, r: 0.6 },
          4,
          P,
          2
        ),
        { tone: "lo" }
      )
    );
  out.push(
    `<g data-part="batch">${Array.from({ length: M.SCORE_BATCH }, (_, i) => `<g data-pocket="${i}">${S(slab({ x: tray.x + 3.3 + i * 8, y: tray.y + 3.3, w: 5.4, d: 7.4, r: 0.5 }, 4, 1, 2), { tone: "hi", crease: "none" })}</g>`).join("")}</g>`
  );
  out.push(
    S(slab({ x: x - 4, y: -22, w: 8, d: 6, r: 1 }, 0, 3, 2), { tone: "lo" })
  );
  out.push(
    S(slab({ x: x - 2.4, y: -21, w: 4.8, d: 4, r: 0.6 }, 3, 40, 2, 0), {
      tone: "mid",
      crease: "none",
    })
  );
  return out.join("");
}
function gantryFront() {
  const x = GANTRY_X,
    out = [];
  out.push(
    S(slab({ x: x - 4, y: 16, w: 8, d: 6, r: 1 }, 0, 3, 2), { tone: "lo" })
  );
  out.push(
    S(slab({ x: x - 2.4, y: 17, w: 4.8, d: 4, r: 0.6 }, 3, 40, 2, 0), {
      tone: "mid",
      crease: "none",
    })
  );
  const beam = { x: x - 4, y: -22, w: 8, d: 44, r: 1 };
  out.push(S(slab(beam, 43, 5, 3, 0.4), { tone: "mid" }));
  out.push(
    D(
      [-17, 17].map((y) => at([x, y, 48])),
      { size: 0.45 }
    )
  );
  // probe that reads each card
  out.push(S(cyl(x, 0, 1.4, 18, 25, 14), { tone: "mid", crease: "none" }));
  out.push(S(cyl(x, 0, 2.6, 15, 3, 18), { tone: "hi", crease: "lo" }));
  // gauge on top of the beam
  out.push(S(cyl(x, 0, 3, 48, 2, 18), { tone: "mid" }));
  out.push(
    S(cyl(x, 0, DIAL_R, 50, DIAL_TOP - 50, 56, 0.6), {
      tone: "hi",
      crease: "lo",
    })
  );
  out.push(
    L(k.knurl(x, 0, DIAL_R, DIAL_TOP - 2.6, DIAL_TOP, 64, P, 0.3), {
      tone: "lo",
    })
  );
  out.push(L(k.ring(x, 0, DIAL_R - 1.8, DIAL_TOP, P, 48), { tone: "lo" }));
  const span = Math.PI * 1.5,
    from = -span / 2;
  const t = k.radialTicks(
    x,
    0,
    DIAL_R - 2.4,
    20,
    2,
    DIAL_TOP,
    [1, 2.4],
    P,
    from,
    span
  );
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  const tip = from + span;
  out.push(
    D(
      [
        at([
          x + Math.sin(tip) * (DIAL_R - 5.6),
          -Math.cos(tip) * (DIAL_R - 5.6),
          DIAL_TOP,
        ]),
      ],
      { size: 0.6, tone: "hi" }
    )
  );
  out.push(L(k.ring(x, 0, 1.3, DIAL_TOP, P, 12), { tone: "mid" }));
  return out.join("");
}
const gaugeNeedle = (importance) => {
  const span = Math.PI * 1.5,
    a = -span / 2 + (importance / 10) * span,
    x = GANTRY_X;
  return k.lineOnTop(
    [x - Math.sin(a) * 2.2, Math.cos(a) * 2.2],
    [x + Math.sin(a) * (DIAL_R - 3.4), -Math.cos(a) * (DIAL_R - 3.4)],
    DIAL_TOP + 0.2,
    P
  );
};

// Rank: the subject. A backboard ruled in √score, twenty bars, a gate after the 16th.
const BOARD_H = 78;
const scoreZ = (s) =>
  RACK_TOP + Math.min(BOARD_H - 10, 9.6 * Math.sqrt(Math.max(0, s)));
function rackBack() {
  const out = [];
  out.push(S(slab(RACK, 0, RACK_TOP, 4, 0.6), { tone: "mid" }));
  out.push(
    L(k.planOutline(k.insetPlan(RACK, 2.4), RACK_TOP, P, 3), { tone: "faint" })
  );
  const board = { x: RACK.x, y: RACK.y - 6, w: RACK.w, d: 5, r: 1 };
  out.push(S(slab(board, 0, BOARD_H, 3, 0.5), { tone: "mid" }));
  const face = board.y + board.d;
  const rules = [];
  for (let s = 1; s <= 7; s++) {
    const z = scoreZ(s * s);
    rules.push(
      k.pathOf(
        [
          [board.x + 1, face, z],
          [board.x + board.w, face, z],
          [board.x + board.w, board.y, z],
        ].map(at)
      )
    );
  }
  out.push(L(rules.join(""), { tone: "faint" }));
  for (let s = 1; s <= 7; s++)
    out.push(
      k.faceTextSvg(
        k
          .sideMatrix([board.x + 4.5, face, scoreZ(s * s) + 1.2], 0, P, "left")
          .replace(/matrix\(([^)]*)\)/, (m) => m),
        String(s * s),
        { size: 2.4, tone: "lo" }
      )
    );
  out.push(
    D(
      [
        [board.x + 2.4, BOARD_H - 3],
        [board.x + board.w - 2.4, BOARD_H - 3],
        [board.x + 2.4, 3],
        [board.x + board.w - 2.4, 3],
      ].map(([x, z]) => at([x, face, z])),
      { size: 0.45 }
    )
  );
  return out.join("");
}
function rackFront() {
  const out = [];
  // the gate: everything left of it is in the TL;DR
  const g = GATE_X;
  out.push(
    S(
      slab(
        { x: g - 0.9, y: BAR_Y - 2, w: 1.8, d: BAR_D + 4, r: 0.4 },
        RACK_TOP,
        0.4,
        2,
        0
      ),
      { tone: "lo", crease: "none" }
    )
  );
  out.push(
    S(cyl(g, BAR_Y + BAR_D + 3, 1.3, RACK_TOP, 50, 14), {
      tone: "mid",
      crease: "none",
    })
  );
  out.push(
    S(cyl(g, BAR_Y + BAR_D + 3, 2.2, RACK_TOP + 50, 2.4, 18), { tone: "mid" })
  );
  const lip = { x: RACK.x, y: RACK.y + RACK.d - 3, w: RACK.w, d: 3, r: 0.6 };
  out.push(S(slab(lip, RACK_TOP, 2, 2, 0.3), { tone: "mid" }));
  const t = [];
  for (let i = 0; i < 20; i++)
    t.push(
      k.lineOnTop(
        [slotX(i) + BAR_W / 2, lip.y],
        [slotX(i) + BAR_W / 2, lip.y + (i % 5 === 0 ? 2.4 : 1.4)],
        RACK_TOP + 2,
        P
      )
    );
  out.push(L(t.join(""), { tone: "lo" }));
  return out.join("");
}

// TL;DR press: a screw press stamps the snapshot, an EN page and a VI page.
function press() {
  const out = [],
    b = PRESS;
  out.push(
    S(slab(b, 0, 10, 4, 0.8), { tone: "mid", inner: k.sideSeam(b, 5, P, 4) })
  );
  out.push(
    k
      .corners(b, 4)
      .map(([x, y]) => screw(x, y, 10))
      .join("")
  );
  for (const [x, y] of byDepth([
    [b.x + 6, b.y + b.d / 2],
    [b.x + b.w - 6, b.y + b.d / 2],
  ]))
    out.push(S(cyl(x, y, 2.6, 10, 76, 18), { tone: "mid", crease: "none" }));
  return out.join("");
}
function wheel() {
  const out = [],
    b = PRESS,
    cx = b.x + b.w / 2,
    cy = b.y + b.d / 2;
  out.push(S(cyl(cx, cy, 2.6, 94, 13, 18), { tone: "mid", crease: "none" }));
  out.push(S(cyl(cx, cy, 4, 107, 3, 20), { tone: "mid" }));
  out.push(S(cyl(cx, cy, 11, 110, 3, 40, 0.4), { tone: "mid" }));
  out.push(L(k.knurl(cx, cy, 11, 110, 113, 52, P), { tone: "lo" }));
  out.push(D([at([cx + 7, cy, 113])], { size: 0.6, tone: "hi" }));
  return out.join("");
}
function pressTop() {
  const out = [],
    b = PRESS,
    _cx = b.x + b.w / 2,
    cy = b.y + b.d / 2;
  const beam = { x: b.x, y: cy - 6, w: b.w, d: 12, r: 2 };
  out.push(S(slab(beam, 86, 8, 3, 0.6), { tone: "mid" }));
  out.push(
    D([at([b.x + 6, cy, 94]), at([b.x + b.w - 6, cy, 94])], { size: 0.5 })
  );
  return out.join("");
}
const PAGES = [
  { x: 158, y: -12, w: 17, d: 24, r: 0.6 },
  { x: 177, y: -12, w: 17, d: 24, r: 0.6 },
];
function pages() {
  const out = [];
  out.push(
    S(slab({ x: 156, y: -14, w: 40, d: 28, r: 1 }, 10, 1.4, 3, 0.2), {
      tone: "lo",
    })
  );
  PAGES.forEach((pg, i) => {
    out.push(S(slab(pg, 11.4, 0.8, 2), { tone: "hi", crease: "lo" }));
    out.push(
      k.faceTextSvg(
        k.topMatrix([pg.x + 2, pg.y + 4.4], 12.2, P, "x"),
        i ? "VI" : "EN",
        { size: 2.6, tone: "mid" }
      )
    );
  });
  return out.join("");
}
const pageLines = (count) =>
  PAGES.map((pg) =>
    Array.from({ length: count }, (_, j) =>
      k.lineOnTop(
        [pg.x + 2, pg.y + 7 + j * 1.05],
        [pg.x + pg.w - 2 - (j % 3) * 2, pg.y + 7 + j * 1.05],
        12.2,
        P
      )
    ).join("")
  ).join("");
function platen() {
  const out = [],
    b = PRESS,
    cx = b.x + b.w / 2,
    cy = b.y + b.d / 2;
  out.push(S(cyl(cx, cy, 2.6, 28, 60, 18), { tone: "mid", crease: "none" }));
  const coil = [];
  for (let i = 0; i < 9; i++)
    coil.push(k.sideArc(cx, cy, 2.7, 34 + i * 6, P, 10));
  out.push(L(coil.join(""), { tone: "lo" }));
  out.push(
    S(slab({ x: 155, y: -15, w: 42, d: 30, r: 1.4 }, 22, 6, 3, 0.5), {
      tone: "mid",
    })
  );
  return out.join("");
}

// Publish: email box (07:00 local), Telegram lamp and Facebook lamp (08:00 ICT).
function outlets() {
  const out = [];
  const base = { x: 214, y: -26, w: 62, d: 52, r: 3 };
  out.push(S(slab(base, 0, 4, 4, 0.6), { tone: "mid" }));
  OUT_X.forEach((x, i) => {
    out.push(
      S(slab({ x: x - 2, y: -2, w: 4, d: 4, r: 0.6 }, 4, 22 - i * 2, 2, 0), {
        tone: "mid",
        crease: "none",
      })
    );
    const box = { x: x - 7, y: -9, w: 14, d: 18, r: 2 };
    const z = 26 - i * 2;
    out.push(S(slab(box, z, 12, 3, 0.6), { tone: "mid" }));
    out.push(
      L(
        k.pathOf(
          [
            [box.y + 4, z + 8.6],
            [box.y + box.d - 4, z + 8.6],
            [box.y + box.d - 4, z + 7.4],
            [box.y + 4, z + 7.4],
          ].map(([y, zz]) => at([box.x + box.w, y, zz])),
          true
        ),
        { tone: "lo" }
      )
    );
    out.push(
      `<g data-lamp="${i}" data-on="0">${S(cyl(x, 0, 3.6, z + 12, 3, 24, 0.4), { tone: "mid" })}</g>`
    );
    out.push(
      D(
        [
          at([box.x + box.w, box.y + 2.6, z + 2.4]),
          at([box.x + box.w, box.y + box.d - 2.6, z + 2.4]),
        ],
        { size: 0.4 }
      )
    );
  });
  // Telegram: a ticker prints the digest, eight bullets
  {
    const x = OUT_X[1],
      z = 4;
    const tape = { x: x - 4, y: 10, w: 8, d: 13, r: 0.4 };
    out.push(
      L(
        k.pathOf(
          [
            [x - 4, 30],
            [x + 4, 30],
            [x + 4, 28.8],
            [x - 4, 28.8],
          ].map(([xx, zz]) => at([xx, 9, zz])),
          true
        ),
        { tone: "lo" }
      )
    );
    out.push(S(slab(tape, z, 0.4, 2, 0), { tone: "hi", crease: "lo" }));
    const rows = [];
    for (let j = 0; j < M.TELEGRAM_BULLETS; j++)
      rows.push(
        k.lineOnTop(
          [tape.x + 1.2, tape.y + 1.4 + j * 1.4],
          [tape.x + tape.w - 1.2 - (j % 3) * 1.4, tape.y + 1.4 + j * 1.4],
          z + 0.4,
          P
        )
      );
    out.push(L(rows.join(""), { tone: "lo", free: "end" }));
  }
  const fx = OUT_X[0] + 7.6;
  out.push(S(cyl(fx - 0.2, 6, 1.2, 30, 1.6, 12), { tone: "mid" }));
  out.push(
    `<g data-part="flag">${S(slab({ x: fx, y: 5.4, w: 1, d: 1.2, r: 0.2 }, 30.8, 12, 2, 0), { tone: "mid", crease: "none" })}${S(slab({ x: fx, y: 1.6, w: 1, d: 5, r: 0.4 }, 38.8, 4, 2, 0), { tone: "hi", crease: "lo" })}</g>`
  );
  return out.join("");
}
function hourCursor() {
  const y = RULER.y;
  return `<g data-part="cursor">${S(slab({ x: -3, y: y - 2, w: 6, d: RULER.d + 4, r: 1 }, 0.6, 2.4, 2, 0.3), { tone: "mid" })}${L(k.lineOnTop([0, y - 1.4], [0, y + RULER.d + 1.4], 3, P), { tone: "hi" })}</g>`;
}

// Stage notes: a tinted tag above each station, its leader ending on a dot on the part.
const NOTES = [
  ["clock", "1", "Every 30 min", [-246, 38, 16], [-30, 34]],
  ["intake", "2", "Fetch + dedupe", [-224, 0, 58], [0, -34]],
  ["score", "3", "LLM score", [-132, 0, 56], [0, -30]],
  ["rank", "4", "Rank", [40, -28, 78], [0, -22]],
  ["press", "5", "TL;DR EN + VI", [176, 0, 113], [0, -22]],
  ["publish", "6", "Email · Telegram · FB", [246, 0, 40], [16, -44]],
];
function notes() {
  return NOTES.map(([id, n, text, point, [dx, dy]]) => {
    const [x, y] = at(point);
    const tx = x + dx,
      ty = y + dy,
      w = 22 + text.length * 4.5;
    return `<g class="aidr-note" data-station="${id}"><path class="iso-line" data-tone="mid" d="M${tx.toFixed(1)} ${(ty + 6).toFixed(1)}L${x.toFixed(1)} ${y.toFixed(1)}"/><circle class="aidr-note-dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.4"/><rect x="${(tx - w / 2).toFixed(1)}" y="${(ty - 6).toFixed(1)}" width="${w.toFixed(1)}" height="12" rx="6"/><text x="${(tx - w / 2 + 7).toFixed(1)}" y="${(ty + 2.6).toFixed(1)}"><tspan class="n">${n}</tspan> ${text}</text></g>`;
  }).join("");
}
const T = (name, inner) => `<g data-station="${name}">${inner}</g>`;
const svg = k.figureSvg({
  width: WIDTH,
  height: HEIGHT,
  label:
    "AI;DR as a bench machine. Source canisters feed a hopper whose sieve rejects stories already stored; a belt carries new stories under a gauge that scores them in batches of five; a rack holds twenty bars whose height is each story's rank score, with a gate after the sixteenth; a press stamps the top sixteen into an English and a Vietnamese page; three lamps light when email and Telegram and Facebook send.",
  body: [
    plate(),
    T("intake", intake()),
    T(
      "clock",
      `${clock()}<path data-part="clock-needle" class="iso-line" data-tone="hi" data-free="start" d="${clockNeedle(0)}" style="stroke-width:1"/>`
    ),
    T(
      "score",
      `${belt() + gantryBack()}<g data-part="tokens">${Array.from({ length: 6 }, () => `<g>${token()}</g>`).join("")}</g>${gantryFront()}<path data-part="gauge-needle" class="iso-line" data-tone="hi" data-free="start" d="${gaugeNeedle(5)}" style="stroke-width:1"/>`
    ),
    T("rank", `${rackBack()}<g data-part="bars"></g>${rackFront()}`),
    T(
      "press",
      `${press() + pages()}<path data-part="page-lines" class="iso-line" data-tone="lo" data-free="end" d="${pageLines(0)}"/><g data-part="platen">${platen()}</g>${pressTop()}<g data-part="wheel">${wheel()}</g>`
    ),
    T(
      "publish",
      outlets() +
        k.wireSvg(at([170, 24, 4]), at([258, 26, 2]), {
          via: [at([170, 33, 0.3]), at([258, 33, 0.3])],
          tone: "mid",
          size: 1,
        })
    ),
    hourCursor(),
    notes(),
  ],
});

const strip = (src) => src.replace(/^export /gm, "");
const live = `
if (!document.body.dataset.fixed) document.body.dataset.theme = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
${strip(readFileSync(join(HERE, "model.mjs"), "utf8"))}
const P = ${JSON.stringify(P)};
const C = ${JSON.stringify({ RACK_TOP, BAR_W, BAR_D, BAR_Y, SLOT, RACKX: RACK.x, BOARD_H, HOURS, RULER, CLOCK, GANTRY_X, DIAL_R, DIAL_TOP, BELT, BELT_TOP })};
const slotX = (i) => C.RACKX + 4 + i * C.SLOT;
const scoreZ = ${scoreZ.toString().replace(/RACK_TOP|BOARD_H/g, (m) => `C.${m}`)};
const hourX = (t) => C.RULER.x + 6 + (t / C.HOURS) * (C.RULER.w - 12);
const clockNeedle = ${clockNeedle.toString().replace(/k\./g, "").replace(/CLOCK/g, "C.CLOCK")};
const gaugeNeedle = ${gaugeNeedle
  .toString()
  .replace(/k\./g, "")
  .replace(/GANTRY_X|DIAL_R|DIAL_TOP/g, (m) => `C.${m}`)};
const pageLines = ${pageLines.toString().replace(/k\./g, "").replace(/PAGES/g, JSON.stringify(PAGES))};
const stage = document.querySelector(".iso-stage");
const svg = stage.querySelector("svg");
const $ = (name) => svg.querySelector('[data-part="' + name + '"]');
const barsG = $("bars"), cursor = $("cursor"), cneedle = $("clock-needle"), gneedle = $("gauge-needle"), platenG = $("platen"), lines = $("page-lines");
const tokens = [...$("tokens").children], pockets = [...svg.querySelectorAll("[data-pocket]")], lamps = [...svg.querySelectorAll("[data-lamp]")];
const readout = document.querySelector("[data-readout]");
const flag = $("flag"), wheelG = $("wheel");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// one bar per story, each in its own group so it can slide between slots
const bars = STORIES.map((s, id) => { const g = document.createElementNS("http://www.w3.org/2000/svg", "g"); g.dataset.id = id; barsG.appendChild(g); return { id, g, x: null, h: 0, key: "" }; });
function barSvg(h, lit, dim) {
  const plan = { x: 0, y: C.BAR_Y, w: C.BAR_W, d: C.BAR_D, r: 0.6 };
  const top = Math.max(0.6, h);
  return solidSvg(slabOf(plan, C.RACK_TOP, top, P, 2, 0.3), { tone: dim ? "lo" : lit ? "hi" : "mid", crease: dim ? "faint" : "lo", lit });
}
let t = 0, target = 0, touring = true, frame = 0, last = 0, visible = false, idle = 0, beltPhase = 0, stamp = 0, lastSnap = -1;
const snapAt = (tt) => { const day = Math.floor((START_HOUR + tt) / 24); return day * 100 + Math.floor((tt - (day * 24 - START_HOUR)) / TLDR_REFRESH_H); };
function draw(dt) {
  const rows = board(t);
  const slotOf = new Map(rows.map((r) => [r.id, r]));
  const order = [];
  for (const b of bars) {
    const row = slotOf.get(b.id) || null;
    const i = row ? row.slot : undefined;
    const want = row ? scoreZ(row.score) - C.RACK_TOP : 0;
    const wx = i === undefined ? (b.x ?? slotX(19)) : slotX(i);
    const k1 = dt ? 1 - Math.exp(-dt / 0.22) : 1;
    b.x = b.x === null ? wx : b.x + (wx - b.x) * k1;
    b.h = b.h + (want - b.h) * k1;
    const lit = i === 0, dim = !row || !row.inWindow || i >= TLDR_MAX;
    const key = b.h.toFixed(1) + lit + dim;
    if (key !== b.key) { b.key = key; b.g.innerHTML = b.h > 0.2 ? barSvg(b.h, lit, dim) : ""; }
    b.g.setAttribute("transform", translateAlong(P, [b.x, 0, 0]));
    order.push(b);
  }
  order.sort((a, b) => a.x - b.x).forEach((b) => barsG.appendChild(b.g));
  const local = (START_HOUR + t) % 24, day = Math.floor((START_HOUR + t) / 24);
  cursor.setAttribute("transform", translateAlong(P, [hourX(t), 0, 0]));
  cneedle.setAttribute("d", clockNeedle((t % RUN_EVERY_H) / RUN_EVERY_H));
  // lamps: once per local date, at the send hour
  const sent = [local >= EMAIL_HOUR, local >= NOTIFY_HOUR, local >= NOTIFY_HOUR];
  lamps.forEach((l, i) => l.setAttribute("data-on", sent[i] ? "1" : "0"));
  flag.style.opacity = sent[0] ? "1" : "0";
  // press: a new snapshot each 3h or new local day
  const snap = snapAt(t);
  if (snap !== lastSnap) { if (lastSnap !== -1) stamp = 1; lastSnap = snap; }
  stamp = dt ? Math.max(0, stamp - dt * 1.6) : 0;
  const drop = Math.sin(Math.PI * stamp) * 10;
  platenG.setAttribute("transform", translateAlong(P, [0, 0, -drop]));
  wheelG.setAttribute("transform", translateAlong(P, [0, 0, -drop]));
  const inTldr = Math.min(TLDR_MAX, rows.filter((r) => r.inWindow).length);
  lines.setAttribute("d", pageLines(inTldr));
  // belt: cards ride toward the rack; the gauge reads the one under the probe
  beltPhase = (beltPhase + (dt || 0) * 14) % 25;
  let under = null;
  tokens.forEach((g, i) => {
    const x = C.BELT.x + 8 + ((beltPhase + i * 25) % 150);
    const show = x < C.BELT.x + C.BELT.w - 6;
    g.style.opacity = show ? String(Math.min(1, (x - C.BELT.x - 4) / 8, (C.BELT.x + C.BELT.w - 6 - x) / 8)) : "0";
    g.setAttribute("transform", translateAlong(P, [x, 0, 0]));
    if (Math.abs(x - C.GANTRY_X) < 12.5) under = i;
  });
  const next = upcoming(t)[0];
  const imp = under === null || !next ? 0 : next.importance;
  gauge.v += (imp - gauge.v) * (dt ? 1 - Math.exp(-dt / 0.18) : 1);
  gneedle.setAttribute("d", gaugeNeedle(gauge.v));
  pockets.forEach((p, i) => (p.style.opacity = i < ((Math.floor(beltPhase / 5) % 5) + 1) ? "1" : "0.15"));
  drawIO();
  const top = rows[0];
  const hh = String(Math.floor(local)).padStart(2, "0") + ":" + (local % 1 >= 0.5 ? "30" : "00");
  const text = hh + " · day " + (day + 1) + " · TL;DR " + inTldr + " · #1 " + (top ? top.score.toFixed(1) : "–");
  if (readout.textContent !== text) readout.textContent = text;
  stage.setAttribute("aria-valuenow", String(t.toFixed(1)));
  stage.setAttribute("aria-valuetext", hh + ", " + inTldr + " stories in the TL;DR, top story: " + (top ? top.s.title : "none"));
  const title = document.querySelector("[data-top]");
  if (title && top) { const s = top.s; const tx = top.s.title + " — importance " + s.importance + ", " + s.sources + " outlets, " + (s.votes >= 0 ? "+" : "") + s.votes + " votes, " + top.age.toFixed(1) + "h old → " + top.score.toFixed(1); if (title.textContent !== tx) title.textContent = tx; }
}
const gauge = { v: 0 };
const inList = document.querySelector("[data-in]"), outList = document.querySelector("[data-out]");
const esc = (x) => x.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
let ioKey = "";
function drawIO() {
  const fresh = STORIES.map((s, id) => ({ s, id, age: t - s.born })).filter((r) => r.age >= 0).sort((a, b) => a.age - b.age).slice(0, 5);
  const top = board(t).filter((r) => r.inWindow).slice(0, TELEGRAM_BULLETS);
  const key = fresh.map((r) => r.id).join() + "|" + top.map((r) => r.id).join();
  if (key === ioKey) return;
  ioKey = key;
  inList.innerHTML = fresh.map((r) => { const [src, raw] = EXAMPLES[r.id]; return \`<li><span class="src">\${esc(src)} · \${r.age < 1 ? "just now" : r.age.toFixed(0) + "h ago"}</span><span class="raw">\${esc(raw)}</span> <span class="meta">\${r.s.points} pts · \${r.s.comments} comments</span></li>\`; }).join("");
  outList.innerHTML = top.map((r) => \`<li>\${esc(EXAMPLES[r.id][2])} <span class="meta">\${r.score.toFixed(1)}</span></li>\`).join("");
}
function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (touring) { target = (target + dt * 0.9) % C.HOURS; t = target; }
  else t += (target - t) * (1 - Math.exp(-dt / 0.25));
  draw(dt);
  frame = visible && !still.matches ? requestAnimationFrame(tick) : 0;
}
const run = () => { if (!frame && visible && !still.matches) { last = 0; frame = requestAnimationFrame(tick); } };
const steer = (v) => { touring = false; target = clamp(v, 0, C.HOURS); clearTimeout(idle); idle = setTimeout(() => { touring = !still.matches; run(); }, 4000); if (still.matches) { t = target; draw(0); } run(); };
new IntersectionObserver((e) => { visible = e[e.length - 1].isIntersecting; if (visible) run(); }, { rootMargin: "120px 0px" }).observe(stage);
stage.addEventListener("pointermove", (e) => { const r = svg.getBoundingClientRect(); steer(clamp(((e.clientX - r.left) / r.width - 0.08) / 0.84, 0, 1) * C.HOURS); });
stage.addEventListener("keydown", (e) => {
  const step = { ArrowRight: 0.5, ArrowUp: 0.5, ArrowLeft: -0.5, ArrowDown: -0.5, PageUp: 3, PageDown: -3 }[e.key];
  if (e.key === "Home") { e.preventDefault(); return steer(0); }
  if (e.key === "End") { e.preventDefault(); return steer(C.HOURS); }
  if (step === undefined) return;
  e.preventDefault(); steer(Math.round((target + step) * 2) / 2);
});
if (still.matches) { touring = false; t = target = 4; }
draw(0);
`;

const css = `<style>
[data-station]{--tint-mix:24%}
.iso[data-theme="light"] [data-station]{--tint-mix:46%}
[data-station="intake"]{--tint:#f4b98f}
[data-station="clock"]{--tint:#c3b1f0}
[data-station="score"]{--tint:#9fdcb8}
[data-station="rank"]{--tint:#9cc6f0}
[data-station="press"]{--tint:#efd98a}
[data-station="publish"]{--tint:#f0a9c0}
[data-station] .iso-top{fill:color-mix(in srgb,var(--tint) var(--tint-mix),var(--anatomy-top))}
[data-station] .iso-fill{fill:color-mix(in srgb,var(--tint) var(--tint-mix),var(--anatomy-paper))}
[data-station] .iso-shade[data-shade="0"]{fill:color-mix(in srgb,var(--tint) calc(var(--tint-mix) * .6),var(--anatomy-shade-0))}
[data-station] .iso-shade[data-shade="1"]{fill:color-mix(in srgb,var(--tint) calc(var(--tint-mix) * .7),var(--anatomy-shade-1))}
[data-station] .iso-shade[data-shade="2"]{fill:color-mix(in srgb,var(--tint) calc(var(--tint-mix) * .8),var(--anatomy-shade-2))}
[data-station] .iso-shade[data-shade="3"]{fill:color-mix(in srgb,var(--tint) calc(var(--tint-mix) * .9),var(--anatomy-shade-3))}
[data-station] .iso-solid[data-lit]>.iso-top{fill:color-mix(in srgb,var(--tint) calc(var(--tint-mix) * 1.6),var(--anatomy-lit-top))}
[data-station] [data-lamp][data-on="1"] .iso-top{fill:var(--tint)}
.aidr-note rect{fill:color-mix(in srgb,var(--tint) 30%,var(--anatomy-card));stroke:var(--tint);stroke-width:.6}
.iso[data-theme="light"] .aidr-note rect{fill:color-mix(in srgb,var(--tint) 45%,#fff)}
.aidr-note text{font:500 7px var(--anatomy-mono);fill:var(--anatomy-strong);letter-spacing:.02em}
.aidr-note .n{font-weight:700}
.aidr-note-dot{fill:var(--anatomy-strong)}
.aidr-io{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);gap:12px;margin-top:14px;font-size:12.5px;line-height:1.45;color:var(--anatomy-text)}
.aidr-io section{min-width:0;border:1px solid var(--anatomy-faint);border-radius:10px;padding:10px 12px;background:color-mix(in srgb,var(--tint) 10%,var(--anatomy-card))}
.aidr-io section:first-child{--tint:#f4b98f}.aidr-io section:last-of-type{--tint:#efd98a}
.aidr-io h3{margin:0 0 6px;font:600 11px var(--anatomy-mono);letter-spacing:.06em;text-transform:uppercase;color:var(--anatomy-strong)}
.aidr-io ol{margin:0;padding-left:18px;display:grid;gap:5px}
.aidr-io .src{display:block;font:10.5px var(--anatomy-mono);color:var(--anatomy-muted)}
.aidr-io .raw{color:var(--anatomy-strong)}
.aidr-io .meta{font:10.5px var(--anatomy-mono);color:var(--anatomy-muted)}
.aidr-arrow{align-self:center;font:16px var(--anatomy-mono);color:var(--anatomy-muted)}
@media (max-width:640px){.aidr-io{grid-template-columns:minmax(0,1fr)}.aidr-arrow{justify-self:center;transform:rotate(90deg)}}
.aidr-stations{display:flex;flex-wrap:wrap;gap:6px 14px;margin:10px 0 0;padding:0;list-style:none;font-size:12.5px;color:var(--anatomy-text)}
.aidr-stations li{display:flex;align-items:center;gap:6px}
.aidr-stations i{width:10px;height:10px;border-radius:3px;background:var(--tint);flex:none}

[data-lamp][data-on="1"] .iso-top{fill:var(--anatomy-hi)}
[data-lamp] .iso-top{transition:fill .4s}
[data-part="flag"]{transition:opacity .4s}
.aidr-top{display:block;margin-top:.4em;font-family:var(--anatomy-mono);font-size:12px;color:var(--anatomy-text);opacity:.8;min-height:1.6em}
</style>`;
const body =
  css +
  k.plateHtml({
    fig: "Fig 1",
    title: "How AI;DR works",
    hint: "Move across to turn the clock · ← →",
    readout: "",
    keys: [
      {
        mark: "lit",
        label:
          "Top bar: the #1 story right now, scored by the real rank formula",
      },
      {
        mark: "raised",
        label: "Bars left of the gate: the 16 stories in the TL;DR",
      },
      {
        mark: "line",
        label:
          "Outlets: email box and flag 07:00, Telegram ticker (8 bullets) and Facebook 08:00; only the English page is wired to Facebook",
      },
    ],
    caption:
      "Every 30 minutes a run starts: one turn of the dial; a run asked for inside the 25-minute arc is skipped (coalesce). Sources pour into the hopper, the sieve drops ids already stored, the belt carries new stories under a gauge that scores them five at a time, and the rack re-ranks the last 72 hours: rank = importance^1.5/√10 × quality × decay × engagement × votes × breaking, drawn on a √score scale over thirty sample stories. Stories older than 24 hours fall out of the TL;DR window and go dark. The press writes one snapshot with English and Vietnamese pages that never fill in for each other; email, Telegram and Facebook (English only) each send once per local day.",
    body: `<div class="iso-stage" style="touch-action:pan-y" tabindex="0" role="slider" aria-label="AI;DR clock: arrow keys move time by half an hour" aria-valuemin="0" aria-valuemax="${HOURS}" aria-valuenow="0">${svg}</div><span class="aidr-top" data-top></span><div class="aidr-io"><section><h3>In · raw items from sources</h3><ol data-in></ol></section><div class="aidr-arrow" aria-hidden="true">→</div><section><h3>Out · TL;DR, top 8 (as sent to Telegram)</h3><ol data-out></ol></section></div>`,
  });
const STATIONS = [
  ["clock", "Schedule: a run every 30 min"],
  ["intake", "Fetch + dedupe"],
  ["score", "Score (LLM, batches of 5)"],
  ["rank", "Rank (top 16 → TL;DR)"],
  ["press", "TL;DR snapshot (EN + VI)"],
  ["publish", "Email · Telegram · Facebook"],
];
const stationKeys = `<ul class="aidr-stations">${STATIONS.map(([id, label], i) => `<li data-station="${id}"><i></i>${i + 1} ${label}</li>`).join("")}</ul>`;
const page = body.replace(
  '<figcaption class="iso-legend">',
  `<figcaption class="iso-legend">${stationKeys}`
);
const name =
  theme === "light" ? "aidr-anatomy-light.html" : "aidr-anatomy.html";
const preview = process.argv.includes("--preview");
const html = k.pageHtml({
  title: "How AI;DR works",
  theme,
  body: page,
  width: 820,
  script: kitScript() + live,
});
if (preview) {
  writeFileSync(
    join(HERE, name),
    html.replace('<body class="iso"', '<body class="iso" data-fixed="1"')
  );
  console.log("wrote", name);
} else {
  // Embed: transparent page that follows the host's `.dark` class and posts its height.
  const follow = `const ROOT = document.querySelector(".iso-root");
const host = (() => { try { return window.parent !== window ? window.parent.document.documentElement : null; } catch { return null; } })();
// Match the host's color-scheme too: a mismatch makes the browser paint the frame opaque.
const pick = () => {
  const theme = host ? (host.classList.contains("dark") ? "dark" : "light") : matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  ROOT.dataset.theme = theme;
  document.documentElement.style.colorScheme = host ? getComputedStyle(host).colorScheme : theme;
};
pick();
matchMedia("(prefers-color-scheme: light)").addEventListener("change", pick);
if (host) new MutationObserver(pick).observe(host, { attributes: true, attributeFilter: ["class"] });
const fit = () => window.parent !== window && window.parent.postMessage({ type: "aidr-figure-height", height: document.documentElement.scrollHeight }, location.origin);
new ResizeObserver(fit).observe(document.body);
fit();`;
  const out = html
    .replace(/if \(!document\.body\.dataset\.fixed\)[^\n]*/, () => follow)
    .replace(
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '$&<meta name="robots" content="noindex">'
    )
    .replace(
      "</style></head>",
      "html,body{margin:0;background:transparent!important}.iso-root{background:transparent}.iso-root .iso-page{width:100%;margin:0}</style></head>"
    )
    .replace(
      /<body class="iso" data-theme="\w+">/,
      '<body><div class="iso iso-root" data-theme="light">'
    )
    .replace("</main>", "</main></div>");
  const target = join(HERE, "../../public/how-it-works.html");
  writeFileSync(target, out);
  console.log("wrote", target);
}
