#!/usr/bin/env node
// Capture the live surfaces this film shows, read-only, into capture/ (ignored: story photos are
// third-party). Desktop shots feed the 16:9 cuts, mobile shots the 9:16 cuts; *-vi for Vietnamese.
//
//   PUPPETEER_CORE=<path to puppeteer-core> CHROME=<chrome binary> node v0.1.16/capture.mjs [name ...]
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname);
const OUT = join(ROOT, "capture");
const SITE = "https://aidr.today";
const film = JSON.parse((await import("node:fs")).readFileSync(join(ROOT, "film.json"), "utf8"));
const only = process.argv.slice(2);
const { default: puppeteer } = await import(process.env.PUPPETEER_CORE ?? "puppeteer-core");

const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 2 },
  mobile: { width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME, args: ["--hide-scrollbars", "--no-sandbox"] });
try {
  for (const [form, viewport] of Object.entries(VIEWPORTS)) {
    for (const [name, entry] of Object.entries(film.captures.pages).filter(([n]) => !only.length || only.includes(n))) {
      // An entry is a path, or { path, desktop?, mobile? } with viewport overrides for one form.
      const { path, ...forms } = typeof entry === "string" ? { path: entry } : entry;
      // A fresh page per shot: a page reused across origins can detach mid-navigation.
      const page = await browser.newPage();
      await page.setViewport({ ...viewport, ...forms[form] });
      const url = path.startsWith("http") ? path : SITE + path;
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      await new Promise((r) => setTimeout(r, 2500));
      await page.screenshot({ path: join(OUT, `${name}-${form}.png`) });
      await page.screenshot({ path: join(OUT, `${name}-${form}-full.png`), fullPage: true });
      console.log(`captured ${name}-${form}  ${url}`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}

for (const [name, path] of Object.entries(film.captures.files)) {
  const res = await fetch(SITE + path);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(await res.arrayBuffer()));
  console.log(`fetched ${name}  ${path}`);
}
