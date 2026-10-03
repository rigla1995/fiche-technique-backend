/* Lot 2c — instantané d'origine du manuel et de la base de connaissances (docs/lot-2c-spec.md §3.2, R3.2.1-R3.2.3).
 *
 *   node scripts/manuel/extraire-origine.js              extraction, UNE fois (intégrateur) : base locale, lecture seule
 *   node scripts/manuel/extraire-origine.js --verifier   sans base : empreintes globales recalculées sur les fichiers
 *
 * Extraction (BEGIN TRANSACTION READ ONLY … ROLLBACK, variables DB_* du .env, hôte local seulement). Écrit :
 *   origine/manuel/<slug>.md    contenu servi aujourd'hui, en LF, sans retouche (61 fiches) ;
 *   origine/manuel/<slug>.json  { slug, titre, icone, partie, ordre, mots_cles, ecran, actif, visible_gerant,
 *                                 updated_at, defautNull, md5Garde, md5Contenu } ;
 *   origine/base/<fichier>.md   contenu (32 entrées) ; <fichier> = titre translittéré (« labo-central ») ;
 *   origine/base/<fichier>.json { cle: lower(titre), titre, mots_cles, categorie, actif, md5Contenu } ;
 *   domaines.json               hotellerie et ceramique : écarts ET lexique résolu (R3.1.1), composants actifs,
 *                               description (les agents n'ont pas accès à la base).
 * md5Garde = md5(COALESCE(contenu_defaut, contenu)) sans « \r » (garde de la 194, §4.2) ; md5Contenu = md5(contenu).
 *
 * Refus (rien n'est écrit) : origine/ ou domaines.json déjà présents (l'instantané est figé, R3.2.3 : pour
 * réextraire, l'intégrateur les retire d'abord) ; une fiche ou une entrée qui contient « [[ » (base déjà balisée)
 * ou « \r » (le .md doit être le texte servi, en LF, sans retouche) ; empreintes globales de la base (requête (1) de
 * scripts/controle-avant-2c.sql) différentes de celles du 02/10 ; ordre de tri de la requête (1) différent de
 * l'ordre en points de code (les fichiers n'en garderaient pas trace) ; un md5 JavaScript différent du md5 SQL.
 * Après l'écriture, les empreintes sont recalculées SUR LES FICHIERS (lib/commun.js) : elles doivent valoir celles
 * de la base (R3.2.2), sinon code 1.
 *
 * Base principale à la 193 depuis l'étape O (R2.8.1 bis) : sans effet sur les textes. Après l'étape C (194 à 196
 * dans migrations/), l'extraction n'a plus lieu d'être : la garde « [[ » la refuse sur une base balisée. */
'use strict';
const fs = require('fs');
const path = require('path');
const {
  RACINE, DOSSIER, CHEMINS, EMPREINTES_ATTENDUES, md5, ecrireTexte, ecrireJson, nomFichierBase, parPointsDeCode,
  empreintesOrigine,
} = require('./lib/commun');

const args = process.argv.slice(2);
const inconnues = args.filter((a) => a !== '--verifier');
if (inconnues.length) {
  console.error(`usage : node scripts/manuel/extraire-origine.js [--verifier]   (inconnu : ${inconnues.join(' ')})`);
  process.exit(2);
}

function verifier() {
  const e = empreintesOrigine();
  const ok = e.manuel === EMPREINTES_ATTENDUES.manuel && e.base === EMPREINTES_ATTENDUES.base;
  console.log(`[origine] ${e.fiches} fiche(s), ${e.entrees} entrée(s) lues dans ${path.relative(RACINE, path.join(DOSSIER, 'origine'))}/`);
  console.log(`[origine] empreinte du manuel recalculée : ${e.manuel} (attendue ${EMPREINTES_ATTENDUES.manuel}) ${e.manuel === EMPREINTES_ATTENDUES.manuel ? 'OK' : 'ÉCART'}`);
  console.log(`[origine] empreinte de la base recalculée : ${e.base} (attendue ${EMPREINTES_ATTENDUES.base}) ${e.base === EMPREINTES_ATTENDUES.base ? 'OK' : 'ÉCART'}`);
  return ok;
}

if (args.includes('--verifier')) {
  try {
    process.exit(verifier() ? 0 : 1);
  } catch (err) {
    console.error(`[origine] ${err.message}`);
    process.exit(1);
  }
}

require('dotenv').config({ path: path.join(RACINE, '.env') });
const { Client } = require('pg');
const { resoudre } = require('./lib/vocabulaires');

const HOTES_LOCAUX = ['localhost', '127.0.0.1', '::1'];
const DOMAINES = ['hotellerie', 'ceramique'];
const refuser = (message) => { console.error(`[origine] refus : ${message}`); process.exit(2); };

// Requête (1) de scripts/controle-avant-2c.sql, recopiée à l'identique (les fichiers doivent la retrouver).
const REQUETE_EMPREINTES = `SELECT
  (SELECT md5(string_agg(slug || '|' || titre || '|' || COALESCE(partie, '') || '|'
                         || md5(replace(COALESCE(contenu_defaut, contenu), E'\\r', '')) || '|'
                         || md5(replace(contenu, E'\\r', '')) || '|' || COALESCE(mots_cles, ''),
                         E'\\n' ORDER BY slug))
     FROM manuel_sections) AS empreinte_manuel,
  (SELECT md5(string_agg(lower(titre) || '|' || titre || '|' || md5(replace(contenu, E'\\r', '')) || '|'
                         || COALESCE(mots_cles, '') || '|' || actif::text,
                         E'\\n' ORDER BY lower(titre)))
     FROM ai_knowledge_base) AS empreinte_base`;

async function lire() {
  const hote = process.env.DB_HOST || 'localhost';
  if (!HOTES_LOCAUX.includes(hote)) refuser(`hôte « ${hote} » non local (${HOTES_LOCAUX.join(', ')} seulement)`);
  const client = new Client({
    host: hote,
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
  });
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const q = async (texte, valeurs) => (await client.query(texte, valeurs)).rows;
    const [base] = await q(`SELECT current_database() AS base,
                                   (SELECT MAX(filename) FROM _migrations WHERE filename LIKE '%.sql') AS derniere`);
    const fiches = await q(`SELECT slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, actif,
                                   visible_gerant, updated_at,
                                   md5(replace(COALESCE(contenu_defaut, contenu), E'\\r', '')) AS md5_garde_sql,
                                   md5(replace(contenu, E'\\r', '')) AS md5_contenu_sql
                              FROM manuel_sections ORDER BY slug`);
    const entrees = await q(`SELECT titre, lower(titre) AS cle, contenu, mots_cles, categorie, actif,
                                    md5(replace(contenu, E'\\r', '')) AS md5_contenu_sql
                               FROM ai_knowledge_base ORDER BY lower(titre)`);
    const [empreintes] = await q(REQUETE_EMPREINTES);
    const domaines = await q(`SELECT id, slug, nom, description, lexique, md5(lexique::text) AS md5_lexique
                                FROM domaines_activite WHERE slug = ANY($1::text[]) ORDER BY id`, [DOMAINES]);
    const composants = await q(`SELECT d.slug AS domaine, c.code, c.libelle, c.libelle_pluriel, c.type_technique, c.genre,
                                       c.elision, c.ordre, c.actif
                                  FROM domaine_composants c JOIN domaines_activite d ON d.id = c.domaine_id
                                 WHERE d.slug = ANY($1::text[])
                                 ORDER BY d.slug, c.ordre, c.id`, [DOMAINES]);
    return { base, fiches, entrees, empreintes, domaines, composants };
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}

function controler({ fiches, entrees, empreintes, domaines }) {
  if (empreintes.empreinte_manuel !== EMPREINTES_ATTENDUES.manuel || empreintes.empreinte_base !== EMPREINTES_ATTENDUES.base) {
    refuser(`empreintes de la base (${empreintes.empreinte_manuel} / ${empreintes.empreinte_base}) ≠ celles du 02/10 `
      + `(${EMPREINTES_ATTENDUES.manuel} / ${EMPREINTES_ATTENDUES.base}) : la base locale a bougé (spec §0.1, R3.2.2)`);
  }
  const champsManuel = ['titre', 'partie', 'contenu', 'contenu_defaut', 'mots_cles', 'icone', 'ecran'];
  const champsBase = ['titre', 'contenu', 'mots_cles', 'categorie'];
  const fautes = [];
  const scruter = (nom, ligne, champs) => {
    for (const c of champs) {
      const v = ligne[c];
      if (typeof v !== 'string') continue;
      if (v.includes('[[')) fautes.push(`${nom} › ${c} : « [[ » (base déjà balisée ?)`);
      if (v.includes('\r')) fautes.push(`${nom} › ${c} : « \\r »`);
    }
  };
  for (const f of fiches) {
    scruter(`manuel ${f.slug}`, f, champsManuel);
    if (md5(f.contenu) !== f.md5_contenu_sql) fautes.push(`manuel ${f.slug} : md5 JavaScript ≠ md5 SQL du contenu`);
    if (md5(f.contenu_defaut ?? f.contenu) !== f.md5_garde_sql) fautes.push(`manuel ${f.slug} : md5 JavaScript ≠ md5 SQL de la garde`);
  }
  for (const e of entrees) {
    scruter(`base « ${e.titre} »`, e, champsBase);
    if (md5(e.contenu) !== e.md5_contenu_sql) fautes.push(`base « ${e.titre} » : md5 JavaScript ≠ md5 SQL du contenu`);
  }
  const ordre = (liste) => liste.every((x, i) => i === 0 || parPointsDeCode(liste[i - 1], x) < 0);
  if (!ordre(fiches.map((f) => f.slug))) fautes.push('ORDER BY slug (collation de la base) ≠ ordre en points de code');
  if (!ordre(entrees.map((e) => e.cle))) fautes.push('ORDER BY lower(titre) (collation de la base) ≠ ordre en points de code');
  const noms = entrees.map((e) => nomFichierBase(e.titre));
  const doubles = noms.filter((n, i) => noms.indexOf(n) !== i || !n);
  if (doubles.length) fautes.push(`noms de fichier de la base vides ou en double : ${[...new Set(doubles)].join(', ')}`);
  for (const slug of DOMAINES) if (!domaines.some((d) => d.slug === slug)) fautes.push(`domaine « ${slug} » absent de la base locale`);
  if (fautes.length) refuser(`\n  - ${fautes.join('\n  - ')}`);
}

async function main() {
  const existants = [path.join(DOSSIER, 'origine'), path.join(DOSSIER, 'domaines.json')].filter((p) => fs.existsSync(p));
  if (existants.length) {
    refuser(`${existants.map((p) => path.relative(RACINE, p)).join(', ')} existe déjà : l'instantané est figé (R3.2.3). `
      + 'Pour réextraire (intégrateur seul), les retirer d\'abord. Contrôle sans base : --verifier.');
  }
  const lu = await lire();
  controler(lu);
  const { base, fiches, entrees, empreintes, domaines, composants } = lu;

  for (const f of fiches) {
    const defautNull = f.contenu_defaut === null;
    ecrireTexte(path.join(CHEMINS.origineManuel, `${f.slug}.md`), f.contenu);
    ecrireJson(path.join(CHEMINS.origineManuel, `${f.slug}.json`), {
      slug: f.slug,
      titre: f.titre,
      icone: f.icone,
      partie: f.partie,
      ordre: f.ordre,
      mots_cles: f.mots_cles,
      ecran: f.ecran,
      actif: f.actif,
      visible_gerant: f.visible_gerant,
      updated_at: f.updated_at instanceof Date ? f.updated_at.toISOString() : f.updated_at,
      defautNull,
      md5Garde: md5(defautNull ? f.contenu : f.contenu_defaut),
      md5Contenu: md5(f.contenu),
    });
  }
  for (const e of entrees) {
    const fichier = nomFichierBase(e.titre);
    ecrireTexte(path.join(CHEMINS.origineBase, `${fichier}.md`), e.contenu);
    ecrireJson(path.join(CHEMINS.origineBase, `${fichier}.json`), {
      cle: e.cle,
      titre: e.titre,
      mots_cles: e.mots_cles,
      categorie: e.categorie,
      actif: e.actif,
      md5Contenu: md5(e.contenu),
    });
  }

  const sortieDomaines = {
    _lisezmoi: [
      'Lot 2c (docs/lot-2c-spec.md §3.1, R3.1.1) : domaines hotellerie et ceramique de la base locale, lus une fois en',
      'lecture seule par scripts/manuel/extraire-origine.js. Ne pas éditer à la main.',
      '« ecarts » = domaines_activite.lexique tel qu\'en base (liste d\'ÉCARTS au défaut) ; « lexique » = son lexique RÉSOLU',
      'par resoudreLexique(LEXIQUE_DEFAUT, ecarts), gardé pour la lecture humaine et comme contrôle (lib/vocabulaires.js',
      'verifierLexiques). Tout outil construit son vocabulaire sur les ÉCARTS résolus : vocabDuDomaine(slug).',
      '« composants » = composants ACTIFS du domaine (forme de mapComposant, domaineProfilService.js:84-100), ordre, id.',
      '« md5Lexique » = md5(lexique::text), comparable à la lecture (7) de scripts/controle-avant-2c.sql.',
    ],
    extraction: { base: base.base, derniereMigration: base.derniere, le: new Date().toISOString() },
    domaines: {},
  };
  for (const d of domaines) {
    const actifs = composants.filter((c) => c.domaine === d.slug && c.actif !== false);
    const inactifs = composants.filter((c) => c.domaine === d.slug && c.actif === false).length;
    sortieDomaines.domaines[d.slug] = {
      slug: d.slug,
      nom: d.nom,
      description: d.description,
      md5Lexique: d.md5_lexique,
      ecarts: d.lexique || {},
      lexique: resoudre(d.lexique || {}),
      composants: actifs.map((c) => ({
        code: c.code,
        libelle: c.libelle,
        libellePluriel: c.libelle_pluriel ?? null,
        typeTechnique: c.type_technique,
        genre: c.genre === 'f' ? 'f' : 'm',
        elision: typeof c.elision === 'boolean' ? c.elision : null,
        ordre: c.ordre,
        actif: true,
      })),
      composantsInactifs: inactifs,
    };
  }
  ecrireJson(path.join(DOSSIER, 'domaines.json'), sortieDomaines);

  const surFichiers = empreintesOrigine();
  const nuls = fiches.filter((f) => f.contenu_defaut === null).map((f) => f.slug);
  const modifiees = fiches.filter((f) => f.contenu_defaut !== null && f.contenu_defaut !== f.contenu).map((f) => f.slug);
  console.log(`[origine] base ${base.base}, dernière migration ${base.derniere}`);
  console.log(`[origine] ${fiches.length} fiche(s) → origine/manuel/ ; défaut NULL : ${nuls.length} (${nuls.join(', ')}) ; modifiées : ${modifiees.length}${modifiees.length ? ` (${modifiees.join(', ')})` : ''}`);
  console.log(`[origine] ${entrees.length} entrée(s) → origine/base/`);
  console.log(`[origine] domaines.json : ${domaines.map((d) => `${d.slug} (${Object.keys(d.lexique || {}).length} clés, ${sortieDomaines.domaines[d.slug].composants.length} composants actifs)`).join(', ')}`);
  console.log(`[origine] empreinte du manuel : base ${empreintes.empreinte_manuel}, fichiers ${surFichiers.manuel}`);
  console.log(`[origine] empreinte de la base : base ${empreintes.empreinte_base}, fichiers ${surFichiers.base}`);
  const ok = surFichiers.manuel === empreintes.empreinte_manuel && surFichiers.base === empreintes.empreinte_base;
  console.log(ok ? '[origine] OK : les fichiers retrouvent les empreintes de la base (R3.2.2)' : '[origine] ÉCHEC : empreintes des fichiers ≠ base');
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error(`[origine] erreur : ${err && err.stack ? err.stack : err}`);
  process.exit(1);
});
