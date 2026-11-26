// API REST Olympass : expose la logique XRPL au front (web/).
// PoC : le serveur détient les seeds de test des supporters pour simplifier la démo.
// En production, chaque supporter signerait dans son propre wallet (Xaman, GemWallet...).
import express from "express";
import QRCode from "qrcode";
import { loadAll } from "../src/wallets.js";
import { explorerTx } from "../src/xrpl-client.js";
import * as T from "../src/tickets.js";

const wallets = loadAll();
const { club } = wallets;
const supporter = (name) => {
  const w = wallets[String(name).toLowerCase()];
  if (!w || w === club) throw Object.assign(new Error(`Supporter inconnu : ${name}`), { status: 400 });
  return w;
};
const supporterAddresses = () => Object.values(wallets).filter((w) => w !== club).map((w) => w.address);

const app = express();
app.use(express.json());
app.use(express.static("web"));

// Enveloppe commune : renvoie { error } en cas d'échec.
const route = (fn) => async (req, res) => {
  try {
    res.json(await fn(req));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message, code: e.result?.code });
  }
};

app.get("/api/config", route(async () => ({
  club: club.address,
  supporters: Object.fromEntries(Object.entries(wallets).filter(([, w]) => w !== club).map(([k, w]) => [k, w.address])),
})));

// Club : émettre un billet
app.post("/api/tickets", route(async (req) => {
  const { nftId, hash } = await T.mintTicket(club, req.body);
  return { nftId, tx: explorerTx(hash) };
}));

// Index off-chain des billets émis
app.get("/api/tickets", route(async () => T.allTickets()));

// Billets détenus par un wallet (lu sur le ledger)
app.get("/api/wallets/:name/tickets", route(async (req) => {
  const address = req.params.name === "club" ? club.address : supporter(req.params.name).address;
  return T.listTickets(address, club.address);
}));

// Supporter : acheter un billet au club
app.post("/api/tickets/:id/buy", route(async (req) => {
  const prix = T.allTickets()[req.params.id]?.prix;
  const r = await T.buyFromClub(club, supporter(req.body.buyer), req.params.id, prix);
  return { offer: explorerTx(r.offerHash), accept: explorerTx(r.acceptHash) };
}));

// Démo fraude : transfert direct entre supporters (refusé par le ledger)
app.post("/api/tickets/:id/transfer", route(async (req) => {
  const to = supporter(req.body.to).address;
  const r = await T.tryDirectTransfer(supporter(req.body.from), req.params.id, req.body.prix ?? 150, to);
  return { accepted: r.ok, code: r.code };
}));

// Bourse officielle : le club rachète au prix facial
app.post("/api/tickets/:id/resale", route(async (req) => {
  const prix = T.allTickets()[req.params.id]?.prix;
  const r = await T.clubBuyBack(club, supporter(req.body.seller), req.params.id, prix);
  return { offer: explorerTx(r.offerHash), accept: explorerTx(r.acceptHash) };
}));

// Vérification publique
app.get("/api/tickets/:id/verify", route(async (req) => T.verifyTicket(req.params.id, club.address, supporterAddresses())));

// QR d'entrée signé par le détenteur (dans une vraie app, signé côté téléphone)
app.post("/api/tickets/:id/qr", route(async (req) => {
  const proof = T.createEntryProof(supporter(req.body.holder), req.params.id);
  return { proof, image: await QRCode.toDataURL(JSON.stringify(proof), { margin: 1, width: 280 }) };
}));

// Portique : vérifie le QR et brûle le billet
app.post("/api/scan", route(async (req) => {
  const r = await T.scanAtGate(club, req.body);
  return r.burnHash ? { ...r, burn: explorerTx(r.burnHash) } : r;
}));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Olympass sur http://localhost:${PORT}`));
