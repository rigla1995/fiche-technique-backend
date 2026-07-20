-- 175 — Manuel : plus d'email de statut à l'acheteur + promotions sur les tarifs.
--   Accompagne la migration 174 et la suppression de sendCommandeAcheteurEmail.
--   Le manuel sert de source de vérité au client ET de base de connaissances à
--   l'assistant IA (aiToolHandlers lit manuel_sections) : le laisser promettre des
--   emails qui ne partent plus ferait mentir les deux.
--   REPLACE ciblés et idempotents sur `contenu` (édité par l'admin) ET
--   `contenu_defaut`, comme la migration 170.

-- ── 1. Fiche « Ventes & commandes acheteurs » : retrait des promesses d'email ──
UPDATE manuel_sections SET
  contenu = REPLACE(contenu,
    'le stock est contrôlé puis déduit, la facture est générée et l''acheteur est prévenu par email.',
    'le stock est contrôlé puis déduit et la facture est générée ; l''acheteur suit sa commande et récupère sa facture dans « Mes commandes » sur son portail.'),
  contenu_defaut = REPLACE(contenu_defaut,
    'le stock est contrôlé puis déduit, la facture est générée et l''acheteur est prévenu par email.',
    'le stock est contrôlé puis déduit et la facture est générée ; l''acheteur suit sa commande et récupère sa facture dans « Mes commandes » sur son portail.')
WHERE slug = 'acheteurs-ventes';

UPDATE manuel_sections SET
  contenu = REPLACE(contenu,
    'avec un motif ; l''acheteur est prévenu par email (commandes portail).',
    'avec un motif ; le motif s''affiche à l''acheteur dans « Mes commandes » sur son portail (commandes portail).'),
  contenu_defaut = REPLACE(contenu_defaut,
    'avec un motif ; l''acheteur est prévenu par email (commandes portail).',
    'avec un motif ; le motif s''affiche à l''acheteur dans « Mes commandes » sur son portail (commandes portail).')
WHERE slug = 'acheteurs-ventes';

-- ── 2. Fiche « Portail acheteur » : même correction ────────────────────────────
UPDATE manuel_sections SET
  contenu = REPLACE(contenu,
    'L''acheteur est prévenu par email et récupère sa facture sur le portail',
    'L''acheteur retrouve le nouveau statut et sa facture sur son portail'),
  contenu_defaut = REPLACE(contenu_defaut,
    'L''acheteur est prévenu par email et récupère sa facture sur le portail',
    'L''acheteur retrouve le nouveau statut et sa facture sur son portail')
WHERE slug = 'acheteurs-portail';

-- ── 3. Règle générale sur les emails reçus par un acheteur ────────────────────
UPDATE manuel_sections SET
  contenu = contenu || E'\n\n### Les emails reçus par un acheteur\n\nUn acheteur ne reçoit **que deux emails** : l''invitation à activer son compte, et la réinitialisation de son mot de passe. Les changements de statut d''une commande (expédiée, livrée, refusée) **ne déclenchent aucun email** : l''acheteur les consulte dans « Mes commandes » sur son portail.'
WHERE slug = 'acheteurs-portail'
  AND contenu NOT LIKE '%Les emails reçus par un acheteur%';

-- ── 4. Promotions sur les tarifs acheteurs (migration 174) ────────────────────
UPDATE manuel_sections SET
  contenu = contenu || E'\n\n### Faire une promotion\n\nDans **Tarifs Acheteurs**, chaque ligne dispose d''un taux **Promo %** et d''un interrupteur **Promo active**. Une fois la promotion activée :\n\n- vos acheteurs voient sur le portail le **prix initial barré** et le nouveau prix, avec un badge « −X % » ;\n- le prix promotionnel est celui **réellement facturé** — il est aussi proposé par défaut quand vous saisissez une vente manuelle ;\n- le **prix de référence n''est pas écrasé** : coupez la promotion et le tarif normal revient immédiatement, le taux saisi restant mémorisé pour la prochaine fois ;\n- les commandes **déjà passées ne changent pas** : leur prix a été figé au moment de la commande.'
WHERE slug = 'acheteurs-tarifs'
  AND contenu NOT LIKE '%Faire une promotion%';
