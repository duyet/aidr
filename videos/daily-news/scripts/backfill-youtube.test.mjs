// node --test videos/daily-news/scripts/backfill-youtube.test.mjs
// The backfill's safety rules: pace to the quota, oldest first, never plan a cut that has an id, never post to
// Facebook or Telegram. Pure functions; fixtures are built here at runtime.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildStories,
  commandsFor,
  isAuthError,
  isQuotaError,
  MAX_UPLOADS_PER_DAY,
  missingCuts,
  parseBullets,
  pickWork,
  scanDates,
  uploadBudget,
} from "./backfill-youtube.mjs";
import { formatsOf } from "./lang.mjs";

const ID = "abcdefghijk";
const page = (id16, id9) => ({ "16x9": id16, "9x16": id9 });

test("missingCuts: one cut per absent id, none for a date without a day page", () => {
  assert.deepEqual(missingCuts("2026-10-20", { en: {}, vi: {} }), []);
  assert.deepEqual(
    missingCuts("2026-10-20", {
      en: page(undefined, undefined),
      vi: page(),
    }).map((c) => c.cut),
    ["youtube", "short", "visub"]
  );
  assert.deepEqual(
    missingCuts("2026-10-20", { en: page(ID, ID), vi: page(ID) }),
    []
  );
  assert.deepEqual(
    missingCuts("2026-10-20", { en: page(ID, undefined), vi: page(ID) }).map(
      (c) => c.cut
    ),
    ["short"]
  );
});

test("uploadBudget: the daily run's uploads stay on the quota, and 5 is the ceiling", () => {
  assert.equal(MAX_UPLOADS_PER_DAY, 5);
  assert.equal(uploadBudget({ limit: 4, reserve: 0 }), 4);
  assert.equal(uploadBudget({ limit: 9, reserve: 0 }), 5);
  // 10,000 units - 3 daily uploads (5,100) leaves room for 2 more.
  assert.equal(uploadBudget({ limit: 4 }), 2);
  assert.equal(uploadBudget({ limit: 4, reserve: 6 }), 0);
});

test("pickWork: oldest date first, counted in cuts, a date may be taken in part", () => {
  const days = [
    {
      date: "2026-10-22",
      cuts: missingCuts("2026-10-22", { en: page(), vi: page() }),
    },
    {
      date: "2026-10-20",
      cuts: missingCuts("2026-10-20", { en: page(), vi: page() }),
    },
  ];
  const plan = pickWork(days, 4);
  assert.deepEqual(
    plan.map((p) => [p.date, p.cuts.length]),
    [
      ["2026-10-20", 3],
      ["2026-10-22", 1],
    ]
  );
  assert.deepEqual(pickWork(days, 0), []);
});

test("pickWork is idempotent: a finished cut is never planned again", () => {
  const days = [
    {
      date: "2026-10-20",
      cuts: missingCuts("2026-10-20", { en: page(), vi: page() }),
    },
  ];
  const first = pickWork(days, 2);
  const done = new Set(
    first.flatMap((p) => p.cuts.map((c) => `${c.date}:${c.cut}`))
  );
  const second = pickWork(days, 5, done);
  assert.deepEqual(
    second[0].cuts.map((c) => c.cut),
    ["visub"]
  );
  // The day page now has the ids (what a live run leaves): nothing is missing, nothing is planned.
  const all = { en: page(ID, ID), vi: page(ID) };
  assert.deepEqual(
    pickWork([{ date: "2026-10-20", cuts: missingCuts("2026-10-20", all) }], 5),
    []
  );
});

test("scanDates looks back from yesterday and never includes today", () => {
  assert.deepEqual(scanDates("2026-11-01", 3), [
    "2026-10-31",
    "2026-10-30",
    "2026-10-29",
  ]);
});

test("commandsFor never runs facebook or telegram, and keeps each run to the formats it needs", () => {
  const cuts = missingCuts("2026-10-20", {
    en: page(ID, undefined),
    vi: page(),
  });
  const cmds = commandsFor("2026-10-20", cuts);
  const text = JSON.stringify(cmds);
  assert.doesNotMatch(text, /facebook|telegram|check/);
  const en = cmds.find((c) => c.args.includes("en"));
  assert.equal(en.env.AIDR_FORMATS, "9x16");
  assert.ok(en.args.includes("render,gate,upload,attach"));
  assert.ok(en.args.includes("api"));
  assert.equal(
    cmds.find((c) => c.args.includes("visub")).env.AIDR_FORMATS,
    "16x9"
  );
  // visub alone still needs the English build (voice, timing), without an English upload.
  const only = commandsFor(
    "2026-10-20",
    cuts.filter((c) => c.cut === "visub")
  );
  assert.deepEqual(
    only.map((c) => c.script),
    ["auto-script.mjs", "daily.mjs", "publish.mjs"]
  );
});

test("AIDR_FORMATS narrows the formats a cut renders, and unset changes nothing", () => {
  const config = { formats: { "16x9": {}, "9x16": {} } };
  const en = { formats: null };
  assert.deepEqual(formatsOf(en, config, {}), ["16x9", "9x16"]);
  assert.deepEqual(formatsOf(en, config, { AIDR_FORMATS: "9x16" }), ["9x16"]);
  assert.deepEqual(
    formatsOf({ formats: ["16x9"] }, config, { AIDR_FORMATS: "9x16" }),
    []
  );
});

test("edition from a day page: linked bullets only, Vietnamese matched by story id", async () => {
  const bullet = (text, id, tag) =>
    `- ${text}${id ? ` ([${tag}](https://aidr.today/${id}?lang=en))` : ""}`;
  const ids = ["a1b2c3d4", "b1b2c3d4", "c1b2c3d4", "d1b2c3d4"];
  const enMd = [
    "# t",
    "",
    "## AI;DR",
    "",
    bullet("Lead without a link", null),
    ...ids.map((id, i) => bullet(`Story ${i}\\.`, id, "story")),
    "",
    "## Ranked stories",
    "- x",
  ].join("\n");
  const viMd = [
    "## AI;DR",
    ...[...ids].reverse().map((id) => bullet(`Tin ${id}`, id, "tin")),
  ].join("\n");
  assert.equal(parseBullets(enMd).length, 5);
  assert.equal(parseBullets(enMd)[1].text, "Story 0.");
  const stories = await buildStories({
    enMd,
    viMd,
    count: 3,
    story: async (id) => ({
      title: `T ${id}`,
      url: "https://www.example.com/x",
      category: "Tools",
      image_url: `https://img.example/${id}.png`,
    }),
  });
  assert.equal(stories.length, 3);
  assert.equal(stories[0].permalink, "https://aidr.today/a1b2c3d4");
  assert.equal(stories[0].text_vi, "Tin a1b2c3d4");
  assert.equal(stories[0].source, "example.com");
  assert.deepEqual(stories[0].urls, ["https://img.example/a1b2c3d4.png"]);
  await assert.rejects(
    buildStories({
      enMd: "## AI;DR\n" + bullet("one", ids[0], "story"),
      viMd: "",
      count: 6,
      story: async () => ({}),
    }),
    /need 3/
  );
});

test("a quota stop and a rejected token are told apart from a plain failure", () => {
  assert.ok(isQuotaError("FAIL: upload: 403 quotaExceeded"));
  assert.ok(
    isAuthError(
      "FAIL: token: invalid_grant (Token has been expired or revoked)"
    )
  );
  assert.ok(!isQuotaError("FAIL: ffprobe"));
  assert.ok(!isAuthError("FAIL: ffprobe"));
});
