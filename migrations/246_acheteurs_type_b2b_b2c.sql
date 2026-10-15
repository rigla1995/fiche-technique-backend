-- Migration 246 : D2 « Acheteurs professionnels (B2B) et particuliers (B2C) » (labflow-reprise/PLAN-DOMAINES-ACHETEURS-CODES.md
-- §2 ligne D2 ; réponses du client du 15/10 : type obligatoire à l'ajout, anciens acheteurs sans matricule « à préciser »,
-- facture B2C au nom et au téléphone du particulier).
--   • acheteurs.type : 'b2b' (professionnel), 'b2c' (particulier), 'a_preciser' (fiche d'avant, à compléter) ;
--     reprise : 'b2b' si la fiche a un matricule fiscal, sinon 'a_preciser' ;
--   • acheteurs.rne : identifiant RNE d'un professionnel (lu sur l'extrait RNE ou saisi) ;
--   • factures_acheteur.acheteur_type / acheteur_rne : copie à l'émission, comme les autres colonnes acheteur_* (migr. 165).
-- Idempotente (colonnes et contrainte « si absentes », reprise sur les lignes sans type seulement).
ALTER TABLE acheteurs ADD COLUMN IF NOT EXISTS type VARCHAR(12);
ALTER TABLE acheteurs ADD COLUMN IF NOT EXISTS rne  VARCHAR(50);

UPDATE acheteurs
   SET type = CASE WHEN NULLIF(BTRIM(matricule_fiscal), '') IS NOT NULL THEN 'b2b' ELSE 'a_preciser' END
 WHERE type IS NULL;

ALTER TABLE acheteurs ALTER COLUMN type SET DEFAULT 'a_preciser';
ALTER TABLE acheteurs ALTER COLUMN type SET NOT NULL;
ALTER TABLE acheteurs DROP CONSTRAINT IF EXISTS acheteurs_type_check;
ALTER TABLE acheteurs ADD CONSTRAINT acheteurs_type_check CHECK (type IN ('b2b', 'b2c', 'a_preciser'));

ALTER TABLE factures_acheteur ADD COLUMN IF NOT EXISTS acheteur_type VARCHAR(12);
ALTER TABLE factures_acheteur ADD COLUMN IF NOT EXISTS acheteur_rne  VARCHAR(50);
