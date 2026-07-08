-- 152 — Module Acheteurs : activation par compte (opt-in réel, enforcement serveur),
-- quota d'acheteurs, demande d'activation client, clé de tarif.

ALTER TABLE profil_entreprise
  ADD COLUMN IF NOT EXISTS module_acheteurs_actif BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS module_acheteurs_activated_at TIMESTAMPTZ;

-- Quota d'acheteurs par compte (réglé par l'admin à l'activation ; contrôle SERVEUR à la création).
ALTER TABLE abonnement_config
  ADD COLUMN IF NOT EXISTS nb_acheteurs INTEGER NOT NULL DEFAULT 0;
ALTER TABLE abonnement_config DROP CONSTRAINT IF EXISTS abonnement_config_nb_acheteurs_check;
ALTER TABLE abonnement_config ADD CONSTRAINT abonnement_config_nb_acheteurs_check
  CHECK (nb_acheteurs >= 0);

-- Nouveau type de demande d'activation (même mécanique que activer_module_vente).
ALTER TABLE demandes DROP CONSTRAINT IF EXISTS demandes_type_demande_check;
ALTER TABLE demandes ADD CONSTRAINT demandes_type_demande_check
  CHECK (type_demande IN (
    'gerant_sup',
    'labo_sup',
    'upgrade_entreprise',
    'activer_module_vente',
    'activer_module_acheteurs'
  ));

-- Tarif informatif (l'intégration à la mensualité = chantier tarification ultérieur).
INSERT INTO tarifs_config (cle, valeur_dt, description)
VALUES ('module_acheteurs', 0, 'Module Acheteurs — prix mensuel')
ON CONFLICT (cle) DO NOTHING;
