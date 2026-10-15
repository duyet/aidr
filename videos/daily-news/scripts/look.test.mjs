// node --test videos/daily-news/scripts/*.test.mjs
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { templateScript } from "./auto-script.mjs";
import { dayNumber, resolveLook, rotate, rotatePair } from "./look.mjs";
import { AXES } from "./looks/index.mjs";
import { applyScreen } from "./visub-screen.mjs";
import { isoWeekOf } from "./week.mjs";

const ROOT = resolve(import.meta.dirname, "..");
const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const hosts = ["alex", "allison", "tyler-cruz", "ivanna", "kristen"];
const DAY = 86400000;
const datesFrom = (start, n) =>
  Array.from({ length: n }, (_, i) =>
    new Date(Date.parse(`${start}T00:00:00Z`) + i * DAY)
      .toISOString()
      .slice(0, 10)
  );
const POOLS = [
  ["paper", "soft"],
  ["wipe", "ink", "shutter"],
  ["a", "b", "c", "d"],
];

test("CI's script for the next day gets a different transition and background (no look is written into the script)", () => {
  const e13 = read(join(ROOT, "editions/2026-10-13/edition.json"));
  const e14 = { ...e13, date: "2026-10-14" };
  const s13 = templateScript(e13, hosts);
  const s14 = templateScript(e14, hosts);
  assert.equal("theme" in s13, false);
  const [a, b] = [resolveLook(s13, e13), resolveLook(s14, e14)];
  assert.notEqual(a.transition, b.transition);
  assert.notEqual(a.background, b.background);
  assert.notEqual(a.intro, b.intro);
});

test("rotate never repeats on adjacent days over two years, for pools of 2, 3 and 4", () => {
  const days = datesFrom("2026-01-01", 731).map(dayNumber);
  for (const pool of POOLS)
    for (const axis of ["transition", "background", "x"])
      for (let i = 1; i < days.length; i++)
        assert.notEqual(
          rotate(pool, days[i], axis),
          rotate(pool, days[i - 1], axis),
          `${pool.length} ids, ${axis}, day ${days[i]}`
        );
});

test("rotate never repeats on adjacent weeks over two years, across a 53-week year", () => {
  const keys = datesFrom("2026-01-05", 104 * 7)
    .filter((_, i) => i % 7 === 0)
    .map((d) => `week-${isoWeekOf(d)}`);
  assert.ok(keys.includes("week-2026-W53") && keys.includes("week-2027-W01"));
  const weeks = keys.map(dayNumber);
  for (let i = 1; i < weeks.length; i++)
    assert.equal(weeks[i], weeks[i - 1] + 1, keys[i]);
  for (const pool of POOLS)
    for (let i = 1; i < weeks.length; i++)
      assert.notEqual(
        rotate(pool, weeks[i], "transition"),
        rotate(pool, weeks[i - 1], "transition"),
        `${pool.length} ids, ${keys[i]}`
      );
});

test("rotate shows every id once per cycle, and the same day always gets the same id whatever the list order", () => {
  const start = dayNumber("2026-01-01");
  for (const pool of POOLS) {
    const n = pool.length;
    const first = Math.ceil(start / n) * n;
    for (let c = 0; c < 730 / n; c++) {
      const cycle = Array.from({ length: n }, (_, i) =>
        rotate(pool, first + c * n + i, "background")
      );
      assert.deepEqual(
        [...cycle].sort(),
        [...pool].sort(),
        `cycle starting day ${first + c * n}`
      );
    }
    for (let day = start; day < start + 60; day++)
      assert.equal(
        rotate([...pool].reverse(), day, "background"),
        rotate(pool, day, "background")
      );
  }
});

// Every auto intro is frame-0 safe (looks.test.mjs), so the opening rotates like the other axes; a pin-shaped
// default would freeze it on the grid again.
test("the unpinned intro rotates over every auto intro and never repeats on adjacent days", () => {
  const auto = AXES.intro.filter((e) => e.auto).map((e) => e.id);
  assert.ok(auto.length >= 4, auto.join(", "));
  const intros = datesFrom("2026-01-01", 365).map(
    (date) => resolveLook({}, { date }).intro
  );
  for (let i = 1; i < intros.length; i++)
    assert.notEqual(intros[i], intros[i - 1], `day ${i}`);
  assert.deepEqual([...new Set(intros)].sort(), [...auto].sort());
});

test("a theme in script.json pins that axis; the others still rotate", () => {
  const e13 = { date: "2026-10-13" };
  const free = resolveLook({}, e13);
  const other = ["wipe", "ink", "shutter"].find((t) => t !== free.transition);
  const look = resolveLook(
    { theme: { transition: other, intro: "date-slam", accent: "#E0B000" } },
    e13
  );
  assert.deepEqual(look, {
    intro: "date-slam",
    transition: other,
    background: rotate(
      ["paper", "soft", "grid"],
      dayNumber("2026-10-13"),
      "background"
    ),
    choreography: free.choreography,
    accent: "#E0B000",
    layouts: {},
    notes: [],
  });
});

test("an unknown theme id or axis fails instead of falling back", () => {
  const e = { date: "2026-10-13" };
  assert.throws(
    () => resolveLook({ theme: { transition: "inq" } }, e),
    /script\.theme\.transition "inq": unknown; use wipe \| ink \| shutter/
  );
  assert.throws(
    () => resolveLook({ theme: { background: "ink" } }, e),
    /script\.theme\.background "ink"/
  );
  assert.throws(
    () => resolveLook({ theme: { transtion: "ink" } }, e),
    /script\.theme\.transtion: unknown/
  );
  assert.throws(
    () => resolveLook({}, { date: "2026-13" }),
    /look key "2026-13"/
  );
});

const committed = () =>
  readdirSync(join(ROOT, "editions"))
    .map((d) => [join(ROOT, "editions", d, "script.json"), d])
    .filter(([p]) => existsSync(p))
    .map(([p, d]) => [
      p,
      read(p),
      read(join(ROOT, "editions", d, "edition.json")),
    ]);
const dayAxes = ({ layouts, notes, ...axes }) => axes;

test("a committed script.json theme pins the whole look it shipped with", () => {
  const pinned = committed().filter(([, script]) => script.theme);
  assert.ok(
    pinned.length >= 4,
    `only ${pinned.length} committed scripts carry a theme`
  );
  for (const [p, script, edition] of pinned)
    assert.deepEqual(dayAxes(resolveLook(script, edition)), script.theme, p);
});

test("every committed script.json resolves to the story layouts it shipped with", () => {
  const scripts = committed();
  assert.ok(scripts.length >= 4, `only ${scripts.length} committed scripts`);
  for (const [p, script, edition] of scripts) {
    const look = resolveLook(script, edition);
    assert.deepEqual(
      look.layouts,
      Object.fromEntries(script.stories.map((s) => [s.rank, s.layout])),
      p
    );
    assert.deepEqual(look.notes, [], p);
  }
});

const e13 = () => read(join(ROOT, "editions/2026-10-13/edition.json"));
const withStory = (script, rank, patch) => ({
  ...script,
  stories: script.stories.map((s) =>
    s.rank === rank ? { ...s, ...patch } : s
  ),
});
const unpinned = (script) => ({
  ...script,
  theme: undefined,
  stories: script.stories.map(({ layout: _, ...s }) => s),
});
/** Layout ids in script order, after checking there is exactly one per story. */
function layoutIds(script, edition) {
  const { layouts } = resolveLook(script, edition);
  const ranks = script.stories.map((s) => s.rank);
  assert.deepEqual(
    Object.keys(layouts ?? {})
      .map(Number)
      .sort(),
    [...ranks].sort(),
    "one layout per story"
  );
  return ranks.map((r) => layouts[r]);
}

test("a story whose images all failed never gets full, even when its script asks for it", () => {
  const edition = e13();
  const script = templateScript(edition, hosts);
  for (const s of script.stories)
    assert.equal(
      "layout" in s,
      false,
      `the template wrote a layout for story ${s.rank}`
    );
  assert.equal(
    resolveLook(script, edition).layouts?.[4],
    "full",
    "story 4 with its images takes full"
  );
  assert.equal(
    resolveLook(withStory(script, 4, { images: [] }), edition).layouts?.[4],
    "statement"
  );

  const pinned = resolveLook(
    withStory(script, 4, { images: [], layout: "full" }),
    edition
  );
  assert.equal(pinned.layouts?.[4], "statement");
  assert.deepEqual(pinned.notes, [
    'story 4: layout "full" needs an image; chose statement',
  ]);
});

// The poster panel is the cover story's scene: a chooser that ignored the registry's `suits` (or the thumb) would
// never show it, and a second poster would make the cover story's look ordinary.
test("the cover (thumb) story gets the poster panel, with or without an image, and only it", () => {
  const edition = e13();
  const script = templateScript(edition, hosts);
  for (const thumb of [1, 2, 6]) {
    const ids = layoutIds({ ...script, thumb: { story: thumb } }, edition);
    assert.deepEqual(
      script.stories.filter((_, i) => ids[i] === "poster").map((s) => s.rank),
      [thumb],
      `thumb ${thumb}: ${ids.join(" ")}`
    );
  }
  const none = layoutIds({ ...script, thumb: undefined }, edition);
  assert.ok(!none.includes("poster"), "no thumb, no poster");
  const pin = resolveLook(
    withStory({ ...script, thumb: { story: 1 } }, 1, { layout: "full" }),
    edition
  );
  assert.equal(pin.layouts[1], "full", "a pinned layout beats the poster");
});

test("a pinned layout wins over the rules, and an unknown one fails the build", () => {
  const edition = e13();
  const script = templateScript(edition, hosts);
  assert.equal(
    resolveLook(script, edition).layouts?.[1],
    "split",
    "the rules give story 1 split"
  );
  const look = resolveLook(withStory(script, 1, { layout: "stat" }), edition);
  assert.equal(look.layouts?.[1], "stat");
  assert.deepEqual(look.notes, []);
  assert.throws(
    () => resolveLook(withStory(script, 2, { layout: "fullbleed" }), edition),
    /script\.stories rank 2 layout "fullbleed": unknown; use split \| full \| stat/
  );

  const stats = {
    stories: [1, 2, 3].map((rank) => ({
      rank,
      images: ["assets/a.jpg"],
      layout: "stat",
    })),
  };
  const over = resolveLook(stats, {
    date: "2026-10-13",
    stories: [1, 2, 3].map((rank) => ({ rank, text: "A plain story." })),
  });
  assert.deepEqual(
    over.layouts,
    { 1: "stat", 2: "stat", 3: "stat" },
    "a pin beats max and the three-in-a-row rule"
  );
  assert.deepEqual(over.notes, []);
});

/** Three of one id in a row only when no other id is eligible; stat and statement at most twice, poster once. */
function assertSpread(ids, script, label) {
  const count = (id, upto = ids.length) =>
    ids.slice(0, upto).filter((x) => x === id).length;
  for (const [i, id] of ids.entries()) {
    if (i >= 2 && id === ids[i - 1] && id === ids[i - 2]) {
      const imageless = !script.stories[i].images?.length;
      assert.ok(
        id === "split" &&
          imageless &&
          count("stat", i) >= 2 &&
          count("statement", i) >= 2,
        `${label}: ${id} three times in a row at story ${script.stories[i].rank} (${ids.join(" ")})`
      );
    }
  }
  for (const [id, max] of [
    ["stat", 2],
    ["statement", 2],
    ["poster", 1],
  ])
    assert.ok(
      count(id) <= max,
      `${label}: ${count(id)} ${id} layouts (${ids.join(" ")})`
    );
}

test("no layout shows three times in a row while another fits, and stat shows at most twice unless pinned", () => {
  for (const [p, script, edition] of committed())
    assertSpread(layoutIds(unpinned(script), edition), script, p);

  const day = (stories) => [
    { stories: stories.map(({ rank, images }) => ({ rank, images })) },
    {
      date: "2026-10-13",
      stories: stories.map(({ rank, text }) => ({ rank, text })),
    },
  ];
  const many = (story) =>
    Array.from({ length: 9 }, (_, i) => ({ rank: i + 1, ...story }));
  const cases = {
    "all image-less": many({ images: [], text: "A plain story." }),
    "all with images": many({
      images: ["assets/a.jpg"],
      text: "A plain story.",
    }),
    "all money": many({
      images: ["assets/a.jpg"],
      text: "It raised $40B today.",
    }),
    "all money, image-less": many({
      images: [],
      text: "It raised $40B today.",
    }),
  };
  for (const [label, stories] of Object.entries(cases)) {
    const [script, edition] = day(stories);
    assertSpread(layoutIds(script, edition), script, label);
  }

  const [script, edition] = day([
    { rank: 1, images: ["assets/a.jpg"], text: "A plain story." },
    { rank: 2, images: [], text: "A paper." },
    { rank: 3, images: [], text: "Another paper." },
    { rank: 4, images: [], text: "A third paper." },
  ]);
  assert.deepEqual(
    layoutIds(script, edition),
    ["split", "statement", "statement", "split"],
    "image-less stories take the statement scene twice, then the paper card"
  );
});

test("the English and visub cuts get the same layouts", () => {
  const date = "2026-10-13";
  const edition = read(join(ROOT, "editions", date, "edition.json"));
  const en = unpinned(read(join(ROOT, "editions", date, "script.json")));
  const vi = applyScreen(
    en,
    edition,
    read(join(ROOT, "editions", date, "screen.visub.json")).fields
  );
  assert.deepEqual(layoutIds(vi, edition), layoutIds(en, edition));
  const dollars = withStory(en, 1, {
    stat: "$40B",
    headline: "It raised *$40B*",
  });
  assert.deepEqual(
    layoutIds(dollars, edition),
    layoutIds(en, edition),
    "money reads the edition's English bullet, not the screen text"
  );
});

const lookOn = (date, theme) => resolveLook(theme ? { theme } : {}, { date });
const combo = (l) => `${l.transition}/${l.background}`;
const TWO_YEARS = datesFrom("2026-01-01", 731);

test("the unpinned look changes both transition and background every day, and never goes A B A B", () => {
  const looks = TWO_YEARS.map((d) => lookOn(d));
  for (let i = 1; i < looks.length; i++) {
    assert.notEqual(looks[i].transition, looks[i - 1].transition, TWO_YEARS[i]);
    assert.notEqual(looks[i].background, looks[i - 1].background, TWO_YEARS[i]);
  }
  for (let i = 2; i < looks.length; i++)
    assert.notEqual(
      combo(looks[i]),
      combo(looks[i - 2]),
      `${TWO_YEARS[i]} repeats the look two days ago`
    );
});

test("no whole look repeats within any window of 9 days, so all 9 combinations show before one returns", () => {
  const combos = TWO_YEARS.map((d) => combo(lookOn(d)));
  for (let i = 0; i + 9 <= combos.length; i++)
    assert.equal(
      new Set(combos.slice(i, i + 9)).size,
      9,
      `window from ${TWO_YEARS[i]}`
    );
});

test("the unpinned look is deterministic", () => {
  for (const d of TWO_YEARS.slice(0, 60))
    assert.deepEqual(lookOn(d), lookOn(d));
});

test("a pin on one axis leaves the other rotating with no adjacent repeats", () => {
  for (const [axis, id, other] of [
    ["transition", "ink", "background"],
    ["background", "soft", "transition"],
  ]) {
    const looks = TWO_YEARS.map((d) => lookOn(d, { [axis]: id }));
    for (let i = 0; i < looks.length; i++) assert.equal(looks[i][axis], id);
    for (let i = 1; i < looks.length; i++)
      assert.notEqual(
        looks[i][other],
        looks[i - 1][other],
        `${axis} pinned, ${TWO_YEARS[i]}`
      );
  }
});

test("rotatePair rejects pools it cannot walk", () => {
  assert.throws(
    () => rotatePair(["a", "b"], ["c", "d"], 0, "x", "y"),
    /same size >= 3/
  );
  assert.throws(
    () => rotatePair(["a", "b", "c"], ["d", "e", "f", "g"], 0, "x", "y"),
    /same size >= 3/
  );
});

// A new rotating axis must not reshuffle the days already planned: rotatePair only walks transition and
// background, so a third free axis (intro, choreography) leaves their schedule as #631 shipped it.
test("the new axes leave the transition/background schedule of #631 as it was", () => {
  const was = {
    "2026-10-14": "shutter/grid",
    "2026-10-15": "ink/soft",
    "2026-10-16": "wipe/grid",
    "2026-10-17": "shutter/soft",
    "2026-10-18": "ink/paper",
    "2026-10-22": "wipe/paper",
    "2026-10-27": "ink/paper",
  };
  for (const [date, c] of Object.entries(was))
    assert.equal(combo(resolveLook({}, { date })), c, date);
});

const DAY_AXES = Object.fromEntries(
  Object.entries(AXES).map(([axis, list]) => [
    axis,
    list.filter((e) => e.auto).map((e) => e.id),
  ])
);
const dayLook = (l) => Object.keys(DAY_AXES).map((axis) => l[axis]);

// Two weeks of CI days from launch: what a regular viewer sees. A rotation bug (an axis frozen by a pin-shaped
// default, a pool that stopped rotating, a pair that ping-pongs) shows up here as a repeat or a missing variant.
test("over two weeks of CI days, no day repeats yesterday's intro or look and every variant shows", () => {
  const days = datesFrom("2026-10-16", 14);
  const looks = days.map((date) => lookOn(date));
  for (let i = 1; i < looks.length; i++) {
    const [a, b] = [looks[i - 1], looks[i]];
    for (const [axis, pool] of Object.entries(DAY_AXES))
      if (pool.length > 1)
        assert.notEqual(b[axis], a[axis], `${days[i]} repeats ${axis}`);
    assert.notDeepEqual(dayLook(b), dayLook(a), days[i]);
  }
  for (const [axis, pool] of Object.entries(DAY_AXES))
    assert.deepEqual(
      [...new Set(looks.map((l) => l[axis]))].sort(),
      [...pool].sort(),
      `${axis} over ${days[0]}..${days.at(-1)}`
    );
});

// "Regularly": each cycle of a rotating axis is a permutation of its pool, so any 2n - 1 days hold a full cycle.
test("every rotating variant shows within any 2n - 1 days of its axis over two years (n = its pool size)", () => {
  const looks = TWO_YEARS.map((d) => lookOn(d));
  for (const [axis, pool] of Object.entries(DAY_AXES)) {
    const N = Math.max(1, 2 * pool.length - 1);
    for (let i = 0; i + N <= looks.length; i++)
      assert.deepEqual(
        [...new Set(looks.slice(i, i + N).map((l) => l[axis]))].sort(),
        [...pool].sort(),
        `${axis}: window of ${N} days from ${TWO_YEARS[i]}`
      );
  }
});
