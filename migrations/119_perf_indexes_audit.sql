-- Migration 119: index de performance issus de l'audit SQL (2026-06-23).
-- Tables ciblées jamais indexées (hors PK) ou avec un index inutilisable comme préfixe.
-- Toutes en CREATE INDEX IF NOT EXISTS (idempotent), même convention que la migration 116.
-- NB: la migration tourne dans une transaction (migrate.js) -> pas de CONCURRENTLY possible.
-- Au volume actuel le verrou de build est bref; à surveiller si les tables grossissent fortement.

-- ── abonnements : ~12 endpoints filtrent WHERE client_id=$1 (table = 1 ligne/client, seq scan sinon)
CREATE INDEX IF NOT EXISTS idx_abonnements_client_id
  ON abonnements (client_id);

-- ── articles (ex-ingredients) : toutes les listes du référentiel filtrent/joignent dessus
CREATE INDEX IF NOT EXISTS idx_articles_client_id
  ON articles (client_id);
CREATE INDEX IF NOT EXISTS idx_articles_categorie_id
  ON articles (categorie_id) WHERE categorie_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_articles_unite_id
  ON articles (unite_id);

-- ── labo_transfers : aucun index hors PK (migration 019). Stock courant, transferts, dashboards labo.
CREATE INDEX IF NOT EXISTS idx_labo_transfers_labo_ing
  ON labo_transfers (labo_id, ingredient_id) WHERE ingredient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_labo_transfers_labo_prod
  ON labo_transfers (labo_id, produit_id) WHERE produit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_labo_transfers_activite
  ON labo_transfers (activite_id);
CREATE INDEX IF NOT EXISTS idx_labo_transfers_labo_date
  ON labo_transfers (labo_id, date_transfert);

-- ── labo_pertes : aucun index hors PK (migration 034). Calcul stock + historique pertes labo.
CREATE INDEX IF NOT EXISTS idx_labo_pertes_labo_ing
  ON labo_pertes (labo_id, ingredient_id) WHERE ingredient_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_labo_pertes_labo_prod
  ON labo_pertes (labo_id, produit_id) WHERE produit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_labo_pertes_labo_date
  ON labo_pertes (labo_id, date_perte);

-- ── pertes : produit_id (calcul stock PT activité). idx_pertes_activite_date existe déjà (080).
CREATE INDEX IF NOT EXISTS idx_pertes_activite_prod
  ON pertes (activite_id, produit_id) WHERE produit_id IS NOT NULL;

-- ── client_pertes : seul (client_id) est indexé (032). Tri/plage par date_perte.
CREATE INDEX IF NOT EXISTS idx_client_pertes_client_date
  ON client_pertes (client_id, date_perte);

-- ── produit_sous_produits : UNIQUE(produit_id, sous_produit_id) -> lookup inverse non couvert
CREATE INDEX IF NOT EXISTS idx_psp_sous_produit
  ON produit_sous_produits (sous_produit_id);

-- ── tables de liaison fournisseurs : PK = (fournisseur_id, X) -> filtre sur X seul non préfixable
CREATE INDEX IF NOT EXISTS idx_fournisseur_activites_activite
  ON fournisseur_activites (activite_id);
CREATE INDEX IF NOT EXISTS idx_fournisseur_labos_labo
  ON fournisseur_labos (labo_id);

-- ── fournisseurs : mode indépendant + checks ownership filtrent client_id
CREATE INDEX IF NOT EXISTS idx_fournisseurs_client_id
  ON fournisseurs (client_id);

-- ── ai_conversations : lu à CHAQUE message agent (client_id + whatsapp_number, dernier par updated_at)
CREATE INDEX IF NOT EXISTS idx_ai_conversations_client_wa_updated
  ON ai_conversations (client_id, whatsapp_number, updated_at DESC) WHERE whatsapp_number IS NOT NULL;

-- ── vente_lignes : jointures "top articles vendus" (idx_vente_lignes_vente existe déjà, 116)
CREATE INDEX IF NOT EXISTS idx_vente_lignes_article
  ON vente_lignes (article_type, article_id);
