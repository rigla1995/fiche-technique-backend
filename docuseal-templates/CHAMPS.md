# Placement des champs Docuseal (flux template — édition Community)

Fonds de page générés par `node docuseal-templates/generate.js --templates` :
`contrat-template.pdf`, `avenant-template.pdf`, `resiliation-template.pdf`.
Dans l'UI Docuseal : **créer un template** en uploadant chaque PDF, puis poser les
champs listés ci-dessous **sur les cases en pointillé** prévues dans le document.

## Règles impératives

- **Nom des champs EXACT** (accents et espaces compris) : c'est la clé de remplissage
  utilisée par l'API (`docusealService.createSubmission`). Un champ mal nommé reste vide.
- **Rôle du signataire : `Première partie`** (nom exact — l'API cible ce rôle).
- Tous les champs sont de type **Texte**, sauf « Signature » (type **Signature**).
- Décocher « requis » pour les champs optionnels (promo, capacité) — ils peuvent
  arriver vides. Le backend les envoie en lecture seule (readonly), le client n'a
  que la signature à poser.
- Un même champ peut avoir **plusieurs zones** (ex. « Nom du client » apparaît 2×) :
  dessiner une nouvelle case au 2ᵉ emplacement et lui donner **exactement le même
  nom** — Docuseal la rattache au même champ (une seule valeur, affichée partout).
  En dernier recours, laisser la case secondaire sans champ : le document reste
  valide, la case reste simplement vide.
- **Comptage cases vs champs** (le fond contient plus de cases que de champs à créer,
  à cause des zones multiples) :
  - contrat : **12 champs → 14 cases** (Nom du client ×2, Date du contrat ×2)
  - avenant : **10 champs → 12 cases** (Nom du client ×2, Date du contrat ×2)
  - résiliation : **4 champs → 7 cases** (Nom du client ×2, Date du contrat ×3)

## 1. contrat-template.pdf → `DOCUSEAL_TEMPLATE_ID`

| Champ (nom exact) | Où poser la case |
|---|---|
| `Nom du client` | carte « LE CLIENT » (grande case) **+ 2ᵉ zone** : carte signature client |
| `Email` | carte « LE CLIENT », 2ᵉ case |
| `Nb activités` | tableau art. 2, ligne « Points de vente (activités) » |
| `Nb labos` | tableau art. 2, ligne « Laboratoires de production » |
| `Nb gérants` | tableau art. 2, ligne « Comptes gérants » |
| `Montant onboarding` | art. 3, case de la ligne « Frais d'activation » |
| `Montant mensuel` | art. 3, case du bandeau « Mensualité applicable » (avant « / mois ») |
| `Détail promotion` | grande case du bloc « Conditions particulières » |
| `Mensualité après promo` | case « Tarif de base mensuel : » |
| `Reprise prix de base` | case « Reprise du tarif de base : » |
| `Date du contrat` | case « Fait à …, le ___ » **+ 2ᵉ zone** : pastille verte « Signé électroniquement le ___ » |
| `Signature` (type Signature) | zone en pointillé de la carte « LE CLIENT » (signatures) |

## 2. avenant-template.pdf → `DOCUSEAL_TEMPLATE_AVENANT_ID`

| Champ (nom exact) | Où poser la case |
|---|---|
| `Nom du client` | carte « LE CLIENT » **+ 2ᵉ zone** : carte signature client |
| `Email` | carte « LE CLIENT », 2ᵉ case |
| `Contrat initial` | ligne « Contrat visé : » (art. 1) |
| `Capacité ajoutée` | bandeau vert « Capacité ajoutée par cet avenant » |
| `Nb activités` / `Nb labos` / `Nb gérants` | tableau art. 2 (« Nouvelle quantité ») |
| `Montant mensuel` | bandeau « Mensualité applicable » (avant « / mois ») |
| `Date du contrat` | « Fait à …, le ___ » **+ 2ᵉ zone** : pastille « Signé électroniquement le ___ » |
| `Signature` (type Signature) | zone en pointillé carte « LE CLIENT » |

## 3. resiliation-template.pdf → `DOCUSEAL_TEMPLATE_RESILIATION_ID`

| Champ (nom exact) | Où poser la case |
|---|---|
| `Nom du client` | carte « LE CLIENT » **+ 2ᵉ zone** : carte signature client |
| `Email` | carte « LE CLIENT », 2ᵉ case |
| `Date du contrat` | case « Date de la demande de résiliation » (art. 2) **+ 2ᵉ zone** « Fait à …, le ___ » **+ 3ᵉ zone** pastille prestataire |
| `Signature` (type Signature) | zone en pointillé carte « LE CLIENT » |

## Après création des 3 templates

1. Récupérer l'**ID** de chaque template (visible dans l'URL Docuseal, ex. `/templates/12`).
2. Renseigner dans Coolify : `DOCUSEAL_TEMPLATE_ID`, `DOCUSEAL_TEMPLATE_AVENANT_ID`,
   `DOCUSEAL_TEMPLATE_RESILIATION_ID` → **Redeploy**.
3. Tester avec un client fictif (sa propre adresse email) : création → email signature →
   document rempli → signer → mail d'activation (webhook).

NB : si le fond de page est régénéré (`--templates`) après modification des clauses,
re-uploader le PDF dans le template Docuseal (« replace document ») et vérifier que
les champs sont toujours bien positionnés.
