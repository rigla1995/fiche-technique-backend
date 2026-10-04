# Factures LabFlow (PDF) — module de charte

`generate.js` (pdfkit) porte la charte commune des factures : logo vectoriel, dégradé
sky→indigo→violet, blocs « parties », pied légal piloté par les variables d'environnement.

Trois factures :

| Fonction | Document | Appelée par |
|---|---|---|
| `buildFacture` | facture d'abonnement (émise au règlement d'une mensualité) | `src/services/pdfService.js` (`generateFacturePdf`) |
| `buildFactureAcheteur` | facture d'une vente à un acheteur (émise par l'entreprise du client) | `src/services/factureAcheteurPdf.js` |
| `buildFactureAppro` | facture d'approvisionnement (émetteur = fournisseur) | `src/services/factureApproPdf.js` |

La facture d'abonnement est **déterministe** : CreationDate = date de facture, jamais l'horloge. La copie jointe à
l'email et la copie re-téléchargée sont identiques à l'octet près (`test/B2-pdfTexte.test.js` le vérifie contre une
version de référence : ne modifier aucune fonction partagée sans relancer ce test).

Depuis le lot 3 (octobre 2026), LabFlow est **sans engagement** : il n'y a plus de contrat, d'avenant ni d'acte de
résiliation, et plus aucun échange avec DocuSeal. Le dossier garde son nom d'origine parce que trois services, des
tests et l'outil de contrôle du vocabulaire s'y réfèrent.

## Aperçu local

```
node docuseal-templates/generate.js
```

Écrit `facture-labflow.pdf` et `facture-acheteur-labflow.pdf` dans ce dossier, avec des valeurs d'exemple.

## Identité du prestataire — variables d'environnement (Coolify)

L'objet `PRESTATAIRE` (haut de `generate.js`) lit les variables d'environnement, avec des valeurs d'exemple en repli
(voir le bloc « Identité légale du prestataire » de `.env.example`) : `FACTURE_PRESTATAIRE_NOM`, `FACTURE_ADRESSE`,
`FACTURE_MATRICULE_FISCAL`, `PRESTATAIRE_FORME`, `PRESTATAIRE_RAISON_SOCIALE`, `PRESTATAIRE_RC`,
`PRESTATAIRE_CAPITAL`, `PRESTATAIRE_EMAIL`, `PRESTATAIRE_TEL`.

Une variable optionnelle DÉFINIE VIDE (`PRESTATAIRE_RC=`, `PRESTATAIRE_CAPITAL=`) veut dire « aucune » : c'est le cas
d'un auto-entrepreneur. Les vraies mentions légales doivent être posées avant toute facture destinée à un client.

Montants : **TTC**, comme partout dans l'application ; la facture présente la ventilation HT / TVA / TTC.
