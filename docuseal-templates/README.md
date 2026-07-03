# Documents LabFlow (PDF) — charte commune

Quatre documents PDF partagent la même charte (logo vectoriel, dégradé sky→indigo→violet,
blocs parties, pied légal env-driven), tous générés par `generate.js` (pdfkit) :
**contrat d'abonnement**, **avenant**, **résiliation** (flux Docuseal) et **facture
d'abonnement** (`buildFacture`, appelée par `pdfService.generateFacturePdf` à la
validation d'un paiement — sortie **déterministe** : CreationDate = date de facture,
la copie email et la copie re-téléchargée sont identiques au byte près).

Refonte 2026-06/07 : design professionnel conforme au thème, **valeurs rendues en dur**
(plus de cases vides) et **signature du prestataire pré-apposée** (cachet électronique).

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

## Identité prestataire — variables d'environnement (Coolify)

L'objet `PRESTATAIRE` (haut de `generate.js`) lit les **variables d'environnement**
(voir le bloc « Identité légale du prestataire » de `.env.example`) avec des
placeholders fictifs en repli : `FACTURE_PRESTATAIRE_NOM`, `FACTURE_ADRESSE`,
`FACTURE_MATRICULE_FISCAL` (partagées avec les factures) + `PRESTATAIRE_FORME`,
`PRESTATAIRE_RAISON_SOCIALE`, `PRESTATAIRE_RC`, `PRESTATAIRE_CAPITAL`,
`PRESTATAIRE_VILLE`, `PRESTATAIRE_EMAIL`, `PRESTATAIRE_TEL`, `PRESTATAIRE_SIGNATAIRE`.
Renseigner les **vraies mentions légales** avant toute génération destinée à un client
(un acte signé avec une identité inexacte est juridiquement vicié). Tant qu'un
placeholder subsiste, la génération est refusée **par défaut en production** (ou
partout avec `FACTURE_STRICT=1`) et le backend se replie sur le flux template
historique ; le flux PDF s'active automatiquement dès que les variables sont saisies.

## Deux flux d'envoi (selon l'édition Docuseal)

⚠️ **`POST /api/templates/pdf` est réservé à l'édition PRO de Docuseal** (vérifié sur
notre instance Community : `404 "This feature is available in Pro Edition"`). D'où
deux chemins, pilotés par `DOCUSEAL_PDF_FLOW` :

### A. Édition Community (actuel) — flux TEMPLATE avec les nouveaux fonds
`node docuseal-templates/generate.js --templates` génère `*-template.pdf` : les mêmes
documents (design, clauses, **cachet prestataire pré-apposé** — statique donc conservé)
avec des **zones de valeurs laissées vierges** (fond net dans le document signé).
`--guides` produit les versions repères `*-template-guides.pdf` (cases visibles, pour
le placement uniquement). On uploade les fonds propres dans l'UI Docuseal et on pose
les champs nommés dessus : voir **CHAMPS.md** (noms exacts, rôle `Première partie`). L'API remplit ces champs à chaque envoi (`createSubmission`),
comme avant — l'avenant envoie en plus « Capacité ajoutée » et « Contrat initial ».

### B. Édition Pro — flux « PDF rempli » (`DOCUSEAL_PDF_FLOW=1`)
`src/services/contractPdfService.js` lève les builders avec `previewMode:false` et
retourne `{ base64, ref, documentName }` (référence type `CTR-2026-00042` dérivée de
l'id d'abonnement / de demande / de client) ; envoi via `createSubmissionFromPdf`
(document par client, balise `{{Signature}}`). Sans le flag, ce chemin est ignoré.

### Points d'appel (communs)
- **Contrat** : `clientsController.create` → `submitContratForSignature`
- **Avenant** : `supportController.create` (demande `supplement`) → `submitAvenantForSignature`
- **Résiliation** : `clientsController.remove` → `submitResiliationForSignature`

Chaque helper tente le flux « PDF rempli » (si `DOCUSEAL_PDF_FLOW=1`) puis **se replie
sur le flux template** si la génération ou l'API échoue. Le webhook Docuseal est
inchangé : il route par email du signataire (contrat) et par `submission_id` (avenant),
indépendamment du template.

Montants : **TTC** (comme partout dans l'app — la facture présente la ventilation
HT/TVA/TTC) ; les clauses des articles 3 le précisent.
