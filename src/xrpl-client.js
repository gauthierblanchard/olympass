// Connexion au XRPL Testnet avec serveurs de secours, et soumission fiable des transactions.
import xrpl from "xrpl";

// Le Wi-Fi de l'école peut bloquer le port 51233 : on bascule sur les serveurs en port 443.
const SERVEURS = [
  process.env.XRPL_SERVER,
  "wss://s.altnet.rippletest.net:51233",
  "wss://testnet.xrpl-labs.com",
  "wss://testnet.honeycluster.io",
].filter(Boolean);

let client = null;

export async function getClient() {
  if (client?.isConnected()) return client;
  for (const url of SERVEURS) {
    try {
      const c = new xrpl.Client(url, { connectionTimeout: 8000 });
      await c.connect();
      console.log(`[xrpl] connecté à ${url}`);
      client = c;
      return client;
    } catch {
      console.log(`[xrpl] échec sur ${url}, serveur suivant`);
    }
  }
  throw new Error("Aucun serveur Testnet joignable");
}

export async function disconnect() {
  if (client?.isConnected()) await client.disconnect();
  client = null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Signe, soumet et attend la validation d'une transaction.
 * Contrairement à submitAndWait, un rejet immédiat (tef, tem, tel) est renvoyé tout de suite
 * au lieu d'attendre l'expiration de LastLedgerSequence : utile pour la démo de fraude.
 * Renvoie { ok, code, hash, meta }.
 */
export async function submit(tx, wallet) {
  const c = await getClient();
  const prepared = await c.autofill(tx);
  const signed = wallet.sign(prepared);
  const res = await c.request({ command: "submit", tx_blob: signed.tx_blob });
  const prelim = res.result.engine_result;

  if (/^(tef|tem|tel)/.test(prelim)) {
    return { ok: false, code: prelim, hash: signed.hash, message: res.result.engine_result_message };
  }

  // tes, tec ou ter : on attend que la transaction soit dans un ledger validé.
  for (;;) {
    await sleep(1000);
    try {
      const tx = await c.request({ command: "tx", transaction: signed.hash });
      if (tx.result.validated) {
        const meta = tx.result.meta;
        const code = meta.TransactionResult;
        return { ok: code === "tesSUCCESS", code, hash: signed.hash, meta };
      }
    } catch (e) {
      if (e?.data?.error !== "txnNotFound") throw e;
    }
    const current = await c.getLedgerIndex();
    if (current > prepared.LastLedgerSequence) {
      return { ok: false, code: prelim, hash: signed.hash, message: "Transaction expirée" };
    }
  }
}

export const explorerTx = (hash) => `https://testnet.xrpl.org/transactions/${hash}`;
export const explorerAccount = (address) => `https://testnet.xrpl.org/accounts/${address}`;
