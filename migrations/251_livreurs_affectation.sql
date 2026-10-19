-- 251 — Module « Livreurs », étape L2 « affectation à l'expédition » (labflow-reprise/livreurs/PLAN-LIVREURS.md, L1 acceptée
-- le 19/10/2026). Une commande acheteur expédiée peut être confiée à un livreur du compte : choix au traitement
-- (« Expédier ») ou plus tard tant qu'elle est expédiée ; réaffectation et retrait possibles. Le livreur voit alors la
-- commande dans son espace (lecture seule à cette étape ; la validation arrive avec L3).
-- Migration additive et rejouable.

ALTER TABLE commandes_acheteur
  ADD COLUMN IF NOT EXISTS livreur_id INTEGER REFERENCES livreurs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS livraison_affectee_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS livraison_affectee_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS commandes_acheteur_livreur_idx ON commandes_acheteur (livreur_id) WHERE livreur_id IS NOT NULL;

-- Manuel : la fiche « Livreurs » (insérée par la 250) apprend qu'un livreur déjà affecté ne se supprime plus (seulement
-- désactivé). Remplacement de phrase, sur le contenu courant ET le contenu par défaut, rejouable (REPLACE sans effet si
-- la phrase a déjà changé). La fiche « acheteurs-ventes » est mise à jour par la 252 (générateur du manuel).
UPDATE manuel_sections
   SET contenu = REPLACE(contenu,
         'Pour retirer définitivement l''accès, utilisez 🗑 (une confirmation est demandée).',
         'Pour retirer définitivement l''accès, utilisez 🗑 (une confirmation est demandée) ; un livreur qui a déjà des livraisons ne se supprime plus : désactivez-le.'),
       contenu_defaut = REPLACE(contenu_defaut,
         'Pour retirer définitivement l''accès, utilisez 🗑 (une confirmation est demandée).',
         'Pour retirer définitivement l''accès, utilisez 🗑 (une confirmation est demandée) ; un livreur qui a déjà des livraisons ne se supprime plus : désactivez-le.')
 WHERE slug = 'livreurs';
