// Profils supporters : chaque inscription crée un wallet Testnet alimenté par le faucet.
// PoC : la seed est conservée côté serveur (data/users.json, ignoré par Git) pour éviter
// d'installer un wallet. En production, le supporter garderait sa clé (Xaman, GemWallet...).
import crypto from "node:crypto";
import xrpl from "xrpl";
import { getClient } from "./xrpl-client.js";
import { allUsers, saveUsers } from "./store.js";
import { DEMO_NAMES } from "./wallets.js";

const COLORS = ["#2aa7df", "#f4a261", "#e76f51", "#2a9d8f", "#9b5de5", "#ef476f", "#118ab2", "#06d6a0"];
const colorFor = (s) => COLORS[[...s].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const publicUser = ({ seed, ...u }) => u;

/** Au premier lancement, importe les supporters de démo définis dans .env. */
export function ensureDemoUsers() {
  const users = allUsers();
  if (users.length) return;
  for (const [role, name] of Object.entries(DEMO_NAMES)) {
    const seed = process.env[`${role}_SEED`];
    if (!seed) continue;
    const w = xrpl.Wallet.fromSeed(seed);
    users.push({ id: role.toLowerCase(), name, address: w.address, seed, color: colorFor(name), createdAt: new Date().toISOString() });
  }
  saveUsers(users);
}

export function listUsers() {
  return allUsers().map(publicUser);
}

export function findUser(id) {
  const u = allUsers().find((x) => x.id === id);
  if (!u) throw Object.assign(new Error("Profil introuvable"), { status: 404 });
  return u;
}

export function walletOf(id) {
  return xrpl.Wallet.fromSeed(findUser(id).seed);
}

export function userByAddress(address) {
  const u = allUsers().find((x) => x.address === address);
  return u ? publicUser(u) : null;
}

export async function createUser(rawName) {
  const name = String(rawName || "").trim();
  if (name.length < 2 || name.length > 24) {
    throw Object.assign(new Error("Le prénom doit faire entre 2 et 24 caractères"), { status: 400 });
  }
  const client = await getClient();
  let funded;
  for (let i = 1; i <= 4 && !funded; i++) {
    try {
      funded = await client.fundWallet();
    } catch {
      await sleep(2500 * i);
    }
  }
  if (!funded) throw new Error("Le faucet Testnet est saturé, réessayez dans un instant");
  const { wallet } = funded;
  const user = {
    id: crypto.randomUUID().slice(0, 8),
    name,
    address: wallet.address,
    seed: wallet.seed,
    color: colorFor(name),
    createdAt: new Date().toISOString(),
  };
  saveUsers([...allUsers(), user]);
  return publicUser(user);
}

export async function balanceOf(address) {
  const client = await getClient();
  try {
    return Number(await client.getXrpBalance(address));
  } catch {
    return 0;
  }
}
