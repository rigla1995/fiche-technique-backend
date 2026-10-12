-- 225 — Factures fournisseur, étape F3 : les lignes lues et la correspondance apprise
-- (labflow-reprise/achats-compta/PLAN-FACTURES.md §1, §2, §4).
--
-- factures : une facture LUE puis VALIDÉE (fenêtre « Vérifier la facture ») porte `validee_le` / `validee_par` ; elle ne
--   se modifie plus et se supprime en entier (réponse 4 et question 14 du client). Ses montants sont ceux de ses lignes
--   validées ; `montant_fodec` et `remise_globale` gardent ce que la facture imprime au pied (répartis au prorata dans
--   le coût des articles ; repris par le pont vers la comptabilité, étape F4).
-- factures_lignes : les lignes de la facture telles que validées (désignation, réf., quantité, unité, prix, remise, TVA,
--   montant net exact), chacune rattachée à un article (avec la conversion « 1 unité de la facture = N unités de stock »
--   et la ligne de stock créée) ou marquée HORS STOCK (transport, livraison, consigne, service, autre).
-- correspondances : ce que LabFlow apprend à la validation, par compte et par fournisseur — la référence produit du
--   fournisseur (sinon sa désignation normalisée) → l'article et sa conversion, ou la nature hors stock. La dernière
--   décision l'emporte ; la page « Correspondances » corrige ou oublie.
-- factures_journal : action « facture_validee » en plus.
--
-- Additive et idempotente ; aucune donnée existante n'est modifiée.

ALTER TABLE factures ADD COLUMN IF NOT EXISTS validee_le     TIMESTAMPTZ;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS validee_par    INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;
ALTER TABLE factures ADD COLUMN IF NOT EXISTS montant_fodec  NUMERIC(12,3);
ALTER TABLE factures ADD COLUMN IF NOT EXISTS remise_globale NUMERIC(12,3);

-- Une facture validée par fournisseur, par numéro (majuscules et espaces ignorés) et par année : la base refuse le
-- doublon même si deux validations arrivent ensemble ; un fournisseur qui repart à « 0001 » en janvier n'est pas bloqué.
CREATE UNIQUE INDEX IF NOT EXISTS ux_factures_validees_numero
  ON factures (client_id, fournisseur_id, UPPER(REGEXP_REPLACE(ref_facture, '\s', '', 'g')), (EXTRACT(YEAR FROM date_facture)))
  WHERE validee_le IS NOT NULL;

CREATE TABLE IF NOT EXISTS factures_lignes (
  id                 SERIAL PRIMARY KEY,
  facture_id         INTEGER NOT NULL REFERENCES factures(id) ON DELETE CASCADE,
  client_id          INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  rang               SMALLINT NOT NULL CHECK (rang BETWEEN 1 AND 300),
  designation        VARCHAR(300) NOT NULL,
  reference          VARCHAR(60),
  quantite           NUMERIC(14,3) NOT NULL CHECK (quantite > 0),

  unite              VARCHAR(30),
  prix_unitaire      NUMERIC(14,3),
  remise             NUMERIC(6,3) NOT NULL DEFAULT 0 CHECK (remise >= 0 AND remise <= 100),
  taux_tva           NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (taux_tva >= 0 AND taux_tva <= 100),
  -- négatif seulement pour une ligne hors stock (déconsigne, retour d'emballages)
  montant_ht         NUMERIC(14,3) NOT NULL CHECK (montant_ht >= 0 OR nature_hors_stock IS NOT NULL),
  article_id         INTEGER REFERENCES articles(id) ON DELETE SET NULL,
  nature_hors_stock  VARCHAR(20) CHECK (nature_hors_stock IN ('transport', 'livraison', 'consigne', 'service', 'autre')),
  conversion         NUMERIC(14,6) CHECK (conversion > 0),
  quantite_stock     NUMERIC(14,3),
  prix_stock         NUMERIC(14,3),
  stock_entreprise_id INTEGER REFERENCES stock_entreprise_daily(id) ON DELETE SET NULL,
  stock_labo_id      INTEGER REFERENCES stock_labo_daily(id) ON DELETE SET NULL,
  UNIQUE (facture_id, rang)
);
CREATE INDEX IF NOT EXISTS idx_factures_lignes_facture ON factures_lignes (facture_id, rang);
CREATE INDEX IF NOT EXISTS idx_factures_lignes_article ON factures_lignes (article_id) WHERE article_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_factures_lignes_stock_e ON factures_lignes (stock_entreprise_id) WHERE stock_entreprise_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_factures_lignes_stock_l ON factures_lignes (stock_labo_id) WHERE stock_labo_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS correspondances (
  id                SERIAL PRIMARY KEY,
  client_id         INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  fournisseur_id    INTEGER NOT NULL REFERENCES fournisseurs(id) ON DELETE CASCADE,
  cle               VARCHAR(200) NOT NULL,
  designation       VARCHAR(300) NOT NULL,
  reference         VARCHAR(60),
  unite_facture     VARCHAR(30),
  article_id        INTEGER REFERENCES articles(id) ON DELETE CASCADE,
  nature_hors_stock VARCHAR(20) CHECK (nature_hors_stock IN ('transport', 'livraison', 'consigne', 'service', 'autre')),
  conversion        NUMERIC(14,6) NOT NULL DEFAULT 1 CHECK (conversion > 0),
  emplois           INTEGER NOT NULL DEFAULT 1 CHECK (emplois >= 0),
  derniere_fois     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  auteur_id         INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  cree_le           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((article_id IS NULL) <> (nature_hors_stock IS NULL)),
  UNIQUE (client_id, fournisseur_id, cle)
);
CREATE INDEX IF NOT EXISTS idx_correspondances_fournisseur ON correspondances (fournisseur_id);
CREATE INDEX IF NOT EXISTS idx_correspondances_article ON correspondances (article_id) WHERE article_id IS NOT NULL;

-- Journal : « facture_validee » en plus des actions de l'étape F1.
DO $j225$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'factures_journal_action_check') THEN
    ALTER TABLE factures_journal DROP CONSTRAINT factures_journal_action_check;
  END IF;
  ALTER TABLE factures_journal ADD CONSTRAINT factures_journal_action_check
    CHECK (action IN ('facture_creee', 'lignes_ajoutees', 'piece_jointe', 'piece_remplacee', 'piece_supprimee',
                      'facture_supprimee', 'facture_validee'));
END
$j225$;
