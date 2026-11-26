# Olympass

Billetterie de match anti-fraude sur le **XRP Ledger** : chaque billet est un NFT émis par le club, impossible à dupliquer, revendable uniquement via la bourse officielle, et brûlé à l'entrée du stade.

Cas d'usage fictif : un match OM–PSG au Stade Vélodrome. Projet réalisé pour le Blockchain Challenge XRPL (Bac+5), sans lien avec le club.

**Équipe :** Gauthier Blanchard (chef de projet), Paul Clark (back-end XRPL), Marceau Michaud (front-end), Antoine Brosseau (architecture et sécurité).

## Réseau

- **XRPL Testnet** natif, sans smart contract ni EVM Sidechain.
- Serveur principal `wss://s.altnet.rippletest.net:51233`, avec bascule automatique sur `wss://testnet.xrpl-labs.com` et `wss://testnet.honeycluster.io` (port 443) si le port 51233 est bloqué.
- Explorateur : https://testnet.xrpl.org

## Briques XRPL utilisées

| Étape | Transaction | Détail |
| --- | --- | --- |
| Émission | `NFTokenMint` | `tfBurnable` + `tfOnlyXRP`, **sans** `tfTransferable` ; place encodée dans l'`URI` |
| Achat au club | `NFTokenCreateOffer` + `NFTokenAcceptOffer` | Offre de vente avec `Destination` = acheteur ; billet et XRP échangés atomiquement |
| Fraude | `NFTokenCreateOffer` entre supporters | Rejetée par le ledger : `tefNFTOKEN_IS_NOT_TRANSFERABLE` |
| Revente officielle | `NFTokenCreateOffer` (offre d'achat du club) | Le club rachète au prix facial maximum, puis remet en vente |
| Contrôle d'accès | `NFTokenBurn` | Le club brûle le billet après vérification du QR signé |

## Installation

Prérequis : Node.js LTS (testé avec Node 24) et npm.

```bash
npm install
npm run setup        # crée 4 wallets de test (club, alice, bob, charlie) et écrit .env
```

Le Testnet est réinitialisé de temps en temps. Si les comptes ont disparu, recréez-les :

```bash
npm run setup -- --reset
```

## Lancement

**Scénario de démo complet en ligne de commande** (plan B, sans interface) :

```bash
npm run demo
```

Il affiche chaque étape avec le lien de la transaction sur l'explorateur :

1. Le club émet un billet OM–PSG.
2. Alice l'achète 25 XRP au club.
3. Alice tente de le vendre 150 XRP directement à Bob : **refusé par le ledger**.
4. Le club rachète le billet d'Alice au prix facial.
5. Bob achète le billet remis en vente.
6. Vérification publique : émetteur officiel, détenteur, statut.
7. Bob présente son QR signé au portique : entrée validée, billet brûlé.
8. Second passage avec le même QR : **refusé**.

**API + interface web :**

```bash
npm start            # http://localhost:3000
```

| Méthode | Route | Rôle |
| --- | --- | --- |
| GET | `/api/config` | Adresses du club et des supporters |
| POST | `/api/tickets` | Club : émettre un billet `{match, date, tribune, bloc, rang, siege, prix}` |
| GET | `/api/tickets` | Index des billets émis |
| GET | `/api/wallets/:name/tickets` | Billets détenus par `club`, `alice`, `bob` ou `charlie` (lu sur le ledger) |
| POST | `/api/tickets/:id/buy` | Acheter au club `{buyer}` |
| POST | `/api/tickets/:id/transfer` | Démo fraude : transfert direct `{from, to}` |
| POST | `/api/tickets/:id/resale` | Revendre via la bourse officielle `{seller}` |
| GET | `/api/tickets/:id/verify` | Vérification publique d'un billet |
| POST | `/api/tickets/:id/qr` | Générer le QR d'entrée signé `{holder}` |
| POST | `/api/scan` | Portique : vérifier le QR et brûler le billet |

## Architecture

```
olympass/
├── src/
│   ├── xrpl-client.js   connexion avec serveurs de secours, soumission fiable
│   ├── tickets.js       logique métier : mint, achat, revente, vérification, QR, burn
│   ├── wallets.js       chargement des wallets depuis .env
│   └── store.js         index off-chain (data/tickets.json)
├── scripts/
│   ├── setup-wallets.js création des comptes via le faucet
│   └── demo.js          scénario complet
├── server/index.js      API Express
└── web/                 interface (en cours)
```

**Séparation on-chain / off-chain**

- **On-chain :** propriété du billet, échanges et paiements, burn, adresse de l'émetteur officiel. C'est la source de vérité.
- **Off-chain :** un index des billets (`data/tickets.json`) pour l'interface, et les seeds dans `.env`.
- **Aucune donnée personnelle on-chain :** l'URI du NFT ne contient que le match et la place.

**QR d'entrée :** le supporter signe `OLYMPASS-ENTREE:<NFTokenID>:<horodatage>` avec la clé de son wallet. Le portique vérifie la signature, refuse un QR de plus de 60 secondes (capture d'écran revendue), vérifie sur le ledger que le signataire détient le billet, puis le club exécute `NFTokenBurn`.

## Sécurité

- Comptes **Testnet uniquement**. Aucune seed Mainnet.
- Les seeds sont dans `.env`, exclu de Git par `.gitignore`. Voir `.env.example`.
- Pour simplifier la démo, le serveur détient les seeds de test des supporters. En production, chaque supporter signerait dans son propre wallet (Xaman, GemWallet), et seule la clé du club resterait côté serveur.

## Adresses de test

Elles changent à chaque `npm run setup -- --reset`. Elles sont affichées par `npm run setup` et par `GET /api/config`.

| Rôle | Adresse |
| --- | --- |
| Club (émetteur) | `rDNZr99eLUJMLPrGfhjypPPyz4gpGCbvCC` |
| Alice | `rMVzD2i59QivJZCm8H1zig2zS6AUrmQMA2` |
| Bob | `rshPTfz6jNNFQdvVapfQEZkrTLJW81Nue8` |
| Charlie | `rpeZ8g8UMG5AUJyBxdkXCL3Q5wNCNXtTfz` |
