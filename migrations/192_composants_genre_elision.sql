-- 192 — Lot 2b : genre et élision des composants de domaine (spec docs/lot-2b-spec.md §5.4).
--
-- Un libellé de composant (« Cuisine », « Restaurant », « Huilerie ») est accordé dans les textes du
-- serveur et de l'écran par voc.avec(entreeComposant(c)) : « ma cuisine », « mon restaurant ». Il
-- faut donc son genre, et parfois son élision :
--   • genre   VARCHAR(1) NOT NULL DEFAULT 'm', CHECK ('m' | 'f') ;
--   • elision BOOLEAN NULL : NULL = déduite du libellé (voyelle initiale ; « h » et « y » : non) ;
--     l'admin la force pour un h muet (« Huilerie » : vrai → « mon huilerie ») ou un cas que la règle rate.
--
-- Genre féminin posé sur les composants des brouillons, SEULEMENT si code, type technique et libellé
-- sont encore ceux du brouillon (un composant renommé par l'admin n'est pas touché : son genre se pose
-- dans l'onglet Composants de l'admin après le déploiement) :
--   • code 'activite',  type 'activite',  libellé « Activité »       : tous les domaines ;
--   • code 'acheteurs', type 'acheteurs', libellé « Base acheteurs » : tous les domaines ;
--   • code 'cuisine',   type 'labo',      libellé « Cuisine »        : domaine 'hotellerie'.
-- Tous les autres composants des brouillons sont masculins (défaut) : Labo, Gérant ; Hôtellerie :
-- Restaurant, Bar, Room service, Housekeeping, Spa, Économat / Logistique, Responsable de service,
-- Client professionnel ; Céramique (base locale seulement) : ses 6 composants.
-- Aucune élision n'est posée : NULL (déduite) partout.
--
-- Idempotente : colonnes et contrainte « si absentes », mises à jour gardées par genre <> 'f'. Un
-- second passage ne change rien (0 ligne). Chaque mise à jour est tracée par un RAISE NOTICE.

ALTER TABLE domaine_composants ADD COLUMN IF NOT EXISTS genre VARCHAR(1) NOT NULL DEFAULT 'm';
ALTER TABLE domaine_composants ADD COLUMN IF NOT EXISTS elision BOOLEAN NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'domaine_composants'::regclass
       AND conname = 'domaine_composants_genre_check'
  ) THEN
    ALTER TABLE domaine_composants
      ADD CONSTRAINT domaine_composants_genre_check CHECK (genre IN ('m', 'f'));
  END IF;
END $$;

COMMENT ON COLUMN domaine_composants.genre IS
  'Genre grammatical du libellé (m | f) : accords « mon / ma » du composant (lot 2b, migration 192)';
COMMENT ON COLUMN domaine_composants.elision IS
  'Élision devant le libellé : true | false | NULL = déduite de la voyelle initiale (lot 2b, migration 192)';

DO $$
DECLARE
  n INT;
BEGIN
  UPDATE domaine_composants
     SET genre = 'f'
   WHERE genre <> 'f'
     AND code = 'activite' AND type_technique = 'activite' AND libelle = 'Activité';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '192 : genre f posé sur % composant(s) « Activité » (code activite)', n;

  UPDATE domaine_composants
     SET genre = 'f'
   WHERE genre <> 'f'
     AND code = 'acheteurs' AND type_technique = 'acheteurs' AND libelle = 'Base acheteurs';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '192 : genre f posé sur % composant(s) « Base acheteurs » (code acheteurs)', n;

  UPDATE domaine_composants dc
     SET genre = 'f'
    FROM domaines_activite d
   WHERE d.id = dc.domaine_id AND d.slug = 'hotellerie'
     AND dc.genre <> 'f'
     AND dc.code = 'cuisine' AND dc.type_technique = 'labo' AND dc.libelle = 'Cuisine';
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '192 : genre f posé sur % composant(s) « Cuisine » (code cuisine, domaine hotellerie)', n;
END $$;
