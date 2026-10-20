// A 9:16 Reel or Short is covered below 1382px (the bottom 28% of 1920) by its own caption, username and buttons.
// These tests lay each story layout out in headless Chrome and measure where its text lands. GSAP is stubbed, but
// motion.js still fits text at build time, so a long headline shrinks as it does in the render.
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
  throw new Error("no headless Chrome for the layout tests: set CHROME_PATH");
}
const CHROME = findChrome();

const SAFE_BOTTOM = 1382;
const DATE = "2026-10-13";

// The longest copy the script checks allow: a 6-word kicker, a 12-word headline, an 8-word stat label.
const WORST = {
  kicker: "Anthropic Google Nvidia Meta OpenAI Microsoft",
  headline:
    "Anthropic *quietly expands Claude* across Microsoft enterprise customers worldwide today",
  stat: "$870M",
  statLabel: "extra annual revenue forecast by next year",
};
// A caption cue is at most four words; four long ones wrap to two lines at 56px.
const WORST_CAPTION = [
  "Infrastructure,",
  "interoperability",
  "notwithstanding",
  "responsibilities",
];

const TEXT = [
  ".cat",
  ".kicker",
  ".head",
  ".stat",
  ".stat-label",
  ".src",
  ".paper .venue",
  ".paper .ptitle",
  ".paper .abs",
  ".credit",
];
const BOX = [".ticker", ".footer", ".cap .line", ".bar"];

// The story camera pushes in to 1.03 about 45% of the frame height (motion.js, style.css .cam), which moves text down.
const CAM_SCALE = 1.03;
const CAM_Y = 1920 * 0.45;

const measure = `<script>(async () => {
  const CAM_SCALE = ${CAM_SCALE}, CAM_Y = ${CAM_Y};
  await document.fonts.ready;
  while (!window.__timelines.main) await new Promise((r) => setTimeout(r, 20));
  const cap = document.querySelector(".cap");
  cap.querySelector(".line").innerHTML = ${JSON.stringify(WORST_CAPTION)}.map((w) => '<span class="w">' + w + "</span>").join("");
  for (const c of document.querySelectorAll(".clip"))
    c.style.display = c.id === "story-1" || c.id === "chrome" || c === cap ? "block" : "none";
  const shown = (el) => el.getClientRects().length > 0;
  const out = { text: {}, box: {}, media: 0 };
  for (const s of ${JSON.stringify(TEXT)}) {
    const el = document.querySelector("#story-1 " + s);
    if (!el || !shown(el) || !el.textContent.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(el);
    out.text[s] = CAM_Y + (range.getBoundingClientRect().bottom - CAM_Y) * CAM_SCALE;
  }
  for (const s of ${JSON.stringify(BOX)}) {
    const el = document.querySelector(s);
    if (el && shown(el)) out.box[s] = el.getBoundingClientRect().bottom;
  }
  const media = document.querySelector("#story-1 .media");
  if (media && shown(media)) out.media = media.getBoundingClientRect().bottom;
  else {
    const block = getComputedStyle(document.querySelector("#story-1 .cam"), "::before");
    if (block.content !== "none") out.media = parseFloat(block.top) + parseFloat(block.height);
  }
  const pre = document.createElement("pre");
  pre.id = "frame0";
  pre.textContent = JSON.stringify(out);
  document.body.append(pre);
})();</script>`;

const GSAP_STUB = `<script>window.__timelines = {}; window.gsap = { timeline: () => new Proxy({}, { get: (_, k, tl) => () => tl }) };</script>`;

/** Builds DATE with story 1 pinned to `layout` and the longest copy; returns where its 9:16 frame lands. */
function layoutBoxes(layout, { images }) {
  const { dn, cleanup } = scratchRoot();
  cleanups.push(cleanup);
  const dir = join(dn, "editions", DATE);
  mkdirSync(join(dir, "assets"), { recursive: true });
  const src = join(ROOT, "editions", DATE);
  const script = read(join(src, "script.json"));
  const edition = read(join(src, "edition.json"));
  Object.assign(script.stories[0], WORST, { layout });
  if (!images) script.stories[0].images = [];
  writeFileSync(join(dir, "script.json"), JSON.stringify(script));
  writeFileSync(join(dir, "edition.json"), JSON.stringify(edition));
  for (const f of new Set([
    ...script.stories.flatMap((s) => s.images ?? []),
    ...edition.stories.flatMap((s) => s.images.map((im) => im.local)),
  ]))
    writeFileSync(join(dir, f), "");
  const run = runBuild(dn, [DATE, "--no-voice", "--no-audio"]);
  assert.equal(run.status, 0, run.stderr);
  const page = join(dir, "out", "9x16", "index.html");
  writeFileSync(
    page,
    readFileSync(page, "utf8")
      .replace(
        /<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/gsap@[^"]+"><\/script>/,
        GSAP_STUB
      )
      .replace("</body>", `${measure}</body>`)
  );
  const dom = execFileSync(
    CHROME,
    [
      "--headless",
      "--no-sandbox",
      "--disable-gpu",
      "--allow-file-access-from-files",
      "--window-size=1080,1920",
      "--virtual-time-budget=10000",
      "--dump-dom",
      `file://${page}`,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 60_000 }
  );
  const json = dom.match(/<pre id="frame0">([^<]*)<\/pre>/)?.[1];
  assert.ok(json, `${layout}: the page never finished its motion`);
  return JSON.parse(json.replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
}

// Where the non-text visual under the captions, ticker and footer ends: the story media, or a statement's yellow block.
const FRAME_BOTTOM = 1920;

const CASES = [
  ["split", { images: true }],
  ["split", { images: false }],
  ["full", { images: true }],
  ["stat", { images: true }],
  ["stat", { images: false }],
  ["poster", { images: true }],
  ["statement", { images: false }],
];

for (const [layout, opts] of CASES) {
  const name = `${layout}${opts.images ? "" : " without a picture"}`;
  test(`9:16 ${name}: no text sits below ${SAFE_BOTTOM}px and the picture fills the band`, () => {
    const m = layoutBoxes(layout, opts);
    const edges = { ...m.text, ...m.box };
    const [sel, bottom] = Object.entries(edges).sort((a, b) => b[1] - a[1])[0];
    const row = Object.entries(edges)
      .map(([k, v]) => `${k} ${Math.round(v)}`)
      .join(", ");
    console.log(
      `lowest text edge, ${name}: ${sel} at ${Math.round(bottom)}px; visual ends ${Math.round(m.media)}px; ${row}`
    );
    for (const [s, b] of Object.entries(edges))
      assert.ok(
        b <= SAFE_BOTTOM,
        `${name}: ${s} ends at ${Math.round(b)}px, inside the covered band below ${SAFE_BOTTOM}px`
      );
    assert.ok(
      m.media >= FRAME_BOTTOM - 1,
      `${name}: the bottom band is empty paper, its visual ends at ${Math.round(m.media)}px`
    );
  });
}
