# Lot 3 — Identité légale du client, patente, contrats et factures (spec v1, 04/10/2026)

Dernier lot du programme « LabFlow multi-métiers ». Sources : `labflow-reprise/lot-3/DEPART-3.md` (règle de livraison,
décisions), `labflow-reprise/lot-3/DECISIONS-3.md` (choix du client du 04/10, faits de la cartographie),
`docs/plan-identite-legale-tarifs-domaine-2026-09-28.md` §2-§5, V3.2, V3.3 (les numéros de migration du plan sont périmés).

> **Mise à jour du 04/10/2026 — décision du client : plus de contrat, d'avenant ni de résiliation (LabFlow est sans
> engagement).** Les §7, §8 et §9 (aperçus du contrat et de l'avenant, nouveau modèle DocuSeal, avenants par composant)
> sont CADUCS : le code DocuSeal a été retiré à l'étape 5 (webhook, services, générateurs, email de signature ;
> `docuseal-templates/generate.js` ne porte plus que les factures ; manuel réécrit par la migration 198).
> Découpage en vigueur et journal : `labflow-reprise/lot-3/DECISIONS-3.md`. Les numéros d'étape des titres ci-dessous
> sont ceux du découpage d'origine : « Mon entreprise » = étape 6, patente = étape 7, factures = étape 8, clôture = étape 9.

## 0. Règle de livraison (rappel)

Une étape = un déploiement en production (serveur, `/health` + migration dans les journaux, puis écrans), puis ARRÊT
et fiche de test au client. L'étape N+1 ne commence qu'après « étape N OK » écrit par le client. Migrations additives
seulement. Retour arrière : écrans puis serveur, `git revert -m 1` des fusions, jamais de `push --force`.
Par étape : `npm test`, `npm run build`, contrôles vocab (REPRISE §8) proportionnés, test E2E de l'étape sur le
backend de test (`node scripts/start-test-backend.js`, jamais `npm start`).

## 1. Définitions communes

### 1.1 Colonnes (`profil_entreprise`, migration 197, toutes NULLables)

`raison_sociale` VARCHAR(255), `nom_commercial` VARCHAR(255), `forme_juridique` VARCHAR(30) (CHECK NULL ou
SARL, SUARL, SA, SNC, EI, AUTO_ENTREPRENEUR, ASSOCIATION, AUTRE), `matricule_fiscal` VARCHAR(50), `rne` VARCHAR(50),
`ville` VARCHAR(120), `representant_nom` VARCHAR(150), `representant_qualite` VARCHAR(80). Index partiel sur
`matricule_fiscal`. `adresse` (TEXT) existe déjà : elle porte la rue ; `ville` la ville (avec code postal si saisi).
`profil_entreprise.nom` garde son sens (copie du nom du contact, NOT NULL).

### 1.2 Nom affiché, identité complète

- **Nom affiché** = nom commercial, sinon raison sociale, sinon nom du contact (`utilisateurs.nom`, repli `pe.nom`).
  Une seule définition serveur : `src/utils/identite.js` (`nomAffiche(row)` en JS, `NOM_AFFICHE_SQL` fragment SQL
  pour les étapes 5+).
- **Identité complète** = raison sociale + matricule fiscal + adresse + ville non vides (mentions obligatoires d'une
  facture : nom, adresse complète, matricule fiscal ; `adresse` ne porte que la rue). Une seule fonction
  `identiteComplete(row)`. Le plan disait « raison sociale + MF » : adresse et ville ajoutées parce que la facture les
  exige (relecture du 04/10).
- Pour une forme EI ou AUTO_ENTREPRENEUR, l'écran libelle le champ « Nom du titulaire » (même colonne `raison_sociale`).

### 1.3 Matricule fiscal

Normalisation serveur (`src/utils/matriculeFiscal.js`, copie écran `src/components/admin/matriculeFiscal.ts`, mêmes vecteurs
`test/matricule-fiscal-vecteurs.json` = `scripts/matricule-fiscal-vecteurs.json` du frontend) :
majuscules, espaces / tirets / points retirés ; `1234567AAM000`, `1234567/A/A/M/000`, `1234567 A/A/M/000` →
`1234567A/A/M/000` ; `1234567/A` → `1234567A`. Modèle accepté : `^\d{7}[A-Z]?(/[A-Z]/[A-Z]/\d{3})?$` ; vide autorisé.
Libellé collé retiré (« MF : », « M.F. », « Matricule fiscal : », comme `stripMfLabel` de generate.js). Six chiffres
seulement (zéro de tête perdu) : refus avec un message dédié. Clé absente (`1234567/A/M/000`, `1234567`) =
avertissement non bloquant. Pas d'unicité : un MF dont l'identifiant (7 premiers caractères) est déjà porté par un
autre compte renvoie un avertissement « déjà porté par le compte X » (la sauvegarde a lieu).
Matricule des ACHETEURS (`acheteurs.matricule_fiscal`, simple `trim`) : hors périmètre ; à trancher à l'étape 5
(normalisation seule, sans refus, pour que la facture n'imprime pas deux formats).

### 1.4 Caractères

Les champs d'identité sont imprimés par pdfkit en police standard (Windows-1252) : un caractère hors de cette table
(arabe, émoji) est refusé à la saisie (400, « caractères latins seulement »). AVANT ce contrôle, le serveur nettoie le
texte : NFC (accents décomposés d'un Mac ou d'un PDF), ligatures ﬀ ﬁ ﬂ ﬃ ﬄ ﬅ ﬆ défaites, caractères invisibles
(U+00AD, U+200B-D, U+2060, U+FEFF) retirés, tirets U+2010-2012 et moins U+2212 → « - », espaces (insécables
comprises) réduites à une. Table = celle de `HORS_POLICE` (generate.js) sans \t \n \r ni drapeau g ;
`test/identite.test.js` vérifie caractère par caractère que les deux concordent. Longueurs = tailles des colonnes,
`adresse` bornée à 300 (400, jamais 500).

### 1.5 Qui modifie quoi

Admin : tout. Client (étape 3) : adresse, ville, représentant. Gérant : rien (lecture).

## 2. Étape 1 — Identité d'un client existant (admin)

**Serveur**
- Migration `197_identite_legale_profil.sql` (§1.1), idempotente (ADD COLUMN IF NOT EXISTS, CHECK gardé par
  `pg_constraint`, `CREATE INDEX IF NOT EXISTS`).
- `PUT /admin/clients/:id/identite` (authenticate, requireSuperAdmin ; garde `:id` de 1 à 9 chiffres, sinon 404) → `clientsController.updateIdentite` :
  corps `{ raisonSociale, nomCommercial, formeJuridique, matriculeFiscal, rne, adresse, ville, representantNom,
  representantQualite }` ; chaîne vide → NULL ; client inexistant ou non `client` → 404 ; écrit SEULEMENT ces colonnes
  (`INSERT … ON CONFLICT (client_id) DO UPDATE`, ligne créée avec nom/email de `utilisateurs` si absente) ; répond le
  client complet (forme de `mapClient`) + `avertissements: []`. Seuls les champs PRÉSENTS sont lus : l'écran n'envoie
  que les champs modifiés (une donnée ancienne non touchée ne bloque pas ; deux admins ne s'écrasent pas champ par
  champ). Le téléphone n'est jamais copié (UNIQUE sur `profil_entreprise`). Production au 04/10 : 3 clients, tous avec
  leur ligne `profil_entreprise` (aucune création de ligne attendue).
- `list` / `getById` : colonnes ajoutées, `GROUP BY u.id, pe.id, dom.domaine_id, dom.domaine_nom` ; `getById`
  sélectionne aussi `activated_at` (oubli ancien). `mapClient` ajoute (additif) `entreprise {raisonSociale,
  nomCommercial, formeJuridique, matriculeFiscal, rne, adresse, ville, representantNom, representantQualite}`,
  `nomAffiche`, `identiteComplete` — seulement quand la requête a lu l'identité (liste, fiche, PUT identité) : les
  réponses de `create` et `update` ne changent pas (I9). Les champs existants ne changent pas.
- Les colonnes NOUVELLES ne sont lues par rien d'autre à cette étape. **Mais `adresse` existe déjà et est lue en
  direct** par la facture acheteur (2 téléchargements), la facture d'appro, le contrat régénéré, l'avenant et
  `GET /api/entreprise`. Aucun écran ne l'écrivait jusqu'ici. Production au 04/10 : 1 client sur 3 a une adresse, et
  le client 62 a 8 factures acheteur. Décision : l'adresse reste modifiable ; la fenêtre avertit quand une adresse
  déjà renseignée est modifiée (« une facture déjà émise, téléchargée de nouveau, portera la nouvelle adresse ») ; la
  fiche de test le dit ; l'étape 5 fige les factures existantes.

**Écrans (admin seulement, vocabulaire LabFlow — I4)**
- `src/components/admin/identiteLegale.ts` (type, formes juridiques, qualité proposée) et `matriculeFiscal.ts` : dans
  l'espace admin (hors périmètre de `vocab-check`, I4) tant que seul l'admin les emploie.
- `src/components/admin/ClientIdentiteForm.tsx` : formulaire contrôlé des 9 champs (réutilisé aux étapes 2 et 3) ;
  qualité du représentant proposée d'après la forme si vide (Gérant / Titulaire / Président…) ; MF normalisé à la
  sortie du champ ; nom commercial révélé par la case « L'enseigne diffère de la raison sociale ».
- `ClientsManagement.tsx` : titre de la carte = nom affiché ; sous-titre « 👤 contact · email » quand le nom affiché
  diffère du contact ; puce-bouton ambre « 🪪 Identité à compléter » (ouvre la fenêtre Identité) ; fenêtre
  « Consulter » : bloc « Identité légale » + bouton « 🪪 Modifier l'identité » ; recherche étendue (raison sociale, nom
  commercial, MF saisi avec ou sans séparateurs) ; liste triée par nom affiché ; fenêtres Suppression, Configuration et
  Domaine titrées par le nom affiché (Suppression : + contact). Fenêtre Identité = `.modal-overlay` (z 200, sous
  ConfirmDialog 700), ouverte depuis « Consulter » après sa fermeture ; erreurs du serveur en bandeau dans la fenêtre ;
  avertissements affichés après l'enregistrement.

**Écarts admis** : `scripts/vocab-allow/L3.json` (backend : `admin` pour les messages de la route admin, `discriminant`
pour les codes et le SQL).

**Test E2E** : `scripts/test-identite-legale.js` (création d'un client de test, PUT identité, normalisation, 400 MF
invalide / forme inconnue / arabe / trop long, avertissement MF partagé, 404, 403 pour un client, liste + getById,
nettoyage). `test/matriculeFiscal.test.js`, `test/identite.test.js`.

**Fiche de test** : ouvrir un client, saisir l'identité, voir la carte changer de titre et la pastille disparaître ;
un client existant non saisi garde son titre (pastille visible) ; rien ne change chez le client.

**Retour arrière** : revert écrans puis serveur ; la migration 197 reste (colonnes vides inoffensives).

## 3. Étape 2 — Création d'un client, 1re étape refaite

Points de la relecture du 04/10 à traiter à cette étape : `previewContratPdf` ne lit pas l'adresse (serveur à modifier,
garder la forme vérifiée par `B2-controleurs.test.js:120`) ; l'adresse envoyée à la création s'imprime sur le PDF du
contrat (aperçu, contrat régénéré, repli sans DocuSeal, flux « PDF rempli », `generate.js:417`) mais PAS sur le contrat
DocuSeal en flux « modèle » (production) avant le nouveau modèle de l'étape 7 — à dire dans la fiche ; ville non accolée
(étape 6) ; identité validée AVANT
toute écriture et à l'écran au clic sur « Suivant » (le 400 arriverait sinon à la dernière étape) ; contraintes réelles
`utilisateurs_email_key` (vue en production), `profil_entreprise_telephone_unique` ; un 23505 inconnu → message
générique ; téléphones comparés normalisés ; `demandes_acces.ville` pré-remplie ; garder les formes de `create`
vérifiées par `B2-controleurs.test.js:128-136`.

- Wizard `AddClientModal` étape 1 : bloc Identité légale (`ClientIdentiteForm`) PUIS bloc Contact (nom du contact,
  email, téléphone — obligatoires comme aujourd'hui). Identité facultative (pastille ensuite). Overlay ramené à
  `zIndex: 400`. Adresse envoyée à l'aperçu du contrat et à la création.
- `create` : lit les champs d'identité (mêmes règles que l'étape 1, code partagé), INSERT complet de `profil_entreprise` ;
  téléphone vérifié dans `utilisateurs` ET `profil_entreprise` ; catch 23505 branché sur `err.constraint` (email /
  téléphone) → 409 avec le bon message ; `update` : même correction du message 23505.
- Conversion d'une demande d'accès : inchangée (nom, email, téléphone pré-remplis).
- Contrat : inchangé à cette étape (l'identité n'y apparaît qu'aux étapes 6-7).
- Précaution de test : vrai contrat DocuSeal → l'adresse du client lui-même, puis suppression du compte d'essai.

## 4. Étape 3 — « Mon entreprise » côté client

- `GET /api/entreprise` : champs d'identité ajoutés à `mapEntreprise` (additif ; la référence de sortie capture cette
  route : écart attendu déclaré ou recapture).
- `PUT /api/entreprise/identite` (client seulement, compte parent) : adresse, ville, representant_nom,
  representant_qualite (liste blanche). `upsertEntreprise` (sans appelant) : réservé au rôle client et au compte
  parent (fin de la ligne orpheline d'un gérant).
- `Profile.tsx` : section « Mon entreprise » = formulaire séparé (son propre bouton), rôle client seulement, masquée
  quand `onboardingStep === 1` ; raison sociale, forme, MF, RNE, nom commercial en lecture seule (« Contactez
  LabFlow ») ; bandeau si incomplet (« envoyez votre patente à LabFlow »). Textes client : vocabulaire du compte si un
  terme métier apparaît (aucun prévu).

## 5. Étape 4 — Lecture de la patente sans IA (3 couches, dans le navigateur)

- **Essai d'abord** (`labflow-reprise/lot-3/patentes/`, hors git) : script local (pdfjs-dist, jsQR, tesseract.js
  fra + ara) qui mesure, par fichier et par champ, ce que donnent (1) le texte du PDF, (2) le QR code, (3) l'OCR.
  Le résultat décide des règles de lecture (étiquettes « Matricule fiscal », « Dénomination »…) et est montré au client.
- Écran : bouton « 📄 Lire la patente » dans `ClientIdentiteForm` (création + fenêtre Identité) ; formats PDF, JPEG,
  PNG, WebP (HEIC : message « convertissez en JPEG », le navigateur ne le décode pas sauf Safari) ; tout se fait dans le
  navigateur (chargement paresseux des bibliothèques et des données de langue, hébergées par l'application) ; seuls
  les champs vides se remplissent ; pastille « lu » par champ ; texte reconnu affiché à côté, un clic recopie une ligne
  dans le champ actif ; bouton « Vérifier sur le RNE » (recherche officielle, nouvel onglet). Rien n'est envoyé au
  serveur, rien n'est conservé.

## 6. Étape 5 — Factures

- Migration : copie figée vendeur sur `factures_acheteur` (`vendeur_raison_sociale, vendeur_nom_commercial,
  vendeur_forme, vendeur_matricule_fiscal, vendeur_rne, vendeur_adresse, vendeur_ville`) posée aux 2 INSERT
  (`createVente`, `expedierCommande`) si l'identité est complète ; copie figée client sur `paiements` (`client_*`)
  posée au passage à « payé ». **Aucune reprise** : une facture sans copie s'imprime comme aujourd'hui (pas de repli sur
  la fiche vivante, décision client 04/10 pour l'abonnement ; même règle pour la facture acheteur).
- PDF : `partiesBlock` / `emetteur` étendus (RNE, ville, libellé « Identifiant unique » pour un auto-entrepreneur),
  lignes omises si vides ; aucun octet ne change quand la copie est absente (tests B2-pdfTexte).
- Facture d'appro : destinataire = identité du client (lecture vivante, document interne).
- Portail acheteur : vendeur = nom affiché (+ adresse, MF si présents). Bandeau « identité incomplète » sur les pages
  Acheteurs du client.

## 7. Étape 6 — Contrat et avenant : aperçus serveur

- `contractPdfService.clientBlock` : raison sociale (repli contact), forme · MF · RNE, représentant, adresse + ville.
- `generate.js` : le texte fixe du contrat, de l'avenant et de la résiliation reçoit `voc` (objet, sous-titre,
  clause 4.5, clause 3.1, libellés des lignes) ; restauration identique à l'octet ; 13 exceptions `lot-3` et 18 écarts
  `B2.json` reportés levés dans la même étape.
- Avenant : `buildAvenantDocument` = seul générateur ; l'écran admin du support utilise `GET …/avenant-preview` ;
  `src/utils/contractPdf.ts` et `pdfService.generateAvenantPdf` / `generateContratPdf` retirés.

## 8. Étape 7 — Nouveau modèle DocuSeal

- `generate.js --templates` : zones Identité légale, Adresse, Représentant, Domaine, Composant 1-6 / Nb 1-6 (contrat
  et avenant) ; résiliation inchangée.
- **Garde** : le serveur lit la liste des champs du modèle (`GET /api/templates/:id`, cache) et n'envoie que les
  champs présents (le retry 422 ne tolère que 5 champs inconnus : sans cette garde, ajouter les champs avant le dépôt
  bloquerait tout contrat). L'ancien modèle continue de fonctionner tel quel.
- Pas à pas client (CHAMPS.md réécrit en français simple), contrat d'essai signé avec sa propre adresse.

## 9. Étape 8 — Avenants par composant

- Migration : `support_demandes_composants(demande_id, composant_id, nb)`.
- `SupportPage` : un compteur par composant du domaine ; `AdminSupportPage` : lignes par composant ;
  `computeAvenantPricing`, webhook et `traiter` appliquent les composants explicites (repli compteurs pour les
  demandes anciennes). `traiter` rendu atomique avec garde `statut = 'en_attente'` ; `deleteMine` refusé si une
  signature est en cours.

## 9 bis. Points de la relecture du 04/10 pour les étapes 3 à 7

- Étape 3 : `upsertEntreprise` écrit `adresse = adresse || null` (un PUT sans adresse l'efface) et un 23505 donne 500 :
  la supprimer (aucun appelant) ou l'exclure des champs d'identité. Si `Profile.tsx` réutilise des fichiers de
  `components/admin/`, nommer ces fichiers dans le contrôle `vocab-check` (« Gérant » juridique = type `fiscal`).
- Étape 5 : une facture sans copie figée se lit en direct, donc reste modifiable — figer à la migration les factures
  acheteur EXISTANTES avec ce qu'elles impriment aujourd'hui ; toujours figer nom et adresse, les mentions légales seulement
  si présentes ; `paiements` : payé → autre → payé garde la première copie (`COALESCE`).
- Étape 7 : la liste des champs du modèle DocuSeal en cache a une durée de vie, et elle est invalidée sur une 422.

## 10. Étape 9 — Clôture

Fiche du manuel « Mon compte » (texte balisé, migration), mémoire et REPRISE à jour, bilan au client.
