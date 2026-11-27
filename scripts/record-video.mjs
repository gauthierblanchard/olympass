// Enregistre une vidéo du parcours utilisateur complet, avec sous-titres et curseur visible.
// Prérequis : serveur lancé (npm start) et Chrome installé.
// Lancer avec : npm run video   →  video/olympass-parcours.webm
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL || "http://localhost:3000";
const OUT = path.resolve("video");
const W = 1440;
const H = 900;
const FAN_NAME = process.env.FAN_NAME || "Yanis";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Surcouche vidéo : sous-titres, cartons et curseur ----------

const OVERLAY = () => {
  const install = () => {
    if (document.getElementById("rec-style")) return;
    const style = document.createElement("style");
    style.id = "rec-style";
    style.textContent = `
      #rec-cursor{position:fixed;z-index:99999;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;
        background:rgba(42,167,223,.35);border:2px solid #2aa7df;pointer-events:none;transition:transform .12s}
      #rec-cursor.down{transform:scale(.7);background:rgba(42,167,223,.7)}
      #rec-caption{position:fixed;z-index:99998;left:50%;bottom:28px;transform:translateX(-50%) translateY(20px);opacity:0;
        max-width:980px;width:calc(100% - 80px);background:rgba(11,31,58,.94);color:#fff;border-radius:18px;padding:16px 24px;
        font:500 19px/1.4 "Segoe UI",sans-serif;box-shadow:0 20px 50px rgba(0,0,0,.35);border-left:6px solid #2aa7df;
        transition:opacity .35s,transform .35s;pointer-events:none}
      #rec-caption.show{opacity:1;transform:translateX(-50%) translateY(0)}
      #rec-caption b{display:block;color:#67c6ef;font-size:14px;letter-spacing:.08em;text-transform:uppercase;margin-bottom:4px}
      #rec-card{position:fixed;inset:0;z-index:99997;display:grid;place-items:center;text-align:center;color:#fff;
        background:radial-gradient(circle at 50% 30%,#1d3f6e,#0b1f3a 70%);font-family:"Segoe UI",sans-serif;opacity:0;transition:opacity .5s;pointer-events:none}
      #rec-card.show{opacity:1}
      #rec-card h1{font-size:72px;margin:0;font-weight:900;letter-spacing:-.02em}
      #rec-card h1 span{color:#67c6ef}
      #rec-card p{font-size:26px;color:#c9d6e6;margin:14px 0 0}
      .toasts{top:96px!important;bottom:auto!important}
      .osano-cm-window,.osano-cm-dialog{display:none!important}
      #rec-card .step{font-size:18px;color:#67c6ef;letter-spacing:.12em;text-transform:uppercase;font-weight:700;margin-bottom:12px}`;
    document.head.appendChild(style);
    const cursor = Object.assign(document.createElement("div"), { id: "rec-cursor" });
    const caption = Object.assign(document.createElement("div"), { id: "rec-caption" });
    const card = Object.assign(document.createElement("div"), { id: "rec-card" });
    document.body.append(cursor, caption, card);
    document.addEventListener("mousemove", (e) => {
      cursor.style.left = `${e.clientX}px`;
      cursor.style.top = `${e.clientY}px`;
    });
    document.addEventListener("mousedown", () => cursor.classList.add("down"));
    document.addEventListener("mouseup", () => cursor.classList.remove("down"));
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", install);
  else install();
};

async function caption(page, title, text, hold = 0) {
  await page.evaluate(([t, x]) => {
    const c = document.getElementById("rec-caption");
    c.classList.remove("show");
    setTimeout(() => {
      c.innerHTML = `<b>${t}</b>${x}`;
      c.classList.add("show");
    }, 200);
  }, [title, text]);
  await sleep(600 + hold);
}

async function hideCaption(page) {
  await page.evaluate(() => document.getElementById("rec-caption").classList.remove("show"));
  await sleep(300);
}

async function card(page, html, hold = 2800) {
  await page.evaluate((h) => {
    const c = document.getElementById("rec-card");
    c.innerHTML = `<div>${h}</div>`;
    c.classList.add("show");
  }, html);
  await sleep(hold);
  await page.evaluate(() => document.getElementById("rec-card").classList.remove("show"));
  await sleep(600);
}

/** Déplace le curseur visiblement jusqu'à l'élément, puis clique. */
async function click(page, locator, pause = 350) {
  const el = typeof locator === "string" ? page.locator(locator).first() : locator;
  await el.scrollIntoViewIfNeeded();
  await sleep(250);
  const box = await el.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
  await sleep(pause);
  await page.mouse.down();
  await sleep(90);
  await page.mouse.up();
}

async function smoothScroll(page, y, duration = 1200) {
  await page.evaluate(
    ([target, d]) =>
      new Promise((res) => {
        const start = window.scrollY;
        const t0 = performance.now();
        const step = (t) => {
          const k = Math.min(1, (t - t0) / d);
          window.scrollTo(0, start + (target - start) * (1 - Math.pow(1 - k, 3)));
          k < 1 ? requestAnimationFrame(step) : res();
        };
        requestAnimationFrame(step);
      }),
    [y, duration],
  );
}

async function scrollTo(page, selector, offset = 120) {
  const y = await page.evaluate(([s, o]) => document.querySelector(s).getBoundingClientRect().top + window.scrollY - o, [selector, offset]);
  await smoothScroll(page, y);
}

// ---------- Scénario ----------

fs.mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 1,
  recordVideo: { dir: OUT, size: { width: W, height: H } },
  locale: "fr-FR",
});
await context.addInitScript(OVERLAY);
const page = await context.newPage();
page.setDefaultTimeout(90_000);

try {
  // 1. Accueil
  await page.goto(BASE);
  await page.waitForSelector(".hero");
  await card(page, `<h1>Olymp<span>ass</span></h1><p>Le billet de match infalsifiable, sur le XRP Ledger</p>`, 3200);
  await caption(page, "Le problème", "Faux billets, QR codes revendus plusieurs fois, arnaques et marché noir : un billet classique n'est qu'un fichier qu'on peut copier.", 4200);
  await caption(page, "La solution", "Avec Olympass, chaque billet est un NFT émis par le club sur le XRP Ledger : un objet unique, vérifiable par tous.", 3800);
  await smoothScroll(page, 560, 1500);
  await caption(page, "4 garanties", "Infalsifiable, achat sans arnaque, revente au prix facial, une seule entrée au stade.", 3800);
  await hideCaption(page);

  // 2. Le club met des places en vente
  await card(page, `<div class="step">Étape 1</div><h1>Le club émet les billets</h1>`, 2200);
  await page.goto(`${BASE}/#/club`);
  await page.waitForSelector("#mint-form");
  await caption(page, "Espace club", "Le club, émetteur officiel, met en vente 4 places en Virage Sud. Chaque place devient un NFT non transférable.", 1500);
  await scrollTo(page, "#mint-form", 100);
  await page.selectOption('select[name="tribune"]', "Virage Sud");
  await sleep(500);
  await page.fill('input[name="bloc"]', "S4");
  await page.fill('input[name="rang"]', "14");
  await page.fill('input[name="siege"]', "21");
  await page.fill('input[name="count"]', "4");
  await page.fill('input[name="prix"]', "30");
  await sleep(800);
  await click(page, '#mint-form button.primary');
  await caption(page, "Sur la blockchain", "4 transactions NFTokenMint sont soumises d'un coup puis validées par le réseau en quelques secondes.", 0);
  await page.waitForSelector(".toast.ok");
  await sleep(1500);
  await smoothScroll(page, 0, 900);
  await caption(page, "Tableau de bord", "Les billets émis apparaissent dans les indicateurs du club.", 2500);
  await hideCaption(page);

  // 3. Un nouveau supporter s'inscrit
  await card(page, `<div class="step">Étape 2</div><h1>Un supporter s'inscrit</h1>`, 2200);
  await page.goto(`${BASE}/#/login`);
  await page.waitForSelector("#signup");
  await caption(page, "Inscription", `${FAN_NAME} crée son compte : un wallet XRPL est généré pour lui et crédité de XRP de test.`, 1200);
  await click(page, '#signup input[name="name"]');
  await page.keyboard.type(FAN_NAME, { delay: 120 });
  await sleep(400);
  await click(page, "#signup button.primary");
  await page.waitForURL(/#\/fan/);
  await page.waitForSelector(".match-strip");
  await sleep(1200);
  await caption(page, "Espace supporter", "Son wallet est prêt : adresse publique, solde, et le prochain match au Vélodrome.", 3200);

  // 4. Choisir sa place et la voir en 3D
  await scrollTo(page, ".stadium-card", 90);
  await caption(page, "Billetterie", "Le plan du stade montre les places disponibles. On filtre sur le Virage Sud.", 1200);
  await click(page, '[data-saleview="list"]');
  await sleep(1200);
  await click(page, '[data-stand="Virage Sud"]');
  await sleep(1200);
  await click(page, "[data-view3d]");
  await page.waitForSelector("#modal:not(.hidden)");
  await caption(page, "Vue 3D", "Avant d'acheter, le supporter voit le terrain depuis sa place, calculé à partir de la tribune, du bloc et du rang.", 3800);
  await click(page, "[data-close]");
  await hideCaption(page);

  // 5. Achat atomique (deux billets : un pour lui, un qu'il revendra)
  await card(page, `<div class="step">Étape 3</div><h1>Achat sans arnaque</h1>`, 2200);
  await scrollTo(page, ".seats", 90);
  await caption(page, "Achat atomique", "Le billet et les 30 XRP s'échangent dans la même transaction : soit les deux passent, soit aucun.", 0);
  await click(page, "[data-buy]");
  await page.waitForSelector("[data-qr]");
  await sleep(1500);
  await caption(page, "Mon billet", "Le billet est dans le wallet de " + FAN_NAME + ", marqué « Officiel » car émis par l'adresse du club.", 3000);
  await click(page, '[data-tab="sale"]');
  await sleep(800);
  await caption(page, "Un second billet", `${FAN_NAME} achète une deuxième place pour un ami... qui finalement ne peut pas venir.`, 0);
  await click(page, "[data-buy]");
  await page.waitForFunction(() => document.querySelectorAll("[data-qr]").length >= 2);
  await sleep(1500);
  await hideCaption(page);

  // 6. Tentative de fraude
  await card(page, `<div class="step">Étape 4</div><h1>Tentative de marché noir</h1>`, 2200);
  await caption(page, "Vente directe", `${FAN_NAME} essaie de revendre ce billet 150 XRP directement à Nassim, hors de la plateforme officielle.`, 1000);
  await click(page, page.locator("[data-transfer]").nth(1));
  await page.waitForSelector("[data-transfer-to]");
  await sleep(900);
  await click(page, "[data-transfer-to]");
  await page.waitForSelector("#modal-box .code");
  await caption(page, "Bloqué par le registre", "Ce n'est pas l'application qui refuse : c'est le XRP Ledger lui-même (tefNFTOKEN_IS_NOT_TRANSFERABLE). Aucun site de revente ne peut contourner cette règle.", 5200);
  await click(page, "[data-close]");
  await hideCaption(page);

  // 7. Revente officielle
  await card(page, `<div class="step">Étape 5</div><h1>Revente au prix facial</h1>`, 2200);
  await caption(page, "Bourse officielle", "La seule revente possible : le club rachète le billet au prix facial et le remet en vente pour un autre supporter.", 800);
  await click(page, page.locator("[data-resale]").nth(1));
  await page.waitForSelector("[data-confirm-resale]");
  await sleep(1500);
  await click(page, "[data-confirm-resale]");
  await page.waitForFunction(() => document.querySelectorAll("[data-qr]").length === 1);
  await sleep(1200);
  await caption(page, "Revendu", `${FAN_NAME} a récupéré ses 30 XRP. Pas de spéculation possible.`, 2600);
  await hideCaption(page);

  // 8. Entrée au stade
  await card(page, `<div class="step">Étape 6</div><h1>Le jour du match</h1>`, 2200);
  const nftId = await page.locator("[data-qr]").first().getAttribute("data-qr");
  await click(page, "[data-qr]");
  await page.waitForSelector(".qr-img");
  await caption(page, "QR d'entrée signé", "Le QR est signé par le wallet du supporter et expire au bout de 60 secondes : une capture d'écran revendue ne sert à rien.", 4200);
  await click(page, "#modal-box button.dark");
  await page.waitForSelector("#scan-last");
  await sleep(800);
  await caption(page, "Portique", "Le contrôleur scanne : signature, âge du QR et détention du billet sont vérifiés sur le ledger.", 800);
  await click(page, "#scan-last");
  await page.waitForSelector(".verdict.ok");
  await caption(page, "Entrée validée", "Le billet est brûlé sur le ledger (NFTokenBurn) : il ne pourra plus jamais servir.", 3800);
  await caption(page, "Et si quelqu'un réutilise le QR ?", "On présente une seconde fois le même QR, comme avec une capture d'écran revendue...", 1200);
  await click(page, "#scan-last");
  await page.waitForSelector(".verdict.ko");
  await caption(page, "Entrée refusée", "Le billet n'existe plus dans aucun wallet : impossible d'entrer deux fois.", 3600);
  await hideCaption(page);

  // 9. Vérification publique
  await card(page, `<div class="step">Étape 7</div><h1>Tout le monde peut vérifier</h1>`, 2200);
  await page.goto(`${BASE}/#/verify/${nftId}`);
  await page.waitForSelector(".verify-result .status-line");
  await sleep(800);
  await caption(page, "Vérification publique", "Avec le seul identifiant du billet, n'importe qui lit sur le registre public : émetteur officiel, détenteur, et s'il a déjà servi.", 5000);
  await hideCaption(page);

  // 10. Vue club
  await page.goto(`${BASE}/#/club`);
  await page.waitForSelector(".kpis");
  await sleep(800);
  await caption(page, "Côté club", "Ventes, reventes officielles, entrées au stade et fraudes bloquées, en temps réel.", 3000);
  await scrollTo(page, ".feed", 140);
  await caption(page, "Traçabilité", "Chaque action renvoie à sa transaction sur l'explorateur public du XRP Ledger.", 3500);
  await hideCaption(page);

  // 11. Preuve sur l'explorateur public
  const club = await page.evaluate(() => fetch("/api/config").then((r) => r.json()).then((c) => c.club));
  try {
    await page.goto(`https://testnet.xrpl.org/accounts/${club}`, { timeout: 20_000 });
    await sleep(4000);
    await caption(page, "Explorateur XRPL", "Le compte du club et toutes ses transactions sont publics et vérifiables par tous.", 4000);
  } catch {
    // Explorateur injoignable : on passe directement à la conclusion.
  }

  await page.goto(BASE);
  await page.waitForSelector(".hero");
  await card(page, `<h1>Olymp<span>ass</span></h1><p>Un billet unique, vérifiable par tous, que personne ne peut revendre hors des règles.</p>`, 4200);
} finally {
  const video = page.video();
  await context.close();
  await browser.close();
  const file = path.join(OUT, "olympass-parcours.webm");
  if (video) {
    fs.copyFileSync(await video.path(), file);
    fs.rmSync(await video.path());
    console.log(`Vidéo : ${file}`);
  }
}
