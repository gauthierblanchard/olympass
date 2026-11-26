// Crée et alimente les wallets de test (club, Alice, Bob, Charlie) via le faucet Testnet.
// Les seeds sont écrites dans .env (ignoré par Git). Relancer avec --reset après une remise à zéro du Testnet.
import "dotenv/config";
import fs from "node:fs";
import { getClient, disconnect, explorerAccount } from "../src/xrpl-client.js";
import { ROLES } from "../src/wallets.js";

const reset = process.argv.includes("--reset");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fundWithRetry(client, tries = 5) {
  for (let i = 1; i <= tries; i++) {
    try {
      return await client.fundWallet();
    } catch (e) {
      console.log(`  faucet saturé (essai ${i}/${tries}), nouvelle tentative...`);
      await sleep(3000 * i);
    }
  }
  throw new Error("Le faucet ne répond pas, réessayez dans une minute");
}

const client = await getClient();
const env = fs.existsSync(".env") ? fs.readFileSync(".env", "utf8") : "";
const isRoleLine = (l) => ROLES.some((r) => l.startsWith(`${r}_`));
const out = env.split(/\r?\n/).filter((l) => l && !(reset && isRoleLine(l)));

for (const role of ROLES) {
  if (!reset && process.env[`${role}_SEED`]) {
    console.log(`${role.padEnd(8)} déjà présent dans .env`);
    continue;
  }
  const { wallet, balance } = await fundWithRetry(client);
  out.push(`${role}_ADDRESS=${wallet.address}`, `${role}_SEED=${wallet.seed}`);
  console.log(`${role.padEnd(8)} ${wallet.address}  ${balance} XRP  ${explorerAccount(wallet.address)}`);
}

fs.writeFileSync(".env", out.join("\n") + "\n");
console.log("\nSeeds enregistrées dans .env (ne jamais le committer).");
await disconnect();
