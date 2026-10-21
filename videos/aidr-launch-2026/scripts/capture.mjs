#!/usr/bin/env node
// Capture the live aidr.today surfaces the launch film shows, read-only, into capture/ (ignored:
// story photos are third-party). Desktop shots feed the 16:9 cut, mobile shots the 9:16 cut.
//
//   node scripts/capture.mjs            (from videos/aidr-launch-2026)
//
// Needs puppeteer-core (PUPPETEER_CORE=<path to the package>) and a Chrome binary (CHROME=<path>).
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const OUT = join(ROOT, "capture");
const SITE = "https://aidr.today";
const { default: puppeteer } = await import(process.env.PUPPETEER_CORE ?? "puppeteer-core");

const STORY = "/be38b11f?lang=en";
const DAY = "2026-10-20";
const SHOTS = [
  ["home", "/?lang=en"],
  ["home-vi", "/?lang=vi"],
  ["story", STORY],
  ["data", "/data?lang=en"],
  ["sources", "/data?tab=sources&lang=en"],
  ["subscribe", "/subscribe?lang=en"],
  ["about", "/about?lang=en"],
  ["email", "/api/subscribe/preview?lang=en&n=5&format=design"],
  ["telegram", "https://t.me/s/aidr_today"],
];
const VIEWPORTS = {
  desktop: { width: 1440, height: 900, deviceScaleFactor: 2.5 },
  mobile: { width: 430, height: 932, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME, args: ["--hide-scrollbars", "--no-sandbox"] });
try {
  for (const [form, viewport] of Object.entries(VIEWPORTS)) {
    const page = await browser.newPage();
    await page.setViewport(viewport);
    for (const [name, path] of SHOTS) {
      const url = path.startsWith("http") ? path : SITE + path;
      await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      await new Promise((r) => setTimeout(r, 2500));
      await page.screenshot({ path: join(OUT, `${name}-${form}.png`) });
      await page.screenshot({ path: join(OUT, `${name}-${form}-full.png`), fullPage: true });
      console.log(`captured ${name}-${form}  ${url}`);
    }
    await page.close();
  }
} finally {
  await browser.close();
}

const day = await fetch(`${SITE}/api/og/date/${DAY}.png`);
writeFileSync(join(OUT, `daycard-${DAY}.png`), Buffer.from(await day.arrayBuffer()));
console.log(`fetched daycard-${DAY}`);

const tg = await (await fetch("https://t.me/s/aidr_today")).text();
const thumbs = [...tg.matchAll(/message_video_thumb" style="background-image:url\('([^']+)'/g)].map((m) => m[1]);
for (const [i, src] of thumbs.slice(-4).entries()) {
  const res = await fetch(src);
  writeFileSync(join(OUT, `daily-video-${i + 1}.jpg`), Buffer.from(await res.arrayBuffer()));
}
console.log(`fetched ${Math.min(4, thumbs.length)} daily-video thumbnails`);
