-- 188 — Lot 1b-1 : unités opérationnelles, arbre de rattachement, transferts généralisés,
-- traçabilité des lignes de stock d'un transfert.
--   • unites_operationnelles : 1 ligne par activité et par labo (1:1), composant du domaine,
--     flags vente_active / production_active (TRUE au backfill, jamais copiés du composant).
--   • unites_op_composant_defaut(entreprise, type) : 1er composant actif du type dans le
--     domaine du DERNIER abonnement du compte (NULL toléré partout).
--   • Triggers AFTER INSERT sur activites / labos → création automatique de l'unité.
--   • unites_operationnelles_liens : ARBRE (une source par destination, source = labo),
--     contrôles BEFORE (même entreprise, source labo, anti-cycle — codes P0001).
--   • UN SEUL ÉCRIVAIN : activites.labo_id (existante) et labos.labo_parent_id (nouvelle)
--     restent la saisie ; des triggers synchronisent les liens.
--   • labo_transfers : activite_id nullable, labo_dest_id (CASCADE), source/dest_unite_id
--     (informatifs, SET NULL), CHECK nommés, index.
--   • transfert_id sur les 4 tables de stock + index partiels + backfill BIJECTIF.
--   • Pré-contrôle stock_labo_daily.type_appro ('transfert' → NOTICE ; NULL → 'manuel').
-- Idempotente : IF NOT EXISTS / DO $$ pg_constraint / CREATE OR REPLACE / ON CONFLICT.
-- ⚠️ La table `unites` (unités de MESURE) n'est PAS concernée.

-- ─── 0) Pré-contrôle type_appro de stock_labo_daily (avant tout changement de filtre) ──
DO $$
DECLARE
  v_transfert INT;
  v_null INT;
BEGIN
  SELECT COUNT(*) INTO v_transfert FROM stock_labo_daily WHERE type_appro = 'transfert';
  IF v_transfert > 0 THEN
    RAISE NOTICE 'Migration 188 : % ligne(s) stock_labo_daily déjà en type_appro = ''transfert'' — conservées (comptées comme entrées par la règle unique)', v_transfert;
  END IF;
  SELECT COUNT(*) INTO v_null FROM stock_labo_daily WHERE type_appro IS NULL;
  IF v_null > 0 THEN
    UPDATE stock_labo_daily SET type_appro = 'manuel' WHERE type_appro IS NULL;
    RAISE NOTICE 'Migration 188 : % ligne(s) stock_labo_daily type_appro NULL → ''manuel''', v_null;
  END IF;
END $$;

-- ─── 1) Unités opérationnelles ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS unites_operationnelles (
  id SERIAL PRIMARY KEY,
  entreprise_id INT NOT NULL REFERENCES profil_entreprise(id) ON DELETE CASCADE,
  type_technique VARCHAR(12) NOT NULL CHECK (type_technique IN ('activite','labo')),
  activite_id INT UNIQUE REFERENCES activites(id) ON DELETE CASCADE,
  labo_id INT UNIQUE REFERENCES labos(id) ON DELETE CASCADE,
  composant_id INT REFERENCES domaine_composants(id) ON DELETE SET NULL,
  vente_active BOOLEAN NOT NULL DEFAULT true,
  production_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((activite_id IS NOT NULL) <> (labo_id IS NOT NULL)),
  CHECK ((type_technique = 'activite' AND activite_id IS NOT NULL) OR (type_technique = 'labo' AND labo_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_unites_op_entreprise ON unites_operationnelles(entreprise_id);

-- Composant par défaut d'une unité : 1er composant actif du type dans le domaine du
-- DERNIER abonnement du compte (NULL si aucun abonnement / domaine / composant).
CREATE OR REPLACE FUNCTION unites_op_composant_defaut(p_entreprise_id INT, p_type TEXT)
RETURNS INT
LANGUAGE sql
STABLE
AS $$
  SELECT dc.id
    FROM domaine_composants dc
   WHERE dc.domaine_id = (
           SELECT ac.domaine_id
             FROM profil_entreprise pe
             JOIN abonnements a ON a.client_id = pe.client_id
             JOIN abonnement_config ac ON ac.abonnement_id = a.id
            WHERE pe.id = p_entreprise_id
            ORDER BY a.id DESC
            LIMIT 1)
     AND dc.type_technique = p_type
     AND dc.actif
   ORDER BY dc.ordre, dc.id
   LIMIT 1
$$;

-- Création automatique de l'unité à l'insertion d'une activité / d'un labo
-- (entreprise_id NOT NULL sur les deux tables ; les seeds SQL obtiennent leur unité).
CREATE OR REPLACE FUNCTION trg_unites_op_from_activite()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO unites_operationnelles (entreprise_id, type_technique, activite_id, composant_id)
  VALUES (NEW.entreprise_id, 'activite', NEW.id, unites_op_composant_defaut(NEW.entreprise_id, 'activite'))
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION trg_unites_op_from_labo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO unites_operationnelles (entreprise_id, type_technique, labo_id, composant_id)
  VALUES (NEW.entreprise_id, 'labo', NEW.id, unites_op_composant_defaut(NEW.entreprise_id, 'labo'))
  ON CONFLICT DO NOTHING;
  RETURN NULL;
END $$;

-- Noms préfixés 01/02 : PostgreSQL déclenche les triggers d'un même événement dans
-- l'ordre alphabétique — l'unité doit exister AVANT la synchronisation du lien (02).
DROP TRIGGER IF EXISTS trg_activites_01_unite_op ON activites;
CREATE TRIGGER trg_activites_01_unite_op
  AFTER INSERT ON activites
  FOR EACH ROW EXECUTE FUNCTION trg_unites_op_from_activite();

DROP TRIGGER IF EXISTS trg_labos_01_unite_op ON labos;
CREATE TRIGGER trg_labos_01_unite_op
  AFTER INSERT ON labos
  FOR EACH ROW EXECUTE FUNCTION trg_unites_op_from_labo();

-- Backfill : 1 unité par activité / labo existants, flags laissés à TRUE.
INSERT INTO unites_operationnelles (entreprise_id, type_technique, activite_id, composant_id)
SELECT a.entreprise_id, 'activite', a.id, unites_op_composant_defaut(a.entreprise_id, 'activite')
  FROM activites a
 WHERE NOT EXISTS (SELECT 1 FROM unites_operationnelles uo WHERE uo.activite_id = a.id)
ON CONFLICT DO NOTHING;

INSERT INTO unites_operationnelles (entreprise_id, type_technique, labo_id, composant_id)
SELECT l.entreprise_id, 'labo', l.id, unites_op_composant_defaut(l.entreprise_id, 'labo')
  FROM labos l
 WHERE NOT EXISTS (SELECT 1 FROM unites_operationnelles uo WHERE uo.labo_id = l.id)
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  v_bad INT;
  v_act INT;
  v_lab INT;
BEGIN
  SELECT COUNT(*) INTO v_bad FROM unites_operationnelles WHERE NOT vente_active OR NOT production_active;
  IF v_bad > 0 THEN
    RAISE EXCEPTION 'Migration 188 : % unité(s) avec un flag à FALSE après backfill (attendu 0)', v_bad;
  END IF;
  SELECT COUNT(*) INTO v_act FROM activites a WHERE NOT EXISTS (SELECT 1 FROM unites_operationnelles uo WHERE uo.activite_id = a.id);
  SELECT COUNT(*) INTO v_lab FROM labos l WHERE NOT EXISTS (SELECT 1 FROM unites_operationnelles uo WHERE uo.labo_id = l.id);
  IF v_act > 0 OR v_lab > 0 THEN
    RAISE EXCEPTION 'Migration 188 : unités manquantes après backfill (activités %, labos %)', v_act, v_lab;
  END IF;
END $$;

-- ─── 2) Rattachement = ARBRE (une seule source par destination ; source = labo) ──
CREATE TABLE IF NOT EXISTS unites_operationnelles_liens (
  source_unite_id INT NOT NULL REFERENCES unites_operationnelles(id) ON DELETE CASCADE,
  dest_unite_id   INT NOT NULL REFERENCES unites_operationnelles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (source_unite_id, dest_unite_id),
  CHECK (source_unite_id <> dest_unite_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_unites_op_liens_dest ON unites_operationnelles_liens(dest_unite_id);

ALTER TABLE labos ADD COLUMN IF NOT EXISTS labo_parent_id INT REFERENCES labos(id) ON DELETE SET NULL;

-- Contrôles d'intégrité d'un lien : (a) même entreprise, (b) source de type labo,
-- (c) anti-cycle en remontant les sources depuis la source proposée.
-- Codes (SQLSTATE P0001, message = le code) : ENTREPRISE_DIFFERENTE, SOURCE_NON_LABO, CYCLE_INTERDIT.
CREATE OR REPLACE FUNCTION trg_unites_op_liens_check()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_src RECORD;
  v_dst RECORD;
  v_cycle BOOLEAN;
BEGIN
  SELECT id, entreprise_id, type_technique INTO v_src FROM unites_operationnelles WHERE id = NEW.source_unite_id;
  SELECT id, entreprise_id, type_technique INTO v_dst FROM unites_operationnelles WHERE id = NEW.dest_unite_id;
  IF v_src.id IS NULL OR v_dst.id IS NULL THEN
    RAISE EXCEPTION 'ENTREPRISE_DIFFERENTE' USING ERRCODE = 'P0001';
  END IF;
  IF v_src.entreprise_id <> v_dst.entreprise_id THEN
    RAISE EXCEPTION 'ENTREPRISE_DIFFERENTE' USING ERRCODE = 'P0001';
  END IF;
  IF v_src.type_technique <> 'labo' THEN
    RAISE EXCEPTION 'SOURCE_NON_LABO' USING ERRCODE = 'P0001';
  END IF;
  -- Remonter les sources depuis la source proposée : si l'on atteint la destination, cycle.
  WITH RECURSIVE up AS (
    SELECT NEW.source_unite_id AS uid, 1 AS depth
    UNION ALL
    SELECT l.source_unite_id, up.depth + 1
      FROM unites_operationnelles_liens l
      JOIN up ON l.dest_unite_id = up.uid
     WHERE up.depth < 100
       AND NOT (TG_OP = 'UPDATE' AND l.dest_unite_id = OLD.dest_unite_id AND l.source_unite_id = OLD.source_unite_id)
  )
  SELECT EXISTS (SELECT 1 FROM up WHERE uid = NEW.dest_unite_id) INTO v_cycle;
  IF v_cycle THEN
    RAISE EXCEPTION 'CYCLE_INTERDIT' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_unites_op_liens_check ON unites_operationnelles_liens;
CREATE TRIGGER trg_unites_op_liens_check
  BEFORE INSERT OR UPDATE ON unites_operationnelles_liens
  FOR EACH ROW EXECUTE FUNCTION trg_unites_op_liens_check();

-- Activités dont le labo appartient à une AUTRE entreprise (createActivite ne le vérifiait
-- pas) : tracées en NOTICE puis détachées, AVANT le backfill des liens et les triggers de synchro.
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT a.id AS activite_id, a.labo_id, a.entreprise_id, l.entreprise_id AS labo_entreprise_id
      FROM activites a
      JOIN labos l ON l.id = a.labo_id
     WHERE l.entreprise_id <> a.entreprise_id
     ORDER BY a.id
  LOOP
    RAISE NOTICE 'Migration 188 : activité % (entreprise %) rattachée au labo % de l''entreprise % — labo_id remis à NULL', r.activite_id, r.entreprise_id, r.labo_id, r.labo_entreprise_id;
    UPDATE activites SET labo_id = NULL WHERE id = r.activite_id;
  END LOOP;
END $$;

-- Backfill des liens depuis activites.labo_id (même entreprise).
INSERT INTO unites_operationnelles_liens (source_unite_id, dest_unite_id)
SELECT ul.id, ua.id
  FROM activites a
  JOIN labos l ON l.id = a.labo_id AND l.entreprise_id = a.entreprise_id
  JOIN unites_operationnelles ul ON ul.labo_id = l.id
  JOIN unites_operationnelles ua ON ua.activite_id = a.id
ON CONFLICT DO NOTHING;

-- Synchronisation des liens depuis les colonnes (un seul écrivain : la colonne).
--   NULL → suppression du lien de la destination ; sinon INSERT … ON CONFLICT (dest) DO UPDATE.
--   Les contrôles du trigger BEFORE (cycle, entreprise, type) font échouer l'UPDATE de la
--   colonne : le service mappe P0001 → 400.
CREATE OR REPLACE FUNCTION trg_unites_op_sync_lien_activite()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_dest INT;
  v_src INT;
BEGIN
  SELECT id INTO v_dest FROM unites_operationnelles WHERE activite_id = NEW.id;
  IF v_dest IS NULL THEN RETURN NULL; END IF;
  IF NEW.labo_id IS NULL THEN
    DELETE FROM unites_operationnelles_liens WHERE dest_unite_id = v_dest;
    RETURN NULL;
  END IF;
  SELECT id INTO v_src FROM unites_operationnelles WHERE labo_id = NEW.labo_id;
  IF v_src IS NULL THEN RETURN NULL; END IF;
  INSERT INTO unites_operationnelles_liens (source_unite_id, dest_unite_id)
  VALUES (v_src, v_dest)
  ON CONFLICT (dest_unite_id) DO UPDATE SET source_unite_id = EXCLUDED.source_unite_id;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION trg_unites_op_sync_lien_labo()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_dest INT;
  v_src INT;
BEGIN
  SELECT id INTO v_dest FROM unites_operationnelles WHERE labo_id = NEW.id;
  IF v_dest IS NULL THEN RETURN NULL; END IF;
  IF NEW.labo_parent_id IS NULL THEN
    DELETE FROM unites_operationnelles_liens WHERE dest_unite_id = v_dest;
    RETURN NULL;
  END IF;
  SELECT id INTO v_src FROM unites_operationnelles WHERE labo_id = NEW.labo_parent_id;
  IF v_src IS NULL THEN RETURN NULL; END IF;
  INSERT INTO unites_operationnelles_liens (source_unite_id, dest_unite_id)
  VALUES (v_src, v_dest)
  ON CONFLICT (dest_unite_id) DO UPDATE SET source_unite_id = EXCLUDED.source_unite_id;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_activites_02_sync_lien ON activites;
CREATE TRIGGER trg_activites_02_sync_lien
  AFTER INSERT OR UPDATE OF labo_id ON activites
  FOR EACH ROW EXECUTE FUNCTION trg_unites_op_sync_lien_activite();

DROP TRIGGER IF EXISTS trg_labos_02_sync_lien ON labos;
CREATE TRIGGER trg_labos_02_sync_lien
  AFTER INSERT OR UPDATE OF labo_parent_id ON labos
  FOR EACH ROW EXECUTE FUNCTION trg_unites_op_sync_lien_labo();

-- Contrôle : liens = activites.labo_id (même entreprise)
DO $$
DECLARE
  v_attendu INT;
  v_liens INT;
BEGIN
  SELECT COUNT(*) INTO v_attendu
    FROM activites a JOIN labos l ON l.id = a.labo_id AND l.entreprise_id = a.entreprise_id;
  SELECT COUNT(*) INTO v_liens
    FROM unites_operationnelles_liens li
    JOIN unites_operationnelles ua ON ua.id = li.dest_unite_id AND ua.type_technique = 'activite';
  IF v_attendu <> v_liens THEN
    RAISE EXCEPTION 'Migration 188 : liens activité (%) ≠ activites.labo_id (%)', v_liens, v_attendu;
  END IF;
END $$;

-- ─── 3) Transferts : labo_transfers généralisée ──────────────────────────────
ALTER TABLE labo_transfers ALTER COLUMN activite_id DROP NOT NULL;
ALTER TABLE labo_transfers ADD COLUMN IF NOT EXISTS labo_dest_id INT REFERENCES labos(id) ON DELETE CASCADE;
ALTER TABLE labo_transfers ADD COLUMN IF NOT EXISTS source_unite_id INT REFERENCES unites_operationnelles(id) ON DELETE SET NULL;
ALTER TABLE labo_transfers ADD COLUMN IF NOT EXISTS dest_unite_id   INT REFERENCES unites_operationnelles(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_labo_transfers_dest') THEN
    ALTER TABLE labo_transfers ADD CONSTRAINT chk_labo_transfers_dest
      CHECK ((activite_id IS NOT NULL) <> (labo_dest_id IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_labo_transfers_no_self') THEN
    ALTER TABLE labo_transfers ADD CONSTRAINT chk_labo_transfers_no_self
      CHECK (labo_dest_id IS NULL OR labo_dest_id <> labo_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_labo_transfers_labo_dest ON labo_transfers(labo_dest_id, date_transfert);

-- Backfill informatif des unités (la vérité de purge reste labo_id / activite_id / labo_dest_id).
UPDATE labo_transfers lt
   SET source_unite_id = uo.id
  FROM unites_operationnelles uo
 WHERE uo.labo_id = lt.labo_id AND lt.source_unite_id IS NULL;

UPDATE labo_transfers lt
   SET dest_unite_id = uo.id
  FROM unites_operationnelles uo
 WHERE uo.activite_id = lt.activite_id AND lt.dest_unite_id IS NULL AND lt.activite_id IS NOT NULL;

UPDATE labo_transfers lt
   SET dest_unite_id = uo.id
  FROM unites_operationnelles uo
 WHERE uo.labo_id = lt.labo_dest_id AND lt.dest_unite_id IS NULL AND lt.labo_dest_id IS NOT NULL;

-- ─── 4) Traçabilité des lignes de stock d'un transfert ───────────────────────
ALTER TABLE stock_labo_daily           ADD COLUMN IF NOT EXISTS transfert_id INT REFERENCES labo_transfers(id) ON DELETE SET NULL;
ALTER TABLE stock_entreprise_daily     ADD COLUMN IF NOT EXISTS transfert_id INT REFERENCES labo_transfers(id) ON DELETE SET NULL;
ALTER TABLE stock_labo_pt_daily        ADD COLUMN IF NOT EXISTS transfert_id INT REFERENCES labo_transfers(id) ON DELETE SET NULL;
ALTER TABLE stock_produits_transformes ADD COLUMN IF NOT EXISTS transfert_id INT REFERENCES labo_transfers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_stock_labo_daily_transfert_id
  ON stock_labo_daily(transfert_id) WHERE transfert_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stock_entreprise_daily_transfert_id
  ON stock_entreprise_daily(transfert_id) WHERE transfert_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_slpt_transfert_id
  ON stock_labo_pt_daily(transfert_id) WHERE transfert_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spt_transfert_id
  ON stock_produits_transformes(transfert_id) WHERE transfert_id IS NOT NULL;

-- Backfill STRICTEMENT BIJECTIF : une ligne n'est liée que si elle est l'UNIQUE candidate du
-- transfert (même unité, même article/produit, même date, quantité ±, type attendu,
-- transfert_id IS NULL) ET que ce transfert est l'UNIQUE candidat pour elle ; sinon NULL.
-- Les lignes déjà liées ne sont jamais réattribuées ; les transferts seedés sans miroir
-- restent sans ligne (toléré).
DO $$
DECLARE
  n1 INT; n2 INT; n3 INT; n4 INT;
BEGIN
  -- (a) miroir de sortie ARTICLE au labo source : stock_labo_daily 'manuel', -qty
  WITH cand AS (
    SELECT lt.id AS tid, s.id AS sid
      FROM labo_transfers lt
      JOIN stock_labo_daily s
        ON s.labo_id = lt.labo_id AND s.ingredient_id = lt.ingredient_id
       AND s.date_appro = lt.date_transfert AND s.quantite = -lt.quantite
       AND s.type_appro = 'manuel' AND s.transfert_id IS NULL
     WHERE lt.ingredient_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM stock_labo_daily x WHERE x.transfert_id = lt.id)
  ),
  uniq AS (
    SELECT tid, sid FROM cand
     WHERE tid IN (SELECT tid FROM cand GROUP BY tid HAVING COUNT(*) = 1)
       AND sid IN (SELECT sid FROM cand GROUP BY sid HAVING COUNT(*) = 1)
  ),
  upd AS (
    UPDATE stock_labo_daily s SET transfert_id = u.tid FROM uniq u WHERE s.id = u.sid RETURNING 1
  )
  SELECT COUNT(*) INTO n1 FROM upd;

  -- (b) entrée ARTICLE à l'activité : stock_entreprise_daily 'transfert', +qty
  WITH cand AS (
    SELECT lt.id AS tid, s.id AS sid
      FROM labo_transfers lt
      JOIN stock_entreprise_daily s
        ON s.activite_id = lt.activite_id AND s.ingredient_id = lt.ingredient_id
       AND s.date_appro = lt.date_transfert AND s.quantite = lt.quantite
       AND s.type_appro = 'transfert' AND s.transfert_id IS NULL
     WHERE lt.ingredient_id IS NOT NULL AND lt.activite_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM stock_entreprise_daily x WHERE x.transfert_id = lt.id)
  ),
  uniq AS (
    SELECT tid, sid FROM cand
     WHERE tid IN (SELECT tid FROM cand GROUP BY tid HAVING COUNT(*) = 1)
       AND sid IN (SELECT sid FROM cand GROUP BY sid HAVING COUNT(*) = 1)
  ),
  upd AS (
    UPDATE stock_entreprise_daily s SET transfert_id = u.tid FROM uniq u WHERE s.id = u.sid RETURNING 1
  )
  SELECT COUNT(*) INTO n2 FROM upd;

  -- (c) miroir de sortie PT au labo source : stock_labo_pt_daily type NULL, -qty
  WITH cand AS (
    SELECT lt.id AS tid, s.id AS sid
      FROM labo_transfers lt
      JOIN stock_labo_pt_daily s
        ON s.labo_id = lt.labo_id AND s.produit_id = lt.produit_id
       AND s.date_appro = lt.date_transfert AND s.quantite = -lt.quantite
       AND s.type_appro IS NULL AND s.transfert_id IS NULL
     WHERE lt.produit_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM stock_labo_pt_daily x WHERE x.transfert_id = lt.id)
  ),
  uniq AS (
    SELECT tid, sid FROM cand
     WHERE tid IN (SELECT tid FROM cand GROUP BY tid HAVING COUNT(*) = 1)
       AND sid IN (SELECT sid FROM cand GROUP BY sid HAVING COUNT(*) = 1)
  ),
  upd AS (
    UPDATE stock_labo_pt_daily s SET transfert_id = u.tid FROM uniq u WHERE s.id = u.sid RETURNING 1
  )
  SELECT COUNT(*) INTO n3 FROM upd;

  -- (d) entrée PT à l'activité : stock_produits_transformes +qty (hors consommation 'PT')
  WITH cand AS (
    SELECT lt.id AS tid, s.id AS sid
      FROM labo_transfers lt
      JOIN stock_produits_transformes s
        ON s.activite_id = lt.activite_id AND s.produit_id = lt.produit_id
       AND s.date_appro = lt.date_transfert AND s.quantite = lt.quantite
       AND s.type_appro IS DISTINCT FROM 'PT' AND s.transfert_id IS NULL
     WHERE lt.produit_id IS NOT NULL AND lt.activite_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM stock_produits_transformes x WHERE x.transfert_id = lt.id)
  ),
  uniq AS (
    SELECT tid, sid FROM cand
     WHERE tid IN (SELECT tid FROM cand GROUP BY tid HAVING COUNT(*) = 1)
       AND sid IN (SELECT sid FROM cand GROUP BY sid HAVING COUNT(*) = 1)
  ),
  upd AS (
    UPDATE stock_produits_transformes s SET transfert_id = u.tid FROM uniq u WHERE s.id = u.sid RETURNING 1
  )
  SELECT COUNT(*) INTO n4 FROM upd;

  RAISE NOTICE 'Migration 188 : transfert_id backfillé (bijectif) — stock_labo_daily %, stock_entreprise_daily %, stock_labo_pt_daily %, stock_produits_transformes %', n1, n2, n3, n4;
END $$;
