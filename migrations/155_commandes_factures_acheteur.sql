-- 155 — Module Acheteurs (lot 2) : commandes + factures.
-- Les lignes des commandes VALIDÉES sont une TABLE DE FLUX soustraite dans les
-- calculs de stock labo (comme labo_transfers) : AUCUNE écriture négative dans
-- stock_labo_daily / stock_labo_pt_daily (évite les collisions avec les matchers
-- de miroirs de transfert et les filtres PMP). Annuler une commande validée la
-- sort mécaniquement du stock (les CTE ne comptent que statut='validee').

CREATE TABLE IF NOT EXISTS commandes_acheteur (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id        INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  acheteur_id      INTEGER NOT NULL REFERENCES acheteurs(id) ON DELETE RESTRICT,
  labo_id          INTEGER REFERENCES labos(id),
  statut           VARCHAR(12) NOT NULL DEFAULT 'en_attente'
                   CHECK (statut IN ('en_attente', 'validee', 'annulee')),
  source           VARCHAR(10) NOT NULL DEFAULT 'client' CHECK (source IN ('client', 'portail')),
  remise_pct       NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (remise_pct >= 0 AND remise_pct <= 100),
  date_commande    DATE NOT NULL DEFAULT CURRENT_DATE,
  notes            TEXT,
  motif_annulation TEXT,
  traite_le        TIMESTAMPTZ,
  traite_par       INTEGER REFERENCES utilisateurs(id),
  created_by       INTEGER REFERENCES utilisateurs(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commandes_acheteur_client ON commandes_acheteur(client_id, statut, date_commande);
CREATE INDEX IF NOT EXISTS idx_commandes_acheteur_acheteur ON commandes_acheteur(acheteur_id);
-- Pour les CTE de stock (commandes validées d'un labo)
CREATE INDEX IF NOT EXISTS idx_commandes_acheteur_labo ON commandes_acheteur(labo_id, statut);

CREATE TABLE IF NOT EXISTS commande_acheteur_lignes (
  id                SERIAL PRIMARY KEY,
  commande_id       UUID NOT NULL REFERENCES commandes_acheteur(id) ON DELETE CASCADE,
  article_type      VARCHAR(12) NOT NULL CHECK (article_type IN ('ingredient', 'produit')),
  article_id        INTEGER NOT NULL,
  designation       VARCHAR(200) NOT NULL,
  mode              VARCHAR(6) NOT NULL DEFAULT 'unite' CHECK (mode IN ('unite', 'lot')),
  quantite          NUMERIC(10,3) NOT NULL CHECK (quantite > 0),
  taille_lot        NUMERIC(10,3) CHECK (taille_lot IS NULL OR taille_lot > 0),
  quantite_unites   NUMERIC(12,3) NOT NULL CHECK (quantite_unites > 0),
  prix_ttc          NUMERIC(10,3) NOT NULL CHECK (prix_ttc >= 0),
  taux_tva          NUMERIC(5,2) NOT NULL DEFAULT 0,
  cout_unitaire_ttc NUMERIC(10,3),
  CHECK ((mode = 'lot') = (taille_lot IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_cal_commande ON commande_acheteur_lignes(commande_id);
CREATE INDEX IF NOT EXISTS idx_cal_article ON commande_acheteur_lignes(article_type, article_id);

-- Facture fiscale : 1 par commande validée. Numérotation FA-YYYY-NNNN par client
-- (séquence applicative sous advisory lock). L'annulation d'une commande SUPPRIME
-- sa facture (choix v1 assumé : trou de numérotation possible, pas d'avoir).
CREATE TABLE IF NOT EXISTS factures_acheteur (
  id             SERIAL PRIMARY KEY,
  client_id      INTEGER NOT NULL REFERENCES utilisateurs(id) ON DELETE CASCADE,
  acheteur_id    INTEGER NOT NULL REFERENCES acheteurs(id) ON DELETE RESTRICT,
  commande_id    UUID NOT NULL UNIQUE REFERENCES commandes_acheteur(id) ON DELETE CASCADE,
  numero         VARCHAR(30) NOT NULL,
  date_facture   DATE NOT NULL DEFAULT CURRENT_DATE,
  montant_brut_ttc NUMERIC(12,3) NOT NULL DEFAULT 0,
  remise_pct     NUMERIC(5,2) NOT NULL DEFAULT 0,
  montant_ht     NUMERIC(12,3) NOT NULL DEFAULT 0,
  montant_tva    NUMERIC(12,3) NOT NULL DEFAULT 0,
  timbre_fiscal  BOOLEAN NOT NULL DEFAULT true,
  montant_timbre NUMERIC(6,3) NOT NULL DEFAULT 1.000,
  montant_ttc    NUMERIC(12,3) NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_factures_acheteur_client ON factures_acheteur(client_id, date_facture);
