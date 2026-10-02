/* Lot 2b — lecture de la base AVANT le déploiement de la migration 192 (spec docs/lot-2b-spec.md §13.2).
 *
 * LECTURE SEULE : une transaction READ ONLY, annulée à la fin ; aucune écriture, aucune migration.
 * À lancer par le client avec les variables DB_* de la PRODUCTION (elles priment sur le .env) :
 *
 *   node scripts/controle-avant-192.js
 *
 * ATTENTION : une variable DB_* absente de l'environnement est complétée par le .env LOCAL. La ligne
 * « Base lue » affiche l'hôte et le port du serveur réellement lu, et d'où vient DB_HOST : vérifier que
 * c'est bien la production avant de lire la suite.
 * Le script n'existe pas dans le conteneur de production avant la bascule : si la base n'est joignable
 * que dans le réseau Coolify, coller à la place scripts/controle-avant-192.sql dans le terminal psql du
 * service Postgres (mêmes lectures, en BEGIN READ ONLY … ROLLBACK).
 *
 * Garder la sortie avec le compte rendu de déploiement. Six lectures :
 *   (1) composants identité renommés (code = type technique, libellé ≠ brouillon) : pour information,
 *       ils garderont leur libellé (spec §4.2) et la migration 192 ne pose pas leur genre ;
 *   (2) valeurs de lexique qui contiennent « < » ou « > » (sg, pl, forme courte, icône) ;
 *   (3) libellés de composant qui contiennent « [ », « ] » ou « | » ;
 *   (4) composants de TOUS les domaines, avec leur libellé : genres et élisions à poser dans l'admin
 *       après le déploiement de l'écran, pour ceux que la garde de la 192 ne touche pas ;
 *   (5) (spec §13.4 et §13.6, v2.2) APRÈS la bascule seulement (colonne genre présente) : composants
 *       identité « Activité » / « Base acheteurs » restés masculins. Un composant créé à la volée par
 *       l'ANCIEN serveur après la 192 (fenêtre de bascule, retour arrière) prend le défaut 'm', et la 192 ne
 *       repasse jamais. À relancer après chaque bascule et chaque redéploiement ; une ligne se corrige dans
 *       l'onglet Composants de l'admin (genre Féminin) ;
 *   (6) (spec §5.1) noms saisis qui contiennent « [[ » ou « ]] » (articles, produits, labos, activités,
 *       fournisseurs, catégories, familles, prestataires, acheteurs, utilisateurs) : le « 0 cas en base »
 *       accepté au §5.1 n'a été mesuré qu'en local. Une ligne : la renommer avant le déploiement.
 * Si (2), (3) ou (6) trouve une ligne : la corriger AVANT le déploiement, et noter la valeur avant et après
 * dans le compte rendu (sinon l'admin ne pourra plus enregistrer ce domaine : 400). Code de sortie :
 * 0 si (2), (3), (5) et (6) sont vides, 1 sinon, 2 si la base est injoignable ou une lecture échoue.
 */
// DB_HOST AVANT le .env : dotenv ne remplace pas une variable déjà posée, mais complète une absente.
const DB_HOST_ENV = process.env.DB_HOST;
require('dotenv').config();
const pool = require('../src/config/database');

// Composants que la migration 192 passe au féminin (mêmes gardes que son SQL).
const GENRE_F_192 = [
  { code: 'activite', type: 'activite', libelle: 'Activité', slug: null },
  { code: 'acheteurs', type: 'acheteurs', libelle: 'Base acheteurs', slug: null },
  { code: 'cuisine', type: 'labo', libelle: 'Cuisine', slug: 'hotellerie' },
];
const touchePar192 = (r) => GENRE_F_192.some((g) => g.code === r.code && g.type === r.type_technique
  && g.libelle === r.libelle && (g.slug == null || g.slug === r.slug));

// (6) Tables dont un nom saisi peut être interpolé dans un message rendu (spec §5.1).
const TABLES_NOMS = ['articles', 'produits', 'labos', 'activites', 'fournisseurs', 'categories', 'categories_produit',
  'familles', 'prestataires_livraison', 'acheteurs', 'utilisateurs'];

const titre = (t) => console.log(`\n=== ${t} ===`);
const tableau = (rows) => { if (rows.length) console.table(rows); else console.log('(aucune ligne)'); };

(async () => {
  let db = null;
  let code = 0;
  try {
    try {
      db = await pool.connect();
    } catch (e) {
      const hote = `${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 5432}`;
      console.error(`Base injoignable (${hote}, base ${process.env.DB_NAME || 'fiche_technique'}) : ${e.code || ''} ${e.message || e}`.trim());
      console.error('Rien n\'a été lu. Vérifier les variables DB_* (ou utiliser scripts/controle-avant-192.sql dans psql).');
      code = 2;
      return;
    }
    await db.query('BEGIN TRANSACTION READ ONLY');
    const info = await db.query(`SELECT current_database() AS base, current_user AS utilisateur,
      host(inet_server_addr()) AS hote_serveur, inet_server_port() AS port_serveur, now() AS lu_le,
      (SELECT MAX(filename) FROM _migrations WHERE filename LIKE '%.sql') AS derniere_migration`);
    const lu = info.rows[0];
    console.log('Base lue :', {
      ...lu,
      DB_HOST: process.env.DB_HOST || '(absent : localhost)',
      DB_HOST_origine: DB_HOST_ENV ? 'environnement' : (process.env.DB_HOST ? '.env LOCAL' : 'défaut'),
    });
    if (!DB_HOST_ENV) {
      console.log('!!! DB_HOST ne vient pas de l\'environnement : la base lue est celle du .env LOCAL ou localhost.'
        + ' Pour lire la production, poser DB_HOST (et les autres DB_*) avant la commande.');
    }
    if (lu.derniere_migration && lu.derniere_migration >= '192') {
      console.log(`!!! La dernière migration est déjà ${lu.derniere_migration} : base locale, ou production déjà basculée.`
        + ' Avant la bascule, la production attend 191.');
    }

    // (1) Composants identité renommés
    titre('(1) Composants identité renommés (pour information : ils gardent leur libellé)');
    const r1 = await db.query(
      `SELECT d.slug, dc.code, dc.libelle, dc.libelle_pluriel
         FROM domaine_composants dc
         JOIN domaines_activite d ON d.id = dc.domaine_id
        WHERE dc.code = dc.type_technique
          AND (dc.libelle, COALESCE(dc.libelle_pluriel, '')) NOT IN
              (('Activité','Activités'), ('Labo','Labos'), ('Gérant','Gérants'), ('Base acheteurs','Base acheteurs'))
        ORDER BY d.slug, dc.code`
    );
    tableau(r1.rows);

    // (2) Valeurs de lexique avec « < » ou « > » : sg, pl, court (texte ou { sg, pl }), icon — et, par
    // prudence, toute autre valeur texte de l'entrée.
    titre('(2) Valeurs de lexique qui contiennent « < » ou « > » (À CORRIGER avant le déploiement)');
    const r2 = await db.query(
      `SELECT d.id, d.slug, e.key AS cle, e.value AS entree
         FROM domaines_activite d
         CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(d.lexique) = 'object' THEN d.lexique ELSE '{}'::jsonb END) e
        WHERE e.value::text ~ '[<>]'
        ORDER BY d.slug, e.key`
    );
    const lignes2 = [];
    const parcourir = (v, chemin, base) => {
      if (typeof v === 'string') { if (/[<>]/.test(v)) lignes2.push({ ...base, champ: chemin, valeur: v }); return; }
      if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) parcourir(x, chemin ? `${chemin}.${k}` : k, base);
    };
    for (const r of r2.rows) parcourir(r.entree, '', { slug: r.slug, cle: r.cle });
    tableau(lignes2);

    // (3) Libellés de composant avec « [ », « ] » ou « | »
    titre('(3) Libellés de composant qui contiennent [ ] | (À CORRIGER avant le déploiement)');
    const r3 = await db.query(
      `SELECT d.slug, dc.code, dc.libelle, dc.libelle_pluriel
         FROM domaine_composants dc
         JOIN domaines_activite d ON d.id = dc.domaine_id
        WHERE strpos(dc.libelle, '[') > 0 OR strpos(dc.libelle, ']') > 0 OR strpos(dc.libelle, '|') > 0
           OR strpos(COALESCE(dc.libelle_pluriel, ''), '[') > 0 OR strpos(COALESCE(dc.libelle_pluriel, ''), ']') > 0
           OR strpos(COALESCE(dc.libelle_pluriel, ''), '|') > 0
        ORDER BY d.slug, dc.code`
    );
    tableau(r3.rows);

    // (4) Tous les composants, avec ce que la 192 posera (genre et élision lus s'ils existent déjà)
    titre('(4) Composants de tous les domaines : genre et élision à poser dans l\'admin après le déploiement');
    const cols = await db.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'domaine_composants' AND column_name IN ('genre', 'elision')`
    );
    const aGenre = cols.rows.some((c) => c.column_name === 'genre');
    const aElision = cols.rows.some((c) => c.column_name === 'elision');
    const r4 = await db.query(
      `SELECT d.slug, dc.code, dc.type_technique, dc.libelle, dc.libelle_pluriel, dc.actif,
              ${aGenre ? 'dc.genre' : 'NULL::text'} AS genre_actuel,
              ${aElision ? 'dc.elision' : 'NULL::boolean'} AS elision_actuelle
         FROM domaine_composants dc
         JOIN domaines_activite d ON d.id = dc.domaine_id
        ORDER BY d.slug, dc.ordre, dc.id`
    );
    tableau(r4.rows.map((r) => ({
      slug: r.slug,
      code: r.code,
      type: r.type_technique,
      libelle: r.libelle,
      pluriel: r.libelle_pluriel,
      actif: r.actif,
      genre_actuel: r.genre_actuel ?? '(colonne absente)',
      elision_actuelle: aElision ? r.elision_actuelle : '(colonne absente)',
      apres_192: touchePar192(r) ? 'f (posé par la 192)' : (aGenre ? `${r.genre_actuel} (inchangé)` : 'm (défaut) : à vérifier'),
    })));
    console.log(`colonnes genre / elision : ${aGenre ? 'présentes' : 'absentes'} / ${aElision ? 'présentes' : 'absentes'}`
      + ` — élision : NULL (déduite) partout après la 192 ; à forcer dans l'admin pour un h muet (« Huilerie »).`);

    // (5) Après la bascule : composants identité féminins restés masculins (créés par l'ancien serveur)
    titre('(5) Composants identité « Activité » / « Base acheteurs » restés masculins (après la bascule)');
    let r5 = { rows: [] };
    if (aGenre) {
      r5 = await db.query(
        `SELECT d.slug, dc.id, dc.code, dc.libelle, dc.genre
           FROM domaine_composants dc
           JOIN domaines_activite d ON d.id = dc.domaine_id
          WHERE dc.code = dc.type_technique AND dc.genre = 'm'
            AND (dc.code, dc.libelle) IN (('activite', 'Activité'), ('acheteurs', 'Base acheteurs'))
          ORDER BY d.slug, dc.id`
      );
      tableau(r5.rows);
    } else {
      console.log('(colonne genre absente : migration 192 pas encore appliquée, lecture sans objet)');
    }

    // (6) Noms saisis de la forme d'une balise (spec §5.1 : « 0 cas en base », à confirmer en production)
    titre('(6) Noms saisis qui contiennent « [[ » ou « ]] » (À RENOMMER avant le déploiement)');
    const r6 = await db.query(
      TABLES_NOMS.map((t) => `SELECT '${t}' AS table_, id::text AS id, nom FROM ${t} WHERE strpos(nom, '[[') > 0 OR strpos(nom, ']]') > 0`)
        .join('\n UNION ALL ') + '\n ORDER BY 1, 2'
    );
    tableau(r6.rows);

    titre('Bilan');
    console.log(`(1) ${r1.rows.length} composant(s) identité renommé(s) — pour information`);
    console.log(`(2) ${lignes2.length} valeur(s) de lexique avec < ou >${lignes2.length ? ' — À CORRIGER AVANT LE DÉPLOIEMENT' : ''}`);
    console.log(`(3) ${r3.rows.length} libellé(s) de composant avec [ ] |${r3.rows.length ? ' — À CORRIGER AVANT LE DÉPLOIEMENT' : ''}`);
    console.log(`(4) ${r4.rows.length} composant(s) listé(s)`);
    console.log(aGenre
      ? `(5) ${r5.rows.length} composant(s) identité resté(s) masculin(s)${r5.rows.length ? ' — À CORRIGER DANS L\'ADMIN (genre Féminin)' : ''}`
      : '(5) sans objet avant la migration 192');
    console.log(`(6) ${r6.rows.length} nom(s) saisi(s) avec [[ ou ]]${r6.rows.length ? ' — À RENOMMER AVANT LE DÉPLOIEMENT' : ''}`);
    if (lignes2.length || r3.rows.length || r5.rows.length || r6.rows.length) code = 1;
  } catch (e) {
    console.error('Lecture impossible :', e.message);
    code = 2;
  } finally {
    if (db) {
      await db.query('ROLLBACK').catch(() => {});
      db.release();
    }
    await pool.end().catch(() => {});
    process.exit(code);
  }
})();
