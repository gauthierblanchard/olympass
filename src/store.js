// Registre off-chain minimal : métadonnées de billets et dernier détenteur connu.
// La source de vérité reste le ledger ; ce fichier sert d'index pour l'interface.
// Aucune donnée personnelle : uniquement des adresses publiques et des infos de place.
import fs from "node:fs";
import path from "node:path";

const FILE = path.resolve("data", "tickets.json");

function read() {
  if (!fs.existsSync(FILE)) return { tickets: {} };
  return JSON.parse(fs.readFileSync(FILE, "utf8"));
}

function write(db) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

export function saveTicket(nftId, data) {
  const db = read();
  db.tickets[nftId] = { ...(db.tickets[nftId] || {}), ...data };
  write(db);
}

export function getTicket(nftId) {
  return read().tickets[nftId] || null;
}

export function allTickets() {
  return read().tickets;
}
