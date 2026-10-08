// LabFlow Compta, étape S5c « Les tiers et les imports » (labflow-reprise/achats-compta/PLAN-S5.md §3.4, §4 « Imports » ;
// SPEC-SOCLE D18 : import Excel en TOUT-OU-RIEN). Outil commun des imports de LabFlow Compta (tiers : tiers.js ; plan de
// comptes : planComptes.js) : le modèle à la charte (excelBrandService, réutilisé sans modification — règle du projet),
// dont toutes les colonnes sont en TEXTE (un code « 0012 » reste « 0012 » dans Excel), et la lecture d'un classeur
// téléversé : première feuille, ligne d'en-têtes exacte (findHeaderRow), ligne d'exemple sautée, toutes les cellules lues
// comme du texte, lignes vides ignorées, borne de lignes. Le contrôle de toutes les lignes puis l'écriture en une seule
// transaction (ou rien) sont le fait de chaque import ; ici, la forme du rapport d'erreurs (une entrée par ligne fausse)
// et la réception du fichier (multer en mémoire, 5 Mo). Les trois imports de LabFlow (fournisseurs, acheteurs,
// référentiel : SAVEPOINT par ligne, import partiel) ne sont pas touchés (carto-infra §5).
const ExcelJS = require('exceljs');
const multer = require('multer');
const { erreur, repondreErreur } = require('./comptablesClient');
const { brandTemplate, findHeaderRow } = require('../services/excelBrandService');

// 2 000 lignes au plus par fichier (PLAN-S5 §4) ; 5 Mo (un classeur de 2 000 lignes pèse quelques centaines de Ko).
const LIGNES_MAX = 2000;
const FICHIER_MAX = 5 * 1024 * 1024;
const CHAMP_FICHIER = 'fichier';
const TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ── Réception ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Middleware : le fichier du champ « fichier », en mémoire ; un fichier trop gros ou une requête mal formée répondent 400
// (jamais 500), le contrôleur trouve req.file (ou rien : « Fichier requis »).
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: FICHIER_MAX, files: 1 } });
const televersement = (req, res, next) => upload.single(CHAMP_FICHIER)(req, res, (err) => {
  if (!err) return next();
  const trop = err.code === 'LIMIT_FILE_SIZE';
  return res.status(400).json({ message: trop ? 'Fichier trop volumineux : 5 Mo au plus' : 'Fichier illisible : envoyez un classeur Excel (.xlsx) dans le champ « fichier »', code: trop ? 'FICHIER_TROP_GROS' : 'FICHIER_ILLISIBLE' });
});

// ── Modèle ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// Classeur du modèle d'import : bandeau et en-têtes à la charte, une ligne d'exemple grisée (première cellule
// « Exemple : … », ignorée à l'import), colonnes en texte. → { wb, ws }.
const modeleClasseur = ({ feuille, titre, sousTitre = '', meta = '', enTetes, largeurs, exemple }) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(feuille);
  brandTemplate(wb, ws, { titre, sousTitre, meta, headers: enTetes, widths: largeurs, exemple });
  // Toutes les colonnes en texte : Excel garde « 0012 », « 71 000 000 » ou « 1234567A/A/M/000 » tels quels.
  for (let c = 1; c <= enTetes.length; c++) ws.getColumn(c).numFmt = '@';
  return { wb, ws };
};
// Envoie un classeur en pièce jointe.
const envoyerClasseur = async (res, wb, nomFichier) => {
  res.setHeader('Content-Type', TYPE_XLSX);
  res.setHeader('Content-Disposition', `attachment; filename="${nomFichier}"`);
  await wb.xlsx.write(res);
  res.end();
};

// ── Lecture ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// Le texte d'une cellule, quel que soit son type : vide → '' ; texte enrichi → concaténé ; nombre → ses chiffres ;
// date → AAAA-MM-JJ ; formule (simple ou partagée) → son résultat ; lien → son texte (simple ou enrichi) ; le reste par
// `text` d'ExcelJS. Espaces rognés, jamais de valeur numérique.
const texteEnrichi = (r) => r.map((x) => x.text || '').join('').trim();
const texteCellule = (cell) => {
  let v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && v !== null && ('formula' in v || 'sharedFormula' in v)) v = v.result ?? '';
  if (v == null) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return texteEnrichi(v.richText);
    if ('text' in v) {
      if (typeof v.text === 'string') return v.text.trim();
      if (v.text && Array.isArray(v.text.richText)) return texteEnrichi(v.text.richText);
    }
    if ('error' in v) return '';
    return String(cell.text || '').trim();
  }
  return String(v).trim();
};
// La ligne d'exemple du modèle : première cellule « Exemple : … » (deux-points obligatoires : un code « EXEMPLE » reste un code).
const estLigneExemple = (row) => /^exemple\s*:/i.test(texteCellule(row.getCell(1)));

// Lit un classeur téléversé : → [{ ligne (numéro Excel), cellules: [texte par colonne] }], lignes vides écartées.
// Refus (400, code) : fichier illisible, classeur vide, en-têtes introuvables, aucune ligne, trop de lignes.
const lireClasseur = async (buffer, { enTetes, max = LIGNES_MAX }) => {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buffer);
  } catch (e) {
    throw erreur(400, 'Fichier illisible : envoyez un classeur Excel (.xlsx)', 'FICHIER_ILLISIBLE');
  }
  const ws = wb.worksheets[0];
  if (!ws || ws.rowCount === 0) throw erreur(400, 'Classeur vide', 'FICHIER_VIDE');
  const enTete = findHeaderRow(ws, enTetes);
  if (!enTete) throw erreur(400, `En-têtes introuvables : la première feuille doit porter sur une même ligne ${enTetes.map((h) => `« ${h} »`).join(', ')} — partez du modèle téléchargeable`, 'EN_TETES');
  const lignes = [];
  ws.eachRow((row, n) => {
    if (n <= enTete || estLigneExemple(row)) return;
    const cellules = enTetes.map((_, i) => texteCellule(row.getCell(i + 1)));
    if (cellules.every((c) => c === '')) return;
    lignes.push({ ligne: n, cellules });
  });
  if (!lignes.length) throw erreur(400, 'Aucune ligne à importer sous les en-têtes', 'AUCUNE_LIGNE');
  if (lignes.length > max) throw erreur(400, `${max} lignes au plus par fichier (${lignes.length} lues) : découpez le fichier`, 'TROP_DE_LIGNES');
  return lignes;
};

// ── Rapport ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// L'erreur d'un import refusé (D18 : rien n'est écrit) : 400, code IMPORT_ERREURS, une entrée par ligne fausse
// ({ ligne, repere, erreurs: [] }), le nombre de lignes lues et de lignes fausses.
const erreurImport = (lignesFausses, nbLignes) => Object.assign(
  erreur(400, `${lignesFausses.length} ligne${lignesFausses.length > 1 ? 's' : ''} en erreur sur ${nbLignes} : rien n'a été importé, corrigez le fichier`, 'IMPORT_ERREURS'),
  { lignes: lignesFausses, nbLignes, nbErreurs: lignesFausses.length }
);
// Réponse d'un import : le rapport ligne par ligne quand il existe, sinon l'erreur ordinaire.
const repondreImport = (res, err, journal) => {
  if (err.statusCode === 400 && Array.isArray(err.lignes)) return res.status(400).json({ message: err.message, code: err.code, lignes: err.lignes, nbLignes: err.nbLignes, nbErreurs: err.nbErreurs });
  return repondreErreur(res, err, journal);
};

// Nom de fichier téléversé, rendu sûr pour le journal (80 caractères, imprimables seulement).
const nomFichier = (file) => String(file?.originalname || 'fichier.xlsx').normalize('NFC').replace(/[^\x20-\x7E -ÿ]/g, '?').slice(0, 80);
// Le jour, pour les explications et les en-têtes (heure de Tunis).
const jourTunis = () => new Date().toLocaleDateString('fr-FR', { timeZone: 'Africa/Tunis' });

module.exports = { LIGNES_MAX, FICHIER_MAX, CHAMP_FICHIER, TYPE_XLSX, televersement, modeleClasseur, envoyerClasseur, texteCellule, estLigneExemple, lireClasseur, erreurImport, repondreImport, nomFichier, jourTunis };
