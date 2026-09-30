-- 191 — Lot 2a : lexique v2, corrections des BROUILLONS Hôtellerie et Céramique
--       (spec docs/lot-2-spec.md §1.5).
--
-- La migration 187 a posé deux lexiques brouillons. Le lexique v2 ajoute la forme courte
-- (`court`) et les clés dérivées ; les brouillons sont corrigés ici :
--   • Hôtellerie : food_cost « Coût matière » (identique à cout_matiere) → « Ratio matière » (m) ;
--                  labo.court → « Cuisine » ; pt.court → « Prépa ».
--   • Céramique  : surcharge `perte` (« Casse / Rebut / Second choix ») RETIRÉE — les types de
--                  perte vivent dans regles.types_perte, le terme redevient « Perte » ;
--                  labo.court → « Site » ; pt.court → « PF » ; fiche_technique.court → « FCR » ;
--                  appro.court → « Réception / Réceptions ».
--
-- Garde, clé par clé : la correction n'est appliquée QUE si la valeur en base est encore
-- exactement celle du brouillon de la migration 187 (égalité JSONB, insensible à l'ordre des
-- champs). Une entrée déjà corrigée par l'admin — ou par un premier passage de cette
-- migration — n'est jamais écrasée. Idempotente. Le domaine Restauration (et tout autre
-- domaine) n'est pas touché par ces corrections. Chaque décision est tracée par un RAISE NOTICE.
-- Ce sont toujours des brouillons, à corriger par le client dans l'onglet Lexique de l'admin.
--
-- ÉTAPE 0 (tous les domaines, avant les corrections) — entrées enregistrées par l'interface
-- d'avant le lot 2. L'onglet Lexique du lot 1a n'envoyait `pl`, `g` et `el` que s'ils différaient
-- du défaut, et le serveur complétait par le défaut : { ...défaut, ...écart }. Le lexique v2
-- (§1.1) lit une entrée dont `sg` est surchargé telle quelle : pl = sg, g = 'm', el = false.
-- Sans cette étape, un lexique ré-enregistré par l'ancienne interface changerait de genre et
-- d'élision au déploiement (« le fiche de préparation »), et les gardes d'égalité ci-dessous ne
-- reconnaîtraient plus les brouillons 187. Chaque entrée qui a un `sg` mais pas de `pl`, de `g`
-- ou d'`el` valides reçoit donc les champs manquants du défaut D'AVANT le lot 2 (les 32 clés
-- d'origine, table ci-dessous) : la résolution reste exactement celle d'avant. Idempotente.
-- Une clé inconnue de cette table (jamais proposée par l'ancienne interface) n'est pas touchée.

DO $$
DECLARE
  d RECORD;
  e RECORD;
  v_pl TEXT;
  v_g TEXT;
  v_el BOOLEAN;
  v_new JSONB;
  v_faits INT := 0;
BEGIN
  FOR d IN
    SELECT id, slug, lexique FROM domaines_activite
     WHERE lexique IS NOT NULL AND jsonb_typeof(lexique) = 'object'
     ORDER BY id
  LOOP
    FOR e IN SELECT key, value FROM jsonb_each(d.lexique) ORDER BY key LOOP
      CONTINUE WHEN jsonb_typeof(e.value) <> 'object';
      CONTINUE WHEN COALESCE(btrim(e.value ->> 'sg'), '') = '';
      CONTINUE WHEN COALESCE(btrim(e.value ->> 'pl'), '') <> ''
                AND COALESCE(e.value ->> 'g', '') IN ('m', 'f')
                AND jsonb_typeof(e.value -> 'el') IS NOT DISTINCT FROM 'boolean';

      v_pl := NULL;
      SELECT t.pl, t.g, t.el INTO v_pl, v_g, v_el FROM (VALUES
        -- (clé, pluriel, genre, élision) du lexique par défaut d'avant le lot 2
        ('activite',           'Activités',            'f', true),
        ('labo',               'Labos',                'm', false),
        ('produit_vendable',   'Produits vendables',   'm', false),
        ('produit_utilisable', 'Produits utilisables', 'm', false),
        ('produit_valorise',   'Produits valorisés',   'm', false),
        ('article',            'Articles',             'm', true),
        ('ingredient',         'Ingrédients',          'm', true),
        ('recette',            'Recettes',             'f', false),
        ('fiche_technique',    'Fiches techniques',    'f', false),
        ('portion',            'Portions',             'f', false),
        ('food_cost',          'Food costs',           'm', false),
        ('cout_matiere',       'Coûts matière',        'm', false),
        ('marge',              'Marges',               'f', false),
        ('transfert',          'Transferts',           'm', false),
        ('appro',              'Approvisionnements',   'm', true),
        ('perte',              'Pertes',               'f', false),
        ('inventaire',         'Inventaires',          'm', true),
        ('vente',              'Ventes',               'f', false),
        ('acheteur',           'Acheteurs',            'm', true),
        ('gerant',             'Gérants',              'm', false),
        ('fournisseur',        'Fournisseurs',         'm', false),
        ('depot',              'Dépôts',               'm', false),
        ('pt',                 'Produits transformés', 'm', false),
        ('stock',              'Stocks',               'm', false),
        ('prestataire',        'Prestataires',         'm', false),
        ('supplement',         'Suppléments',          'm', false),
        ('espace_activites',   'Espaces Activités',    'm', true),
        ('espace_labo',        'Espaces Labo',         'm', true),
        ('espace_vente',       'Espaces Vente',        'm', true),
        ('espace_acheteurs',   'Espaces Acheteurs',    'm', true),
        ('espace_produits',    'Espaces Produit',      'm', true),
        ('referentiel',        'Référentiels',         'm', false)
      ) AS t(cle, pl, g, el) WHERE t.cle = e.key;

      IF v_pl IS NULL THEN
        RAISE NOTICE 'Migration 191 : entrée incomplète %.% hors des 32 clés d''origine — laissée telle quelle', d.slug, e.key;
        CONTINUE;
      END IF;

      v_new := e.value;
      IF COALESCE(btrim(v_new ->> 'pl'), '') = '' THEN
        v_new := jsonb_set(v_new, '{pl}', to_jsonb(v_pl), true);
      END IF;
      IF COALESCE(v_new ->> 'g', '') NOT IN ('m', 'f') THEN
        v_new := jsonb_set(v_new, '{g}', to_jsonb(v_g), true);
      END IF;
      IF jsonb_typeof(v_new -> 'el') IS DISTINCT FROM 'boolean' THEN
        v_new := jsonb_set(v_new, '{el}', to_jsonb(v_el), true);
      END IF;

      UPDATE domaines_activite SET lexique = jsonb_set(lexique, ARRAY[e.key], v_new, true) WHERE id = d.id;
      v_faits := v_faits + 1;
      RAISE NOTICE 'Migration 191 : entrée complétée %.% (pl, g, el du défaut d''avant le lot 2) — %', d.slug, e.key, v_new::text;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Migration 191 : % entrée(s) incomplète(s) complétée(s)', v_faits;
END $$;

DO $$
DECLARE
  c RECORD;
  v_id INT;
  v_cur JSONB;
  v_faits INT := 0;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      -- (slug, clé, valeur du brouillon 187, nouvelle valeur — NULL = surcharge retirée, libellé)
      ('hotellerie', 'food_cost',
        '{"sg": "Coût matière", "pl": "Coûts matière", "g": "m", "el": false}'::jsonb,
        '{"sg": "Ratio matière", "pl": "Ratios matière", "g": "m", "el": false}'::jsonb,
        '« Coût matière » → « Ratio matière »'),
      ('hotellerie', 'labo',
        '{"sg": "Cuisine centrale", "pl": "Cuisines centrales", "g": "f", "el": false}'::jsonb,
        '{"sg": "Cuisine centrale", "pl": "Cuisines centrales", "g": "f", "el": false, "court": {"sg": "Cuisine", "pl": "Cuisines"}}'::jsonb,
        'forme courte « Cuisine / Cuisines »'),
      ('hotellerie', 'pt',
        '{"sg": "Préparation", "pl": "Préparations", "g": "f", "el": false}'::jsonb,
        '{"sg": "Préparation", "pl": "Préparations", "g": "f", "el": false, "court": {"sg": "Prépa", "pl": "Prépas"}}'::jsonb,
        'forme courte « Prépa / Prépas »'),
      ('ceramique', 'perte',
        '{"sg": "Casse / Rebut / Second choix", "pl": "Casses / Rebuts / Seconds choix", "g": "f", "el": false}'::jsonb,
        NULL::jsonb,
        'surcharge retirée (retour au terme par défaut « Perte »)'),
      ('ceramique', 'labo',
        '{"sg": "Site de production", "pl": "Sites de production", "g": "m", "el": false}'::jsonb,
        '{"sg": "Site de production", "pl": "Sites de production", "g": "m", "el": false, "court": {"sg": "Site", "pl": "Sites"}}'::jsonb,
        'forme courte « Site / Sites »'),
      ('ceramique', 'pt',
        '{"sg": "Produit fabriqué", "pl": "Produits fabriqués", "g": "m", "el": false}'::jsonb,
        '{"sg": "Produit fabriqué", "pl": "Produits fabriqués", "g": "m", "el": false, "court": {"sg": "PF", "pl": "PF"}}'::jsonb,
        'forme courte « PF »'),
      ('ceramique', 'fiche_technique',
        '{"sg": "Fiche de coût de revient", "pl": "Fiches de coût de revient", "g": "f", "el": false}'::jsonb,
        '{"sg": "Fiche de coût de revient", "pl": "Fiches de coût de revient", "g": "f", "el": false, "court": {"sg": "FCR", "pl": "FCR"}}'::jsonb,
        'forme courte « FCR »'),
      ('ceramique', 'appro',
        '{"sg": "Réception", "pl": "Réceptions", "g": "f", "el": false}'::jsonb,
        '{"sg": "Réception", "pl": "Réceptions", "g": "f", "el": false, "court": {"sg": "Réception", "pl": "Réceptions"}}'::jsonb,
        'forme courte « Réception / Réceptions »')
    ) AS t(slug, cle, brouillon, nouveau, libelle)
  LOOP
    v_id := NULL;
    v_cur := NULL;
    SELECT id, lexique -> c.cle INTO v_id, v_cur FROM domaines_activite WHERE slug = c.slug;

    IF v_id IS NULL THEN
      RAISE NOTICE 'Migration 191 : domaine « % » absent — % ignoré', c.slug, c.cle;
      CONTINUE;
    END IF;
    IF v_cur IS NULL THEN
      RAISE NOTICE 'Migration 191 : %.% non surchargé — rien à corriger', c.slug, c.cle;
      CONTINUE;
    END IF;
    IF v_cur <> c.brouillon THEN
      RAISE NOTICE 'Migration 191 : %.% différent du brouillon 187 (déjà corrigé) — conservé tel quel', c.slug, c.cle;
      CONTINUE;
    END IF;

    IF c.nouveau IS NULL THEN
      UPDATE domaines_activite SET lexique = lexique - c.cle WHERE id = v_id;
    ELSE
      UPDATE domaines_activite SET lexique = jsonb_set(lexique, ARRAY[c.cle], c.nouveau, true) WHERE id = v_id;
    END IF;
    v_faits := v_faits + 1;
    RAISE NOTICE 'Migration 191 : %.% — %', c.slug, c.cle, c.libelle;
  END LOOP;

  RAISE NOTICE 'Migration 191 : % correction(s) de brouillon appliquée(s)', v_faits;
END $$;

-- ÉTAPE 2 — Garde de l'invariant « un compte restauration ne voit aucun changement ».
-- Avant le lot 2, le lexique d'un domaine était enregistrable dans l'admin mais n'avait AUCUN
-- effet sur les écrans. À partir de ce déploiement il en a un. Le lexique du domaine
-- « restauration » est donc remis à vide (il n'accepte plus d'écart : 400 LEXIQUE_DOMAINE_DEFAUT).
-- L'ancienne valeur est tracée en entier dans le journal de migration, pour pouvoir la reprendre.
-- Pour les autres domaines, on signale seulement ceux qui ont des comptes ET un lexique non
-- vide : leurs écrans vont prendre ces mots.
DO $$
DECLARE
  d RECORD;
BEGIN
  FOR d IN
    SELECT id, slug, lexique FROM domaines_activite
     WHERE slug = 'restauration' AND lexique IS NOT NULL AND lexique <> '{}'::jsonb
  LOOP
    RAISE NOTICE 'Migration 191 : lexique du domaine « restauration » remis à vide — ancienne valeur : %', d.lexique::text;
    UPDATE domaines_activite SET lexique = '{}'::jsonb WHERE id = d.id;
  END LOOP;

  FOR d IN
    SELECT da.slug, COUNT(DISTINCT ac.abonnement_id) AS nb, da.lexique
      FROM domaines_activite da
      JOIN abonnement_config ac ON ac.domaine_id = da.id
     WHERE da.slug <> 'restauration' AND da.lexique IS NOT NULL AND da.lexique <> '{}'::jsonb
     GROUP BY da.slug, da.lexique
  LOOP
    RAISE NOTICE 'Migration 191 : ATTENTION — le domaine « % » a % compte(s) et un lexique non vide : ces comptes verront ces mots à l''écran — %', d.slug, d.nb, d.lexique::text;
  END LOOP;
END $$;
