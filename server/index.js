// API REST Olympass : expose la logique XRPL et les profils au front (web/).
import express from "express";
import QRCode from "qrcode";
import { loadWallet } from "../src/wallets.js";
import { explorerTx } from "../src/xrpl-client.js";
import { addEvent, allEvents, getTicket } from "../src/store.js";
import * as U from "../src/users.js";
import * as T from "../src/tickets.js";

const club = loadWallet("CLUB");
U.ensureDemoUsers();

const MATCH = {
  code: "OM-PSG",
  home: "Olympique de Marseille",
  away: "Paris Saint-Germain",
  competition: "Ligue 1 · Journée 16",
  date: "2026-12-13",
  time: "20:45",
  stadium: "Orange Vélodrome",
};

const nameOf = (address) => (address === club.address ? "Club" : U.userByAddress(address)?.name ?? null);
const allAddresses = () => U.listUsers().map((u) => u.address);

const app = express();
app.use(express.json());
app.use(express.static("web"));

const route = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.result?.code });
  }
};

app.get("/api/config", route(async () => ({ club: club.address, match: MATCH })));

// ---------- Profils ----------

app.get("/api/users", route(async () => U.listUsers()));

app.post("/api/users", route(async (req) => {
  const user = await U.createUser(req.body.name);
  addEvent({ type: "signup", text: `${user.name} a créé son compte (wallet ${user.address.slice(0, 8)}…)` });
  return user;
}));

app.get("/api/users/:id", route(async (req) => {
  const u = U.publicUser(U.findUser(req.params.id));
  return { ...u, balance: await U.balanceOf(u.address) };
}));

app.get("/api/users/:id/tickets", route(async (req) => {
  const u = U.findUser(req.params.id);
  return T.listTickets(u.address, club.address);
}));

// ---------- Billetterie ----------

app.get("/api/sale", route(async () => T.listTickets(club.address, club.address)));

app.get("/api/tickets", route(async () =>
  Object.entries(T.allTickets())
    .map(([nftId, t]) => ({ nftId, ...t, ownerName: nameOf(t.owner) }))
    .reverse(),
));

app.post("/api/tickets/batch", route(async (req) => {
  const { count = 1, ...seat } = req.body;
  const n = Math.min(Math.max(Number(count) || 1, 1), 20);
  const results = await T.mintBatch(club, { ...seat, match: MATCH.code, date: MATCH.date, rang: +seat.rang, siege: +seat.siege, prix: +seat.prix }, n);
  const ok = results.filter((r) => r.ok);
  addEvent({ type: "mint", text: `Le club a émis ${ok.length} billet(s) en ${seat.tribune}, bloc ${seat.bloc}`, tx: ok[0] && explorerTx(ok[0].hash) });
  return { minted: ok.length, failed: results.length - ok.length, txs: ok.map((r) => explorerTx(r.hash)) };
}));

app.post("/api/tickets/:id/buy", route(async (req) => {
  const u = U.findUser(req.body.userId);
  const t = getTicket(req.params.id);
  const r = await T.buyFromClub(club, U.walletOf(u.id), req.params.id, t.prix);
  addEvent({ type: "buy", text: `${u.name} a acheté ${t.tribune} ${t.bloc}, siège ${t.siege} (${t.prix} XRP)`, tx: explorerTx(r.acceptHash) });
  return { offer: explorerTx(r.offerHash), accept: explorerTx(r.acceptHash) };
}));

app.post("/api/tickets/:id/transfer", route(async (req) => {
  const from = U.findUser(req.body.userId);
  const to = U.findUser(req.body.toUserId);
  const r = await T.tryDirectTransfer(U.walletOf(from.id), req.params.id, req.body.prix ?? 150, to.address);
  addEvent({
    type: r.ok ? "transfer" : "fraud",
    text: r.ok ? `${from.name} a transféré un billet à ${to.name}` : `Vente directe ${from.name} → ${to.name} bloquée par le ledger`,
    code: r.code,
  });
  return { accepted: r.ok, code: r.code };
}));

app.post("/api/tickets/:id/resale", route(async (req) => {
  const u = U.findUser(req.body.userId);
  const t = getTicket(req.params.id);
  const r = await T.clubBuyBack(club, U.walletOf(u.id), req.params.id, t.prix);
  addEvent({ type: "resale", text: `${u.name} a revendu son billet au club (${t.prix} XRP), remis en vente`, tx: explorerTx(r.acceptHash) });
  return { offer: explorerTx(r.offerHash), accept: explorerTx(r.acceptHash) };
}));

app.get("/api/tickets/:id/verify", route(async (req) => {
  const v = await T.verifyTicket(req.params.id, club.address, allAddresses());
  return { ...v, ownerName: nameOf(v.owner) };
}));

// ---------- Entrée au stade ----------

// QR signé par le wallet du détenteur (dans une vraie app, signé sur le téléphone).
app.post("/api/tickets/:id/qr", route(async (req) => {
  const proof = T.createEntryProof(U.walletOf(req.body.userId), req.params.id);
  return { proof, image: await QRCode.toDataURL(JSON.stringify(proof), { margin: 1, width: 320, color: { dark: "#0b1f3a" } }) };
}));

app.post("/api/scan", route(async (req) => {
  const r = await T.scanAtGate(club, req.body);
  const t = getTicket(req.body.nftId);
  if (r.entry) {
    addEvent({ type: "entry", text: `Entrée validée : ${nameOf(r.holder)}, ${t?.tribune ?? ""} ${t?.bloc ?? ""}`, tx: explorerTx(r.burnHash) });
    return { ...r, holderName: nameOf(r.holder), seat: t, burn: explorerTx(r.burnHash) };
  }
  addEvent({ type: "refused", text: `Entrée refusée : ${r.reason}` });
  return { ...r, seat: t };
}));

// ---------- Tableau de bord du club ----------

app.get("/api/stats", route(async () => {
  const tickets = Object.values(T.allTickets());
  const events = allEvents();
  const count = (f) => tickets.filter(f).length;
  return {
    minted: tickets.length,
    onSale: count((t) => t.owner === club.address),
    sold: count((t) => t.status === "vendu" || t.status === "utilisé"),
    used: count((t) => t.status === "utilisé"),
    resales: events.filter((e) => e.type === "resale").length,
    fraudBlocked: events.filter((e) => e.type === "fraud" || e.type === "refused").length,
    users: U.listUsers().length,
    events: events.slice(-30).reverse(),
  };
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Olympass sur http://localhost:${PORT}`));
