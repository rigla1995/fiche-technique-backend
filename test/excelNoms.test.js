// Assainisseurs de noms des exports Excel (spec docs/lot-2b-spec.md §5.5, §11.1.4).
// Sans base de données : les exports sont appelés avec un faux pool qui répond le nom saisi et des lignes vides,
// et une fausse réponse qui valide chaque en-tête comme Node (http.validateHeaderValue, ERR_INVALID_CHAR).
//   node --test test/excelNoms.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { PassThrough } = require('node:stream');
const ExcelJS = require('exceljs');

let NOM = 'Labo Central';
const fauxPool = {
  query: async (sql) => {
    const texte = String(sql).replace(/\s+/g, ' ').trim();
    if (texte.startsWith('SELECT nom FROM labos WHERE id = $1')) return { rows: [{ nom: NOM }] };
    if (texte.startsWith('SELECT a.id, a.nom FROM activites a')) return { rows: [{ id: 7, nom: NOM }] };
    if (texte.startsWith('SELECT l.id FROM labos l JOIN profil_entreprise pe')) return { rows: [{ id: 3 }] };
    return { rows: [] };
  },
};
const cheminPool = require.resolve('../src/config/database');
require.cache[cheminPool] = { id: cheminPool, filename: cheminPool, loaded: true, exports: fauxPool, children: [], paths: [] };

const { ongletSur, nomFichierSur } = require('../src/utils/excelNoms');
const { nomOnglet } = require('../src/utils/vocab');

// ─── nomFichierSur ──────────────────────────────────────────────────────────

test('nomFichierSur : les noms acceptés aujourd\'hui ressortent à l\'identique', () => {
  for (const nom of ['Labo Central', 'Café & Co', 'Resto N°1', 'Pâtisserie « Élan »', "L'Atelier", 'A\tB', 'Labo (1) / [2]']) {
    assert.equal(nomFichierSur(nom), nom);
    assert.equal(nomFichierSur(nom), `${nom}`, 'même texte que l\'interpolation d\'avant');
  }
});

test('nomFichierSur : « Dar Yasmine — Salon » donne « Dar Yasmine - Salon »', () => {
  assert.equal(nomFichierSur('Dar Yasmine — Salon'), 'Dar Yasmine - Salon');
});

test('nomFichierSur : seuls les caractères refusés par Node et « " » deviennent « - »', () => {
  assert.equal(nomFichierSur('Le "Gourmet"'), 'Le -Gourmet-');
  assert.equal(nomFichierSur('Chez l’ami'), 'Chez l-ami');
  assert.equal(nomFichierSur('Épicerie نور'), 'Épicerie ---');
  assert.equal(nomFichierSur('Snack 🍔 Bar'), 'Snack - Bar', 'un emoji compte pour un seul caractère');
  assert.equal(nomFichierSur('a\nb\rc\x7Fd'), 'a-b-c-d');
  assert.equal(nomFichierSur(' °«»·ÿ'), ' °«»·ÿ', 'Latin-1 haut accepté par Node : inchangé');
});

test('nomFichierSur : l\'en-tête Content-Disposition passe la validation de Node', () => {
  for (const nom of ['Dar Yasmine — Salon', 'Épicerie نور', 'Snack 🍔 Bar', 'x\ny']) {
    const valeur = `attachment; filename="Inventaire-${nomFichierSur(nom)}.xlsx"`;
    assert.doesNotThrow(() => http.validateHeaderValue('Content-Disposition', valeur));
    assert.throws(() => http.validateHeaderValue('Content-Disposition', `attachment; filename="Inventaire-${nom}.xlsx"`),
      { code: 'ERR_INVALID_CHAR' }, `avant : ERR_INVALID_CHAR (500) pour « ${nom} »`);
  }
  // « " » est admis par Node mais fermerait filename="…" : il devient « - ».
  assert.equal(`attachment; filename="Inventaire-${nomFichierSur('Le "Gourmet"')}.xlsx"`, 'attachment; filename="Inventaire-Le -Gourmet-.xlsx"');
});

// ─── ongletSur ──────────────────────────────────────────────────────────────

test('ongletSur : nomOnglet dans un classeur vide (identique par défaut)', () => {
  const wb = new ExcelJS.Workbook();
  for (const texte of ['Inventaire Labo Central', 'Hist Appro Café & Co', 'Ventes', 'Inventaire Dar Yasmine — Salon']) {
    assert.equal(ongletSur(wb, texte), texte);
    assert.equal(ongletSur(wb, texte), nomOnglet(texte));
  }
});

test('ongletSur : caractères interdits remplacés par une espace, History, apostrophes de bord, 31 caractères', () => {
  const wb = new ExcelJS.Workbook();
  assert.equal(ongletSur(wb, 'Inventaire Labo 1/2'), 'Inventaire Labo 1 2');
  assert.equal(ongletSur(wb, 'Hist Appro A*B?C:D\\E[F]'), 'Hist Appro A B C D E F');
  assert.equal(ongletSur(wb, 'History'), 'Feuille');
  assert.equal(ongletSur(wb, "'Labo'"), 'Labo');
  const long = ongletSur(wb, 'Hist Transferts Laboratoire central de pâtisserie');
  assert.equal(long.length, 31);
  assert.equal(long, 'Hist Transferts Laboratoire cen');
});

test('ongletSur : suffixe « 2 », « 3 »… si le nom existe déjà, sans tenir compte de la casse', () => {
  const wb = new ExcelJS.Workbook();
  const a = ongletSur(wb, 'Ventes');
  wb.addWorksheet(a);
  const b = ongletSur(wb, 'VENTES');
  assert.equal(b, 'VENTES 2');
  wb.addWorksheet(b);
  const c = ongletSur(wb, 'ventes');
  assert.equal(c, 'ventes 3');
  assert.doesNotThrow(() => wb.addWorksheet(c));
  assert.throws(() => wb.addWorksheet('Ventes'), 'ExcelJS lève sur un doublon : d\'où le suffixe');
});

test('ongletSur : le suffixe tient dans 31 caractères, sans couper un emoji en deux', () => {
  const wb = new ExcelJS.Workbook();
  const texte = 'Hist Transferts Laboratoire central de pâtisserie';
  wb.addWorksheet(ongletSur(wb, texte));
  const deux = ongletSur(wb, texte);
  assert.equal(deux, 'Hist Transferts Laboratoire c 2');
  assert.equal(deux.length, 31);
  wb.addWorksheet(deux);
  // L'emoji occupe les unités 28 et 29 : une coupe à 29 laisserait sa première moitié.
  const emoji = 'Inventaire Snack Bar 1234567🍔9';
  assert.equal(emoji.length, 31);
  wb.addWorksheet(ongletSur(wb, emoji));
  const suite = ongletSur(wb, emoji);
  assert.equal(suite, 'Inventaire Snack Bar 1234567 2');
  assert.ok(!/[\uD800-\uDFFF]/.test(suite), 'aucune moitié de paire de substitution');
  wb.addWorksheet(suite);
  for (let i = 0; i < 12; i += 1) wb.addWorksheet(ongletSur(wb, 'Feuille'));
  assert.ok(wb.worksheets.map((ws) => ws.name).includes('Feuille 12'));
});

// ─── Exports à nom saisi (§11.1.4) ──────────────────────────────────────────

function fausseReponse() {
  const res = new PassThrough();
  res.resume();
  res.entetes = {};
  res.statusCode = 200;
  res.corps = null;
  res.setHeader = (nom, valeur) => {
    http.validateHeaderName(nom);
    http.validateHeaderValue(nom, valeur); // lève ERR_INVALID_CHAR comme la vraie réponse
    res.entetes[nom.toLowerCase()] = valeur;
  };
  res.getHeader = (nom) => res.entetes[nom.toLowerCase()];
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (corps) => { res.corps = corps; res.end(); return res; };
  return res;
}

async function exporter(handler, params, nom) {
  NOM = nom;
  const res = fausseReponse();
  const erreurs = [];
  const original = console.error;
  console.error = (...a) => { erreurs.push(a); };
  try {
    await handler({ params, query: {}, user: { id: 2, role: 'client' } }, res);
  } finally {
    console.error = original;
  }
  return { res, erreurs };
}

const inventaire = require('../src/controllers/inventaireController');
const labo = require('../src/controllers/laboController');
const pertes = require('../src/controllers/pertesController');

const EXPORTS = [
  ['Inventaire labo', () => inventaire.exportLaboInventaireExcel, { laboId: '3' }, (n) => `Inventaire-${n}.xlsx`],
  ['Inventaire activité', () => inventaire.exportActiviteInventaireExcel, { activiteId: '7' }, (n) => `Inventaire-${n}.xlsx`],
  ['Historique d\'appro labo', () => labo.exportLaboHistoriqueExcel, { laboId: '3' }, (n) => `Historique-Labo-${n}.xlsx`],
  ['Historique des transferts labo', () => labo.exportLaboTransferExcel, { laboId: '3' }, (n) => `Historique-Transferts-${n}.xlsx`],
  ['Historique des pertes labo', () => pertes.exportLaboPerteExcel, { laboId: '3' }, null],
];

for (const [libelle, handler, params, fichier] of EXPORTS) {
  test(`${libelle} : nom « Dar Yasmine — Salon » → 200, plus d'erreur (§11.1.4)`, async () => {
    assert.equal(typeof handler(), 'function', libelle);
    const { res, erreurs } = await exporter(handler(), params, 'Dar Yasmine — Salon');
    assert.deepEqual(erreurs, [], `aucune erreur journalisée : ${erreurs.map((e) => e.join(' ')).join(' | ')}`);
    assert.equal(res.statusCode, 200);
    assert.equal(res.corps, null, 'pas de corps JSON d\'erreur');
    const cd = res.getHeader('Content-Disposition');
    if (fichier) assert.equal(cd, `attachment; filename="${fichier('Dar Yasmine - Salon')}"`);
    else assert.match(cd, /^attachment; filename="Historique-Pertes-\d{4}-\d{2}-\d{2}\.xlsx"$/, 'seul l\'en-tête de buildExcelPertes reste');
  });

  test(`${libelle} : nom « Labo Central » → nom de fichier inchangé`, async () => {
    const { res, erreurs } = await exporter(handler(), params, 'Labo Central');
    assert.deepEqual(erreurs, []);
    assert.equal(res.statusCode, 200);
    const cd = res.getHeader('Content-Disposition');
    if (fichier) assert.equal(cd, `attachment; filename="${fichier('Labo Central')}"`);
    else assert.match(cd, /^attachment; filename="Historique-Pertes-\d{4}-\d{2}-\d{2}\.xlsx"$/);
  });
}
