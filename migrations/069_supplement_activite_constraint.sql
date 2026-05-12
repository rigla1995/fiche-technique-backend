-- Add supplement_activite to the applies_to CHECK constraint on promotions
ALTER TABLE promotions DROP CONSTRAINT IF EXISTS promotions_applies_to_check;
ALTER TABLE promotions ADD CONSTRAINT promotions_applies_to_check
  CHECK (applies_to IN ('onboarding', 'mensualite', 'les_deux', 'supplement_gerant', 'supplement_labo', 'supplement_activite'));
