const ExcelJS = require('exceljs');
const pool = require('../config/database');
const { calculerCout, calculerCoutAvecPrixMap } = require('./produitsController');

const exportExcel = async (req, res) => {
  const { id } = req.params;
  const { mode, activiteId, date } = req.query;
  const actId = parseInt(activiteId) || 0;

  try {
    let coutData;
    let ftMode = null;
    let ftDate = null;

    if (mode === 'stock' && date) {
      // Build price map from stock at the given date
      let priceRows;
      if (actId) {
        const r = await pool.query(
          `SELECT sed.ingredient_id, sed.prix_unitaire
           FROM stock_entreprise_daily sed
           JOIN activites a ON sed.activite_id = a.id
           JOIN profil_entreprise pe ON a.entreprise_id = pe.id
           WHERE sed.activite_id = $1 AND pe.client_id = $2 AND sed.date_stock = $3
             AND sed.prix_unitaire IS NOT NULL`,
          [actId, req.user.id, date]
        );
        priceRows = r.rows;
      } else {
        const r = await pool.query(
          `SELECT ingredient_id, prix_unitaire FROM stock_client_daily
           WHERE client_id = $1 AND date_stock = $2 AND prix_unitaire IS NOT NULL`,
          [req.user.id, date]
        );
        priceRows = r.rows;
      }
      const priceMap = {};
      priceRows.forEach((row) => { priceMap[row.ingredient_id] = parseFloat(row.prix_unitaire); });
      coutData = await calculerCoutAvecPrixMap(parseInt(id), req.user.id, priceMap);
      ftMode = 'Stock';
      ftDate = date;
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

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fiche Technique App';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet('Fiche Technique', {
      pageSetup: { paperSize: 9, orientation: 'portrait' },
    });

    // Largeurs des colonnes
    sheet.columns = [
      { width: 35 }, // Désignation
      { width: 12 }, // Portion
      { width: 12 }, // Unité
      { width: 14 }, // Prix unitaire (DT)
      { width: 14 }, // Coût (DT)
    ];

    const COLORS = {
      headerBg: '1F3864',
      headerFg: 'FFFFFF',
      sectionBg: 'D9E1F2',
      sectionFg: '1F3864',
      subBg: 'EEF2FA',
      totalBg: 'FFD700',
      totalFg: '000000',
      borderColor: 'B8CCE4',
      altRow: 'F5F8FF',
    };

    const headerFont = { name: 'Calibri', bold: true, size: 11, color: { argb: COLORS.headerFg } };
    const bodyFont = { name: 'Calibri', size: 10 };
    const boldFont = { name: 'Calibri', bold: true, size: 10 };
    const thin = { style: 'thin', color: { argb: COLORS.borderColor } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const centerAlign = { horizontal: 'center', vertical: 'middle' };
    const rightAlign = { horizontal: 'right', vertical: 'middle' };

    // ─── EN-TÊTE PRINCIPAL ───
    sheet.mergeCells('A1:E1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = 'FICHE TECHNIQUE';
    titleCell.font = { name: 'Calibri', bold: true, size: 16, color: { argb: COLORS.headerFg } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
    titleCell.border = border;
    sheet.getRow(1).height = 30;

    sheet.mergeCells('A2:E2');
    const produitCell = sheet.getCell('A2');
    produitCell.value = coutData.produit.toUpperCase();
    produitCell.font = { name: 'Calibri', bold: true, size: 13, color: { argb: COLORS.headerFg } };
    produitCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: '2E5597' } };
    produitCell.alignment = { horizontal: 'center', vertical: 'middle' };
    produitCell.border = border;
    sheet.getRow(2).height = 24;

    // ─── EN-TÊTE COLONNES ───
    const colHeaders = ['Désignation', 'Portion', 'Unité', 'Prix Unit. (DT)', 'Coût (DT)'];
    const headerRow = sheet.getRow(3);
    colHeaders.forEach((h, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = h;
      cell.font = headerFont;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.headerBg } };
      cell.alignment = i === 0 ? { horizontal: 'left', vertical: 'middle' } : centerAlign;
      cell.border = border;
    });
    headerRow.height = 20;

    let rowIndex = 4;

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
        c.fill = {
          type: 'pattern', pattern: 'solid',
          fgColor: { argb: isAlt ? COLORS.altRow : 'FFFFFF' },
        };
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

    // ─── INGRÉDIENTS DIRECTS ───
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

    // ─── PRODUITS UTILISABLES ───
    const renderSousProduit = (sp, depth = 0) => {
      const indent = '    '.repeat(depth + 1);

      // En-tête sous-produit
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

      // Ingrédients du sous-produit
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

      // Sous-sous-produits (récursif)
      sp.details.sous_produits.forEach((ssp) => renderSousProduit(ssp, depth + 1));
    };

    if (coutData.sous_produits.length > 0) {
      addSectionHeader('PRODUITS UTILISABLES');
      coutData.sous_produits.forEach((sp) => renderSousProduit(sp));
    }

    // ─── LIGNE SÉPARATRICE ───
    sheet.mergeCells(`A${rowIndex}:E${rowIndex}`);
    sheet.getRow(rowIndex).height = 6;
    rowIndex++;

    // ─── RÉSUMÉ DES COÛTS ───
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

    if (coutData.ingredients.length > 0) {
      addSummaryRow('Coût ingrédients :', coutData.cout_ingredients, false, 'F0F4FF');
    }
    if (coutData.sous_produits.length > 0) {
      addSummaryRow('Coût produits utilisables :', coutData.cout_sous_produits, false, 'F0F4FF');
    }
    addSummaryRow('COÛT TOTAL :', coutData.cout_total, true, COLORS.totalBg);

    // ─── TYPE ET DATE (si FP Stock ou FP Manuel) ───
    if (ftMode) {
      sheet.mergeCells(`A${rowIndex}:E${rowIndex}`);
      const typeCell = sheet.getCell(`A${rowIndex}`);
      typeCell.value = `Type : ${ftMode}${ftDate ? ` — Date : ${ftDate}` : ''}`;
      typeCell.font = { name: 'Calibri', bold: true, size: 9, color: { argb: '1F3864' } };
      typeCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'D9E1F2' } };
      typeCell.alignment = { horizontal: 'center', vertical: 'middle' };
      typeCell.border = { top: thin, left: thin, bottom: thin, right: thin };
      sheet.getRow(rowIndex).height = 16;
      rowIndex++;
    }

    // ─── PIED DE PAGE ───
    rowIndex++;
    sheet.mergeCells(`A${rowIndex}:E${rowIndex}`);
    const footerCell = sheet.getCell(`A${rowIndex}`);
    footerCell.value = `Généré le ${new Date().toLocaleDateString('fr-TN', { dateStyle: 'long' })} — Prix en Dinars Tunisiens (DT)`;
    footerCell.font = { name: 'Calibri', italic: true, size: 9, color: { argb: '888888' } };
    footerCell.alignment = { horizontal: 'center', vertical: 'middle' };

    const filename = `fiche-technique-${coutData.produit.replace(/[^a-zA-Z0-9]/g, '-')}.xlsx`;
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
