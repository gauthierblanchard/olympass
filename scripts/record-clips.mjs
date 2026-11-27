// Enregistre des clips courts (quelques secondes) pour les slides de soutenance.
// Prérequis : serveur lancé (npm start), Chrome installé, ffmpeg (pip install imageio-ffmpeg).
// Lancer avec : node scripts/record-clips.mjs  →  video/clips/*.mp4 + *.png (image fixe)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.resolve("video", "clips");
const W = 1600;
const H = 900;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = (p, body) =>
  fetch(BASE + "/api" + p, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}).then((r) => r.json());

fs.mkdirSync(OUT, { recursive: true });

// Un supporter neuf pour la démo, et un billet en Virage Sud à acheter
const fan = await api("/users", { name: process.env.FAN_NAME || "Mehdi" });
if (!fan.id) throw new Error("Création du supporter impossible : " + JSON.stringify(fan));
const sale = await api("/sale");
const target = sale.find((t) => t.seat?.tribune === "Virage Sud") || sale[0];
if (!target) throw new Error("Aucun billet en vente : émettez des places depuis l'espace club");
const other = sale.find((t) => t.nftId !== target.nftId);
console.log(`Supporter ${fan.name}, billet ${target.seat.tribune} ${target.seat.bloc} R${target.seat.rang} S${target.seat.siege}`);

const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT, size: { width: W, height: H } }, locale: "fr-FR" });
await context.addInitScript((id) => {
  localStorage.setItem("olympass:user", id);
  const style = () => {
    if (document.getElementById("rec-cur")) return;
    const c = document.createElement("div");
    c.id = "rec-cur";
    c.style.cssText = "position:fixed;z-index:99999;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;background:rgba(42,167,223,.35);border:2px solid #2aa7df;pointer-events:none;left:-50px;top:-50px";
    document.body.appendChild(c);
    document.addEventListener("mousemove", (e) => ((c.style.left = e.clientX + "px"), (c.style.top = e.clientY + "px")));
  };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", style) : style();
}, fan.id);
const page = await context.newPage();
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
page.setDefaultTimeout(90_000);

const segs = [];
const seg = async (name, fn) => {
  const start = now();
  await fn();
  segs.push({ name, start, end: now() });
  console.log(`  ${name}: ${start.toFixed(1)}s → ${now().toFixed(1)}s`);
};
const click = async (sel) => {
  const el = typeof sel === "string" ? page.locator(sel).first() : sel;
  await el.scrollIntoViewIfNeeded();
  const b = await el.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 18 });
  await sleep(250);
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
};
const scrollTo = (sel, off = 80) => page.evaluate(([s, o]) => window.scrollTo(0, document.querySelector(s).getBoundingClientRect().top + window.scrollY - o), [sel, off]);

try {
  // 1. Vérifier un billet avant de payer
  await page.goto(`${BASE}/#/verify`);
  await page.waitForSelector("#verify-id");
  await sleep(600);
  await seg("verifier", async () => {
    await click("#verify-id");
    await page.keyboard.type(other?.nftId || target.nftId, { delay: 4 });
    await click("#verify-form button");
    await page.waitForSelector(".verify-result .status-line");
    await sleep(2200);
  });

  // 2. Le stade 3D : vol vers la tribune, sélection, vue depuis la place
  await page.goto(`${BASE}/#/fan`);
  await page.waitForFunction(() => window.__olympassStadium);
  await scrollTo(".view-toggle", 70);
  await sleep(1500);
  await seg("stade", async () => {
    await click('[data-s3d-stand="Virage Sud"]');
    await sleep(1900);
    await page.evaluate((id) => window.__olympassStadium.showTicket(id, { pov: false }), target.nftId);
    await sleep(1400);
    await click('[data-s3d="pov"]');
    await sleep(2600);
    const box = await page.locator("#s3d").boundingBox();
    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.5, { steps: 40 });
    await page.mouse.up();
    await sleep(900);
  });

  // 3. Achat atomique depuis le stade
  await seg("achat", async () => {
    await click("#s3d-panel [data-buy]");
    await page.waitForSelector(".toast.ok");
    await sleep(1800);
  });

  // 4. Tentative de vente directe : bloquée par le ledger
  await page.waitForSelector("[data-transfer]");
  await scrollTo(".subtabs", 90);
  await sleep(800);
  await seg("fraude", async () => {
    await click("[data-transfer]");
    await page.waitForSelector("[data-transfer-to]");
    await sleep(500);
    await click("[data-transfer-to]");
    await page.waitForSelector("#modal-box .code");
    await sleep(2600);
  });
  await click("[data-close]");
  await sleep(500);

  // 5. QR d'entrée signé
  await seg("qr", async () => {
    await click("[data-qr]");
    await page.waitForSelector(".qr-img");
    await sleep(2600);
  });

  // 6. Portique : entrée validée puis refusée
  await click("#modal-box button.dark");
  await page.waitForSelector("#scan-last");
  await sleep(800);
  await seg("portique-ok", async () => {
    await click("#scan-last");
    await page.waitForSelector(".verdict.ok");
    await sleep(2200);
  });
  await seg("portique-ko", async () => {
    await click("#scan-last");
    await page.waitForSelector(".verdict.ko");
    await sleep(2200);
  });

  // 7. Historique : le billet brûlé reste visible
  await page.goto(`${BASE}/#/fan`);
  await page.waitForSelector("[data-tab='mine']");
  await sleep(800);
  await seg("historique", async () => {
    await click("[data-tab='mine']");
    await page.waitForSelector("[data-mtab='used']");
    await sleep(400);
    await click("[data-mtab='used']");
    await page.waitForSelector(".ticket.used");
    await scrollTo(".subtabs", 90);
    await sleep(2400);
  });
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  const raw = path.join(OUT, "_brut.webm");
  fs.copyFileSync(await video.path(), raw);
  fs.rmSync(await video.path());

  // Découpe : chaque clip dure au plus ~7 s (les attentes du ledger sont accélérées)
  const ff = execFileSync("python", ["-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"]).toString().trim();
  for (const s of segs) {
    const dur = s.end - s.start + 0.3;
    const speed = Math.max(1, dur / 7);
    const mp4 = path.join(OUT, `${s.name}.mp4`);
    execFileSync(ff, ["-y", "-loglevel", "error", "-ss", String(Math.max(0, s.start - 0.2)), "-t", String(dur), "-i", raw,
      "-vf", `setpts=PTS/${speed.toFixed(3)},scale=1600:-2`, "-an", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "22", "-movflags", "+faststart", mp4]);
    execFileSync(ff, ["-y", "-loglevel", "error", "-sseof", "-0.4", "-i", mp4, "-frames:v", "1", path.join(OUT, `${s.name}.png`)]);
    console.log(`Clip ${s.name}.mp4 (${(dur / speed).toFixed(1)} s, x${speed.toFixed(2)})`);
  }
}
