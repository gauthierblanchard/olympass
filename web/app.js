// Interface Olympass : quatre vues branchées sur l'API Express (server/index.js).
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
const EXPLORER = "https://testnet.xrpl.org";

let config = { club: "", supporters: {} };
let current = "alice";

// ---------- API ----------

async function api(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.code ? `${data.error}` : data.error);
  return data;
}

function nameOf(address) {
  if (!address) return "—";
  if (address === config.club) return "Club";
  const n = Object.entries(config.supporters).find(([, a]) => a === address)?.[0];
  return n ? n[0].toUpperCase() + n.slice(1) : short(address);
}

const seatLabel = (s) => (s ? `${esc(s.tribune)} · bloc ${esc(s.bloc)} · rang ${esc(s.rang)} · siège ${esc(s.siege)}` : "Place inconnue");

// ---------- Journal ----------

function log(text, status = "pending", links = {}) {
  const li = document.createElement("li");
  li.className = status;
  li.innerHTML = `<time>${new Date().toLocaleTimeString("fr-FR")}</time>${esc(text)}<div>${Object.entries(links)
    .map(([label, url]) => `<a href="${esc(url)}" target="_blank">${esc(label)} ↗</a>`)
    .join("")}</div>`;
  $("#log").appendChild(li);
  return {
    done(t, s = "ok", l = {}) {
      li.remove();
      log(t, s, l);
    },
  };
}

/** Lance une action longue : bouton désactivé, ligne de journal en attente, puis résultat. */
async function run(button, pendingText, fn) {
  if (button) button.disabled = true;
  const entry = log(`${pendingText}…`);
  try {
    const out = await fn();
    entry.done(out.text, out.status ?? "ok", out.links ?? {});
  } catch (e) {
    entry.done(`${pendingText} : échec (${e.message})`, "ko");
  } finally {
    if (button) button.disabled = false;
    refresh();
  }
}

// ---------- Navigation ----------

document.querySelectorAll("#tabs button").forEach((b) =>
  b.addEventListener("click", () => {
    document.querySelectorAll("#tabs button").forEach((x) => x.classList.toggle("active", x === b));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${b.dataset.view}`));
    refresh();
  }),
);

// ---------- Club ----------

$("#mint-form").addEventListener("submit", (ev) => {
  ev.preventDefault();
  const f = Object.fromEntries(new FormData(ev.target));
  const seat = { ...f, rang: +f.rang, siege: +f.siege, prix: +f.prix };
  run(ev.submitter, `Émission ${seat.match} ${seat.tribune} ${seat.bloc}`, async () => {
    const r = await api("POST", "/tickets", seat);
    ev.target.siege.value = seat.siege + 1;
    return { text: `Billet émis : ${seat.match}, ${seat.tribune} ${seat.bloc} siège ${seat.siege}`, links: { NFTokenMint: r.tx } };
  });
});

async function renderClub() {
  const tickets = Object.entries(await api("GET", "/tickets")).reverse();
  $("#club-tickets").innerHTML = tickets.length
    ? tickets
        .map(([id, t]) => {
          const badge = t.status === "utilisé" ? "ko" : t.owner === config.club ? "" : "ok";
          return `<tr><td>${esc(t.match)} · ${seatLabel(t)}</td><td>${esc(t.prix)} XRP</td><td>${esc(nameOf(t.owner))}</td>
            <td><span class="badge ${badge}">${esc(t.status)}</span></td>
            <td><button data-copy="${esc(id)}" title="${esc(id)}">Copier l'ID</button></td></tr>`;
        })
        .join("")
    : `<tr><td colspan="5" class="empty">Aucun billet émis pour l'instant.</td></tr>`;
}

document.addEventListener("click", (ev) => {
  const id = ev.target.dataset?.copy;
  if (!id) return;
  navigator.clipboard?.writeText(id);
  $("#verify-id").value = id;
  ev.target.textContent = "Copié";
});

// ---------- Supporter ----------

function ticketCard(t, actions) {
  const s = t.seat || {};
  return `<div class="ticket">
    <div class="match">${esc(s.match ?? "Billet")} <small>${esc(s.date ?? "")}</small></div>
    <div class="seat">${seatLabel(s)}</div>
    <div class="price">${esc(s.prix)} XRP</div>
    <div class="actions">${actions}</div>
  </div>`;
}

async function renderSupporter() {
  const address = config.supporters[current];
  $("#who-address").textContent = address;
  $("#who-link").href = `${EXPLORER}/accounts/${address}`;

  const [onSale, mine] = await Promise.all([api("GET", "/wallets/club/tickets"), api("GET", `/wallets/${current}/tickets`)]);

  $("#on-sale").innerHTML = onSale.length
    ? onSale.map((t) => ticketCard(t, `<button class="primary" data-buy="${t.nftId}">Acheter ${esc(t.seat?.prix)} XRP</button>`)).join("")
    : `<p class="empty">Aucun billet en vente.</p>`;

  const others = Object.keys(config.supporters).filter((n) => n !== current);
  $("#my-tickets").innerHTML = mine.length
    ? mine
        .map((t) =>
          ticketCard(
            t,
            `<button class="primary" data-qr="${t.nftId}">QR d'entrée</button>
             <button data-resale="${t.nftId}">Revendre au club</button>
             ${others.map((o) => `<button class="danger" data-transfer="${t.nftId}" data-to="${o}">Vendre à ${nameOf(config.supporters[o])}</button>`).join("")}`,
          ),
        )
        .join("")
    : `<p class="empty">Vous n'avez aucun billet.</p>`;
}

$("#who").addEventListener("change", (ev) => {
  current = ev.target.value;
  renderSupporter();
});

document.addEventListener("click", (ev) => {
  const b = ev.target.closest("button");
  if (!b) return;
  const who = nameOf(config.supporters[current]);

  if (b.dataset.buy) {
    run(b, `${who} achète un billet au club`, async () => {
      const r = await api("POST", `/tickets/${b.dataset.buy}/buy`, { buyer: current });
      return { text: `${who} a acheté le billet : paiement et billet échangés atomiquement`, links: { "Offre du club": r.offer, Acceptation: r.accept } };
    });
  }

  if (b.dataset.resale) {
    run(b, `${who} revend son billet via la bourse officielle`, async () => {
      const r = await api("POST", `/tickets/${b.dataset.resale}/resale`, { seller: current });
      return { text: `Le club a racheté le billet de ${who} au prix facial, il est remis en vente`, links: { "Offre de rachat": r.offer, Acceptation: r.accept } };
    });
  }

  if (b.dataset.transfer) {
    const to = b.dataset.to;
    run(b, `${who} tente de vendre son billet directement à ${nameOf(config.supporters[to])}`, async () => {
      const r = await api("POST", `/tickets/${b.dataset.transfer}/transfer`, { from: current, to });
      return r.accepted
        ? { text: "Transfert direct accepté (anormal)", status: "ko" }
        : { text: `Fraude bloquée par le ledger : ${r.code}`, status: "ko" };
    });
  }

  if (b.dataset.qr) showQr(b, b.dataset.qr);
});

// ---------- QR ----------

let qrTimer = null;

async function showQr(button, nftId) {
  button.disabled = true;
  try {
    const { proof, image } = await api("POST", `/tickets/${nftId}/qr`, { holder: current });
    localStorage.setItem("olympass:lastQR", JSON.stringify(proof));
    $("#qr-img").src = image;
    $("#modal").classList.remove("hidden");
    clearInterval(qrTimer);
    const tick = () => {
      const left = 60 - Math.floor(Date.now() / 1000 - proof.ts);
      $("#qr-timer").textContent = left > 0 ? `Valable encore ${left} s` : "QR expiré, générez-en un nouveau";
      if (left <= 0) clearInterval(qrTimer);
    };
    tick();
    qrTimer = setInterval(tick, 1000);
    log(`${nameOf(config.supporters[current])} présente son QR d'entrée signé`, "ok");
  } catch (e) {
    log(`QR : échec (${e.message})`, "ko");
  } finally {
    button.disabled = false;
  }
}

$("#modal-close").addEventListener("click", () => {
  $("#modal").classList.add("hidden");
  clearInterval(qrTimer);
});

// ---------- Portique ----------

function gate(proof, button) {
  const box = $("#gate-result");
  box.className = "gate-result";
  run(button, "Portique : vérification du QR", async () => {
    const r = await api("POST", "/scan", proof);
    if (r.entry) {
      box.className = "gate-result ok";
      box.innerHTML = `ENTRÉE VALIDÉE<small>Billet de ${esc(nameOf(r.holder))} brûlé sur le ledger</small>`;
      return { text: `Entrée validée pour ${nameOf(r.holder)}, billet brûlé`, links: { NFTokenBurn: r.burn } };
    }
    box.className = "gate-result ko";
    box.innerHTML = `ENTRÉE REFUSÉE<small>${esc(r.reason)}</small>`;
    return { text: `Entrée refusée : ${r.reason}`, status: "ko" };
  });
}

$("#scan-last").addEventListener("click", (ev) => {
  const raw = localStorage.getItem("olympass:lastQR");
  if (!raw) return log("Aucun QR présenté : générez-en un dans l'espace supporter", "ko");
  gate(JSON.parse(raw), ev.currentTarget);
});

$("#scan-paste").addEventListener("click", (ev) => {
  try {
    gate(JSON.parse($("#qr-input").value), ev.currentTarget);
  } catch {
    log("Contenu de QR illisible", "ko");
  }
});

// ---------- Vérification ----------

$("#verify-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const id = $("#verify-id").value.trim();
  const out = $("#verify-result");
  out.innerHTML = `<div class="card">Lecture du ledger…</div>`;
  try {
    const v = await api("GET", `/tickets/${id}/verify`);
    const ok = v.official && v.owner;
    out.innerHTML = `<div class="card verify-card">
      <h2><span class="badge ${ok ? "ok" : "ko"}">${esc(v.status)}</span></h2>
      <dl>
        <dt>Place</dt><dd>${v.seat ? `${esc(v.seat.match)} · ${seatLabel(v.seat)}` : "—"}</dd>
        <dt>Émetteur</dt><dd><a href="${EXPLORER}/accounts/${esc(v.issuer)}" target="_blank"><code>${esc(v.issuer)}</code></a> ${v.official ? "(club officiel)" : "(NON OFFICIEL)"}</dd>
        <dt>Détenteur actuel</dt><dd>${v.owner ? `${esc(nameOf(v.owner))} <code>${esc(v.owner)}</code>` : "—"}</dd>
        <dt>Transférable</dt><dd>${v.transferable ? "Oui" : "Non : revente uniquement via le club"}</dd>
        <dt>Identifiant</dt><dd><code>${esc(v.nftId)}</code></dd>
      </dl>
    </div>`;
  } catch (e) {
    out.innerHTML = `<div class="card"><span class="badge ko">Billet invalide</span> ${esc(e.message)}</div>`;
  }
});

// ---------- Démarrage ----------

async function refresh() {
  const active = document.querySelector(".view.active").id;
  try {
    if (active === "view-club") await renderClub();
    if (active === "view-supporter") await renderSupporter();
  } catch (e) {
    log(`Rafraîchissement : ${e.message}`, "ko");
  }
}

config = await api("GET", "/config");
$("#club-address").textContent = config.club;
$("#club-link").href = `${EXPLORER}/accounts/${config.club}`;
$("#who").innerHTML = Object.keys(config.supporters)
  .map((n) => `<option value="${n}">${n[0].toUpperCase() + n.slice(1)}</option>`)
  .join("");
refresh();
