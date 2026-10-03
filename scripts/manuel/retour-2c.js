/* Lot 2c — retour arrière des textes balisés (docs/lot-2c-spec.md §4.5, §12.4) et remise à zéro de la base locale
 * (R2.8.4).
 *
 *   node scripts/manuel/retour-2c.js --essai                   tout, puis ROLLBACK, avec le compte rendu (À LANCER D'ABORD)
 *   node scripts/manuel/retour-2c.js                           tout, puis COMMIT
 *   node scripts/manuel/retour-2c.js --remise-locale [--essai] base LOCALE seulement (refusé sur un autre hôte) : retour des
 *                                                              textes, suppression des 16 brouillons de la 196 (par slug de
 *                                                              fiche et de domaine), retrait de 194, 195 et 196 de _migrations
 *
 * Où le lancer (§4.5, §12.4) : dans le conteneur du serveur EN PLACE (terminal Coolify du service backend ; le Dockerfile
 * copie scripts/ dans l'image, les variables DB_* y sont posées), AVANT de remettre un ancien serveur sur une base
 * balisée : l'ancien serveur (e3bf29a) ne rend pas les balises, il servirait « [[…]] » à tous les comptes.
 * En local : les variables DB_* du .env (DB_NAME peut valoir fiche_technique_2c, R2.8.2).
 *
 * Ce qu'il fait, dans UNE transaction qu'il ouvre et ferme lui-même :
 *   1. chaque champ balisé (contenu, contenu_defaut, titre, partie du manuel ; titre, contenu de la base) qui porte « [[ »
 *      est remplacé par rendre(vocabDefaut, champ) : I10 garantit que c'est le texte d'origine ; une fiche éditée depuis
 *      dans l'admin redevient elle aussi du texte en mots de la restauration ;
 *   2. contenu_defaut remis à NULL pour les 5 fiches acheteurs (defautNull de origine/manuel/<slug>.json) quand son rendu
 *      par défaut a encore le md5 d'origine (md5Garde du même fichier) ;
 *   3. lignes de 194 et 195 retirées de _migrations, pour qu'un nouveau déploiement du 2c les rejoue (la 196 reste : ses
 *      brouillons sont inoffensifs) ;
 *   4. liste ce qu'il n'a pas remis : balise invalide restée (verifierBalises), reste de balise après le rendu, et compte
 *      les « [[ » qui restent en base à la fin.
 * updated_at n'est jamais touché (le texte rendu ne change pas, R4.2.4).
 *
 * Exporte retour(client, options) : la même chose SANS BEGIN NI COMMIT, pour l'essai de migration (§3.7), qui l'appelle
 * dans SA transaction (toujours annulée).
 *
 * CommonJS, syntaxe de Node 20 (image du serveur). Dépendances : pg, dotenv, src/utils/vocab.js, src/utils/manuelRendu.js,
 * scripts/manuel/lib/commun.js, scripts/manuel/origine/ et lots.json (tous dans l'image).
 * Codes de sortie : 0 fait (ou essai fait) sans reste ; 1 erreur ou reste listé ; 2 refus (usage, hôte non local). */
'use strict';
const path = require('path');
const C = require('./lib/commun.js');
const { rendre, vocabDefaut } = require('../../src/utils/vocab.js');
const { verifierBalises } = require('../../src/utils/manuelRendu.js');

// Noms des fichiers de migration du lot 2c (le générateur écrit ces noms : scripts/manuel/generer-migrations.mjs).
const MIGRATIONS_2C = Object.freeze({
  manuel: '194_manuel_balise.sql',
  base: '195_base_connaissances_balisee.sql',
  variantes: '196_manuel_variantes_brouillons.sql',
});
const HOTES_LOCAUX = Object.freeze(['localhost', '127.0.0.1', '::1']);
const RESTE = /\[\[|\]\]|‹[a-z0-9_]+›/;
const CHAMPS_MANUEL = ['contenu', 'contenu_defaut', 'titre', 'partie'];
const CHAMPS_BASE = ['titre', 'contenu'];
const muet = () => {};
const rendreDefaut = (t) => (typeof t === 'string' ? rendre(vocabDefaut, t, muet) : t);

/** Les 16 brouillons de la 196 : (slug de fiche, slug de domaine) des lots V-* de lots.json. */
function pairesVariantes(lots = C.lireLots()) {
  const out = [];
  for (const l of Object.values(lots.lots || {})) {
    if (!l.domaine || !Array.isArray(l.variantes)) continue;
    for (const slug of l.variantes) out.push({ slug, domaine: l.domaine });
  }
  return out;
}

/** Champs d'une ligne remis au texte par défaut ; note ce qui n'a pas pu l'être. */
function remettre(ligne, champs, table, cle, nonRemis) {
  const nv = {};
  for (const champ of champs) {
    const v = ligne[champ];
    if (typeof v !== 'string' || !v.includes('[[')) { nv[champ] = v; continue; }
    const fautes = verifierBalises(v);
    const r = rendreDefaut(v);
    nv[champ] = r;
    if (fautes.length) nonRemis.push({ table, cle, champ, raison: `balise invalide restée : ${fautes[0].balise} (${fautes[0].raison})` });
    else if (RESTE.test(r)) nonRemis.push({ table, cle, champ, raison: `reste de balise après le rendu : ${RESTE.exec(r)[0]}` });
  }
  return nv;
}

/**
 * Retour des textes, SANS BEGIN NI COMMIT (la transaction est celle de l'appelant).
 *   options.remiseLocale : aussi supprimer les 16 brouillons de la 196 et retirer 196 de _migrations (R2.8.4) ;
 *   options.origine      : instantané d'origine (par défaut lu dans scripts/manuel/origine/) ;
 *   options.variantes    : paires { slug, domaine } des brouillons (par défaut celles de lots.json).
 * → compte rendu { fiches, champsManuel, defautNull, entrees, champsBase, migrations, brouillons, nonRemis, restes }.
 */
async function retour(client, { remiseLocale = false, origine = null, variantes = null } = {}) {
  const o = origine || C.lireOrigine();
  const defautNull = new Map(o.fiches.filter((f) => f.defautNull).map((f) => [f.slug, f.md5Garde]));
  const compte = { fiches: 0, champsManuel: 0, defautNull: 0, entrees: 0, champsBase: 0, migrations: [], brouillons: 0, nonRemis: [], restes: null };

  const { rows: fiches } = await client.query(
    'SELECT id, slug, titre, partie, contenu, contenu_defaut FROM manuel_sections ORDER BY id FOR UPDATE');
  for (const f of fiches) {
    const nv = remettre(f, CHAMPS_MANUEL, 'manuel_sections', f.slug, compte.nonRemis);
    if (defautNull.has(f.slug) && typeof nv.contenu_defaut === 'string'
      && C.md5(nv.contenu_defaut.replace(/\r/g, '')) === defautNull.get(f.slug)) nv.contenu_defaut = null;
    const changes = CHAMPS_MANUEL.filter((c) => nv[c] !== f[c]);
    if (!changes.length) continue;
    await client.query(
      'UPDATE manuel_sections SET contenu = $1, contenu_defaut = $2, titre = $3, partie = $4 WHERE id = $5',
      [nv.contenu, nv.contenu_defaut, nv.titre, nv.partie, f.id]);
    compte.fiches += 1;
    compte.champsManuel += changes.length;
    if (f.contenu_defaut !== null && nv.contenu_defaut === null) compte.defautNull += 1;
  }

  const { rows: entrees } = await client.query('SELECT id, titre, contenu FROM ai_knowledge_base ORDER BY id FOR UPDATE');
  for (const e of entrees) {
    const nv = remettre(e, CHAMPS_BASE, 'ai_knowledge_base', rendreDefaut(e.titre), compte.nonRemis);
    const changes = CHAMPS_BASE.filter((c) => nv[c] !== e[c]);
    if (!changes.length) continue;
    await client.query('UPDATE ai_knowledge_base SET titre = $1, contenu = $2 WHERE id = $3', [nv.titre, nv.contenu, e.id]);
    compte.entrees += 1;
    compte.champsBase += changes.length;
  }

  const noms = remiseLocale ? [MIGRATIONS_2C.manuel, MIGRATIONS_2C.base, MIGRATIONS_2C.variantes] : [MIGRATIONS_2C.manuel, MIGRATIONS_2C.base];
  const mig = await client.query('DELETE FROM _migrations WHERE filename = ANY($1::text[]) RETURNING filename', [noms]);
  compte.migrations = mig.rows.map((r) => r.filename).sort();

  if (remiseLocale) {
    const t = await client.query("SELECT to_regclass('manuel_sections_domaine') IS NOT NULL AS existe");
    if (t.rows[0].existe) {
      const paires = variantes || pairesVariantes();
      const r = await client.query(
        `DELETE FROM manuel_sections_domaine d USING manuel_sections s
          WHERE d.section_id = s.id
            AND (s.slug, d.domaine_slug) IN (SELECT * FROM unnest($1::text[], $2::text[]))`,
        [paires.map((p) => p.slug), paires.map((p) => p.domaine)]);
      compte.brouillons = r.rowCount;
    }
  }

  const restes = await client.query(
    `SELECT (SELECT count(*)::int FROM manuel_sections
              WHERE position('[[' in contenu || COALESCE(contenu_defaut, '') || titre || COALESCE(partie, '')) > 0) AS fiches,
            (SELECT count(*)::int FROM ai_knowledge_base WHERE position('[[' in titre || contenu) > 0) AS entrees`);
  compte.restes = restes.rows[0];
  return compte;
}

/** Compte rendu lisible (lignes). */
function lignesCompteRendu(c, { essai, remiseLocale }) {
  const l = [];
  l.push(`[retour-2c] manuel : ${c.fiches} fiche(s) remise(s) (${c.champsManuel} champ(s)), contenu_defaut remis à NULL : ${c.defautNull}`);
  l.push(`[retour-2c] base de connaissances : ${c.entrees} entrée(s) remise(s) (${c.champsBase} champ(s))`);
  l.push(`[retour-2c] _migrations : retiré ${c.migrations.length ? c.migrations.join(', ') : 'rien (aucune ligne du 2c)'}`);
  if (remiseLocale) l.push(`[retour-2c] remise locale : ${c.brouillons} brouillon(s) de la 196 supprimé(s)`);
  if (c.nonRemis.length) {
    l.push(`[retour-2c] NON REMIS (${c.nonRemis.length}) :`);
    for (const x of c.nonRemis) l.push(`  ✗ ${x.table} › ${x.cle} › ${x.champ} : ${x.raison}`);
  } else l.push('[retour-2c] non remis : rien');
  l.push(`[retour-2c] « [[ » restant en base : ${c.restes.fiches} fiche(s), ${c.restes.entrees} entrée(s)`);
  l.push(`[retour-2c] ${essai ? 'ESSAI : transaction ANNULÉE (ROLLBACK), rien n\'est écrit' : 'transaction VALIDÉE (COMMIT)'}`);
  return l;
}

async function principal(argv = process.argv.slice(2)) {
  const options = new Set(argv);
  const connues = new Set(['--essai', '--remise-locale']);
  const inconnues = argv.filter((a) => !connues.has(a));
  if (inconnues.length) {
    console.error(`[retour-2c] option inconnue : ${inconnues.join(' ')}\nusage : node scripts/manuel/retour-2c.js [--essai] [--remise-locale]`);
    return 2;
  }
  const essai = options.has('--essai');
  const remiseLocale = options.has('--remise-locale');
  require('dotenv').config({ path: path.join(C.RACINE, '.env') }); // sans effet dans le conteneur (pas de .env, variables posées)
  const hote = process.env.DB_HOST || 'localhost';
  if (remiseLocale && !HOTES_LOCAUX.includes(hote)) {
    console.error(`[retour-2c] refus : --remise-locale sur l'hôte « ${hote} » (base locale seulement : ${HOTES_LOCAUX.join(', ')})`);
    return 2;
  }
  const { Client } = require('pg');
  const client = new Client({
    host: hote,
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'fiche_technique',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
  await client.connect();
  let ouverte = false;
  try {
    const base = (await client.query('SELECT current_database() AS d')).rows[0].d;
    console.log(`[retour-2c] base « ${base} » sur « ${hote} »${essai ? ' — ESSAI (ROLLBACK à la fin)' : ''}${remiseLocale ? ' — remise locale' : ''}`);
    await client.query('BEGIN');
    ouverte = true;
    const compte = await retour(client, { remiseLocale });
    await client.query(essai ? 'ROLLBACK' : 'COMMIT');
    ouverte = false;
    for (const l of lignesCompteRendu(compte, { essai, remiseLocale })) console.log(l);
    return compte.nonRemis.length || compte.restes.fiches || compte.restes.entrees ? 1 : 0;
  } catch (err) {
    if (ouverte) { try { await client.query('ROLLBACK'); } catch (_) { /* connexion perdue */ } }
    console.error(`[retour-2c] ERREUR, transaction annulée : ${err.message}`);
    return 1;
  } finally {
    await client.end();
  }
}

module.exports = { retour, pairesVariantes, lignesCompteRendu, MIGRATIONS_2C, HOTES_LOCAUX };

if (require.main === module) {
  principal().then((code) => { process.exitCode = code; }, (err) => { console.error(`[retour-2c] ${err.message}`); process.exitCode = 1; });
}
