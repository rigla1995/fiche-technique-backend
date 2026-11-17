-- ─────────────────────────────────────────────────────────────────────────────
-- 256 — Canaux de vente (étape C1 — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §2.2)
--
-- Un canal de vente = la vente directe, ou un prestataire activé sur l'activité. Jusqu'ici un produit vendable était
-- ouvert à la saisie sur TOUS les canaux ; une vente par prestataire sans prix prestataire partait à 0 DT, et un produit
-- réservé à un prestataire devait porter un prix direct inventé. Désormais chaque canal a sa liste :
--   • vente directe : activite_articles_vendables.directe ;
--   • prestataire   : article_prix_prestataire.en_vente (exige un prix > 0).
-- `actif` reste l'interrupteur du produit dans l'activité : il est vrai dès qu'un canal au moins le vend.
--
-- Reprise : la vente directe reste ouverte pour tous les produits (comportement d'avant) ; un prestataire ne vend plus
-- que les produits qui ont un prix chez lui (les autres enregistraient des ventes à 0 DT).
-- Rejouable : colonnes « IF NOT EXISTS », reprise sans effet au second passage.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE activite_articles_vendables
  ADD COLUMN IF NOT EXISTS directe BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE article_prix_prestataire
  ADD COLUMN IF NOT EXISTS en_vente BOOLEAN NOT NULL DEFAULT true;

UPDATE article_prix_prestataire
   SET en_vente = false
 WHERE en_vente
   AND (prix_vente IS NULL OR prix_vente <= 0);

CREATE INDEX IF NOT EXISTS idx_article_prix_prestataire_lien
  ON article_prix_prestataire (activite_prestataire_id);
