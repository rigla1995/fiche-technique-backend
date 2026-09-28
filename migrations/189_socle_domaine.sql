-- 189 — Lot 1b-2 : socle par domaine (spec docs/lot-1b-spec.md §5).
--   • pertes / client_pertes : suppression des CHECK type_perte IN ('avarie','dechet').
--     Les codes sont désormais ceux de regles.types_perte du domaine du compte
--     (^[a-z0-9_]{2,20}$ — colonne VARCHAR(20) inchangée), validés côté serveur
--     (pertesController, createLaboPerte). labo_pertes n'a jamais eu de CHECK (034).
--   • Brouillons Hôtellerie / Céramique : seeds à la création du compte
--     (regles.unites_seed = unités de MESURE, regles.prestataires_seed = canaux),
--     posés UNIQUEMENT si la clé est absente des règles (l'admin garde la main).
--     Restauration & co : clé absente = défaut [] = comportement actuel.
-- Idempotente (pg_constraint / garde « clé absente ») ; aucune donnée modifiée.

-- Les CHECK ont été créés inline (020:27, 032:8) : leur nom est auto-généré et peut différer sur une
-- base ancienne (schéma marqué appliqué a posteriori). On les retrouve donc par leur DÉFINITION
-- (CHECK sur type_perte) dans pg_constraint, table par table, avec une NOTICE par contrainte
-- supprimée — un DROP IF EXISTS par nom laisserait silencieusement un CHECK en place (→ 23514 → 500
-- à la première perte d'un type de domaine).
DO $$
DECLARE
  v_table TEXT;
  v_con RECORD;
  v_n INT := 0;
BEGIN
  FOREACH v_table IN ARRAY ARRAY['pertes', 'client_pertes', 'labo_pertes'] LOOP
    IF to_regclass(v_table) IS NULL THEN
      RAISE NOTICE 'Migration 189 : table % absente, ignorée', v_table;
      CONTINUE;
    END IF;
    FOR v_con IN
      SELECT conname
        FROM pg_constraint
       WHERE conrelid = to_regclass(v_table)
         AND contype = 'c'
         AND pg_get_constraintdef(oid) ILIKE '%type_perte%'
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', v_table, v_con.conname);
      RAISE NOTICE 'Migration 189 : contrainte %.% supprimée', v_table, v_con.conname;
      v_n := v_n + 1;
    END LOOP;
  END LOOP;
  IF v_n = 0 THEN
    RAISE NOTICE 'Migration 189 : aucun CHECK type_perte à supprimer (déjà fait)';
  END IF;
END $$;

UPDATE domaines_activite
   SET regles = regles || '{"unites_seed": ["pièce", "kg", "L", "m²", "carton"]}'::jsonb
 WHERE slug IN ('hotellerie', 'ceramique')
   AND NOT (regles ? 'unites_seed');

UPDATE domaines_activite
   SET regles = regles || '{"prestataires_seed": []}'::jsonb
 WHERE slug IN ('hotellerie', 'ceramique')
   AND NOT (regles ? 'prestataires_seed');
