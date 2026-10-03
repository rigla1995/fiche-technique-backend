/* Lot 2c — essai de migration en transaction ANNULÉE (docs/lot-2c-spec.md §3.7, P4).
 *
 *   node scripts/manuel/essai-migration.js                    SQL d'essai de <racine>/rendus/essai-migrations/ (générateur
 *                                                             --fiches, --lot ou --essai)
 *   node scripts/manuel/essai-migration.js --dossier <d>       SQL d'essai d'un autre dossier (générateur --dossier <d>)
 *   node scripts/manuel/essai-migration.js --migrations        194, 195, 196 de migrations/ (étape C et après : sur une COPIE,
 *                                                             DB_NAME=fiche_technique_2c, R2.8.2)
 *   --racine <d>   racine des fichiers de travail (comme le générateur) ; --rapport <f> : compte rendu JSON (défaut :
 *                  <racine>/rendus/essai-migration.json).
 *
 * Base : variables DB_* du .env ; DB_NAME posé dans l'environnement l'emporte (dotenv n'écrase pas). Hôte local seulement.
 * Avant : la base doit être au texte d'origine (aucune « [[ », empreintes globales = celles des fichiers d'origine, 194 à
 * 196 absentes de _migrations), sinon refus.
 * Dans UNE transaction, toujours annulée (ROLLBACK, même en cas de succès) :
 *   1. 193 appliquée si la table manuel_sections_domaine manque (base à la 192 : photo, copie) ;
 *   2. les fichiers donnés, dans l'ordre (194, 195, 196), chacun inscrit dans _migrations comme le fait migrate.js ;
 *   3. NOTICE attendues, tirées de la ligne « -- inventaire » de chaque fichier : 194 N / 0 / 0, 195 M / 0 / 0, 196 K inséré(s) ;
 *   4. chaque fiche (les 61) relue : rendreFiche(vocabDefaut, ligne) — la fonction du serveur, src/utils/manuelRendu.js —
 *      donne titre, partie, contenu d'origine octet pour octet ; contenu_defaut rendu = md5Garde ; aucun « \r » ; les fiches
 *      écrites portent « [[ » ; les fiches acheteurs du périmètre n'ont plus contenu_defaut NULL ; updated_at inchangé ;
 *   5. chacune des 32 entrées relue : rendreEntreeBase(vocabDefaut, ligne) donne titre et contenu d'origine, octet pour
 *      octet ; mots_cles et updated_at inchangés ;
 *   6. domaine hotellerie de la base : profil RÉSOLU par getProfil (lexique et composants, R3.1.1), requête du §5.2
 *      (requeteManuel) et rendreFiche / rendreEntreeBase : aucune « [[ », aucun « ‹clé› » ; si la 196 est appliquée, ses
 *      brouillons H passés « valide » dans un point de sauvegarde annulé sont servis et rendus sans balise ;
 *   7. 2e passage de chaque fichier : NOTICE « déjà balisée » (0 / N / 0, 0 / M / 0), 196 : 0 inséré ; état des trois
 *      tables identique à l'octet avant et après ;
 *   8. retour(client) de retour-2c.js (sans BEGIN ni COMMIT) : textes d'origine octet pour octet, contenu_defaut NULL pour
 *      les 5 fiches acheteurs, 194 et 195 retirées de _migrations, empreintes globales revenues à celles d'avant.
 * Après le ROLLBACK : empreintes globales, to_regclass('manuel_sections_domaine') et lignes de _migrations relues, égales à
 * celles d'avant l'essai (un COMMIT caché dans un fichier se verrait).
 * Codes de sortie : 0 essai réussi ; 1 au moins un contrôle en échec ; 2 refus (usage, hôte, base non conforme). */
'use strict';
const fs = require('fs');
const path = require('path');
const C = require('./lib/commun.js');

const RACINE = C.RACINE;
require('dotenv').config({ path: path.join(RACINE, '.env') });
const { Client } = require('pg');
const { rendre, vocabDefaut, vocabDuLexique } = require('../../src/utils/vocab.js');
const { rendreFiche, rendreEntreeBase, requeteManuel, slugVariantes } = require('../../src/utils/manuelRendu.js');
const { retour, MIGRATIONS_2C, HOTES_LOCAUX } = require('./retour-2c.js');

const MIGRATION_193 = '193_manuel_sections_domaine.sql';
const RESTE = /\[\[|\]\]|‹[a-z0-9_]+›/;
const memesOctets = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.from(a, 'utf8').equals(Buffer.from(b, 'utf8'));

// Requête (1) de scripts/controle-avant-2c.sql (empreintes globales).
const SQL_EMPREINTES = `SELECT
  (SELECT md5(string_agg(slug || '|' || titre || '|' || COALESCE(partie, '') || '|'
                         || md5(replace(COALESCE(contenu_defaut, contenu), E'\\r', '')) || '|'
                         || md5(replace(contenu, E'\\r', '')) || '|' || COALESCE(mots_cles, ''),
                         E'\\n' ORDER BY slug)) FROM manuel_sections) AS manuel,
  (SELECT md5(string_agg(lower(titre) || '|' || titre || '|' || md5(replace(contenu, E'\\r', '')) || '|'
                         || COALESCE(mots_cles, '') || '|' || actif::text,
                         E'\\n' ORDER BY lower(titre))) FROM ai_knowledge_base) AS base`;
// Empreinte de l'état complet des trois tables (idempotence du 2e passage).
const SQL_ETAT_TABLES = `SELECT
  (SELECT md5(string_agg(slug || '|' || titre || '|' || partie || '|' || contenu || '|' || COALESCE(contenu_defaut, '∅') || '|'
                         || COALESCE(mots_cles, '∅') || '|' || updated_at::text, E'\\n' ORDER BY slug)) FROM manuel_sections) AS manuel,
  (SELECT md5(string_agg(id || '|' || titre || '|' || contenu || '|' || COALESCE(mots_cles, '∅') || '|' || COALESCE(categorie, '∅')
                         || '|' || COALESCE(updated_at::text, '∅'), E'\\n' ORDER BY id)) FROM ai_knowledge_base) AS base`;
const SQL_ETAT_VARIANTES = `SELECT md5(COALESCE(string_agg(section_id || '|' || domaine_slug || '|' || COALESCE(titre, '∅') || '|' || contenu
                         || '|' || statut || '|' || COALESCE(base_md5, '∅'), E'\\n' ORDER BY section_id, domaine_slug), '')) AS v
                         FROM manuel_sections_domaine`;

function lireArguments(argv) {
  const o = { dossier: null, migrations: false, racine: null, rapport: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dossier') o.dossier = argv[++i];
    else if (a === '--migrations') o.migrations = true;
    else if (a === '--racine') o.racine = argv[++i];
    else if (a === '--rapport') o.rapport = argv[++i];
    else throw new Error(`option inconnue « ${a} »`);
  }
  for (const k of ['dossier', 'racine', 'rapport']) if (o[k] === undefined) throw new Error(`--${k} attend une valeur`);
  if (o.dossier && o.migrations) throw new Error('--dossier et --migrations s\'excluent');
  return o;
}

/** Fichiers à appliquer, dans l'ordre, avec leur inventaire (ligne « -- inventaire : {…} » du générateur). */
function fichiersEssai(dossier) {
  const out = [];
  for (const nom of [MIGRATIONS_2C.manuel, MIGRATIONS_2C.base, MIGRATIONS_2C.variantes]) {
    const f = path.join(dossier, nom);
    if (!fs.existsSync(f)) continue;
    const sql = fs.readFileSync(f, 'utf8');
    const m = /^-- inventaire : (.*)$/m.exec(sql);
    if (!m) throw new Error(`${f} : ligne « -- inventaire » absente (fichier non généré par generer-migrations.mjs ?)`);
    out.push({ nom, chemin: f, sql, inventaire: JSON.parse(m[1]) });
  }
  if (!out.length) throw new Error(`aucun fichier ${Object.values(MIGRATIONS_2C).join(', ')} dans ${dossier}`);
  return out;
}

async function etatGlobal(client) {
  const e = (await client.query(SQL_EMPREINTES)).rows[0];
  const t = (await client.query("SELECT to_regclass('manuel_sections_domaine') IS NOT NULL AS existe")).rows[0].existe;
  const m = (await client.query('SELECT filename FROM _migrations ORDER BY filename')).rows.map((r) => r.filename);
  return { empreintes: { manuel: e.manuel, base: e.base }, tableVariantes: t, migrations: m };
}

const lireNotice = {
  [MIGRATIONS_2C.manuel]: (t) => {
    const m = /^194 : (\d+) fiche\(s\) balisée\(s\), (\d+) déjà balisée\(s\), (\d+) gardée\(s\)/.exec(t);
    return m && { balisees: +m[1], deja: +m[2], gardees: +m[3] };
  },
  [MIGRATIONS_2C.base]: (t) => {
    const m = /^195 : (\d+) entrée\(s\) balisée\(s\), (\d+) déjà balisée\(s\), (\d+) gardée\(s\)/.exec(t);
    return m && { balisees: +m[1], deja: +m[2], gardees: +m[3] };
  },
  [MIGRATIONS_2C.variantes]: (t) => {
    const m = /^196 : (\d+) brouillon\(s\) inséré\(s\)/.exec(t);
    return m && { inseres: +m[1] };
  },
};
const attendu = (f, passage) => {
  const i = f.inventaire;
  if (f.nom === MIGRATIONS_2C.manuel) return passage === 1 ? { balisees: i.contenus.length, deja: 0, gardees: 0 } : { balisees: 0, deja: i.contenus.length, gardees: 0 };
  if (f.nom === MIGRATIONS_2C.base) return passage === 1 ? { balisees: i.entrees.length, deja: 0, gardees: 0 } : { balisees: 0, deja: i.entrees.length, gardees: 0 };
  return { inseres: passage === 1 ? i.variantes.length : 0 };
};

async function essai(o) {
  const racine = path.resolve(o.racine || C.DOSSIER);
  const dossier = o.migrations ? path.join(RACINE, 'migrations') : path.resolve(o.dossier || path.join(racine, 'rendus', 'essai-migrations'));
  const fichiers = fichiersEssai(dossier);
  const origine = C.lireOrigine();
  const parSlug = new Map(origine.fiches.map((f) => [f.slug, f]));
  const parCle = new Map(origine.entrees.map((e) => [e.cle, e]));
  const controles = [];
  const ok = (nom, detail = '') => controles.push({ ok: true, nom, detail });
  const ko = (nom, detail) => controles.push({ ok: false, nom, detail });
  const verifier = (cond, nom, detailOk, detailKo) => (cond ? ok(nom, detailOk) : ko(nom, detailKo));

  const hote = process.env.DB_HOST || 'localhost';
  if (!HOTES_LOCAUX.includes(hote)) { const e = new Error(`hôte « ${hote} » non local (${HOTES_LOCAUX.join(', ')} seulement)`); e.code = 2; throw e; }
  const client = new Client({
    host: hote, port: parseInt(process.env.DB_PORT, 10) || 5432, user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD, database: process.env.DB_NAME || 'fiche_technique',
  });
  await client.connect();
  let notices = [];
  client.on('notice', (n) => notices.push(String(n && n.message ? n.message : n)));
  const base = (await client.query('SELECT current_database() AS d')).rows[0].d;
  let avant;
  let apres;
  let transaction = false;
  try {
    // ── Avant ──
    avant = await etatGlobal(client);
    const balisees = (await client.query(`SELECT
      (SELECT count(*)::int FROM manuel_sections WHERE position('[[' in contenu || COALESCE(contenu_defaut, '') || titre || partie) > 0) AS fiches,
      (SELECT count(*)::int FROM ai_knowledge_base WHERE position('[[' in titre || contenu) > 0) AS entrees`)).rows[0];
    const empOrigine = C.empreintesOrigine();
    const refus = [];
    if (balisees.fiches || balisees.entrees) refus.push(`base déjà balisée (${balisees.fiches} fiche(s), ${balisees.entrees} entrée(s) portent « [[ »)`);
    if (avant.empreintes.manuel !== empOrigine.manuel || avant.empreintes.base !== empOrigine.base) refus.push(`empreintes de la base (${avant.empreintes.manuel} / ${avant.empreintes.base}) ≠ fichiers d'origine (${empOrigine.manuel} / ${empOrigine.base})`);
    const deja = avant.migrations.filter((f) => /^19[456]_/.test(f));
    if (deja.length) refus.push(`_migrations contient déjà ${deja.join(', ')} (R2.8.2 : essai sur une copie neuve)`);
    if (refus.length) { const e = new Error(`base « ${base} » non conforme : ${refus.join(' ; ')}`); e.code = 2; throw e; }

    // ── Transaction ──
    await client.query('BEGIN');
    transaction = true;
    const majAvant = new Map((await client.query('SELECT slug, updated_at::text AS u FROM manuel_sections')).rows.map((r) => [r.slug, r.u]));
    const majBaseAvant = new Map((await client.query('SELECT id, updated_at::text AS u, mots_cles FROM ai_knowledge_base')).rows.map((r) => [r.id, r]));
    if (!avant.tableVariantes) {
      const sql193 = fs.readFileSync(path.join(RACINE, 'migrations', MIGRATION_193), 'utf8');
      await client.query(sql193);
      if (!avant.migrations.includes(MIGRATION_193)) await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [MIGRATION_193]);
      ok('193 appliquée (table absente)');
    } else ok('193 déjà appliquée', 'table manuel_sections_domaine présente');

    // 1er passage.
    for (const f of fichiers) {
      if (f.sql.includes('\r')) ko(`${f.nom} : fichier en LF`, '« \\r » dans le fichier');
      notices = [];
      await client.query(f.sql);
      await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [f.nom]);
      const n = notices.map((t) => lireNotice[f.nom](t)).find(Boolean);
      const a = attendu(f, 1);
      verifier(n && JSON.stringify(n) === JSON.stringify(a), `${f.nom} : NOTICE du 1er passage`, notices.join(' | '), `attendu ${JSON.stringify(a)}, lu ${notices.join(' | ') || 'aucune NOTICE'}`);
    }

    // Fiches relues.
    const inv194 = (fichiers.find((f) => f.nom === MIGRATIONS_2C.manuel) || { inventaire: { contenus: [] } }).inventaire;
    const ecrites = new Set(inv194.contenus);
    const lignes = (await client.query('SELECT slug, titre, partie, contenu, contenu_defaut, mots_cles, updated_at::text AS u FROM manuel_sections ORDER BY slug')).rows;
    const fautesFiches = [];
    for (const o0 of origine.fiches) {
      const l = lignes.find((x) => x.slug === o0.slug);
      if (!l) { fautesFiches.push(`${o0.slug} : absente`); continue; }
      for (const c of ['titre', 'partie', 'contenu', 'contenu_defaut']) if (typeof l[c] === 'string' && l[c].includes('\r')) fautesFiches.push(`${o0.slug} › ${c} : « \\r »`);
      const r = rendreFiche(vocabDefaut, l);
      for (const c of ['titre', 'partie', 'contenu']) if (!memesOctets(r[c], o0[c])) fautesFiches.push(`${o0.slug} › ${c} : rendu par défaut ≠ origine`);
      if (l.contenu_defaut === null) { if (!o0.defautNull || ecrites.has(o0.slug)) fautesFiches.push(`${o0.slug} › contenu_defaut NULL`); }
      else if (C.md5(rendre(vocabDefaut, l.contenu_defaut, () => {})) !== o0.md5Garde) fautesFiches.push(`${o0.slug} › contenu_defaut : rendu par défaut ≠ md5Garde`);
      if (ecrites.has(o0.slug) && !(l.contenu.includes('[[') && l.contenu_defaut && l.contenu_defaut.includes('[['))) fautesFiches.push(`${o0.slug} : contenu ou contenu_defaut sans balise après la 194`);
      if (l.u !== majAvant.get(o0.slug)) fautesFiches.push(`${o0.slug} : updated_at changé (R4.2.4)`);
      if (l.mots_cles !== o0.mots_cles) fautesFiches.push(`${o0.slug} : mots_cles changés (R4.2.6)`);
    }
    if (lignes.length !== origine.fiches.length) fautesFiches.push(`${lignes.length} fiches en base, ${origine.fiches.length} à l'origine`);
    const acheteurs = origine.fiches.filter((f) => f.defautNull && ecrites.has(f.slug)).map((f) => f.slug);
    verifier(!fautesFiches.length, `61 fiches : rendu par défaut = origine octet pour octet (rendreFiche), sans « \\r », updated_at inchangé`,
      `${ecrites.size} fiche(s) balisée(s) en base ; défaut posé pour ${acheteurs.length} fiche(s) acheteurs du périmètre (${acheteurs.join(', ') || '—'})`, fautesFiches.slice(0, 15).join(' ; '));

    // Entrées relues.
    const fautesBase = [];
    const entrees = (await client.query('SELECT id, titre, contenu, mots_cles, updated_at::text AS u FROM ai_knowledge_base ORDER BY id')).rows;
    const vues = new Set();
    let entreesBalisees = 0;
    for (const l of entrees) {
      const r = rendreEntreeBase(vocabDefaut, l);
      const cle = r.titre.toLowerCase();
      const o0 = parCle.get(cle);
      if (!o0) { fautesBase.push(`entrée id ${l.id} « ${r.titre} » : aucune entrée d'origine de cette clé`); continue; }
      vues.add(cle);
      if (l.titre.includes('[[') || l.contenu.includes('[[')) entreesBalisees += 1;
      if (!memesOctets(r.titre, o0.titre)) fautesBase.push(`${o0.cle} › titre : rendu par défaut ≠ origine`);
      if (!memesOctets(r.contenu, o0.contenu)) fautesBase.push(`${o0.cle} › contenu : rendu par défaut ≠ origine`);
      if (/\r/.test(l.titre + l.contenu)) fautesBase.push(`${o0.cle} : « \\r »`);
      const av = majBaseAvant.get(l.id);
      if (!av || av.u !== l.u) fautesBase.push(`${o0.cle} : updated_at changé`);
      if (l.mots_cles !== o0.mots_cles) fautesBase.push(`${o0.cle} : mots_cles changés`);
    }
    for (const c of parCle.keys()) if (!vues.has(c)) fautesBase.push(`entrée « ${c} » introuvable après les migrations`);
    verifier(!fautesBase.length, '32 entrées : rendreEntreeBase(vocabDefaut) = origine octet pour octet (titre, contenu)',
      `${entreesBalisees} entrée(s) balisée(s) en base`, fautesBase.slice(0, 15).join(' ; '));

    // Hôtellerie : profil résolu, requête du §5.2, rendus sans balise.
    const dom = (await client.query("SELECT id FROM domaines_activite WHERE slug = 'hotellerie'")).rows[0];
    if (!dom) ko('Hôtellerie : rendus sans balise', 'domaine hotellerie absent de la base');
    else {
      const { getProfil } = require('../../src/services/domaineProfilService.js');
      const profil = await getProfil(dom.id);
      const voc = vocabDuLexique(profil.lexique);
      const q = requeteManuel(slugVariantes(voc, profil));
      const lireH = async () => (await client.query(q.text, q.values)).rows;
      const restesH = (rows, quoi) => {
        const out = [];
        for (const row of rows) {
          const r = quoi === 'base' ? rendreEntreeBase(voc, row, profil.composants) : rendreFiche(voc, row, profil.composants);
          for (const c of ['titre', 'partie', 'contenu', 'mots_cles']) if (typeof r[c] === 'string' && RESTE.test(r[c])) out.push(`${row.slug || row.titre} › ${c} : ${RESTE.exec(r[c])[0]}`);
        }
        return out;
      };
      const fiches = await lireH();
      const base = (await client.query('SELECT titre, contenu, mots_cles FROM ai_knowledge_base WHERE actif = true ORDER BY id')).rows;
      const fautesH = [...restesH(fiches, 'manuel'), ...restesH(base, 'base')];
      verifier(!voc.estDefaut && !fautesH.length, 'Hôtellerie (profil résolu par getProfil, requête du §5.2) : aucune « [[ » ni « ‹clé› »',
        `${fiches.length} fiche(s) servie(s), ${base.length} entrée(s) ; slug des variantes « ${q.values[0]} » ; ${profil.composants.length} composant(s)`,
        voc.estDefaut ? 'lexique hotellerie sans écart (estDefaut vrai)' : fautesH.slice(0, 10).join(' ; '));
      const inv196 = (fichiers.find((f) => f.nom === MIGRATIONS_2C.variantes) || {}).inventaire;
      if (inv196 && q.values[0]) {
        await client.query('SAVEPOINT variantes_h');
        const v = await client.query("UPDATE manuel_sections_domaine SET statut = 'valide' WHERE domaine_slug = $1 RETURNING section_id", [q.values[0]]);
        const servies = await lireH();
        const ids = new Set(v.rows.map((r) => r.section_id));
        const variantesServies = servies.filter((s) => ids.has(s.id));
        const fautesV = restesH(variantesServies, 'manuel');
        await client.query('ROLLBACK TO SAVEPOINT variantes_h');
        verifier(!fautesV.length && variantesServies.length === v.rowCount, 'Hôtellerie : brouillons de la 196 validés (point de sauvegarde annulé) servis et rendus sans balise',
          `${variantesServies.length} variante(s) servie(s)`, fautesV.slice(0, 10).join(' ; ') || `${variantesServies.length} servie(s) pour ${v.rowCount} validée(s)`);
      }
    }

    // 2e passage : rien ne change.
    const etat1 = { ...(await client.query(SQL_ETAT_TABLES)).rows[0], v: (await client.query(SQL_ETAT_VARIANTES)).rows[0].v };
    for (const f of fichiers) {
      notices = [];
      await client.query(f.sql);
      const n = notices.map((t) => lireNotice[f.nom](t)).find(Boolean);
      const a = attendu(f, 2);
      verifier(n && JSON.stringify(n) === JSON.stringify(a), `${f.nom} : NOTICE du 2e passage (idempotence)`, notices.join(' | '), `attendu ${JSON.stringify(a)}, lu ${notices.join(' | ') || 'aucune NOTICE'}`);
    }
    const etat2 = { ...(await client.query(SQL_ETAT_TABLES)).rows[0], v: (await client.query(SQL_ETAT_VARIANTES)).rows[0].v };
    verifier(JSON.stringify(etat1) === JSON.stringify(etat2), '2e passage : état des trois tables identique', JSON.stringify(etat2), `${JSON.stringify(etat1)} → ${JSON.stringify(etat2)}`);

    // Retour arrière.
    const compte = await retour(client);
    const fautesRetour = [];
    const lignesR = (await client.query('SELECT slug, titre, partie, contenu, contenu_defaut FROM manuel_sections')).rows;
    for (const l of lignesR) {
      const o0 = parSlug.get(l.slug);
      if (!o0) continue;
      for (const c of ['titre', 'partie', 'contenu']) if (!memesOctets(l[c], o0[c])) fautesRetour.push(`${l.slug} › ${c} ≠ origine`);
      if (o0.defautNull) { if (l.contenu_defaut !== null) fautesRetour.push(`${l.slug} › contenu_defaut non NULL`); }
      else if (l.contenu_defaut === null || C.md5(l.contenu_defaut) !== o0.md5Garde) fautesRetour.push(`${l.slug} › contenu_defaut ≠ origine`);
    }
    const entreesR = (await client.query('SELECT titre, contenu FROM ai_knowledge_base')).rows;
    for (const l of entreesR) {
      const o0 = parCle.get(l.titre.toLowerCase());
      if (!o0) { fautesRetour.push(`entrée « ${l.titre} » : titre ≠ origine`); continue; }
      if (!memesOctets(l.titre, o0.titre) || !memesOctets(l.contenu, o0.contenu)) fautesRetour.push(`${o0.cle} ≠ origine`);
    }
    const migR = (await client.query('SELECT filename FROM _migrations WHERE filename = ANY($1::text[])', [[MIGRATIONS_2C.manuel, MIGRATIONS_2C.base]])).rows;
    if (migR.length) fautesRetour.push(`_migrations garde ${migR.map((r) => r.filename).join(', ')}`);
    const empR = (await client.query(SQL_EMPREINTES)).rows[0];
    if (empR.manuel !== avant.empreintes.manuel || empR.base !== avant.empreintes.base) fautesRetour.push(`empreintes après retour ${empR.manuel} / ${empR.base} ≠ avant`);
    if (compte.nonRemis.length) fautesRetour.push(`non remis : ${compte.nonRemis.map((x) => `${x.cle} › ${x.champ}`).join(', ')}`);
    verifier(!fautesRetour.length, 'retour(client) de retour-2c.js : origine octet pour octet, défauts NULL, 194 et 195 retirées de _migrations, empreintes d\'avant',
      `${compte.fiches} fiche(s), ${compte.entrees} entrée(s) remises ; défaut NULL remis : ${compte.defautNull} ; retiré : ${compte.migrations.join(', ') || 'rien'}`, fautesRetour.slice(0, 15).join(' ; '));
  } finally {
    if (transaction) {
      try { await client.query('ROLLBACK'); } catch (_) { /* connexion perdue */ }
    }
    try {
      if (avant) {
        apres = await etatGlobal(client);
      }
    } finally {
      await client.end();
      try { await require('../../src/config/database.js').end(); } catch (_) { /* pool jamais ouvert */ }
    }
  }
  if (avant && apres) {
    const memes = JSON.stringify(avant) === JSON.stringify(apres);
    verifier(memes, 'après ROLLBACK : empreintes globales, table des variantes et _migrations comme avant l\'essai',
      `${apres.empreintes.manuel} / ${apres.empreintes.base} ; table ${apres.tableVariantes ? 'présente' : 'absente'} ; ${apres.migrations.length} ligne(s) de _migrations`,
      `avant ${JSON.stringify(avant.empreintes)} ${avant.tableVariantes} ${avant.migrations.length} ; après ${JSON.stringify(apres.empreintes)} ${apres.tableVariantes} ${apres.migrations.length}`);
  }
  return { base, dossier, fichiers: fichiers.map((f) => ({ nom: f.nom, inventaire: f.inventaire })), avant, apres, controles };
}

async function principal(argv = process.argv.slice(2)) {
  let o;
  try { o = lireArguments(argv); } catch (err) { console.error(`[essai] ${err.message}`); return 2; }
  let r;
  try {
    r = await essai(o);
  } catch (err) {
    console.error(`[essai] ${err.code === 2 ? 'REFUS' : 'ERREUR (transaction annulée)'} : ${err.message}`);
    return err.code === 2 ? 2 : 1;
  }
  console.log(`[essai] base « ${r.base} », fichiers de ${path.relative(RACINE, r.dossier)} : ${r.fichiers.map((f) => f.nom).join(', ')}`);
  for (const c of r.controles) console.log(`  ${c.ok ? '✓' : '✗'} ${c.nom}${c.detail ? ` — ${c.detail}` : ''}`);
  const echecs = r.controles.filter((c) => !c.ok).length;
  console.log(`[essai] ${echecs ? `ÉCHEC : ${echecs} contrôle(s)` : 'ESSAI RÉUSSI'} ; transaction annulée (ROLLBACK)`);
  const rapport = o.rapport ? path.resolve(o.rapport) : path.join(path.resolve(o.racine || C.DOSSIER), 'rendus', 'essai-migration.json');
  C.ecrireJson(rapport, { _lisezmoi: 'essai-migration.js (spec §3.7) : compte rendu du dernier essai (non versionné).', le: new Date().toISOString(), ...r, dossier: path.relative(RACINE, r.dossier) });
  return echecs ? 1 : 0;
}

module.exports = { essai, fichiersEssai };

if (require.main === module) {
  principal().then((code) => { process.exitCode = code; }, (err) => { console.error(`[essai] ${err.message}`); process.exitCode = 1; });
}
