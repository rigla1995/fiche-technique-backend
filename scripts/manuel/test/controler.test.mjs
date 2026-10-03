// Lot 2c, M0 (spec §3.5) : contrôle par fiche. Aucune base. Les écritures vont dans un dossier jetable (--racine),
// jamais dans scripts/manuel/balise/ ni scripts/manuel/rendus/.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import {
  creerContexte, controlerFiche, controlerEntree, controlerVariante, controlerTout, controlesEnsemble,
  motsRepetes, balisesRepetees, glosesIdentiques, definitionsCirculaires, elisionsFautives, determinantsEnClair,
  appositions, formesEnClair, formesDuDomaine, caracteresHorsPdf, motsMetier, rendu, racinesRepetees, balisesCollees,
} from '../controler.mjs';
import { prebaliserFiche, prebaliserEntree } from '../prebaliser.mjs';

const require = createRequire(import.meta.url);
const C = require('../lib/commun.js');
const V = require('../lib/vocabulaires.js');
const { vocabDefaut } = require('../../../src/utils/vocab.js');

const OUTIL = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'controler.mjs');
const TEMOINS = ['acheteurs-carnet', 'lexique', 'historique-paiements'];
const { fiches } = C.lireOrigine();
const origine = (slug) => fiches.find((f) => f.slug === slug);
const lancer = (args) => spawnSync(process.execPath, [OUTIL, ...args], { encoding: 'utf8', cwd: C.RACINE });
const VOC = V.vocabulairesEssai();

/** Racine jetable avec les 3 témoins balisés de scripts/manuel/balise/manuel/. */
function racineTemoins() {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'controler-'));
  fs.mkdirSync(path.join(r, 'balise', 'manuel'), { recursive: true });
  for (const s of TEMOINS) for (const x of ['.md', '.json']) fs.copyFileSync(path.join(C.CHEMINS.baliseManuel, s + x), path.join(r, 'balise', 'manuel', s + x));
  return r;
}
const ecrireFiche = (r, slug, md, json) => {
  C.ecrireTexte(path.join(r, 'balise', 'manuel', `${slug}.md`), md);
  C.ecrireJson(path.join(r, 'balise', 'manuel', `${slug}.json`), json);
};
const lireFiche = (r, slug) => ({ md: C.lireTexte(path.join(r, 'balise', 'manuel', `${slug}.md`)), json: C.lireJson(path.join(r, 'balise', 'manuel', `${slug}.json`)) });
const points = (res) => [...new Set(res.echecs.map((e) => e.point))].sort();

test('les 3 témoins balisés passent les points 1 à 6 ; rendus H, C, miroir écrits (ligne de commande, --racine)', () => {
  const r = racineTemoins();
  try {
    const p = lancer([...TEMOINS, '--racine', r]);
    assert.equal(p.status, 0, p.stdout + p.stderr);
    for (const s of TEMOINS) {
      const lot = C.lotDe(s);
      for (const d of ['hotellerie', 'ceramique', 'miroir']) {
        const f = path.join(r, 'rendus', lot, d, `${s}.md`);
        assert.ok(fs.existsSync(f), f);
        const t = C.lireTexte(f);
        assert.doesNotMatch(t, /\[\[|\]\]|‹[a-z0-9_]+›/, `${s} ${d}`);
      }
      const rapport = C.lireJson(path.join(r, 'rendus', lot, 'controle.json'));
      assert.equal(rapport.elements[s].passe, true, s);
    }
    // Le témoin acheteurs-carnet (défaut NULL) : rendu H dans les mots du domaine.
    assert.match(C.lireTexte(path.join(r, 'rendus', 'L7', 'hotellerie', 'acheteurs-carnet.md')), /titre: Carnet de Clients professionnels/);
    // Le témoin lexique : « laboratoire central » sans pléonasme (spec §7.5, exemple 12).
    assert.match(C.lireTexte(path.join(r, 'rendus', 'L1', 'hotellerie', 'lexique.md')), /\| \*\*Cuisine centrale\*\* \| Cuisine centrale de production rattachée au compte\. Elle achète/);
  } finally { fs.rmSync(r, { recursive: true, force: true }); }
});

test('R3.1.1 : l\'exemple 8 du §7.7, rendu en H par controler.mjs, donne « Espace Cuisine »', () => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'controler-'));
  try {
    const o = origine('decouvrir-labflow');
    assert.ok(o.contenu.includes('| Espace Labo | Stock du labo, production, transferts vers les activités |'));
    const pb = prebaliserFiche(o);
    // Ligne de l'exemple 8 balisée comme dans la spec.
    const md = pb.md.replace(/^\| \[\[Nom:espace_labo\]\] \|.*$/m, '| [[Nom:espace_labo]] | [[Nom:stock]] [[du:labo]], production, [[nom:transfert:pl]] vers [[le:activite:pl]] |');
    ecrireFiche(r, 'decouvrir-labflow', md, pb.json);
    const ctx = creerContexte({ racine: r });
    const res = controlerFiche(ctx, 'decouvrir-labflow');
    assert.ok(!res.echecs.some((e) => e.point === 1), JSON.stringify(res.echecs.slice(0, 3)));
    const h = C.lireTexte(path.join(r, 'rendus', 'L2', 'hotellerie', 'decouvrir-labflow.md'));
    assert.match(h, /\| Espace Cuisine \| Stock de la cuisine centrale, production, livraisons internes vers les services \|/);
    assert.doesNotMatch(h, /Espace Labo/);
  } finally { fs.rmSync(r, { recursive: true, force: true }); }
});

test('points 1 à 3 : identité, balises valides, résiduels et exclusions', () => {
  const r = racineTemoins();
  try {
    const ctx0 = creerContexte({ racine: r });
    assert.equal(controlerFiche(ctx0, 'acheteurs-carnet', { ecrire: false }).passe, true);
    const { md, json } = lireFiche(r, 'acheteurs-carnet');
    const cas = (mdX, jsonX) => {
      ecrireFiche(r, 'acheteurs-carnet', mdX, jsonX);
      return controlerFiche(creerContexte({ racine: r }), 'acheteurs-carnet', { ecrire: false });
    };
    // 1. Un caractère changé hors balise ; un titre changé.
    assert.deepEqual(points(cas(md.replace('vos clients B2B', 'vos clients B2C'), json)), [1]);
    assert.deepEqual(points(cas(md, { ...json, titre: 'Carnet [[de:acheteur:pl]]' })), [1]);
    // 2. Clé inconnue (rendue « ‹labbo› » : identité cassée aussi), balise non fermée.
    const r2 = cas(md.replace('[[le:acheteur]] se connecte', '[[le:labbo]] se connecte'), json);
    assert.ok(points(r2).includes(2) && r2.echecs.some((e) => /clé inconnue/.test(e.message)));
    assert.ok(points(cas(md.replace('[[le:acheteur]] se connecte', '[[le:acheteur se connecte'), json)).includes(2));
    // 3. Forme laissée en clair (identité intacte) ; exclusion mal comptée, sans emploi, de type inconnu.
    assert.deepEqual(points(cas(md.replace('[[le:acheteur]] se connecte', 'l\'acheteur se connecte'), json)), [3]);
    const excl = { extrait: 'l\'acheteur', forme: 'acheteur', type: 'homonyme', occurrences: 1, justification: 'essai' };
    assert.equal(cas(md.replace('[[le:acheteur]] se connecte', 'l\'acheteur se connecte'), { ...json, exclusions: [excl] }).passe, true);
    assert.deepEqual(points(cas(md.replace('[[le:acheteur]] se connecte', 'l\'acheteur se connecte'), { ...json, exclusions: [{ ...excl, occurrences: 2 }] })), [3]);
    assert.deepEqual(points(cas(md, { ...json, exclusions: [excl] })), [3], 'sans emploi');
    assert.deepEqual(points(cas(md, { ...json, exclusions: [{ ...excl, extrait: 'la colonne' }] })), [3], 'aucune forme dans l\'extrait');
    assert.deepEqual(points(cas(md.replace('[[le:acheteur]] se connecte', 'l\'acheteur se connecte'), { ...json, exclusions: [{ ...excl, type: 'autre' }] })), [3]);
    // Fichier balisé absent.
    fs.rmSync(path.join(r, 'balise', 'manuel', 'acheteurs-carnet.md'));
    assert.deepEqual(points(controlerFiche(creerContexte({ racine: r }), 'acheteurs-carnet', { ecrire: false })), [0]);
  } finally { fs.rmSync(r, { recursive: true, force: true }); }
});

test('point 3 : une balise collée à un trait d\'union est un échec (« sous-[[nom:pt]] » rend « sous-préparation » en H)', () => {
  assert.deepEqual(balisesCollees('sous-[[nom:pt]] ; [[nom:stock]]-labo ; peut-[[acc:labo:il:elle]] ; [[acc:labo:lui:elle]]-même ; [[nom:labo]] - fin').map((x) => x.texte),
    ['sous-[[nom:pt]]', '[[nom:stock]]-labo']);
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'controler-'));
  try {
    const pb = prebaliserFiche(origine('calc-cout-recette'));
    assert.ok(pb.md.includes('sous-produit transformé'));
    ecrireFiche(r, 'calc-cout-recette', pb.md, pb.json);
    const avant = controlerFiche(creerContexte({ racine: r }), 'calc-cout-recette', { ecrire: false });
    assert.ok(!avant.echecs.some((e) => /trait d'union/.test(e.message)), JSON.stringify(avant.echecs.slice(0, 3)));
    // Le piège de R3.4.3 : identité intacte, exclusion ajustée, et pourtant H lirait « sous-préparation ».
    const md = pb.md.replace('sous-produit transformé', 'sous-[[nom:pt]]');
    const exclusions = pb.json.exclusions.map((x) => (x.extrait === 'sous-produit transformé' ? { ...x, occurrences: x.occurrences - 1 } : x)).filter((x) => x.occurrences > 0);
    ecrireFiche(r, 'calc-cout-recette', md, { ...pb.json, exclusions });
    assert.match(rendu(VOC.hotellerie, md), /sous-préparation/);
    const apres = controlerFiche(creerContexte({ racine: r }), 'calc-cout-recette', { ecrire: false });
    assert.equal(apres.passe, false);
    assert.ok(!apres.echecs.some((e) => e.point === 1), JSON.stringify(apres.echecs.slice(0, 3)));
    assert.ok(apres.echecs.some((e) => e.point === 3 && /trait d'union « sous-\[\[nom:pt\]\] »/.test(e.message)), JSON.stringify(apres.echecs));
  } finally { fs.rmSync(r, { recursive: true, force: true }); }
});

test('point 3 : les cibles de liens « (#slug) » sont masquées (jamais balisées ni exclues)', () => {
  const ctx = creerContexte({ racine: racineTemoins() });
  try {
    const res = controlerFiche(ctx, 'lexique', { ecrire: false });
    assert.equal(res.passe, true, JSON.stringify(res.echecs.slice(0, 3)));
    assert.match(lireFiche(ctx.racine, 'lexique').md, /\]\(#compte-activites-labos\)/);
  } finally { fs.rmSync(ctx.racine, { recursive: true, force: true }); }
});

test('signalements 7 à 12 sur les exemples de la spec (§3.5, §7.7)', () => {
  const H = VOC.hotellerie;
  const Cc = VOC.ceramique;
  // 7 : « centrale centrale » (exemple 12 bis), balise de 2 mots répétée dans la phrase (C seulement).
  const b12 = '[[Nom:labo]] [[acc:labo:central:centrale]]';
  assert.deepEqual(motsRepetes(rendu(H, b12), rendu(vocabDefaut, b12)).map((x) => x.texte), ['centrale centrale']);
  const b7 = '[[Le:labo:pl]] (0 à N) : [[votre:labo:pl]] alimentent';
  assert.deepEqual(balisesRepetees(b7, Cc).map((x) => x.texte), ['sites de production']);
  assert.deepEqual(balisesRepetees(b7, vocabDefaut), []);
  // 8 : glose redite (exemple 9), définition circulaire (exemple 14).
  const b9 = 'vers [[det:activite:un]][[MAJ:activite]] ([[nom:activite_desc]]).';
  assert.deepEqual(glosesIdentiques(rendu(H, b9), rendu(vocabDefaut, b9)).map((x) => x.texte), ['SERVICE (service)']);
  const b14 = '| **[[Nom:activite]]** | [[Nom:activite_desc]] ou cuisine [[acc:activite_desc:exploité:exploitée]] par votre compte |';
  assert.equal(definitionsCirculaires(rendu(H, b14), rendu(vocabDefaut, b14)).length, 1);
  assert.equal(definitionsCirculaires(rendu(vocabDefaut, b14), rendu(vocabDefaut, b14)).length, 0);
  // 9 : élision faite à la main (exemple 3) ; « du usine » en miroir.
  const b3 = 'la seule voie d\'[[nom:appro]] [[du:activite:pl]]';
  assert.deepEqual(elisionsFautives(rendu(Cc, b3), rendu(vocabDefaut, b3)).map((x) => x.texte), ['d\'réception']);
  assert.equal(elisionsFautives(rendu(Cc, 'voie [[de:appro]]'), rendu(vocabDefaut, 'voie [[de:appro]]')).length, 0);
  // 7, suite : mot de même racine collé au rendu d'une balise (« cuisine centrale central »), absent par défaut.
  assert.deepEqual(racinesRepetees('[[votre:labo_long]] central', H).map((x) => x.texte), ['centrale central']);
  assert.deepEqual(racinesRepetees('[[votre:labo_long]] central', vocabDefaut), []);
  assert.deepEqual(racinesRepetees('[[votre:labo_long]][[acc:labo_long: central:]] et [[Nom:labo]] fermé', H), []);
  // 10 : déterminant en clair devant une balise de nom ; 11 : apposition.
  assert.deepEqual(determinantsEnClair('Le [[nom:labo]] produit ; l\'[[nom:acheteur]] ; [[Le:labo]] ; **la** [[le:pt]]').map((x) => x.texte), ['Le [[nom:labo]]', 'l\'[[nom:acheteur]]']);
  // 10, à distance : déterminant à genre + adjectif + balise de nom (« un autre cuisine centrale » en H).
  assert.deepEqual(determinantsEnClair('un autre [[nom:labo]] ; son propre **[[nom:stock]]** ; les autres [[nom:labo:pl]] ; [[acc:labo:un autre:une autre]] [[nom:labo]] ; un seul [[nom:labo]]').map((x) => x.texte),
    ['un autre [[nom:labo]]', 'son propre **[[nom:stock]]', 'seul [[nom:labo]]']);
  assert.equal(appositions('[[Nom:stock]] [[Nom:labo]]').length, 1);
  assert.equal(appositions('[[Nom:stock]] [[Court:labo]] et [[le:stock]] [[compl:labo]]').length, 0);
  // 12 : collision « option » en C (supplement = Option), aucune en H.
  const fC = formesDuDomaine(V.resoudre(V.lexiquesEssai().ceramique));
  const fH = formesDuDomaine(V.resoudre(V.lexiquesEssai().hotellerie));
  assert.deepEqual(formesEnClair('l\'option [[Nom:acheteur:pl]] [voir](#options) et [[nom:supplement]]', fC).map((x) => x.mot), ['option']);
  assert.deepEqual(formesEnClair('l\'option Revendeurs', fH), []);
  assert.deepEqual(formesEnClair('une préparation intermédiaire', fH).map((x) => x.mot), ['préparation']);
});

test('points 7 et 9 (besoins L2-1, L2-2) : contraction manquée ; répétition coupée par une marque d\'emphase', () => {
  const H = VOC.hotellerie;
  const Cc = VOC.ceramique;
  // L2-1 : « de » laissé en clair devant un accord qui porte le déterminant (demarrage, vague B1) : H « de le premier ».
  const faux = 'Création de [[acc:activite:le premier:la première]] [[nom:activite]]';
  assert.equal(rendu(vocabDefaut, faux), 'Création de la première activité');
  assert.deepEqual(elisionsFautives(rendu(H, faux), rendu(vocabDefaut, faux)).map((x) => x.texte), ['de le']);
  const juste = 'Création [[acc:activite:du premier:de la première]] [[nom:activite]]';
  assert.equal(rendu(vocabDefaut, juste), 'Création de la première activité');
  assert.deepEqual(elisionsFautives(rendu(H, juste), rendu(vocabDefaut, juste)), []);
  // Pronom déjà présent dans le rendu par défaut : rien ; « À le », « à les » : mots entiers, sans casse.
  assert.deepEqual(elisionsFautives('afin de le modifier, puis à les voir', 'afin de le modifier, puis à les voir'), []);
  assert.deepEqual(elisionsFautives('À le service et à les cuisines ; voilà le code', 'Au labo et aux labos ; voilà le code').map((x) => x.texte), ['À le', 'à les']);
  // L2-2 : « **sites de production** de production » (decouvrir-labflow, C) ; rien en H ni par défaut.
  const b = 'et, si besoin, [[acc:labo:un:une]] ou plusieurs **[[nom:labo:pl]]** de production.';
  assert.deepEqual(motsRepetes(rendu(Cc, b), rendu(vocabDefaut, b)).map((x) => x.texte), ['de production de production']);
  assert.deepEqual(motsRepetes(rendu(H, b), rendu(vocabDefaut, b)), []);
  // Même racine, marque d'emphase entre la balise et le mot suivant.
  assert.deepEqual(racinesRepetees('**[[votre:labo_long]]** central', H).map((x) => x.texte), ['centrale central']);
  assert.deepEqual(racinesRepetees('**[[votre:labo_long]]** central', vocabDefaut), []);
});

test('points 8 et 9 (besoin L4-3) : glose et élision coupées par une marque d\'emphase ; élision à travers « la/aux »', () => {
  const H = VOC.hotellerie;
  const M = VOC.miroir;
  // produits-utilisables : H « Un **consommable** (consommable) » échappait au point 8 (« ** » avant la parenthèse).
  const glose = 'Un **[[nom:produit_utilisable]]** ([[court:produit_utilisable]]) est';
  assert.equal(rendu(vocabDefaut, glose), 'Un **produit utilisable** (PU) est');
  assert.deepEqual(glosesIdentiques(rendu(H, glose), rendu(vocabDefaut, glose)).map((x) => x.texte), ['consommable (consommable)']);
  assert.deepEqual(glosesIdentiques(rendu(vocabDefaut, glose), rendu(vocabDefaut, glose)), []);
  // produits-vendables : miroir « En tant que **animatrice** » échappait au point 9.
  const queGras = 'En tant que **[[nom:gerant]]**, vous consultez';
  assert.deepEqual(elisionsFautives(rendu(M, queGras), rendu(vocabDefaut, queGras)).map((x) => x.texte), ['que animatrice']);
  assert.deepEqual(elisionsFautives(rendu(H, queGras), rendu(vocabDefaut, queGras)), []);
  // produits-utilisables : [[acc:labo:au(x):à la/aux]] donne en miroir « à la/aux usine(s) » (besoin L4-4) ; H juste.
  const alt = 'fabriqué [[acc:labo:au(x):à la/aux]] [[nom:labo]](s) choisi(s)';
  assert.equal(rendu(vocabDefaut, alt), 'fabriqué au(x) labo(s) choisi(s)');
  assert.deepEqual(elisionsFautives(rendu(M, alt), rendu(vocabDefaut, alt)).map((x) => x.texte), ['la/aux usine']);
  assert.deepEqual(elisionsFautives(rendu(H, alt), rendu(vocabDefaut, alt)), []);
});

test('acceptations (relectures/<lot>.auto.json) : signalement accepté, acceptation sans objet', () => {
  const r = racineTemoins();
  try {
    const ctx0 = creerContexte({ racine: r });
    const s0 = controlerFiche(ctx0, 'acheteurs-carnet', { ecrire: false }).signalements;
    assert.deepEqual(s0.map((s) => [s.point, s.domaine, s.texte, s.etat]), [[12, 'ceramique', 'option', 'à traiter']]);
    C.ecrireJson(path.join(r, 'relectures', 'L7.auto.json'), [
      { fiche: 'acheteurs-carnet', point: 12, domaine: 'ceramique', texte: 'option', decision: 'accepté', raison: 'option d\'import, sens clair' },
      { fiche: 'acheteurs-carnet', point: 7, domaine: 'hotellerie', texte: 'rien', decision: 'accepté', raison: 'essai' },
    ]);
    const t = controlerTout(creerContexte({ racine: r }), { ecrire: false });
    const carnet = t.fiches.find((x) => x.nom === 'acheteurs-carnet');
    assert.deepEqual(carnet.signalements.map((s) => s.etat), ['accepté']);
    assert.deepEqual(t.sansObjet.map((x) => [x.fiche, x.point, x.texte]), [['acheteurs-carnet', 7, 'rien']]);
    assert.equal(t.vert, false);
  } finally { fs.rmSync(r, { recursive: true, force: true }); }
});

test('--tout : ROUGE tant que des fiches manquent ; rapport tout.json ; contrôles d\'ensemble', () => {
  const r = racineTemoins();
  try {
    const p = lancer(['--tout', '--racine', r]);
    assert.equal(p.status, 1, p.stderr);
    const tout = C.lireJson(path.join(r, 'rendus', 'tout.json'));
    assert.equal(tout.vert, false);
    assert.equal(tout.resume.fiches, '3/61');
    assert.equal(tout.resume.base, '0/32');
    assert.deepEqual(tout.ensemble, []);
    assert.ok(tout.motsMetier.lexique.total > 0);
    // Titres de la base en double (rendus et bruts sans casse).
    const e = prebaliserEntree(C.lireOrigine().entrees.find((x) => x.fichier === 'gerant'));
    C.ecrireTexte(path.join(r, 'balise', 'base', 'gerant.md'), e.md);
    C.ecrireJson(path.join(r, 'balise', 'base', 'gerant.json'), { ...e.json, titre: 'Fournisseur' });
    const ens = controlesEnsemble(creerContexte({ racine: r }));
    assert.ok(ens.some((x) => /titres de la base : « Fournisseur » rendu deux fois/.test(x.message)), JSON.stringify(ens));
    assert.ok(ens.some((x) => /R4\.3\.2/.test(x.message)));
  } finally { fs.rmSync(r, { recursive: true, force: true }); }
});

test('entrée de la base : pré-balisée, elle passe ; titre rendu « Cuisine centrale » (exemple 12)', () => {
  const r = fs.mkdtempSync(path.join(os.tmpdir(), 'controler-'));
  try {
    const o = C.lireOrigine().entrees.find((x) => x.fichier === 'labo-central');
    const e = prebaliserEntree(o);
    C.ecrireTexte(path.join(r, 'balise', 'base', 'labo-central.md'), e.md);
    C.ecrireJson(path.join(r, 'balise', 'base', 'labo-central.json'), { ...e.json, titre: '[[Nom:labo]][[acc:labo: central:]]' });
    const res = controlerEntree(creerContexte({ racine: r }), 'labo-central');
    assert.ok(!res.echecs.some((x) => x.point === 1 || x.point === 2), JSON.stringify(res.echecs));
    assert.match(C.lireTexte(path.join(r, 'rendus', 'L9', 'hotellerie', 'labo-central.md')), /titre: Cuisine centrale\n/);
  } finally { fs.rmSync(r, { recursive: true, force: true }); }
});

/** Variante propre de « lexique » : mêmes cibles de liens et mêmes blocs que la fiche d'origine, termes balisés. */
function variantePropre() {
  const o = origine('lexique');
  const blocs = [...o.contenu.matchAll(/^:::.*$/gm)].map((m) => m[0]);
  const liens = [...o.contenu.matchAll(/\]\(([^)\s]*)\)/g)].map((m) => `- [voir](${m[1]})`);
  return ['## Lexique de l\'établissement', '', '[[Le:labo]] prépare ; [[le:activite:pl]] servent les clients de l\'hôtel.', '',
    '| Terme | Définition |', '|---|---|', '| **[[Nom:labo]]** | lieu de production |', '', ...blocs, '', ...liens, ''].join('\n');
}

test('--variante : points 2 à 6, forme du domaine en clair, caractère hors police PDF, baseMd5, titre en double', () => {
  const r = racineTemoins();
  try {
    const commun = C.lireTexte(path.join(r, 'balise', 'manuel', 'lexique.md'));
    const ecrireV = (md, json) => {
      C.ecrireTexte(path.join(r, 'variantes', 'hotellerie', 'lexique.md'), md);
      C.ecrireJson(path.join(r, 'variantes', 'hotellerie', 'lexique.json'), { titre: null, baseMd5: C.md5(commun), exclusions: [], ...json });
      return controlerVariante(creerContexte({ racine: r }), 'hotellerie', 'lexique', { ecrire: false });
    };
    const ok = ecrireV(variantePropre(), {});
    assert.equal(ok.passe, true, JSON.stringify(ok.echecs));
    assert.ok(ok.infos.motsMetier.variante.total < ok.infos.motsMetier.commun.total);
    assert.ok(ecrireV(variantePropre().replace('servent les clients', 'servent les cuisines centrales et les clients'), {}).echecs.some((e) => e.point === 3 && /forme du domaine/.test(e.message)));
    assert.ok(ecrireV(variantePropre().replace('lieu de production', 'lieu ★ de production'), {}).echecs.some((e) => /PDF/.test(e.message)));
    assert.deepEqual(caracteresHorsPdf('Flèche → et coche ✓ et 🍰 : rien'), []);
    assert.ok(ecrireV(variantePropre(), { baseMd5: '0'.repeat(32) }).echecs.some((e) => /baseMd5/.test(e.message)));
    assert.ok(ecrireV(variantePropre(), { titre: 'Historique des paiements' }).echecs.some((e) => /égal à celui de la fiche historique-paiements/.test(e.message)));
    assert.ok(points(ecrireV(variantePropre().replace(/^:::astuce$/m, ':::attention'), {})).includes(5));
    assert.ok(points(ecrireV(variantePropre().replace('(#lexique-pt)', '(#lexique)'), {})).includes(4));
    // Une variante hors des lots V-* est refusée.
    C.ecrireTexte(path.join(r, 'variantes', 'hotellerie', 'faq.md'), 'x');
    C.ecrireJson(path.join(r, 'variantes', 'hotellerie', 'faq.json'), { titre: null, baseMd5: 'x', exclusions: [] });
    assert.ok(controlerVariante(creerContexte({ racine: r }), 'hotellerie', 'faq', { ecrire: false }).echecs.some((e) => /lots\.json/.test(e.message)));
  } finally { fs.rmSync(r, { recursive: true, force: true }); }
});

test('--variante : une forme du domaine écrite en clair s\'exclut (R8.2.3, besoins V-H1-1, V-C1-1, V-H2-1, V-C2-1) ; pas dans le texte commun', () => {
  const r = racineTemoins();
  try {
    const commun = C.lireTexte(path.join(r, 'balise', 'manuel', 'lexique.md'));
    const ecrireV = (md, exclusions) => {
      C.ecrireTexte(path.join(r, 'variantes', 'hotellerie', 'lexique.md'), md);
      C.ecrireJson(path.join(r, 'variantes', 'hotellerie', 'lexique.json'), { titre: null, baseMd5: C.md5(commun), exclusions });
      return controlerVariante(creerContexte({ racine: r }), 'hotellerie', 'lexique', { ecrire: false });
    };
    // « Room service » (composant H) contient « service », forme H de activite : sans exclusion, échec du point 3.
    const md = variantePropre().replace('servent les clients', 'servent les clients, du bar au room service,');
    assert.ok(ecrireV(md, []).echecs.some((e) => e.point === 3 && /forme du domaine « service »/.test(e.message)));
    const x = { extrait: 'room service', forme: 'service', type: 'nom-fige', occurrences: 1, justification: 'libellé du composant H (domaines.json)' };
    const ok = ecrireV(md, [x]);
    assert.equal(ok.passe, true, JSON.stringify(ok.echecs));
    // Un extrait sans forme par défaut ni forme du domaine reste « sans emploi » ; « forme » doit être dans l'extrait.
    assert.ok(ecrireV(md, [x, { ...x, extrait: 'du bar', forme: undefined }]).echecs.some((e) => /sans emploi \(l'extrait ne contient aucune forme par défaut ni forme du domaine\)/.test(e.message)));
    assert.ok(ecrireV(md, [{ ...x, forme: 'room' }]).echecs.some((e) => /« forme » "room" absente de l'extrait/.test(e.message)));
    // Texte commun : une exclusion doit toujours porter une forme PAR DÉFAUT (« service » n'en est pas une).
    const hp = lireFiche(r, 'historique-paiements');
    ecrireFiche(r, 'historique-paiements', hp.md, { ...hp.json, exclusions: [{ ...x, extrait: 'service' }] });
    const f = controlerFiche(creerContexte({ racine: r }), 'historique-paiements', { ecrire: false });
    assert.ok(f.echecs.some((e) => /sans emploi \(l'extrait ne contient aucune forme par défaut\)$/.test(e.message)), JSON.stringify(f.echecs));
  } finally { fs.rmSync(r, { recursive: true, force: true }); }
});

test('rapport « mots du métier » : un mot qui fait partie d\'une forme du lexique ne compte pas', () => {
  assert.deepEqual(motsMetier('Le food cost du restaurant, la carte et la crème'), { total: 3, mots: { restaurant: 1, carte: 1, crème: 1 } });
  assert.equal(motsMetier('[[nom:food_cost]] et food').total, 1);
});

test('--lexique : lexique de production résolu pour H ; fichier absent ou mal formé refusé ; option inconnue → 2', () => {
  const r = racineTemoins();
  const prod = path.join(r, 'lexique-production.json');
  const lecture = path.join(r, 'lecture-absente.json'); // jamais la vraie lecture-production.json du dossier
  const ecartsProd = { acheteur: { sg: 'Client hôtelier', pl: 'Clients hôteliers', g: 'm', el: false } };
  fs.writeFileSync(prod, JSON.stringify({ lexique: ecartsProd }));
  try {
    const p = lancer(['acheteurs-carnet', '--racine', r, '--lexique', prod, '--lecture', lecture]);
    assert.equal(p.status, 0, p.stdout + p.stderr);
    const h = C.lireTexte(path.join(r, 'rendus', 'L7', 'hotellerie', 'acheteurs-carnet.md'));
    assert.match(h, /titre: Carnet de Clients hôteliers/); // [[de:acheteur:pl:Nom]] : casse Nom, comme « d'Acheteurs »
    assert.ok(h.includes(`lexique: ${prod}`));
    assert.match(p.stdout, new RegExp(`md5 de lexique::text ${V.md5Lexique(ecartsProd)} ; lecture de production absente`));
    assert.equal(lancer(['lexique', '--racine', r, '--lexique', path.join(r, 'absent.json'), '--lecture', lecture]).status, 2);
    fs.writeFileSync(prod, '[]');
    const q = lancer(['lexique', '--racine', r, '--lexique', prod, '--lecture', lecture]);
    assert.equal(q.status, 2);
    assert.match(q.stderr, /objet d'écarts attendu/);
    // Relecture de M0 ∥ S ∥ A : un fichier mal formé ne donne plus en silence le lexique par défaut (« Espace Labo »).
    const essai = (contenu, args = []) => { fs.writeFileSync(prod, JSON.stringify(contenu)); return lancer(['acheteurs-carnet', '--racine', r, '--lexique', prod, '--lecture', lecture, ...args]); };
    const vide = essai({});
    assert.equal(vide.status, 2);
    assert.match(vide.stderr, /lexique par défaut \(estDefaut vrai\)/);
    const enveloppe = essai({ hotellerie: { slug: 'hotellerie', md5Lexique: 'x', lexique: ecartsProd } });
    assert.equal(enveloppe.status, 2);
    assert.match(enveloppe.stderr, /clé\(s\) hors du lexique : hotellerie/);
    assert.equal(essai({ ...ecartsProd, slug: 'hotellerie' }).status, 2);
    assert.match(essai({ slug: 'hotellerie', md5Lexique: '0'.repeat(32), lexique: ecartsProd }).stderr, /md5Lexique du fichier/);
    // md5 comparé à la lecture (7) de production (hotellerie.md5Lexique).
    fs.writeFileSync(lecture, JSON.stringify({ hotellerie: { slug: 'hotellerie', md5Lexique: '0'.repeat(32) } }));
    const autre = essai({ lexique: ecartsProd });
    assert.equal(autre.status, 2);
    assert.match(autre.stderr, /≠ lecture \(7\)/);
    fs.writeFileSync(lecture, JSON.stringify({ hotellerie: { slug: 'hotellerie', md5Lexique: V.md5Lexique(ecartsProd) } }));
    const egal = essai({ slug: 'hotellerie', md5Lexique: V.md5Lexique(ecartsProd), lexique: ecartsProd });
    assert.equal(egal.status, 0, egal.stdout + egal.stderr);
    assert.match(egal.stdout, /égal à la lecture \(7\)/);
    assert.equal(lancer(['lexique', '--racine', r, '--lecture', lecture]).status, 2, '--lecture sans --lexique');
    assert.equal(lancer(['--oups']).status, 2);
  } finally { fs.rmSync(r, { recursive: true, force: true }); }
});
