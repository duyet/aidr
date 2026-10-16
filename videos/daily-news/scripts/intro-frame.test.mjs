// Frame 0 is the thumbnail. These tests lay the intro out in headless Chrome and measure where its text lands.
// GSAP is stubbed: tween values at frame 0 are checked in looks.test.mjs, so this file needs no network.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { ROOT, runBuild, scratchRoot } from "./scratch-root.mjs";

const read = (p) => JSON.parse(readFileSync(p, "utf8"));
const cleanups = [];
after(() => {
  for (const c of cleanups) c();
});

// CHROME_PATH, else the headless shell that hyperframes or puppeteer installed, else a Chrome on PATH.
function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const [cache, sub] of [
    [
      ".cache/hyperframes/chrome/chrome-headless-shell",
      "chrome-headless-shell-linux64/chrome-headless-shell",
    ],
    [
      ".cache/puppeteer/chrome-headless-shell",
      "chrome-headless-shell-linux64/chrome-headless-shell",
    ],
  ]) {
    const dir = join(homedir(), cache);
    if (!existsSync(dir)) continue;
    for (const v of readdirSync(dir).sort().reverse())
      if (existsSync(join(dir, v, sub))) return join(dir, v, sub);
  }
  for (const bin of ["google-chrome", "google-chrome-stable", "chromium"])
    if (spawnSync(bin, ["--version"]).status === 0) return bin;
  throw new Error("no headless Chrome for the frame-0 tests: set CHROME_PATH");
}
const CHROME = findChrome();

const FRAME = { "16x9": [1920, 1080], "9x16": [1080, 1920] };
const BASE = "2026-10-10";

// The longest daily dateline of a year, as build.mjs writes it, in each language.
function longestDate(year, lang) {
  const locale = lang === "vi" ? "vi-VN" : "en-US";
  let best = "";
  let bestLen = 0;
  for (
    let t = Date.UTC(year, 0, 1);
    new Date(t).getUTCFullYear() === year;
    t += 864e5
  ) {
    const d = new Date(t);
    const opt = (o) => d.toLocaleDateString(locale, { timeZone: "UTC", ...o });
    const line =
      lang === "vi"
        ? `${opt({ weekday: "long" })}, ${d.getUTCDate()} ${opt({ month: "long" }).toLowerCase()}, ${year}`
        : `${opt({ weekday: "long" })}, ${opt({ month: "long" })} ${d.getUTCDate()}, ${year}`;
    if (line.length > bestLen)
      [best, bestLen] = [d.toISOString().slice(0, 10), line.length];
  }
  return best;
}

// In-page: each selector's first match as { box, text } rects ([left, top, right, bottom]) after the intro's motion
// has fitted its text. `text` bounds the element's laid-out text, so it shows text that overflows the box.
const measure = (selectors) => `<script>(async () => {
  await document.fonts.ready;
  while (!window.__timelines.main) await new Promise((r) => setTimeout(r, 20));
  for (const c of document.querySelectorAll(".clip")) c.style.display = c.id === "intro" ? "block" : "none";
  const out = {};
  for (const s of ${JSON.stringify(selectors)}) {
    const el = document.querySelector("#intro " + s);
    if (!el) continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rect = (r) => [r.left, r.top, r.right, r.bottom];
    out[s] = { box: rect(el.getBoundingClientRect()), text: rect(range.getBoundingClientRect()) };
  }
  const pre = document.createElement("pre");
  pre.id = "frame0";
  pre.textContent = JSON.stringify(out);
  document.body.append(pre);
})();</script>`;

const GSAP_STUB = `<script>window.__timelines = {}; window.gsap = { timeline: () => new Proxy({}, { get: (_, k, tl) => () => tl }) };</script>`;

/** Builds BASE re-dated to `date` (or to an ISO week) with `intro` pinned; returns { fmt: { selector: rect } }. */
function frame0({ intro, date, lang, week, title }, selectors) {
  const { dn, cleanup } = scratchRoot();
  cleanups.push(cleanup);
  const key = week ? `week-${week.id}` : date;
  const dir = join(dn, "editions", key);
  mkdirSync(join(dir, "assets"), { recursive: true });
  const edition = {
    ...read(join(ROOT, "editions", BASE, "edition.json")),
    date: key,
  };
  if (week)
    Object.assign(edition, {
      kind: "weekly",
      week: week.id,
      issue: 1,
      start_date: week.start,
      end_date: week.end,
    });
  writeFileSync(join(dir, "edition.json"), JSON.stringify(edition));
  for (const f of ["script.json", "script.vi.json"]) {
    const s = read(join(ROOT, "editions", BASE, f));
    delete s.dateline;
    s.theme = { ...s.theme, intro };
    if (title) s.intro.title = title;
    writeFileSync(join(dir, f), JSON.stringify(s));
  }
  for (const s of edition.stories)
    for (const im of s.images) writeFileSync(join(dir, im.local), "");
  const run = runBuild(dn, [key, "--lang", lang, "--no-voice", "--no-audio"]);
  assert.equal(run.status, 0, run.stderr);
  const out = {};
  for (const [fmt, [w, h]] of Object.entries(FRAME)) {
    const page = join(
      dir,
      lang === "en" ? "out" : `out-${lang}`,
      fmt,
      "index.html"
    );
    writeFileSync(
      page,
      readFileSync(page, "utf8")
        .replace(
          /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@[^"]+"><\/script>/,
          GSAP_STUB
        )
        .replace("</body>", `${measure(selectors)}</body>`)
    );
    const dom = execFileSync(
      CHROME,
      [
        "--headless",
        "--no-sandbox",
        "--disable-gpu",
        "--allow-file-access-from-files",
        `--window-size=${w},${h}`,
        "--virtual-time-budget=10000",
        "--dump-dom",
        `file://${page}`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60_000 }
    );
    const json = dom.match(/<pre id="frame0">([^<]*)<\/pre>/)?.[1];
    assert.ok(json, `${fmt}: the page never finished its intro motion`);
    out[fmt] = JSON.parse(
      json.replaceAll("&quot;", '"').replaceAll("&amp;", "&")
    );
  }
  return out;
}

const inside = (inner, outer, margin = 0) =>
  inner[0] >= outer[0] + margin - 0.5 &&
  inner[1] >= outer[1] + margin - 0.5 &&
  inner[2] <= outer[2] - margin + 0.5 &&
  inner[3] <= outer[3] - margin + 0.5;

test("the chapter rail shows its whole dateline inside the frame on the year's longest dates", () => {
  // The rail runs up the left edge from y=640 in 16:9. At a fixed size, "AI;DR DAILY · Wednesday, September 30,
  // 2026" ran 46px off the top of the thumbnail, and a cross-year week's range ran 171px off.
  const cases = [
    { lang: "en", date: longestDate(2026, "en") },
    { lang: "vi", date: longestDate(2026, "vi") },
    { lang: "en", date: "2026-09-30" },
    { lang: "vi", date: "2026-12-30" },
    ...["en", "vi"].map((lang) => ({
      lang,
      week: { id: "2026-W53", start: "2026-12-28", end: "2027-01-03" },
    })),
  ];
  for (const c of cases) {
    const rects = frame0({ intro: "chapter", ...c }, [".ch-rail"]);
    for (const [fmt, [w, h]] of Object.entries(FRAME)) {
      const tag = `${c.lang} ${c.date ?? c.week.id} ${fmt}`;
      const { box, text } = rects[fmt][".ch-rail"];
      assert.ok(
        inside(text, [0, 0, w, h], 16),
        `${tag}: rail text at ${text.map(Math.round)} leaves the frame`
      );
      assert.ok(
        inside(text, box),
        `${tag}: rail text at ${text.map(Math.round)} is cut by its box`
      );
    }
  }
});

test("a long chapter title stays clear of the picture strip", () => {
  // intro.title has no length cap. The fit stopped at 44px, so a long title ran a line under the 9:16 strip.
  const title =
    "Nvidia công bố khoản đầu tư hai mươi tỷ đô la vào trung tâm dữ liệu trí tuệ nhân tạo mới tại Việt Nam, khiến cổ phiếu công nghệ châu Á biến động mạnh trong phiên giao dịch hôm nay, sau khi công ty báo cáo kết quả kinh doanh quý ba vượt kỳ vọng";
  const rects = frame0({ intro: "chapter", lang: "vi", date: BASE, title }, [
    ".ch-title",
    ".ch-strip",
  ]);
  for (const fmt of Object.keys(FRAME)) {
    const [t, s] = [rects[fmt][".ch-title"].text, rects[fmt][".ch-strip"].box];
    assert.ok(
      t[3] <= s[1],
      `${fmt}: title bottom ${Math.round(t[3])} runs under the strip top ${Math.round(s[1])}`
    );
  }
});
