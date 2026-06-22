# Templates de contrats DocuSeal

Deux modèles PDF à uploader dans DocuSeal comme **templates**, prêts à être pré-remplis automatiquement par l'application.

| Fichier | Usage | Variable d'env DocuSeal |
|---|---|---|
| `contrat-labflow.pdf` | Contrat d'abonnement (création de client) | `DOCUSEAL_TEMPLATE_ID` |
| `avenant-labflow.pdf` | Avenant (ajout de capacité / changement de tarif) | `DOCUSEAL_TEMPLATE_AVENANT_ID` |
| `resiliation-labflow.pdf` | Résiliation du contrat | `DOCUSEAL_TEMPLATE_RESILIATION_ID` |

Régénérer après modification : `node docuseal-templates/generate.js`

## Champs pré-remplis automatiquement

Les balises `{{...}}` présentes dans les PDF sont **détectées automatiquement par DocuSeal à l'upload** et deviennent des champs. L'API les remplit par leur **nom exact** (voir `src/services/docusealService.js`) :

| Champ DocuSeal | Source |
|---|---|
| `Nom du client` | nom du client |
| `Email` | email du client |
| `Date du contrat` | date d'émission |
| `Nb activités` | nombre d'activités souscrites |
| `Nb labos` | nombre de labos |
| `Nb gérants` | nombre de gérants |
| `Montant onboarding` | frais d'activation (DT) |
| `Montant mensuel` | mensualité (DT) |
| `Signature` | signature électronique du client |

⚠️ Ne **pas renommer** ces champs dans DocuSeal, sinon le pré-remplissage ne marche plus.

## Procédure d'upload (à faire une fois par template)

1. DocuSeal → **New template** → uploader le PDF.
2. DocuSeal détecte les `{{balises}}` et crée les champs. Vérifier qu'ils portent bien les noms ci-dessus.
3. Assigner tous les champs au **même signataire** (rôle `Première partie` — c'est le rôle utilisé par l'API).
4. (Optionnel) Marquer les champs de prix/configuration en **lecture seule** pour que le client ne puisse pas les modifier.
5. Copier l'**ID du template** et le mettre dans la variable d'env correspondante (Coolify).

## À compléter avant mise en production

Les informations légales du prestataire sont des **placeholders** dans `generate.js` (objet `PRESTATAIRE`) :
`forme` juridique, `matricule` fiscal, `rc` (registre de commerce), `adresse`, `tel`.
Les renseigner puis régénérer les PDF.
