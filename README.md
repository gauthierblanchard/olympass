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
npm run setup        # crée le wallet du club et 3 supporters de démo (Nassim, Inès, Enzo) dans .env
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
2. Nassim l'achète 25 XRP au club.
3. Nassim tente de le vendre 150 XRP directement à Inès : **refusé par le ledger**.
4. Le club rachète le billet de Nassim au prix facial.
5. Inès achète le billet remis en vente.
6. Vérification publique : émetteur officiel, détenteur, statut.
7. Inès présente son QR signé au portique : entrée validée, billet brûlé.
8. Second passage avec le même QR : **refusé**.

**Interface web :**

```bash
npm start            # http://localhost:3000
```

| Page | Usage |
| --- | --- |
| Accueil | Présentation du concept et accès aux espaces |
| Connexion | Choisir un profil existant ou **créer un compte** : un wallet Testnet est généré et crédité de 100 XRP par le faucet |
| Billetterie | **Stade 3D navigable** : tourner, zoomer, voler vers une tribune, cliquer sur un siège, voir le terrain depuis la place, acheter. Vue « Plan et liste » en alternative |
| Mes billets | Sous-onglets **Disponibles** et **Utilisés** : un billet brûlé au portique reste visible avec la preuve de la transaction NFTokenBurn |
| Mes billets | Billet officiel, QR d'entrée signé (60 s), vue 3D, revente au club, vente directe à un ami (bloquée par le ledger) |
| Club | Indicateurs (émis, vendus, reventes, entrées, fraudes bloquées), émission groupée de places, activité en direct |
| Portique | Scan du QR présenté : entrée validée et billet brûlé, ou entrée refusée |
| Vérifier | Contrôle public d'un billet à partir de son identifiant |

Chaque montant en XRP est accompagné d'un équivalent en euros au **taux fictif de démo de 1 XRP = 2,50 €** (variable `EUR_PER_XRP`). Le XRP du Testnet n'a aucune valeur : ce taux sert seulement à rendre les prix lisibles (une place à 25-40 XRP correspond à 62-100 €).

Le stade 3D (`web/stadium3d.js`, three.js servi en local) est une **modélisation originale** inspirée de l'Orange Vélodrome : quatre tribunes en gradins, environ 14 000 sièges, toit ondulé, panneaux LED. Aucun modèle 3D libre du stade n'existant, toute la géométrie est générée par le code. Chaque billet en vente est placé sur un siège selon sa tribune, son bloc, son rang et son numéro ; la position est indicative. Si le navigateur ne gère pas WebGL, l'application revient au plan 2D (`web/seatview.js`).

**API REST** utilisée par l'interface :

| Méthode | Route | Rôle |
| --- | --- | --- |
| GET | `/api/config` | Adresse du club et informations du match |
| GET / POST | `/api/users` | Lister les profils / créer un compte `{name}` |
| GET | `/api/users/:id` | Profil et solde XRP |
| GET | `/api/users/:id/tickets` | Billets détenus (lus sur le ledger) |
| GET | `/api/sale` | Billets en vente au club (lus sur le ledger) |
| GET | `/api/tickets` | Index des billets émis |
| POST | `/api/tickets/batch` | Club : émettre jusqu'à 20 places `{tribune, bloc, rang, siege, count, prix}` |
| POST | `/api/tickets/:id/buy` | Acheter au club `{userId}` |
| POST | `/api/tickets/:id/transfer` | Vente directe à un autre supporter `{userId, toUserId}` (refusée) |
| POST | `/api/tickets/:id/resale` | Revendre via la bourse officielle `{userId}` |
| GET | `/api/tickets/:id/verify` | Vérification publique d'un billet |
| POST | `/api/tickets/:id/qr` | QR d'entrée signé `{userId}` (preuve + image) |
| POST | `/api/scan` | Portique : vérifier le QR et brûler le billet |
| GET | `/api/stats` | Indicateurs et journal d'activité du club |

**Vidéo du parcours utilisateur** (serveur lancé, Chrome installé) :

```bash
npm run video        # enregistre video/olympass-parcours.webm (environ 4 min, transactions réelles sur le Testnet)
```

## Architecture

```
olympass/
├── src/
│   ├── xrpl-client.js   connexion avec serveurs de secours, soumission fiable
│   ├── tickets.js       logique métier : mint, achat, revente, vérification, QR, burn
│   ├── users.js         profils supporters et création de wallet
│   ├── wallets.js       chargement des wallets depuis .env
│   └── store.js         index off-chain (data/*.json)
├── scripts/
│   ├── setup-wallets.js création des comptes via le faucet
│   └── demo.js          scénario complet
├── server/index.js      API Express
└── web/                 interface : index.html, app.js, seatview.js (vue 3D), style.css
```

**Séparation on-chain / off-chain**

- **On-chain :** propriété du billet, échanges et paiements, burn, adresse de l'émetteur officiel. C'est la source de vérité.
- **Off-chain :** index des billets, journal d'activité et profils (`data/`, ignoré par Git), seeds du club et des supporters de démo dans `.env`.
- **Émission groupée :** les mints du club sont soumis avec des numéros de séquence consécutifs puis validés en parallèle.
- **Aucune donnée personnelle on-chain :** l'URI du NFT ne contient que le match et la place.

**QR d'entrée :** le supporter signe `OLYMPASS-ENTREE:<NFTokenID>:<horodatage>` avec la clé de son wallet. Le portique vérifie la signature, refuse un QR de plus de 60 secondes (capture d'écran revendue), vérifie sur le ledger que le signataire détient le billet, puis le club exécute `NFTokenBurn`.

## Sécurité

- Comptes **Testnet uniquement**. Aucune seed Mainnet.
- Les seeds sont dans `.env`, exclu de Git par `.gitignore`. Voir `.env.example`.
- Pour simplifier la démo, le serveur détient les seeds de test des supporters (`data/users.json`). La connexion par profil n'a pas de mot de passe : c'est un PoC. En production, chaque supporter signerait dans son propre wallet (Xaman, GemWallet), et seule la clé du club resterait côté serveur.

## Adresses de test

Elles changent à chaque `npm run setup -- --reset`. Elles sont affichées par `npm run setup` et sur la page de connexion.

| Rôle | Adresse |
| --- | --- |
| Club (émetteur) | `rDNZr99eLUJMLPrGfhjypPPyz4gpGCbvCC` |
| Nassim | `rMVzD2i59QivJZCm8H1zig2zS6AUrmQMA2` |
| Inès | `rshPTfz6jNNFQdvVapfQEZkrTLJW81Nue8` |
| Enzo | `rpeZ8g8UMG5AUJyBxdkXCL3Q5wNCNXtTfz` |

## Crédits

- Photo du stade : [« Stade Vélodrome 1 »](https://commons.wikimedia.org/wiki/File:Stade_V%C3%A9lodrome_1.jpg), Zakarie Faibis, licence [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/), via Wikimedia Commons (`web/img/velodrome.jpg`, redimensionnée en 1920 px).
- Écussons : créations stylisées aux couleurs des clubs (`web/crests.js`), pas les logos officiels. Projet étudiant sans lien avec l'Olympique de Marseille ni le Paris Saint-Germain.
- Logos locaux (optionnel) : si des fichiers `web/img/logos/om.png` et `psg.png` (ou `.svg`, `.webp`) sont présents sur le poste, l'interface les affiche à la place des écussons. Ce dossier est exclu de Git : les logos officiels sont des marques déposées et ne sont pas distribués avec le projet.
