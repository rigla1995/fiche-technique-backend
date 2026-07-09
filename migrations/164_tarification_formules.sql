-- 164 — Tarification en formules : Activité Basique (sans Espace Produit) /
-- Activité Premium (avec) / base Labo, + option Acheteurs facturée par paliers.
--   • abonnement_config.formule_activites ('basique'|'premium', NULL si 0 activité) ;
--     backfill : tous les comptes existants avec ≥ 1 activité → PREMIUM (aucun
--     changement fonctionnel ni tarifaire pour eux : le prix Premium reprend le
--     prix de base actuel).
--   • Nouvelles clés tarifs_config : prix de base par formule + 4 paliers acheteurs
--     (1-10 / 11-20 / 21-50 / 51-100, plafond v1 = 100).
--   • module_vente supprimé (la vente est incluse dans les bases — la clé n'a
--     jamais été facturée) + purge des clés legacy (compte_type supprimé migr 131).
--   • Nouveau type de demande 'passer_formule_premium' (upgrade Basique → Premium).

ALTER TABLE abonnement_config ADD COLUMN IF NOT EXISTS formule_activites VARCHAR(10)
  CHECK (formule_activites IN ('basique', 'premium'));

UPDATE abonnement_config SET formule_activites = 'premium'
WHERE nb_activites >= 1 AND formule_activites IS NULL;

-- Le prix Premium reprend la valeur actuelle de prix_base_activite (continuité tarifaire)
INSERT INTO tarifs_config (cle, valeur_dt, description)
SELECT 'prix_base_activite_premium',
       COALESCE((SELECT valeur_dt FROM tarifs_config WHERE cle = 'prix_base_activite'), 200),
       'Formule Activité Premium — prix mensuel de base d''une activité (Stock + Ventes + Espace Produit)'
ON CONFLICT (cle) DO NOTHING;

INSERT INTO tarifs_config (cle, valeur_dt, description) VALUES
  ('prix_base_activite_basique', 150, 'Formule Activité Basique — prix mensuel de base d''une activité (Stock + Ventes d''articles, sans Espace Produit)'),
  ('acheteurs_palier_10', 50, 'Option Acheteurs — palier 1 à 10 acheteurs (DT/mois)'),
  ('acheteurs_palier_20', 90, 'Option Acheteurs — palier 11 à 20 acheteurs (DT/mois)'),
  ('acheteurs_palier_50', 150, 'Option Acheteurs — palier 21 à 50 acheteurs (DT/mois)'),
  ('acheteurs_palier_100', 220, 'Option Acheteurs — palier 51 à 100 acheteurs (DT/mois)')
ON CONFLICT (cle) DO NOTHING;

-- Purge : module_vente (inclus dans les bases, jamais facturé) + clés mortes de
-- l'ancien modèle compte_type / forfaits (les fallbacks code sont retirés en même temps).
DELETE FROM tarifs_config WHERE cle IN (
  'module_vente', 'module_acheteurs',
  'indep_mensuel', 'indep_onboarding', 'entreprise_mensuel', 'entreprise_onboarding',
  'activite_1', 'activite_2', 'activite_sup', 'labo_mensuel', 'gerant_mensuel'
);

-- Cohérence facturation : un compte dont le module Acheteurs est DÉSACTIVÉ ne doit
-- pas porter de quota (sinon le palier serait facturé sans que l'option soit active).
UPDATE abonnement_config ac SET nb_acheteurs = 0
FROM abonnements a
WHERE a.id = ac.abonnement_id AND ac.nb_acheteurs > 0
  AND NOT EXISTS (
    SELECT 1 FROM profil_entreprise pe
    WHERE pe.client_id = a.client_id AND pe.module_acheteurs_actif = true
  );

-- Demande d'upgrade de formule (même mécanique que activer_module_vente)
-- VARCHAR(20) d'origine trop court pour 'passer_formule_premium' (22 caractères)
ALTER TABLE demandes ALTER COLUMN type_demande TYPE VARCHAR(30);
ALTER TABLE demandes DROP CONSTRAINT IF EXISTS demandes_type_demande_check;
ALTER TABLE demandes ADD CONSTRAINT demandes_type_demande_check
  CHECK (type_demande IN (
    'gerant_sup',
    'labo_sup',
    'upgrade_entreprise',
    'activer_module_vente',
    'activer_module_acheteurs',
    'passer_formule_premium'
  ));
