// Fiches du manuel créées directement par une migration (module Livreurs…) : déclarées dans fiches-migrations.json, elles
// sont des cibles de liens admises au point 4 du contrôle. Aucune base ; les fichiers d'essai vont dans un dossier jetable.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { creerContexte, controlerFiche, lireFichesMigrations, FICHES_MIGRATIONS } from '../controler.mjs';

const require = createRequire(import.meta.url);
const C = require('../lib/commun.js');

const jetable = () => fs.mkdtempSync(path.join(os.tmpdir(), 'fiches-migrations-'));
const liste = (dossier, slugs) => {
  const f = path.join(dossier, 'fiches-migrations.json');
  fs.writeFileSync(f, JSON.stringify({ slugs }));
  return f;
};
const refus = (fn, motif) => assert.throws(fn, (e) => e.code === 2 && motif.test(e.message));

test('la liste du dépôt : chaque fiche déclarée est créée par sa migration, aucune n\'est une fiche balisée', () => {
  const { fiches } = C.lireOrigine();
  const connues = lireFichesMigrations(FICHES_MIGRATIONS, { balises: fiches.map((f) => f.slug) });
  assert.deepEqual([...connues.keys()].sort(), ['livreurs', 'livreurs-livraison', 'livreurs-suivi']);
  assert.equal(connues.get('livreurs-livraison'), '253_livreurs_livraison.sql');
});

test('fichier absent : aucune fiche hors balisage', () => {
  assert.equal(lireFichesMigrations(path.join(jetable(), 'absent.json')).size, 0);
});

test('refus : migration introuvable, slug absent de la migration, slug mal formé, fiche déjà balisée', () => {
  const d = jetable();
  const migrations = path.join(d, 'migrations');
  fs.mkdirSync(migrations);
  fs.writeFileSync(path.join(migrations, '900_fiche.sql'), "INSERT INTO manuel_sections (slug, titre) VALUES ('fiche-essai', 'Essai');");
  fs.writeFileSync(path.join(migrations, '901_autre.sql'), "UPDATE manuel_sections SET titre = 'x' WHERE slug = 'fiche-essai';");
  const lire = (slugs, balises = []) => lireFichesMigrations(liste(d, slugs), { migrations, balises });

  assert.equal(lire({ 'fiche-essai': '900_fiche.sql' }).get('fiche-essai'), '900_fiche.sql');
  refus(() => lire({ 'fiche-essai': '999_absente.sql' }), /introuvable/);
  refus(() => lire({ 'autre-fiche': '900_fiche.sql' }), /ne crée pas la fiche/);
  refus(() => lire({ 'fiche-essai': '901_autre.sql' }), /ne crée pas la fiche/); // une retouche n'est pas une création
  refus(() => lire({ 'Fiche Essai': '900_fiche.sql' }), /mal formé/);
  refus(() => lire({ 'fiche-essai': '900_fiche.sql' }, ['fiche-essai']), /fiche balisée/);
  fs.writeFileSync(path.join(d, 'fiches-migrations.json'), JSON.stringify({ slugs: ['fiche-essai'] }));
  refus(() => lireFichesMigrations(path.join(d, 'fiches-migrations.json'), { migrations }), /champ « slugs »/);
});

test('point 4 : « Ventes & commandes » renvoie à « Livrer avec son téléphone » sans échec ; une cible inconnue échoue', () => {
  const ctx = creerContexte();
  assert.ok(ctx.fichesMigrations.has('livreurs-livraison'));
  const fiche = C.lireTexte(path.join(C.CHEMINS.baliseManuel, 'acheteurs-ventes.md'));
  assert.match(fiche, /\(#livreurs-livraison\)/);
  const r = controlerFiche(ctx, 'acheteurs-ventes', { ecrire: false });
  assert.deepEqual(r.echecs.filter((e) => e.point === 4), []);

  // Même fiche, liste vidée : la cible redevient inconnue.
  const sans = { ...ctx, fichesMigrations: new Map(), relectures: new Map() };
  const r2 = controlerFiche(sans, 'acheteurs-ventes', { ecrire: false });
  assert.ok(r2.echecs.some((e) => e.point === 4 && /#livreurs-livraison/.test(e.message)));
});
