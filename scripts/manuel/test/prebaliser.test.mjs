// Lot 2c, M0 (spec §3.4, R3.4.1-R3.4.4) : pré-baliseur. Les écritures vont dans un dossier jetable (--sortie),
// jamais dans scripts/manuel/balise/ (propriété des agents de balisage, §9.3).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { prebaliserTexte, prebaliserFiche, prebaliserEntree } from '../prebaliser.mjs';

const require = createRequire(import.meta.url);
const C = require('../lib/commun.js');
const { rendre, vocabDefaut } = require('../../../src/utils/vocab.js');
const { verifierBalises, formesParDefaut } = require('../../../src/utils/manuelRendu.js');

const OUTIL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'prebaliser.mjs');
const muet = () => {};
const memesOctets = (a, b) => Buffer.from(a, 'utf8').equals(Buffer.from(b, 'utf8'));
const { fiches, entrees } = C.lireOrigine();
const TEMOINS = ['acheteurs-carnet', 'lexique', 'historique-paiements'];
const lancer = (args) => spawnSync(process.execPath, [OUTIL, ...args], { encoding: 'utf8', cwd: C.RACINE });

test('3 fiches témoins (acheteurs à défaut NULL, lexique, sans terme) : rendu par défaut identique à l\'octet', () => {
  const sortie = fs.mkdtempSync(path.join(os.tmpdir(), 'prebaliser-'));
  try {
    const r = lancer([...TEMOINS, '--sortie', sortie]);
    assert.equal(r.status, 0, r.stderr);
    for (const slug of TEMOINS) {
      const f = fiches.find((x) => x.slug === slug);
      const md = C.lireTexte(path.join(sortie, 'balise', 'manuel', `${slug}.md`));
      const json = C.lireJson(path.join(sortie, 'balise', 'manuel', `${slug}.json`));
      assert.ok(memesOctets(rendre(vocabDefaut, md, muet), f.contenu), `${slug} › contenu`);
      assert.ok(memesOctets(rendre(vocabDefaut, json.titre, muet), f.titre), `${slug} › titre`);
      assert.deepEqual(verifierBalises(md), [], slug);
      assert.deepEqual(verifierBalises(json.titre), [], slug);
      assert.deepEqual(Object.keys(json), ['slug', 'titre', 'exclusions', 'baliseur', 'relecteur'], slug);
      assert.equal(json.baliseur, C.lotDe(slug), slug);
      // Une forme non exclue hors balise ne reste que là où l'outil l'a listée (cibles de liens comprises).
      const { emplois, textes } = C.retirerExtraits([md], json.exclusions);
      assert.deepEqual(emplois, json.exclusions.map((x) => x.occurrences), `${slug} : occurrences`);
      for (const x of json.exclusions) assert.equal(x.type, 'locution', slug);
      const restes = formesParDefaut(textes[0].replace(/\]\([^)\n]*\)/g, ']()'));
      const rapport = C.lireJson(path.join(sortie, 'rendus', json.baliseur, 'a-baliser.json')).fiches[slug];
      assert.equal(restes.length, rapport.nonBalisees.filter((n) => n.champ === 'contenu').length, `${slug} : restes`);
    }
    assert.ok(fiches.find((x) => x.slug === 'acheteurs-carnet').defautNull);
    // Fiche sans terme : brouillon = origine, aucune exclusion.
    assert.equal(C.lireTexte(path.join(sortie, 'balise', 'manuel', 'historique-paiements.md')), fiches.find((x) => x.slug === 'historique-paiements').contenu);
    assert.deepEqual(C.lireJson(path.join(sortie, 'balise', 'manuel', 'historique-paiements.json')).exclusions, []);
    // Le lexique porte des balises et ses locutions « prix de vente » (exclusions écrites par l'outil, §7.2).
    const lexique = C.lireTexte(path.join(sortie, 'balise', 'manuel', 'lexique.md'));
    assert.ok((lexique.match(/\[\[/g) || []).length > 150);
    assert.ok(C.lireJson(path.join(sortie, 'balise', 'manuel', 'lexique.json')).exclusions.some((x) => x.extrait === 'prix de vente'));
    assert.ok(!lexique.includes('[[acc:'), 'R3.4.4 : jamais d\'accord');
    // Rapports par lot.
    for (const lot of ['L1', 'L3', 'L7']) assert.ok(fs.existsSync(path.join(sortie, 'rendus', lot, 'a-baliser.json')), lot);

    // Refus de réécrire un brouillon (travail du baliseur), sauf --remplacer.
    const refus = lancer(['lexique', '--sortie', sortie]);
    assert.equal(refus.status, 1);
    assert.match(refus.stderr, /brouillon déjà présent/);
    assert.equal(lancer(['lexique', '--sortie', sortie, '--remplacer']).status, 0);
    // Les variantes ne se pré-balisent pas.
    assert.match(lancer(['--lot', 'V-H1', '--sortie', sortie]).stderr, /variantes/);
  } finally {
    fs.rmSync(sortie, { recursive: true, force: true });
  }
});

test('I10 et I11 sur les 61 fiches et les 32 entrées (contenu et titre), sans écriture', () => {
  let balises = 0;
  for (const f of fiches) {
    const r = prebaliserFiche(f);
    assert.ok(memesOctets(rendre(vocabDefaut, r.md, muet), f.contenu), f.slug);
    assert.ok(memesOctets(rendre(vocabDefaut, r.json.titre, muet), f.titre), f.slug);
    assert.deepEqual(verifierBalises(r.md), [], f.slug);
    balises += r.rapport.balisees;
  }
  for (const e of entrees) {
    const r = prebaliserEntree(e);
    assert.ok(memesOctets(rendre(vocabDefaut, r.md, muet), e.contenu), e.fichier);
    assert.ok(memesOctets(rendre(vocabDefaut, r.json.titre, muet), e.titre), e.fichier);
    assert.deepEqual(verifierBalises(r.json.titre), [], e.fichier);
  }
  assert.ok(balises > 3000, `balises posées : ${balises}`);
});

test('R3.4.1 : déterminants en minuscules et à majuscule, élision, nombre, tous / aucun / nouveau', () => {
  const cas = [
    ["L'article et le labo, les PT.", '[[Le:article]] et [[le:labo]], [[le:pt:pl:court]].'],
    ['Le labo fabrique ; la recette ; une activité ; des labos.', '[[Le:labo]] fabrique ; [[le:recette]] ; [[un:activite]] ; [[un:labo:pl]].'],
    // Homonyme : le verbe « produit » est une forme du lexique ; l'outil le balise, le baliseur l'exclut (homonyme).
    ['Le labo produit.', '[[Le:labo]] [[nom:produit]].'],
    ["De l'activité, du stock, de la recette, d'approvisionnement.", "[[Du:activite]], [[du:stock]], [[du:recette]], [[de:appro]]."],
    ['au labo, aux activités, à la recette', '[[au:labo]], [[au:activite:pl]], [[au:recette]]'],
    ['cet article, cette activité, ces labos', '[[ce:article]], [[ce:activite]], [[ce:labo:pl]]'],
    ['tous les labos, toutes les activités, aucun labo, un nouvel article', '[[tous:labo:les]], [[tous:activite:les]], [[aucun:labo]], un [[nouveau:article]]'],
    ['votre labo, vos activités, mon stock, sa recette', '[[votre:labo]], [[votre:activite:pl]], [[mon:stock]], [[son:recette]]'],
    ['Stock Labo', '[[Nom:stock]] [[Nom:labo]]'],
  ];
  for (const [origine, attendu] of cas) {
    const r = prebaliserTexte(origine);
    assert.equal(r.balise, attendu, origine);
    assert.ok(memesOctets(rendre(vocabDefaut, r.balise, muet), origine), origine);
  }
});

test('R3.4.1, §7.4 : déterminant devant du gras, un lien ou des capitales → det collé', () => {
  assert.equal(prebaliserTexte('de **labos** inclus').balise, '[[det:labo:de:pl]]**[[nom:labo:pl]]** inclus');
  assert.equal(prebaliserTexte('le [labo](#stock-labo)').balise, '[[det:labo:le]][[[nom:labo]]](#stock-labo)');
  assert.equal(prebaliserTexte('du stock du LABO vers une ACTIVITÉ').balise, '[[du:stock]] [[det:labo:du]][[MAJ:labo]] vers [[det:activite:un]][[MAJ:activite]]');
});

test('R3.4.2 : aucune balise si le rendu par défaut ne reproduit pas le passage (listé)', () => {
  const r = prebaliserTexte('Une appro passée ; un produit VENDABLE.');
  assert.equal(r.balise, 'Une appro passée ; un produit VENDABLE.');
  assert.equal(r.nonBalisees.length, 2);
  assert.match(r.nonBalisees[0].raison, /déterminant \+ forme/);
  assert.match(r.nonBalisees[1].raison, /aucune balise/);
});

test('R3.4.3 : cible de lien, mot-clé de bloc, accents graves, trait d\'union jamais touchés', () => {
  const r = prebaliserTexte('[Stock](#stock-labo) ; :::astuce\nle `labo` ; le fournisseur-labo\n:::');
  assert.equal(r.balise, '[[[Nom:stock]]](#stock-labo) ; :::astuce\nle `labo` ; le fournisseur-labo\n:::');
  assert.equal(r.stats.ciblesDeLien, 2);
  assert.deepEqual(r.nonBalisees.map((n) => n.raison.slice(0, 14)), ['accents graves', "collée à un tr", "collée à un tr"]);
});

test('R3.4.3 : locutions de la liste fermée exclues, plus longue d\'abord, occurrences par la règle de l\'oracle', () => {
  const f = {
    slug: 'essai', titre: 'Prix de vente',
    contenu: 'Le prix de vente, le type de vente et la vente. Chaque sous-produit transformé, chaque sous-produit, les sous-produits et le sous-PT ; un produit transformé.',
  };
  const r = prebaliserFiche(f);
  assert.equal(r.md, 'Le prix de vente, le type de vente et [[le:vente]]. Chaque sous-produit transformé, chaque sous-produit, les sous-produits et le sous-PT ; [[un:pt]].');
  assert.equal(r.json.titre, 'Prix de vente');
  assert.deepEqual(r.json.exclusions.map((x) => [x.extrait, x.occurrences]), [
    ['sous-produit transformé', 1], ['sous-produits', 1], ['sous-produit', 1], ['sous-PT', 1],
    ['Prix de vente', 1], ['prix de vente', 1], ['type de vente', 1],
  ]);
  assert.ok(r.json.exclusions.every((x) => x.type === 'locution' && x.justification));
});

test('choix ambigus : sigle en début de phrase, nombre repris de « X (SIGLE) », signalés à vérifier', () => {
  const a = prebaliserTexte('les produits transformés (PT) du labo');
  assert.equal(a.balise, '[[le:pt:pl]] ([[court:pt:pl]]) [[du:labo]]');
  const b = prebaliserTexte('PT : un produit transformé.');
  assert.equal(b.balise, '[[Court:pt]] : [[un:pt]].');
  assert.ok(b.aVerifier.some((v) => /nombre ambigu/.test(v.raison) && /majuscule/.test(v.raison)));
  const c = prebaliserTexte('le dernier inventaire');
  assert.equal(c.balise, 'le dernier [[nom:inventaire]]');
  assert.match(c.aVerifier[0].raison, /« dernier » en clair/);
});
