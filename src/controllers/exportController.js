const ExcelJS = require('exceljs');
const pool = require('../config/database');
const { calculerCout, calculerCoutAvecPrixMap, buildDpPriceMap, buildMpPriceMap, buildDpPriceMapLabo, buildMpPriceMapLabo, laboOwnedByClient } = require('./produitsController');
const { brandHeader, headerRow, dataRowStyle, totalRowStyle, brandFooter, finalize, FMT_DT, FMT_QTE, BRAND, BORDER, fill } = require('../services/excelBrandService');

const FT_COLS = 5;

// Nombre de lignes « matière » de la fiche (ingrédients directs + lignes des
// sous-produits, récursivement) — pour la ligne méta du bandeau.
function countFtLines(coutData) {
  const countSp = (sp) => 1 + sp.details.ingredients.length
    + sp.details.sous_produits.reduce((acc, ssp) => acc + countSp(ssp), 0);
  return coutData.ingredients.length
    + coutData.sous_produits.reduce((acc, sp) => acc + countSp(sp), 0);
}

function fillFtWorksheet(wb, sheet, coutData, ftMode, ftDate, actId, activityInfo, pricingLabel, ctxLabel) {
  const sousTitre = ctxLabel || ((activityInfo && actId) ? `Activité : ${activityInfo.nom}` : '');

  const metaParts = [`Exporté le ${new Date().toLocaleDateString('fr-FR')}`];
  if (ftMode) {
    metaParts.push(pricingLabel ? `Type : ${ftMode} (${pricingLabel})` : `Type : ${ftMode}`);
    if (ftDate) metaParts.push(`Prix au ${ftDate}`);
  }
  metaParts.push(`${countFtLines(coutData)} ligne(s)`);

  const headerIdx = brandHeader(wb, sheet, {
    titre: `Fiche technique — ${coutData.produit}`,
    sousTitre,
    meta: metaParts.join(' · '),
    colCount: FT_COLS,
  });
  headerRow(sheet, headerIdx, ['Désignation', 'Portion', 'Unité', 'Prix Unit. (DT)', 'Coût (DT)'], {
    widths: [35, 12, 12, 14, 14],
  });

  let rowIndex = headerIdx + 1;

  const centerAlign = { horizontal: 'center', vertical: 'middle' };
  const rightAlign = { horizontal: 'right', vertical: 'middle' };

  // Alignements + formats communs d'une ligne matière (désignation / portion /
  // unité / prix unitaire / coût).
  const applyLineFormats = (row, indentLevel) => {
    row.getCell(1).alignment = { horizontal: 'left', vertical: 'middle', indent: indentLevel };
    row.getCell(2).alignment = rightAlign;
    row.getCell(3).alignment = centerAlign;
    row.getCell(4).alignment = rightAlign;
    row.getCell(5).alignment = rightAlign;
    row.getCell(2).numFmt = FMT_QTE;
    row.getCell(4).numFmt = FMT_DT;
    row.getCell(5).numFmt = FMT_DT;
  };

  // Section (« INGRÉDIENTS », « PRODUITS UTILISABLES ») — bande indigo pâle
  const addSectionHeader = (label) => {
    sheet.mergeCells(rowIndex, 1, rowIndex, FT_COLS);
    const cell = sheet.getCell(rowIndex, 1);
    cell.value = label;
    cell.font = { name: 'Calibri', size: 10.5, bold: true, color: { argb: BRAND.indigoInk } };
    cell.fill = fill(BRAND.indigoSoft);
    cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    cell.border = BORDER;
    sheet.getRow(rowIndex).height = 18;
    rowIndex++;
  };

  // Sous-en-tête de catégorie d'ingrédients
  const addCategorySubHeader = (label) => {
    sheet.mergeCells(rowIndex, 1, rowIndex, FT_COLS);
    const cell = sheet.getCell(rowIndex, 1);
    cell.value = label;
    cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: BRAND.indigo } };
    cell.fill = fill(BRAND.panel);
    cell.alignment = { horizontal: 'left', vertical: 'middle', indent: 2 };
    cell.border = BORDER;
    sheet.getRow(rowIndex).height = 15;
    rowIndex++;
  };

  // Ligne d'ingrédient — zébrage de la charte ; muted = ingrédient d'un
  // sous-produit (hiérarchie visuelle conservée).
  const addIngredientRow = (ing, zebraIdx, { indentLevel = 2, muted = false } = {}) => {
    const row = sheet.getRow(rowIndex);
    row.getCell(1).value = ing.nom;
    row.getCell(2).value = ing.portion;
    row.getCell(3).value = ing.unite;
    row.getCell(4).value = ing.prix_unitaire;
    row.getCell(5).value = ing.cout;
    dataRowStyle(row, { index: zebraIdx, colCount: FT_COLS });
    if (muted) {
      for (let c = 1; c <= FT_COLS; c++) {
        row.getCell(c).font = { name: 'Calibri', size: 10, color: { argb: BRAND.muted } };
      }
    }
    applyLineFormats(row, indentLevel);
    row.height = 16;
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
      ingByCategory[cat].forEach((ing, i) => addIngredientRow(ing, i));
    });
  }

  // Sous-produits récursifs : ligne d'en-tête (libellé + coût) puis leurs
  // ingrédients, puis leurs propres sous-produits.
  const renderSousProduit = (sp, depth = 0) => {
    sheet.mergeCells(rowIndex, 1, rowIndex, FT_COLS - 1);
    const labelCell = sheet.getCell(rowIndex, 1);
    labelCell.value = `↳ ${sp.nom} (portion : ${sp.portion})`;
    labelCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: BRAND.indigoInk } };
    labelCell.fill = fill(BRAND.indigoSoft);
    labelCell.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 + depth * 2 };
    labelCell.border = BORDER;
    const coutCell = sheet.getCell(rowIndex, FT_COLS);
    coutCell.value = sp.cout;
    coutCell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: BRAND.indigoInk } };
    coutCell.fill = fill(BRAND.indigoSoft);
    coutCell.alignment = rightAlign;
    coutCell.numFmt = FMT_DT;
    coutCell.border = BORDER;
    sheet.getRow(rowIndex).height = 16;
    rowIndex++;
    sp.details.ingredients.forEach((ing, i) => addIngredientRow(ing, i, { indentLevel: 2 + depth * 2, muted: true }));
    sp.details.sous_produits.forEach((ssp) => renderSousProduit(ssp, depth + 1));
  };

  if (coutData.sous_produits.length > 0) {
    addSectionHeader('PRODUITS UTILISABLES');
    coutData.sous_produits.forEach((sp) => renderSousProduit(sp));
  }

  // Respiration avant les totaux
  sheet.getRow(rowIndex).height = 6;
  rowIndex++;

  // Sous-totaux (fond neutre), puis total général en bande indigo de la charte
  const addSummaryRow = (label, value) => {
    sheet.mergeCells(rowIndex, 1, rowIndex, FT_COLS - 1);
    const row = sheet.getRow(rowIndex);
    const labelC = row.getCell(1);
    labelC.value = label;
    labelC.font = { name: 'Calibri', size: 10, color: { argb: BRAND.ink } };
    labelC.fill = fill(BRAND.panel);
    labelC.alignment = rightAlign;
    labelC.border = BORDER;
    const valC = row.getCell(FT_COLS);
    valC.value = value;
    valC.font = { name: 'Calibri', size: 10, bold: true, color: { argb: BRAND.ink } };
    valC.fill = fill(BRAND.panel);
    valC.alignment = rightAlign;
    valC.numFmt = FMT_DT;
    valC.border = BORDER;
    row.height = 18;
    rowIndex++;
  };

  if (coutData.ingredients.length > 0) addSummaryRow('Coût ingrédients :', coutData.cout_ingredients);
  if (coutData.sous_produits.length > 0) addSummaryRow('Coût produits utilisables :', coutData.cout_sous_produits);

  sheet.mergeCells(rowIndex, 1, rowIndex, FT_COLS - 1);
  const totalRow = sheet.getRow(rowIndex);
  totalRow.getCell(1).value = 'COÛT TOTAL :';
  totalRow.getCell(FT_COLS).value = coutData.cout_total;
  totalRowStyle(totalRow, { colCount: FT_COLS });
  totalRow.getCell(1).alignment = rightAlign;
  totalRow.getCell(FT_COLS).alignment = rightAlign;
  totalRow.getCell(FT_COLS).numFmt = FMT_DT;
  rowIndex++;

  const lastDataRow = rowIndex - 1;
  brandFooter(sheet, FT_COLS);
  // Pas de filtre automatique : la fiche est un document structuré (sections,
  // fusions), pas un tableau plat.
  finalize(sheet, { headerRowIdx: headerIdx, colCount: FT_COLS, lastDataRow, autoFilter: false });
}

const exportExcel = async (req, res) => {
  const { id } = req.params;
  const { mode, activiteId, date, fg, pricingMethod, laboId } = req.query;
  const ownerId = req.user.gerant_parent_id || req.user.id;
  const actId = parseInt(activiteId) || 0;

  try {
    // Contexte labo (produit valorisé composé) : prix d'appro du labo, sans activité.
    const labIdRaw = parseInt(laboId) || 0;
    const useLabo = labIdRaw > 0 && await laboOwnedByClient(labIdRaw, ownerId);
    const labId = useLabo ? labIdRaw : 0;
    // Contexte (activité ou labo) pour l'en-tête et le nom de fichier.
    let ctxName = null;     // nom affiché
    let ctxLabel = null;    // ligne d'en-tête « Labo : … » (null = comportement activité par défaut)
    if (useLabo) {
      const lr = await pool.query('SELECT nom FROM labos WHERE id = $1', [labId]);
      ctxName = lr.rows[0]?.nom ?? null;
      if (ctxName) ctxLabel = `Labo : ${ctxName}`;
    } else if (actId) {
      const ar = await pool.query('SELECT nom FROM activites WHERE id = $1', [actId]);
      ctxName = ar.rows[0]?.nom ?? null;
    }
    const safeCtx = ctxName ? ctxName.replace(/[^a-zA-Z0-9À-ÿ]/g, '-') : '';

    let coutData;
    let ftMode = null;
    let ftDate = null;

    if (mode === 'stock') {
      ftMode = 'Stock';
      ftDate = new Date().toISOString().slice(0, 10);

      if (pricingMethod === 'both') {
        // Build both price maps and generate 2-sheet workbook
        const dpMap = useLabo ? await buildDpPriceMapLabo(labId) : await buildDpPriceMap(actId, ownerId);
        const mpMap = useLabo ? await buildMpPriceMapLabo(labId) : await buildMpPriceMap(actId, ownerId);
        const [dpData, mpData] = await Promise.all([
          calculerCoutAvecPrixMap(parseInt(id), ownerId, dpMap),
          calculerCoutAvecPrixMap(parseInt(id), ownerId, mpMap),
        ]);

        const safeProduit2 = dpData.produit.replace(/[^a-zA-Z0-9À-ÿ]/g, '-');
        const filename2 = safeCtx ? `FT-${safeCtx}-${safeProduit2}.xlsx` : `FT-${safeProduit2}.xlsx`;

        const workbook2 = new ExcelJS.Workbook();
        workbook2.creator = 'Fiche Technique App';
        workbook2.created = new Date();

        const tabBase2 = filename2.replace('.xlsx', '').replace(/[\\/?*[\]:]/g, '-');
        const dpSheet = workbook2.addWorksheet((tabBase2 + ' — DP').slice(0, 31), { pageSetup: { paperSize: 9, orientation: 'portrait' } });
        const mpSheet = workbook2.addWorksheet((tabBase2 + ' — MP').slice(0, 31), { pageSetup: { paperSize: 9, orientation: 'portrait' } });

        const ctxInfo2 = ctxName ? { nom: ctxName } : null;
        fillFtWorksheet(workbook2, dpSheet, dpData, ftMode, ftDate, actId, ctxInfo2, 'DP — Dernier Prix', ctxLabel);
        fillFtWorksheet(workbook2, mpSheet, mpData, ftMode, ftDate, actId, ctxInfo2, 'MP — Moyenne des Prix', ctxLabel);

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="${filename2}"`);
        await workbook2.xlsx.write(res);
        return res.end();
      }

      // Single sheet: dp (default) or mp
      const priceMap = useLabo
        ? (pricingMethod === 'mp' ? await buildMpPriceMapLabo(labId) : await buildDpPriceMapLabo(labId))
        : (pricingMethod === 'mp' ? await buildMpPriceMap(actId, ownerId) : await buildDpPriceMap(actId, ownerId));
      coutData = await calculerCoutAvecPrixMap(parseInt(id), ownerId, priceMap);
    } else if (mode === 'manual') {
      // Build price map from manual prices (labo ou activité)
      const r = await pool.query(
        `SELECT ingredient_id, prix_unitaire, updated_at
         FROM fiche_technique_manual_prices
         WHERE produit_id = $1 AND client_id = $2 AND activite_id = $3 AND labo_id = $4`,
        [id, ownerId, useLabo ? 0 : actId, labId]
      );
      const priceMap = {};
      r.rows.forEach((row) => { priceMap[row.ingredient_id] = parseFloat(row.prix_unitaire); });
      const latestUpdated = r.rows.length > 0 ? r.rows[0].updated_at : new Date();
      coutData = await calculerCoutAvecPrixMap(parseInt(id), ownerId, priceMap);
      ftMode = 'Manuel';
      ftDate = latestUpdated instanceof Date
        ? latestUpdated.toISOString().slice(0, 10)
        : String(latestUpdated).slice(0, 10);
    } else {
      coutData = await calculerCout(parseInt(id), ownerId);
    }

    const activityInfo = ctxName ? { nom: ctxName } : null;

    const safeProduit = coutData.produit.replace(/[^a-zA-Z0-9À-ÿ]/g, '-');
    const filename = safeCtx ? `FT-${safeCtx}-${safeProduit}.xlsx` : `FT-${safeProduit}.xlsx`;
    const sheetTabName = filename.replace('.xlsx', '').replace(/[\\/?*[\]:]/g, '-').slice(0, 31);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fiche Technique App';
    workbook.created = new Date();

    const sheet = workbook.addWorksheet(sheetTabName, { pageSetup: { paperSize: 9, orientation: 'portrait' } });
    const pricingLabel = mode === 'stock' ? (pricingMethod === 'mp' ? 'MP — Moyenne des Prix' : 'DP — Dernier Prix') : null;
    fillFtWorksheet(workbook, sheet, coutData, ftMode, ftDate, actId, activityInfo, pricingLabel, ctxLabel);

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
