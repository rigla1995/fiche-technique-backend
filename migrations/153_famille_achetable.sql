-- 153 — Attribut « achetable » par famille (module Acheteurs).
-- Gate quels articles pourront être proposés aux acheteurs (offres du lot 2).
-- Défaut false : le client coche explicitement les familles concernées
-- (toggle visible dans le référentiel uniquement si le module est actif).

ALTER TABLE familles
  ADD COLUMN IF NOT EXISTS achetable BOOLEAN NOT NULL DEFAULT false;
