// Scénario de démonstration complet en ligne de commande (plan B si le front ou le Wi-Fi lâche).
// Lancer avec : npm run demo
import { loadAll } from "../src/wallets.js";
import { disconnect, explorerTx, explorerAccount } from "../src/xrpl-client.js";
import * as T from "../src/tickets.js";

const { club, alice, bob } = loadAll();
const PRIX = 25; // prix facial en XRP de test
const step = (n, s) => console.log(`\n=== ${n}. ${s}`);
const link = (label, hash) => console.log(`   ${label.padEnd(22)} ${explorerTx(hash)}`);

console.log(`Club (émetteur officiel) : ${explorerAccount(club.address)}`);

step(1, "Le club émet un billet OM–PSG");
const seat = { match: "OM-PSG", date: "2026-12-13", tribune: "Ganay", bloc: "G12", rang: 8, siege: 14, prix: PRIX };
const { nftId, hash: mintHash } = await T.mintTicket(club, seat);
console.log(`   NFTokenID : ${nftId}`);
link("NFTokenMint", mintHash);

step(2, `Alice achète le billet au club (${PRIX} XRP, échange atomique)`);
const buy = await T.buyFromClub(club, alice, nftId, PRIX);
link("Offre de vente du club", buy.offerHash);
link("Acceptation par Alice", buy.acceptHash);

step(3, "Fraude : Alice tente de vendre directement à Bob à 150 XRP");
const fraud = await T.tryDirectTransfer(alice, nftId, 150, bob.address);
console.log(fraud.ok ? "   !!! Transfert accepté (anormal)" : `   Refusé par le ledger : ${fraud.code}`);

step(4, `Revente officielle : le club rachète le billet d'Alice au prix facial (${PRIX} XRP)`);
const back = await T.clubBuyBack(club, alice, nftId, PRIX);
link("Offre de rachat du club", back.offerHash);
link("Acceptation par Alice", back.acceptHash);

step(5, "Bob achète le billet remis en vente par le club");
const buy2 = await T.buyFromClub(club, bob, nftId, PRIX);
link("Acceptation par Bob", buy2.acceptHash);

step(6, "Vérification publique du billet");
const v = await T.verifyTicket(nftId, club.address, [alice.address, bob.address]);
console.log(`   Émetteur officiel : ${v.official}  |  Transférable : ${v.transferable}`);
console.log(`   Détenteur : ${v.owner}  |  Statut : ${v.status}`);

step(7, "Entrée au stade : Bob présente son QR signé");
const proof = T.createEntryProof(bob, nftId);
const gate = await T.scanAtGate(club, proof);
console.log(gate.entry ? "   ENTRÉE VALIDÉE, billet brûlé" : `   REFUSÉ : ${gate.reason}`);
if (gate.burnHash) link("NFTokenBurn", gate.burnHash);

step(8, "Second passage avec le même QR (capture d'écran revendue)");
const again = await T.scanAtGate(club, proof);
console.log(again.entry ? "   !!! Entrée acceptée (anormal)" : `   REFUSÉ : ${again.reason}`);

await disconnect();
