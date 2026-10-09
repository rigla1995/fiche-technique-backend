// Étape F1 (factures fournisseur, labflow-reprise/achats-compta/PLAN-FACTURES.md) : pièces jointes, contrôle des données
// d'une facture d'approvisionnement enregistrée d'un seul coup, stockage local. Sans base de données.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const P = require('../src/services/piecesFacture');
const F = require('../src/services/facturesAppro');
const { lireDonnees } = require('../src/controllers/approFactureController');
const stockage = require('../src/services/stockageFichiers');

const remplir = (debut, taille = 64) => Buffer.concat([debut, Buffer.alloc(Math.max(0, taille - debut.length), 0x20)]);
const ftyp = (marque, compatibles = []) => {
  const corps = Buffer.concat([Buffer.from(marque, 'latin1'), Buffer.alloc(4), ...compatibles.map((m) => Buffer.from(m, 'latin1'))]);
  const taille = Buffer.alloc(4);
  taille.writeUInt32BE(8 + corps.length);
  return remplir(Buffer.concat([taille, Buffer.from('ftyp', 'latin1'), corps]));
};
const PDF = remplir(Buffer.from('%PDF-1.7\n'));
const JPEG = remplir(Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
const PNG = remplir(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
const WEBP = remplir(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]));

test('detecterType : le type se lit sur le contenu, jamais sur le nom', () => {
  assert.strictEqual(P.detecterType(PDF), 'application/pdf');
  assert.strictEqual(P.detecterType(JPEG), 'image/jpeg');
  assert.strictEqual(P.detecterType(PNG), 'image/png');
  assert.strictEqual(P.detecterType(WEBP), 'image/webp');
  assert.strictEqual(P.detecterType(ftyp('heic', ['mif1', 'heic'])), 'image/heic');
  assert.strictEqual(P.detecterType(ftyp('mif1', ['heic'])), 'image/heic', 'marque compatible heic');
  assert.strictEqual(P.detecterType(ftyp('mif1', ['miaf'])), 'image/heif');
  assert.strictEqual(P.detecterType(ftyp('avif', ['mif1', 'miaf'])), 'image/avif');
  assert.strictEqual(P.detecterType(ftyp('isom', ['mp41'])), null, 'une vidéo MP4 est refusée');
  assert.strictEqual(P.detecterType(remplir(Buffer.from('<html><script>'))), null);
  assert.strictEqual(P.detecterType(remplir(Buffer.from('<svg xmlns='))), null);
  assert.strictEqual(P.detecterType(Buffer.from('%PDF')), null, 'trop court');
  assert.strictEqual(P.detecterType(null), null);
});

test('nomSur : décode le nom reçu en latin1, retire chemin et caractères de contrôle, borne à 200', () => {
  const recu = Buffer.from('Facture été.pdf', 'utf8').toString('latin1');
  assert.strictEqual(P.nomSur(recu), 'Facture été.pdf');
  assert.strictEqual(P.nomSur('C:\\Users\\x\\scan.jpg'), 'scan.jpg');
  assert.strictEqual(P.nomSur('../../etc/passwd'), 'passwd');
  assert.strictEqual(P.nomSur(`a${String.fromCharCode(0)}b${String.fromCharCode(10)}.pdf`), 'ab.pdf');
  assert.strictEqual(P.nomSur(''), 'facture');
  assert.strictEqual(P.nomSur(`${'x'.repeat(250)}.pdf`).length, 200);
  assert.ok(P.nomSur(`${'x'.repeat(250)}.pdf`).endsWith('.pdf'), 'l\'extension est gardée');
});

const fichier = (octets, nom = 'f.bin') => ({ buffer: octets, originalname: nom });

test('preparer : types admis, empreinte, copie JPEG d\'une photo HEIC seulement', () => {
  const heic = ftyp('heic');
  const r = P.preparer({ pieces: [fichier(PDF, 'a.pdf'), fichier(heic, 'IMG.HEIC')], apercus: [fichier(JPEG, 'apercu.jpg')] }, [1]);
  assert.strictEqual(r.length, 2);
  assert.deepStrictEqual(r.map((x) => [x.type, x.ext, x.nom]), [['application/pdf', 'pdf', 'a.pdf'], ['image/heic', 'heic', 'IMG.HEIC']]);
  assert.strictEqual(r[0].empreinte.length, 64);
  assert.strictEqual(r[0].apercu, null);
  assert.ok(Buffer.isBuffer(r[1].apercu));
  const code = (fn) => { try { fn(); return null; } catch (e) { return e.code; } };
  assert.strictEqual(code(() => P.preparer({ pieces: [fichier(remplir(Buffer.from('MZ')), 'x.exe')] })), 'TYPE_REFUSE');
  assert.strictEqual(code(() => P.preparer({ pieces: [fichier(Buffer.alloc(0))] })), 'FICHIER_VIDE');
  assert.strictEqual(code(() => P.preparer({ pieces: [fichier(PDF)], apercus: [fichier(JPEG)] }, [0])), 'APERCU_SANS_ORIGINAL', 'pas de copie pour un PDF');
  assert.strictEqual(code(() => P.preparer({ pieces: [fichier(heic)], apercus: [fichier(JPEG)] }, [])), 'APERCU_SANS_ORIGINAL');
  assert.strictEqual(code(() => P.preparer({ pieces: [fichier(heic)], apercus: [fichier(PNG)] }, [0])), 'APERCU_ILLISIBLE');
  assert.strictEqual(code(() => P.preparer({ pieces: [fichier(heic)], apercus: [fichier(JPEG), fichier(JPEG)] }, [0, 0])), 'APERCU_SANS_ORIGINAL', 'deux copies pour une photo');
  assert.deepStrictEqual(P.preparer({}, []), []);
});

const donnees = (modif = {}) => JSON.stringify({
  cible: { type: 'activite', id: 3 }, dateAppro: '2026-10-01', fournisseurId: 7, refFacture: ' FA 12 ',
  timbreFiscal: true, lignes: [{ articleId: 5, quantite: '2.5', prixUnitaire: 4, tauxTva: 19 }, { articleId: 6, quantite: 1, prixUnitaire: '0.75' }],
  ...modif,
});

test('lireDonnees : valeurs propres d\'une facture valide', () => {
  const v = lireDonnees(donnees());
  assert.strictEqual(v.type, 'activite');
  assert.strictEqual(v.cibleId, 3);
  assert.strictEqual(v.ref, 'FA 12', 'numéro rogné');
  assert.strictEqual(v.timbre, true);
  assert.deepStrictEqual(v.lignes, [{ articleId: 5, quantite: 2.5, prixUnitaire: 4, tva: 19 }, { articleId: 6, quantite: 1, prixUnitaire: 0.75, tva: 0 }]);
  assert.strictEqual(v.confirmerDoublon, false);
  assert.strictEqual(lireDonnees(donnees({ fournisseurId: null })).fournisseurId, null);
});

test('lireDonnees : refus codés', () => {
  const code = (d) => { try { lireDonnees(d); return null; } catch (e) { return e.corps.code; } };
  assert.strictEqual(code('{pas du json'), 'DONNEES_ILLISIBLES');
  assert.strictEqual(code(donnees({ cible: { type: 'client', id: 1 } })), 'CIBLE_INVALIDE');
  assert.strictEqual(code(donnees({ cible: { type: 'labo', id: -1 } })), 'CIBLE_INVALIDE');
  assert.strictEqual(code(donnees({ dateAppro: '2026-02-30' })), 'DATE_INVALIDE');
  assert.strictEqual(code(donnees({ dateAppro: '2999-01-01' })), 'DATE_INVALIDE', 'pas de date à venir');
  assert.strictEqual(code(donnees({ refFacture: '   ' })), 'REF_REQUISE');
  assert.strictEqual(code(donnees({ refFacture: 'x'.repeat(101) })), 'REF_TROP_LONGUE');
  assert.strictEqual(code(donnees({ fournisseurId: 'abc' })), 'FOURNISSEUR_INVALIDE');
  assert.strictEqual(code(donnees({ lignes: [] })), 'LIGNES_REQUISES');
  assert.strictEqual(code(donnees({ lignes: Array.from({ length: 301 }, () => ({ articleId: 1, quantite: 1, prixUnitaire: 1 })) })), 'TROP_DE_LIGNES');
  for (const l of [{ articleId: 0, quantite: 1, prixUnitaire: 1 }, { articleId: 1, quantite: 0, prixUnitaire: 1 },
    { articleId: 1, quantite: 1, prixUnitaire: 0 }, { articleId: 1, quantite: 1, prixUnitaire: 1, tauxTva: 120 },
    { articleId: 1, quantite: 'NaN', prixUnitaire: 1 }, { articleId: 1, quantite: 1e9, prixUnitaire: 1 }]) {
    assert.strictEqual(code(donnees({ lignes: [l] })), 'LIGNE_INVALIDE', JSON.stringify(l));
  }
});

test('numéro de facture normalisé : majuscules, sans espaces (même règle que l\'index SQL)', () => {
  assert.strictEqual(F.refNormalisee(' fa 12\t-3 '), 'FA12-3');
  assert.strictEqual(F.SQL_REF_NORMALISEE('f.ref_facture'), "UPPER(REGEXP_REPLACE(f.ref_facture, '\\s', '', 'g'))");
  const migration = fs.readFileSync(path.join(__dirname, '..', 'migrations', '221_factures_pieces.sql'), 'utf8');
  assert.ok(migration.includes(F.SQL_REF_NORMALISEE('ref_facture')), 'l\'index de la 221 porte la même expression');
});

test('périmètre du gérant : agir sur ses activités et labos, voir aussi les cessions de ses labos', () => {
  const gerant = { user: { role: 'gerant', gerantActiviteIds: [1], gerantLaboIds: [9] } };
  const client = { user: { role: 'client' } };
  assert.ok(F.gerantAgitSur(client, { activite_id: 99 }));
  assert.ok(F.gerantAgitSur(gerant, { activite_id: 1, labo_id: null }));
  assert.ok(!F.gerantAgitSur(gerant, { activite_id: 2, labo_id: null }));
  assert.ok(F.gerantAgitSur(gerant, { activite_id: null, labo_id: 9 }));
  assert.ok(!F.gerantAgitSur(gerant, { activite_id: null, labo_id: null }));
  assert.ok(F.gerantVoit(gerant, { activite_id: 2, labo_id: null, labo_emetteur_id: 9 }), 'cession émise par son labo');
  assert.ok(!F.gerantVoit(gerant, { activite_id: 2, labo_id: null, labo_emetteur_id: 8 }));
  const params = [1];
  assert.strictEqual(F.clauseGerant(client, params), '');
  const clause = F.clauseGerant(gerant, params);
  assert.deepStrictEqual(params, [1, [1], [9]]);
  assert.match(clause, /f\.activite_id = ANY\(\$2::int\[\]\)/);
  assert.match(clause, /f\.labo_id = ANY\(\$3::int\[\]\)/);
  const vide = [];
  F.clauseGerant({ user: { role: 'gerant', gerantActiviteIds: [], gerantLaboIds: [] } }, vide);
  assert.deepStrictEqual(vide, [[-1], [-1]], 'un gérant sans affectation ne lit rien');
});

test('stockage : absent sans réglage, local dans un dossier, clés fabriquées sûres', async (t) => {
  const garde = {};
  for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'STOCKAGE_LOCAL']) { garde[k] = process.env[k]; delete process.env[k]; }
  t.after(() => { for (const [k, v] of Object.entries(garde)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } stockage.reinitialiser(); });
  stockage.reinitialiser();
  assert.strictEqual(stockage.mode(), 'absent');
  assert.strictEqual(stockage.disponible(), false);
  await assert.rejects(stockage.deposer('clients/1/pieces/a.pdf', PDF, 'application/pdf'), (e) => e.code === 'STOCKAGE_ABSENT');

  process.env.R2_ACCOUNT_ID = 'a'; process.env.R2_ACCESS_KEY_ID = 'b'; process.env.R2_SECRET_ACCESS_KEY = 'c';
  stockage.reinitialiser();
  assert.strictEqual(stockage.mode(), 'absent', 'R2 incomplet (compartiment manquant) : rien');
  process.env.R2_BUCKET = 'labflow-pieces';
  stockage.reinitialiser();
  assert.strictEqual(stockage.mode(), 'r2');
  for (const k of ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET']) delete process.env[k];

  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), 'labflow-f1-'));
  t.after(() => fs.rmSync(dossier, { recursive: true, force: true }));
  process.env.STOCKAGE_LOCAL = dossier;
  stockage.reinitialiser();
  assert.strictEqual(stockage.mode(), 'local');
  const cle = stockage.nouvelleCle(12, 'pdf');
  assert.match(cle, /^clients\/12\/pieces\/\d{4}\/\d{2}\/[0-9a-f-]{36}\.pdf$/);
  assert.match(stockage.nouvelleCle(12, 'jpg', '-apercu'), /-apercu\.jpg$/);
  await stockage.deposer(cle, PDF, 'application/pdf');
  assert.ok((await stockage.lire(cle)).equals(PDF));
  await assert.rejects(stockage.deposer(cle, PDF, 'application/pdf'), /EEXIST/, 'jamais d\'écrasement silencieux');
  await stockage.supprimer(cle);
  assert.strictEqual(await stockage.lire(cle), null);
  await stockage.supprimer(cle); // déjà effacé : sans erreur
  for (const mauvaise of ['../x.pdf', 'clients/1/../../x', '/abs.pdf', 'Clients/1/X.PDF', 'a//b']) {
    await assert.rejects(stockage.lire(mauvaise), (e) => e.code === 'CLE_REFUSEE', mauvaise);
  }
  await stockage.supprimerSansErreur([null, 'clients/1/absent.pdf'], 'essai');
});
