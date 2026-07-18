const fs = require('fs');
const path = require('path');

// Charte Excel LabFlow — TOUS les exports Excel du produit passent par ces
// helpers pour partager exactement la même identité : bandeau sombre avec le
// logo, filet dégradé sky→indigo→violet (signature de la marque, cf. les PDF
// de generate.js), en-têtes indigo, zébrage, lignes sélectionnées ambre,
// total en bande indigo pâle, pied de page. Le pendant frontend est
// src/services/excelBrand.ts (les deux doivent rester alignés).

const LOGO_PNG = fs.readFileSync(path.join(__dirname, '../assets/logo-email.png'));

// Couleurs ARGB (préfixe FF = opaque) — palette de la charte PDF generate.js
const BRAND = {
  deep: 'FF1E1B4B',        // bandeau (indigo très sombre)
  deepSub: 'FFC7CCE8',     // sous-titre sur bandeau
  indigo: 'FF4338CA',      // en-têtes de colonnes
  indigoSoft: 'FFEEF2FF',  // bande de total
  indigoInk: 'FF312E81',   // texte de total
  grad: ['0EA5E9', '6366F1', 'A855F7'], // filet dégradé (hex sans alpha)
  ink: 'FF1E293B',
  muted: 'FF64748B',
  faint: 'FF94A3B8',
  hair: 'FFE2E8F0',
  panel: 'FFF8FAFC',
  amber: 'FFFDF3D7',       // ligne sélectionnée
  amberInk: 'FF92400E',
};

const FMT_DT = '#,##0.000 "DT"';
const FMT_QTE = '#,##0.###';

const thin = { style: 'thin', color: { argb: BRAND.hair } };
const BORDER = { top: thin, left: thin, bottom: thin, right: thin };

// Interpolation du filet dégradé (deux segments, pivot 52 % comme le logo)
const lerpHex = (a, b, t) => {
  const c = (i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t)
    .toString(16).padStart(2, '0');
  return (c(0) + c(2) + c(4)).toUpperCase();
};
const gradColorAt = (t) => {
  const [s, m, v] = BRAND.grad;
  return 'FF' + (t <= 0.52 ? lerpHex(s, m, t / 0.52) : lerpHex(m, v, (t - 0.52) / 0.48));
};

const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });

// Bandeau de marque : logo + titre (ligne 1), sous-titre (2), filet dégradé (3),
// méta (4), espace (5). Renvoie l'index (1-based) où poser les en-têtes = 6.
function brandHeader(wb, ws, { titre, sousTitre = '', meta = '', colCount }) {
  ws.mergeCells(1, 1, 1, colCount);
  const t = ws.getCell(1, 1);
  t.value = titre;
  t.fill = fill(BRAND.deep);
  t.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
  t.alignment = { horizontal: 'left', vertical: 'middle', indent: 20 };
  ws.getRow(1).height = 44;

  ws.mergeCells(2, 1, 2, colCount);
  const s = ws.getCell(2, 1);
  s.value = sousTitre;
  s.fill = fill(BRAND.deep);
  s.font = { name: 'Calibri', size: 10, color: { argb: BRAND.deepSub } };
  s.alignment = { horizontal: 'left', vertical: 'top', indent: 20 };
  ws.getRow(2).height = 20;

  // Logo blanc posé sur le bandeau (l'image chevauche les lignes 1-2)
  const imgId = wb.addImage({ buffer: LOGO_PNG, extension: 'png' });
  ws.addImage(imgId, { tl: { col: 0.15, row: 0.45 }, ext: { width: 128, height: 32 }, editAs: 'absolute' });

  // Filet dégradé — signature visuelle de la marque
  const rule = ws.getRow(3);
  rule.height = 4.5;
  for (let c = 1; c <= colCount; c++) {
    ws.getCell(3, c).fill = fill(gradColorAt(colCount > 1 ? (c - 1) / (colCount - 1) : 0));
  }

  ws.mergeCells(4, 1, 4, colCount);
  const m = ws.getCell(4, 1);
  m.value = meta;
  m.font = { name: 'Calibri', size: 9, italic: true, color: { argb: BRAND.muted } };
  m.alignment = { horizontal: 'left', vertical: 'middle' };
  ws.getRow(4).height = 16;
  ws.getRow(5).height = 6;
  return 6;
}

// En-têtes de colonnes (indigo, blanc gras) ; widths optionnel (mêmes index)
function headerRow(ws, rowIdx, labels, { widths } = {}) {
  const row = ws.getRow(rowIdx);
  labels.forEach((label, i) => {
    const cell = row.getCell(i + 1);
    cell.value = label;
    cell.fill = fill(BRAND.indigo);
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = BORDER;
    if (widths && widths[i]) ws.getColumn(i + 1).width = widths[i];
  });
  row.height = 22;
  return row;
}

// Ligne de données : zébrage + surbrillance ambre des lignes sélectionnées
function dataRowStyle(row, { index = 0, selected = false, colCount } = {}) {
  const n = colCount || row.cellCount;
  for (let c = 1; c <= n; c++) {
    const cell = row.getCell(c);
    cell.border = BORDER;
    if (selected) {
      cell.fill = fill(BRAND.amber);
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: BRAND.amberInk } };
    } else {
      if (index % 2 === 1) cell.fill = fill(BRAND.panel);
      cell.font = { name: 'Calibri', size: 10, color: { argb: BRAND.ink } };
    }
  }
}

// Bande de total (indigo pâle, gras, filet supérieur)
function totalRowStyle(row, { colCount } = {}) {
  const n = colCount || row.cellCount;
  for (let c = 1; c <= n; c++) {
    const cell = row.getCell(c);
    cell.fill = fill(BRAND.indigoSoft);
    cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: BRAND.indigoInk } };
    cell.border = { ...BORDER, top: { style: 'medium', color: { argb: BRAND.indigo } } };
  }
  row.height = 20;
}

// Pied de page discret + gel des volets + filtre automatique
function brandFooter(ws, colCount) {
  const r = ws.rowCount + 2;
  ws.mergeCells(r, 1, r, colCount);
  const cell = ws.getCell(r, 1);
  cell.value = 'Généré par LabFlow · labflow-tn.com';
  cell.font = { name: 'Calibri', size: 8.5, italic: true, color: { argb: BRAND.faint } };
  cell.alignment = { horizontal: 'right' };
}

function finalize(ws, { headerRowIdx, colCount, lastDataRow, autoFilter = true }) {
  ws.views = [{ state: 'frozen', ySplit: headerRowIdx }];
  if (autoFilter && lastDataRow > headerRowIdx) {
    ws.autoFilter = { from: { row: headerRowIdx, column: 1 }, to: { row: lastDataRow, column: colCount } };
  }
}

module.exports = { BRAND, FMT_DT, FMT_QTE, BORDER, fill, brandHeader, headerRow, dataRowStyle, totalRowStyle, brandFooter, finalize };
