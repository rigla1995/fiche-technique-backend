# Documents contractuels LabFlow (PDF)

Trois documents PDF — **contrat d'abonnement**, **avenant**, **résiliation** — générés par
`generate.js` (pdfkit). Refonte 2026-06 : design professionnel conforme au thème (logo
vectoriel, dégradé sky→indigo→violet), **valeurs rendues en dur** (plus de cases vides) et
**signature du prestataire pré-apposée** (cachet électronique).

## Approche « PDF rempli » (et non plus « template à champs »)

L'ancienne approche uploadait un template à cases vides dans DocuSeal, qui remplissait des
champs nommés au moment de l'envoi. La nouvelle approche génère le document **par client,
déjà rempli avec ses vraies valeurs et déjà signé de notre part**. Seule la **signature du
client** reste à recueillir : elle est portée par la balise `{{Signature;type=signature}}`
détectée automatiquement par DocuSeal via `createSubmissionFromPdf` (voir
`src/services/docusealService.js`). Aucun champ à configurer côté DocuSeal.

## Builders (data-driven)

`generate.js` exporte `buildContrat / buildAvenant / buildResiliation (outPath, data)`.
Chaque builder accepte un objet `data` et écrit un PDF. Lancé en CLI, le fichier génère
un **aperçu** avec des valeurs d'exemple :

```
node docuseal-templates/generate.js
```

Forme du `data` :

| Champ | Contrat | Avenant | Résiliation |
|---|---|---|---|
| `ref`, `date` (chaînes formatées) | ✔ | ✔ | ✔ |
| `client { nom, email?, tel?, adresse? }` | ✔ | ✔ | ✔ |
| `config { activites, labos, gerants }` | ✔ | ✔ | — |
| `pricing { onboarding?, mensuel, mensuelBase?, promoDetail? }` | ✔ | ✔ (mensuel) | — |
| `ajout` (texte capacité ajoutée) | — | ✔ | — |
| `contratRef`, `contratDate` (contrat initial visé) | — | ✔ | — |
| `previewMode` (true = aperçu ; **false = balise DocuSeal posée**) | ✔ | ✔ | ✔ |

Robustesse : tous les champs variables sont **wrappés** (jamais tronqués silencieusement) ;
les cartes « parties » ont une hauteur dynamique ; les zones contraintes (cachet, pied de
page) clippent proprement avec « … ». Testé avec noms/adresses longs.

## Identité prestataire — À COMPLÉTER avant la prod

L'objet `PRESTATAIRE` (haut de `generate.js`) contient des **placeholders** :
`raisonSociale`, `forme`, `matricule` (MF), `rc`, `capital`, `adresse`, `ville`, `email`,
`tel`, `signataire`. Renseigner les **vraies mentions légales** avant toute génération
destinée à un client (un acte signé avec une identité inexacte est juridiquement vicié).

## Reste à câbler (après validation du rendu)

1. Lever les builders dans un service backend (ex. `contractPdfService.js`) appelé par
   client avec `previewMode:false`, puis envoyer le PDF via `createSubmissionFromPdf`.
2. Renseigner `PRESTATAIRE` (mentions légales réelles) + idéalement les variables d'env
   `FACTURE_*` correspondantes.
3. (Option) clauses juridiques additionnelles : protection des données (loi 2004-63),
   force majeure, régime TVA, identification du signataire client, mention loi 2000-83
   sur la signature électronique.
