#!/usr/bin/env node
// Capture the real AI;DR Chrome extension new tab (loaded unpacked from apps/extension) with the
// live edition, and the live Chrome Web Store listing, into capture/ (ignored).
//
//   PLAYWRIGHT=<path to playwright-core> CHROME=<chromium binary> node scripts/capture.mjs
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const EXT = resolve(ROOT, "../../apps/extension");
const OUT = join(ROOT, "capture");
const STORE = "https://chromewebstore.google.com/detail/aidr/cagjehdlblcobkghgbbilnpefelbmpcg";
const pw = await import(process.env.PLAYWRIGHT ?? "playwright-core");
const chromium = pw.chromium ?? pw.default.chromium;

const FORMS = {
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
};

mkdirSync(OUT, { recursive: true });
for (const [form, opts] of Object.entries(FORMS)) {
  const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "aidr-ext-")), {
    executablePath: process.env.CHROME,
    headless: true,
    ...opts,
    locale: "en-US",
    args: ["--headless=new", `--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--hide-scrollbars"],
  });
  let [sw] = ctx.serviceWorkers();
  sw ??= await ctx.waitForEvent("serviceworker");
  const id = new URL(sw.url()).host;
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${id}/newtab.html`);
  await page.waitForLoadState("networkidle");
  await page.getByText("EN", { exact: true }).first().click();
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT, `newtab-${form}.png`) });
  await page.screenshot({ path: join(OUT, `newtab-${form}-full.png`), fullPage: true });
  const text = await page.evaluate(() => document.body.innerText);
  writeFileSync(join(ROOT, `data/newtab-${form}.txt`), text);
  await page.goto(STORE, { waitUntil: "load" });
  await page.waitForTimeout(4000);
  await page.getByText("No thanks", { exact: true }).click({ timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, `store-${form}.png`) });
  await ctx.close();
}
console.log("captured", new Date().toISOString());
