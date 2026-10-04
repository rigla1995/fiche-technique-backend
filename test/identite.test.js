// Lot 3, étape 1 (spec docs/lot-3-spec.md §1) : matricule fiscal, lecture d'une saisie d'identité, nom affiché,
// identité complète.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');

const { normaliserMatriculeFiscal, controlerMatriculeFiscal } = require('../src/utils/matriculeFiscal');
const { lireIdentite, nomAffiche, identiteComplete, mapIdentite, CHAMPS_IDENTITE, HORS_W1252 } = require('../src/utils/identite');
const { vecteurs } = require(path.join(__dirname, 'matricule-fiscal-vecteurs.json'));

test('matricule fiscal : vecteurs écrits à la main', () => {
  assert.ok(vecteurs.length >= 20);
  for (const v of vecteurs) {
    assert.equal(normaliserMatriculeFiscal(v.entree), v.normalise, `normaliser(${JSON.stringify(v.entree)})`);
    const c = controlerMatriculeFiscal(v.entree);
    assert.equal(c.ok, v.ok, `ok(${JSON.stringify(v.entree)})`);
    assert.equal(Boolean(c.avertissement), v.avertissement, `avertissement(${JSON.stringify(v.entree)})`);
    if (!v.ok) assert.match(c.erreur, /Matricule fiscal invalide/);
    if (v.erreur) assert.ok(c.erreur.includes(v.erreur), `message dédié pour ${JSON.stringify(v.entree)}`);
  }
});

test('table Windows-1252 : même jeu de caractères que HORS_POLICE de generate.js (sans \\t \\n \\r ni drapeau g)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'docuseal-templates', 'generate.js'), 'utf8');
  const original = new RegExp(`[^${src.match(/const HORS_POLICE = \/\[\^(.*?)\]\/gu;/)[1]}]`, 'u');
  assert.equal(HORS_W1252.flags.includes('g'), false);
  const ecarts = [];
  for (let cp = 0; cp <= 0xFFFF; cp++) {
    const c = String.fromCharCode(cp);
    if (c === '\t' || c === '\n' || c === '\r' || (cp >= 0xD800 && cp <= 0xDFFF)) continue;
    if (original.test(c) !== HORS_W1252.test(c)) ecarts.push(cp.toString(16));
  }
  assert.deepEqual(ecarts, []);
});

test('lireIdentite : texte copié d’un PDF ou d’un Mac nettoyé avant le contrôle', () => {
  const r = lireIdentite({
    raisonSociale: 'Société décor', // accents décomposés
    nomCommercial: 'ﬁne ﬂeur​', // ligatures + espace de largeur nulle
    adresse: '12 rue de‑Carthage − bloc­B', // insécables, tiret insécable, moins, trait conditionnel
  });
  assert.deepEqual(r.erreurs, []);
  assert.equal(r.valeurs.raison_sociale, 'Société décor');
  assert.equal(r.valeurs.nom_commercial, 'fine fleur');
  assert.equal(r.valeurs.adresse, '12 rue de-Carthage - blocB');
});

test('lireIdentite : champs absents ignorés, vides → NULL, espaces réduits', () => {
  const r = lireIdentite({ raisonSociale: '  Dar   Yasmine SARL ', ville: '', rne: null });
  assert.deepEqual(r.erreurs, []);
  assert.deepEqual(r.valeurs, { raison_sociale: 'Dar Yasmine SARL', rne: null, ville: null });
  assert.equal('matricule_fiscal' in r.valeurs, false);
  assert.deepEqual(lireIdentite({}).valeurs, {});
});

test('lireIdentite : matricule normalisé, avertissement sans clé, refus', () => {
  assert.equal(lireIdentite({ matriculeFiscal: '1234567aam000' }).valeurs.matricule_fiscal, '1234567A/A/M/000');
  const sansCle = lireIdentite({ matriculeFiscal: '1234567/A/M/000' });
  assert.equal(sansCle.valeurs.matricule_fiscal, '1234567/A/M/000');
  assert.equal(sansCle.avertissements.length, 1);
  const faux = lireIdentite({ matriculeFiscal: 'B0123452024' });
  assert.equal(faux.erreurs[0].champ, 'matriculeFiscal');
  assert.equal('matricule_fiscal' in faux.valeurs, false);
});

test('lireIdentite : forme juridique (liste fermée, casse libre)', () => {
  assert.equal(lireIdentite({ formeJuridique: 'suarl' }).valeurs.forme_juridique, 'SUARL');
  assert.equal(lireIdentite({ formeJuridique: 'AUTO_ENTREPRENEUR' }).valeurs.forme_juridique, 'AUTO_ENTREPRENEUR');
  assert.equal(lireIdentite({ formeJuridique: 'GIE' }).erreurs[0].message, 'Forme juridique inconnue');
  assert.equal(lireIdentite({ formeJuridique: '' }).valeurs.forme_juridique, null);
});

test('lireIdentite : caractères non imprimables (arabe, émoji) refusés, accents et apostrophes admis', () => {
  const arabe = lireIdentite({ raisonSociale: 'شركة دار ياسمين' });
  assert.equal(arabe.erreurs[0].champ, 'raisonSociale');
  assert.match(arabe.erreurs[0].message, /caractères latins/);
  assert.equal(lireIdentite({ ville: 'Tunis 🌴' }).erreurs.length, 1);
  const ok = lireIdentite({ raisonSociale: 'Société « L’Épi d’Or » — Cœur & Co', adresse: 'Rue de l\'Été, n° 12' });
  assert.deepEqual(ok.erreurs, []);
});

test('lireIdentite : longueurs maximales = tailles des colonnes', () => {
  for (const { champ, max } of CHAMPS_IDENTITE) {
    if (champ === 'matriculeFiscal' || champ === 'formeJuridique') continue;
    assert.deepEqual(lireIdentite({ [champ]: 'x'.repeat(max) }).erreurs, [], `${champ} à ${max}`);
    assert.equal(lireIdentite({ [champ]: 'x'.repeat(max + 1) }).erreurs.length, 1, `${champ} à ${max + 1}`);
  }
});

test('nomAffiche : nom commercial, sinon raison sociale, sinon contact, sinon pe.nom', () => {
  assert.equal(nomAffiche({ nom_commercial: 'Le Jasmin', raison_sociale: 'Dar Yasmine SARL', contact: 'Ali' }), 'Le Jasmin');
  assert.equal(nomAffiche({ nom_commercial: '  ', raison_sociale: 'Dar Yasmine SARL', contact: 'Ali' }), 'Dar Yasmine SARL');
  assert.equal(nomAffiche({ raison_sociale: null, contact: 'Ali Ben Salah' }), 'Ali Ben Salah');
  assert.equal(nomAffiche({ nom: 'Copie contact' }), 'Copie contact');
  assert.equal(nomAffiche({}), '');
});

test('identiteComplete : raison sociale + matricule fiscal + adresse + ville', () => {
  const base = { raison_sociale: 'Dar Yasmine SARL', matricule_fiscal: '1234567A/A/M/000', adresse: '12 rue de Marseille', ville: '1000 Tunis' };
  assert.equal(identiteComplete(base), true);
  for (const k of Object.keys(base)) assert.equal(identiteComplete({ ...base, [k]: ' ' }), false, k);
  assert.equal(identiteComplete({}), false);
});

test('mapIdentite : 9 champs camelCase, null si absent', () => {
  const m = mapIdentite({ raison_sociale: 'X', ville: 'Sfax' });
  assert.deepEqual(Object.keys(m), CHAMPS_IDENTITE.map((c) => c.champ));
  assert.equal(m.raisonSociale, 'X');
  assert.equal(m.ville, 'Sfax');
  assert.equal(m.matriculeFiscal, null);
});
