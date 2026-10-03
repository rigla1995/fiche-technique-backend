// Lot 2c, M0 (spec §3.6, §4.2 à §4.4) : générateur des migrations 194, 195, 196. Aucune base. Écritures dans des
// dossiers jetables (--racine, --dossier) ; migrations/ et src/config/ ne sont jamais touchés (vérifié).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { generer, lit, etiquette, dollar, sql194, sql195, sql196, champsAdmis, verifierLectureProduction, ENTETE, NOMS } from '../generer-migrations.mjs';
import { prebaliserEntree } from '../prebaliser.mjs';

const require = createRequire(import.meta.url);
const C = require('../lib/commun.js');

const OUTIL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'generer-migrations.mjs');
const TEMOINS = ['acheteurs-carnet', 'lexique', 'historique-paiements'];
const MIGRATIONS = path.join(C.RACINE, 'migrations');
const ADMIS = path.join(C.RACINE, 'src', 'config', 'manuelSansBaliseAdmis.json');
const lancer = (args) => spawnSync(process.execPath, [OUTIL, ...args], { encoding: 'utf8', cwd: C.RACINE });
const { fiches, entrees } = C.lireOrigine();
const etatProtege = () => JSON.stringify({
  migrations: fs.readdirSync(MIGRATIONS).filter((f) => /^19\d_/.test(f)).sort(),
  admis: fs.existsSync(ADMIS) ? C.md5(fs.readFileSync(ADMIS, 'utf8')) : null,
});

/** Racine jetable : les 3 témoins balisés ; avec `variantes`, une variante propre de « lexique » en H et en C. */
function racine({ variantes = false } = {}) {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'generer-'));
  fs.mkdirSync(path.join(r, 'balise', 'manuel'), { recursive: true });
  for (const s of TEMOINS) for (const x of ['.md', '.json']) fs.copyFileSync(path.join(C.CHEMINS.baliseManuel, s + x), path.join(r, 'balise', 'manuel', s + x));
  if (variantes) {
    const o = fiches.find((f) => f.slug === 'lexique');
    const md = ['## Lexique de l\'établissement', '', '[[Le:labo]] prépare ; [[le:activite:pl]] servent les clients.', '',
      ...[...o.contenu.matchAll(/^:::.*$/gm)].map((m) => m[0]), '',
      ...[...o.contenu.matchAll(/\]\(([^)\s]*)\)/g)].map((m) => `- [voir](${m[1]})`), ''].join('\n');
    const baseMd5 = C.md5(C.lireTexte(path.join(r, 'balise', 'manuel', 'lexique.md')));
    for (const d of ['hotellerie', 'ceramique']) {
      C.ecrireTexte(path.join(r, 'variantes', d, 'lexique.md'), md);
      C.ecrireJson(path.join(r, 'variantes', d, 'lexique.json'), { titre: null, baseMd5, exclusions: [] });
    }
  }
  return r;
}
const nettoyer = (...ds) => ds.forEach((d) => fs.rmSync(d, { recursive: true, force: true }));

test('chaînes SQL : apostrophes doublées, étiquettes sans tiret (R3.6.3), dollar-quoting gardé', () => {
  assert.equal(lit('Famille et catégorie d\'article'), '\'Famille et catégorie d\'\'article\'');
  assert.throws(() => lit('a\\b'), /refusée/);
  assert.equal(etiquette('m194', 'stock-labo'), '$m194_stock_labo$');
  assert.equal(etiquette('k195', 12), '$k195_12$');
  assert.equal(etiquette('v196', 'industrie-ceramique', 'calc-cout-recette'), '$v196_industrie_ceramique_calc_cout_recette$');
  assert.equal(dollar('texte', '$m194_x$'), '$m194_x$texte$m194_x$');
  assert.throws(() => dollar('a $m194_x$ b', '$m194_x$'), /étiquette/);
  assert.throws(() => dollar('a $k195_3$ b', '$m194_x$'), /étiquette/);
});

test('--fiches sur les 3 témoins : 194 en LF, en-tête, inventaire, étiquettes, fiche sans terme non écrite, rien dans migrations/', () => {
  const r = racine();
  const d = path.join(r, 'essai');
  const avant = etatProtege();
  try {
    const p = lancer(['--fiches', ...TEMOINS, '--racine', r, '--dossier', d]);
    assert.equal(p.status, 0, p.stdout + p.stderr);
    assert.deepEqual(fs.readdirSync(d).sort(), [NOMS.manuel, 'manuelSansBaliseAdmis.json']);
    const sql = fs.readFileSync(path.join(d, NOMS.manuel), 'utf8');
    assert.ok(!sql.includes('\r'), 'LF');
    assert.equal(sql.split('\n')[1], ENTETE);
    assert.match(sql, /^-- inventaire : \{"contenus":\["acheteurs-carnet","lexique"\],"titres":\["acheteurs-carnet"\],"parties":\["acheteurs-carnet"\],"sansTerme":\["historique-paiements"\]\}$/m);
    assert.ok(sql.includes('t := $m194_acheteurs_carnet$') && sql.includes('$m194_lexique$;'));
    assert.doesNotMatch(sql, /\$m194_[a-z0-9_]*-/, 'aucune étiquette à tiret');
    assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /\b(COMMIT|ROLLBACK|START TRANSACTION)\b/);
    assert.doesNotMatch(sql.replace(/^--.*$/gm, ''), /updated_at|mots_cles\s*=/, 'R4.2.4, R4.2.6');
    assert.ok(!sql.includes('historique-paiements\'') || /sans terme : %',[\s\S]*'historique-paiements'/.test(sql));
    // Texte balisé écrit UNE fois par fiche, garde md5Garde, CASE sans \r et avec COALESCE (R4.2.1).
    const lexique = C.lireTexte(path.join(r, 'balise', 'manuel', 'lexique.md'));
    assert.equal(sql.split(lexique).length - 1, 1);
    assert.ok(sql.includes(`= '${fiches.find((f) => f.slug === 'acheteurs-carnet').md5Garde}';`));
    assert.ok(sql.includes("contenu = CASE WHEN replace(m.contenu, E'\\r', '') = replace(COALESCE(m.contenu_defaut, m.contenu), E'\\r', '')"));
    // Titre et partie gardés par égalité exacte ; apostrophe doublée (« Carnet d'Acheteurs »).
    assert.ok(sql.includes("UPDATE manuel_sections SET titre = 'Carnet [[de:acheteur:pl:Nom]]' WHERE slug = 'acheteurs-carnet' AND titre = 'Carnet d''Acheteurs';"));
    assert.ok(sql.includes("UPDATE manuel_sections SET partie = '[[Nom:espace_acheteurs]]' WHERE slug = 'acheteurs-carnet' AND partie = 'Espace Acheteurs';"));
    assert.deepEqual(C.lireJson(path.join(d, 'manuelSansBaliseAdmis.json')), []);
    // Déterministe : un 2e passage donne le même SQL.
    assert.equal(lancer(['--fiches', ...TEMOINS, '--racine', r, '--dossier', d]).status, 0);
    assert.equal(fs.readFileSync(path.join(d, NOMS.manuel), 'utf8'), sql);
    assert.equal(etatProtege(), avant, 'migrations/ et src/config/ intacts');
  } finally { nettoyer(r); }
});

test('196 : --slug hotellerie=<slug à tiret> → étiquette sans tiret, slug SQL de production, base_md5 du texte commun', () => {
  const r = racine({ variantes: true });
  const d = path.join(r, 'essai');
  try {
    const p = lancer(['--fiches', 'lexique', '--racine', r, '--dossier', d, '--slug', 'hotellerie=industrie-hotel']);
    assert.equal(p.status, 0, p.stdout + p.stderr);
    const sql = fs.readFileSync(path.join(d, NOMS.variantes), 'utf8');
    assert.ok(sql.includes('$v196_industrie_hotel_lexique$') && sql.includes('$v196_ceramique_lexique$'));
    assert.doesNotMatch(sql, /\$v196_[a-z0-9_]*-/);
    assert.ok(sql.includes("SELECT s.id, 'industrie-hotel', NULL, $v196_industrie_hotel_lexique$"));
    assert.ok(sql.includes(`'brouillon', '${C.md5(C.lireTexte(path.join(r, 'balise', 'manuel', 'lexique.md')))}'`));
    assert.ok(sql.includes('ON CONFLICT (section_id, domaine_slug) DO NOTHING;'));
    assert.match(sql, /^-- inventaire : \{"variantes":\["industrie-hotel\/lexique","ceramique\/lexique"\]\}$/m);
    assert.equal(lancer(['--fiches', 'lexique', '--racine', r, '--dossier', d, '--slug', 'hotellerie=restauration']).status, 2);
    assert.equal(lancer(['--fiches', 'lexique', '--racine', r, '--dossier', d, '--slug', 'hotellerie=Avec Espace']).status, 2);
  } finally { nettoyer(r); }
});

test('195 : clé lower(titre) et titres avec apostrophes doublées, « déjà balisée » sous les deux titres', () => {
  const choisies = ['famille-et-categorie-d-article', 'labo-central', 'mode-de-prix-d-une-fiche-technique'];
  const lus = choisies.map((f) => {
    const o = entrees.find((e) => e.fichier === f);
    const p = prebaliserEntree(o);
    return { fichier: f, o, contenu: p.md, titre: f === 'labo-central' ? '[[Nom:labo]][[acc:labo: central:]]' : p.json.titre };
  });
  const { sql, inventaire } = sql195(lus);
  assert.deepEqual(inventaire.entrees, ['famille et catégorie d\'article', 'labo central', 'mode de prix d\'une fiche technique']);
  assert.ok(sql.includes("WHERE lower(titre) = 'famille et catégorie d''article'"));
  assert.ok(sql.includes("WHERE lower(titre) = 'mode de prix d''une fiche technique'"));
  assert.ok(sql.includes("titre = CASE WHEN titre = 'Labo central' THEN '[[Nom:labo]][[acc:labo: central:]]' ELSE titre END"));
  assert.ok(sql.includes("WHERE lower(titre) IN ('labo central', lower('[[Nom:labo]][[acc:labo: central:]]'))"));
  assert.ok(sql.includes('$k195_1$') && sql.includes('$k195_3$'));
  assert.ok(!sql.includes('\r'));
});

test('champs admis sans balise (R3.6.5) : forme par défaut, aucune « [[ », md5 du texte écrit', () => {
  const o = fiches.find((f) => f.slug === 'historique-paiements');
  const f = { slug: 'x', o, titre: 'Ventes', partie: 'Gestion', contenu: 'prix de vente seulement' };
  assert.deepEqual(champsAdmis([f], []), [
    { table: 'manuel_sections', champ: 'contenu', md5: C.md5('prix de vente seulement'), cle: 'x' },
    { table: 'manuel_sections', champ: 'titre', md5: C.md5('Ventes'), cle: 'x' },
  ]);
  assert.deepEqual(champsAdmis([{ ...f, titre: '[[Pl:vente]]', contenu: 'rien' }], []), []);
});

test('refus (R3.6.2) : fichier balisé absent, « \\r », étiquette dans un texte, baseMd5 périmé, contrôle en échec', () => {
  const r = racine({ variantes: true });
  const d = path.join(r, 'essai');
  try {
    const refus = (args) => {
      try { generer([...args, '--racine', r, '--dossier', d]); } catch (err) { return err.refus || [err.message]; }
      return [];
    };
    assert.ok(refus(['--fiches', 'lexique-pt']).some((x) => /balise\/manuel\/lexique-pt\.md ou \.json absent/.test(x)));
    const md = path.join(r, 'balise', 'manuel', 'historique-paiements.md');
    const t = C.lireTexte(md);
    fs.writeFileSync(md, t.replace('\n', '\r\n'));
    assert.ok(refus(['--fiches', 'historique-paiements']).some((x) => /\\r/.test(x)));
    fs.writeFileSync(md, t.replace('Historique', 'Historique $m194_x$'));
    const r2 = refus(['--fiches', 'historique-paiements']);
    assert.ok(r2.some((x) => /contrôle/.test(x)) || r2.some((x) => /étiquette/.test(x)), r2.join('\n'));
    fs.writeFileSync(md, t);
    // baseMd5 périmé : le texte commun de lexique change après l'écriture des variantes.
    const lex = path.join(r, 'balise', 'manuel', 'lexique.md');
    fs.writeFileSync(lex, `${C.lireTexte(lex)}`.replace('[[nom:stock]]', 'stock'));
    const r3 = refus(['--fiches', 'lexique']);
    assert.ok(r3.some((x) => /baseMd5/.test(x)), r3.join('\n'));
    assert.ok(r3.some((x) => /contrôle : fiche lexique échoue/.test(x)), 'forme laissée en clair : point 3');
    assert.ok(!fs.existsSync(path.join(d, NOMS.manuel)), 'rien n\'est écrit');
  } finally { nettoyer(r); }
});

test('écriture dans migrations/ : refusée sans lecture de production (R3.6.2) ; lecture valide → ce refus disparaît', () => {
  const r = racine();
  const avant = etatProtege();
  try {
    const absente = path.join(r, 'lecture-absente.json');
    const p = lancer(['--racine', r, '--lecture', absente]);
    assert.equal(p.status, 1);
    assert.match(p.stderr, /REFUS, rien n'est écrit/);
    assert.match(p.stderr, /lecture de production absente/);
    assert.match(p.stderr, /contrôle --tout ROUGE/);
    assert.equal(etatProtege(), avant, 'migrations/ et src/config/manuelSansBaliseAdmis.json intacts');
    // Lecture conforme : empreintes des fichiers d'origine, 0 « \r », slug hotellerie.
    const o = C.empreintesOrigine();
    const lecture = path.join(r, 'lecture.json');
    C.ecrireJson(lecture, { le: '2026-10-03', empreintes: { manuel: o.manuel, base: o.base }, retoursChariot: { fiches: 0, entrees: 0 }, fichesModifiees: [], hotellerie: { slug: 'hotellerie' } });
    const q = lancer(['--racine', r, '--lecture', lecture]);
    assert.equal(q.status, 1, 'toujours refusé : --tout rouge');
    assert.doesNotMatch(q.stderr, /lecture de production/);
    assert.equal(etatProtege(), avant);
    // Un essai n'écrit jamais dans migrations/.
    const e = lancer(['--fiches', 'lexique', '--racine', r, '--dossier', path.join(MIGRATIONS, 'essai')]);
    assert.notEqual(e.status, 0);
    assert.match(e.stderr, /jamais dans migrations/);
    assert.ok(!fs.existsSync(path.join(MIGRATIONS, 'essai')));
    assert.equal(lancer(['--racine', r, '--dossier', path.join(r, 'x')]).status, 2, '--dossier sans mode d\'essai');
  } finally { nettoyer(r); }
});

test('lecture de production : absente, empreintes différentes, retours chariot, slug Hôtellerie', () => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'lecture-'));
  try {
    const f = path.join(r, 'l.json');
    assert.match(verifierLectureProduction(f)[0], /absente/);
    const o = C.empreintesOrigine();
    const ok = { empreintes: { manuel: o.manuel, base: o.base }, retoursChariot: { fiches: 0, entrees: 0 }, hotellerie: { slug: 'hotellerie' } };
    C.ecrireJson(f, ok);
    assert.deepEqual(verifierLectureProduction(f), []);
    C.ecrireJson(f, { ...ok, empreintes: { manuel: '0'.repeat(32), base: o.base } });
    assert.match(verifierLectureProduction(f).join(), /réextraire/);
    C.ecrireJson(f, { ...ok, retoursChariot: { fiches: 2, entrees: 0 } });
    assert.match(verifierLectureProduction(f).join(), /retours chariot/);
    C.ecrireJson(f, { ...ok, hotellerie: { slug: 'hotel' } });
    assert.match(verifierLectureProduction(f).join(), /--slug hotellerie=hotel/);
    assert.deepEqual(verifierLectureProduction(f, { slugs: { hotellerie: 'hotel' } }), []);
    // 2e domaine (A16.13) : « usine » en production ; sans --slug ceramique=usine, l'écriture est refusée.
    C.ecrireJson(f, { ...ok, ceramique: { slug: 'usine' } });
    assert.match(verifierLectureProduction(f).join(), /--slug ceramique=usine/);
    assert.deepEqual(verifierLectureProduction(f, { slugs: { ceramique: 'usine' } }), []);
    // La vraie lecture de production : conforme avec --slug ceramique=usine.
    const vraie = path.join(C.DOSSIER, 'lecture-production.json');
    assert.match(verifierLectureProduction(vraie).join(), /--slug ceramique=usine/);
    assert.deepEqual(verifierLectureProduction(vraie, { slugs: { ceramique: 'usine' } }), []);
  } finally { nettoyer(r); }
});

test('sql194 / sql196 : rien à écrire → null ; NOTICE complètes', () => {
  const o = fiches.find((f) => f.slug === 'historique-paiements');
  assert.equal(sql194([{ slug: o.slug, o, contenu: o.contenu, titre: o.titre, partie: o.partie }]), null);
  assert.equal(sql196([]), null);
  const s = sql196([{ domaine: 'ceramique', slug: 'lexique', contenu: 'x', titre: 'T d\'essai', baseMd5: 'a'.repeat(32) }]).sql;
  assert.ok(s.includes("'T d''essai'"));
  assert.ok(s.includes("IF NOT EXISTS (SELECT 1 FROM domaines_activite WHERE slug = 'ceramique') THEN absents := absents || 'ceramique'::TEXT; END IF;"));
  assert.match(s, /RAISE NOTICE '%', '196 : ' \|\| \(n_ceramique\) \|\| ' brouillon\(s\) inséré\(s\) \(ceramique ' \|\| n_ceramique \|\| '\) ; domaines absents : '/);
});
