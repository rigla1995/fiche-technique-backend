-- Migration 116: performance indexes for the ventes hot paths (dashboards & rapports).
-- getClientDashboard / getRapportVentes run ~8 aggregations per load, all joining
-- ventes -> vente_lignes and filtering by (activite_id, statut, date_vente). Without
-- these indexes Postgres sequentially scans both (append-only) tables on every load,
-- degrading linearly with sales volume; the unindexed vente_lignes.vente_id FK also
-- slows cascade deletes.

CREATE INDEX IF NOT EXISTS idx_vente_lignes_vente
  ON vente_lignes (vente_id);

CREATE INDEX IF NOT EXISTS idx_ventes_activite_statut_date
  ON ventes (activite_id, statut, date_vente);
