// Lot 2c, M0 (spec §4.5, R2.8.4, §3.7) : retour-2c.js et lecture des fichiers d'essai, SANS base : un faux client
// rejoue les requêtes de retour(client) sur des tables en mémoire. L'essai réel (transaction annulée) se lance hors
// des tests : node scripts/manuel/essai-migration.js (README).
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const C = require('../lib/commun');
const { retour, pairesVariantes, migrationsEnPlace, MIGRATIONS_2C } = require('../retour-2c');
const { fichiersEssai } = require('../essai-migration');

const { fiches, entrees } = C.lireOrigine();
const balise = (slug) => ({
  md: C.lireTexte(path.join(C.CHEMINS.baliseManuel, `${slug}.md`)),
  json: C.lireJson(path.join(C.CHEMINS.baliseManuel, `${slug}.json`)),
});

/** Faux client pg : tables manuel_sections, ai_knowledge_base, _migrations, manuel_sections_domaine en mémoire. */
function fauxClient({ manuel, base, migrations, variantes = [] }) {
  const requetes = [];
  const client = {
    requetes,
    manuel, base, migrations, variantes,
    async query(text, valeurs = []) {
      const t = text.replace(/\s+/g, ' ').trim();
      requetes.push(t);
      if (t.startsWith('SELECT id, slug, titre, partie, contenu, contenu_defaut FROM manuel_sections')) return { rows: manuel.map((r) => ({ ...r })) };
      if (t.startsWith('UPDATE manuel_sections SET contenu = $1')) {
        const r = manuel.find((x) => x.id === valeurs[4]);
        Object.assign(r, { contenu: valeurs[0], contenu_defaut: valeurs[1], titre: valeurs[2], partie: valeurs[3] });
        return { rowCount: 1 };
      }
      if (t.startsWith('SELECT id, titre, contenu FROM ai_knowledge_base')) return { rows: base.map((r) => ({ ...r })) };
      if (t.startsWith('UPDATE ai_knowledge_base SET titre = $1')) {
        Object.assign(base.find((x) => x.id === valeurs[2]), { titre: valeurs[0], contenu: valeurs[1] });
        return { rowCount: 1 };
      }
      if (t.startsWith('DELETE FROM _migrations')) {
        const retires = migrations.filter((f) => valeurs[0].includes(f));
        const garder = migrations.filter((f) => !valeurs[0].includes(f));
        migrations.splice(0, migrations.length, ...garder);
        return { rows: retires.map((filename) => ({ filename })), rowCount: retires.length };
      }
      if (t.startsWith("SELECT to_regclass('manuel_sections_domaine')")) return { rows: [{ existe: true }] };
      if (t.startsWith('DELETE FROM manuel_sections_domaine')) {
        const paires = valeurs[0].map((s, i) => `${s}|${valeurs[1][i]}`);
        const avant = variantes.length;
        const garder = variantes.filter((v) => !paires.includes(`${v.slug}|${v.domaine}`));
        variantes.splice(0, variantes.length, ...garder);
        return { rowCount: avant - garder.length };
      }
      if (t.startsWith('SELECT (SELECT count(*)::int FROM manuel_sections')) {
        const a = (s) => typeof s === 'string' && s.includes('[[');
        return { rows: [{ fiches: manuel.filter((r) => a(r.contenu) || a(r.contenu_defaut) || a(r.titre) || a(r.partie)).length, entrees: base.filter((r) => a(r.titre) || a(r.contenu)).length }] };
      }
      throw new Error(`requête inattendue : ${t.slice(0, 80)}`);
    },
  };
  return client;
}

/** Tables « après les migrations 194 et 195 » : les 3 témoins balisés (défaut posé), une fiche éditée dans l'admin
 * avec une balise, une fiche à balise invalide ; une entrée de la base balisée. */
function tablesBalisees() {
  let id = 0;
  const manuel = fiches.map((f) => ({ id: ++id, slug: f.slug, titre: f.titre, partie: f.partie, contenu: f.contenu, contenu_defaut: f.defautNull ? null : f.contenu }));
  const ligne = (slug) => manuel.find((r) => r.slug === slug);
  for (const s of ['acheteurs-carnet', 'lexique']) {
    const b = balise(s);
    Object.assign(ligne(s), { contenu: b.md, contenu_defaut: b.md, titre: b.json.titre, partie: C.partieBalisee(ligne(s).partie) });
  }
  Object.assign(ligne('faq'), { contenu: 'Texte revu dans l\'admin : [[le:labo]] et [[du:stock]].' });
  Object.assign(ligne('support'), { contenu: `${ligne('support').contenu} [[nom:labbo]]`, contenu_defaut: `${ligne('support').contenu} [[nom:labbo]]` });
  const base = entrees.map((e, i) => ({ id: i + 1, titre: e.titre, contenu: e.contenu }));
  Object.assign(base.find((e) => e.titre === 'Labo central'), { titre: '[[Nom:labo]][[acc:labo: central:]]', contenu: 'Le [[nom:labo]] [[acc:labo:central:centrale]] produit.' });
  return { manuel, base };
}

test('retour(client) : textes d\'origine, contenu_defaut NULL pour les fiches acheteurs, 194 et 195 retirées, sans BEGIN ni COMMIT', async () => {
  const { manuel, base } = tablesBalisees();
  const client = fauxClient({ manuel, base, migrations: ['193_manuel_sections_domaine.sql', MIGRATIONS_2C.manuel, MIGRATIONS_2C.base, MIGRATIONS_2C.variantes] });
  const c = await retour(client);
  const parSlug = new Map(fiches.map((f) => [f.slug, f]));
  for (const r of manuel) {
    const o = parSlug.get(r.slug);
    if (r.slug === 'faq') { assert.equal(r.contenu, 'Texte revu dans l\'admin : le labo et du stock.'); continue; } // éditée : en mots de la restauration
    if (r.slug === 'support') continue;
    assert.equal(r.contenu, o.contenu, r.slug);
    assert.equal(r.titre, o.titre, r.slug);
    assert.equal(r.partie, o.partie, r.slug);
    assert.equal(r.contenu_defaut, o.defautNull ? null : o.contenu, r.slug);
  }
  const lc = base.find((e) => e.id === entrees.findIndex((x) => x.titre === 'Labo central') + 1);
  assert.deepEqual([lc.titre, lc.contenu], ['Labo central', 'Le labo central produit.']);
  assert.equal(c.defautNull, 1, 'acheteurs-carnet');
  assert.equal(c.fiches, 4);
  assert.equal(c.entrees, 1);
  assert.deepEqual(c.migrations, [MIGRATIONS_2C.manuel, MIGRATIONS_2C.base]);
  assert.deepEqual(client.migrations, ['193_manuel_sections_domaine.sql', MIGRATIONS_2C.variantes], 'la 196 reste');
  assert.deepEqual(c.nonRemis.map((x) => [x.cle, x.champ]), [['support', 'contenu'], ['support', 'contenu_defaut']]);
  assert.match(c.nonRemis[0].raison, /balise invalide restée.*clé inconnue/);
  assert.deepEqual(c.restes, { fiches: 0, entrees: 0 });
  assert.ok(!client.requetes.some((q) => /^(BEGIN|COMMIT|ROLLBACK|START)/i.test(q)), 'aucune transaction dans retour()');
  assert.ok(!client.requetes.some((q) => /updated_at/.test(q)), 'updated_at jamais touché');
  // Deuxième retour : rien à remettre.
  const c2 = await retour(client);
  assert.equal(c2.fiches, 0);
  assert.equal(c2.entrees, 0);
  assert.deepEqual(c2.migrations, []);
});

test('retour(client, { remiseLocale }) : aussi les 16 brouillons de la 196 et la ligne 196 de _migrations (R2.8.4)', async () => {
  const paires = pairesVariantes();
  assert.equal(paires.length, 16);
  assert.equal(new Set(paires.map((p) => `${p.slug}|${p.domaine}`)).size, 16);
  const { manuel, base } = tablesBalisees();
  const variantes = [...paires.map((p) => ({ ...p })), { slug: 'lexique', domaine: 'autre-domaine' }];
  const client = fauxClient({ manuel, base, migrations: [MIGRATIONS_2C.manuel, MIGRATIONS_2C.base, MIGRATIONS_2C.variantes], variantes });
  const c = await retour(client, { remiseLocale: true });
  assert.equal(c.brouillons, 16);
  assert.deepEqual(variantes, [{ slug: 'lexique', domaine: 'autre-domaine' }]);
  assert.deepEqual(c.migrations, [MIGRATIONS_2C.manuel, MIGRATIONS_2C.base, MIGRATIONS_2C.variantes].sort());
});

test('retour-2c.js : --remise-locale refusée sur un hôte non local ; option inconnue → 2', () => {
  const { spawnSync } = require('child_process');
  const outil = path.join(__dirname, '..', 'retour-2c.js');
  const p = spawnSync(process.execPath, [outil, '--remise-locale', '--essai'], { encoding: 'utf8', env: { ...process.env, DB_HOST: 'db.exemple.invalid' } });
  assert.equal(p.status, 2);
  assert.match(p.stderr, /base locale seulement/);
  assert.equal(spawnSync(process.execPath, [outil, '--oups'], { encoding: 'utf8' }).status, 2);
});

test('retour-2c.js : 194 ou 195 dans migrations/ du code en place (conteneur D2) → retour réel refusé (§12.4)', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'retour-'));
  try {
    assert.deepEqual(migrationsEnPlace(d), [], 'code D1 : rien');
    fs.writeFileSync(path.join(d, '193_manuel_sections_domaine.sql'), '');
    fs.writeFileSync(path.join(d, MIGRATIONS_2C.variantes), '');
    assert.deepEqual(migrationsEnPlace(d), [], 'la 193 et la 196 ne comptent pas');
    fs.writeFileSync(path.join(d, MIGRATIONS_2C.base), '');
    assert.deepEqual(migrationsEnPlace(d), [MIGRATIONS_2C.base]);
    fs.writeFileSync(path.join(d, MIGRATIONS_2C.manuel), '');
    assert.deepEqual(migrationsEnPlace(d), [MIGRATIONS_2C.manuel, MIGRATIONS_2C.base]);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('retour-2c.js en ligne de commande, 194 et 195 dans migrations/ : refus (2) avant toute connexion ; --remise-locale non concernée',
  { skip: migrationsEnPlace().length ? false : 'arbre sans 194 ni 195 (code D1)' }, () => {
    const { spawnSync } = require('child_process');
    const outil = path.join(__dirname, '..', 'retour-2c.js');
    const p = spawnSync(process.execPath, [outil], { encoding: 'utf8', env: { ...process.env, DB_HOST: 'db.exemple.invalid' } });
    assert.equal(p.status, 2);
    assert.match(p.stderr, /refus : le code en place porte encore 194_manuel_balise\.sql, 195_base_connaissances_balisee\.sql/);
    assert.match(p.stderr, /Annulez d'abord D2/);
    const r = spawnSync(process.execPath, [outil, '--remise-locale'], { encoding: 'utf8', env: { ...process.env, DB_HOST: 'db.exemple.invalid' } });
    assert.equal(r.status, 2);
    assert.match(r.stderr, /base locale seulement/, 'la remise locale garde son propre refus (hôte), pas celui de D2');
  });

test('essai-migration.js : fichiers lus dans l\'ordre, inventaire du générateur exigé', () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'essai-'));
  try {
    assert.throws(() => fichiersEssai(d), /aucun fichier/);
    fs.writeFileSync(path.join(d, MIGRATIONS_2C.variantes), '-- inventaire : {"variantes":["hotellerie/lexique"]}\nSELECT 1;\n');
    fs.writeFileSync(path.join(d, MIGRATIONS_2C.manuel), '-- inventaire : {"contenus":["lexique"],"titres":[],"parties":[],"sansTerme":[]}\nSELECT 1;\n');
    const f = fichiersEssai(d);
    assert.deepEqual(f.map((x) => x.nom), [MIGRATIONS_2C.manuel, MIGRATIONS_2C.variantes]);
    assert.deepEqual(f[0].inventaire.contenus, ['lexique']);
    fs.writeFileSync(path.join(d, MIGRATIONS_2C.base), 'SELECT 1;\n');
    assert.throws(() => fichiersEssai(d), /inventaire/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
