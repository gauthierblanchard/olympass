// Logique métier Olympass : un billet = un NFT XRPL émis par le club.
import xrpl from "xrpl";
import * as keypairs from "ripple-keypairs";
import { getClient, submit } from "./xrpl-client.js";
import { saveTicket, getTicket, allTickets } from "./store.js";

// Drapeaux du billet : brûlable par le club (contrôle d'accès, annulation) et payable en XRP uniquement.
// tfTransferable N'EST PAS activé : le ledger refuse tout transfert qui ne passe pas par le club.
const TICKET_FLAGS = xrpl.NFTokenMintFlags.tfBurnable | xrpl.NFTokenMintFlags.tfOnlyXRP;

// ---------- Métadonnées (stockées dans l'URI du NFT, < 256 octets, sans donnée personnelle) ----------

export function encodeMetadata(m) {
  const compact = { e: m.match, d: m.date, t: m.tribune, b: m.bloc, r: m.rang, s: m.siege, p: m.prix };
  return xrpl.convertStringToHex(JSON.stringify(compact));
}

export function decodeMetadata(uriHex) {
  try {
    const c = JSON.parse(xrpl.convertHexToString(uriHex));
    return { match: c.e, date: c.d, tribune: c.t, bloc: c.b, rang: c.r, siege: c.s, prix: c.p };
  } catch {
    return null;
  }
}

// ---------- Utilitaires ----------

function createdOfferId(meta) {
  if (meta.offer_id) return meta.offer_id;
  const node = meta.AffectedNodes.find((n) => n.CreatedNode?.LedgerEntryType === "NFTokenOffer");
  return node?.CreatedNode.LedgerIndex;
}

function fail(step, r) {
  const err = new Error(`${step} a échoué : ${r.code}${r.message ? ` (${r.message})` : ""}`);
  err.result = r;
  return err;
}

// ---------- 1. Émission par le club ----------

export async function mintTicket(club, seat, matchTaxon = 1) {
  const r = await submit(
    {
      TransactionType: "NFTokenMint",
      Account: club.address,
      NFTokenTaxon: matchTaxon,
      Flags: TICKET_FLAGS,
      URI: encodeMetadata(seat),
    },
    club,
  );
  if (!r.ok) throw fail("NFTokenMint", r);
  const nftId = r.meta.nftoken_id ?? xrpl.getNFTokenID(r.meta);
  saveTicket(nftId, { ...seat, owner: club.address, status: "en vente", mintTx: r.hash });
  return { nftId, hash: r.hash };
}

// ---------- 2. Vente du club à un supporter (échange atomique billet contre XRP) ----------

export async function createSellOffer(seller, nftId, priceXrp, destination) {
  const r = await submit(
    {
      TransactionType: "NFTokenCreateOffer",
      Account: seller.address,
      NFTokenID: nftId,
      Amount: xrpl.xrpToDrops(priceXrp),
      Destination: destination,
      Flags: xrpl.NFTokenCreateOfferFlags.tfSellNFToken,
    },
    seller,
  );
  if (!r.ok) return { ...r, offerId: null };
  return { ...r, offerId: createdOfferId(r.meta) };
}

export async function acceptSellOffer(buyer, offerId) {
  return submit({ TransactionType: "NFTokenAcceptOffer", Account: buyer.address, NFTokenSellOffer: offerId }, buyer);
}

export async function buyFromClub(club, buyer, nftId, priceXrp) {
  const offer = await createSellOffer(club, nftId, priceXrp, buyer.address);
  if (!offer.ok) throw fail("Offre de vente du club", offer);
  const accept = await acceptSellOffer(buyer, offer.offerId);
  if (!accept.ok) throw fail("Achat", accept);
  saveTicket(nftId, { owner: buyer.address, status: "vendu" });
  return { offerHash: offer.hash, acceptHash: accept.hash };
}

// ---------- 3. Tentative de transfert direct entre supporters (doit être refusée) ----------

export async function tryDirectTransfer(seller, nftId, priceXrp, toAddress) {
  // Le ledger répond tefNFTOKEN_IS_NOT_TRANSFERABLE car le NFT n'a pas le drapeau tfTransferable.
  return createSellOffer(seller, nftId, priceXrp, toAddress);
}

// ---------- 4. Revente via la bourse officielle : le club rachète au prix facial maximum ----------

export async function clubBuyBack(club, seller, nftId, priceXrp) {
  const ticket = getTicket(nftId);
  if (ticket?.prix != null && priceXrp > ticket.prix) {
    throw new Error(`Prix de revente ${priceXrp} XRP supérieur au prix facial ${ticket.prix} XRP`);
  }
  const offer = await submit(
    {
      TransactionType: "NFTokenCreateOffer",
      Account: club.address,
      Owner: seller.address,
      NFTokenID: nftId,
      Amount: xrpl.xrpToDrops(priceXrp),
      Flags: 0,
    },
    club,
  );
  if (!offer.ok) throw fail("Offre de rachat du club", offer);
  const offerId = createdOfferId(offer.meta);
  const accept = await submit(
    { TransactionType: "NFTokenAcceptOffer", Account: seller.address, NFTokenBuyOffer: offerId },
    seller,
  );
  if (!accept.ok) throw fail("Acceptation du rachat", accept);
  saveTicket(nftId, { owner: club.address, status: "en revente" });
  return { offerHash: offer.hash, acceptHash: accept.hash };
}

// ---------- 5. Consultation et vérification publique ----------

export async function listTickets(address, issuer) {
  const c = await getClient();
  const res = await c.request({ command: "account_nfts", account: address, ledger_index: "validated" });
  return res.result.account_nfts
    .filter((n) => !issuer || n.Issuer === issuer)
    .map((n) => ({ nftId: n.NFTokenID, issuer: n.Issuer, taxon: n.NFTokenTaxon, seat: decodeMetadata(n.URI) }));
}

async function holds(address, nftId) {
  const tickets = await listTickets(address);
  return tickets.some((t) => t.nftId === nftId);
}

/**
 * Vérifie un billet à partir de son seul identifiant.
 * L'émetteur et les drapeaux sont encodés dans l'ID ; le détenteur est confirmé sur le ledger.
 */
export async function verifyTicket(nftId, officialIssuer, candidateOwners = []) {
  const parsed = xrpl.parseNFTokenID(nftId);
  const official = parsed.Issuer === officialIssuer;
  const transferable = (parsed.Flags & xrpl.NFTokenMintFlags.tfTransferable) !== 0;

  const known = getTicket(nftId);
  const candidates = [...new Set([known?.owner, ...candidateOwners, officialIssuer].filter(Boolean))];
  let owner = null;
  for (const a of candidates) {
    if (await holds(a, nftId)) {
      owner = a;
      break;
    }
  }
  let status;
  if (!official) status = "FAUX : émetteur non officiel";
  else if (owner) status = owner === officialIssuer ? "Valide, en vente au club" : "Valide";
  else if (known?.status === "utilisé") status = "Déjà utilisé (brûlé à l'entrée)";
  else status = "Introuvable chez les détenteurs connus";

  return { nftId, issuer: parsed.Issuer, official, transferable, owner, status, seat: known };
}

// ---------- 6. Contrôle d'accès : QR signé par le détenteur, puis burn par le club ----------

const proofMessage = (nftId, ts) => xrpl.convertStringToHex(`OLYMPASS-ENTREE:${nftId}:${ts}`);

/** Généré par l'application du supporter et affiché en QR code. */
export function createEntryProof(holder, nftId) {
  const ts = Math.floor(Date.now() / 1000);
  const signature = keypairs.sign(proofMessage(nftId, ts), holder.privateKey);
  return { nftId, ts, publicKey: holder.publicKey, signature };
}

/** Exécuté au portique : signature valide, récente, et le signataire détient bien le billet. */
export async function checkEntryProof(proof, officialIssuer, maxAgeSec = 60) {
  const age = Math.floor(Date.now() / 1000) - proof.ts;
  if (age > maxAgeSec) return { ok: false, reason: "QR expiré (capture d'écran ?)" };
  const okSig = keypairs.verify(proofMessage(proof.nftId, proof.ts), proof.signature, proof.publicKey);
  if (!okSig) return { ok: false, reason: "Signature invalide" };
  const holder = keypairs.deriveAddress(proof.publicKey);
  if (xrpl.parseNFTokenID(proof.nftId).Issuer !== officialIssuer) return { ok: false, reason: "Billet non officiel" };
  if (!(await holds(holder, proof.nftId))) return { ok: false, reason: "Billet absent du wallet (déjà utilisé ou revendu)" };
  return { ok: true, holder };
}

export async function burnAtEntry(club, nftId, ownerAddress) {
  const r = await submit(
    { TransactionType: "NFTokenBurn", Account: club.address, NFTokenID: nftId, Owner: ownerAddress },
    club,
  );
  if (!r.ok) throw fail("NFTokenBurn", r);
  saveTicket(nftId, { owner: null, status: "utilisé", burnTx: r.hash });
  return { hash: r.hash };
}

export async function scanAtGate(club, proof) {
  const check = await checkEntryProof(proof, club.address);
  if (!check.ok) return { entry: false, reason: check.reason };
  const { hash } = await burnAtEntry(club, proof.nftId, check.holder);
  return { entry: true, holder: check.holder, burnHash: hash };
}

export { allTickets };
