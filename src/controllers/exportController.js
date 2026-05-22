const ExcelJS = require('exceljs');
const pool = require('../config/database');
const { calculerCout, calculerCoutAvecPrixMap, buildDpPriceMap, buildMpPriceMap } = require('./produitsController');

function fillFtWorksheet(sheet, coutData, ftMode, ftDate, actId, activityInfo, pricingLabel) {
  sheet.columns = [
    { width: 35 },
    { width: 12 },
    { width: 12 },
    { width: 14 },
    { width: 14 },
  ];

  const COLORS = {
    headerBg: '1F3864', headerFg: 'FFFFFF',
    sectionBg: 'D9E1F2', sectionFg: '1F3864',
    subBg: 'EEF2FA', totalBg: 'FFD700', totalFg: '000000',
    borderColor: 'B8CCE4', altRow: 'F5F8FF',
  };

  const headerFont = { name: 'Calibri', bold: true, size: 11, color: { argb: COLORS.headerFg } };
  const bodyFont = { name: 'Calibri', size: 10 };
  const boldFont = { name: 'Calibri', bold: true, size: 10 };
  const thin = { style: 'thin', color: { argb: COLORS.borderColor } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const centerAlign = { horizontal: 'center', vertical: 'middle' };
  const rightAlign = { horizontal: 'right', vertical: 'middle' };

  let hdr = 1;

  sheet.mergeCells(`A${hdr}:E${hdr}`);
  const titleCell = sheet.getCell(`A${hdr}`);
  titleCell.value = 'FICHE TECHNIQUE';
  titleCell.font = { name: 'Calibri', bold: true, size: 16, color: { argb: COLORS.headerFg } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
  titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
  titleCell.border = border;
  sheet.getRow(hdr).height = 30;
  hdr++;

  sheet.mergeCells(`A${hdr}:E${hdr}`);
  const produitCell = sheet.getCell(`A${hdr}`);
  produitCell.value = coutData.produit.toUpperCase();
  produitCell.font = { name: 'Calibri', bold: true, size: 13, color: { argb: COLORS.headerFg } };
  produitCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2E5597' } };
  produitCell.alignment = { horizontal: 'center', vertical: 'middle' };
  produitCell.border = border;
  sheet.getRow(hdr).height = 24;
  hdr++;

  let rowIndex = hdr;
  if (activityInfo && actId) {
    sheet.mergeCells(`A${hdr}:E${hdr}`);
    const ctxCell = sheet.getCell(`A${hdr}`);
    ctxCell.value = `Activité : ${activityInfo.nom}`;
    ctxCell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: 'FFFFFF' } };
    ctxCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '3A6BBF' } };
    ctxCell.alignment = { horizontal: 'center', vertical: 'middle' };
    ctxCell.border = border;
    sheet.getRow(hdr).height = 18;
    rowIndex = hdr + 1;
  }

  const colHeaders = ['Désignation', 'Portion', 'Unité', 'Prix Unit. (DT)', 'Coût (DT)'];
  const headerRow = sheet.getRow(rowIndex);
  colHeaders.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1);
    cell.value = h;
    cell.font = headerFont;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    cell.alignment = i === 0 ? { horizontal: 'left', vertical: 'middle' } : centerAlign;
    cell.border = border;
  });
  headerRow.height = 20;
  rowIndex++;

  const addSectionHeader = (label) => {
    sheet.mergeCells(`A${rowIndex}:E${rowIndex}`);
    const cell = sheet.getCell(`A${rowIndex}`);
    cell.value = `  ${label}`;
    cell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: COLORS.sectionFg } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.sectionBg } };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
    cell.border = border;
    sheet.getRow(rowIndex).height = 18;
    rowIndex++;
  };

  const addIngredientRow = (ing, isAlt = false) => {
    const row = sheet.getRow(rowIndex);
    row.getCell(1).value = `    ${ing.nom}`;
    row.getCell(2).value = ing.portion;
    row.getCell(3).value = ing.unite;
    row.getCell(4).value = ing.prix_unitaire;
    row.getCell(5).value = ing.cout;
    [1, 2, 3, 4, 5].forEach((col) => {
      const c = row.getCell(col);
      c.font = bodyFont;
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isAlt ? COLORS.altRow : 'FFFFFF' } };
      c.border = border;
      if (col === 1) c.alignment = { horizontal: 'left', vertical: 'middle' };
      else if (col === 3) c.alignment = centerAlign;
      else c.alignment = rightAlign;
    });
    row.getCell(4).numFmt = '#,##0.000 "DT"';
    row.getCell(5).numFmt = '#,##0.000 "DT"';
    row.getCell(2).numFmt = '#,##0.000';
    sheet.getRow(rowIndex).height = 16;
    rowIndex++;
  };

  const addCategorySubHeader = (label) => {
    sheet.mergeCells(`A${rowIndex}:E${rowIndex}`);
    const cell = sheet.getCell(`A${rowIndex}`);
    cell.value = `    🏷️ ${label}`;
    cell.font = { name: 'Calibri', bold: true, size: 9, color: { argb: '2E5597' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'EEF2FA' } };
    cell.alignment = { horizontal: 'left', vertical: 'middle' };
    cell.border = border;
    sheet.getRow(rowIndex).height = 15;
    rowIndex++;
  };

  if (coutData.ingredients.length > 0) {
    addSectionHeader('INGRÉDIENTS');
    const ingByCategory = {};
    coutData.ingredients.forEach((ing) => {
      const cat = ing.categorie || 'Sans catégorie';
      if (!ingByCategory[cat]) ingByCategory[cat] = [];
      ingByCategory[cat].push(ing);
    });
    const sortedCats = Object.keys(ingByCategory).sort((a, b) => {
      if (a === 'Sans catégorie') return 1;
      if (b === 'Sans catégorie') return -1;
      return a.localeCompare(b, 'fr');
    });
    sortedCats.forEach((cat) => {
      addCategorySubHeader(cat);
      ingByCategory[cat].forEach((ing, i) => addIngredientRow(ing, i % 2 === 1));
    });
  }

  const renderSousProduit = (sp, depth = 0) => {
    const indent = '    '.repeat(depth + 1);
    sheet.mergeCells(`A${rowIndex}:D${rowIndex}`);
    const labelCell = sheet.getCell(`A${rowIndex}`);
    labelCell.value = `${indent}↳ ${sp.nom} (portion: ${sp.portion})`;
    labelCell.font = { name: 'Calibri', bold: true, size: 10, color: { argb: COLORS.sectionFg } };
    labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subBg } };
    labelCell.alignment = { horizontal: 'left', vertical: 'middle' };
    labelCell.border = border;
    const coutCell = sheet.getCell(`E${rowIndex}`);
    coutCell.value = sp.cout;
    coutCell.font = boldFont;
    coutCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.subBg } };
    coutCell.alignment = rightAlign;
    coutCell.numFmt = '#,##0.000 "DT"';
    coutCell.border = border;
    sheet.getRow(rowIndex).height = 16;
    rowIndex++;
    sp.details.ingredients.forEach((ing, i) => {
      const row = sheet.getRow(rowIndex);
      row.getCell(1).value = `${indent}    ${ing.nom}`;
      row.getCell(2).value = ing.portion;
      row.getCell(3).value = ing.unite;
      row.getCell(4).value = ing.prix_unitaire;
      row.getCell(5).value = ing.cout;
      [1, 2, 3, 4, 5].forEach((col) => {
        const c = row.getCell(col);
        c.font = { ...bodyFont, color: { argb: '555555' } };
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 === 0 ? 'F9FBFF' : 'F0F4FF' } };
        c.border = border;
        if (col === 1) c.alignment = { horizontal: 'left', vertical: 'middle' };
        else if (col === 3) c.alignment = centerAlign;
        else c.alignment = rightAlign;
      });
      row.getCell(4).numFmt = '#,##0.000 "DT"';
      row.getCell(5).numFmt = '#,##0.000 "DT"';
      row.getCell(2).numFmt = '#,##0.000';
      sheet.getRow(rowIndex).height = 15;
      rowIndex++;
    });
    sp.details.sous_produits.forEach((ssp) => renderSousProduit(ssp, depth + 1));
  };

  if (coutData.sous_produits.length > 0) {
    addSectionHeader('PRODUITS UTILISABLES');
    coutData.sous_produits.forEach((sp) => renderSousProduit(sp));
  }

  sheet.mergeCells(`A${rowIndex}:E${rowIndex}`);
  sheet.getRow(rowIndex).height = 6;
  rowIndex++;

  const addSummaryRow = (label, value, isBold = false, bgColor = 'FFFFFF') => {
    sheet.mergeCells(`A${rowIndex}:D${rowIndex}`);
    const labelC = sheet.getCell(`A${rowIndex}`);
    labelC.value = label;
    labelC.font = { name: 'Calibri', bold: isBold, size: 10 };
    labelC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
    labelC.alignment = { horizontal: 'right', vertical: 'middle' };
    labelC.border = border;
    const valC = sheet.getCell(`E${rowIndex}`);
    valC.value = value;
    valC.font = { name: 'Calibri', bold: isBold, size: 10 };
    valC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
    valC.alignment = rightAlign;
    valC.numFmt = '#,##0.000 "DT"';
    valC.border = border;
    sheet.getRow(rowIndex).height = 18;
    rowIndex++;
  };

  if (coutData.ingredients.length > 0) addSummaryRow('Coût ingrédients :', coutData.cout_ingredients, false, 'F0F4FF');
  if (coutData.sous_produits.length > 0) addSummaryRow('Coût produits utilisables :', coutData.cout_sous_produits, false, 'F0F4FF');
  addSummaryRow('COÛT TOTAL :', coutData.cout_total, true, COLORS.totalBg);

  if (ftMode) {
    sheet.mergeCells(`A${rowIndex}:E${rowIndex}`);
    const typeCell = sheet.getCell(`A${rowIndex}`);
    const typeLabel = pricingLabel ? `Type : ${ftMode} (${pricingLabel})${ftDate ? ` — Date : ${ftDate}` : ''}` : `Type : ${ftMode}${ftDate ? ` — Date : ${ftDate}` : ''}`;
    typeCell.value = typeLabel;
    typeCell.font = { name: 'Calibri', bold: true, size: 9, color: { argb: '1F3864' } };
    typeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9E1F2' } };
    typeCell.alignment = { horizontal: 'center', vertical: 'middle' };
    typeCell.border = { top: thin, left: thin, bottom: thin, right: thin };
    sheet.getRow(rowIndex).height = 16;
    rowIndex++;
  }

  rowIndex++;
  sheet.mergeCells(`A${rowIndex}:E${rowIndex}`);
  const footerCell = sheet.getCell(`A${rowIndex}`);
  footerCell.value = `Généré le ${new Date().toLocaleDateString('fr-TN', { dateStyle: 'long' })} — Prix en Dinars Tunisiens (DT)`;
  footerCell.font = { name: 'Calibri', italic: true, size: 9, color: { argb: '888888' } };
  footerCell.alignment = { horizontal: 'center', vertical: 'middle' };
}

const exportExcel = async (req, res) => {
  const { id } = req.params;
  const { mode, activiteId, date, fg, pricingMethod } = req.query;
  const actId = parseInt(activiteId) || 0;

  try {
    let coutData;
    let ftMode = null;
    let ftDate = null;

    if (mode === 'stock') {
      ftMode = 'Stock';
      ftDate = new Date().toISOString().slice(0, 10);

      if (pricingMethod === 'both') {
        // Build both price maps and generate 2-sheet workbook
        const dpMap = await buildDpPriceMap(actId, req.user.id);
        const mpMap = await buildMpPriceMap(actId, req.user.id);
        const [dpData, mpData] = await Promise.all([
          calculerCoutAvecPrixMap(parseInt(id), req.user.id, dpMap),
          calculerCoutAvecPrixMap(parseInt(id), req.user.id, mpMap),
        ]);

        const actRes2 = actId ? await pool.query('SELECT nom FROM activites WHERE id = $1', [actId]) : null;
        const activityInfo2 = actRes2?.rows[0] ?? null;
        const safeProduit2 = dpData.produit.replace(/[^a-zA-Z0-9À-ÿ]/g, '-');
        const safeAct2 = activityInfo2 ? activityInfo2.nom.replace(/[^a-zA-Z0-9À-ÿ]/g, '-') : '';
        const filename2 = safeAct2 ? `FT-${safeAct2}-${safeProduit2}.xlsx` : `FT-${safeProduit2}.xlsx`;

        const workbook2 = new ExcelJS.Workbook();
        workbook2.creator = 'Fiche Technique App';
        workbook2.created = new Date();

        const tabBase2 = filename2.replace('.xlsx', '').replace(/[\\/?*[\]:]/g, '-');
        const dpSheet = workbook2.addWorksheet((tabBase2 + ' — DP').slice(0, 31), { pageSetup: { paperSize: 9, orientation: 'portrait' } });
        const mpSheet = workbook2.addWorksheet((tabBase2 + ' — MP').slice(0, 31), { pageSetup: { paperSize: 9, orientation: 'portrait' } });

        fillFtWorksheet(dpSheet, dpData, ftMode, ftDate, actId, activityInfo2, 'DP — Dernier Prix');
        fillFtWorksheet(mpSheet, mpData, ftMode, ftDate, actId, activityInfo2, 'MP — Moyenne des Prix');

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename2}"`);
        await workbook2.xlsx.write(res);
        return res.end();
      }

      // Single sheet: dp (default) or mp
      const priceMap = pricingMethod === 'mp'
        ? await buildMpPriceMap(actId, req.user.id)
        : await buildDpPriceMap(actId, req.user.id);
      coutData = await calculerCoutAvecPrixMap(parseInt(id), req.user.id, priceMap);
    } else if (mode === 'manual') {
      // Build price map from manual prices
      const r = await pool.query(
        `SELECT ingredient_id, prix_unitaire, updated_at
         FROM fiche_technique_manual_prices
         WHERE produit_id = $1 AND client_id = $2 AND activite_id = $3`,
        [id, req.user.id, actId]
      );
      const priceMap = {};
      r.rows.forEach((row) => { priceMap[row.ingredient_id] = parseFloat(row.prix_unitaire); });
      const latestUpdated = r.rows.length > 0 ? r.rows[0].updated_at : new Date();
      coutData = await calculerCoutAvecPrixMap(parseInt(id), req.user.id, priceMap);
      ftMode = 'Manuel';
      ftDate = latestUpdated instanceof Date
        ? latestUpdated.toISOString().slice(0, 10)
        : String(latestUpdated).slice(0, 10);
    } else {
      coutData = await calculerCout(parseInt(id), req.user.id);
    }

    // Look up activity details for context row + filename
    let activityInfo = null;
    if (actId) {
      const actRes = await pool.query('SELECT nom FROM activites WHERE id = $1', [actId]);
      if (actRes.rows.length > 0) activityInfo = actRes.rows[0];
    }

    const safeProduit = coutData.produit.replace(/[^a-zA-Z0-9À-ÿ]/g, '-');
    const safeActivity = activityInfo ? activityInfo.nom.replace(/[^a-zA-Z0-9À-ÿ]/g, '-') : '';
    const filename = safeActivity ? `FT-${safeActivity}-${safeProduit}.xlsx` : `FT-${safeProduit}.xlsx`;
    const sheetTabName = filename.replace('.xlsx', '').replace(/[\\/?*[\]:]/g, '-').slice(0, 31);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fiche Technique App';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(sheetTabName, { pageSetup: { paperSize: 9, orientation: 'portrait' } });
    const pricingLabel = mode === 'stock' ? (pricingMethod === 'mp' ? 'MP — Moyenne des Prix' : 'DP — Dernier Prix') : null;
    fillFtWorksheet(sheet, coutData, ftMode, ftDate, actId, activityInfo, pricingLabel);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    if (err.message === 'Produit introuvable') {
      return res.status(404).json({ message: err.message });
    }
    if (err.message.includes('circulaire')) {
      return res.status(400).json({ message: err.message });
    }
    console.error(err);
    res.status(500).json({ message: 'Erreur lors de la génération du fichier Excel' });
  }
};

module.exports = { exportExcel };
