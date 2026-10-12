-- Migration 228 : factures fournisseur, étape F4 « Vers la comptabilité » (labflow-reprise/achats-compta/PLAN-FACTURES.md
-- §4 « Vers la comptabilité », §6 ; notes ETAPE-F4.md).
--
-- Une facture d'appro (validée par la lecture, ou saisie à la main avec sa pièce) peut partir dans la comptabilité « Mon
-- entreprise » du client (module Compta actif) : LabFlow y prépare l'écriture d'achat EN BROUILLARD ; le comptable la
-- modifie et la valide comme toute écriture.
--   • compta.ecritures.facture_id : la facture d'origine (pièce consultable depuis l'écriture) ; une seule écriture par
--     facture ; origine « labflow ». Le comptable supprime le brouillard ⇒ la facture redevient « à envoyer ».
--   • compta.tiers.fournisseur_id : le fournisseur LabFlow devenu tiers du dossier ; origine « labflow ».
--   • compta.comptes_articles : le compte d'achat réglé par le comptable pour une catégorie, un article ou une nature hors
--     stock (sans réglage, d'après la famille : 607 vendable non consommable, 6022 ni l'une ni l'autre, sinon 601 ;
--     transport et livraison 6241, consigne 4096, prestation 604, autre 606).
--   • factures_journal : « envoi_compta ».

ALTER TABLE compta.ecritures ADD COLUMN IF NOT EXISTS facture_id INTEGER REFERENCES factures(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_ecritures_facture ON compta.ecritures (facture_id) WHERE facture_id IS NOT NULL;
ALTER TABLE compta.ecritures DROP CONSTRAINT IF EXISTS ecritures_origine_check;
ALTER TABLE compta.ecritures ADD CONSTRAINT ecritures_origine_check
  CHECK (origine IN ('saisie', 'import', 'contrepassation', 'labflow'));

ALTER TABLE compta.tiers ADD COLUMN IF NOT EXISTS fournisseur_id INTEGER REFERENCES fournisseurs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_tiers_fournisseur ON compta.tiers (dossier_id, fournisseur_id) WHERE fournisseur_id IS NOT NULL;
ALTER TABLE compta.tiers DROP CONSTRAINT IF EXISTS tiers_origine_check;
ALTER TABLE compta.tiers ADD CONSTRAINT tiers_origine_check CHECK (origine IN ('saisi', 'import', 'labflow'));

CREATE TABLE IF NOT EXISTS compta.comptes_articles (
  id                 SERIAL PRIMARY KEY,
  dossier_id         INTEGER NOT NULL REFERENCES compta.dossiers(id) ON DELETE CASCADE,
  categorie_id       INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  article_id         INTEGER REFERENCES articles(id) ON DELETE CASCADE,
  nature_hors_stock  VARCHAR(20) CHECK (nature_hors_stock IN ('transport', 'livraison', 'consigne', 'service', 'autre')),
  compte_id          INTEGER NOT NULL REFERENCES compta.comptes(id) ON DELETE CASCADE,
  modifie_par        INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL,
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((categorie_id IS NOT NULL)::int + (article_id IS NOT NULL)::int + (nature_hors_stock IS NOT NULL)::int = 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_comptes_articles_categorie ON compta.comptes_articles (dossier_id, categorie_id) WHERE categorie_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_comptes_articles_article ON compta.comptes_articles (dossier_id, article_id) WHERE article_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_comptes_articles_nature ON compta.comptes_articles (dossier_id, nature_hors_stock) WHERE nature_hors_stock IS NOT NULL;

DO $j228$
BEGIN
  ALTER TABLE factures_journal DROP CONSTRAINT IF EXISTS factures_journal_action_check;
  ALTER TABLE factures_journal ADD CONSTRAINT factures_journal_action_check
    CHECK (action IN ('facture_creee', 'lignes_ajoutees', 'piece_jointe', 'piece_remplacee', 'piece_supprimee',
                      'facture_supprimee', 'facture_validee', 'envoi_compta'));
END
$j228$;
