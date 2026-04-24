-- Link products to a specific activity for entreprise accounts
-- activite_type: 'franchise' | 'distincte' | NULL (independant clients)
-- activite_id: only set for 'distincte' activities; franchise products use activite_type='franchise'
ALTER TABLE produits ADD COLUMN IF NOT EXISTS activite_type VARCHAR(20);
ALTER TABLE produits ADD COLUMN IF NOT EXISTS activite_id INTEGER REFERENCES activites(id) ON DELETE SET NULL;
