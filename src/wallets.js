// Chargement des wallets de test depuis le fichier .env (jamais versionné).
import "dotenv/config";
import xrpl from "xrpl";

export const ROLES = ["CLUB", "ALICE", "BOB", "CHARLIE"];

export function loadWallet(role) {
  const seed = process.env[`${role}_SEED`];
  if (!seed) throw new Error(`${role}_SEED manquant dans .env : lancez "npm run setup"`);
  return xrpl.Wallet.fromSeed(seed);
}

export function loadAll() {
  return Object.fromEntries(ROLES.map((r) => [r.toLowerCase(), loadWallet(r)]));
}
