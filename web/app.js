// Olympass : interface web (accueil, connexion, supporter, club, portique, vérification).
import { seatView3D } from "./seatview.js";
import { crest, detectLocalLogos } from "./crests.js";

/** Bandeau du match sur fond de photo du Vélodrome. */
function matchStrip(m, extra = "") {
  return `<div class="match-strip">
    <div class="team">${crest("OM", 64)}<span>Olympique de Marseille</span></div>
    <div class="center"><div class="comp">${esc(m.competition)}</div><div class="kick">${esc(m.time)}</div>
      <div class="when">${esc(fmtDate(m.date))}<br>${esc(m.stadium)}</div>${extra}</div>
    <div class="team">${crest("PSG", 64)}<span>Paris Saint-Germain</span></div>
  </div>`;
}

const $ = (s, root = document) => root.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const EXPLORER = "https://testnet.xrpl.org";
const TRIBUNES = ["Jean-Bouin", "Ganay", "Virage Nord", "Virage Sud"];

const state = { config: null, me: null, fanTab: "sale", mineTab: "active", standFilter: null, clubTimer: null };

// ---------- Utilitaires ----------

async function api(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Erreur serveur");
  return data;
}

const initials = (name) => name.trim().slice(0, 1).toUpperCase();
const avatar = (u, cls = "") => `<span class="avatar ${cls}" style="background:${esc(u.color)}">${esc(initials(u.name))}</span>`;
const shortAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
const fmtDate = (d) => new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const xrp = (n) => `${Number(n).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} XRP`;
/** Équivalent en euros au taux fictif de démo fourni par le serveur. */
const eur = (n) =>
  (Number(n) * (state.config?.eurPerXrp ?? 2.5)).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
const money = (n) => `${xrp(n)} <span class="eur">≈ ${eur(n)}</span>`;

function toast(text, status = "ok", links = {}) {
  const el = document.createElement("div");
  el.className = `toast ${status}`;
  el.innerHTML = `<div>${esc(text)}</div>${Object.keys(links).length ? `<div style="margin-top:6px">${Object.entries(links)
    .map(([l, u]) => `<a href="${esc(u)}" target="_blank">${esc(l)} ↗</a>`)
    .join("")}</div>` : ""}`;
  $("#toasts").appendChild(el);
  setTimeout(() => el.remove(), 9000);
}

/** Désactive le bouton et affiche un indicateur pendant une opération sur le ledger. */
async function busy(button, label, fn) {
  const html = button?.innerHTML;
  if (button) {
    button.disabled = true;
    button.innerHTML = `<span class="spinner"></span>${esc(label)}`;
  }
  try {
    return await fn();
  } finally {
    if (button && button.isConnected) {
      button.disabled = false;
      button.innerHTML = html;
    }
  }
}

function openModal(html) {
  $("#modal-box").style.width = "";
  $("#modal-box").innerHTML = html;
  $("#modal").classList.remove("hidden");
}
function closeModal() {
  $("#modal").classList.add("hidden");
  clearInterval(state.qrTimer);
}
$("#modal").addEventListener("click", (e) => {
  if (e.target.id === "modal" || e.target.closest("[data-close]")) closeModal();
});

// ---------- Session ----------

async function loadMe() {
  const id = localStorage.getItem("olympass:user");
  if (!id) return (state.me = null);
  try {
    state.me = await api("GET", `/users/${id}`);
  } catch {
    localStorage.removeItem("olympass:user");
    state.me = null;
  }
}

function login(user) {
  localStorage.setItem("olympass:user", user.id);
  location.hash = "#/fan";
}

function renderUserChip() {
  const me = state.me;
  $("#user-chip").innerHTML = me
    ? `${avatar(me)}<div class="who"><strong>${esc(me.name)}</strong><br><small>${xrp(me.balance)} · ≈ ${eur(me.balance)}</small></div>
       <button data-logout>Changer</button>`
    : `<button class="primary" onclick="location.hash='#/login'">Se connecter</button>`;
}

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-logout]")) {
    localStorage.removeItem("olympass:user");
    state.me = null;
    location.hash = "#/login";
  }
});

// ---------- Composants ----------

function ticketHTML(t, { actions = "", proof = true, used = null } = {}) {
  const s = t.seat || {};
  const m = state.config.match;
  return `<div>
    <div class="ticket${used ? " used" : ""}">
      ${used ? `<div class="stamp">Utilisé<small>${esc(used)}</small></div>` : ""}
      <div class="main">
        <div class="comp">${esc(m.competition)}</div>
        <div class="teams">${crest("OM", 30)} OM <span style="color:var(--sky-2)">vs</span> PSG ${crest("PSG", 30)}</div>
        <div class="when">${esc(fmtDate(s.date || m.date))} · ${esc(m.time)} · ${esc(m.stadium)}</div>
        <div class="grid">
          <span>Tribune</span><span>Bloc</span><span>Rang</span><span>Siège</span>
          <b>${esc(s.tribune)}</b><b>${esc(s.bloc)}</b><b>${esc(s.rang)}</b><b>${esc(s.siege)}</b>
        </div>
      </div>
      <div class="stub">
        <span class="price">${esc(s.prix)}</span><small>XRP</small><small class="eur-stub">≈ ${eur(s.prix)}</small>
        ${used ? `<span class="badge ko">Brûlé</span>` : `<span class="badge ok" title="Émis par l'adresse officielle du club">✓ Officiel</span>`}
      </div>
    </div>
    ${proof ? `<div class="ticket-proof">NFT XRPL · <a class="mono" href="#/verify/${esc(t.nftId)}">${esc(t.nftId.slice(0, 10))}…${esc(t.nftId.slice(-6))}</a></div>` : ""}
    ${actions ? `<div class="ticket-foot">${actions}</div>` : ""}
  </div>`;
}

function stadiumSVG(counts, selected) {
  const stand = (name, x, y, w, h) => {
    const n = counts[name] || 0;
    const fill = selected === name ? "var(--navy)" : n ? "var(--sky)" : "#cfd8e3";
    const ink = selected === name || n ? "#fff" : "#6b7b8f";
    return `<g class="stand" data-stand="${esc(name)}">
      <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${fill}"/>
      ${w < 100
        ? name.split(" ").map((part, i) => `<text x="${x + w / 2}" y="${y + h / 2 - 12 + i * 15}" text-anchor="middle" fill="${ink}" font-size="12" font-weight="700">${esc(part)}</text>`).join("")
        : `<text x="${x + w / 2}" y="${y + h / 2 - 2}" text-anchor="middle" fill="${ink}" font-size="13" font-weight="700">${esc(name)}</text>`}
      <text x="${x + w / 2}" y="${y + h / 2 + (w < 100 ? 24 : 15)}" text-anchor="middle" fill="${ink}" font-size="11">${n} dispo</text>
    </g>`;
  };
  return `<svg viewBox="0 0 360 270" role="img" aria-label="Plan du stade">
    ${stand("Jean-Bouin", 86, 12, 188, 52)}
    ${stand("Ganay", 86, 206, 188, 52)}
    ${stand("Virage Nord", 12, 76, 66, 118)}
    ${stand("Virage Sud", 282, 76, 66, 118)}
    <rect x="90" y="76" width="180" height="118" rx="6" fill="#2f9e58"/>
    <g stroke="#fff" stroke-opacity=".85" fill="none" stroke-width="1.5">
      <rect x="98" y="84" width="164" height="102"/>
      <line x1="180" y1="84" x2="180" y2="186"/>
      <circle cx="180" cy="135" r="16"/>
      <rect x="98" y="110" width="22" height="50"/><rect x="240" y="110" width="22" height="50"/>
    </g>
  </svg>`;
}

// ---------- Pages ----------

const pages = {};

pages.home = async () => {
  const m = state.config.match;
  return `
  <section class="hero">
    <span class="badge" style="background:rgba(255,255,255,.12);color:#fff">Propulsé par le XRP Ledger</span>
    <h1 style="margin-top:14px">Votre billet de match, <span>impossible à falsifier.</span></h1>
    <p>Chaque billet est un NFT émis par le club. Pas de faux, pas de double vente, pas de revente au marché noir : la revente passe par la bourse officielle, au prix facial.</p>
    <div class="cta">
      <button class="primary" onclick="location.hash='${state.me ? "#/fan" : "#/login"}'">${state.me ? "Accéder à mes billets" : "Créer mon compte supporter"}</button>
      <button class="ghost" onclick="location.hash='#/verify'">Vérifier un billet</button>
    </div>
    <div class="match-banner">
      ${crest("OM", 44)}
      <div><div class="vs">OM <span style="color:var(--sky-2)">—</span> PSG</div>
      <div class="meta">${esc(m.competition)} · ${esc(fmtDate(m.date))} · ${esc(m.time)}</div></div>
      ${crest("PSG", 44)}
    </div>
    <span class="photo-credit">Photo : Zakarie Faibis, CC BY-SA 4.0, Wikimedia Commons</span>
  </section>

  <div class="features">
    <div class="feature"><div class="icon">⛨</div><h3>Infalsifiable</h3><p>Le billet n'existe que sur le registre public. Un faux ne porte pas la signature du club et se voit immédiatement.</p></div>
    <div class="feature"><div class="icon">⇄</div><h3>Achat sans arnaque</h3><p>Le billet et le paiement s'échangent dans la même transaction : soit les deux passent, soit aucun.</p></div>
    <div class="feature"><div class="icon">€</div><h3>Revente au juste prix</h3><p>Le ledger bloque toute vente directe entre particuliers. La revente passe par le club, au prix facial.</p></div>
    <div class="feature"><div class="icon">▣</div><h3>Une seule entrée</h3><p>Le QR est signé par votre wallet et expire en 60 s. Au portique, le billet est brûlé : impossible de rentrer deux fois.</p></div>
  </div>

  <div class="section-title"><h2>Accès</h2></div>
  <div class="portals">
    <button class="portal" onclick="location.hash='#/fan'"><span class="badge">Supporter</span><h3>Billetterie</h3><p>Acheter, revendre, présenter son billet.</p></button>
    <button class="portal" onclick="location.hash='#/club'"><span class="badge gold">Club</span><h3>Tableau de bord</h3><p>Émettre les billets, suivre les ventes et les fraudes.</p></button>
    <button class="portal" onclick="location.hash='#/gate'"><span class="badge">Stade</span><h3>Portique</h3><p>Scanner les QR codes à l'entrée.</p></button>
    <button class="portal" onclick="location.hash='#/verify'"><span class="badge">Public</span><h3>Vérifier un billet</h3><p>Contrôler un billet avant de l'acheter.</p></button>
  </div>`;
};

pages.login = async () => {
  const users = await api("GET", "/users");
  return `
  <div class="auth">
    <div class="card" style="padding:0;overflow:hidden">
      <div class="login-photo"><span class="photo-credit">Photo : Zakarie Faibis, CC BY-SA 4.0</span></div>
      <div style="padding:24px">
      <h1>Bon retour au Vélodrome</h1>
      <p class="muted">Choisissez votre profil supporter.</p>
      <div class="profiles">
        ${users
          .map((u) => `<button class="profile" data-login="${esc(u.id)}">${avatar(u, "lg")}${esc(u.name)}<small>${esc(shortAddr(u.address))}</small></button>`)
          .join("")}
      </div>
      </div>
    </div>
    <form class="card signup" id="signup">
      <h2>Nouveau supporter ?</h2>
      <p>Créez votre compte en 10 secondes. Un wallet XRPL est généré pour vous et crédité de XRP de test.</p>
      <label>Votre prénom<input name="name" placeholder="ex. Sofiane" maxlength="24" required autocomplete="off" /></label>
      <button class="primary block" style="margin-top:16px">Créer mon compte</button>
      <ul class="steps hidden" id="signup-steps">
        <li data-step="0"><span class="dot"></span>Génération de votre wallet XRPL</li>
        <li data-step="1"><span class="dot"></span>Crédit de 100 XRP de test par le faucet</li>
        <li data-step="2"><span class="dot"></span>Enregistrement de votre profil</li>
      </ul>
    </form>
  </div>`;
};

pages.login.after = () => {
  document.querySelectorAll("[data-login]").forEach((b) => b.addEventListener("click", () => login({ id: b.dataset.login })));
  $("#signup").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = e.target.name.value;
    const steps = $("#signup-steps");
    steps.classList.remove("hidden");
    const mark = (i, cls) => (steps.querySelector(`[data-step="${i}"]`).className = cls);
    mark(0, "doing");
    const t1 = setTimeout(() => (mark(0, "done"), mark(1, "doing")), 1200);
    try {
      const user = await busy(e.submitter, "Création en cours", () => api("POST", "/users", { name }));
      clearTimeout(t1);
      [0, 1, 2].forEach((i) => mark(i, "done"));
      toast(`Bienvenue ${user.name} ! Votre wallet ${shortAddr(user.address)} est prêt.`, "ok", { "Voir le wallet": `${EXPLORER}/accounts/${user.address}` });
      setTimeout(() => login(user), 700);
    } catch (err) {
      clearTimeout(t1);
      steps.classList.add("hidden");
      toast(err.message, "ko");
    }
  });
};

pages.fan = async () => {
  if (!state.me) {
    location.hash = "#/login";
    return "";
  }
  const me = state.me;
  const [sale, mine, used] = await Promise.all([
    api("GET", "/sale"),
    api("GET", `/users/${me.id}/tickets`),
    api("GET", `/users/${me.id}/history`),
  ]);
  state.sale = sale;
  state.mine = mine;
  const counts = Object.fromEntries(TRIBUNES.map((t) => [t, sale.filter((x) => x.seat?.tribune === t).length]));
  const filtered = state.standFilter ? sale.filter((x) => x.seat?.tribune === state.standFilter) : sale;

  const saleHTML = `
    <div class="sale-layout">
      <div class="card stadium-card">
        <h3>Orange Vélodrome</h3>
        <p class="muted" style="margin:4px 0 12px">Cliquez sur une tribune pour filtrer.</p>
        <div class="stadium">${stadiumSVG(counts, state.standFilter)}</div>
        <div class="legend"><span><i style="background:var(--sky)"></i>Places dispo</span><span><i style="background:#cfd8e3"></i>Complet</span><span><i style="background:var(--navy)"></i>Sélection</span></div>
        ${state.standFilter ? `<button class="ghost block" style="margin-top:12px" data-stand-clear>Voir toutes les tribunes</button>` : ""}
      </div>
      <div class="seats">
        ${filtered.length
          ? filtered
              .map(
                (t) => `<div class="seat-row">
                  <span class="badge">${esc(t.seat?.tribune)}</span>
                  <div class="where"><strong>Bloc ${esc(t.seat?.bloc)} · Rang ${esc(t.seat?.rang)} · Siège ${esc(t.seat?.siege)}</strong>
                  <span class="muted" style="font-size:.85rem">Billet officiel · revente encadrée</span></div>
                  <button class="ghost" data-view3d="${esc(t.nftId)}" data-src="sale">Vue 3D</button>
                  <span class="price">${esc(t.seat?.prix)} XRP<small class="eur">≈ ${eur(t.seat?.prix)}</small></span>
                  <button class="primary" data-buy="${esc(t.nftId)}">Acheter</button>
                </div>`,
              )
              .join("")
          : `<div class="empty">Aucune place disponible${state.standFilter ? ` en ${esc(state.standFilter)}` : ""} pour le moment.</div>`}
      </div>
    </div>`;

  const fmtUsed = (iso) =>
    iso ? new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "";
  const availableHTML = mine.length
    ? `<div class="tickets">${mine
        .map((t) =>
          ticketHTML(t, {
            actions: `<button class="primary" data-qr="${esc(t.nftId)}">Afficher mon QR</button>
              <button data-view3d="${esc(t.nftId)}" data-src="mine">Vue 3D de ma place</button>
              <button data-resale="${esc(t.nftId)}">Revendre</button>
              <button class="danger" data-transfer="${esc(t.nftId)}">Vendre à un ami</button>`,
          }),
        )
        .join("")}</div>`
    : `<div class="empty">Aucun billet disponible. Rendez-vous dans la billetterie !</div>`;

  const usedHTML = used.length
    ? `<p class="muted" style="margin:0 0 16px">Ces billets ont été brûlés au portique : le NFT n'existe plus, mais la transaction NFTokenBurn reste inscrite pour toujours sur le ledger.</p>
       <div class="tickets">${used
         .map((t) =>
           ticketHTML(t, {
             used: `le ${fmtUsed(t.usedAt)}`,
             actions: `<a class="btn-link" href="${esc(t.burnTx)}" target="_blank">Preuve sur le ledger ↗</a>
               <a class="btn-link" href="#/verify/${esc(t.nftId)}">Vérifier le billet</a>`,
           }),
         )
         .join("")}</div>`
    : `<div class="empty">Aucun billet utilisé pour l'instant. Après votre passage au portique, vos billets apparaîtront ici.</div>`;

  const mineHTML = `
    <div class="subtabs">
      <button data-mtab="active" class="${state.mineTab === "active" ? "active" : ""}">Disponibles<span class="count">${mine.length}</span></button>
      <button data-mtab="used" class="${state.mineTab === "used" ? "active" : ""}">Utilisés<span class="count">${used.length}</span></button>
    </div>
    ${state.mineTab === "used" ? usedHTML : availableHTML}`;

  return `
    <div class="fan-head">
      <div class="wallet-card">${avatar(me, "lg")}<div><h1>Salut ${esc(me.name)} 👋</h1>
        <a class="mono" href="${EXPLORER}/accounts/${esc(me.address)}" target="_blank">${esc(me.address)} ↗</a></div></div>
      <div class="card" style="padding:16px 22px"><div class="muted" style="font-size:.85rem">Solde du wallet</div><div class="balance" style="font-size:1.6rem;font-weight:800">${xrp(me.balance)}</div><div class="eur">≈ ${eur(me.balance)}</div><div class="muted" style="font-size:.72rem;margin-top:4px">Taux fictif de démo : 1 XRP = ${eur(1)}</div></div>
    </div>
    ${matchStrip(state.config.match)}
    <div class="tabs">
      <button data-tab="sale" class="${state.fanTab === "sale" ? "active" : ""}">Billetterie<span class="count">${sale.length}</span></button>
      <button data-tab="mine" class="${state.fanTab === "mine" ? "active" : ""}">Mes billets<span class="count">${mine.length + used.length}</span></button>
    </div>
    ${state.fanTab === "sale" ? saleHTML : mineHTML}`;
};

pages.fan.after = () => {
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => ((state.fanTab = b.dataset.tab), render())));
  document.querySelectorAll("[data-mtab]").forEach((b) => b.addEventListener("click", () => ((state.mineTab = b.dataset.mtab), render())));
  document.querySelectorAll("[data-stand]").forEach((g) =>
    g.addEventListener("click", () => ((state.standFilter = state.standFilter === g.dataset.stand ? null : g.dataset.stand), render())),
  );
  $("[data-stand-clear]")?.addEventListener("click", () => ((state.standFilter = null), render()));
};

const findTicket = (id) => [...(state.sale || []), ...(state.mine || [])].find((t) => t.nftId === id);

// Actions supporter (délégation d'événements)
document.addEventListener("click", async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  const me = state.me;

  if (b.dataset.view3d) {
    const t = findTicket(b.dataset.view3d);
    const s = t.seat;
    openModal(`<h2>Vue depuis votre place</h2>
      <p>${esc(s.tribune)} · Bloc ${esc(s.bloc)} · Rang ${esc(s.rang)} · Siège ${esc(s.siege)}</p>
      <div style="border-radius:16px;overflow:hidden;border:1px solid var(--line)">${seatView3D(s)}</div>
      <p style="font-size:.8rem">Rendu 3D calculé à partir de la tribune, du bloc et du rang. Indicatif.</p>
      <div class="actions"><button data-close>Fermer</button></div>`);
    $("#modal-box").style.width = "min(720px, 100%)";
  }

  if (b.dataset.buy) {
    try {
      const r = await busy(b, "Validation sur le ledger", () => api("POST", `/tickets/${b.dataset.buy}/buy`, { userId: me.id }));
      toast("Billet acheté ! Le paiement et le billet ont été échangés dans la même transaction.", "ok", { Transaction: r.accept });
      state.fanTab = "mine";
      await refreshMe();
    } catch (err) {
      toast(`Achat impossible : ${err.message}`, "ko");
    }
  }

  if (b.dataset.resale) {
    const t = findTicket(b.dataset.resale);
    openModal(`<div class="big">↩</div><h2>Revendre ce billet ?</h2>
      <p>Le club vous le rachète au prix facial de <b>${esc(t.seat.prix)} XRP (≈ ${eur(t.seat.prix)})</b> et le remet en vente pour un autre supporter. Pas de spéculation possible.</p>
      <div class="actions"><button data-close>Annuler</button><button class="primary" data-confirm-resale="${esc(t.nftId)}">Revendre ${esc(t.seat.prix)} XRP</button></div>`);
  }

  if (b.dataset.confirmResale) {
    try {
      const r = await busy(b, "Rachat par le club", () => api("POST", `/tickets/${b.dataset.confirmResale}/resale`, { userId: me.id }));
      closeModal();
      toast("Billet revendu au club. Les XRP sont sur votre wallet.", "ok", { Transaction: r.accept });
      await refreshMe();
    } catch (err) {
      toast(`Revente impossible : ${err.message}`, "ko");
    }
  }

  if (b.dataset.transfer) {
    const users = (await api("GET", "/users")).filter((u) => u.id !== me.id);
    openModal(`<h2>Vendre à un ami</h2><p>Choisissez le supporter à qui vous voulez vendre ce billet 150 XRP (≈ ${eur(150)}), soit plus du double du prix facial.</p>
      <div class="friends">${users.map((u) => `<button class="friend" data-transfer-to="${esc(u.id)}" data-nft="${esc(b.dataset.transfer)}">${avatar(u)}<span>${esc(u.name)}</span></button>`).join("")}</div>
      <div class="actions"><button data-close>Annuler</button></div>`);
  }

  if (b.dataset.transferTo) {
    try {
      const r = await busy(b, "Envoi au ledger", () => api("POST", `/tickets/${b.dataset.nft}/transfer`, { userId: me.id, toUserId: b.dataset.transferTo }));
      openModal(r.accepted
        ? `<h2>Transfert effectué</h2><div class="actions"><button data-close>Fermer</button></div>`
        : `<div class="big">⛔</div><h2>Bloqué par le XRP Ledger</h2>
           <p>Ce billet n'est pas transférable entre particuliers. Ce n'est pas l'application qui refuse : c'est le registre lui-même. Aucun site de revente ne peut contourner cette règle.</p>
           <span class="code">${esc(r.code)}</span>
           <p style="margin-top:14px">Pour revendre, passez par la bourse officielle au prix facial.</p>
           <div class="actions"><button data-close>Compris</button></div>`);
    } catch (err) {
      toast(err.message, "ko");
    }
  }

  if (b.dataset.qr) {
    try {
      const { proof, image } = await busy(b, "Signature", () => api("POST", `/tickets/${b.dataset.qr}/qr`, { userId: me.id }));
      localStorage.setItem("olympass:lastQR", JSON.stringify(proof));
      openModal(`<h2>Votre billet d'entrée</h2><p>Présentez ce QR au portique.</p>
        <img class="qr-img" src="${image}" alt="QR code d'entrée" />
        <div class="countdown"><div id="qr-bar" style="width:100%"></div></div>
        <p id="qr-left" style="font-weight:700;color:var(--navy)"></p>
        <p style="font-size:.82rem">Signé par votre wallet et renouvelé toutes les 60 s : une capture d'écran revendue ne fonctionne pas.</p>
        <div class="actions"><button data-close>Fermer</button><button class="dark" onclick="location.hash='#/gate'">Aller au portique</button></div>`);
      const tick = () => {
        const left = Math.max(0, 60 - Math.floor(Date.now() / 1000 - proof.ts));
        const bar = $("#qr-bar");
        if (!bar) return clearInterval(state.qrTimer);
        bar.style.width = `${(left / 60) * 100}%`;
        $("#qr-left").textContent = left ? `Valable encore ${left} s` : "QR expiré : générez-en un nouveau";
      };
      tick();
      clearInterval(state.qrTimer);
      state.qrTimer = setInterval(tick, 1000);
    } catch (err) {
      toast(err.message, "ko");
    }
  }
});

async function refreshMe() {
  await loadMe();
  renderUserChip();
  render();
}

// ---------- Club ----------

const EVENT_ICONS = { mint: "＋", buy: "🎟", resale: "↩", fraud: "⛔", refused: "⛔", entry: "✓", signup: "👤", transfer: "⇄" };

pages.club = async () => {
  const [stats, tickets] = await Promise.all([api("GET", "/stats"), api("GET", "/tickets")]);
  const statusBadge = (t) =>
    t.status === "utilisé" ? `<span class="badge ko">Utilisé</span>` : t.ownerName === "Club" ? `<span class="badge">En vente</span>` : `<span class="badge ok">Vendu</span>`;
  return `
    <div class="fan-head"><div><span class="badge gold">Espace club</span><h1 style="margin-top:8px">Tableau de bord billetterie</h1>
      <p class="muted">OM — PSG · Émetteur officiel <a class="mono" href="${EXPLORER}/accounts/${esc(state.config.club)}" target="_blank">${esc(state.config.club)} ↗</a></p></div></div>
    <div class="kpis" style="margin-top:20px">
      <div class="kpi"><div class="v">${stats.minted}</div><div class="l">Billets émis</div></div>
      <div class="kpi good"><div class="v">${stats.sold}</div><div class="l">Billets vendus</div></div>
      <div class="kpi"><div class="v">${stats.onSale}</div><div class="l">En vente</div></div>
      <div class="kpi"><div class="v">${stats.resales}</div><div class="l">Reventes officielles</div></div>
      <div class="kpi"><div class="v">${stats.used}</div><div class="l">Entrées au stade</div></div>
      <div class="kpi alert"><div class="v">${stats.fraudBlocked}</div><div class="l">Fraudes bloquées</div></div>
      <div class="kpi"><div class="v">${stats.users}</div><div class="l">Supporters inscrits</div></div>
    </div>
    <div class="club-grid">
      <div>
        <form class="card" id="mint-form">
          <h2>Mettre des places en vente</h2>
          <p class="muted" style="margin:4px 0 0">Chaque place devient un NFT non transférable émis par le club.</p>
          <div class="form-grid">
            <label>Tribune<select name="tribune">${TRIBUNES.map((t) => `<option>${t}</option>`).join("")}</select></label>
            <label>Bloc<input name="bloc" value="G12" required /></label>
            <label>Rang<input name="rang" type="number" min="1" max="40" value="8" required /></label>
            <label>Premier siège<input name="siege" type="number" min="1" value="1" required /></label>
            <label>Nombre de places<input name="count" type="number" min="1" max="20" value="4" required /></label>
            <label>Prix facial (XRP)<input name="prix" type="number" min="1" value="25" required /><span class="eur" id="prix-eur">≈ ${eur(25)}</span></label>
          </div>
          <button class="primary">Émettre les billets</button>
        </form>
        <div class="card" style="margin-top:20px">
          <h2>Billets</h2>
          <table><thead><tr><th>Place</th><th>Prix</th><th>Détenteur</th><th>Statut</th><th></th></tr></thead>
          <tbody>${tickets.length
            ? tickets
                .slice(0, 40)
                .map((t) => `<tr><td><b>${esc(t.tribune)}</b> · ${esc(t.bloc)} · R${esc(t.rang)} · S${esc(t.siege)}</td><td>${esc(t.prix)} XRP <span class="eur">≈ ${eur(t.prix)}</span></td>
                  <td>${esc(t.ownerName ?? "—")}</td><td>${statusBadge(t)}</td><td><a href="#/verify/${esc(t.nftId)}">Vérifier</a></td></tr>`)
                .join("")
            : `<tr><td colspan="5" class="muted">Aucun billet émis.</td></tr>`}</tbody></table>
        </div>
      </div>
      <div class="card">
        <h2>Activité en direct</h2>
        <ul class="feed" style="margin-top:12px">${stats.events
          .map((ev) => `<li><span class="ic ${ev.type === "fraud" || ev.type === "refused" ? "fraud" : ev.type === "entry" ? "entry" : ""}">${EVENT_ICONS[ev.type] || "•"}</span>
            <div>${esc(ev.text)}${ev.code ? ` <span class="badge ko">${esc(ev.code)}</span>` : ""}
            <time>${new Date(ev.at).toLocaleTimeString("fr-FR")}${ev.tx ? ` · <a href="${esc(ev.tx)}" target="_blank">transaction ↗</a>` : ""}</time></div></li>`)
          .join("") || `<li class="muted">Aucune activité.</li>`}</ul>
      </div>
    </div>`;
};

pages.club.after = () => {
  const prix = $('#mint-form input[name="prix"]');
  prix.addEventListener("input", () => ($("#prix-eur").textContent = `≈ ${eur(prix.value || 0)}`));
  $("#mint-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const body = Object.fromEntries(new FormData(e.target));
    try {
      const r = await busy(e.submitter, `Émission de ${body.count} billet(s)`, () => api("POST", "/tickets/batch", body));
      toast(`${r.minted} billet(s) émis sur le ledger${r.failed ? `, ${r.failed} en échec` : ""}.`, r.failed ? "ko" : "ok", r.txs[0] ? { "Première transaction": r.txs[0] } : {});
      render();
    } catch (err) {
      toast(err.message, "ko");
    }
  });
  clearInterval(state.clubTimer);
  state.clubTimer = setInterval(() => route() === "club" && !document.activeElement?.closest("form") && render(), 10000);
};

// ---------- Portique ----------

pages.gate = async () => `
  <div class="gate">
    <div>
      <span class="badge" style="background:rgba(255,255,255,.12);color:#fff">Contrôle d'accès · Porte 7</span>
      <h1 style="margin-top:12px">Portique d'entrée</h1>
      <p>Le scan vérifie la signature du wallet, l'âge du QR et la détention du billet sur le ledger, puis brûle le billet.</p>
      <div class="scanner"><div class="laser"></div></div>
      <button class="primary block" id="scan-last" style="padding:16px;font-size:1.05rem">Scanner le QR présenté</button>
      <details><summary>Saisie manuelle du QR</summary>
        <textarea id="qr-input" rows="4" placeholder='{"nftId":"…","ts":…,"publicKey":"…","signature":"…"}'></textarea>
        <button id="scan-paste" class="ghost" style="color:#fff">Scanner ce contenu</button>
      </details>
    </div>
    <div class="verdict" id="verdict">
      <div class="big">▣</div><h2>En attente</h2><p>Présentez un QR code.</p>
    </div>
  </div>`;

pages.gate.after = () => {
  const show = async (proof, btn) => {
    const v = $("#verdict");
    v.className = "verdict";
    v.innerHTML = `<div class="spinner" style="width:40px;height:40px;border-width:4px"></div><h2>Vérification…</h2>`;
    try {
      const r = await busy(btn, "Lecture du ledger", () => api("POST", "/scan", proof));
      const seat = r.seat ? `${esc(r.seat.tribune)} · Bloc ${esc(r.seat.bloc)} · Rang ${esc(r.seat.rang)} · Siège ${esc(r.seat.siege)}` : "";
      if (r.entry) {
        v.className = "verdict ok";
        v.innerHTML = `<div class="big">✓</div><h2>Bienvenue ${esc(r.holderName ?? "")}</h2><p>${seat}</p><p>Billet brûlé sur le ledger : il ne pourra plus servir.</p><a href="${esc(r.burn)}" target="_blank">Voir la transaction ↗</a>`;
      } else {
        v.className = "verdict ko";
        v.innerHTML = `<div class="big">✕</div><h2>Entrée refusée</h2><p>${esc(r.reason)}</p>${seat ? `<p>${seat}</p>` : ""}`;
      }
    } catch (err) {
      v.className = "verdict ko";
      v.innerHTML = `<div class="big">✕</div><h2>QR invalide</h2><p>${esc(err.message)}</p>`;
    }
  };
  $("#scan-last").addEventListener("click", (e) => {
    const raw = localStorage.getItem("olympass:lastQR");
    if (!raw) return toast("Aucun QR présenté : affichez un billet depuis l'espace supporter.", "ko");
    show(JSON.parse(raw), e.currentTarget);
  });
  $("#scan-paste").addEventListener("click", (e) => {
    try {
      show(JSON.parse($("#qr-input").value), e.currentTarget);
    } catch {
      toast("Contenu de QR illisible", "ko");
    }
  });
};

// ---------- Vérification ----------

pages.verify = async (id = "") => `
  <div class="verify-box">
    <h1>Vérifier un billet</h1>
    <p class="muted">On vous propose un billet sur les réseaux sociaux ? Collez son identifiant : le registre public vous dit s'il est authentique, à qui il appartient et s'il a déjà servi.</p>
    <form class="verify-form" id="verify-form">
      <input id="verify-id" value="${esc(id)}" placeholder="Identifiant du billet (NFTokenID)" required />
      <button class="primary">Vérifier</button>
    </form>
    <div id="verify-result"></div>
  </div>`;

pages.verify.after = (id) => {
  const run = async () => {
    const nft = $("#verify-id").value.trim();
    const out = $("#verify-result");
    out.innerHTML = `<div class="card"><span class="spinner"></span>Lecture du ledger…</div>`;
    try {
      const v = await api("GET", `/tickets/${nft}/verify`);
      const good = v.official && v.owner;
      const icon = !v.official ? "⛔" : v.owner ? "✅" : "⚠️";
      out.innerHTML = `<div class="card verify-result">
        <div class="status-line"><span class="big">${icon}</span><div><h2>${esc(v.status)}</h2>
        <span class="badge ${good ? "ok" : "ko"}">${v.official ? "Émis par le club officiel" : "Émetteur inconnu"}</span></div></div>
        <dl>
          ${v.seat ? `<dt>Place</dt><dd>${esc(v.seat.tribune)} · Bloc ${esc(v.seat.bloc)} · Rang ${esc(v.seat.rang)} · Siège ${esc(v.seat.siege)}</dd><dt>Prix facial</dt><dd>${money(v.seat.prix)}</dd>` : ""}
          <dt>Détenteur actuel</dt><dd>${v.owner ? `${esc(v.ownerName ?? "")} <code>${esc(v.owner)}</code>` : "Aucun (billet utilisé ou annulé)"}</dd>
          <dt>Revente</dt><dd>${v.transferable ? "Libre" : "Uniquement via la bourse officielle du club"}</dd>
          <dt>Émetteur</dt><dd><a class="mono" href="${EXPLORER}/accounts/${esc(v.issuer)}" target="_blank">${esc(v.issuer)} ↗</a></dd>
          <dt>Identifiant</dt><dd class="mono">${esc(v.nftId)}</dd>
        </dl></div>`;
    } catch (err) {
      out.innerHTML = `<div class="card verify-result"><div class="status-line"><span class="big">⛔</span><div><h2>Billet invalide</h2><p class="muted">${esc(err.message)}</p></div></div></div>`;
    }
  };
  $("#verify-form").addEventListener("submit", (e) => (e.preventDefault(), run()));
  if (id) run();
};

// ---------- Routeur ----------

const route = () => (location.hash.replace(/^#\/?/, "").split("/")[0] || "home");

async function render() {
  const name = route();
  const arg = location.hash.split("/")[2];
  const page = pages[name] || pages.home;
  document.querySelectorAll(".topbar nav a").forEach((a) => a.classList.toggle("active", a.dataset.route === name));
  if (name !== "club") clearInterval(state.clubTimer);
  try {
    const html = await page(arg);
    if (route() !== name) return;
    $("#app").innerHTML = html;
    page.after?.(arg);
  } catch (err) {
    $("#app").innerHTML = `<div class="empty">Erreur : ${esc(err.message)}</div>`;
  }
}

window.addEventListener("hashchange", async () => {
  closeModal();
  if (localStorage.getItem("olympass:user") !== (state.me?.id ?? null)) {
    await loadMe();
    renderUserChip();
  }
  render();
});

await detectLocalLogos();
state.config = await api("GET", "/config");
await loadMe();
renderUserChip();
render();
