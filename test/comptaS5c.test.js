// LabFlow Compta, étape S5c « Les tiers et les imports » (labflow-reprise/achats-compta/PLAN-S5.md §1, §2, §4 ; SPEC-SOCLE
// D18 ; réponses du client du 07/10 — questions 4, 5 et 6 — et du 08/10 — « ok pour les 4 »). Tests sans base : le paquet
// (comptes collectifs par défaut), la migration 214 (tables, modèle des codes, manuel : gardes md5 des textes de la 213,
// nouvelle fiche « Tiers »), les lecteurs de saisie, le code généré d'après le modèle, les présentations, le contrôle des
// lignes d'import (tiers, plan) en tout-ou-rien, l'outil d'import Excel (modèle en texte, lecture d'un classeur), les
// routes, les droits (Saisie crée et modifie des tiers) et les branchements (fiche, compte utilisé).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ExcelJS = require('exceljs');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const paquets = require('../src/compta/paquets');
const tiers = require('../src/compta/tiers');
const plan = require('../src/compta/planComptes');
const dossiers = require('../src/compta/dossiers');
const importExcel = require('../src/compta/importExcel');

const TN = paquets.PAQUETS.TN;
const parNumero = new Map(TN.comptes.map((c) => [c.numero, c]));
const est400 = (e) => e.statusCode === 400;

test('paquet Tunisie : comptes collectifs par défaut des tiers (4011 fournisseurs, 4111 clients), listes fermées', () => {
  assert.deepEqual(paquets.controlerPaquet(TN), []);
  assert.deepEqual(TN.tiers.collectifs, { fournisseur: '4011', client: '4111' });
  assert.equal(parNumero.get('4011').nature, 'fournisseurs');
  assert.equal(parNumero.get('4111').nature, 'clients');
  assert.deepEqual(paquets.TYPES_TIERS, ['fournisseur', 'client']);
  assert.deepEqual(paquets.NATURE_PAR_TYPE_TIERS, { fournisseur: 'fournisseurs', client: 'clients' });
  assert.deepEqual(paquets.REGIMES_TVA_TIERS, ['assujetti', 'non_assujetti', 'exonere', 'suspension']);
  assert.deepEqual([paquets.CODE_TIERS_MIN, paquets.CODE_TIERS_MAX, paquets.PREFIXE_TIERS_MAX, paquets.CHIFFRES_TIERS_MIN, paquets.CHIFFRES_TIERS_MAX, paquets.DELAI_PAIEMENT_MAX], [2, 10, 3, 3, 7, 365]);
  assert.ok(paquets.PREFIXE_TIERS_MAX + paquets.CHIFFRES_TIERS_MAX <= paquets.CODE_TIERS_MAX, 'préfixe + chiffres tiennent dans un code');
  // Le contrôle refuse un paquet défectueux.
  assert.ok(paquets.controlerPaquet({ ...TN, tiers: { collectifs: { fournisseur: '4011', client: '99999' } } }).some((d) => /absent du paquet/.test(d)));
  assert.ok(paquets.controlerPaquet({ ...TN, tiers: { collectifs: { fournisseur: '5321', client: '4111' } } }).some((d) => /de nature banque, fournisseurs attendue/.test(d)));
  assert.deepEqual(paquets.controlerPaquet({ ...TN, tiers: undefined }), [], 'facultatif');
  assert.equal(tiers.collectifDefautNumero({ pays: 'TN' }, 'fournisseur'), '4011');
  assert.equal(tiers.collectifDefautNumero({ pays: 'TN' }, 'client'), '4111');
  assert.equal(tiers.collectifDefautNumero({ pays: 'FR' }, 'client'), null);
});

test('migration 214 : tiers, modèle des codes, manuel (gardes md5 des textes de la 213, fiche « Tiers »)', () => {
  const sql = lire('migrations', '214_compta_tiers.sql');
  for (const t of [
    "ALTER TABLE compta.dossiers ADD COLUMN IF NOT EXISTS tiers_prefixe_fournisseur VARCHAR(3) NOT NULL DEFAULT 'F' CHECK (tiers_prefixe_fournisseur ~ '^[A-Z0-9]{0,3}$')",
    "ALTER TABLE compta.dossiers ADD COLUMN IF NOT EXISTS tiers_prefixe_client VARCHAR(3) NOT NULL DEFAULT 'C' CHECK (tiers_prefixe_client ~ '^[A-Z0-9]{0,3}$')",
    'ALTER TABLE compta.dossiers ADD COLUMN IF NOT EXISTS tiers_chiffres SMALLINT NOT NULL DEFAULT 4 CHECK (tiers_chiffres BETWEEN 3 AND 7)',
    'CREATE TABLE IF NOT EXISTS compta.tiers', 'dossier_id       INTEGER NOT NULL REFERENCES compta.dossiers(id) ON DELETE CASCADE',
    "type             VARCHAR(12) NOT NULL CHECK (type IN ('fournisseur', 'client'))", "code             VARCHAR(10) NOT NULL CHECK (code ~ '^[A-Z0-9]{2,10}$')",
    'compte_id        INTEGER NOT NULL REFERENCES compta.comptes(id),', 'retenue_id       INTEGER REFERENCES compta.taxes(id) ON DELETE SET NULL',
    "regime_tva       VARCHAR(15) NOT NULL DEFAULT 'assujetti' CHECK (regime_tva IN ('assujetti', 'non_assujetti', 'exonere', 'suspension'))",
    'delai_paiement   SMALLINT NOT NULL DEFAULT 0 CHECK (delai_paiement BETWEEN 0 AND 365)', "origine          VARCHAR(10) NOT NULL DEFAULT 'saisi' CHECK (origine IN ('saisi', 'import'))",
    'UNIQUE (dossier_id, type, code)', 'CREATE INDEX IF NOT EXISTS idx_compta_tiers_compte ON compta.tiers (compte_id)', 'CREATE INDEX IF NOT EXISTS idx_compta_tiers_retenue ON compta.tiers (retenue_id)',
  ]) assert.ok(sql.includes(t), t);
  assert.ok(!/DROP |DELETE FROM|TRUNCATE/.test(sql), 'additive');
  // Manuel : gardes md5 des textes de la 213 (fiche du dossier, dossiers, plan de comptes, taxes) ; nouvelle fiche.
  assert.match(sql, /md5\(replace\(manuel_sections\.contenu_defaut, chr\(13\), ''\)\) = f\.garde/);
  assert.ok(!/\[\[/.test(sql), 'jamais de balise de vocabulaire dans une fiche Compta');
  const texteDe = (fichier, marque) => {
    const src = lire('migrations', fichier);
    const debut = src.indexOf(marque) + marque.length;
    return src.slice(debut, src.indexOf(marque, debut));
  };
  const md5 = (t) => crypto.createHash('md5').update(t, 'utf8').digest('hex');
  for (const [marque, slug, marqueOrigine, attendu, disparu] of [
    ['$f214a$', 'compta-dossier', '$f213a$', 'ses **tiers** (fournisseurs et clients ; nombre de chacun)', 'Les tiers arrivent à l\'étape suivante'],
    ['$f214b$', 'compta-dossiers', '$f213b$', 's\'importent d\'un fichier Excel (fiche **Tiers**)', 'les tiers arrivent à l\'étape suivante'],
    ['$f214c$', 'compta-plan-comptes', '$f213c$', 'porté par un journal, un code de taxe ou un tiers (compte collectif)', 'tiers à l\'étape suivante'],
    ['$f214d$', 'compta-taxes', '$f213e$', 'se règle dans sa fiche (page **Tiers**, retenue par défaut)', 'tiers, étape suivante'],
  ]) {
    const garde = md5(texteDe('213_compta_journaux_taxes.sql', marqueOrigine));
    assert.ok(sql.includes(`${marque}, '${slug}', '${garde}')`), `${slug} : garde ${garde}`);
    const texte = texteDe('214_compta_tiers.sql', marque);
    assert.ok(texte.includes(attendu), `${slug} : ${attendu}`);
    assert.ok(!texte.includes(disparu), `${slug} : plus « ${disparu} »`);
  }
  assert.ok(texteDe('214_compta_tiers.sql', '$f214c$').includes('6. **Importer (Excel)**'), 'plan : action d\'import');
  assert.ok(sql.includes("('compta-tiers', 'Tiers', '📇', 1063, $f214e$## 📇 Tiers"));
  assert.ok(sql.includes("'LabFlow Compta', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, false, true, 'compta'") && sql.includes('ON CONFLICT (slug) DO NOTHING'));
  const fiche = texteDe('214_compta_tiers.sql', '$f214e$');
  for (const mot of ['+ Fournisseur', '+ Client', 'Modèle des codes', 'F0001', 'C0001', '4011', '4111', 'retenue par défaut', 'Importer (Excel)', 'rien n\'est importé', 'Exporter (Excel)', 'Afficher plus', 'Saisie', 'aucun compte individuel', '2 000 lignes']) assert.ok(fiche.includes(mot), mot);
});

test('tiers : lecteurs de saisie (code, nom, matricule, email, régime, délai, champs, modèle, filtres)', () => {
  assert.equal(tiers.lireType('client'), 'client');
  for (const v of ['x', '', null, 'Client']) assert.throws(() => tiers.lireType(v), est400);
  assert.equal(tiers.lireCode(' f0001 '), 'F0001');
  assert.equal(tiers.lireCode(''), null, 'vide = généré');
  assert.equal(tiers.lireCode(null), null);
  assert.equal(tiers.lireCode(401001), '401001');
  for (const v of ['A', 'ABCDEFGHIJK', 'F-0001', 'F 0001', 'F0001é', {}]) assert.throws(() => tiers.lireCode(v), est400, JSON.stringify(v));
  assert.equal(tiers.lireNom('  Société   Essai  '), 'Société Essai');
  for (const v of ['', '  ', null, 'x'.repeat(256), 'شركة', 'Essai 😀']) assert.throws(() => tiers.lireNom(v), est400, JSON.stringify(v));
  assert.deepEqual(tiers.lireMatricule('1234567a/a/m/000'), { valeur: '1234567A/A/M/000', avertissement: null });
  assert.deepEqual(tiers.lireMatricule(''), { valeur: null, avertissement: null });
  assert.equal(tiers.lireMatricule('1234567').avertissement, 'Matricule fiscal sans lettre de clé (1234567A…) : à vérifier sur la patente');
  assert.throws(() => tiers.lireMatricule('123456A'), est400, 'six chiffres');
  assert.throws(() => tiers.lireMatricule('ABC'), est400);
  assert.equal(tiers.lireEmail(' Contact@Essai.tn '), 'Contact@Essai.tn');
  assert.equal(tiers.lireEmail(''), null);
  for (const v of ['contact', 'a@b', 'a @b.tn', 'x'.repeat(250) + '@essai.tn']) assert.throws(() => tiers.lireEmail(v), est400, v);
  assert.equal(tiers.lireRegimeTva(''), 'assujetti');
  assert.equal(tiers.lireRegimeTva(undefined), 'assujetti');
  for (const [v, attendu] of [['assujetti', 'assujetti'], ['Non assujetti', 'non_assujetti'], ['non_assujetti', 'non_assujetti'], ['NON-ASSUJETTI', 'non_assujetti'], ['Exonéré', 'exonere'], ['exonere', 'exonere'], ['En suspension de TVA', 'suspension'], ['suspension', 'suspension'], ['en suspension', 'suspension']]) assert.equal(tiers.lireRegimeTva(v), attendu, v);
  for (const v of ['réel', 'x', 12]) assert.throws(() => tiers.lireRegimeTva(v), est400, JSON.stringify(v));
  assert.equal(tiers.lireDelai(''), 0);
  assert.equal(tiers.lireDelai(null), 0);
  assert.equal(tiers.lireDelai('30'), 30);
  assert.equal(tiers.lireDelai(365), 365);
  for (const v of ['366', '-1', '1.5', 'x', '1000']) assert.throws(() => tiers.lireDelai(v), est400, v);
  // Tous les champs (création) : le code vide vaut « généré », le compte et la retenue absents valent null.
  const c = tiers.lireChamps({ code: '', nom: 'A', matriculeFiscal: '1234567A', adresse: '', ville: 'Tunis', telephone: '71 000 000', email: 'a@b.tn', regimeTva: 'exonere', delaiPaiement: '45' });
  assert.deepEqual(c, {
    valeurs: { code: null, nom: 'A', adresse: null, ville: 'Tunis', telephone: '71 000 000', email: 'a@b.tn', regime_tva: 'exonere', delai_paiement: 45, matricule_fiscal: '1234567A' },
    compteId: null, retenueId: null, avertissements: [],
  });
  assert.throws(() => tiers.lireChamps({ code: 'F1' }), est400, 'nom obligatoire');
  // Partiel (modification) : seuls les champs présents ; compte et retenue absents = undefined (non touchés).
  const p = tiers.lireChamps({ ville: 'Sfax', compteId: '12' }, true);
  assert.deepEqual(p, { valeurs: { ville: 'Sfax' }, compteId: 12, retenueId: undefined, avertissements: [] });
  assert.deepEqual(tiers.lireChamps({ retenueId: '' }, true), { valeurs: {}, compteId: undefined, retenueId: null, avertissements: [] });
  assert.throws(() => tiers.lireChamps({ compteId: 'x' }), est400);
  // Modèle des codes.
  assert.deepEqual(tiers.lireModele({ prefixeFournisseur: ' f ', prefixeClient: '', chiffres: '5' }), { tiers_prefixe_fournisseur: 'F', tiers_prefixe_client: '', tiers_chiffres: 5 });
  assert.deepEqual(tiers.lireModele({ chiffres: 3 }), { tiers_chiffres: 3 });
  for (const corps of [{}, { prefixeFournisseur: 'ABCD' }, { prefixeClient: 'C-' }, { chiffres: '2' }, { chiffres: '8' }, { chiffres: 'x' }]) assert.throws(() => tiers.lireModele(corps), est400, JSON.stringify(corps));
  // Filtres de la liste.
  assert.deepEqual(tiers.lireFiltres({}), { type: 'fournisseur', q: '', inactifs: false, page: 1, limite: 25 });
  assert.deepEqual(tiers.lireFiltres({ type: 'client', q: ' bia ', inactifs: '1', page: '3', limite: '50' }), { type: 'client', q: 'bia', inactifs: true, page: 3, limite: 50 });
  for (const q of [{ type: 'x' }, { page: '0' }, { page: 'a' }, { limite: '201' }, { limite: '0' }]) assert.throws(() => tiers.lireFiltres(q), est400, JSON.stringify(q));
  assert.equal(tiers.tiersMouvemente.constructor.name, 'AsyncFunction', 'seul endroit à compléter à la saisie');
});

test('tiers : code généré d\'après le modèle (préfixe + numéro suivant), série pleine, préfixe vide', () => {
  const m = { prefixes: { fournisseur: 'F', client: 'C' }, chiffres: 4 };
  assert.equal(tiers.prochainCode(m, 'fournisseur', new Set()), 'F0001');
  assert.equal(tiers.prochainCode(m, 'fournisseur', new Set(['F0001', 'F0007', 'F0003', 'C0020', 'FX0009', 'F12'])), 'F0008', 'seuls les codes du modèle comptent');
  assert.equal(tiers.prochainCode(m, 'client', new Set(['C0020'])), 'C0021');
  assert.equal(tiers.prochainCode(m, 'fournisseur', new Set(['F9999'])), null, 'série pleine');
  assert.equal(tiers.prochainCode({ prefixes: { fournisseur: '', client: '' }, chiffres: 6 }, 'fournisseur', new Set(['401001', '000003'])), '401002', 'préfixe vide : codes tout en chiffres');
  assert.equal(tiers.prochainCode({ prefixes: { fournisseur: '401', client: '411' }, chiffres: 3 }, 'fournisseur', new Set(['401001'])), '401002', 'modèle « 401 + 3 chiffres »');
  assert.equal(tiers.modeleDe({ tiers_prefixe_fournisseur: 'F', tiers_prefixe_client: 'C', tiers_chiffres: 4 }).chiffres, 4);
  const pris = new Set(['F0001']);
  const gen = tiers.generateurCodes(m, 'fournisseur', pris);
  assert.equal(gen(), 'F0002');
  assert.equal(gen(), 'F0003');
  assert.ok(pris.has('F0003'), 'chaque code rendu est pris');
  const plein = tiers.generateurCodes({ prefixes: { fournisseur: 'F', client: 'C' }, chiffres: 3 }, 'fournisseur', new Set(['F999']));
  assert.throws(() => plein(), (e) => e.statusCode === 409 && e.code === 'SERIE_PLEINE');
});

test('tiers : présentation, SQL, contrôle des lignes d\'import (tout ou rien)', () => {
  const t = tiers.presenterTiers({
    id: 7, type: 'fournisseur', code: 'F0001', nom: 'Essai', matricule_fiscal: '1234567A/A/M/000', adresse: null, ville: 'Tunis', telephone: null, email: null, regime_tva: 'assujetti', delai_paiement: 30, origine: 'import', actif: true, created_at: 'c', updated_at: 'u',
    compte_id: 3, compte_numero: '4011', compte_libelle: 'Fournisseurs - achats', compte_nature: 'fournisseurs', compte_actif: true, compte_feuille: true,
    retenue_id: 9, retenue_code: 'RS_MAR15', retenue_libelle: 'Retenue achats', retenue_taux: '1.500', retenue_actif: false,
  });
  assert.deepEqual(t, {
    id: 7, type: 'fournisseur', typeLibelle: 'Fournisseur', code: 'F0001', nom: 'Essai', matriculeFiscal: '1234567A/A/M/000', adresse: null, ville: 'Tunis', telephone: null, email: null,
    compte: { id: 3, numero: '4011', libelle: 'Fournisseurs - achats', nature: 'fournisseurs', actif: true, feuille: true, imputable: true },
    regimeTva: 'assujetti', regimeTvaLibelle: 'Assujetti', retenue: { id: 9, code: 'RS_MAR15', libelle: 'Retenue achats', taux: '1.500', actif: false },
    delaiPaiement: 30, origine: 'import', actif: true, creeLe: 'c', modifieLe: 'u',
  });
  assert.equal(tiers.presenterTiers({ id: 1, type: 'client', code: 'C0001', nom: 'x', regime_tva: 'exonere', delai_paiement: 0, origine: 'saisi', actif: false, compte_id: null, retenue_id: null }).retenue, null);
  assert.ok(tiers.SQL_FILTRES.includes('t.code ILIKE $3 OR t.nom ILIKE $3 OR t.matricule_fiscal ILIKE $3') && tiers.SQL_FILTRES.includes('($4::boolean OR t.actif)'));
  assert.ok(tiers.SQL_SELECT.includes('LEFT JOIN compta.taxes x ON x.id = t.retenue_id') && tiers.SQL_SELECT.includes('x.taux::text AS retenue_taux'));
  assert.deepEqual(tiers.EN_TETES_IMPORT, ['Code', 'Nom', 'Matricule fiscal', 'Adresse', 'Ville', 'Téléphone', 'Email', 'Compte collectif', 'Régime de TVA', 'Retenue par défaut', 'Délai de paiement (jours)']);
  assert.equal(tiers.EN_TETES_IMPORT[0], 'Code', 'le code en première colonne (D18)');
  assert.ok(tiers.EXEMPLE_IMPORT.fournisseur[0].startsWith('Exemple : ') && tiers.EXEMPLE_IMPORT.client[0].startsWith('Exemple : '));
  // Contrôle des lignes, hors base.
  const ctx = () => ({
    type: 'fournisseur', codesPris: new Set(['F0001']), codesFichier: new Set(),
    collectifs: new Map([['4011', { id: 3, numero: '4011', actif: true }], ['404', { id: 4, numero: '404', actif: false }]]),
    collectifDefaut: { id: 3, numero: '4011', actif: true },
    retenues: new Map([['RS_MAR15', { id: 9, code: 'RS_MAR15', actif: true }], ['RS_HON10', { id: 10, code: 'RS_HON10', actif: false }]]),
    matricules: new Map([['1234567', 'le fournisseur F0001']]),
  });
  const ligne = (n, cellules) => ({ ligne: n, cellules });
  const ok = tiers.controlerLigne(ligne(5, ['', 'Société A', '7654321B', '1 rue', 'Sfax', '74 000 000', 'a@b.tn', '', 'Non assujetti', 'rs_mar15', '30']), ctx());
  assert.deepEqual(ok.erreurs, []);
  assert.deepEqual([ok.valeurs.code, ok.valeurs.nom, ok.valeurs.matricule_fiscal, ok.valeurs.regime_tva, ok.valeurs.delai_paiement, ok.compteId, ok.retenueId, ok.repere], [null, 'Société A', '7654321B', 'non_assujetti', 30, 3, 9, 'Société A']);
  const ko = tiers.controlerLigne(ligne(6, ['F0001', '', '123456A', '', '', '', 'pas-un-email', '404', 'réel', 'RS_HON10', '999']), ctx());
  assert.ok(ko.erreurs.some((e) => /déjà dans le dossier/.test(e)), 'code pris');
  assert.ok(ko.erreurs.some((e) => /Nom obligatoire/.test(e)));
  assert.ok(ko.erreurs.some((e) => /7 chiffres attendus/.test(e)), 'matricule');
  assert.ok(ko.erreurs.some((e) => /Email invalide/.test(e)));
  assert.ok(ko.erreurs.some((e) => /Compte collectif 404 : désactivé/.test(e)));
  assert.ok(ko.erreurs.some((e) => /Régime de TVA inconnu/.test(e)));
  assert.ok(ko.erreurs.some((e) => /RS_HON10 : code désactivé/.test(e)));
  assert.ok(ko.erreurs.some((e) => /Délai de paiement/.test(e)));
  const ko2 = tiers.controlerLigne(ligne(7, ['F0002', 'B', '', '', '', '', '', '4111', '', 'RS_X', '']), ctx());
  assert.ok(ko2.erreurs.some((e) => /Compte collectif 4111 : absent du plan ou pas de nature fournisseurs/.test(e)));
  assert.ok(ko2.erreurs.some((e) => /aucun code de retenue de ce nom/.test(e)));
  const sans = tiers.controlerLigne(ligne(8, ['', 'C', '', '', '', '', '', '', '', '', '']), { ...ctx(), collectifDefaut: null });
  assert.ok(sans.erreurs.some((e) => /aucun compte par défaut/.test(e)));
  // Toutes les lignes : doublons dans le fichier, matricule déjà porté (avertissement, jamais un refus).
  const r = tiers.controlerLignes([
    ligne(5, ['F0002', 'A', '1234567A/A/M/000', '', '', '', '', '', '', '', '']),
    ligne(6, ['f0002', 'B', '9999999C', '', '', '', '', '', '', '', '']),
    ligne(7, ['', 'C', '9999999C', '', '', '', '', '', '', '', '']),
  ], ctx());
  assert.deepEqual(r.fausses, [{ ligne: 6, repere: 'F0002 — B', erreurs: ['Code F0002 : en double dans le fichier'] }]);
  assert.equal(r.valides.length, 2);
  assert.deepEqual(r.avertissements, ['Ligne 5 (F0002 — A) : Matricule fiscal déjà porté par le fournisseur F0001', 'Ligne 7 (C) : Matricule fiscal déjà porté par la ligne 6']);
});

test('plan : contrôle des lignes d\'import (numéro, libellé, nature, parents dans le plan ou le fichier, classes)', () => {
  assert.deepEqual(plan.EN_TETES_IMPORT, ['Numéro', 'Libellé', 'Nature']);
  assert.ok(plan.EXEMPLE_IMPORT[0].startsWith('Exemple : '));
  const ligne = (n, cellules) => ({ ligne: n, cellules });
  const numeros = new Set(['53', '532', '5321', '5411']);
  const r = plan.controlerLignesImport([
    ligne(5, ['5321', 'Comptes en dinars renommé', '']),
    ligne(6, ['53211', 'BIAT', 'banque']),
    ligne(7, ['532111', 'BIAT - compte courant', 'Banque']),
    ligne(8, ['58', 'Nouvelle racine', '']),
    ligne(9, ['88', 'Classe 8', '']),
    ligne(10, ['61111', 'Sans parent', '']),
    ligne(11, ['5321', 'Doublon', '']),
    ligne(12, ['53a', 'Numéro faux', '']),
    ligne(13, ['54111', '', 'Caisse']),
    ligne(14, ['54112', 'Nature inconnue', 'Trésorerie']),
  ], numeros);
  assert.deepEqual(r.valides.map((v) => [v.numero, v.libelle, v.nature ?? null, v.parent ?? null]), [
    ['5321', 'Comptes en dinars renommé', null, null], ['53211', 'BIAT', 'banque', '5321'], ['532111', 'BIAT - compte courant', 'banque', '53211'], ['58', 'Nouvelle racine', null, null],
  ]);
  assert.deepEqual(r.fausses.map((f) => [f.ligne, f.erreurs[0]]), [
    [9, 'Numéro 88 : classe hors 1 à 7'], [10, 'Numéro 61111 : aucun compte parent, ni dans le plan ni dans le fichier'], [11, 'Numéro 5321 : en double dans le fichier'],
    [12, 'Numéro : 2 à 8 chiffres'], [13, 'Libellé obligatoire'], [14, 'Nature « Trésorerie » inconnue (Général, Capitaux et passifs non courants, Immobilisations, Stocks, Fournisseurs, Clients, Personnel, État, Retenues à la source opérées, Retenues à la source subies, TVA à payer, TVA déductible, TVA collectée, Banque, Caisse, Charges, Produits)'],
  ]);
  assert.ok(plan.compteUtilise.constructor.name === 'AsyncFunction');
});

test('outil d\'import Excel : modèle en texte, lecture d\'un classeur (en-têtes, exemple, textes, lignes vides, bornes)', async () => {
  const enTetes = ['Code', 'Nom', 'Délai'];
  const { wb, ws } = importExcel.modeleClasseur({ feuille: 'Essai', titre: 'Modèle', sousTitre: 'Dossier', meta: 'm', enTetes, largeurs: [12, 30, 10], exemple: ['Exemple : F0001', 'Société', '30'] });
  for (let c = 1; c <= 3; c++) assert.equal(ws.getColumn(c).numFmt, '@', 'colonnes en texte');
  const enTete = ws.rowCount; // la ligne d'exemple est la dernière du modèle
  ws.addRow(['0012', 'Zéros gardés', 30]);
  ws.addRow([null, '', null]);
  ws.addRow(['EXEMPLE', 'Un code qui commence par exemple reste un code', '']);
  ws.addRow([{ richText: [{ text: 'F' }, { text: '0002' }] }, 'Texte enrichi', 2026]);
  ws.addRow([{ formula: 'A1', result: 'F0003' }, 'Formule', 1.5]);
  const buffer = await wb.xlsx.writeBuffer();
  const lignes = await importExcel.lireClasseur(Buffer.from(buffer), { enTetes });
  assert.deepEqual(lignes, [
    { ligne: enTete + 1, cellules: ['0012', 'Zéros gardés', '30'] },
    { ligne: enTete + 3, cellules: ['EXEMPLE', 'Un code qui commence par exemple reste un code', ''] },
    { ligne: enTete + 4, cellules: ['F0002', 'Texte enrichi', '2026'] },
    { ligne: enTete + 5, cellules: ['F0003', 'Formule', '1.5'] },
  ]);
  await assert.rejects(importExcel.lireClasseur(Buffer.from(buffer), { enTetes, max: 2 }), (e) => e.code === 'TROP_DE_LIGNES');
  await assert.rejects(importExcel.lireClasseur(Buffer.from(buffer), { enTetes: ['Numéro', 'Libellé', 'Nature'] }), (e) => e.code === 'EN_TETES');
  await assert.rejects(importExcel.lireClasseur(Buffer.from('pas un classeur'), { enTetes }), (e) => e.code === 'FICHIER_ILLISIBLE');
  const vide = new ExcelJS.Workbook();
  vide.addWorksheet('Vide').addRow(enTetes);
  await assert.rejects(importExcel.lireClasseur(Buffer.from(await vide.xlsx.writeBuffer()), { enTetes }), (e) => e.code === 'AUCUNE_LIGNE');
  // Cellules à lien (texte simple ou enrichi) et formules partagées (relecture).
  assert.equal(importExcel.texteCellule({ value: { text: { richText: [{ text: 'contact' }, { text: '@essai.tn' }] }, hyperlink: 'mailto:contact@essai.tn' } }), 'contact@essai.tn');
  assert.equal(importExcel.texteCellule({ value: { text: ' Site ', hyperlink: 'https://essai.tn' } }), 'Site');
  assert.equal(importExcel.texteCellule({ value: { sharedFormula: 'A1', result: new Date(Date.UTC(2026, 0, 2)) } }), '2026-01-02');
  assert.equal(importExcel.texteCellule({ value: { formula: 'A1', result: 12 } }), '12');
  assert.equal(importExcel.texteCellule({ value: { error: '#N/A' } }), '');
  const e = importExcel.erreurImport([{ ligne: 5, repere: 'x', erreurs: ['y'] }], 12);
  assert.equal(e.statusCode, 400);
  assert.equal(e.code, 'IMPORT_ERREURS');
  assert.deepEqual([e.nbLignes, e.nbErreurs, e.lignes.length], [12, 1, 1]);
  assert.match(e.message, /rien n'a été importé/);
  assert.equal(importExcel.LIGNES_MAX, 2000);
  assert.equal(importExcel.CHAMP_FICHIER, 'fichier');
  assert.equal(importExcel.nomFichier({ originalname: 'tiers — été.xlsx' }), 'tiers ? été.xlsx');
  assert.equal(typeof importExcel.televersement, 'function');
});

test('routes S5c : lecture et exports pour tout accès, huit écritures sous la limite du plan, droits « tiers » / « configurer »', () => {
  const src = lire('src', 'compta', 'routes.js');
  for (const r of [
    "router.get('/dossiers/:dossierId/plan/modele-import', authenticate, plan.modeleImport);",
    "router.post('/dossiers/:dossierId/plan/import', authenticate, limitePlan, televersement, plan.importer);",
    "router.get('/dossiers/:dossierId/tiers', authenticate, tiers.lire);",
    "router.get('/dossiers/:dossierId/tiers/modele-import', authenticate, tiers.modeleImport);",
    "router.get('/dossiers/:dossierId/tiers/export', authenticate, tiers.exporter);",
    "router.put('/dossiers/:dossierId/tiers/modele', authenticate, limitePlan, tiers.modele);",
    "router.post('/dossiers/:dossierId/tiers/import', authenticate, limitePlan, televersement, tiers.importer);",
    "router.post('/dossiers/:dossierId/tiers', authenticate, limitePlan, tiers.creer);",
    "router.put('/dossiers/:dossierId/tiers/:tiersId', authenticate, limitePlan, tiers.modifier);",
    "router.post('/dossiers/:dossierId/tiers/:tiersId/desactiver', authenticate, limitePlan, tiers.desactiver);",
    "router.post('/dossiers/:dossierId/tiers/:tiersId/reactiver', authenticate, limitePlan, tiers.reactiver);",
    "router.delete('/dossiers/:dossierId/tiers/:tiersId', authenticate, limitePlan, tiers.supprimer);",
  ]) assert.ok(src.includes(r), r);
  // Les adresses fixes avant « /tiers/:tiersId » : PUT /tiers/modele n'est jamais pris pour un identifiant.
  assert.ok(src.indexOf("'/dossiers/:dossierId/tiers/modele'") < src.indexOf("'/dossiers/:dossierId/tiers/:tiersId'"));
  assert.ok(src.indexOf("'/dossiers/:dossierId/tiers/import'") < src.indexOf("'/dossiers/:dossierId/tiers/:tiersId'"));
  for (const f of ['lire', 'creer', 'modifier', 'desactiver', 'reactiver', 'supprimer', 'modele', 'modeleImport', 'importer', 'exporter']) assert.equal(typeof tiers[f], 'function', `tiers.${f}`);
  for (const f of ['modeleImport', 'importer']) assert.equal(typeof plan[f], 'function', `plan.${f}`);
  const ctrl = lire('src', 'compta', 'tiers.js');
  assert.ok(ctrl.includes("const ecritureTiers = (req, travail, droit = 'tiers') => dansEspaceDuDossier(req.user, req.params.dossierId, async (db, acces, d) => {\n  if (!droits(acces)[droit]) throw erreur(403, droit === 'configurer' ? MSG_CONFIGURER : MSG_TIERS, 'NIVEAU_INSUFFISANT');\n  if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\\'abord', 'DOSSIER_ARCHIVE');"));
  assert.equal((ctrl.match(/await ecritureTiers\(req, async \(db, acces, d\) => \{/g) || []).length, 7, 'sept écritures dans la transaction du dossier');
  // Supprimer, le modèle des codes et l'import exigent « configurer » ; créer, modifier, désactiver, réactiver « tiers ».
  assert.equal((ctrl.match(/\}, 'configurer'\);/g) || []).length, 3);
  assert.ok(ctrl.includes('FOR UPDATE'), 'tiers relu sous verrou');
  assert.ok(ctrl.includes("if (await tiersMouvemente(db, t.id)) throw erreur(409") && (ctrl.match(/await tiersMouvemente\(db, t\.id\)/g) || []).length === 3, 'hook sur le code, le compte collectif et la suppression');
  assert.ok(ctrl.includes("const garde = await lectureDossier(req.user, req.params.dossierId);\n    if (!droits(garde.acces).configurer)"), 'import : gardes avant l\'analyse du classeur');
  assert.ok(ctrl.includes("est pleine ("), 'import : série de codes pleine signalée ligne par ligne');
  assert.ok(ctrl.includes('if (fausses.length) throw erreurImport(fausses, lignes.length);'), 'tout ou rien : rien d\'écrit à la moindre erreur');
  const p = lire('src', 'compta', 'planComptes.js');
  assert.ok(p.includes('if (fausses.length) throw erreurImport(fausses, lignes.length);'), 'plan : tout ou rien');
  assert.ok(p.includes("Importé d'un autre logiciel le"), 'ajouts expliqués');
  assert.ok(!/DELETE FROM compta\.comptes|SET actif = false/.test(p.slice(p.indexOf('const importer = async'))), 'l\'import ne désactive ni ne supprime');
  assert.equal(tiers.MSG_TIERS, 'Seul le titulaire ou un gérant de niveau Complet ou Saisie peut créer ou modifier un tiers');
});

test('branchements : droit « tiers » (Saisie aussi), fiche et résumé avec les tiers, compte collectif porté', () => {
  assert.equal(dossiers.droits({ role: 'titulaire', niveau: 'complet' }).tiers, true);
  assert.equal(dossiers.droits({ role: 'gerant', niveau: 'complet' }).tiers, true);
  assert.equal(dossiers.droits({ role: 'gerant', niveau: 'saisie' }).tiers, true, 'réponse 4 du 08/10');
  assert.equal(dossiers.droits({ role: 'gerant', niveau: 'saisie' }).configurer, false);
  assert.equal(dossiers.droits({ role: 'gerant', niveau: 'consultation' }).tiers, false);
  const fiche = lire('src', 'compta', 'dossiers.js');
  assert.ok(fiche.includes('\n    journaux: configuration.journaux,\n    taxes: configuration.taxes,\n    tiers: configuration.tiers,\n'), 'résumé des tiers dans la fiche');
  const config = lire('src', 'compta', 'configDossier.js');
  assert.ok(config.includes("tiers: { fournisseurs: tiersDe('fournisseur'), clients: tiersDe('client') }"));
  const p = lire('src', 'compta', 'planComptes.js');
  assert.ok(p.includes('SELECT 1 FROM compta.tiers WHERE compte_id = $1'), 'compteUtilise : un tiers aussi');
  assert.ok(p.includes("porté par un journal, un code de taxe ou un tiers : il ne se désactive pas") && p.includes("porté par un journal, un code de taxe ou un tiers : il ne se supprime pas"));
  assert.equal((p.match(/await compteUtilise\(db, c\.id\)/g) || []).length, 3, 'désactiver, supprimer, changer la nature');
  assert.ok(p.includes("sa nature ne change plus"), 'la nature d\'un compte porté est figée');
  assert.ok(p.includes("const garde = await lectureDossier(req.user, req.params.dossierId);"), 'import du plan : gardes avant l\'analyse');
  const paquet = lire('src', 'compta', 'paquets', 'tn-nc01.json');
  assert.ok(paquet.includes('"collectifs": {'), 'les collectifs par défaut sont une donnée du paquet');
});
