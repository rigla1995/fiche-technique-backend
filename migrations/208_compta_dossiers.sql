-- LabFlow Compta, étape S4a « Les dossiers du cabinet » (labflow-reprise/achats-compta/PLAN-S4.md ; SPEC-SOCLE §3.2, D3,
-- D10, D16, D17 ; CADRAGE §3). Migration additive : aucun compte ni accès existant ne change (compta.acces.tous_dossiers
-- reste vrai partout ; la liste de dossiers par collaborateur arrive à l'étape S4c).
-- 1) Le dossier : une entité juridique tenue dans une comptabilité (compta.espaces). Identité = mêmes colonnes que
--    profil_entreprise (src/utils/identite.js, D17) ; pays, devise et décimales figés (TN, TND, 3) jusqu'au deuxième
--    paquet pays ; régime fiscal en listes fermées (rien n'est calculé à cette étape) ; source « saisi » (assistant) ou
--    « labflow » (S4b : dossier du client LabFlow créé d'office, client_labflow_id = le compte représenté).
--    RESTRICT sur la comptabilité : une comptabilité qui a un dossier ne se supprime pas (D10 : rien de comptable ne
--    disparaît) — cabinetsController.remove et clientsController.remove le disent avant d'essayer.
CREATE TABLE IF NOT EXISTS compta.dossiers (
  id                   SERIAL PRIMARY KEY,
  espace_id            INTEGER NOT NULL REFERENCES compta.espaces(id) ON DELETE RESTRICT,
  nom                  VARCHAR(255) NOT NULL,
  raison_sociale       VARCHAR(255) NOT NULL,
  nom_commercial       VARCHAR(255),
  forme_juridique      VARCHAR(30) CHECK (forme_juridique IS NULL OR forme_juridique IN ('SARL', 'SUARL', 'SA', 'SNC', 'EI', 'AUTO_ENTREPRENEUR', 'ASSOCIATION', 'AUTRE')),
  matricule_fiscal     VARCHAR(50),
  rne                  VARCHAR(50),
  adresse              VARCHAR(300),
  ville                VARCHAR(120),
  representant_nom     VARCHAR(150),
  representant_qualite VARCHAR(80),
  pays                 CHAR(2) NOT NULL DEFAULT 'TN',
  devise               CHAR(3) NOT NULL DEFAULT 'TND',
  decimales            SMALLINT NOT NULL DEFAULT 3,
  personne             VARCHAR(10) NOT NULL CHECK (personne IN ('morale', 'physique')),
  impot                VARCHAR(5) NOT NULL CHECK (impot IN ('IS', 'IRPP')),
  tva                  VARCHAR(15) NOT NULL CHECK (tva IN ('reel', 'forfaitaire', 'non_assujetti')),
  exportateur_total    BOOLEAN NOT NULL DEFAULT false,
  teledeclaration      BOOLEAN NOT NULL DEFAULT false,
  debut_activite       DATE,
  source               VARCHAR(10) NOT NULL DEFAULT 'saisi' CHECK (source IN ('saisi', 'labflow')),
  client_labflow_id    INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  etat                 VARCHAR(10) NOT NULL DEFAULT 'actif' CHECK (etat IN ('actif', 'archive')),
  cree_par             INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_compta_dossiers_espace ON compta.dossiers (espace_id, etat);
CREATE INDEX IF NOT EXISTS idx_compta_dossiers_mf ON compta.dossiers (matricule_fiscal) WHERE matricule_fiscal IS NOT NULL;

-- 2) Exercices (début, fin, ouvert ou clos) et périodes mensuelles (ouverte ou close) : créés avec le dossier ; la
--    clôture arrive avec la saisie. Ils suivent le dossier (CASCADE : seul un dossier sans écriture se supprime).
CREATE TABLE IF NOT EXISTS compta.exercices (
  id         SERIAL PRIMARY KEY,
  dossier_id INTEGER NOT NULL REFERENCES compta.dossiers(id) ON DELETE CASCADE,
  debut      DATE NOT NULL,
  fin        DATE NOT NULL,
  etat       VARCHAR(10) NOT NULL DEFAULT 'ouvert' CHECK (etat IN ('ouvert', 'clos')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (fin >= debut),
  UNIQUE (dossier_id, debut)
);
CREATE TABLE IF NOT EXISTS compta.periodes (
  id          SERIAL PRIMARY KEY,
  exercice_id INTEGER NOT NULL REFERENCES compta.exercices(id) ON DELETE CASCADE,
  debut       DATE NOT NULL,
  fin         DATE NOT NULL,
  etat        VARCHAR(10) NOT NULL DEFAULT 'ouverte' CHECK (etat IN ('ouverte', 'close')),
  CHECK (fin >= debut),
  UNIQUE (exercice_id, debut)
);

-- 3) Dossiers ouverts à un accès quand ce n'est pas « tous » (compta.acces.tous_dossiers = false) ; remplie à l'étape S4c
--    (le titulaire fixe les dossiers de chaque collaborateur). Vide pour l'instant : tous les accès voient tout.
CREATE TABLE IF NOT EXISTS compta.acces_dossiers (
  acces_id   INTEGER NOT NULL REFERENCES compta.acces(id) ON DELETE CASCADE,
  dossier_id INTEGER NOT NULL REFERENCES compta.dossiers(id) ON DELETE CASCADE,
  PRIMARY KEY (acces_id, dossier_id)
);

-- 4) Manuel de LabFlow Compta (vocabulaire comptable fixe, jamais balisé). Fiches existantes : texte remplacé seulement
--    s'il est encore celui de la migration 207 (garde md5 du texte par défaut, sans \r) ; le texte servi suit seulement
--    s'il n'a pas été retouché dans l'admin. Idempotent : au 2e passage, la garde ne correspond plus.
UPDATE manuel_sections
   SET contenu = CASE WHEN contenu = contenu_defaut THEN f.texte ELSE contenu END,
       contenu_defaut = f.texte
  FROM (VALUES ($f208a$## 🏢 Mon cabinet

Cette page présente votre cabinet tel que LabFlow le connaît. Vous la trouvez dans le menu de gauche, entrée **Mon cabinet**.

### Ce que vous voyez

- **Identité** : raison sociale, forme juridique, matricule fiscal, RNE, adresse et représentant légal. C'est l'identité qui figure sur vos factures d'abonnement.
- **Contact** : le nom, l'adresse email et le téléphone du titulaire du compte.
- **Gérants** : les gérants en place sur le nombre prévu dans votre abonnement. **Gérer mes gérants** ouvre la page **Mes gérants**, où vous ouvrez les accès de vos collaborateurs.
- **Dossiers** : le nombre de dossiers du cabinet (archivés compris). **Voir les dossiers** ouvre la page **Dossiers**, où vous créez et retrouvez les entreprises dont vous tenez la comptabilité.

### Points d'attention

:::attention
Votre identité est enregistrée par l'équipe LabFlow. Pour la corriger, contactez-la : la modification s'appliquera aux factures suivantes, jamais à celles déjà émises.
:::$f208a$, 'compta-cabinet', 'd7d853b0bfd1a3caef7966542ba2dc2b'),
($f208b$## 🏢 Cabinet (collaborateur)

Cette page présente le cabinet dont vous êtes collaborateur. Vous l'ouvrez depuis l'accueil, groupe **Mon cabinet**.

### Ce que vous voyez

- **Le cabinet** : son identité (raison sociale, forme juridique, matricule fiscal, adresse).
- **Le titulaire** : son nom, son adresse email et son téléphone.
- **Votre accès** : votre niveau (Consultation, Saisie ou Complet) et la date à laquelle il vous a été ouvert.
- **Les dossiers** : les dossiers du cabinet qui vous sont ouverts, avec leur matricule et leur exercice en cours. Chaque carte ouvre la **fiche du dossier**. Avec le niveau **Complet**, vous pouvez aussi créer des dossiers (bouton **+ Dossier**) et les modifier ; avec les niveaux **Saisie** et **Consultation**, vous les consultez.

### Points d'attention

:::attention
Votre accès est géré par le titulaire du cabinet : pour changer votre niveau ou fermer votre accès, adressez-vous à lui.
:::$f208b$, 'compta-cabinet-membre', 'a3eabaa69ee7889ba93bfcab8d0ff670')
  ) AS f(texte, slug, garde)
 WHERE manuel_sections.slug = f.slug AND manuel_sections.produit = 'compta'
   AND md5(replace(manuel_sections.contenu_defaut, chr(13), '')) = f.garde;

-- Nouvelles fiches : la page « Dossiers » (liste et assistant) et la fiche d'un dossier (leurs boutons « ? »).
WITH fiche (slug, titre, icone, ordre, contenu, mots_cles, ecran) AS (VALUES
  ('compta-dossiers', 'Dossiers', '📁', 1012, $f208c$## 📁 Dossiers

Un dossier est une entreprise dont vous tenez la comptabilité : une entité juridique, avec son identité légale, son régime fiscal et ses exercices. Cette page réunit les dossiers de votre cabinet. Vous la trouvez dans le menu de gauche, entrée **Dossiers**.

### Ce que vous voyez

- **La liste des dossiers** : pour chacun, son nom, son matricule fiscal, sa forme juridique et son exercice en cours. Un dossier dont l'identité est incomplète porte la mention **Identité à compléter**. Un dossier archivé porte la mention **Archivé** et n'apparaît que si vous cochez **Afficher les archivés**.
- **La recherche** : tapez un nom ou un matricule pour filtrer la liste.
- **Qui peut quoi** : le titulaire du cabinet et les gérants de niveau **Complet** créent et modifient des dossiers ; les gérants de niveau **Saisie** ou **Consultation** les consultent. Archiver, désarchiver et supprimer un dossier sont réservés au titulaire.

### Actions pas à pas

1. **Créer un dossier** : cliquez sur **+ Dossier**. L'assistant comporte quatre étapes.
   - **Identité** : raison sociale, forme juridique, matricule fiscal, RNE, adresse, représentant légal. **Lire la patente** (PDF, photo ou code QR) remplit les champs vides ; vous pouvez tout corriger. Seule la raison sociale est obligatoire.
   - **Régime fiscal** : personne morale ou physique, impôt (IS ou IRPP), régime de TVA (réel, forfaitaire ou non assujetti), exportateur total, télédéclaration, date de début d'activité. Les deux premiers sont proposés d'après la forme juridique.
   - **Premier exercice** : l'année civile en cours est proposée ; vous pouvez choisir d'autres dates (la fin doit être le dernier jour d'un mois, douze mois au plus). Les périodes mensuelles sont créées avec l'exercice.
   - **Récapitulatif**, puis **Créer le dossier**.
2. **Ouvrir un dossier** : cliquez sur sa carte ; sa fiche s'ouvre (voir la fiche **Fiche du dossier** de ce manuel).

### Points d'attention

:::attention
Un matricule fiscal déjà porté par un autre dossier du cabinet n'est pas refusé (groupes, franchises) : un avertissement vous le signale.
:::

:::astuce
Le plan de comptes, les journaux, les taxes et les tiers de chaque dossier arrivent à la prochaine étape de LabFlow Compta.
:::$f208c$, 'dossiers, dossier, entreprise, créer un dossier, assistant, patente, matricule, régime fiscal, exercice, archivé, recherche', '/dossiers'),
  ('compta-dossier', 'Fiche du dossier', '🗂️', 1013, $f208d$## 🗂️ Fiche du dossier

Cette page présente un dossier : son identité, son régime fiscal, son exercice en cours et les personnes qui y ont accès. Vous l'ouvrez depuis la page **Dossiers** (titulaire) ou depuis la page **Cabinet** (collaborateur).

### Ce que vous voyez

- **Identité** : raison sociale, nom commercial, forme juridique, matricule fiscal, RNE, adresse, représentant légal. **Modifier** ouvre le formulaire, lecture de la patente comprise.
- **Régime fiscal** : personne, impôt, TVA, exportateur total, télédéclaration, début d'activité. **Modifier** le change.
- **Exercice en cours** : ses dates et ses périodes mensuelles, toutes ouvertes pour l'instant. **Modifier** change ses dates tant qu'aucune écriture n'est enregistrée ; les périodes sont refaites.
- **Accès** : les personnes qui voient ce dossier (titulaire et gérants), avec leur niveau.

### Actions pas à pas

1. **Archiver** (titulaire) : le dossier sort de la liste courante ; rien n'est effacé. **Désarchiver** le remet dans la liste.
2. **Supprimer** (titulaire) : possible seulement pour un dossier sans écriture ; une confirmation est demandée. Le journal du cabinet garde la trace de la suppression.

### Points d'attention

:::attention
Un dossier qui a des écritures ne se supprime jamais : il s'archive. Un dossier archivé ne se modifie pas tant qu'il n'est pas désarchivé.
:::

:::attention
Quand l'abonnement du cabinet attend un paiement, les dossiers restent consultables mais ne se modifient plus.
:::$f208d$, 'dossier, fiche, identité, régime fiscal, exercice, périodes, archiver, désarchiver, supprimer, accès', '/dossiers/')
)
INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif, produit)
SELECT f.slug, f.titre, f.icone, 'LabFlow Compta', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, false, true, 'compta'
  FROM fiche f
ON CONFLICT (slug) DO NOTHING;
