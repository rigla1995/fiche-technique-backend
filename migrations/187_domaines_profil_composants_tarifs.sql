-- 187 — Lot 1a : profil de domaine (composants, lexique, règles), grille tarifaire
-- par domaine, domaine du compte + détail de configuration par composant.
--   • domaines_activite : slug fiable (backfill + NOT NULL), lexique/regles JSONB.
--   • tarifs_domaine : surcharges clé par clé (VIDE au déploiement → aucun prix ne change).
--   • domaine_composants : le « menu » de configuration d'un domaine (type technique
--     activite | labo | gerant | acheteurs). Identité pour les domaines existants.
--   • abonnement_config.domaine_id (1 domaine par compte) + abonnement_config_composants
--     (les 4 compteurs nb_* restent des dérivés : Σ nb par type).
--   • profil_entreprise.domaine_id supprimée (colonne morte).
--   • Seeds : Restauration (identité), Hôtellerie + Industrie — Céramique (brouillons V4.4).
--   • Backfill neutre : domaine = l'unique client_domaines du client sinon Restauration ;
--     composants = 1er composant de chaque type ; contrôle Σ = compteurs (RAISE sinon).
-- Idempotente : IF NOT EXISTS / ON CONFLICT / gardes « si aucun composant ».

-- ─── 1) domaines_activite : profil + slug fiable ─────────────────────────────
ALTER TABLE domaines_activite ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE domaines_activite ADD COLUMN IF NOT EXISTS lexique JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE domaines_activite ADD COLUMN IF NOT EXISTS regles  JSONB NOT NULL DEFAULT '{}'::jsonb;

-- Backfill des slugs NULL depuis le nom : minuscules, accents translittérés,
-- [^a-z0-9]+ → '-', trim '-', dédoublonnage par suffixe -2, -3…
DO $$
DECLARE
  r RECORD;
  v_base TEXT;
  v_slug TEXT;
  v_n INT;
BEGIN
  FOR r IN SELECT id, nom FROM domaines_activite WHERE slug IS NULL OR btrim(slug) = '' ORDER BY id LOOP
    v_base := lower(r.nom);
    v_base := translate(v_base,
      'àáâãäåāçćčèéêëēėęîïíīįìôöòóœøōõûüùúūñńÿýßæ',
      'aaaaaaaccceeeeeeeiiiiiioooooooouuuuunnyysa');
    v_base := regexp_replace(v_base, '[^a-z0-9]+', '-', 'g');
    v_base := btrim(v_base, '-');
    IF v_base = '' THEN v_base := 'domaine-' || r.id; END IF;
    v_base := left(v_base, 45);
    v_slug := v_base;
    v_n := 1;
    WHILE EXISTS (SELECT 1 FROM domaines_activite WHERE slug = v_slug AND id <> r.id) LOOP
      v_n := v_n + 1;
      v_slug := v_base || '-' || v_n;
    END LOOP;
    UPDATE domaines_activite SET slug = v_slug WHERE id = r.id;
  END LOOP;
END $$;

ALTER TABLE domaines_activite ALTER COLUMN slug SET NOT NULL;

-- ─── 2) tarifs_domaine : surcharges de la grille par domaine ─────────────────
CREATE TABLE IF NOT EXISTS tarifs_domaine (
  domaine_id INT NOT NULL REFERENCES domaines_activite(id) ON DELETE RESTRICT,
  cle VARCHAR(50) NOT NULL REFERENCES tarifs_config(cle) ON DELETE CASCADE ON UPDATE CASCADE,
  valeur_dt NUMERIC(10,2) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (domaine_id, cle)
);

-- ─── 3) composants d'un domaine ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS domaine_composants (
  id SERIAL PRIMARY KEY,
  domaine_id INT NOT NULL REFERENCES domaines_activite(id) ON DELETE CASCADE,
  code VARCHAR(30) NOT NULL,
  libelle VARCHAR(80) NOT NULL,
  libelle_pluriel VARCHAR(80),
  icone VARCHAR(8),
  aide TEXT,
  type_technique VARCHAR(12) NOT NULL CHECK (type_technique IN ('activite','labo','gerant','acheteurs')),
  vente_active BOOLEAN NOT NULL DEFAULT true,
  production_active BOOLEAN NOT NULL DEFAULT true,
  nb_min INT NOT NULL DEFAULT 0 CHECK (nb_min >= 0),
  nb_max INT CHECK (nb_max IS NULL OR nb_max >= nb_min),
  ordre INT NOT NULL DEFAULT 0,
  actif BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (domaine_id, code)
);

-- ─── 4) domaine du compte + détail par composant ─────────────────────────────
ALTER TABLE abonnement_config ADD COLUMN IF NOT EXISTS domaine_id INT REFERENCES domaines_activite(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_abonnement_config_domaine ON abonnement_config(domaine_id);

CREATE TABLE IF NOT EXISTS abonnement_config_composants (
  abonnement_id INT NOT NULL REFERENCES abonnements(id) ON DELETE CASCADE,
  composant_id INT NOT NULL REFERENCES domaine_composants(id) ON DELETE RESTRICT,
  nb INT NOT NULL DEFAULT 0 CHECK (nb >= 0),
  PRIMARY KEY (abonnement_id, composant_id)
);

-- ─── 5) colonne morte ────────────────────────────────────────────────────────
ALTER TABLE profil_entreprise DROP COLUMN IF EXISTS domaine_id;

-- ─── Seeds : domaines ────────────────────────────────────────────────────────
-- ON CONFLICT (nom) ne pose le slug que s'il est NULL (un domaine existant garde
-- le sien). Garde WHERE NOT EXISTS : si le slug cible est déjà porté par un AUTRE
-- nom, on ne crée rien (l'index unique domaines_activite_slug_key échouerait).
INSERT INTO domaines_activite (nom, slug, description)
SELECT 'Restauration', 'restauration', 'Restaurants, traiteurs, cafétérias, food court'
WHERE NOT EXISTS (SELECT 1 FROM domaines_activite WHERE slug = 'restauration' AND nom <> 'Restauration')
ON CONFLICT (nom) DO UPDATE SET
  slug = COALESCE(domaines_activite.slug, EXCLUDED.slug),
  description = COALESCE(domaines_activite.description, EXCLUDED.description);

INSERT INTO domaines_activite (nom, slug, description)
SELECT 'Hôtellerie', 'hotellerie', 'Hôtels, résidences, clubs : services (restaurant, bar, room service, housekeeping, spa) alimentés par une cuisine centrale et un économat'
WHERE NOT EXISTS (SELECT 1 FROM domaines_activite WHERE slug = 'hotellerie' AND nom <> 'Hôtellerie')
ON CONFLICT (nom) DO UPDATE SET
  slug = COALESCE(domaines_activite.slug, EXCLUDED.slug),
  description = COALESCE(domaines_activite.description, EXCLUDED.description);

INSERT INTO domaines_activite (nom, slug, description)
SELECT 'Industrie — Céramique', 'ceramique', 'Usines et ateliers de céramique : sites de production, entrepôts, showrooms, revendeurs'
WHERE NOT EXISTS (SELECT 1 FROM domaines_activite WHERE slug = 'ceramique' AND nom <> 'Industrie — Céramique')
ON CONFLICT (nom) DO UPDATE SET
  slug = COALESCE(domaines_activite.slug, EXCLUDED.slug),
  description = COALESCE(domaines_activite.description, EXCLUDED.description);

-- ─── Seeds : composants IDENTITÉ pour tout domaine sans composant ────────────
-- (hors hotellerie/ceramique qui reçoivent leur brouillon ci-dessous — SAUF si un
-- domaine homonyme préexistant a déjà des clients rattachés (client_domaines) : il
-- reçoit alors l'identité, jamais le brouillon, pour que ses comptes gardent leurs
-- écrans/contrats/lexique actuels)
INSERT INTO domaine_composants (domaine_id, code, libelle, libelle_pluriel, icone, type_technique, ordre)
SELECT d.id, c.code, c.libelle, c.libelle_pluriel, c.icone, c.type_technique, c.ordre
FROM domaines_activite d
CROSS JOIN (VALUES
  ('activite',  'Activité',       'Activités',      '🏪', 'activite',  1),
  ('labo',      'Labo',           'Labos',          '🏭', 'labo',      2),
  ('gerant',    'Gérant',         'Gérants',        '👤', 'gerant',    3),
  ('acheteurs', 'Base acheteurs', 'Base acheteurs', '🤝', 'acheteurs', 4)
) AS c(code, libelle, libelle_pluriel, icone, type_technique, ordre)
WHERE (d.slug NOT IN ('hotellerie', 'ceramique')
       OR EXISTS (SELECT 1 FROM client_domaines cd WHERE cd.domaine_id = d.id))
  AND NOT EXISTS (SELECT 1 FROM domaine_composants dc WHERE dc.domaine_id = d.id)
ON CONFLICT (domaine_id, code) DO NOTHING;

-- ─── Seeds : Hôtellerie (brouillon V4.4, à corriger par le client) ───────────
-- Garde « aucun composant » : un Hôtellerie préexistant avec clients a reçu l'identité ci-dessus.
INSERT INTO domaine_composants (domaine_id, code, libelle, libelle_pluriel, icone, aide, type_technique, vente_active, production_active, ordre)
SELECT d.id, c.code, c.libelle, c.libelle_pluriel, c.icone, c.aide, c.type_technique, c.vente_active, c.production_active, c.ordre
FROM domaines_activite d
CROSS JOIN (VALUES
  ('restaurant',   'Restaurant',              'Restaurants',              '🍽️', 'Service de restauration qui vend (stock + ventes)',                       'activite',  true,  true,  1),
  ('bar',          'Bar',                     'Bars',                     '🍸', 'Bar / lounge qui vend',                                                    'activite',  true,  true,  2),
  ('room_service', 'Room service',            'Room services',            '🛎️', 'Service en chambre (vente)',                                               'activite',  true,  true,  3),
  ('housekeeping', 'Housekeeping',            'Housekeeping',             '🧹', 'Centre de coût : consomme sans vendre',                                    'activite',  false, true,  4),
  ('spa',          'Spa',                     'Spas',                     '💆', 'Centre de coût : consomme sans vendre',                                    'activite',  false, true,  5),
  ('cuisine',      'Cuisine',                 'Cuisines',                 '👨‍🍳', 'Cuisine centrale : produit et livre les services',                        'labo',      true,  true,  6),
  ('economat',     'Économat / Logistique',   'Économats / Logistique',   '📦', 'Magasin central : stocke et alimente la cuisine, ne produit pas',           'labo',      true,  false, 7),
  ('responsable',  'Responsable de service',  'Responsables de service',  '👤', 'Compte d''accès délégué à un service',                                     'gerant',    true,  true,  8),
  ('client_pro',   'Client professionnel',    'Clients professionnels',   '🤝', 'Carnet de clients B2B (si ventes professionnelles)',                       'acheteurs', true,  true,  9)
) AS c(code, libelle, libelle_pluriel, icone, aide, type_technique, vente_active, production_active, ordre)
WHERE d.slug = 'hotellerie'
  AND NOT EXISTS (SELECT 1 FROM domaine_composants dc WHERE dc.domaine_id = d.id)
ON CONFLICT (domaine_id, code) DO NOTHING;

-- Lexique brouillon Hôtellerie (uniquement les écarts au lexique par défaut ;
-- règles = défauts → regles reste '{}'). Posé une seule fois (lexique vide), et
-- seulement si le brouillon de composants a bien été seedé (code 'restaurant').
UPDATE domaines_activite SET lexique = '{
  "activite":           {"sg": "Service",               "pl": "Services",                "g": "m", "el": false},
  "labo":               {"sg": "Cuisine centrale",      "pl": "Cuisines centrales",      "g": "f", "el": false},
  "produit_utilisable": {"sg": "Consommable",           "pl": "Consommables",            "g": "m", "el": false},
  "produit_vendable":   {"sg": "Prestation vendue",     "pl": "Prestations vendues",     "g": "f", "el": false},
  "produit_valorise":   {"sg": "Prestation catalogue",  "pl": "Prestations catalogue",   "g": "f", "el": false},
  "article":            {"sg": "Fourniture",            "pl": "Fournitures",             "g": "f", "el": false},
  "ingredient":         {"sg": "Composant",             "pl": "Composants",              "g": "m", "el": false},
  "recette":            {"sg": "Fiche de préparation",  "pl": "Fiches de préparation",   "g": "f", "el": false},
  "food_cost":          {"sg": "Coût matière",          "pl": "Coûts matière",           "g": "m", "el": false},
  "transfert":          {"sg": "Livraison interne",     "pl": "Livraisons internes",     "g": "f", "el": false},
  "gerant":             {"sg": "Responsable de service","pl": "Responsables de service", "g": "m", "el": false},
  "acheteur":           {"sg": "Client professionnel",  "pl": "Clients professionnels",  "g": "m", "el": false},
  "pt":                 {"sg": "Préparation",           "pl": "Préparations",            "g": "f", "el": false}
}'::jsonb
WHERE slug = 'hotellerie' AND lexique = '{}'::jsonb
  AND EXISTS (SELECT 1 FROM domaine_composants dc WHERE dc.domaine_id = domaines_activite.id AND dc.code = 'restaurant');

-- ─── Seeds : Industrie — Céramique (brouillon V4.4) ──────────────────────────
INSERT INTO domaine_composants (domaine_id, code, libelle, libelle_pluriel, icone, aide, type_technique, vente_active, production_active, ordre)
SELECT d.id, c.code, c.libelle, c.libelle_pluriel, c.icone, c.aide, c.type_technique, c.vente_active, c.production_active, c.ordre
FROM domaines_activite d
CROSS JOIN (VALUES
  ('usine',       'Site de production',   'Sites de production',   '🏭', 'Usine : fabrique les produits finis, vend aux revendeurs (B2B)',       'labo',      true,  true,  1),
  ('entrepot',    'Entrepôt',             'Entrepôts',             '📦', 'Stockage sans production',                                             'labo',      true,  false, 2),
  ('showroom',    'Showroom / Boutique',  'Showrooms / Boutiques', '🏪', 'Point de vente aux particuliers (B2C)',                                'activite',  true,  true,  3),
  ('atelier',     'Atelier',              'Ateliers',              '🔧', 'Atelier de transformation, alimenté par l''usine',                     'labo',      true,  true,  4),
  ('revendeur',   'Revendeur',            'Revendeurs',            '🤝', 'Carnet de revendeurs (clients professionnels)',                        'acheteurs', true,  true,  5),
  ('responsable', 'Responsable de site',  'Responsables de site',  '👤', 'Compte d''accès délégué à un site',                                    'gerant',    true,  true,  6)
) AS c(code, libelle, libelle_pluriel, icone, aide, type_technique, vente_active, production_active, ordre)
WHERE d.slug = 'ceramique'
  AND NOT EXISTS (SELECT 1 FROM domaine_composants dc WHERE dc.domaine_id = d.id)
ON CONFLICT (domaine_id, code) DO NOTHING;

UPDATE domaines_activite SET lexique = '{
  "activite":           {"sg": "Point de vente",            "pl": "Points de vente",            "g": "m", "el": false},
  "labo":               {"sg": "Site de production",        "pl": "Sites de production",        "g": "m", "el": false},
  "produit_utilisable": {"sg": "Semi-fini",                 "pl": "Semi-finis",                 "g": "m", "el": false},
  "produit_vendable":   {"sg": "Produit fini",              "pl": "Produits finis",             "g": "m", "el": false},
  "produit_valorise":   {"sg": "Produit fini catalogue",    "pl": "Produits finis catalogue",   "g": "m", "el": false},
  "article":            {"sg": "Matière première",          "pl": "Matières premières",         "g": "f", "el": false},
  "ingredient":         {"sg": "Composant",                 "pl": "Composants",                 "g": "m", "el": false},
  "recette":            {"sg": "Nomenclature",              "pl": "Nomenclatures",              "g": "f", "el": false},
  "fiche_technique":    {"sg": "Fiche de coût de revient",  "pl": "Fiches de coût de revient",  "g": "f", "el": false},
  "portion":            {"sg": "Quantité par unité",        "pl": "Quantités par unité",        "g": "f", "el": false},
  "food_cost":          {"sg": "Taux de coût matière",      "pl": "Taux de coût matière",       "g": "m", "el": false},
  "transfert":          {"sg": "Livraison interne",         "pl": "Livraisons internes",        "g": "f", "el": false},
  "acheteur":           {"sg": "Revendeur",                 "pl": "Revendeurs",                 "g": "m", "el": false},
  "gerant":             {"sg": "Responsable de site",       "pl": "Responsables de site",       "g": "m", "el": false},
  "pt":                 {"sg": "Produit fabriqué",          "pl": "Produits fabriqués",         "g": "m", "el": false},
  "supplement":         {"sg": "Option",                    "pl": "Options",                    "g": "f", "el": true},
  "prestataire":        {"sg": "Intermédiaire",             "pl": "Intermédiaires",             "g": "m", "el": true},
  "perte":              {"sg": "Casse / Rebut / Second choix", "pl": "Casses / Rebuts / Seconds choix", "g": "f", "el": false},
  "appro":              {"sg": "Réception",                 "pl": "Réceptions",                 "g": "f", "el": false}
}'::jsonb
WHERE slug = 'ceramique' AND lexique = '{}'::jsonb
  AND EXISTS (SELECT 1 FROM domaine_composants dc WHERE dc.domaine_id = domaines_activite.id AND dc.code = 'usine');

-- ─── Backfill neutre (a)(b)(c)(d) ────────────────────────────────────────────
DO $$
DECLARE
  v_defaut INT;
  r RECORD;
  v_dom INT;
  v_cnt INT;
  v_type TEXT;
  v_nb INT;
  v_comp INT;
  v_types TEXT[] := ARRAY['activite', 'labo', 'gerant', 'acheteurs'];
  v_libelles TEXT[] := ARRAY['Activité', 'Labo', 'Gérant', 'Base acheteurs'];
  v_pluriels TEXT[] := ARRAY['Activités', 'Labos', 'Gérants', 'Base acheteurs'];
  v_icones TEXT[] := ARRAY['🏪', '🏭', '👤', '🤝'];
  i INT;
  s_act INT; s_lab INT; s_ger INT; s_ach INT;
BEGIN
  SELECT id INTO v_defaut FROM domaines_activite WHERE slug = 'restauration';
  IF v_defaut IS NULL THEN
    RAISE EXCEPTION 'Migration 187 : domaine par défaut (slug restauration) introuvable';
  END IF;

  -- (a) abonnement_config.domaine_id : l'unique domaine du client si COUNT = 1, sinon Restauration
  FOR r IN
    SELECT ac.id AS cfg_id, ac.abonnement_id, a.client_id
      FROM abonnement_config ac
      JOIN abonnements a ON a.id = ac.abonnement_id
     WHERE ac.domaine_id IS NULL
     ORDER BY ac.id
  LOOP
    SELECT COUNT(*), MIN(domaine_id) INTO v_cnt, v_dom
      FROM client_domaines WHERE client_id = r.client_id;
    IF v_cnt <> 1 THEN v_dom := v_defaut; END IF;
    UPDATE abonnement_config SET domaine_id = v_dom WHERE id = r.cfg_id;
  END LOOP;

  -- (b) client_domaines du client = exactement le domaine de son DERNIER abonnement
  --     (les domaines multiples sont supprimés : tracés en NOTICE dans le log de migration —
  --     sauvegarde pg_dump avant déploiement, cf. procédure)
  FOR r IN
    SELECT DISTINCT ON (a.client_id) a.client_id, ac.domaine_id,
           (SELECT array_agg(cd.domaine_id ORDER BY cd.domaine_id) FROM client_domaines cd
             WHERE cd.client_id = a.client_id AND cd.domaine_id <> ac.domaine_id) AS autres
      FROM abonnement_config ac
      JOIN abonnements a ON a.id = ac.abonnement_id
     WHERE ac.domaine_id IS NOT NULL
     ORDER BY a.client_id, a.id DESC
  LOOP
    IF r.autres IS NOT NULL THEN
      RAISE NOTICE 'Migration 187 : client % — client_domaines % supprimés (domaine conservé : %)', r.client_id, r.autres, r.domaine_id;
    END IF;
    DELETE FROM client_domaines WHERE client_id = r.client_id AND domaine_id <> r.domaine_id;
    INSERT INTO client_domaines (client_id, domaine_id) VALUES (r.client_id, r.domaine_id)
    ON CONFLICT DO NOTHING;
  END LOOP;

  -- (c) détail par composant : pour chaque config SANS détail, chaque type avec compteur > 0
  --     reçoit son compteur sur le PREMIER composant actif du type (ordre, id) ; création
  --     d'un composant identité si le domaine n'en a aucun de ce type.
  FOR r IN
    SELECT ac.abonnement_id, ac.domaine_id, ac.nb_activites, ac.nb_labos, ac.nb_gerants, ac.nb_acheteurs
      FROM abonnement_config ac
     WHERE ac.domaine_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM abonnement_config_composants acc WHERE acc.abonnement_id = ac.abonnement_id)
     ORDER BY ac.id
  LOOP
    FOR i IN 1..4 LOOP
      v_type := v_types[i];
      v_nb := CASE v_type
                WHEN 'activite'  THEN r.nb_activites
                WHEN 'labo'      THEN r.nb_labos
                WHEN 'gerant'    THEN r.nb_gerants
                ELSE r.nb_acheteurs END;
      IF COALESCE(v_nb, 0) <= 0 THEN CONTINUE; END IF;

      SELECT id INTO v_comp FROM domaine_composants
       WHERE domaine_id = r.domaine_id AND type_technique = v_type AND actif = true
       ORDER BY ordre, id LIMIT 1;
      IF v_comp IS NULL THEN
        -- aucun composant actif de ce type : repli sur un inactif existant portant ce code, sinon création
        INSERT INTO domaine_composants (domaine_id, code, libelle, libelle_pluriel, icone, type_technique, ordre)
        VALUES (r.domaine_id, v_type, v_libelles[i], v_pluriels[i], v_icones[i], v_type,
                (SELECT COALESCE(MAX(ordre), 0) + 1 FROM domaine_composants WHERE domaine_id = r.domaine_id))
        ON CONFLICT (domaine_id, code) DO UPDATE SET actif = true, type_technique = EXCLUDED.type_technique
        RETURNING id INTO v_comp;
      END IF;

      INSERT INTO abonnement_config_composants (abonnement_id, composant_id, nb)
      VALUES (r.abonnement_id, v_comp, v_nb)
      ON CONFLICT (abonnement_id, composant_id) DO UPDATE SET nb = EXCLUDED.nb;
    END LOOP;
  END LOOP;

  -- (d) contrôle : Σ nb par type = compteurs pour CHAQUE config (sinon la migration est annulée)
  --     (acheteurs = MAX : quota/palier, même dérivation que configComposantsService.deriveCompteurs)
  FOR r IN
    SELECT ac.id AS cfg_id, ac.abonnement_id, ac.domaine_id, ac.nb_activites, ac.nb_labos, ac.nb_gerants, ac.nb_acheteurs
      FROM abonnement_config ac ORDER BY ac.id
  LOOP
    IF r.domaine_id IS NULL THEN
      RAISE EXCEPTION 'Migration 187 : abonnement_config % sans domaine_id après backfill', r.cfg_id;
    END IF;
    SELECT
      COALESCE(SUM(CASE WHEN dc.type_technique = 'activite'  THEN acc.nb ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN dc.type_technique = 'labo'      THEN acc.nb ELSE 0 END), 0),
      COALESCE(SUM(CASE WHEN dc.type_technique = 'gerant'    THEN acc.nb ELSE 0 END), 0),
      COALESCE(MAX(CASE WHEN dc.type_technique = 'acheteurs' THEN acc.nb ELSE 0 END), 0)
      INTO s_act, s_lab, s_ger, s_ach
      FROM abonnement_config_composants acc
      JOIN domaine_composants dc ON dc.id = acc.composant_id
     WHERE acc.abonnement_id = r.abonnement_id;
    IF s_act <> r.nb_activites OR s_lab <> r.nb_labos OR s_ger <> r.nb_gerants OR s_ach <> r.nb_acheteurs THEN
      RAISE EXCEPTION 'Migration 187 : incohérence composants/compteurs sur abonnement_config % (activites %/%, labos %/%, gerants %/%, acheteurs %/%)',
        r.cfg_id, s_act, r.nb_activites, s_lab, r.nb_labos, s_ger, r.nb_gerants, s_ach, r.nb_acheteurs;
    END IF;
  END LOOP;
END $$;
