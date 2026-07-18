-- 170 — Manuel : le badge Disponible / Rupture du portail acheteur est supprimé.
-- Tout article proposé est commandable ; le vendeur ajuste les quantités, voire
-- retire des lignes, à l'expédition. REPLACE ciblés (idempotents : ne matchent
-- plus après application), appliqués à contenu ET contenu_defaut pour ne pas
-- écraser d'éventuelles éditions admin.

-- Fiche « Le portail acheteur » : bullet catalogue (texte posé par la migr 163)
UPDATE manuel_sections SET
  contenu = REPLACE(contenu,
    'Le **catalogue** de vos offres actives, regroupé **par catégorie** avec recherche, filtres et pagination, les prix TTC à l''unité et un badge **Disponible / Rupture**. La rupture s''affiche quand votre stock atteint le seuil configuré — l''acheteur ne voit **jamais vos quantités**.',
    'Le **catalogue** de vos offres actives, regroupé **par catégorie** avec recherche, filtre et pagination, et les prix TTC à l''unité. Tout article proposé est **commandable** — l''acheteur ne voit **rien de vos stocks** : c''est vous qui ajustez les quantités, ou retirez des lignes, à l''expédition.'),
  contenu_defaut = REPLACE(contenu_defaut,
    'Le **catalogue** de vos offres actives, regroupé **par catégorie** avec recherche, filtres et pagination, les prix TTC à l''unité et un badge **Disponible / Rupture**. La rupture s''affiche quand votre stock atteint le seuil configuré — l''acheteur ne voit **jamais vos quantités**.',
    'Le **catalogue** de vos offres actives, regroupé **par catégorie** avec recherche, filtre et pagination, et les prix TTC à l''unité. Tout article proposé est **commandable** — l''acheteur ne voit **rien de vos stocks** : c''est vous qui ajustez les quantités, ou retirez des lignes, à l''expédition.')
WHERE slug = 'acheteurs-portail';

-- Fiche « Le portail acheteur » : astuce seuil de rupture → nouvelle astuce
UPDATE manuel_sections SET
  contenu = REPLACE(contenu,
    'Le seuil de rupture se règle par article dans le Stock Labo (seuil min). Un article sans seuil passe en rupture quand son stock tombe à zéro.',
    'Une commande n''engage pas votre stock : à l''expédition, vous ajustez les quantités réellement servies, retirez les lignes que vous ne pouvez pas fournir, ou refusez la commande avec un motif.'),
  contenu_defaut = REPLACE(contenu_defaut,
    'Le seuil de rupture se règle par article dans le Stock Labo (seuil min). Un article sans seuil passe en rupture quand son stock tombe à zéro.',
    'Une commande n''engage pas votre stock : à l''expédition, vous ajustez les quantités réellement servies, retirez les lignes que vous ne pouvez pas fournir, ou refusez la commande avec un motif.')
WHERE slug = 'acheteurs-portail';

-- Fiche « Ventes & commandes acheteurs » : l'expédition permet aussi de retirer des lignes
UPDATE manuel_sections SET
  contenu = REPLACE(contenu,
    'choisissez le labo source, **ajustez les quantités** si nécessaire, fixez la remise éventuelle',
    'choisissez le labo source, **ajustez les quantités** — voire **retirez des lignes** (quantité servie nulle) — si nécessaire, fixez la remise éventuelle'),
  contenu_defaut = REPLACE(contenu_defaut,
    'choisissez le labo source, **ajustez les quantités** si nécessaire, fixez la remise éventuelle',
    'choisissez le labo source, **ajustez les quantités** — voire **retirez des lignes** (quantité servie nulle) — si nécessaire, fixez la remise éventuelle')
WHERE slug = 'acheteurs-ventes';

-- Lexique : définition « Portail acheteur » (texte posé par la migr 169)
UPDATE manuel_sections SET
  contenu = REPLACE(contenu,
    'Il ne voit jamais vos quantités en stock — seulement une disponibilité (disponible / rupture).',
    'Il ne voit jamais vos quantités en stock ; le vendeur ajuste les quantités, ou retire des lignes, à l''expédition.'),
  contenu_defaut = REPLACE(contenu_defaut,
    'Il ne voit jamais vos quantités en stock — seulement une disponibilité (disponible / rupture).',
    'Il ne voit jamais vos quantités en stock ; le vendeur ajuste les quantités, ou retire des lignes, à l''expédition.')
WHERE slug = 'lexique';

-- Rôles & accès : périmètre de l'acheteur (texte posé par la migr 169)
UPDATE manuel_sections SET
  contenu = REPLACE(contenu,
    'ni vos quantités en stock (seulement une disponibilité disponible / rupture), ni vos prix d''achat',
    'ni vos quantités en stock, ni vos prix d''achat'),
  contenu_defaut = REPLACE(contenu_defaut,
    'ni vos quantités en stock (seulement une disponibilité disponible / rupture), ni vos prix d''achat',
    'ni vos quantités en stock, ni vos prix d''achat')
WHERE slug = 'roles';
