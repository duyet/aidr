#!/usr/bin/env node
/**
 * Chrome Web Store listing images, captured from the real unpacked new tab.
 *
 * Serves this folder over loopback with today's live aidr.today digest
 * injected, drives headless Chrome over the DevTools protocol, and writes:
 *
 *   store/{en,vi}-{1..5}-<scene>.jpg   1280×800 screenshots
 *   store/promo-440x280.jpg            small promo tile
 *   store/marquee-1400x560.jpg         marquee promo tile
 *
 * JPEG only, so no file carries an alpha channel.
 *
 *   pnpm --filter @aidr/extension store-assets
 *   CHROME_BIN=/path/to/chrome node apps/extension/scripts/store-assets.mjs --out /tmp/store
 */
import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { enrichDigest, normalizeDigest } from "../js/api.js";
import { apiUrl } from "../js/site-url.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(root, "../..");
const SITE = "https://aidr.today";
const SHOT = { width: 1280, height: 800 };
const JPEG_QUALITY = 90;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

/**
 * One selling point per frame. Same five scenes in every language.
 * Feed on everywhere: with it off the page centers the AI;DR card
 * (.page.is-brief) and leaves an empty band under the chips.
 */
const SCENES = [
  {
    slug: "digest",
    settings: { theme: "light", sections: { days: true } },
  },
  {
    slug: "stories",
    settings: { theme: "light", sections: { days: true } },
    act: scrollToStories,
  },
  {
    slug: "day-card",
    settings: { theme: "light", sections: { days: true } },
    act: openDayCard,
  },
  {
    slug: "dark",
    settings: { theme: "dark", bg: "dark", sections: { days: true } },
  },
  {
    slug: "settings",
    settings: { theme: "light", sections: { days: true } },
    act: openSettings,
  },
];

const TAGLINE = {
  head: "AI news,<br>too long; didn't read",
  sub: "on every new tab",
};

function argValue(flag, fallback) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : fallback;
}

function chromeBin() {
  const bin =
    process.env.CHROME_BIN ||
    [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/usr/bin/google-chrome-stable",
      "/usr/bin/google-chrome",
    ].find(existsSync);
  if (!bin) throw new Error("Chrome not found; set CHROME_BIN");
  return bin;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return res.json();
}

/** Same two calls the new tab makes (js/api.js fetchDigest). */
async function liveDigest(lang) {
  const [publicRaw, feedRaw] = await Promise.all([
    fetchJson(apiUrl(SITE, "/api/public", lang)),
    fetchJson(apiUrl(SITE, "/api/feed?days=3", lang)),
  ]);
  return enrichDigest(normalizeDigest(publicRaw), feedRaw);
}

function sceneSettings(lang, scene) {
  return {
    ...scene.settings,
    language: lang,
    sections: {
      categories: true,
      trending: true,
      tldr: true,
      days: false,
      ...scene.settings.sections,
    },
  };
}

/**
 * newtab.html with the digest and settings in place before boot.js runs.
 * The preview shim keeps chrome.storage in localStorage, so seeding it here
 * is what a saved setting looks like to the page.
 */
function newtabHtml(digest, settings) {
  const seed = [
    "localStorage.clear();",
    `localStorage.setItem("news-tab-sync", ${JSON.stringify(
      JSON.stringify({ newsTabSettings: settings })
    )});`,
    `window.__NEWS_TAB_DIGEST__=${JSON.stringify(digest)};`,
  ].join("");
  return readFileSync(join(root, "newtab.html"), "utf8").replace(
    '<script type="module" src="js/boot.js"></script>',
    `<script>${seed}</script>\n    <script type="module" src="js/boot.js"></script>`
  );
}

function startServer(pages) {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, "http://127.0.0.1");
      const page = pages.get(url.pathname);
      if (page) {
        res.writeHead(200, { "content-type": page.type });
        res.end(page.body);
        return;
      }
      const file = join(root, url.pathname.replace(/^\/+/, ""));
      if (relative(root, file).startsWith("..") || !existsSync(file)) {
        res.writeHead(404);
        res.end("missing");
        return;
      }
      res.writeHead(200, {
        "content-type": MIME[extname(file)] || "application/octet-stream",
      });
      res.end(readFileSync(file));
    });
    server.listen(0, "127.0.0.1", () => {
      resolve({ server, origin: `http://127.0.0.1:${server.address().port}` });
    });
  });
}

/** Minimal DevTools protocol client over Node's built-in WebSocket. */
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", reject, { once: true });
  });
  let seq = 0;
  const pending = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    const call = pending.get(msg.id);
    if (!call) return;
    pending.delete(msg.id);
    if (msg.error)
      call.reject(new Error(`${call.method}: ${msg.error.message}`));
    else call.resolve(msg.result);
  });
  return {
    send(method, params = {}) {
      const id = ++seq;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolve, reject) => {
        pending.set(id, { method, resolve, reject });
      });
    },
    close() {
      ws.close();
    },
  };
}

async function launchChrome() {
  const profile = mkdtempSync(join(tmpdir(), "aidr-store-"));
  const child = spawn(
    chromeBin(),
    [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--no-first-run",
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: "ignore" }
  );
  const portFile = join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(100);
  if (!existsSync(portFile)) throw new Error("Chrome did not open DevTools");
  const port = readFileSync(portFile, "utf8").split("\n")[0];
  const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`);
  const target = targets.find((t) => t.type === "page");
  const cdp = await connect(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Network.enable");
  // Keep listing captures out of the extension analytics.
  await cdp.send("Network.setBlockedURLs", {
    urls: ["*aidr.today/api/extension*"],
  });
  return {
    cdp,
    async close() {
      cdp.close();
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill();
      await exited;
      rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
    },
  };
}

async function evaluate(cdp, expression) {
  const { result, exceptionDetails } = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (exceptionDetails) {
    throw new Error(exceptionDetails.exception?.description || expression);
  }
  return result.value;
}

async function waitFor(cdp, expression, label, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate(cdp, expression)) return;
    await sleep(150);
  }
  throw new Error(`timed out waiting for ${label}`);
}

/** Visible images finished (loaded or failed), fonts ready. */
const SETTLED = `(() => {
  if (document.fonts.status !== "loaded") return false;
  return [...document.images].every((img) => {
    const r = img.getBoundingClientRect();
    const onScreen = r.bottom > 0 && r.top < innerHeight && r.width > 0;
    return !onScreen || img.complete;
  });
})()`;

/** On-screen images that finished without pixels (a flaky remote thumb). */
const BROKEN = `[...document.images].filter((img) => {
  const r = img.getBoundingClientRect();
  const onScreen = r.bottom > 0 && r.top < innerHeight && r.width > 0;
  return onScreen && img.currentSrc && img.complete && img.naturalWidth === 0;
}).map((img) => img.currentSrc)`;

async function settle(cdp) {
  await waitFor(cdp, SETTLED, "images and fonts");
  await sleep(700);
}

async function scrollToStories(cdp) {
  await waitFor(cdp, `!!document.querySelector(".day-section")`, "day feed");
  await evaluate(
    cdp,
    `(() => {
      const head = document.querySelector(".day-section .day-head");
      scrollTo(0, head.getBoundingClientRect().top + scrollY - 32);
    })()`
  );
}

async function openDayCard(cdp) {
  await waitFor(
    cdp,
    `!document.getElementById("day-card-switch").hidden`,
    "day card switch"
  );
  await evaluate(cdp, `document.getElementById("day-card-image").click()`);
  await waitFor(
    cdp,
    `(() => { const img = document.getElementById("day-card-img");
      return img.complete && img.naturalWidth > 0; })()`,
    "day card image"
  );
}

async function openSettings(cdp) {
  await evaluate(cdp, `document.getElementById("open-settings").click()`);
  await waitFor(cdp, `!!document.querySelector(".prefs-dialog")`, "settings");
}

async function setViewport(cdp, { width, height, scale = 1 }) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: scale,
    mobile: false,
  });
}

async function load(cdp, url, colorScheme = "light") {
  await cdp.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: colorScheme }],
  });
  await cdp.send("Page.navigate", { url });
  await waitFor(cdp, `document.readyState === "complete"`, url);
}

async function capture(cdp) {
  const { data } = await cdp.send("Page.captureScreenshot", {
    format: "jpeg",
    quality: JPEG_QUALITY,
    captureBeyondViewport: false,
  });
  return Buffer.from(data, "base64");
}

async function captureScene(cdp, origin, pages, lang, digest, scene) {
  const settings = sceneSettings(lang, scene);
  const path = `/newtab-${lang}-${scene.slug}.html`;
  pages.set(path, {
    type: MIME[".html"],
    body: newtabHtml(digest, settings),
  });
  for (let attempt = 1; ; attempt++) {
    await load(cdp, `${origin}${path}`, settings.theme);
    await waitFor(
      cdp,
      `document.querySelectorAll("#tldr-cols li").length > 0`,
      "AI;DR bullets"
    );
    if (scene.act) await scene.act(cdp);
    await settle(cdp);
    const broken = await evaluate(cdp, BROKEN);
    if (broken.length === 0) break;
    if (attempt === 3) {
      console.warn(`${lang}-${scene.slug}: images still broken`, broken);
      break;
    }
  }
  return capture(cdp);
}

const BRAND = {
  yellow: "#f5c518",
  ink: "#0a0a0a",
  logoInk: "#1c1917",
};

/** Yellow masthead with the wordmark and a real crop of the new tab. */
function promoHtml({ width, height, hero, layout }) {
  const marquee = layout === "marquee";
  const pad = marquee ? 72 : 28;
  const mark = marquee ? 132 : 64;
  const head = marquee ? 40 : 17;
  const sub = marquee ? 26 : 14;
  // Frame: hero is a 2x capture of the 1280×800 new tab.
  const frameW = marquee ? 760 : 222;
  const frameH = marquee ? 475 : 210;
  const frameScale = marquee ? 0.62 : 0.36;
  const frameLeft = width - frameW - (marquee ? 64 : 0);
  const frameTop = marquee ? height - frameH - 44 : height - frameH;
  return `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  @font-face { font-family: "EB Garamond"; font-weight: 700; src: url(/fonts/eb-garamond-latin-700.woff2) format("woff2"); }
  @font-face { font-family: "Source Sans 3"; font-weight: 600; src: url(/fonts/source-sans-3-latin-600.woff2) format("woff2"); }
  @font-face { font-family: "Source Sans 3"; font-weight: 400; src: url(/fonts/source-sans-3-latin-400.woff2) format("woff2"); }
  * { margin: 0; box-sizing: border-box; }
  html, body { width: ${width}px; height: ${height}px; overflow: hidden; background: ${BRAND.yellow}; }
  body { position: relative; color: ${BRAND.ink}; font-family: "Source Sans 3", sans-serif; }
  .copy { position: absolute; left: ${pad}px; top: ${marquee ? 104 : 30}px; width: ${marquee ? 470 : 180}px; }
  .mark { font-family: "EB Garamond", serif; font-weight: 700; font-size: ${mark}px; line-height: .9; letter-spacing: -.01em; color: ${BRAND.logoInk}; }
  .rule { height: ${marquee ? 2 : 1.5}px; width: ${marquee ? 96 : 44}px; background: ${BRAND.ink}; margin: ${marquee ? 30 : 16}px 0 ${marquee ? 26 : 12}px; }
  .head { font-weight: 600; font-size: ${head}px; line-height: 1.18; }
  .sub { font-weight: 400; font-size: ${sub}px; line-height: 1.3; margin-top: ${marquee ? 10 : 6}px; }
  .meta { position: absolute; left: ${pad}px; bottom: ${marquee ? 64 : 0}px; font-size: 18px; letter-spacing: .04em; text-transform: uppercase; font-weight: 600; display: ${marquee ? "block" : "none"}; }
  .frame { position: absolute; left: ${frameLeft}px; top: ${frameTop}px; width: ${frameW}px; height: ${frameH}px; overflow: hidden; border: ${marquee ? 2 : 1.5}px solid ${BRAND.ink}; ${marquee ? "" : "border-bottom: 0; border-right: 0;"} background: #fff; }
  .frame img { position: absolute; left: 0; top: 0; width: ${Math.round(1280 * frameScale)}px; height: ${Math.round(800 * frameScale)}px; }
</style></head>
<body>
  <div class="copy">
    <div class="mark">AI;DR</div>
    <div class="rule"></div>
    <div class="head">${TAGLINE.head}</div>
    <div class="sub">${TAGLINE.sub}</div>
  </div>
  <div class="meta">Free · English &amp; Tiếng Việt · aidr.today</div>
  <div class="frame"><img src="${hero}" alt=""></div>
</body></html>`;
}

async function renderPromo(cdp, origin, pages, spec) {
  const path = `/promo-${spec.layout}.html`;
  pages.set(path, { type: MIME[".html"], body: promoHtml(spec) });
  await setViewport(cdp, { width: spec.width, height: spec.height });
  await load(cdp, `${origin}${path}`);
  await settle(cdp);
  return capture(cdp);
}

async function main() {
  const outDir = argValue("--out", join(root, "store"));
  const langs = argValue("--lang", "en,vi").split(",");
  mkdirSync(outDir, { recursive: true });

  const pages = new Map();
  const { server, origin } = await startServer(pages);
  const chrome = await launchChrome();
  const { cdp } = chrome;
  const written = [];
  const write = (name, buf) => {
    const file = join(outDir, name);
    writeFileSync(file, buf);
    written.push(relative(repo, file));
  };

  try {
    const digests = new Map();
    for (const lang of langs) {
      const digest = await liveDigest(lang);
      digests.set(lang, digest);
      await setViewport(cdp, SHOT);
      for (const [i, scene] of SCENES.entries()) {
        const jpg = await captureScene(cdp, origin, pages, lang, digest, scene);
        write(`${lang}-${i + 1}-${scene.slug}.jpg`, jpg);
      }
    }

    // Promo crops come from a 2x capture of the English new tab.
    const heroLang = digests.has("en") ? "en" : langs[0];
    await setViewport(cdp, { ...SHOT, scale: 2 });
    const hero = await captureScene(
      cdp,
      origin,
      pages,
      heroLang,
      digests.get(heroLang),
      SCENES[0]
    );
    pages.set("/hero.jpg", { type: MIME[".jpg"], body: hero });
    for (const spec of [
      { layout: "promo", width: 440, height: 280 },
      { layout: "marquee", width: 1400, height: 560 },
    ]) {
      const jpg = await renderPromo(cdp, origin, pages, {
        ...spec,
        hero: "/hero.jpg",
      });
      write(
        `${spec.layout === "promo" ? "promo" : "marquee"}-${spec.width}x${spec.height}.jpg`,
        jpg
      );
    }

    const date = digests.get(heroLang)?.tldr?.date || "unknown";
    console.log(JSON.stringify({ digestDate: date, written }, null, 2));
  } finally {
    await chrome.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
