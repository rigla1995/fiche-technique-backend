-- Accès du gérant à l'Espace Acheteurs, accordé explicitement par le compte client.
-- L'accès effectif exige AUSSI au moins un labo affecté au gérant (contrôle applicatif :
-- middleware requireGerantAcheteursAccess + validations du gerantController).
ALTER TABLE utilisateurs ADD COLUMN IF NOT EXISTS gerant_acces_acheteurs BOOLEAN NOT NULL DEFAULT false;
