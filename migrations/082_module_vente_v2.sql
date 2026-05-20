-- ─────────────────────────────────────────────────────────────────────────────
-- 082 — Module Vente v2 : activation par entreprise, prestataires par activité,
--        portion catalogue, prix par prestataire, charges fixes, tarif
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Activation du module vente sur profil_entreprise
ALTER TABLE profil_entreprise
  ADD COLUMN IF NOT EXISTS module_vente_actif BOOLEAN DEFAULT false;

-- 2. Prestataires par activité (remplace entreprise_prestataires global)
--    Le client configure ses prestataires et taux de commission par activité.
CREATE TABLE IF NOT EXISTS activite_prestataires (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activite_id      INTEGER REFERENCES activites(id) ON DELETE CASCADE,
  prestataire_id   UUID REFERENCES prestataires_livraison(id) ON DELETE CASCADE,
  taux_commission  NUMERIC(5,2) DEFAULT 0,
  actif            BOOLEAN DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (activite_id, prestataire_id)
);

-- 3. Supprimer commission_pct côté admin (géré par le client par activité désormais)
ALTER TABLE prestataires_livraison
  DROP COLUMN IF EXISTS commission_pct;

-- 4. Portion vendable dans le catalogue (quantité par unité de vente)
ALTER TABLE activite_articles_vendables
  ADD COLUMN IF NOT EXISTS portion NUMERIC(10,3);

-- 5. Prix par prestataire par article vendable (calculé auto depuis taux, modifiable)
CREATE TABLE IF NOT EXISTS article_prix_prestataire (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_vendable_id     UUID REFERENCES activite_articles_vendables(id) ON DELETE CASCADE,
  activite_prestataire_id UUID REFERENCES activite_prestataires(id) ON DELETE CASCADE,
  prix_vente              NUMERIC(10,2),
  updated_at              TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (article_vendable_id, activite_prestataire_id)
);

-- 6. Charges fixes annuelles par activité
CREATE TABLE IF NOT EXISTS charges_fixes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activite_id         INTEGER REFERENCES activites(id) ON DELETE CASCADE UNIQUE,
  mode                VARCHAR(10) NOT NULL DEFAULT 'global'
                        CHECK (mode IN ('global','detail')),
  montant_global      NUMERIC(12,2),
  loyer               NUMERIC(12,2),
  charges_personnel   NUMERIC(12,2),
  electricite_gaz     NUMERIC(12,2),
  eau                 NUMERIC(12,2),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Nouveau type de demande : activation module vente
ALTER TABLE demandes
  DROP CONSTRAINT IF EXISTS demandes_type_demande_check;
ALTER TABLE demandes
  ADD CONSTRAINT demandes_type_demande_check
  CHECK (type_demande IN (
    'gerant_sup',
    'labo_sup',
    'upgrade_entreprise',
    'activer_module_vente'
  ));

-- 8. Tarif module vente dans tarifs_config
INSERT INTO tarifs_config (cle, valeur_dt, description)
VALUES ('module_vente', 0, 'Module Vente — prix mensuel')
ON CONFLICT (cle) DO NOTHING;

-- 9. Indexes
CREATE INDEX IF NOT EXISTS idx_activite_prestataires_activite ON activite_prestataires(activite_id);
CREATE INDEX IF NOT EXISTS idx_article_prix_prestataire_article ON article_prix_prestataire(article_vendable_id);
CREATE INDEX IF NOT EXISTS idx_charges_fixes_activite ON charges_fixes(activite_id);
