// Registre off-chain minimal : index des billets, journal d'activité et profils.
// La source de vérité reste le ledger ; ces fichiers servent d'index pour l'interface.
// Aucune donnée personnelle on-chain : le ledger ne voit que des adresses publiques.
import fs from "node:fs";
import path from "node:path";

const DIR = path.resolve("data");

function read(name, fallback) {
  const file = path.join(DIR, `${name}.json`);
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function write(name, value) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(path.join(DIR, `${name}.json`), JSON.stringify(value, null, 2));
}

// ---------- Billets ----------

export function saveTicket(nftId, data) {
  const db = read("tickets", { tickets: {} });
  db.tickets[nftId] = { ...(db.tickets[nftId] || {}), ...data, updatedAt: new Date().toISOString() };
  write("tickets", db);
}

export function getTicket(nftId) {
  return read("tickets", { tickets: {} }).tickets[nftId] || null;
}

export function allTickets() {
  return read("tickets", { tickets: {} }).tickets;
}

// ---------- Journal d'activité ----------

export function addEvent(event) {
  const events = read("events", []);
  events.push({ at: new Date().toISOString(), ...event });
  write("events", events.slice(-500));
}

export function allEvents() {
  return read("events", []);
}

// ---------- Profils (PoC : wallet conservé côté serveur, voir README) ----------

export function allUsers() {
  return read("users", []);
}

export function saveUsers(users) {
  write("users", users);
}
