-- Migration 238 : P2 « Conditions des prestataires et chiffre net » (labflow-reprise/produits-prestataires/PLAN.md §2
-- ligne P2, §3, §4 questions 2 à 5 ; réponses du client du 13/10). À l'activation d'un prestataire pour une activité, le
-- client renseigne sa COMMISSION (%), la TVA (%) sur cette commission et le MODE DE PAIEMENT (liste tenue par l'admin).
-- Chaque vente par prestataire FIGE ces conditions le jour de sa saisie : changer un taux ne touche pas les mois passés.
-- Le chiffre net du prestataire = prix de vente − commission − TVA sur la commission (30,000 à 25 % et 19 % : 21,075).
-- Migration additive : aucune vente ni aucun prix ne change.
-- 1) Les modes de paiement (liste de l'admin : ajout, renommage, désactivation ; jamais effacés).
CREATE TABLE IF NOT EXISTS modes_paiement (
  id         SERIAL PRIMARY KEY,
  code       VARCHAR(30) NOT NULL UNIQUE,
  libelle    VARCHAR(60) NOT NULL,
  actif      BOOLEAN NOT NULL DEFAULT true,
  ordre      SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO modes_paiement (code, libelle, ordre) VALUES ('especes', 'Espèces', 1), ('virement', 'Virement', 2)
ON CONFLICT (code) DO NOTHING;

-- 2) Les conditions du prestataire pour l'activité (taux_commission existe depuis la 082 ; l'activation y écrivait 0).
--    mode_paiement_id NULL = conditions pas encore renseignées (prestataires activés avant cette migration) : la saisie
--    d'une vente sur ce canal est refusée tant qu'elles manquent.
ALTER TABLE activite_prestataires ADD COLUMN IF NOT EXISTS taux_tva NUMERIC(5, 2) NOT NULL DEFAULT 0;
ALTER TABLE activite_prestataires ADD COLUMN IF NOT EXISTS mode_paiement_id INTEGER REFERENCES modes_paiement(id) ON DELETE RESTRICT;
ALTER TABLE activite_prestataires ADD COLUMN IF NOT EXISTS conditions_le TIMESTAMPTZ;
ALTER TABLE activite_prestataires ADD COLUMN IF NOT EXISTS conditions_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;
DO $$ BEGIN
  ALTER TABLE activite_prestataires ADD CONSTRAINT ck_activite_prestataires_taux
    CHECK (taux_commission BETWEEN 0 AND 100 AND taux_tva BETWEEN 0 AND 100);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3) Les conditions figées sur chaque vente par prestataire (NULL pour une vente directe).
ALTER TABLE ventes ADD COLUMN IF NOT EXISTS taux_commission NUMERIC(5, 2);
ALTER TABLE ventes ADD COLUMN IF NOT EXISTS taux_tva_commission NUMERIC(5, 2);
ALTER TABLE ventes ADD COLUMN IF NOT EXISTS mode_paiement_id INTEGER REFERENCES modes_paiement(id) ON DELETE SET NULL;
-- Les ventes déjà saisies gardent le taux qui leur était appliqué jusqu'ici (celui du prestataire aujourd'hui, 0 en
-- général), TVA 0 et un mode non renseigné ; au rejeu, rien ne change (taux déjà posé).
UPDATE ventes v SET taux_commission = COALESCE(ap.taux_commission, 0), taux_tva_commission = 0
  FROM activite_prestataires ap
 WHERE v.type_vente = 'prestataire' AND v.taux_commission IS NULL AND ap.prestataire_id = v.prestataire_id
   AND ((v.activite_id IS NOT NULL AND ap.activite_id = v.activite_id) OR (v.labo_id IS NOT NULL AND ap.labo_id = v.labo_id));
UPDATE ventes SET taux_commission = 0, taux_tva_commission = 0 WHERE type_vente = 'prestataire' AND taux_commission IS NULL;
CREATE INDEX IF NOT EXISTS idx_ventes_mode_paiement ON ventes (mode_paiement_id) WHERE mode_paiement_id IS NOT NULL;
