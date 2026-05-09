-- Add supplement_gerant / supplement_labo to promotions.applies_to
ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_applies_to_check;
ALTER TABLE promotions ADD CONSTRAINT promotions_applies_to_check
  CHECK (applies_to IN ('onboarding', 'mensualite', 'les_deux', 'supplement_gerant', 'supplement_labo'));

-- Add bloque mode to abonnements
ALTER TABLE abonnements DROP CONSTRAINT IF EXISTS abonnements_mode_compte_check;
ALTER TABLE abonnements ADD CONSTRAINT abonnements_mode_compte_check
  CHECK (mode_compte IN ('actif', 'read_only', 'desactive', 'archive', 'bloque'));

-- Add date_paiement to paiements (actual payment date, separate from saisie date)
ALTER TABLE paiements ADD COLUMN IF NOT EXISTS date_paiement DATE;

-- Add date_onboarding to abonnements (when onboarding was paid)
ALTER TABLE abonnements ADD COLUMN IF NOT EXISTS date_onboarding DATE;

-- Add supplement discount / fixed columns to promotions
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS discount_supplement NUMERIC(5,2);
ALTER TABLE promotions ADD COLUMN IF NOT EXISTS fixed_supplement NUMERIC(10,2);
