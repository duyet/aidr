import type { Flat, Plan, Point3, SolidPaths } from "./iso-kit";
import * as k from "./iso-kit";
import { TOOL_PARTS } from "./model";

export const WIDTH = 640;
export const HEIGHT = 420;

const BASE: Plan = { x: -150, y: -66, w: 290, d: 140, r: 8 };
const BASE_H = 9;
const FOOT_H = 4;

const CAB: Plan = { x: -30, y: -28, w: 64, d: 54, r: 2 };
const CAB_FRONT = CAB.y + CAB.d;
const PLINTH = 4;
const SLOT = 13;
const CAB_TOP = PLINTH + SLOT * TOOL_PARTS.length + 2;
export const PULL = 34;

const FEEDER: Plan = { x: -138, y: -56, w: 40, d: 40, r: 3 };
const FEEDER_H = 46;
export const DIAL: Flat = [-118, -36];
export const DIAL_R = 15;
export const DIAL_Z = FEEDER_H + 3;

const RACK: Plan = { x: 46, y: -60, w: 54, d: 14, r: 1.5 };
const RACK_H = 5;

const PORT_Z = 44;
const CLIENT: Plan = { x: 78, y: -10, w: 46, d: 40, r: 3 };
const CLIENT_H = 10;
const SCREEN: Plan = { x: 84, y: -8, w: 5, d: 36, r: 1 };
const SCREEN_H = 30;

export const P = k.fitProjection(
  [
    ...k.boxCorners(BASE, -BASE_H - FOOT_H, 0),
    [CAB.x, CAB.y, CAB_TOP + 10],
    [FEEDER.x, FEEDER.y, FEEDER_H + 8],
    [CAB.x, CAB_FRONT + PULL + 4, 0],
  ],
  WIDTH,
  HEIGHT,
  { pad: 18, azimuth: 45 }
);

const at = (point: Point3) => k.iso(point, P);

export type SolidItem = {
  kind: "solid";
  paths: SolidPaths;
  tone?: k.Tone;
  lit?: boolean;
  crease?: k.Tone | "none";
};
export type LineItem = { kind: "line"; d: string; tone?: k.LineTone };
export type DotItem = {
  kind: "dots";
  points: Flat[];
  size?: number;
  tone?: k.Tone;
};
export type HaloItem = { kind: "halo"; d: string };
export type Item = SolidItem | LineItem | DotItem | HaloItem;

const S = (
  paths: SolidPaths,
  tone: k.Tone = "mid",
  extra: Partial<SolidItem> = {}
): Item => ({
  kind: "solid",
  paths,
  tone,
  ...extra,
});
const L = (d: string, tone: k.LineTone = "lo"): Item => ({
  kind: "line",
  d,
  tone,
});
const D = (points: Flat[], tone: k.Tone = "mid", size = 0.5): Item => ({
  kind: "dots",
  points,
  size,
  tone,
});

function base(): Item[] {
  const out: Item[] = [
    { kind: "halo", d: k.haloOf(BASE, -BASE_H - FOOT_H, BASE_H, P) },
  ];
  const feet = k
    .corners(BASE, 20)
    .sort(
      (a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P)
    );
  for (const [x, y] of feet) {
    out.push(S(k.cylinder(x, y, 6, -BASE_H - FOOT_H, 1.4, P, 28), "lo"));
    out.push(
      S(
        k.cylinder(x, y, 4.6, -BASE_H - FOOT_H + 1.4, FOOT_H - 1.4, P, 28),
        "mid"
      )
    );
  }
  out.push(S(k.slabOf(BASE, -BASE_H, BASE_H, P, 8, 1.4)));
  out.push(L(k.planOutline(k.insetPlan(BASE, 5), 0, P), "lo"));
  const screws = k.corners(BASE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2, 0, P, 16)).join(""), "lo"));
  out.push(
    D(
      screws.map(([x, y]) => at([x, y, 0])),
      "mid",
      0.5
    )
  );
  const strip: Plan = { x: -40, y: BASE.y + BASE.d - 14, w: 170, d: 6, r: 1 };
  out.push(S(k.slabOf(strip, 0, 0.6, P, 3), "lo", { crease: "none" }));
  const ticks = k.topTicks(
    strip.x + 4,
    strip.x + strip.w - 4,
    4,
    5,
    strip.y + 0.8,
    0.6,
    [1.8, 3.4],
    P
  );
  out.push(L(ticks.minor, "lo"), L(ticks.major, "mid"));
  out.push(
    D(
      [
        at([strip.x + 2, strip.y + 3, 0.6]),
        at([strip.x + strip.w - 2, strip.y + 3, 0.6]),
      ],
      "mid",
      0.45
    )
  );
  const label: Plan = {
    x: -140,
    y: BASE.y + BASE.d - 22,
    w: 40,
    d: 13,
    r: 1.2,
  };
  out.push(S(k.slabOf(label, 0, 0.6, P, 3), "lo", { crease: "none" }));
  for (const [i, w] of [26, 18, 22].entries()) {
    const y = label.y + 3.5 + i * 3;
    out.push(
      L(k.lineOnTop([label.x + 4, y], [label.x + 4 + w, y], 0.6, P), "faint")
    );
  }
  out.push(
    D(
      [
        at([label.x + label.w - 3, label.y + 3, 0.6]),
        at([label.x + label.w - 3, label.y + label.d - 3, 0.6]),
      ],
      "mid",
      0.4
    )
  );
  return out;
}

function feeder(): Item[] {
  const out: Item[] = [];
  out.push(S(k.slabOf(FEEDER, 0, 6, P, 6, 0.6)));
  out.push(S(k.slabOf(k.insetPlan(FEEDER, 2), 6, FEEDER_H - 6, P, 6, 0.6)));
  out.push(L(k.sideSeam(k.insetPlan(FEEDER, 2), 26, P), "faint"));
  const [cx, cy] = DIAL;
  out.push(S(k.cylinder(cx, cy, DIAL_R + 2, FEEDER_H, 1.6, P, 48, 0.4)));
  out.push(
    S(
      k.cylinder(
        cx,
        cy,
        DIAL_R,
        FEEDER_H + 1.6,
        DIAL_Z - FEEDER_H - 1.6,
        P,
        48,
        0.4
      ),
      "hi",
      { crease: "lo" }
    )
  );
  out.push(
    L(k.knurl(cx, cy, DIAL_R + 2, FEEDER_H, FEEDER_H + 1.6, 60, P, 0.3), "lo")
  );
  const ticks = k.radialTicks(cx, cy, DIAL_R - 1, 30, 5, DIAL_Z, [1.4, 3], P);
  out.push(L(ticks.minor, "lo"), L(ticks.major, "mid"));
  out.push(L(k.ring(cx, cy, DIAL_R - 5, DIAL_Z, P, 40), "faint"));
  const slot: Plan = {
    x: FEEDER.x + 6,
    y: FEEDER.y + FEEDER.d - 9,
    w: 28,
    d: 4,
    r: 1,
  };
  out.push(S(k.slabOf(slot, FEEDER_H, 0.4, P, 3), "lo", { crease: "none" }));
  out.push(
    D(
      k
        .corners(k.insetPlan(FEEDER, 2), 3)
        .map(([x, y]) => at([x, y, FEEDER_H])),
      "mid",
      0.45
    )
  );
  const chute: Plan = {
    x: FEEDER.x + FEEDER.w,
    y: FEEDER.y + 2,
    w: 8,
    d: 16,
    r: 1,
  };
  out.push(S(k.slabOf(chute, 6, 4, P, 3, 0.4)));
  out.push(
    L(
      k.lineOnTop(
        [chute.x, chute.y + 3],
        [chute.x + chute.w, chute.y + 3],
        10,
        P
      ),
      "faint"
    )
  );
  out.push(
    L(
      k.lineOnTop(
        [chute.x, chute.y + chute.d - 3],
        [chute.x + chute.w, chute.y + chute.d - 3],
        10,
        P
      ),
      "faint"
    )
  );
  return out;
}

export const needleOf = (turn: number) => {
  const a = turn * Math.PI * 2;
  const [cx, cy] = DIAL;
  const tip: [number, number] = [
    cx + Math.sin(a) * (DIAL_R - 3),
    cy - Math.cos(a) * (DIAL_R - 3),
  ];
  const tail: [number, number] = [cx - Math.sin(a) * 3, cy + Math.cos(a) * 3];
  return k.lineOnTop(tail, tip, DIAL_Z, P);
};
export const DIAL_HUB = at([DIAL[0], DIAL[1], DIAL_Z]);

function rack(): Item[] {
  const out: Item[] = [];
  out.push(S(k.slabOf(RACK, 0, RACK_H, P, 3, 0.5)));
  out.push(
    L(
      k.lineOnTop(
        [RACK.x + 2, RACK.y + RACK.d / 2],
        [RACK.x + RACK.w - 2, RACK.y + RACK.d / 2],
        RACK_H,
        P
      ),
      "faint"
    )
  );
  out.push(
    D(
      [
        at([RACK.x + 2.5, RACK.y + 2.5, RACK_H]),
        at([RACK.x + RACK.w - 2.5, RACK.y + RACK.d - 2.5, RACK_H]),
      ],
      "mid",
      0.4
    )
  );
  const heights = [24, 21, 19, 17, 15, 13, 11, 9];
  heights.forEach((h, i) => {
    const plan: Plan = {
      x: RACK.x + 5 + i * 6.4,
      y: RACK.y + 2,
      w: 1.6,
      d: RACK.d - 4,
      r: 0.3,
    };
    out.push(
      S(k.slabOf(plan, RACK_H, h, P, 2), i === 0 ? "hi" : "mid", {
        crease: "none",
      })
    );
  });
  return out;
}

function cabinet(): Item[] {
  const out: Item[] = [{ kind: "halo", d: k.haloOf(CAB, 0, 2, P) }];
  out.push(S(k.slabOf(k.insetPlan(CAB, -1.5), 0, PLINTH, P, 4, 0.5), "mid"));
  out.push(S(k.slabOf(CAB, PLINTH, CAB_TOP - PLINTH, P, 4, 0.6), "mid"));
  out.push(S(k.slabOf(k.insetPlan(CAB, -1.5), CAB_TOP, 3, P, 4, 0.6), "mid"));
  out.push(L(k.planOutline(k.insetPlan(CAB, 4), CAB_TOP + 3, P), "faint"));
  out.push(
    D(
      k.corners(CAB, 2.5).map(([x, y]) => at([x, y, CAB_TOP + 3])),
      "mid",
      0.45
    )
  );
  for (const z of [PLINTH + 0.01, CAB_TOP - 0.01]) {
    out.push(
      L(
        k.segment(
          [CAB.x + CAB.w, CAB.y + 2, z],
          [CAB.x + CAB.w, CAB_FRONT - 2, z],
          P
        ),
        "faint"
      )
    );
  }
  return out;
}

function lock(): Item[] {
  const [x, y] = [CAB.x + CAB.w - 14, CAB.y + 14];
  const z = CAB_TOP + 3;
  return [
    S(k.cylinder(x, y, 6, z, 1.6, P, 32, 0.3)),
    S(k.cylinder(x, y, 4.2, z + 1.6, 3, P, 32, 0.3), "hi", { crease: "lo" }),
    L(k.knurl(x, y, 6, z, z + 1.6, 40, P, 0.3), "lo"),
    L(k.lineOnTop([x, y - 2.4], [x, y + 2.4], z + 4.6, P), "mid"),
    D([at([x, y - 2.4, z + 4.6])], "hi", 0.5),
  ];
}

const PORT: Plan = { x: CAB.x + CAB.w, y: -10, w: 3, d: 20, r: 1 };
const PLUG: Plan = { x: PORT.x + 3, y: -6, w: 9, d: 12, r: 1.5 };

function port(): Item[] {
  return [
    S(k.slabOf(PORT, PORT_Z - 8, 16, P, 3, 0.4)),
    D(
      [
        at([PORT.x + 3, PORT.y + 2, PORT_Z + 6]),
        at([PORT.x + 3, PORT.y + PORT.d - 2, PORT_Z - 6]),
      ],
      "mid",
      0.45
    ),
    S(k.slabOf(PLUG, PORT_Z - 5, 10, P, 3, 0.5), "hi", { crease: "lo" }),
    L(
      k.segment(
        [PLUG.x + 3, PLUG.y + PLUG.d, PORT_Z - 5],
        [PLUG.x + 3, PLUG.y + PLUG.d, PORT_Z + 5],
        P
      ),
      "faint"
    ),
    L(
      k.segment(
        [PLUG.x + 6, PLUG.y + PLUG.d, PORT_Z - 5],
        [PLUG.x + 6, PLUG.y + PLUG.d, PORT_Z + 5],
        P
      ),
      "faint"
    ),
  ];
}

export const CABLE: Flat[] = [
  at([PLUG.x + PLUG.w, 0, PORT_Z]),
  at([PLUG.x + PLUG.w + 10, 0, PORT_Z - 6]),
  at([PLUG.x + PLUG.w + 16, 2, 1]),
  at([CLIENT.x - 4, 6, 0.5]),
  at([CLIENT.x, 8, CLIENT_H / 2]),
];

function client(): Item[] {
  const out: Item[] = [{ kind: "halo", d: k.haloOf(CLIENT, 0, 1, P) }];
  out.push(S(k.slabOf(CLIENT, 0, CLIENT_H, P, 5, 0.6)));
  out.push(L(k.sideSeam(CLIENT, CLIENT_H / 2, P), "faint"));
  const keys = k.dotGrid(CLIENT.x + 16, CLIENT.y + 6, 6, 6, 4.6, CLIENT_H, P);
  out.push(D(keys, "lo", 0.7));
  out.push(S(k.slabOf(SCREEN, CLIENT_H, SCREEN_H, P, 3, 0.5)));
  out.push(
    S(
      k.slabOf(
        { x: SCREEN.x + 2, y: SCREEN.y + 14, w: 6, d: 8, r: 1 },
        CLIENT_H,
        3,
        P,
        3
      ),
      "mid"
    )
  );
  return out;
}

/** Rule lines on the client screen (the +x face of SCREEN). They stand for
 *  text that arrives over the cable, so the figure lights them. */
export const SCREEN_LINES = [26, 20, 30, 16].map((w, i) => {
  const x = SCREEN.x + SCREEN.w + 0.01;
  const z = CLIENT_H + SCREEN_H - 6 - i * 5;
  return k.segment([x, SCREEN.y + 4, z], [x, SCREEN.y + 4 + w, z], P);
});
export const LED = at([
  CLIENT.x + CLIENT.w - 5,
  CLIENT.y + CLIENT.d - 5,
  CLIENT_H,
]);

export type Drawer = {
  tray: Item[];
  slot: string;
  pull: string;
  clip: string;
};

function convexHull(points: Flat[]) {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Flat, a: Flat, b: Flat) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Flat[]) => {
    const out: Flat[] = [];
    for (const p of list) {
      while (
        out.length >= 2 &&
        cross(out[out.length - 2], out[out.length - 1], p) <= 0
      )
        out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return k.pathOf([...half(pts), ...half([...pts].reverse())], true);
}

const hull = (plan: Plan, z0: number, z1: number) =>
  convexHull(k.boxCorners(plan, z0, z1).map(at));

const slotZ = (index: number) => CAB_TOP - 2 - SLOT * (index + 1);

function drawer(index: number, cards: number[]): Drawer {
  const z = slotZ(index) + 1;
  const h = SLOT - 2;
  const face: Plan = {
    x: CAB.x + 3,
    y: CAB_FRONT,
    w: CAB.w - 6,
    d: 2.4,
    r: 0.6,
  };
  const box: Plan = {
    x: face.x + 0.5,
    y: CAB_FRONT - PULL,
    w: face.w - 1,
    d: PULL,
    r: 0.6,
  };
  const tray: Item[] = [S(k.slabOf(box, z, h - 2, P, 3, 0.3), "mid")];
  tray.push({
    kind: "solid",
    paths: k.slabOf(k.insetPlan(box, 1.4), z + h - 2.01, 0.01, P, 3),
    tone: "lo",
    crease: "none",
  });
  const span = box.d - 8;
  cards.forEach((ch, i) => {
    const y =
      box.y +
      4 +
      (cards.length === 1 ? span / 2 : (i / (cards.length - 1)) * span);
    const plan: Plan = { x: box.x + 5, y, w: box.w - 10, d: 0.8, r: 0.2 };
    const last = i === cards.length - 1;
    tray.push(
      S(k.slabOf(plan, z + 1.5, h - 3.5 + ch, P, 2), last ? "hi" : "mid", {
        crease: "none",
        lit: last,
      })
    );
  });
  tray.push(S(k.slabOf(face, z, h, P, 3, 0.4), "mid"));
  const handle: Plan = {
    x: face.x + face.w / 2 - 9,
    y: CAB_FRONT + 2.4,
    w: 18,
    d: 2,
    r: 0.8,
  };
  tray.push(
    S(k.slabOf(handle, z + h / 2 - 1.2, 2.4, P, 3, 0.3), "hi", {
      crease: "none",
    })
  );
  const card: Plan = {
    x: face.x + 4,
    y: CAB_FRONT + 2.4,
    w: 12,
    d: 0.4,
    r: 0.2,
  };
  tray.push(S(k.slabOf(card, z + 2.5, 6, P, 2), "lo", { crease: "none" }));
  tray.push(
    L(
      [7, 5]
        .map((w, i) =>
          k.segment(
            [card.x + 2, card.y + 0.41, z + 6.5 - i * 2],
            [card.x + 2 + w, card.y + 0.41, z + 6.5 - i * 2],
            P
          )
        )
        .join(""),
      "mid"
    )
  );
  tray.push(
    D(
      [
        at([face.x + face.w - 3, CAB_FRONT + 2.4, z + 2]),
        at([face.x + face.w - 3, CAB_FRONT + 2.4, z + h - 2]),
      ],
      "mid",
      0.4
    )
  );

  const reach = CAB_FRONT + PULL + 8;
  return {
    tray,
    slot: k.slabOf(face, z, h, P, 3).fill,
    pull: k.translateAlong(P, [0, PULL, 0]),
    clip: convexHull([
      at([face.x - 0.5, CAB_FRONT, z - 1]),
      at([face.x + face.w + 0.5, CAB_FRONT, z - 1]),
      at([face.x - 0.5, CAB_FRONT, z + h]),
      at([face.x + face.w + 0.5, CAB_FRONT, z + h]),
      at([face.x - 0.5, reach, z - 1]),
      at([face.x + face.w + 0.5, reach, z - 1]),
      at([face.x - 0.5, reach, z + h + 14]),
      at([face.x + face.w + 0.5, reach, z + h + 14]),
    ]),
  };
}

export const DRAWERS: Drawer[] = TOOL_PARTS.map((part, index) =>
  drawer(index, part.cards)
);

export const ART = {
  base: base(),
  feeder: feeder(),
  rack: rack(),
  cabinet: cabinet(),
  lock: lock(),
  port: port(),
  client: client(),
};

export const HITS = {
  ingest: hull(FEEDER, 0, DIAL_Z),
  edition: hull(RACK, 0, RACK_H + 24),
  operator: hull(
    { x: CAB.x + CAB.w - 22, y: CAB.y + 6, w: 16, d: 16, r: 0 },
    CAB_TOP,
    CAB_TOP + 8
  ),
  port: hull(
    { x: PORT.x, y: PORT.y, w: PLUG.w + 6, d: PORT.d, r: 0 },
    PORT_Z - 10,
    PORT_Z + 10
  ),
  client: hull({ ...CLIENT, w: CLIENT.w }, 0, CLIENT_H + SCREEN_H),
};
