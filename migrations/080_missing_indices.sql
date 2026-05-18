-- Missing FK indices for performance
CREATE INDEX IF NOT EXISTS idx_utilisateurs_gerant_parent_id ON utilisateurs(gerant_parent_id) WHERE gerant_parent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_profil_entreprise_domaine_id ON profil_entreprise(domaine_id) WHERE domaine_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_categories_domaine_id ON categories(domaine_id) WHERE domaine_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_client_daily_fournisseur_id ON stock_client_daily(fournisseur_id) WHERE fournisseur_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_entreprise_daily_fournisseur_id ON stock_entreprise_daily(fournisseur_id) WHERE fournisseur_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_labo_daily_fournisseur_id ON stock_labo_daily(fournisseur_id) WHERE fournisseur_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pertes_ingredient_id ON pertes(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_pertes_activite_date ON pertes(activite_id, date_perte);
CREATE INDEX IF NOT EXISTS idx_paiements_abonnement_mois ON paiements(abonnement_id, mois);
CREATE INDEX IF NOT EXISTS idx_promotions_abonnement_dates ON promotions(abonnement_id, date_debut, date_fin);
CREATE INDEX IF NOT EXISTS idx_activite_ingredient_selections_ingredient ON activite_ingredient_selections(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_labo_ingredient_selections_ingredient ON labo_ingredient_selections(ingredient_id);
CREATE INDEX IF NOT EXISTS idx_ingredient_domaines_domaine ON ingredient_domaines(domaine_id);
CREATE INDEX IF NOT EXISTS idx_client_domaines_domaine ON client_domaines(domaine_id);
CREATE INDEX IF NOT EXISTS idx_support_demandes_traite_par ON support_demandes(traite_par) WHERE traite_par IS NOT NULL;
