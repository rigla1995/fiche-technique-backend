// LabFlow Compta, étape S5b « Les journaux et les codes de taxe » (labflow-reprise/achats-compta/PLAN-S5.md §1, §4, §5 ;
// réponses du client du 07/10 — « ok pour les 8 » — et du 08/10 — « ok pour les 4 » : TVA collectée sur 436711, les trois
// sous-comptes que la norme n'a pas créés par défaut ET remplaçables, un code de TVA non récupérable par taux, tout type
// de journal sauf un seul à-nouveaux). Tests sans base : le paquet (journaux, sous-comptes proposés, codes de taxe et
// leur copie selon le régime), la migration 213 (tables, VALUES identiques au fichier, dossiers existants, manuel), les
// lecteurs de saisie, les présentations, les routes et les branchements (création du dossier, fiche, compte utilisé).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const paquets = require('../src/compta/paquets');
const config = require('../src/compta/configDossier');
const journaux = require('../src/compta/journaux');
const taxes = require('../src/compta/taxes');
const plan = require('../src/compta/planComptes');

const TN = paquets.PAQUETS.TN;
const parNumero = new Map(TN.comptes.map((c) => [c.numero, c]));
const taxe = (code) => TN.taxes.find((t) => t.code === code);
const copies = (regime) => TN.taxes.filter((t) => config.codeCopie(t.copie, regime)).map((t) => t.code);
const REEL = { tva: 'reel', exportateur_total: false };

test('paquet Tunisie : six journaux par défaut, codes et comptes de contrepartie de la bonne nature', () => {
  assert.deepEqual(paquets.controlerPaquet(TN), []);
  assert.deepEqual(TN.journaux.map((j) => [j.code, j.type, j.compte ?? null]), [['AC', 'achats', null], ['VT', 'ventes', null], ['BQ', 'banque', '5321'], ['CA', 'caisse', '5411'], ['OD', 'od', null], ['AN', 'an', null]]);
  assert.equal(TN.journaux.find((j) => j.code === 'AN').libelle, 'À-nouveaux');
  assert.equal(parNumero.get('5321').nature, 'banque');
  assert.equal(parNumero.get('5411').nature, 'caisse');
  assert.deepEqual(paquets.TYPES_JOURNAUX, ['achats', 'ventes', 'banque', 'caisse', 'od', 'an']);
  assert.deepEqual(paquets.TYPES_AVEC_COMPTE, ['banque', 'caisse']);
  assert.deepEqual(paquets.NATURE_PAR_TYPE, { banque: 'banque', caisse: 'caisse' });
  assert.equal(paquets.CODE_JOURNAL_MAX, 4);
  // Le contrôle refuse un paquet défectueux.
  const avec = (journauxBis) => paquets.controlerPaquet({ ...TN, journaux: journauxBis });
  assert.ok(avec([...TN.journaux, { code: 'BQ2', libelle: 'Banque 2', type: 'banque', compte: '4011' }]).some((d) => /nature/.test(d)), 'contrepartie de la mauvaise nature');
  assert.ok(avec([...TN.journaux, { code: 'OD2', libelle: 'Divers', type: 'od', compte: '5321' }]).some((d) => /pas de compte/.test(d)));
  assert.ok(avec([...TN.journaux, { code: 'AN2', libelle: 'Bis', type: 'an' }]).some((d) => /un seul journal/.test(d)));
  assert.ok(avec([...TN.journaux, { code: 'achats', libelle: 'x', type: 'achats' }]).some((d) => /code de 2 à 4/.test(d)));
  assert.ok(avec([...TN.journaux, { code: 'XX', libelle: 'x', type: 'ventes2' }]).some((d) => /type inconnu/.test(d)));
});

test('paquet Tunisie : trois sous-comptes proposés que la norme n\'a pas, expliqués, sous un parent de la nomenclature', () => {
  assert.deepEqual(TN.sousComptes.map((s) => [s.numero, s.nature, s.libelle]), [
    ['4375', 'etat', 'Droit de timbre collecté'], ['4376', 'etat', 'FODEC collecté'], ['43665', 'tva_deductible', 'TVA retenue à la source par les clients'],
  ]);
  const numeros = new Set(TN.comptes.map((c) => c.numero));
  for (const s of TN.sousComptes) {
    assert.ok(!numeros.has(s.numero), `${s.numero} absent de la nomenclature`);
    assert.ok(s.explication.startsWith('Ajouté par LabFlow Compta pour le code de taxe '), s.numero);
    assert.ok(s.explication.length <= paquets.NOTE_MAX && /Remplaçable/.test(s.explication));
    assert.equal(paquets.parentParmi(s.numero, numeros), s.numero.slice(0, -1), 'parent immédiat dans la nomenclature');
    assert.equal(parNumero.get(s.numero.slice(0, -1)).nature, s.nature, 'nature héritée du parent');
  }
  // Chaque sous-compte sert à un code copié dans tout dossier (TIMBRE, FODEC, RSTVA25) ; un sous-compte orphelin est refusé.
  assert.equal(taxe('TIMBRE').vente, '4375');
  assert.equal(taxe('FODEC').vente, '4376');
  assert.equal(taxe('RSTVA25').vente, '43665');
  assert.ok(paquets.controlerPaquet({ ...TN, sousComptes: [...TN.sousComptes, { numero: '4377', libelle: 'Orphelin', nature: 'etat', explication: 'x' }] }).some((d) => /visé par aucun code/.test(d)));
  assert.ok(paquets.controlerPaquet({ ...TN, sousComptes: [...TN.sousComptes, { numero: '437', libelle: 'Doublon', nature: 'etat', explication: 'x' }] }).some((d) => /déjà dans la nomenclature/.test(d)));
});

test('paquet Tunisie : 31 codes de taxe — 20 copiés au réel, 21 pour un exportateur total, 14 sans TVA, 10 sur demande', () => {
  assert.equal(TN.taxes.length, 31);
  const reel = copies(REEL);
  assert.equal(reel.length, 20, 'réel : les 20 codes du PLAN-S5 §5');
  assert.deepEqual(reel, ['TVA19', 'TVA13', 'TVA7', 'TVA0', 'TVAEXO', 'TVANDR19', 'RS_HON10', 'RS_HON3', 'RS_LOY10', 'RS_LOY5', 'RS_MAR15', 'RS_MAR1', 'RS_MAR05', 'RS_NR15', 'RSTVA100', 'RSTVA25', 'TIMBRE', 'FODEC', 'AV_FORF1', 'AV_ALC5']);
  const exportateur = copies({ tva: 'reel', exportateur_total: true });
  assert.equal(exportateur.length, 21);
  assert.ok(exportateur.includes('TVASUSP'));
  for (const tva of ['forfaitaire', 'non_assujetti']) {
    const sans = copies({ tva, exportateur_total: false });
    assert.equal(sans.length, 14, tva);
    assert.ok(!sans.some((c) => taxe(c).type === 'tva'), `${tva} : aucun code de TVA (réponse 7 du client du 07/10)`);
    assert.ok(sans.includes('TIMBRE') && sans.includes('RS_HON10') && sans.includes('RSTVA100'), 'retenues, timbre et avances conservés');
  }
  assert.equal(TN.taxes.filter((t) => t.copie === 'jamais').length, 10);
  assert.deepEqual(TN.taxes.filter((t) => t.copie === 'jamais').map((t) => t.code), ['TVANDR13', 'TVANDR7', 'RS_ART5', 'RS_JET20', 'RS_INT20', 'RS_DIV10', 'RS_NR25', 'RS_LIV3', 'TIMBRE15', 'TIMBRE2']);
  // Comptes et assiettes (recherche fiscale §3 ; réponses 1 à 3 du 08/10).
  assert.deepEqual([taxe('TVA19').taux, taxe('TVA19').assiette, taxe('TVA19').achat, taxe('TVA19').vente, taxe('TVA19').immobilisations], ['19.000', 'ht', '43666', '436711', '43662']);
  assert.equal(parNumero.get('436711').libelle, 'TVA collectée sur les débits', 'réponse 1 du 08/10 : compte feuille, prêt à l\'emploi');
  assert.deepEqual([taxe('TVAEXO').taux, taxe('TVAEXO').achat, taxe('TVAEXO').vente], [null, null, null]);
  assert.deepEqual([taxe('TVANDR19').taux, taxe('TVANDR19').achat, taxe('TVANDR19').vente], ['19.000', '6652', null], 'réponse 3 : un code par taux');
  assert.deepEqual([taxe('TIMBRE').type, taxe('TIMBRE').taux, taxe('TIMBRE').montant, taxe('TIMBRE').assiette, taxe('TIMBRE').achat], ['timbre', null, '1.000', 'fixe', '6654']);
  assert.deepEqual([taxe('RS_MAR15').type, taxe('RS_MAR15').taux, taxe('RS_MAR15').assiette, taxe('RS_MAR15').achat, taxe('RS_MAR15').vente, taxe('RS_MAR15').codeTej], ['retenue', '1.500', 'ttc', '432', '4341', 'RS7_000001']);
  assert.deepEqual([taxe('RS_HON3').taux, taxe('RS_HON3').codeTej], ['3.000', 'RS2_000002']);
  assert.deepEqual([taxe('RSTVA100').type, taxe('RSTVA100').taux, taxe('RSTVA100').assiette, taxe('RSTVA100').achat, taxe('RSTVA100').vente, taxe('RSTVA100').codeTej], ['retenue_tva', '100.000', 'tva', '432', null, 'RSTVA100']);
  assert.deepEqual([taxe('RSTVA25').achat, taxe('RSTVA25').vente], [null, '43665'], 'subie seulement');
  assert.deepEqual([taxe('AV_FORF1').type, taxe('AV_FORF1').achat, taxe('AV_FORF1').vente], ['avance', '4341', '432']);
  assert.deepEqual([taxe('FODEC').type, taxe('FODEC').achat, taxe('FODEC').vente], ['fodec', '6651', '4376']);
  assert.deepEqual([taxe('TIMBRE2').montant, taxe('TIMBRE2').copie], ['2.000', 'jamais']);
  for (const t of TN.taxes) {
    if (t.type === 'retenue' && t.code !== 'RS_LIV3') assert.ok(t.codeTej, `${t.code} : code TEJ pour les certificats`);
    assert.equal(parNumero.get('432').nature, 'retenues_operees');
    assert.equal(parNumero.get('4341').nature, 'retenues_subies');
  }
  // Le contrôle refuse un paquet défectueux.
  const avec = (bis) => paquets.controlerPaquet({ ...TN, taxes: [...TN.taxes, bis] });
  assert.ok(avec({ code: 'X1', libelle: 'x', type: 'timbre', taux: '1.000', montant: '1.000', assiette: 'fixe', achat: null, vente: null, immobilisations: null, copie: 'tous', codeTej: null }).some((d) => /pas de taux/.test(d)));
  assert.ok(avec({ code: 'X2', libelle: 'x', type: 'tva', taux: '19.000', montant: '1.000', assiette: 'ht', achat: null, vente: null, immobilisations: null, copie: 'tous', codeTej: null }).some((d) => /montant fixe/.test(d)));
  assert.ok(avec({ code: 'X3', libelle: 'x', type: 'tva', taux: '19', montant: null, assiette: 'ht', achat: null, vente: null, immobilisations: null, copie: 'tous', codeTej: null }).some((d) => /3 décimales/.test(d)));
  assert.ok(avec({ code: 'X4', libelle: 'x', type: 'tva', taux: '19.000', montant: null, assiette: 'ht', achat: '99999', vente: null, immobilisations: null, copie: 'tous', codeTej: null }).some((d) => /absent du paquet/.test(d)));
  assert.ok(avec({ code: 'TVA19', libelle: 'x', type: 'tva', taux: '19.000', montant: null, assiette: 'ht', achat: null, vente: null, immobilisations: null, copie: 'tous', codeTej: null }).some((d) => /en double/.test(d)));
  assert.ok(avec({ code: 'X5', libelle: 'x', type: 'tva', taux: '19.000', montant: null, assiette: 'ht', achat: null, vente: null, immobilisations: null, copie: 'parfois', codeTej: null }).some((d) => /copie inconnue/.test(d)));
  assert.deepEqual(paquets.TYPES_TAXES, ['tva', 'retenue', 'retenue_tva', 'timbre', 'fodec', 'avance', 'autre']);
  assert.deepEqual(paquets.ASSIETTES, ['ht', 'ttc', 'tva', 'fixe']);
  assert.deepEqual(paquets.COPIES, ['tous', 'assujetti', 'exportateur', 'jamais']);
});

test('paquet : transcription SQL des journaux, des sous-comptes et des taxes (une ligne par élément, numériques nus)', () => {
  const j = paquets.sqlValeursJournaux(TN).split('\n');
  assert.equal(j.length, 6);
  assert.equal(j[2], "  ('BQ', 'Banque', 'banque', '5321', 3),");
  assert.equal(j[5], "  ('AN', 'À-nouveaux', 'an', NULL, 6)");
  const s = paquets.sqlValeursSousComptes(TN).split('\n');
  assert.equal(s.length, 3);
  assert.ok(s[0].startsWith("  ('4375', 'Droit de timbre collecté', 'etat', '437', 'Ajouté par LabFlow Compta pour le code de taxe TIMBRE : le timbre facturé au client est une dette envers l''État"));
  assert.ok(s[2].startsWith("  ('43665', 'TVA retenue à la source par les clients', 'tva_deductible', '4366', "));
  const t = paquets.sqlValeursTaxes(TN).split('\n');
  assert.equal(t.length, 31);
  assert.equal(t[0], "  ('TVA19', 'TVA 19 %', 'tva', 19.000, NULL, 'ht', '43666', '436711', '43662', 'assujetti', NULL, NULL, 1),");
  assert.ok(t.includes("  ('TIMBRE', 'Droit de timbre', 'timbre', NULL, 1.000, 'fixe', '6654', '4375', NULL, 'tous', NULL, NULL, 18),"));
  assert.ok(t.includes("  ('RS_MAR15', 'Retenue achats de 1 000 D et plus 1,5 %', 'retenue', 1.500, NULL, 'ttc', '432', '4341', NULL, 'tous', 'RS7_000001', NULL, 12),"));
  assert.ok(!t[t.length - 1].endsWith(','), 'dernière ligne sans virgule');
  assert.equal(paquets.sqlNombre(null), 'NULL');
  assert.equal(paquets.sqlNombre('0.500'), '0.500');
});

test('migration 213 : tables, paquet TN en VALUES identiques au fichier, dossiers existants, journal, manuel', () => {
  const sql = lire('migrations', '213_compta_journaux_taxes.sql');
  for (const t of [
    'CREATE TABLE IF NOT EXISTS compta.ref_journaux', 'CREATE TABLE IF NOT EXISTS compta.ref_sous_comptes', 'CREATE TABLE IF NOT EXISTS compta.ref_taxes',
    'CREATE TABLE IF NOT EXISTS compta.journaux', 'CREATE TABLE IF NOT EXISTS compta.taxes',
    "code       VARCHAR(4) NOT NULL CHECK (code ~ '^[A-Z0-9]{2,4}$')", "code            VARCHAR(12) NOT NULL CHECK (code ~ '^[A-Z0-9_]{2,12}$')",
    "type       VARCHAR(10) NOT NULL CHECK (type IN ('achats', 'ventes', 'banque', 'caisse', 'od', 'an'))",
    "type            VARCHAR(12) NOT NULL CHECK (type IN ('tva', 'retenue', 'retenue_tva', 'timbre', 'fodec', 'avance', 'autre'))",
    "assiette        VARCHAR(5) NOT NULL CHECK (assiette IN ('ht', 'ttc', 'tva', 'fixe'))", "CHECK ((assiette = 'fixe') = (montant IS NOT NULL))",
    'taux            NUMERIC(6,3) CHECK (taux IS NULL OR (taux >= 0 AND taux <= 100))', 'montant         NUMERIC(18,3)',
    'dossier_id INTEGER NOT NULL REFERENCES compta.dossiers(id) ON DELETE CASCADE', 'dossier_id      INTEGER NOT NULL REFERENCES compta.dossiers(id) ON DELETE CASCADE',
    'compte_id  INTEGER REFERENCES compta.comptes(id),', 'compte_achat_id INTEGER REFERENCES compta.comptes(id),', 'compte_vente_id INTEGER REFERENCES compta.comptes(id),', 'compte_immo_id  INTEGER REFERENCES compta.comptes(id),',
    'UNIQUE (dossier_id, code)', 'UNIQUE (paquet_id, code)', 'UNIQUE (paquet_id, numero)',
    'CREATE INDEX IF NOT EXISTS idx_compta_journaux_compte ON compta.journaux (compte_id)', 'CREATE INDEX IF NOT EXISTS idx_compta_taxes_vente ON compta.taxes (compte_vente_id)',
    'ON CONFLICT (paquet_id, code) DO NOTHING', 'ON CONFLICT (paquet_id, numero) DO NOTHING',
  ]) assert.ok(sql.includes(t), t);
  // Le fichier et la migration disent la même chose.
  assert.ok(sql.includes(`       (VALUES\n${paquets.sqlValeursJournaux(TN)}\n       ) AS v(code, libelle, type, compte, ordre)`), 'VALUES des journaux');
  assert.ok(sql.includes(`       (VALUES\n${paquets.sqlValeursSousComptes(TN)}\n       ) AS v(numero, libelle, nature, parent, explication)`), 'VALUES des sous-comptes');
  assert.ok(sql.includes(`       (VALUES\n${paquets.sqlValeursTaxes(TN)}\n       ) AS v(code, libelle, type, taux, montant, assiette, achat, vente, immobilisations, copie, code_tej, note, ordre)`), 'VALUES des taxes');
  assert.equal((sql.match(/^  \('[A-Z0-9_]{2,12}', /gm) || []).length, 6 + 3 + 31, 'une ligne par journal, par sous-compte et par code, aucune autre');
  assert.equal((sql.match(/^  \('\d{2,8}', /gm) || []).length, 3, 'une ligne par sous-compte');
  // Dossiers déjà créés : journaux, sous-comptes visés par un code copié selon le régime, taxes ; journal (migration 213).
  assert.equal(sql.split(config.SQL_COPIE).length - 1, 3, 'même règle de copie que configDossier.js (sous-comptes, taxes, journal)');
  assert.ok(sql.includes('NOT EXISTS (SELECT 1 FROM compta.journaux j WHERE j.dossier_id = d.id)') && sql.includes('NOT EXISTS (SELECT 1 FROM compta.taxes t WHERE t.dossier_id = d.id)'), 'seulement les dossiers sans journal / sans code');
  assert.ok(sql.includes("(SELECT k.id FROM compta.comptes k WHERE k.dossier_id = c.id AND k.numero = r.compte_numero AND k.actif), 'paquet'"), 'contrepartie par numéro, parmi les comptes actifs du dossier');
  assert.equal((sql.match(/^   ORDER BY c.id, r.ordre$/gm) || []).length, 2, 'journaux et codes insérés dans l\x27ordre du paquet (relecture)');
  assert.ok(sql.includes("v.nature, 'ajout', v.explication, COALESCE(k.actif, true)"), 'sous-compte ajouté, expliqué, actif si son parent l\'est');
  assert.ok(sql.includes("'journaux_initialises'") && sql.includes("'taxes_initialisees'") && sql.includes("'compte_ajoute'") && sql.includes("'propose', true"));
  assert.equal((sql.match(/'migration', 213/g) || []).length, 3);
  assert.ok(!/DROP |DELETE FROM|TRUNCATE/.test(sql), 'additive');
  // Manuel : gardes md5 des textes de la 212 (fiche du dossier, dossiers, plan de comptes) ; deux nouvelles fiches.
  assert.match(sql, /md5\(replace\(manuel_sections\.contenu_defaut, chr\(13\), ''\)\) = f\.garde/);
  assert.ok(!/\[\[/.test(sql), 'jamais de balise de vocabulaire dans une fiche Compta');
  const texteDe = (fichier, marque) => {
    const src = lire('migrations', fichier);
    const debut = src.indexOf(marque) + marque.length;
    return src.slice(debut, src.indexOf(marque, debut));
  };
  const md5 = (t) => crypto.createHash('md5').update(t, 'utf8').digest('hex');
  for (const [marque, slug, marqueOrigine, attendu] of [
    ['$f213a$', 'compta-dossier', '$f212a$', 'ses **journaux** et ses **codes de taxe**'],
    ['$f213b$', 'compta-dossiers', '$f212b$', 'six journaux et les codes de taxe de son régime'],
    ['$f213c$', 'compta-plan-comptes', '$f212c$', 'porté par un journal ou un code de taxe'],
  ]) {
    const garde = md5(texteDe('212_compta_plan_comptes.sql', marqueOrigine));
    assert.ok(sql.includes(`${marque}, '${slug}', '${garde}')`), `${slug} : garde ${garde}`);
    assert.ok(texteDe('213_compta_journaux_taxes.sql', marque).includes(attendu), marque);
  }
  assert.ok(sql.includes("('compta-journaux', 'Journaux', '📒', 1061, $f213d$## 📒 Journaux"));
  assert.ok(sql.includes("('compta-taxes', 'Taxes', '🧾', 1062, $f213e$## 🧾 Taxes"));
  assert.ok(sql.includes("'LabFlow Compta', f.ordre, f.contenu, f.contenu, f.mots_cles, f.ecran, false, true, 'compta'") && sql.includes('ON CONFLICT (slug) DO NOTHING'));
  const ficheJ = texteDe('213_compta_journaux_taxes.sql', '$f213d$');
  for (const mot of ['+ Journal', 'Compte à préciser', 'qu\'un journal d\'à-nouveaux', 'Désactiver', 'Réactiver', 'ne se supprime jamais']) assert.ok(ficheJ.includes(mot), mot);
  const ficheT = texteDe('213_compta_journaux_taxes.sql', '$f213e$');
  for (const mot of ['Ajouter depuis le paquet', 'code personnalisé', '436711', '4375', '4376', '43665', 'forfaitaire ou non assujetti', 'TTC hors timbre', 'TEJ', 'Compte à préciser']) assert.ok(ficheT.includes(mot), mot);
});

test('journaux : lecteurs de saisie, présentation, hook « sans écriture »', () => {
  assert.equal(journaux.lireCode(' bq2 '), 'BQ2');
  assert.equal(journaux.lireCode('AC'), 'AC');
  for (const v of ['A', 'ABCDE', 'BQ-1', '', null, undefined, 12, 'bq 2']) assert.throws(() => journaux.lireCode(v), (e) => e.statusCode === 400, JSON.stringify(v));
  assert.equal(journaux.lireType('banque'), 'banque');
  for (const v of ['x', '', null, 'Banque']) assert.throws(() => journaux.lireType(v), (e) => e.statusCode === 400);
  assert.equal(journaux.lireCompteId(null), null);
  assert.equal(journaux.lireCompteId(''), null);
  assert.equal(journaux.lireCompteId('12'), 12);
  assert.throws(() => journaux.lireCompteId('x'), (e) => e.statusCode === 400);
  assert.equal(journaux.journalMouvemente.constructor.name, 'AsyncFunction', 'seul endroit à compléter à la saisie');
  assert.equal(journaux.MSG_CONFIGURER, 'Seul le titulaire ou un gérant de niveau Complet peut modifier les journaux');
  assert.ok(journaux.SQL_JOURNAUX.includes('WHERE j.dossier_id = $1') && journaux.SQL_JOURNAUX.includes('LEFT JOIN compta.comptes k ON k.id = j.compte_id'));
  const j = journaux.presenterJournal({ id: 3, code: 'BQ', libelle: 'Banque', type: 'banque', origine: 'paquet', actif: true, compte_id: 9, compte_numero: '5321', compte_libelle: 'Comptes en dinars', compte_nature: 'banque', compte_actif: true, compte_feuille: false });
  assert.deepEqual(j, { id: 3, code: 'BQ', libelle: 'Banque', type: 'banque', typeLibelle: 'Banque', avecCompte: true, compte: { id: 9, numero: '5321', libelle: 'Comptes en dinars', nature: 'banque', actif: true, feuille: false, imputable: false }, origine: 'paquet', actif: true });
  assert.deepEqual(journaux.presenterJournal({ id: 1, code: 'AC', libelle: 'Achats', type: 'achats', origine: 'paquet', actif: true, compte_id: null }).compte, null);
  assert.equal(journaux.presenterJournal({ id: 1, code: 'OD', libelle: 'x', type: 'od', origine: 'ajout', actif: false, compte_id: null }).avecCompte, false);
});

test('taxes : lecteurs de saisie (taux et montant en texte à 3 décimales), présentation, hook « sans écriture »', () => {
  assert.equal(taxes.lireCode(' tva19 '), 'TVA19');
  assert.equal(taxes.lireCode('RS_MAR05'), 'RS_MAR05');
  for (const v of ['A', 'ABCDEFGHIJKLM', 'TVA-19', 'TVA 19', '', null, 12]) assert.throws(() => taxes.lireCode(v), (e) => e.statusCode === 400, JSON.stringify(v));
  assert.equal(taxes.lireTaux('19'), '19.000');
  assert.equal(taxes.lireTaux('1,5'), '1.500');
  assert.equal(taxes.lireTaux(0), '0.000');
  assert.equal(taxes.lireTaux('100'), '100.000');
  assert.equal(taxes.lireTaux('12.345'), '12.345');
  for (const v of ['101', '-1', 'x', '', null, undefined, '1.2345', {}, '19 %']) assert.throws(() => taxes.lireTaux(v), (e) => e.statusCode === 400, JSON.stringify(v));
  assert.equal(taxes.lireMontant('1'), '1.000');
  assert.equal(taxes.lireMontant('0,5'), '0.500');
  for (const v of ['0', '-1', 'x', '', null, '1234567', '1.2345']) assert.throws(() => taxes.lireMontant(v), (e) => e.statusCode === 400, JSON.stringify(v));
  assert.deepEqual(taxes.lireTauxMontant('fixe', { montant: '1', taux: '19' }), { taux: null, montant: '1.000' });
  assert.deepEqual(taxes.lireTauxMontant('ttc', { taux: '10', montant: '1' }), { taux: '10.000', montant: null });
  assert.throws(() => taxes.lireTauxMontant('fixe', { taux: '19' }), (e) => e.statusCode === 400, 'montant obligatoire');
  assert.throws(() => taxes.lireTauxMontant('ht', { montant: '1' }), (e) => e.statusCode === 400, 'taux obligatoire');
  assert.equal(taxes.lireType('retenue'), 'retenue');
  assert.throws(() => taxes.lireType('impot'), (e) => e.statusCode === 400);
  assert.equal(taxes.lireAssiette('tva'), 'tva');
  assert.throws(() => taxes.lireAssiette('brut'), (e) => e.statusCode === 400);
  assert.deepEqual(taxes.CHAMPS_FIGES, ['type', 'taux', 'montant', 'assiette']);
  assert.equal(taxes.taxeMouvementee.constructor.name, 'AsyncFunction', 'seul endroit à compléter à la saisie');
  assert.ok(taxes.SQL_TAXES.includes('t.taux::text AS taux, t.montant::text AS montant') && taxes.SQL_TAXES.includes('ORDER BY array_position($2::text[], t.type), t.id'), 'numériques en texte, tri par type');
  assert.ok(taxes.SQL_PAQUET_RESTANT.includes('NOT EXISTS (SELECT 1 FROM compta.taxes t WHERE t.dossier_id = $1 AND t.code = r.code)'));
  const t = taxes.presenterTaxe({
    id: 5, code: 'TIMBRE', libelle: 'Droit de timbre', type: 'timbre', taux: null, montant: '1.000', assiette: 'fixe', origine: 'paquet', code_tej: null, actif: true,
    compte_achat_id: 11, achat_numero: '6654', achat_libelle: 'Droits d\'enregistrement et de timbre', achat_nature: 'charges', achat_actif: true, achat_feuille: true,
    compte_vente_id: 12, vente_numero: '4375', vente_libelle: 'Droit de timbre collecté', vente_nature: 'etat', vente_actif: true, vente_feuille: true,
    compte_immo_id: null,
  });
  assert.deepEqual(t, {
    id: 5, code: 'TIMBRE', libelle: 'Droit de timbre', type: 'timbre', typeLibelle: 'Droit de timbre', taux: null, montant: '1.000', assiette: 'fixe', assietteLibelle: 'Montant fixe par facture',
    compteAchat: { id: 11, numero: '6654', libelle: 'Droits d\'enregistrement et de timbre', nature: 'charges', actif: true, feuille: true, imputable: true },
    compteVente: { id: 12, numero: '4375', libelle: 'Droit de timbre collecté', nature: 'etat', actif: true, feuille: true, imputable: true },
    compteImmo: null, origine: 'paquet', codeTej: null, actif: true,
  });
  const r = taxes.presenterCodePaquet({ code: 'TVASUSP', libelle: 'Achats en suspension de TVA', type: 'tva', taux: '0.000', montant: null, assiette: 'ht', compte_achat_numero: null, compte_vente_numero: null, compte_immo_numero: null, copie: 'exportateur', code_tej: null, note: 'n' });
  assert.deepEqual(r, { code: 'TVASUSP', libelle: 'Achats en suspension de TVA', type: 'tva', typeLibelle: 'TVA', taux: '0.000', montant: null, assiette: 'ht', assietteLibelle: 'Montant hors taxes', comptes: { achat: null, vente: null, immobilisations: null }, copie: 'exportateur', copieLibelle: 'Exportateur total', codeTej: null, note: 'n' });
  assert.equal(config.presenterCompteCourt({ id: 1, numero: '5321', libelle: 'x', nature: 'banque', actif: true, feuille: false }).imputable, false);
  assert.equal(config.presenterCompteCourt({ id: 1, numero: '53211', libelle: 'x', nature: 'banque', actif: true, feuille: true }).imputable, true);
});

test('routes S5b : lecture pour tout accès, neuf écritures sous la limite du plan, droits « configurer »', () => {
  const src = lire('src', 'compta', 'routes.js');
  for (const r of [
    "router.get('/dossiers/:dossierId/journaux', authenticate, journaux.lire);",
    "router.post('/dossiers/:dossierId/journaux', authenticate, limitePlan, journaux.creer);",
    "router.put('/dossiers/:dossierId/journaux/:journalId', authenticate, limitePlan, journaux.modifier);",
    "router.post('/dossiers/:dossierId/journaux/:journalId/desactiver', authenticate, limitePlan, journaux.desactiver);",
    "router.post('/dossiers/:dossierId/journaux/:journalId/reactiver', authenticate, limitePlan, journaux.reactiver);",
    "router.get('/dossiers/:dossierId/taxes', authenticate, taxes.lire);",
    "router.post('/dossiers/:dossierId/taxes', authenticate, limitePlan, taxes.ajouter);",
    "router.post('/dossiers/:dossierId/taxes/paquet', authenticate, limitePlan, taxes.ajouterDepuisPaquet);",
    "router.put('/dossiers/:dossierId/taxes/:taxeId', authenticate, limitePlan, taxes.modifier);",
    "router.post('/dossiers/:dossierId/taxes/:taxeId/desactiver', authenticate, limitePlan, taxes.desactiver);",
    "router.post('/dossiers/:dossierId/taxes/:taxeId/reactiver', authenticate, limitePlan, taxes.reactiver);",
  ]) assert.ok(src.includes(r), r);
  // « /taxes/paquet » est déclaré avant « /taxes/:taxeId » : pas d'ambiguïté (POST seulement, de toute façon).
  assert.ok(src.indexOf("'/dossiers/:dossierId/taxes/paquet'") < src.indexOf("'/dossiers/:dossierId/taxes/:taxeId'"));
  for (const f of ['lire', 'creer', 'modifier', 'desactiver', 'reactiver']) assert.equal(typeof journaux[f], 'function', `journaux.${f}`);
  for (const f of ['lire', 'ajouter', 'ajouterDepuisPaquet', 'modifier', 'desactiver', 'reactiver']) assert.equal(typeof taxes[f], 'function', `taxes.${f}`);
  // Chaque écriture : droits puis dossier non archivé, dans la transaction du dossier ; toutes rendent l'état complet.
  for (const [fichier, fonction, n] of [['journaux.js', 'ecritureJournaux', 4], ['taxes.js', 'ecritureTaxes', 5]]) {
    const ctrl = lire('src', 'compta', fichier);
    assert.ok(ctrl.includes("if (!droits(acces).configurer) throw erreur(403, MSG_CONFIGURER, 'NIVEAU_INSUFFISANT');\n  if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\\'abord', 'DOSSIER_ARCHIVE');"), fichier);
    assert.equal((ctrl.match(new RegExp(`await ${fonction}\\(req, async \\(db, acces, d\\) => \\{`, 'g')) || []).length, n, `${fichier} : ${n} écritures`);
    assert.ok(ctrl.includes('FOR UPDATE'), `${fichier} : relu sous verrou`);
  }
  const j = lire('src', 'compta', 'journaux.js');
  assert.ok(j.includes("throw erreur(409, 'Ce dossier a déjà son journal d\\'à-nouveaux', 'UN_SEUL_AN')"), 'réponse 4 du 08/10 : un seul à-nouveaux, les autres types libres');
  assert.ok(j.includes('if (await journalMouvemente(db, j.id)) throw erreur(409') && (j.match(/await journalMouvemente\(db, j\.id\)/g) || []).length === 2, 'hook sur le compte et la désactivation');
  const t = lire('src', 'compta', 'taxes.js');
  assert.ok(t.includes("if (change && t.origine !== 'ajout') throw erreur(409") && t.includes("'TAXE_PAQUET'"), 'un code du paquet garde type, taux, montant, assiette');
  assert.ok(t.includes("throw erreur(409, `${code} est un code du paquet : ajoutez-le depuis le paquet`, 'CODE_PAQUET')"));
  assert.ok((t.match(/await taxeMouvementee\(db, t\.id\)/g) || []).length === 2, 'hook sur les champs figés et la désactivation');
});

test('branchements : journaux et taxes naissent avec le dossier, la fiche les résume, un compte porté ne bouge plus', () => {
  for (const f of ['initialiserJournaux', 'assurerSousComptes', 'copierCodes', 'initialiserTaxes', 'initialiserJournauxEtTaxes', 'resumeConfiguration', 'choixComptes', 'compteDuDossier', 'codesDuPaquet']) assert.equal(typeof config[f], 'function', f);
  assert.equal(config.SQL_COPIE, "(r.copie = 'tous' OR (r.copie = 'assujetti' AND c.tva = 'reel') OR (r.copie = 'exportateur' AND c.exportateur_total))");
  const init = lire('src', 'compta', 'configDossier.js');
  assert.ok(init.includes("SELECT 1 FROM compta.journaux WHERE dossier_id = $1 LIMIT 1") && init.includes("SELECT 1 FROM compta.taxes WHERE dossier_id = $1 LIMIT 1"), 'idempotentes');
  assert.ok(init.includes("'journaux_initialises'") && init.includes("'taxes_initialisees'") && init.includes("propose: true"));
  assert.ok(init.includes("await assurerSousComptes(db, { dossierId, espaceId, paquetId, auteurId, details, numeros: refs.flatMap((r) => [r.compte_achat_numero, r.compte_vente_numero, r.compte_immo_numero]) });"), 'sous-comptes assurés avant la copie des codes');
  assert.ok(!init.includes("require('./dossiers')") && !init.includes("require('./planComptes')"), 'aucun cycle');
  const d = lire('src', 'compta', 'dossiers.js');
  const creer = d.slice(d.indexOf('const creer = async (req, res) => {'), d.indexOf('\n};\n', d.indexOf('const creer = async (req, res) => {')));
  assert.ok(creer.indexOf('await initialiserPlan(db,') < creer.indexOf('await initialiserJournauxEtTaxes(db, { dossierId: d.id, espaceId: acces.espace_id, auteurId: req.user.id, nom: d.nom });'), 'assistant : après le plan');
  const fiche = d.slice(d.indexOf('const presenterFiche = async (db, acces, d) => {'), d.indexOf('\n};\n', d.indexOf('const presenterFiche = async')));
  assert.ok(fiche.includes('resumeConfiguration(db, d.id),') && fiche.includes('\n    journaux: configuration.journaux,\n    taxes: configuration.taxes,\n'), 'résumé dans la fiche');
  const lab = lire('src', 'compta', 'dossierLabflow.js');
  assert.ok(lab.indexOf('await initialiserPlan(db,') < lab.indexOf('await initialiserJournauxEtTaxes(db, { dossierId: d.id, espaceId, auteurId, nom: d.nom });'), '« Mon entreprise » : après le plan');
  // S5a : compteUtilise devient réel (journaux et taxes), aux deux mêmes endroits (désactiver, supprimer).
  const ctrl = lire('src', 'compta', 'planComptes.js');
  assert.ok(ctrl.includes('SELECT 1 FROM compta.journaux WHERE compte_id = $1') && ctrl.includes('SELECT 1 FROM compta.taxes WHERE compte_achat_id = $1 OR compte_vente_id = $1 OR compte_immo_id = $1'));
  assert.equal((ctrl.match(/await compteUtilise\(db, c\.id\)/g) || []).length, 3, 'désactiver, supprimer et (S5c) changer la nature');
  assert.equal(typeof plan.lectureDossier, 'function');
  assert.equal(typeof plan.presenterDossier, 'function');
});
