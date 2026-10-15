-- Migration 245 : D1 « Prestataires de livraison par domaine et par compte » (labflow-reprise/PLAN-DOMAINES-ACHETEURS-CODES.md
-- §2 ligne D1 ; réponses du client du 15/10 : règle par domaine obligatoire ET interrupteur par compte, actif par défaut,
-- réglé par l'admin à la création du compte ou après).
--   • abonnement_config.prestataires_actifs : l'interrupteur du compte (vrai par défaut : rien ne change pour l'existant) ;
--   • la règle « prestataires » des domaines (JSONB regles, défaut vrai dans le code) est posée à FAUX pour l'hôtellerie et
--     l'industrie (slugs hotellerie, ceramique en local, usine en production), seulement si elle n'y est pas déjà réglée.
-- Idempotente ; rien n'est modifié ailleurs.
ALTER TABLE abonnement_config ADD COLUMN IF NOT EXISTS prestataires_actifs BOOLEAN NOT NULL DEFAULT true;

UPDATE domaines_activite
   SET regles = COALESCE(regles, '{}'::jsonb) || '{"prestataires": false}'::jsonb
 WHERE slug IN ('hotellerie', 'ceramique', 'usine')
   AND NOT (COALESCE(regles, '{}'::jsonb) ? 'prestataires');
