-- Replace flat tarif keys with the new tiered/degressive pricing model
-- Sans labo: 1er = prix_base, 2ème = base*(1-r2%), 3ème+ = base*(1-r3%)
-- Avec labo: toutes = base*(1-rl%)
INSERT INTO tarifs_config (cle, valeur_dt, description) VALUES
  ('prix_base_activite',          200, 'Prix de base — 1ère activité (DT/mois)'),
  ('remise_2eme_sans_labo',        20, 'Remise 2ème activité sans labo (%)'),
  ('remise_3eme_plus_sans_labo',   40, 'Remise 3ème activité+ sans labo (%)'),
  ('remise_avec_labo',             30, 'Remise toutes activités avec labo (%)'),
  ('labo_sup_mensuel',            160, 'Supplément labo — mensuel (DT)'),
  ('gerant_sup_mensuel',           80, 'Supplément gérant — mensuel (DT)'),
  ('onboarding_sans_labo',        500, 'Onboarding sans labo (DT)'),
  ('onboarding_avec_labo',        700, 'Onboarding avec labo (DT)')
ON CONFLICT (cle) DO UPDATE SET
  valeur_dt   = EXCLUDED.valeur_dt,
  description = EXCLUDED.description;

-- Keep old keys for backward compatibility during transition (will be removed later)
