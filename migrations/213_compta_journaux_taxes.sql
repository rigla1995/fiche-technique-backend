-- LabFlow Compta, étape S5b « Les journaux et les codes de taxe » (labflow-reprise/achats-compta/PLAN-S5.md §1, §2, §4,
-- §5 ; réponses du client du 07/10 — « ok pour les 8 » — et du 08/10 — « ok pour les 4 » : TVA collectée sur 436711, les
-- trois sous-comptes que la norme n'a pas créés par défaut ET remplaçables, un code de TVA non récupérable par taux, tout
-- type de journal sauf un seul à-nouveaux). Migration additive : aucun compte, accès ni plan existant ne change.
-- 1) Le paquet Tunisie 2026.1 gagne ses journaux par défaut, ses sous-comptes proposés (créés dans le plan d'un dossier
--    quand un code de taxe copié les vise, origine « ajout », expliqués — NC 01, 3ᵉ partie §3) et ses codes de taxe
--    (src/compta/paquets/tn-nc01.json ; VALUES transcrits par paquets/index.js, test/comptaS5b.test.js vérifie qu'ils
--    disent la même chose). « copie » : tous (tout régime), assujetti (régime réel de TVA), exportateur (exportateur
--    total, en plus), jamais (ajoutable depuis la page Taxes).
CREATE TABLE IF NOT EXISTS compta.ref_journaux (
  id            SERIAL PRIMARY KEY,
  paquet_id     INTEGER NOT NULL REFERENCES compta.ref_paquets(id) ON DELETE CASCADE,
  code          VARCHAR(4) NOT NULL CHECK (code ~ '^[A-Z0-9]{2,4}$'),
  libelle       VARCHAR(255) NOT NULL,
  type          VARCHAR(10) NOT NULL CHECK (type IN ('achats', 'ventes', 'banque', 'caisse', 'od', 'an')),
  compte_numero VARCHAR(10),
  ordre         SMALLINT NOT NULL DEFAULT 0,
  UNIQUE (paquet_id, code)
);
CREATE TABLE IF NOT EXISTS compta.ref_sous_comptes (
  id            SERIAL PRIMARY KEY,
  paquet_id     INTEGER NOT NULL REFERENCES compta.ref_paquets(id) ON DELETE CASCADE,
  numero        VARCHAR(10) NOT NULL CHECK (numero ~ '^[0-9]{2,8}$'),
  libelle       VARCHAR(255) NOT NULL,
  nature        VARCHAR(20) NOT NULL,
  parent_numero VARCHAR(10) NOT NULL,
  explication   VARCHAR(500) NOT NULL,
  UNIQUE (paquet_id, numero)
);
CREATE TABLE IF NOT EXISTS compta.ref_taxes (
  id                  SERIAL PRIMARY KEY,
  paquet_id           INTEGER NOT NULL REFERENCES compta.ref_paquets(id) ON DELETE CASCADE,
  code                VARCHAR(12) NOT NULL CHECK (code ~ '^[A-Z0-9_]{2,12}$'),
  libelle             VARCHAR(255) NOT NULL,
  type                VARCHAR(12) NOT NULL CHECK (type IN ('tva', 'retenue', 'retenue_tva', 'timbre', 'fodec', 'avance', 'autre')),
  taux                NUMERIC(6,3) CHECK (taux IS NULL OR (taux >= 0 AND taux <= 100)),
  montant             NUMERIC(18,3) CHECK (montant IS NULL OR montant >= 0),
  assiette            VARCHAR(5) NOT NULL CHECK (assiette IN ('ht', 'ttc', 'tva', 'fixe')),
  compte_achat_numero VARCHAR(10),
  compte_vente_numero VARCHAR(10),
  compte_immo_numero  VARCHAR(10),
  copie               VARCHAR(12) NOT NULL CHECK (copie IN ('tous', 'assujetti', 'exportateur', 'jamais')),
  code_tej            VARCHAR(20),
  note                VARCHAR(500),
  ordre               SMALLINT NOT NULL DEFAULT 0,
  CHECK ((assiette = 'fixe') = (montant IS NOT NULL)),
  UNIQUE (paquet_id, code)
);

-- 2) Les journaux et les codes de taxe d'un dossier : copie du paquet à l'initialisation (origine « paquet »), puis
--    adaptation (ajouts : origine « ajout »). Le compte d'un journal ou d'un code vit dans le plan du dossier (clé
--    étrangère sans action : le code refuse de désactiver ou de supprimer un compte porté — planComptes.compteUtilise ;
--    la suppression d'un dossier vide emporte tout, CASCADE, la vérification des clés se faisant en fin d'ordre). Un
--    journal ou un code ne se supprime pas : il se désactive (sans écriture). Montants NUMERIC(18,3), taux NUMERIC(6,3),
--    transportés en texte (SPEC-SOCLE §0). Le code TEJ prépare les certificats de retenue (hors S5).
CREATE TABLE IF NOT EXISTS compta.journaux (
  id         SERIAL PRIMARY KEY,
  dossier_id INTEGER NOT NULL REFERENCES compta.dossiers(id) ON DELETE CASCADE,
  code       VARCHAR(4) NOT NULL CHECK (code ~ '^[A-Z0-9]{2,4}$'),
  libelle    VARCHAR(255) NOT NULL,
  type       VARCHAR(10) NOT NULL CHECK (type IN ('achats', 'ventes', 'banque', 'caisse', 'od', 'an')),
  compte_id  INTEGER REFERENCES compta.comptes(id),
  origine    VARCHAR(10) NOT NULL DEFAULT 'paquet' CHECK (origine IN ('paquet', 'ajout')),
  actif      BOOLEAN NOT NULL DEFAULT true,
  cree_par   INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dossier_id, code)
);
CREATE INDEX IF NOT EXISTS idx_compta_journaux_compte ON compta.journaux (compte_id);
CREATE TABLE IF NOT EXISTS compta.taxes (
  id              SERIAL PRIMARY KEY,
  dossier_id      INTEGER NOT NULL REFERENCES compta.dossiers(id) ON DELETE CASCADE,
  code            VARCHAR(12) NOT NULL CHECK (code ~ '^[A-Z0-9_]{2,12}$'),
  libelle         VARCHAR(255) NOT NULL,
  type            VARCHAR(12) NOT NULL CHECK (type IN ('tva', 'retenue', 'retenue_tva', 'timbre', 'fodec', 'avance', 'autre')),
  taux            NUMERIC(6,3) CHECK (taux IS NULL OR (taux >= 0 AND taux <= 100)),
  montant         NUMERIC(18,3) CHECK (montant IS NULL OR montant >= 0),
  assiette        VARCHAR(5) NOT NULL CHECK (assiette IN ('ht', 'ttc', 'tva', 'fixe')),
  compte_achat_id INTEGER REFERENCES compta.comptes(id),
  compte_vente_id INTEGER REFERENCES compta.comptes(id),
  compte_immo_id  INTEGER REFERENCES compta.comptes(id),
  origine         VARCHAR(10) NOT NULL DEFAULT 'paquet' CHECK (origine IN ('paquet', 'ajout')),
  code_tej        VARCHAR(20),
  actif           BOOLEAN NOT NULL DEFAULT true,
  cree_par        INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((assiette = 'fixe') = (montant IS NOT NULL)),
  UNIQUE (dossier_id, code)
);
CREATE INDEX IF NOT EXISTS idx_compta_taxes_achat ON compta.taxes (compte_achat_id);
CREATE INDEX IF NOT EXISTS idx_compta_taxes_vente ON compta.taxes (compte_vente_id);
CREATE INDEX IF NOT EXISTS idx_compta_taxes_immo ON compta.taxes (compte_immo_id);

-- 3) Le paquet Tunisie 2026.1 : journaux, sous-comptes proposés, codes de taxe (idempotent : au 2e passage, rien n'est
--    réinséré).
INSERT INTO compta.ref_journaux (paquet_id, code, libelle, type, compte_numero, ordre)
SELECT p.id, v.code, v.libelle, v.type, v.compte, v.ordre
  FROM compta.ref_paquets p,
       (VALUES
  ('AC', 'Achats', 'achats', NULL, 1),
  ('VT', 'Ventes', 'ventes', NULL, 2),
  ('BQ', 'Banque', 'banque', '5321', 3),
  ('CA', 'Caisse', 'caisse', '5411', 4),
  ('OD', 'Opérations diverses', 'od', NULL, 5),
  ('AN', 'À-nouveaux', 'an', NULL, 6)
       ) AS v(code, libelle, type, compte, ordre)
 WHERE p.pays = 'TN' AND p.version = '2026.1'
ON CONFLICT (paquet_id, code) DO NOTHING;
INSERT INTO compta.ref_sous_comptes (paquet_id, numero, libelle, nature, parent_numero, explication)
SELECT p.id, v.numero, v.libelle, v.nature, v.parent, v.explication
  FROM compta.ref_paquets p,
       (VALUES
  ('4375', 'Droit de timbre collecté', 'etat', '437', 'Ajouté par LabFlow Compta pour le code de taxe TIMBRE : le timbre facturé au client est une dette envers l''État, et la nomenclature NC 01 ne prévoit pas de sous-compte du 437. Remplaçable par un autre compte depuis la page Taxes.'),
  ('4376', 'FODEC collecté', 'etat', '437', 'Ajouté par LabFlow Compta pour le code de taxe FODEC : la taxe professionnelle facturée par un fabricant est une dette envers l''État (sous-compte du 437, non prévu par la nomenclature NC 01). Remplaçable depuis la page Taxes.'),
  ('43665', 'TVA retenue à la source par les clients', 'tva_deductible', '4366', 'Ajouté par LabFlow Compta pour le code de taxe RSTVA25 : la retenue de TVA subie sur les ventes au secteur public s''impute sur la TVA due (sous-compte du 4366, non prévu par la nomenclature NC 01). Remplaçable depuis la page Taxes.')
       ) AS v(numero, libelle, nature, parent, explication)
 WHERE p.pays = 'TN' AND p.version = '2026.1'
ON CONFLICT (paquet_id, numero) DO NOTHING;
INSERT INTO compta.ref_taxes (paquet_id, code, libelle, type, taux, montant, assiette, compte_achat_numero, compte_vente_numero, compte_immo_numero, copie, code_tej, note, ordre)
SELECT p.id, v.code, v.libelle, v.type, v.taux, v.montant, v.assiette, v.achat, v.vente, v.immobilisations, v.copie, v.code_tej, v.note, v.ordre
  FROM compta.ref_paquets p,
       (VALUES
  ('TVA19', 'TVA 19 %', 'tva', 19.000, NULL, 'ht', '43666', '436711', '43662', 'assujetti', NULL, NULL, 1),
  ('TVA13', 'TVA 13 %', 'tva', 13.000, NULL, 'ht', '43666', '436711', '43662', 'assujetti', NULL, NULL, 2),
  ('TVA7', 'TVA 7 %', 'tva', 7.000, NULL, 'ht', '43666', '436711', '43662', 'assujetti', NULL, NULL, 3),
  ('TVA0', 'TVA 0 %', 'tva', 0.000, NULL, 'ht', NULL, NULL, NULL, 'assujetti', NULL, NULL, 4),
  ('TVAEXO', 'Exonéré ou hors champ', 'tva', NULL, NULL, 'ht', NULL, NULL, NULL, 'assujetti', NULL, 'Opération exonérée (tableau A) ou hors du champ de la TVA : pas de TVA, pas de droit à déduction', 5),
  ('TVANDR19', 'TVA 19 % non récupérable', 'tva', 19.000, NULL, 'ht', '6652', NULL, NULL, 'assujetti', NULL, 'TVA dont la déduction est refusée (voitures de tourisme, etc.) : charge 6652', 6),
  ('TVASUSP', 'Achats en suspension de TVA', 'tva', 0.000, NULL, 'ht', NULL, NULL, NULL, 'exportateur', NULL, 'Achat hors TVA sur attestation visée par l''administration (art. 11 du code de la TVA)', 7),
  ('RS_HON10', 'Retenue honoraires, commissions, courtages 10 %', 'retenue', 10.000, NULL, 'ttc', '432', '4341', NULL, 'tous', 'RS2_000001', NULL, 8),
  ('RS_HON3', 'Retenue honoraires 3 % (société à l''IS, personne physique au réel)', 'retenue', 3.000, NULL, 'ttc', '432', '4341', NULL, 'tous', 'RS2_000002', NULL, 9),
  ('RS_LOY10', 'Retenue loyers 10 %', 'retenue', 10.000, NULL, 'ttc', '432', '4341', NULL, 'tous', 'RS1_000002', NULL, 10),
  ('RS_LOY5', 'Retenue loyers d''hôtels 5 %', 'retenue', 5.000, NULL, 'ttc', '432', '4341', NULL, 'tous', 'RS1_000001', NULL, 11),
  ('RS_MAR15', 'Retenue achats de 1 000 D et plus 1,5 %', 'retenue', 1.500, NULL, 'ttc', '432', '4341', NULL, 'tous', 'RS7_000001', NULL, 12),
  ('RS_MAR1', 'Retenue achats de 1 000 D et plus 1 % (fournisseur à l''IS 20 %)', 'retenue', 1.000, NULL, 'ttc', '432', '4341', NULL, 'tous', 'RS7_000002', NULL, 13),
  ('RS_MAR05', 'Retenue achats de 1 000 D et plus 0,5 % (IS 10 %, déduction des 2/3)', 'retenue', 0.500, NULL, 'ttc', '432', '4341', NULL, 'tous', 'RS7_000003', NULL, 14),
  ('RS_NR15', 'Retenue non-résidents 15 % (ou taux de la convention)', 'retenue', 15.000, NULL, 'ht', '432', NULL, NULL, 'tous', 'RS9_000001', NULL, 15),
  ('RSTVA100', 'Retenue de TVA sur prestataire non résident (100 % de la TVA)', 'retenue_tva', 100.000, NULL, 'tva', '432', NULL, NULL, 'tous', 'RSTVA100', NULL, 16),
  ('RSTVA25', 'Retenue de TVA subie du secteur public (25 % de la TVA)', 'retenue_tva', 25.000, NULL, 'tva', NULL, '43665', NULL, 'tous', 'RSTVA25', 'Subie seulement : retenue par l''État et les établissements publics sur les paiements de 1 000 D TTC et plus', 17),
  ('TIMBRE', 'Droit de timbre', 'timbre', NULL, 1.000, 'fixe', '6654', '4375', NULL, 'tous', NULL, NULL, 18),
  ('FODEC', 'FODEC 1 %', 'fodec', 1.000, NULL, 'ht', '6651', '4376', NULL, 'tous', NULL, 'Taxe professionnelle des fabricants des produits listés : 1 % du chiffre d''affaires hors TVA', 19),
  ('AV_FORF1', 'Avance 1 % sur ventes aux forfaitaires', 'avance', 1.000, NULL, 'ttc', '4341', '432', NULL, 'tous', NULL, 'Art. 51 quater : facturée par les industriels et grossistes à leurs clients au régime forfaitaire', 20),
  ('AV_ALC5', 'Avance 5 % sur vins, bières et alcools', 'avance', 5.000, NULL, 'ttc', '4341', '432', NULL, 'tous', NULL, 'Art. 51 septies : facturée par les fabricants, embouteilleurs et conditionneurs', 21),
  ('TVANDR13', 'TVA 13 % non récupérable', 'tva', 13.000, NULL, 'ht', '6652', NULL, NULL, 'jamais', NULL, NULL, 22),
  ('TVANDR7', 'TVA 7 % non récupérable', 'tva', 7.000, NULL, 'ht', '6652', NULL, NULL, 'jamais', NULL, NULL, 23),
  ('RS_ART5', 'Retenue artistes, créateurs et droits d''auteur 5 %', 'retenue', 5.000, NULL, 'ttc', '432', '4341', NULL, 'jamais', 'RS2_000004', NULL, 24),
  ('RS_JET20', 'Retenue jetons de présence 20 %', 'retenue', 20.000, NULL, 'ht', '432', NULL, NULL, 'jamais', 'RS8_000001', NULL, 25),
  ('RS_INT20', 'Retenue intérêts et revenus de capitaux mobiliers 20 %', 'retenue', 20.000, NULL, 'ht', '432', '4341', NULL, 'jamais', 'RS3_000001', NULL, 26),
  ('RS_DIV10', 'Retenue dividendes 10 %', 'retenue', 10.000, NULL, 'ht', '432', NULL, NULL, 'jamais', 'RS5_000001', NULL, 27),
  ('RS_NR25', 'Retenue non-résidents à régime fiscal privilégié 25 %', 'retenue', 25.000, NULL, 'ht', '432', NULL, NULL, 'jamais', 'RS9_000003', NULL, 28),
  ('RS_LIV3', 'Retenue 3 % des prestataires de livraison (ventes en ligne sans carte fiscale)', 'retenue', 3.000, NULL, 'ttc', '432', '4341', NULL, 'jamais', NULL, NULL, 29),
  ('TIMBRE15', 'Droit de timbre 1,500 D (grandes surfaces, facture de 50 à 100 D)', 'timbre', NULL, 1.500, 'fixe', '6654', '4375', NULL, 'jamais', NULL, NULL, 30),
  ('TIMBRE2', 'Droit de timbre 2,000 D (grandes surfaces, facture de plus de 100 D)', 'timbre', NULL, 2.000, 'fixe', '6654', '4375', NULL, 'jamais', NULL, NULL, 31)
       ) AS v(code, libelle, type, taux, montant, assiette, achat, vente, immobilisations, copie, code_tej, note, ordre)
 WHERE p.pays = 'TN' AND p.version = '2026.1'
ON CONFLICT (paquet_id, code) DO NOTHING;

-- 4) Les dossiers déjà créés (S4 et S5a, prod comprise) reçoivent, comme un dossier neuf : leurs journaux (compte de
--    contrepartie résolu par numéro parmi les comptes actifs de leur plan), les sous-comptes proposés que vise un code copié (selon leur régime,
--    actifs si leur parent l'est), puis leurs codes de taxe ; journal (D16). Idempotent : un dossier qui a déjà un journal
--    (ou un code) est laissé tel quel.
WITH cibles AS (
  SELECT d.id, d.espace_id, d.nom, d.paquet_id
    FROM compta.dossiers d
   WHERE d.paquet_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM compta.journaux j WHERE j.dossier_id = d.id)
), inseres AS (
  INSERT INTO compta.journaux (dossier_id, code, libelle, type, compte_id, origine)
  SELECT c.id, r.code, r.libelle, r.type,
         (SELECT k.id FROM compta.comptes k WHERE k.dossier_id = c.id AND k.numero = r.compte_numero AND k.actif), 'paquet'
    FROM cibles c
    JOIN compta.ref_journaux r ON r.paquet_id = c.paquet_id
   ORDER BY c.id, r.ordre
  RETURNING dossier_id
)
INSERT INTO compta.evenements (espace_id, auteur_id, type, details)
SELECT c.espace_id, NULL, 'journaux_initialises',
       jsonb_build_object('dossier', c.id, 'nom', c.nom, 'journaux', (SELECT COUNT(*) FROM compta.ref_journaux r WHERE r.paquet_id = c.paquet_id), 'migration', 213)
  FROM cibles c;
WITH cibles AS (
  SELECT d.id, d.espace_id, d.paquet_id, d.tva, d.exportateur_total
    FROM compta.dossiers d
   WHERE d.paquet_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM compta.taxes t WHERE t.dossier_id = d.id)
), vises AS (
  SELECT DISTINCT c.id AS dossier_id, c.espace_id, s.numero, s.libelle, s.nature, s.parent_numero, s.explication
    FROM cibles c
    JOIN compta.ref_taxes r ON r.paquet_id = c.paquet_id AND (r.copie = 'tous' OR (r.copie = 'assujetti' AND c.tva = 'reel') OR (r.copie = 'exportateur' AND c.exportateur_total))
    JOIN compta.ref_sous_comptes s ON s.paquet_id = c.paquet_id AND s.numero IN (r.compte_achat_numero, r.compte_vente_numero, r.compte_immo_numero)
   WHERE NOT EXISTS (SELECT 1 FROM compta.comptes k WHERE k.dossier_id = c.id AND k.numero = s.numero)
), inseres AS (
  INSERT INTO compta.comptes (dossier_id, numero, libelle, classe, parent_id, nature, origine, explication, actif)
  SELECT v.dossier_id, v.numero, v.libelle, LEFT(v.numero, 1)::smallint, k.id, v.nature, 'ajout', v.explication, COALESCE(k.actif, true)
    FROM vises v
    LEFT JOIN compta.comptes k ON k.dossier_id = v.dossier_id AND k.numero = v.parent_numero
  RETURNING id, dossier_id, numero, libelle, nature
)
INSERT INTO compta.evenements (espace_id, auteur_id, type, details)
SELECT v.espace_id, NULL, 'compte_ajoute',
       jsonb_build_object('dossier', i.dossier_id, 'compte', i.id, 'numero', i.numero, 'libelle', i.libelle, 'parent', v.parent_numero, 'nature', i.nature,
                          'explication', v.explication, 'propose', true, 'migration', 213)
  FROM inseres i
  JOIN vises v ON v.dossier_id = i.dossier_id AND v.numero = i.numero;
WITH cibles AS (
  SELECT d.id, d.espace_id, d.nom, d.paquet_id, d.tva, d.exportateur_total
    FROM compta.dossiers d
   WHERE d.paquet_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM compta.taxes t WHERE t.dossier_id = d.id)
), inseres AS (
  INSERT INTO compta.taxes (dossier_id, code, libelle, type, taux, montant, assiette, compte_achat_id, compte_vente_id, compte_immo_id, origine, code_tej)
  SELECT c.id, r.code, r.libelle, r.type, r.taux, r.montant, r.assiette,
         (SELECT k.id FROM compta.comptes k WHERE k.dossier_id = c.id AND k.numero = r.compte_achat_numero),
         (SELECT k.id FROM compta.comptes k WHERE k.dossier_id = c.id AND k.numero = r.compte_vente_numero),
         (SELECT k.id FROM compta.comptes k WHERE k.dossier_id = c.id AND k.numero = r.compte_immo_numero),
         'paquet', r.code_tej
    FROM cibles c
    JOIN compta.ref_taxes r ON r.paquet_id = c.paquet_id AND (r.copie = 'tous' OR (r.copie = 'assujetti' AND c.tva = 'reel') OR (r.copie = 'exportateur' AND c.exportateur_total))
   ORDER BY c.id, r.ordre
  RETURNING dossier_id
)
INSERT INTO compta.evenements (espace_id, auteur_id, type, details)
SELECT c.espace_id, NULL, 'taxes_initialisees',
       jsonb_build_object('dossier', c.id, 'nom', c.nom, 'regime', jsonb_build_object('tva', c.tva, 'exportateurTotal', c.exportateur_total),
                          'codes', (SELECT COUNT(*) FROM compta.ref_taxes r WHERE r.paquet_id = c.paquet_id AND (r.copie = 'tous' OR (r.copie = 'assujetti' AND c.tva = 'reel') OR (r.copie = 'exportateur' AND c.exportateur_total))), 'migration', 213)
  FROM cibles c;

-- 5) Manuel de LabFlow Compta (vocabulaire comptable fixe, jamais balisé). Fiches existantes : texte remplacé seulement
--    s'il est encore celui de la migration 212 (« Fiche du dossier », « Dossiers », « Plan de comptes » ; garde md5 du
--    texte par défaut, sans \r) ; le texte servi suit seulement s'il n'a pas été retouché dans l'admin. Idempotent : au
--    2e passage, la garde ne correspond plus.
UPDATE manuel_sections
   SET contenu = CASE WHEN contenu = contenu_defaut THEN f.texte ELSE contenu END,
       contenu_defaut = f.texte
  FROM (VALUES ($f213a$## 🗂️ Fiche du dossier

Cette page présente un dossier : son identité, son régime fiscal, son exercice en cours, sa configuration et les personnes qui y ont accès. Vous l'ouvrez depuis la page **Dossiers** (cabinet), **Cabinet** (collaborateur d'un cabinet), **Ma comptabilité** (client LabFlow) ou **Comptabilité de …** (comptable d'un client).

### Ce que vous voyez

- **Identité** : raison sociale, nom commercial, forme juridique, matricule fiscal, RNE, adresse, représentant légal. **Modifier** ouvre le formulaire, lecture de la patente comprise. Le dossier **« Mon entreprise »** d'un client LabFlow porte la mention **LabFlow** : son identité a été copiée de son compte LabFlow le jour de sa création.
- **Régime fiscal** : personne, impôt, TVA, exportateur total, télédéclaration, début d'activité. **Modifier** le change.
- **Exercice en cours** : ses dates et ses périodes mensuelles, toutes ouvertes pour l'instant. **Modifier** change ses dates tant qu'aucune écriture n'est enregistrée ; les périodes sont refaites.
- **Configuration** : le **plan de comptes** du dossier (nombre de comptes actifs), ses **journaux** et ses **codes de taxe** (nombre de chacun) ; **Ouvrir** mène aux pages **Plan de comptes**, **Journaux** et **Taxes** (voir leurs fiches dans ce manuel). Les tiers arrivent à l'étape suivante.
- **Accès** : les personnes qui voient ce dossier (titulaire et gérants), avec leur niveau.

### Actions pas à pas

1. **Archiver** (titulaire) : le dossier sort de la liste courante ; rien n'est effacé. **Désarchiver** le remet dans la liste.
2. **Supprimer** (titulaire) : possible seulement pour un dossier sans écriture ; une confirmation est demandée. Le journal de la comptabilité garde la trace de la suppression.
3. **Reprendre l'identité de LabFlow** (dossier « Mon entreprise » d'un client LabFlow) : recopie dans le dossier les champs que le compte LabFlow connaît (un champ vide dans LabFlow n'efface rien) ; utile après une correction dans LabFlow, page **Mon entreprise**. Dans l'autre sens, rien ne change : modifier le dossier ne touche pas au compte LabFlow. Ce dossier ne se supprime pas : il s'archive.

### Points d'attention

:::attention
Un dossier qui a des écritures ne se supprime jamais : il s'archive. Un dossier archivé ne se modifie pas tant qu'il n'est pas désarchivé : sa configuration non plus.
:::

:::attention
Quand l'abonnement de la comptabilité attend un paiement, les dossiers restent consultables mais ne se modifient plus.
:::$f213a$, 'compta-dossier', '28e758c0f24458277da3bd3ce885040a'),
($f213b$## 📁 Dossiers

Un dossier est une entreprise dont vous tenez la comptabilité : une entité juridique, avec son identité légale, son régime fiscal et ses exercices. Cette page réunit les dossiers de votre cabinet. Vous la trouvez dans le menu de gauche, entrée **Dossiers**.

### Ce que vous voyez

- **La liste des dossiers** : pour chacun, son nom, son matricule fiscal, sa forme juridique et son exercice en cours. Un dossier dont l'identité est incomplète porte la mention **Identité à compléter**. Un dossier archivé porte la mention **Archivé** et n'apparaît que si vous cochez **Afficher les archivés**. La liste s'affiche par pages de 25 : **Afficher plus** charge les suivants.
- **La recherche** : tapez un nom, une raison sociale, un nom commercial ou un matricule ; la recherche porte sur tous les dossiers du cabinet, pas seulement sur ceux affichés.
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
Chaque dossier reçoit à sa création le plan de comptes de la norme NC 01, six journaux et les codes de taxe de son régime (TVA, retenues à la source, droit de timbre…), à adapter depuis sa fiche (voir les fiches **Plan de comptes**, **Journaux** et **Taxes** de ce manuel) ; les tiers arrivent à l'étape suivante.
:::$f213b$, 'compta-dossiers', 'e89e94882922ed50b00f76aff1c7dcbf'),
($f213c$## 📑 Plan de comptes

Le plan de comptes d'un dossier est la liste des comptes sur lesquels ses écritures seront passées. À la création du dossier, LabFlow Compta y copie la **nomenclature de la norme comptable générale NC 01** (plus de 600 comptes, classes 1 à 7) ; vous l'adaptez ensuite à l'entreprise. Vous ouvrez cette page depuis la fiche du dossier, carte **Configuration**, bouton **Ouvrir**.

### Ce que vous voyez

- **Les sept classes** (1 Capitaux propres et passifs non courants … 7 Produits), chacune dépliable ; sous chaque classe, l'arbre des comptes avec leur numéro, leur libellé et leur nature (fournisseurs, clients, banque, caisse, TVA collectée, TVA déductible…).
- **Les mentions** : **Ajouté** pour un compte créé par vous, **Renommé** quand le libellé n'est plus celui de la norme, **Désactivé** pour un compte mis de côté (affiché seulement si vous cochez **Afficher les désactivés**).
- **Trois comptes ajoutés par LabFlow Compta** avec les codes de taxe, expliqués au survol : 4375 Droit de timbre collecté, 4376 FODEC collecté, 43665 TVA retenue à la source. La norme ne les prévoit pas ; si votre cabinet code autrement, changez le compte des codes TIMBRE, FODEC et RSTVA25 (page **Taxes**), puis supprimez-les.
- **La recherche** : tapez un numéro ou un mot du libellé ; la liste des comptes qui correspondent (avec leur classe) remplace l'arbre, avec les mêmes actions ; **Effacer la recherche** rend l'arbre.
- **Qui peut quoi** : le titulaire et les gérants de niveau **Complet** modifient le plan ; les niveaux **Saisie** et **Consultation** le consultent.

### Actions pas à pas

1. **Subdiviser un compte** : cliquez sur **Subdiviser** sur le compte parent (par exemple 532 Banques → 5321 Comptes en dinars → 53211 « BIAT »). Le numéro proposé prolonge celui du parent ; vous pouvez le changer tant qu'il commence par le numéro du parent (2 à 8 chiffres). Donnez un libellé, gardez ou changez la nature, et expliquez l'ajout si vous le souhaitez (la norme le demande, 3ᵉ partie §3).
2. **Renommer** : changez le libellé d'un compte ; **Rétablir** remet celui de la norme.
3. **Désactiver** : un compte dont vous n'avez pas l'usage sort de la saisie, sans être effacé ; ses sous-comptes doivent être désactivés avant lui. **Réactiver** le remet (son compte parent doit être actif).
4. **Supprimer** : seulement un compte que vous avez ajouté, sans sous-compte ni écriture ; un compte de la norme ne se supprime jamais, il se désactive.
5. **Exporter (Excel)** : le plan complet, à la charte LabFlow.

### Points d'attention

:::attention
Un compte qui a des écritures, ou porté par un journal ou un code de taxe, ne se désactive pas et ne se supprime pas (changez d'abord le compte du journal ou du code). Aucune écriture n'existe encore : la saisie arrivera après la configuration du dossier (tiers à l'étape suivante).
:::

:::astuce
Seuls les comptes sans sous-compte actif (les « feuilles » de l'arbre) recevront des écritures : subdivisez les comptes de banque (un par compte bancaire) et de caisse, puis rattachez chaque journal de banque ou de caisse à son compte (page **Journaux**).
:::$f213c$, 'compta-plan-comptes', '89c2db278a3ab49ac977b974ef463178')
  ) AS f(texte, slug, garde)
 WHERE manuel_sections.slug = f.slug AND manuel_sections.produit = 'compta'
   AND md5(replace(manuel_sections.contenu_defaut, chr(13), '')) = f.garde;

-- Nouvelles fiches : les pages « Journaux » et « Taxes » d'un dossier (leur bouton « ? »).
WITH fiche (slug, titre, icone, ordre, contenu, mots_cles, ecran) AS (VALUES
  ('compta-journaux', 'Journaux', '📒', 1061, $f213d$## 📒 Journaux

Un journal est un registre où les écritures s'enregistrent par nature d'opération : achats, ventes, banque, caisse, opérations diverses, à-nouveaux. Chaque dossier reçoit six journaux à sa création ; vous en ajoutez autant que nécessaire, par exemple un journal par compte bancaire. Vous ouvrez cette page depuis la fiche du dossier, carte **Configuration**, ligne **Journaux**, bouton **Ouvrir**.

### Ce que vous voyez

- **La liste des journaux** : code, libellé, type, compte de contrepartie (banque et caisse), mention **Ajouté** pour un journal créé par vous, **Désactivé** pour un journal mis de côté (affiché si vous cochez **Afficher les désactivés**).
- **Les six journaux par défaut** : AC Achats, VT Ventes, BQ Banque (compte 5321), CA Caisse (compte 5411), OD Opérations diverses, AN À-nouveaux.
- **Le compte de contrepartie** d'un journal de banque ou de caisse : un compte de nature banque ou caisse du plan. Quand ce compte a des sous-comptes actifs (par exemple 5321 après que vous l'avez subdivisé par banque), la mention **Compte à préciser** vous invite à choisir le sous-compte.
- **Qui peut quoi** : le titulaire et les gérants de niveau **Complet** modifient les journaux ; les niveaux **Saisie** et **Consultation** les consultent.

### Actions pas à pas

1. **Ajouter un journal de banque** : subdivisez d'abord le compte 5321 dans le **Plan de comptes** (un sous-compte par banque : 53211 « BIAT »…), puis cliquez sur **+ Journal** : type **Banque**, code (2 à 4 lettres ou chiffres, par exemple BQ2), libellé, compte de contrepartie choisi dans la liste. Même chose pour une caisse (compte 5411 ou un sous-compte).
2. **Ajouter un autre journal** (achats, ventes, opérations diverses) : **+ Journal**, le type voulu, code et libellé ; pas de compte de contrepartie. Il n'y a qu'un journal d'à-nouveaux par dossier.
3. **Modifier** : le libellé, et le compte de contrepartie d'un journal de banque ou de caisse (tant que le journal n'a pas d'écriture). Le code ne change pas : désactivez le journal et créez-en un autre.
4. **Désactiver** : un journal dont vous n'avez pas l'usage sort de la saisie, sans être effacé ; **Réactiver** le remet (son compte doit être actif).

### Points d'attention

:::attention
Un journal qui a des écritures ne se désactive pas et son compte ne change plus ; un journal ne se supprime jamais. Aucune écriture n'existe encore : la saisie arrivera après la configuration du dossier.
:::

:::astuce
Un compte porté par un journal ne se désactive pas et ne se supprime pas dans le plan : changez d'abord le compte du journal.
:::$f213d$, 'journaux, journal, achats, ventes, banque, caisse, opérations diverses, à-nouveaux, compte de contrepartie, code, ajouter, modifier, désactiver, réactiver', '/journaux'),
  ('compta-taxes', 'Taxes', '🧾', 1062, $f213e$## 🧾 Taxes

Les codes de taxe sont les taxes qu'une ligne d'écriture pourra porter : TVA par taux, retenues à la source, droit de timbre, FODEC, avances. Chaque code connaît son taux (ou son montant), son assiette et ses comptes : à la saisie, choisir un code suffira pour passer la taxe sur le bon compte. Chaque dossier reçoit à sa création les codes de son régime de TVA. Vous ouvrez cette page depuis la fiche du dossier, carte **Configuration**, ligne **Taxes**, bouton **Ouvrir**.

### Ce que vous voyez

- **La liste des codes par type** (TVA, retenues à la source, retenues de TVA, droit de timbre, FODEC, avances) : code, libellé, taux ou montant, assiette, compte à l'achat, compte à la vente, compte sur immobilisations, mention **Ajouté** pour un code personnalisé, **Désactivé** pour un code mis de côté (affiché si vous cochez **Afficher les désactivés**).
- **Les codes selon le régime du dossier** : au régime réel, TVA 19 %, 13 %, 7 %, 0 %, exonéré, TVA non récupérable, puis les retenues, le timbre, le FODEC et les avances ; un exportateur total reçoit en plus **Achats en suspension de TVA** ; un dossier forfaitaire ou non assujetti ne reçoit aucun code de TVA (la TVA reste dans le coût), seulement les retenues, le timbre, le FODEC et les avances.
- **Les comptes** : TVA déductible 43666 (43662 sur immobilisations), TVA collectée 436711, retenues opérées 432, retenues subies 4341, timbre 6654 à l'achat. Trois comptes que la norme ne prévoit pas sont ajoutés au plan avec leur explication : 4375 Droit de timbre collecté, 4376 FODEC collecté, 43665 TVA retenue à la source ; remplacez-les si votre cabinet code autrement.
- **Compte à préciser** : un code dont le compte a des sous-comptes actifs ou est désactivé porte cette mention ; choisissez un autre compte (**Modifier**) ou rendez-le imputable dans le plan.
- **Qui peut quoi** : le titulaire et les gérants de niveau **Complet** modifient les codes ; les niveaux **Saisie** et **Consultation** les consultent.

### Actions pas à pas

1. **Ajouter depuis le paquet** : la liste des codes du paquet Tunisie que le dossier n'a pas encore (TVA non récupérable 13 % et 7 %, retenues sur artistes, jetons de présence, intérêts, dividendes, non-résidents à régime privilégié, livraison en ligne, timbre des grandes surfaces, suspension de TVA) ; un clic le copie avec ses comptes. Un dossier dont le régime a changé retrouve ici les codes qui lui manquent.
2. **Ajouter un code personnalisé** : code (2 à 12 lettres, chiffres ou _), libellé, type, taux ou montant fixe, assiette, comptes.
3. **Modifier** : le libellé et les comptes de tout code ; le type, le taux, le montant et l'assiette d'un code personnalisé seulement, tant qu'il n'a pas d'écriture. Un code du paquet garde les siens : un taux qui change est un nouveau code, apporté par une nouvelle version du paquet.
4. **Désactiver** / **Réactiver** : un code mis de côté sort de la saisie, sans être effacé ; un code ne se supprime jamais.

### Points d'attention

:::attention
Les retenues à la source se calculent sur le montant TTC hors timbre, et le seuil de 1 000 D des retenues sur achats s'apprécie par paiement : ces règles s'appliqueront à la saisie. Le taux de la retenue sur achats (1,5 %, 1 % ou 0,5 %) dépend du régime du fournisseur : le code par défaut de chaque fournisseur se réglera dans sa fiche (tiers, étape suivante).
:::

:::astuce
Depuis le 1ᵉʳ janvier 2026, les certificats de retenue passent par la plateforme TEJ : chaque code de retenue porte déjà son code d'opération TEJ (quand il existe), pour les produire à l'étape « Taxes et déclarations ».
:::$f213e$, 'taxes, codes de taxe, TVA, 19, 13, 7, exonéré, suspension, non récupérable, retenue à la source, retenue de TVA, droit de timbre, FODEC, avance, assiette, taux, montant, compte, paquet, TEJ, régime', '/taxes')
)
INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif, produit)
SELECT f.slug, f.titre, f.icone, 'LabFlow Compta', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, false, true, 'compta'
  FROM fiche f
ON CONFLICT (slug) DO NOTHING;
