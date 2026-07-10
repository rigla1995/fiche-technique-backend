-- 165 — Suppression d'un acheteur SANS perdre les transactions de stock.
-- Les commandes expédiées/livrées (table de flux du stock labo) et leurs
-- factures fiscales SURVIVENT à la suppression de la fiche : acheteur_id
-- devient nullable (ON DELETE SET NULL) et l'identité de l'acheteur est
-- FIGÉE en snapshot — nom/entreprise sur la commande (affichage des
-- historiques), fiche complète sur la facture (mentions fiscales du PDF,
-- régénéré à chaque téléchargement). Tant que la fiche existe, les lectures
-- préfèrent la fiche vivante (COALESCE) ; le snapshot est rafraîchi une
-- dernière fois dans la transaction de suppression.

-- Commandes : snapshot d'affichage
ALTER TABLE commandes_acheteur ADD COLUMN IF NOT EXISTS acheteur_nom VARCHAR(150);
ALTER TABLE commandes_acheteur ADD COLUMN IF NOT EXISTS acheteur_entreprise VARCHAR(150);

UPDATE commandes_acheteur ca
SET acheteur_nom = a.nom, acheteur_entreprise = a.entreprise
FROM acheteurs a
WHERE a.id = ca.acheteur_id AND ca.acheteur_nom IS NULL;

ALTER TABLE commandes_acheteur ALTER COLUMN acheteur_id DROP NOT NULL;
ALTER TABLE commandes_acheteur DROP CONSTRAINT IF EXISTS commandes_acheteur_acheteur_id_fkey;
ALTER TABLE commandes_acheteur
  ADD CONSTRAINT commandes_acheteur_acheteur_id_fkey
  FOREIGN KEY (acheteur_id) REFERENCES acheteurs(id) ON DELETE SET NULL;

-- Factures : snapshot fiscal complet
ALTER TABLE factures_acheteur ADD COLUMN IF NOT EXISTS acheteur_nom VARCHAR(150);
ALTER TABLE factures_acheteur ADD COLUMN IF NOT EXISTS acheteur_entreprise VARCHAR(150);
ALTER TABLE factures_acheteur ADD COLUMN IF NOT EXISTS acheteur_adresse TEXT;
ALTER TABLE factures_acheteur ADD COLUMN IF NOT EXISTS acheteur_matricule_fiscal VARCHAR(50);
ALTER TABLE factures_acheteur ADD COLUMN IF NOT EXISTS acheteur_telephone VARCHAR(30);
ALTER TABLE factures_acheteur ADD COLUMN IF NOT EXISTS acheteur_email VARCHAR(255);

UPDATE factures_acheteur fa
SET acheteur_nom = a.nom, acheteur_entreprise = a.entreprise, acheteur_adresse = a.adresse,
    acheteur_matricule_fiscal = a.matricule_fiscal, acheteur_telephone = a.telephone, acheteur_email = a.email
FROM acheteurs a
WHERE a.id = fa.acheteur_id AND fa.acheteur_nom IS NULL;

ALTER TABLE factures_acheteur ALTER COLUMN acheteur_id DROP NOT NULL;
ALTER TABLE factures_acheteur DROP CONSTRAINT IF EXISTS factures_acheteur_acheteur_id_fkey;
ALTER TABLE factures_acheteur
  ADD CONSTRAINT factures_acheteur_acheteur_id_fkey
  FOREIGN KEY (acheteur_id) REFERENCES acheteurs(id) ON DELETE SET NULL;
