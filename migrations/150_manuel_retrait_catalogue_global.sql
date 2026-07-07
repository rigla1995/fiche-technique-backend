-- 150 — Retrait de la notion « Catalogue Global » du manuel.
-- Chaque client gère son propre référentiel : la page Catalogue Global (vue
-- d'affectations mal nommée, orpheline du menu) est supprimée de l'app ; les
-- renvois du manuel pointent désormais vers la fiche Articles du référentiel.
-- REPLACE ciblés sur contenu ET contenu_defaut (no-op si le texte a été édité).

-- demarrage
UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'Voir le [catalogue global](#catalogue-global)', 'Voir les [Articles](#referentiel-articles)'),
  contenu_defaut = REPLACE(contenu_defaut, 'Voir le [catalogue global](#catalogue-global)', 'Voir les [Articles](#referentiel-articles)');

-- faq + support (préfixe commun)
UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'Vérifiez d''abord dans le [catalogue global](#catalogue-global)', 'Vérifiez d''abord dans vos [Articles](#referentiel-articles)'),
  contenu_defaut = REPLACE(contenu_defaut, 'Vérifiez d''abord dans le [catalogue global](#catalogue-global)', 'Vérifiez d''abord dans vos [Articles](#referentiel-articles)');

-- faq (fin de phrase sans lien — l'administration n'ajoute plus rien à un catalogue)
UPDATE manuel_sections SET
  contenu = REPLACE(contenu, ', en précisant le nom exact, la catégorie et l''unité souhaitées : une fois la demande traitée, l''ingrédient est ajouté au catalogue.', ' — ou créez l''article vous-même dans vos [Articles](#referentiel-articles) : chaque compte gère son propre référentiel.'),
  contenu_defaut = REPLACE(contenu_defaut, ', en précisant le nom exact, la catégorie et l''unité souhaitées : une fois la demande traitée, l''ingrédient est ajouté au catalogue.', ' — ou créez l''article vous-même dans vos [Articles](#referentiel-articles) : chaque compte gère son propre référentiel.');

-- faq (titre de question)
UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'Un ingrédient n''existe pas dans le catalogue, que faire ?', 'Un ingrédient n''existe pas dans votre référentiel, que faire ?'),
  contenu_defaut = REPLACE(contenu_defaut, 'Un ingrédient n''existe pas dans le catalogue, que faire ?', 'Un ingrédient n''existe pas dans votre référentiel, que faire ?');

-- onboarding-configuration (lien en fin de liste « Unités · Articles · Catalogue global »)
UPDATE manuel_sections SET
  contenu = REPLACE(contenu, ' · [Catalogue global](#catalogue-global)', ''),
  contenu_defaut = REPLACE(contenu_defaut, ' · [Catalogue global](#catalogue-global)', '');

-- referentiel-articles
UPDATE manuel_sections SET
  contenu = REPLACE(contenu, ', puis affinez les affectations dans le [Catalogue Global](#catalogue-global).', ', puis affinez les affectations depuis la fiche de chaque article.'),
  contenu_defaut = REPLACE(contenu_defaut, ', puis affinez les affectations dans le [Catalogue Global](#catalogue-global).', ', puis affinez les affectations depuis la fiche de chaque article.');

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, E'\n- [Catalogue Global](#catalogue-global) — vue d''ensemble des affectations', ''),
  contenu_defaut = REPLACE(contenu_defaut, E'\n- [Catalogue Global](#catalogue-global) — vue d''ensemble des affectations', '');

-- referentiel-import
UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'Après un import, passez par le [Catalogue Global](#catalogue-global) pour ajuster finement quelles activités et quels labos utilisent chaque article.', 'Après un import, ajustez finement quelles activités et quels labos utilisent chaque article depuis sa fiche ([Articles](#referentiel-articles)).'),
  contenu_defaut = REPLACE(contenu_defaut, 'Après un import, passez par le [Catalogue Global](#catalogue-global) pour ajuster finement quelles activités et quels labos utilisent chaque article.', 'Après un import, ajustez finement quelles activités et quels labos utilisent chaque article depuis sa fiche ([Articles](#referentiel-articles)).');

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '- [Catalogue Global](#catalogue-global) — ajuster les affectations après import', '- [Articles](#referentiel-articles) — ajuster les affectations après import'),
  contenu_defaut = REPLACE(contenu_defaut, '- [Catalogue Global](#catalogue-global) — ajuster les affectations après import', '- [Articles](#referentiel-articles) — ajuster les affectations après import');

-- stock-labo
UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'se gère depuis le [Catalogue Global](#catalogue-global)', 'se gère depuis la fiche de l''article ([Articles](#referentiel-articles))'),
  contenu_defaut = REPLACE(contenu_defaut, 'se gère depuis le [Catalogue Global](#catalogue-global)', 'se gère depuis la fiche de l''article ([Articles](#referentiel-articles))');

-- support (l'administration n'ajoute plus d'ingrédient à un catalogue commun)
UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'l''ingrédient est ajouté au [catalogue global](#catalogue-global) et vous pouvez l''ajouter à votre [référentiel](#referentiel-articles)', 'vous pouvez créer l''article dans votre [référentiel](#referentiel-articles) — chaque compte gère ses propres articles'),
  contenu_defaut = REPLACE(contenu_defaut, 'l''ingrédient est ajouté au [catalogue global](#catalogue-global) et vous pouvez l''ajouter à votre [référentiel](#referentiel-articles)', 'vous pouvez créer l''article dans votre [référentiel](#referentiel-articles) — chaque compte gère ses propres articles');

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'Avant de demander l''ajout d''un ingrédient, vérifiez dans le [catalogue global](#catalogue-global)', 'Avant de demander l''ajout d''un ingrédient, vérifiez dans vos [Articles](#referentiel-articles)'),
  contenu_defaut = REPLACE(contenu_defaut, 'Avant de demander l''ajout d''un ingrédient, vérifiez dans le [catalogue global](#catalogue-global)', 'Avant de demander l''ajout d''un ingrédient, vérifiez dans vos [Articles](#referentiel-articles)');

UPDATE manuel_sections SET
  contenu = REPLACE(contenu, '- [Catalogue global](#catalogue-global) — le catalogue d''ingrédients LabFlow', '- [Articles](#referentiel-articles) — votre référentiel d''articles'),
  contenu_defaut = REPLACE(contenu_defaut, '- [Catalogue global](#catalogue-global) — le catalogue d''ingrédients LabFlow', '- [Articles](#referentiel-articles) — votre référentiel d''articles');

-- transferts
UPDATE manuel_sections SET
  contenu = REPLACE(contenu, 'affectez d''abord vos articles aux activités liées au labo depuis le [Catalogue Global](#catalogue-global).', 'affectez d''abord vos articles aux activités liées au labo depuis la fiche de chaque article ([Articles](#referentiel-articles)).'),
  contenu_defaut = REPLACE(contenu_defaut, 'affectez d''abord vos articles aux activités liées au labo depuis le [Catalogue Global](#catalogue-global).', 'affectez d''abord vos articles aux activités liées au labo depuis la fiche de chaque article ([Articles](#referentiel-articles)).');

-- La fiche de l'écran supprimé
DELETE FROM manuel_sections WHERE slug = 'catalogue-global';
