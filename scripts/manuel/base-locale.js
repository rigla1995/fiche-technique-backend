/* Lot 2c — base locale protégée (docs/lot-2c-spec.md §2.8, R2.8.1).
 *
 *   node scripts/manuel/base-locale.js photo       CREATE DATABASE fiche_technique_avant2c TEMPLATE fiche_technique
 *                                                  (base à la migration 192, avant toute balise ; refusé si elle existe)
 *   node scripts/manuel/base-locale.js copie       DROP DATABASE IF EXISTS fiche_technique_2c, puis
 *                                                  CREATE DATABASE fiche_technique_2c TEMPLATE fiche_technique_avant2c
 *   node scripts/manuel/base-locale.js etat        les trois bases : existence, dernière migration, 194-196, table des variantes
 *   node scripts/manuel/base-locale.js supprimer   retire la photo et la copie (après D2, §12.2)
 *
 * Lancé par l'intégrateur SEUL. Arrêter le backend de test et tout client SQL avant « photo » et « copie » :
 * PostgreSQL refuse CREATE DATABASE … TEMPLATE x tant qu'une session est ouverte sur x. C'est pourquoi ce script
 * se connecte à la base « postgres », jamais à une des trois bases (sauf « etat », en lecture seule, une à la fois).
 *
 * Garde-fous : hôte local seulement (DB_HOST du .env) ; seules fiche_technique_avant2c et fiche_technique_2c
 * peuvent être créées ou supprimées ; la source d'une photo est fiche_technique, celle d'une copie la photo,
 * jamais autre chose. DB_NAME n'est pas lu (il peut valoir fiche_technique_2c pendant le lot, R2.8.2).
 *
 * Après la photo : tout processus du 2c qui charge l'application ou lit la base tourne, dès que 194, 195 ou 196
 * sont dans migrations/ (étape C), sur une copie neuve : DB_NAME=fiche_technique_2c (R2.8.2). */
'use strict';
const path = require('path');
const RACINE = path.resolve(__dirname, '..', '..');
require('dotenv').config({ path: path.join(RACINE, '.env') });
const { Client } = require('pg');

const PRINCIPALE = 'fiche_technique';
const PHOTO = 'fiche_technique_avant2c';
const COPIE = 'fiche_technique_2c';
const CREABLES = [PHOTO, COPIE];
const HOTES_LOCAUX = ['localhost', '127.0.0.1', '::1'];
const MIGRATIONS_2C = /^(194|195|196)_/;

const commande = process.argv[2];
const COMMANDES = ['photo', 'copie', 'etat', 'supprimer'];
if (!COMMANDES.includes(commande)) {
  console.error(`usage : node scripts/manuel/base-locale.js <${COMMANDES.join('|')}>`);
  process.exit(2);
}

const hote = process.env.DB_HOST || 'localhost';
if (!HOTES_LOCAUX.includes(hote)) {
  console.error(`[base-locale] refus : hôte « ${hote} » non local (${HOTES_LOCAUX.join(', ')} seulement)`);
  process.exit(2);
}

const connexion = (database) => new Client({
  host: hote,
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
  database,
});
// Nom de base cité dans une commande SQL : seulement l'une des trois bases connues (jamais une saisie).
const ident = (nom) => {
  if (![PRINCIPALE, PHOTO, COPIE].includes(nom)) throw new Error(`base « ${nom} » hors liste`);
  return `"${nom}"`;
};

async function existe(pg, nom) {
  const r = await pg.query('SELECT 1 FROM pg_database WHERE datname = $1', [nom]);
  return r.rowCount === 1;
}

// Sessions ouvertes sur une base (CREATE DATABASE … TEMPLATE les refuse).
async function sessions(pg, nom) {
  const r = await pg.query(
    'SELECT pid, usename, application_name, client_addr::text AS adresse, state FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
    [nom]
  );
  return r.rows;
}

// Lecture seule d'une base : dernière migration, migrations du 2c présentes, table des variantes, balises.
async function lireBase(nom) {
  const c = connexion(nom);
  await c.connect();
  try {
    await c.query('BEGIN TRANSACTION READ ONLY');
    const derniere = (await c.query("SELECT MAX(filename) AS f FROM _migrations WHERE filename LIKE '%.sql'")).rows[0].f;
    const toutes = (await c.query('SELECT filename FROM _migrations ORDER BY filename')).rows.map((r) => r.filename);
    const variantes = (await c.query("SELECT to_regclass('manuel_sections_domaine') IS NOT NULL AS t")).rows[0].t;
    const balisees = (await c.query("SELECT COUNT(*)::int AS n FROM manuel_sections WHERE position('[[' in contenu || COALESCE(contenu_defaut, '') || titre || COALESCE(partie, '')) > 0")).rows[0].n;
    const base = (await c.query("SELECT COUNT(*)::int AS n FROM ai_knowledge_base WHERE position('[[' in titre || contenu) > 0")).rows[0].n;
    // Empreintes globales : même formule que la lecture (1) de scripts/controle-avant-2c.sql (photo intacte, P15).
    const emp = (await c.query(`SELECT
      (SELECT md5(string_agg(slug || '|' || titre || '|' || COALESCE(partie, '') || '|'
                             || md5(replace(COALESCE(contenu_defaut, contenu), E'\\r', '')) || '|'
                             || md5(replace(contenu, E'\\r', '')) || '|' || COALESCE(mots_cles, ''),
                             E'\\n' ORDER BY slug)) FROM manuel_sections) AS manuel,
      (SELECT md5(string_agg(lower(titre) || '|' || titre || '|' || md5(replace(contenu, E'\\r', '')) || '|'
                             || COALESCE(mots_cles, '') || '|' || actif::text,
                             E'\\n' ORDER BY lower(titre))) FROM ai_knowledge_base) AS base`)).rows[0];
    await c.query('ROLLBACK');
    return { derniere, migrations2c: toutes.filter((f) => MIGRATIONS_2C.test(f)), tableVariantes: variantes, fichesBalisees: balisees, entreesBalisees: base, empreintes: emp };
  } finally {
    await c.end();
  }
}

async function creer(pg, cible, source) {
  if (!CREABLES.includes(cible)) throw new Error(`création refusée : ${cible}`);
  const sourcesAdmises = { [PHOTO]: PRINCIPALE, [COPIE]: PHOTO };
  if (sourcesAdmises[cible] !== source) throw new Error(`source refusée pour ${cible} : ${source} (attendue : ${sourcesAdmises[cible]})`);
  if (!(await existe(pg, source))) throw new Error(`base source absente : ${source}`);
  const ouvertes = await sessions(pg, source);
  if (ouvertes.length) {
    throw new Error(`${ouvertes.length} session(s) ouverte(s) sur ${source} (arrêter le backend de test et tout client SQL) : ${ouvertes.map((s) => `pid ${s.pid} ${s.application_name || '?'} ${s.state || ''}`.trim()).join(' ; ')}`);
  }
  const t0 = Date.now();
  await pg.query(`CREATE DATABASE ${ident(cible)} TEMPLATE ${ident(source)}`);
  console.log(`[base-locale] ${cible} créée depuis ${source} (${Date.now() - t0} ms)`);
}

async function supprimer(pg, cible) {
  if (!CREABLES.includes(cible)) throw new Error(`suppression refusée : ${cible}`);
  const a = await existe(pg, cible);
  await pg.query(`DROP DATABASE IF EXISTS ${ident(cible)}`);
  console.log(`[base-locale] ${cible} : ${a ? 'supprimée' : 'absente (rien à faire)'}`);
}

async function etat(pg) {
  for (const nom of [PRINCIPALE, PHOTO, COPIE]) {
    if (!(await existe(pg, nom))) { console.log(`  ${nom.padEnd(24)} absente`); continue; }
    const taille = (await pg.query('SELECT pg_size_pretty(pg_database_size($1)) AS t', [nom])).rows[0].t;
    const e = await lireBase(nom);
    console.log(`  ${nom.padEnd(24)} ${taille.padEnd(8)} dernière migration ${e.derniere} ; 194-196 : ${e.migrations2c.length ? e.migrations2c.join(', ') : 'aucune'} ; manuel_sections_domaine : ${e.tableVariantes ? 'présente' : 'absente'} ; balises en base : ${e.fichesBalisees} fiche(s), ${e.entreesBalisees} entrée(s) ; empreintes manuel ${e.empreintes.manuel}, base ${e.empreintes.base}`);
  }
}

(async () => {
  const pg = connexion('postgres');
  await pg.connect();
  let code = 0;
  try {
    if (commande === 'photo') {
      if (await existe(pg, PHOTO)) throw new Error(`${PHOTO} existe déjà : la photo n'est prise qu'une fois (« supprimer » d'abord, seulement après D2)`);
      // La photo est celle d'une base non balisée : jamais après 194 à 196 (R2.8.4 sinon).
      const e = await lireBase(PRINCIPALE);
      if (e.migrations2c.length || e.fichesBalisees || e.entreesBalisees) {
        throw new Error(`${PRINCIPALE} a déjà reçu ${e.migrations2c.join(', ') || 'des balises'} : pas de photo (remise à zéro d'abord, R2.8.4)`);
      }
      await creer(pg, PHOTO, PRINCIPALE);
    } else if (commande === 'copie') {
      if (!(await existe(pg, PHOTO))) throw new Error(`${PHOTO} absente : « photo » d'abord`);
      const ouvertes = await existe(pg, COPIE) ? await sessions(pg, COPIE) : [];
      if (ouvertes.length) throw new Error(`${ouvertes.length} session(s) ouverte(s) sur ${COPIE} : arrêter ce qui tourne dessus`);
      await supprimer(pg, COPIE);
      await creer(pg, COPIE, PHOTO);
    } else if (commande === 'supprimer') {
      await supprimer(pg, COPIE);
      await supprimer(pg, PHOTO);
    }
    console.log('[base-locale] état :');
    await etat(pg);
  } catch (e) {
    console.error(`[base-locale] ÉCHEC : ${e.message}`);
    code = 1;
  } finally {
    await pg.end().catch(() => {});
  }
  process.exit(code);
})();
