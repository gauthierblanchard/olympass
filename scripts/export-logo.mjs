// Exporte le logo Olympass en PNG haute définition (fond transparent) pour les slides.
// Prérequis : serveur lancé (npm start). Lancer avec : node scripts/export-logo.mjs
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.resolve("logo");
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ deviceScaleFactor: 4 });
await page.goto(BASE);

for (const [name, ink] of [["olympass-logo-sombre", "#ffffff"], ["olympass-logo-clair", "#0b1f3a"]]) {
  await page.evaluate((color) => {
    document.body.innerHTML = `<div id="logo" style="display:inline-flex;align-self:flex-start;align-items:center;gap:22px;padding:24px">
      <img src="img/olympass-mark.svg" style="width:120px;height:120px" />
      <span class="wordmark" style="font-size:96px;color:${color}">olym<span>pass</span></span></div>`;
    document.body.style.background = "transparent";
  }, ink);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  await page.locator("#logo").screenshot({ path: path.join(OUT, `${name}.png`), omitBackground: true });
}
await page.evaluate(() => {
  document.body.innerHTML = `<img id="mark" src="img/olympass-mark.svg" style="width:256px;height:256px;display:block;align-self:flex-start" />`;
});
await page.waitForTimeout(300);
await page.locator("#mark").screenshot({ path: path.join(OUT, "olympass-icone.png"), omitBackground: true });
await browser.close();
console.log(`Logos exportés dans ${OUT}`);
