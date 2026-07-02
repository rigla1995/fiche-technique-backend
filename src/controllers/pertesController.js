const pool = require('../config/database');
const ExcelJS = require('exceljs');
const { scopeGerantActivite } = require('../middleware/auth');
const { computeStockCourant, computeStockPTCourant } = require('../utils/stockUtils');
const { buildHistoriquePertesPdf, buildLaboHistoriquePertesPdf } = require('../services/histoPdfService');

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmtDate = (d) => {
  if (!d) return '—';
  const s = d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
  return s.split('-').reverse().join('/');
};

const mapPerte = (r) => ({
  id: r.id,
  activiteId: r.activite_id ?? null,
  activiteNom: r.activite_nom ?? null,
  ingredientId: r.ingredient_id,
  ingredientNom: r.ingredient_nom,
  uniteNom: r.unite_nom,
  categorieNom: r.categorie_nom ?? null,
  quantite: parseFloat(r.quantite),
  prixUnitaire: r.prix_unitaire != null ? parseFloat(r.prix_unitaire) : null,
  typePerte: r.type_perte,
  datePerte: r.date_perte instanceof Date ? r.date_perte.toISOString().slice(0, 10) : String(r.date_perte).slice(0, 10),
  createdAt: r.created_at,
  createdBy: r.created_by ?? null,
  createdByNom: r.created_by_nom ?? null,
});

// Returns the appro price for an ingredient on or before the given date (NULL if none)
const STOCK_TABLE_ALLOWLIST = {
  stock_entreprise_daily: 'activite_id',
  stock_labo_daily:       'labo_id',
};
const getPrixPourPerte = async (table, ownerCol, ownerId, ingredientId, datePerte) => {
  const expectedCol = STOCK_TABLE_ALLOWLIST[table];
  if (!expectedCol || expectedCol !== ownerCol) throw new Error(`Table non autorisée: ${table}`);
  const r = await pool.query(
    `SELECT prix_unitaire, COALESCE(prix_unitaire_tva, prix_unitaire) AS prix_ttc FROM ${table}
     WHERE ${ownerCol} = $1 AND ingredient_id = $2
       AND prix_unitaire IS NOT NULL AND prix_unitaire > 0
       AND date_appro <= $3
     ORDER BY date_appro DESC, id DESC
     LIMIT 1`,
    [ownerId, ingredientId, datePerte]
  );
  return r.rows.length > 0
    ? { ht: parseFloat(r.rows[0].prix_unitaire), ttc: r.rows[0].prix_ttc != null ? parseFloat(r.rows[0].prix_ttc) : null }
    : { ht: null, ttc: null };
};

// ── Entreprise — existing create ─────────────────────────────────────────────

const createPerte = async (req, res) => {
  const { activiteId } = req.params;
  const { ingredientId, quantite, typePerte, datePerte } = req.body;

  if (!ingredientId || !quantite || !typePerte || !datePerte)
    return res.status(400).json({ message: 'Champs requis: ingredientId, quantite, typePerte, datePerte' });
  if (!['avarie', 'dechet'].includes(typePerte))
    return res.status(400).json({ message: 'typePerte invalide (avarie|dechet)' });

  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });

    // PT (produit transformé) : pas d'appro article — on vérifie le stock PT et on enregistre la perte
    // par produit_id (pas de prix : valorisé 0 comme au labo). computeStockPTCourant intègre déjà les
    // pertes PT → le stock du PT se déduit automatiquement.
    if (parseInt(ingredientId) < 0) {
      const produitId = -parseInt(ingredientId);
      const qtyPt = parseFloat(quantite);
      const ptStock = await computeStockPTCourant('activite', activiteId, produitId);
      if (qtyPt > ptStock) {
        return res.status(422).json({ message: 'Stock insuffisant', disponible: Math.max(0, ptStock), demande: qtyPt });
      }
      const rpt = await pool.query(
        `INSERT INTO pertes (activite_id, produit_id, quantite, type_perte, date_perte, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [activiteId, produitId, qtyPt, typePerte, datePerte, req.user.id]
      );
      return res.status(201).json(rpt.rows[0]);
    }

    const minRow = await pool.query(
      `SELECT MIN(date_appro) AS min_date FROM stock_entreprise_daily WHERE activite_id = $1 AND ingredient_id = $2`,
      [activiteId, ingredientId]
    );
    const minAppro = minRow.rows[0]?.min_date;
    if (!minAppro) return res.status(400).json({ message: 'Aucun approvisionnement enregistré pour cet ingrédient.' });
    const minApproStr = minAppro instanceof Date ? minAppro.toISOString().slice(0, 10) : String(minAppro).slice(0, 10);
    if (datePerte < minApproStr) return res.status(400).json({ message: `La date de perte doit être >= au premier appro (${minApproStr.split('-').reverse().join('/')}).` });

    const prixPerte = await getPrixPourPerte('stock_entreprise_daily', 'activite_id', activiteId, ingredientId, datePerte);

    const stockCourant = await computeStockCourant('activite', activiteId, ingredientId);
    const qty = parseFloat(quantite);
    if (qty > stockCourant) {
      return res.status(422).json({
        message: `Stock insuffisant`,
        disponible: Math.max(0, stockCourant),
        demande: qty,
      });
    }

    const r = await pool.query(
      `INSERT INTO pertes (activite_id, ingredient_id, quantite, type_perte, date_perte, prix_unitaire, prix_unitaire_tva, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [activiteId, ingredientId, quantite, typePerte, datePerte, prixPerte.ht, prixPerte.ttc, req.user.id]
    );
    res.status(201).json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Entreprise — existing list (per activite) ────────────────────────────────

const listPertes = async (req, res) => {
  const { activiteId } = req.params;
  const { ingredientId } = req.query;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });

    const params = [activiteId];
    let extra = '';
    if (ingredientId) { params.push(ingredientId); extra = `AND p.ingredient_id = $${params.length}`; }

    const result = await pool.query(
      `SELECT p.id, p.ingredient_id, i.nom as ingredient_nom, u.nom as unite_nom,
              p.quantite, p.type_perte, p.date_perte, p.created_at
       FROM pertes p
       JOIN articles i ON i.id = p.ingredient_id
       JOIN unites u ON i.unite_id = u.id
       WHERE p.activite_id = $1 ${extra}
       ORDER BY p.date_perte DESC, p.created_at DESC`,
      params
    );
    res.json(result.rows.map((r) => ({
      id: r.id,
      ingredientId: r.ingredient_id,
      ingredientNom: r.ingredient_nom,
      uniteNom: r.unite_nom,
      quantite: parseFloat(r.quantite),
      typePerte: r.type_perte,
      datePerte: r.date_perte instanceof Date ? r.date_perte.toISOString().slice(0, 10) : String(r.date_perte).slice(0, 10),
      createdAt: r.created_at,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Entreprise — list (all activités) ────────────────────────────────────────

const listEntreprisePertes = async (req, res) => {
  // Enforce activité scope for gérant accounts (multi-affectations)
  if (req.user.role === 'gerant') {
    if (!scopeGerantActivite(req, res)) return;
  }
  const { activiteId, activiteIds, dateDebut, dateFin, typePerte, categorieId, ingredientId, search } = req.query;

  // Verify company ownership
  const companyCheck = await pool.query(
    `SELECT pe.id FROM profil_entreprise pe WHERE pe.client_id = $1`,
    [req.user.gerant_parent_id || req.user.id]
  );
  if (companyCheck.rows.length === 0) return res.status(404).json({ message: 'Entreprise introuvable' });
  const entrepriseId = companyCheck.rows[0].id;

  const params = [entrepriseId];
  const wheres = [`a.entreprise_id = $1`];

  if (activiteId) { params.push(activiteId); wheres.push(`p.activite_id = $${params.length}`); }
  else if (activiteIds) { params.push(activiteIds.split(',').map(Number)); wheres.push(`p.activite_id = ANY($${params.length}::int[])`); }
  if (dateDebut) { params.push(dateDebut); wheres.push(`p.date_perte >= $${params.length}`); }
  if (dateFin)   { params.push(dateFin);   wheres.push(`p.date_perte <= $${params.length}`); }
  if (typePerte && ['avarie', 'dechet'].includes(typePerte)) { params.push(typePerte); wheres.push(`p.type_perte = $${params.length}`); }
  if (categorieId) { params.push(categorieId); wheres.push(`i.categorie_id = $${params.length}`); }
  if (ingredientId) { params.push(ingredientId); wheres.push(`p.ingredient_id = $${params.length}`); }
  if (search) { params.push(`%${search}%`); wheres.push(`i.nom ILIKE $${params.length}`); }

  try {
    const result = await pool.query(
      `SELECT p.id, p.activite_id, a.nom AS activite_nom,
              p.ingredient_id, i.nom AS ingredient_nom, u.nom AS unite_nom,
              COALESCE(c.nom, 'Sans catégorie') AS categorie_nom,
              p.quantite, p.prix_unitaire, p.type_perte, p.date_perte, p.created_at, p.created_by,
              ub.nom AS created_by_nom
       FROM pertes p
       JOIN activites a ON a.id = p.activite_id
       JOIN articles i ON i.id = p.ingredient_id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       LEFT JOIN utilisateurs ub ON ub.id = p.created_by
       WHERE ${wheres.join(' AND ')}
       ORDER BY p.date_perte DESC, p.created_at DESC`,
      params
    );
    res.json(result.rows.map(mapPerte));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Entreprise — update ───────────────────────────────────────────────────────

const updateEntreprisePerte = async (req, res) => {
  const { id } = req.params;
  const { quantite, typePerte, datePerte } = req.body;
  if (!quantite || !typePerte) return res.status(400).json({ message: 'quantite et typePerte requis' });
  if (!['avarie', 'dechet'].includes(typePerte)) return res.status(400).json({ message: 'typePerte invalide' });
  if (parseFloat(quantite) <= 0) return res.status(400).json({ message: 'quantite doit être > 0' });
  try {
    // Fetch existing row to get ingredient_id, activite_id, date_perte
    const existing = await pool.query(
      `SELECT p.ingredient_id, p.activite_id, p.date_perte, p.created_by
       FROM pertes p
       JOIN activites a ON a.id = p.activite_id
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE p.id = $1 AND pe.client_id = $2`,
      [id, req.user.gerant_parent_id || req.user.id]
    );
    if (existing.rows.length === 0) return res.status(404).json({ message: 'Perte introuvable' });
    if (req.user.role === 'gerant' && existing.rows[0].created_by !== req.user.id)
      return res.status(403).json({ message: 'Vous ne pouvez modifier que vos propres enregistrements.' });
    const { ingredient_id: ingredientId, activite_id: activiteId, date_perte } = existing.rows[0];
    const effectiveDate = datePerte || (date_perte instanceof Date
      ? date_perte.toISOString().slice(0, 10)
      : String(date_perte).slice(0, 10));

    const prixPerte = await getPrixPourPerte('stock_entreprise_daily', 'activite_id', activiteId, ingredientId, effectiveDate);

    const r = await pool.query(
      `UPDATE pertes p SET quantite = $1, type_perte = $2, prix_unitaire = $3, prix_unitaire_tva = $6
       FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE p.id = $4 AND p.activite_id = a.id AND pe.client_id = $5
       RETURNING p.id`,
      [quantite, typePerte, prixPerte.ht, id, req.user.gerant_parent_id || req.user.id, prixPerte.ttc]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Perte introuvable' });
    res.json({ message: 'Mise à jour effectuée' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Entreprise — delete ───────────────────────────────────────────────────────

const deleteEntreprisePerte = async (req, res) => {
  const { id } = req.params;
  try {
    const checkEntDel = await pool.query(
      `SELECT p.created_by FROM pertes p
       JOIN activites a ON a.id = p.activite_id
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE p.id = $1 AND pe.client_id = $2`,
      [id, req.user.gerant_parent_id || req.user.id]
    );
    if (checkEntDel.rows.length === 0) return res.status(404).json({ message: 'Perte introuvable' });
    if (req.user.role === 'gerant' && checkEntDel.rows[0].created_by !== req.user.id)
      return res.status(403).json({ message: 'Vous ne pouvez supprimer que vos propres enregistrements.' });
    const r = await pool.query(
      `DELETE FROM pertes WHERE id = $1 RETURNING id`,
      [id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Perte introuvable' });
    res.json({ message: 'Perte supprimée' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Excel helpers ─────────────────────────────────────────────────────────────

const buildExcelPertes = async (res, rows, isEntreprise, filters = {}) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Fiche Technique App';
  const sheet = workbook.addWorksheet('Historique Pertes', { pageSetup: { paperSize: 9, orientation: 'landscape' } });

  const DARK_RED = '8B0000'; const RED = 'C0392B'; const WHITE = 'FFFFFF';
  const ALT = 'FFF5F5'; const ORANGE_BG = 'FDECEA'; const GOLD = 'FFD700';
  const thin = { style: 'thin', color: { argb: 'FFCCCC' } };
  const border = { top: thin, left: thin, bottom: thin, right: thin };
  const hdrFont = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
  const bodyFont = { name: 'Calibri', size: 10 };

  const cols = [
    { header: 'Date', width: 12 },
    ...(isEntreprise ? [{ header: 'Activité', width: 20 }] : []),
    { header: 'Ingrédient', width: 26 },
    { header: 'Catégorie', width: 18 },
    { header: 'Quantité', width: 11 },
    { header: 'Unité', width: 9 },
    { header: 'Type', width: 10 },
    { header: 'Prix Unit.', width: 13 },
    { header: 'Coût Total', width: 14 },
  ];
  sheet.columns = cols.map((c) => ({ width: c.width }));

  // Title
  const rangeLabel = (filters.dateDebut || filters.dateFin)
    ? `DU : ${fmtDate(filters.dateDebut)}   AU : ${fmtDate(filters.dateFin)}`
    : `Année ${new Date().getFullYear()}`;
  const titleRow = sheet.addRow([`Historique Pertes  —  ${rangeLabel}`, ...Array(cols.length - 1).fill('')]);
  sheet.mergeCells(1, 1, 1, cols.length);
  titleRow.getCell(1).font = { name: 'Calibri', bold: true, size: 13, color: { argb: WHITE } };
  titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: DARK_RED } };
  titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  titleRow.height = 28;

  // Header
  const hdrRow = sheet.addRow(cols.map((c) => c.header));
  hdrRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = hdrFont;
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = border;
  });
  hdrRow.height = 22;
  sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };

  // Data rows
  let totalQty = 0;
  const selectedIds = new Set((filters.selectedIds || []).map(Number));

  // Column indices (1-based)
  const qtyColIdx   = isEntreprise ? 5 : 4;
  const prixColIdx  = isEntreprise ? 8 : 7;
  const coutColIdx  = isEntreprise ? 9 : 8;

  rows.forEach((r, i) => {
    const qty = parseFloat(r.quantite);
    const prix = r.prix_unitaire != null ? parseFloat(r.prix_unitaire) : null;
    const cout = (prix != null) ? qty * prix : null;
    totalQty += qty;
    const isSelected = selectedIds.size > 0 && selectedIds.has(Number(r.id));
    const isAvarie = r.type_perte === 'avarie';

    const rowData = [
      fmtDate(r.date_perte),
      ...(isEntreprise ? [r.activite_nom || ''] : []),
      r.ingredient_nom,
      r.categorie_nom || '',
      qty,
      r.unite_nom,
      isAvarie ? 'Avarie' : 'Déchet',
      prix ?? '',
      cout ?? '',
    ];
    const dataRow = sheet.addRow(rowData);

    let bg = i % 2 === 0 ? WHITE : ALT;
    if (isSelected) bg = isAvarie ? 'FFB3B3' : 'FFCC99';

    for (let c = 1; c <= cols.length; c++) {
      const cell = dataRow.getCell(c);
      cell.font = { ...bodyFont, bold: isSelected };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = border;
      const isNumeric = [qtyColIdx, prixColIdx, coutColIdx].includes(c);
      cell.alignment = { vertical: 'middle', horizontal: isNumeric ? 'right' : 'left' };
    }
    dataRow.getCell(qtyColIdx).numFmt = '#,##0.000';
    if (prix != null) dataRow.getCell(prixColIdx).numFmt = '#,##0.000';
    if (cout != null) dataRow.getCell(coutColIdx).numFmt = '#,##0.000';
    dataRow.height = 16;
  });

  // Total row
  const totalRowData = Array(cols.length).fill('');
  totalRowData[0] = 'TOTAL';
  totalRowData[qtyColIdx - 1] = totalQty;
  const totalRow = sheet.addRow(totalRowData);
  totalRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { name: 'Calibri', bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
    cell.border = border;
    cell.alignment = { vertical: 'middle', horizontal: 'right' };
  });
  totalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  totalRow.getCell(qtyColIdx).numFmt = '#,##0.000';
  totalRow.height = 18;

  // Footer
  sheet.addRow([]);
  const footerRow = sheet.addRow([`Généré le ${new Date().toLocaleDateString('fr-TN', { dateStyle: 'long' })} — ${rows.length} perte(s)`]);
  footerRow.getCell(1).font = { name: 'Calibri', italic: true, size: 9, color: { argb: '888888' } };
  if (selectedIds.size > 0) {
    const noteRow = sheet.addRow([`⚠ ${selectedIds.size} perte(s) en surbrillance = sélectionnées pour comparaison`]);
    noteRow.getCell(1).font = { name: 'Calibri', bold: true, size: 9, color: { argb: 'C0392B' } };
  }

  const dateTag = filters.dateDebut ? filters.dateDebut : new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Historique-Pertes-${dateTag}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
};

// ── Entreprise — export Excel ─────────────────────────────────────────────────

const exportEntreprisePertes = async (req, res) => {
  if (req.user.role === 'gerant') { if (!scopeGerantActivite(req, res)) return; }
  const { activiteId, activiteIds, dateDebut, dateFin, typePerte, categorieId, ingredientId, search, selectedIds } = req.query;

  const companyCheck = await pool.query(
    `SELECT pe.id FROM profil_entreprise pe WHERE pe.client_id = $1`,
    [req.user.gerant_parent_id || req.user.id]
  );
  if (companyCheck.rows.length === 0) return res.status(404).json({ message: 'Entreprise introuvable' });
  const entrepriseId = companyCheck.rows[0].id;

  const params = [entrepriseId];
  const wheres = [`a.entreprise_id = $1`];

  if (activiteId) { params.push(activiteId); wheres.push(`p.activite_id = $${params.length}`); }
  else if (activiteIds) { params.push(activiteIds.split(',').map(Number)); wheres.push(`p.activite_id = ANY($${params.length}::int[])`); }
  if (dateDebut) { params.push(dateDebut); wheres.push(`p.date_perte >= $${params.length}`); }
  if (dateFin)   { params.push(dateFin);   wheres.push(`p.date_perte <= $${params.length}`); }
  if (typePerte && ['avarie', 'dechet'].includes(typePerte)) { params.push(typePerte); wheres.push(`p.type_perte = $${params.length}`); }
  if (categorieId) { params.push(categorieId); wheres.push(`i.categorie_id = $${params.length}`); }
  if (ingredientId) { params.push(ingredientId); wheres.push(`p.ingredient_id = $${params.length}`); }
  if (search) { params.push(`%${search}%`); wheres.push(`i.nom ILIKE $${params.length}`); }

  // selectedIds are used only for Excel highlighting, not for WHERE filtering
  const idList = selectedIds ? String(selectedIds).split(',').map(Number).filter(Boolean) : [];

  try {
    const result = await pool.query(
      `SELECT p.id, p.activite_id, a.nom AS activite_nom,
              p.ingredient_id, i.nom AS ingredient_nom, u.nom AS unite_nom,
              COALESCE(c.nom, 'Sans catégorie') AS categorie_nom,
              p.quantite, p.prix_unitaire, p.type_perte, p.date_perte, p.created_at, p.created_by
       FROM pertes p
       JOIN activites a ON a.id = p.activite_id
       JOIN articles i ON i.id = p.ingredient_id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       WHERE ${wheres.join(' AND ')}
       ORDER BY p.date_perte DESC, p.created_at DESC`,
      params
    );
    await buildExcelPertes(res, result.rows, true, { dateDebut, dateFin, selectedIds: idList });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur génération Excel' });
  }
};

// ── Prix lookup endpoints ─────────────────────────────────────────────────────

const getPrixEntreprisePerte = async (req, res) => {
  const { activiteId, ingredientId, date } = req.query;
  if (!activiteId || !ingredientId || !date) return res.status(400).json({ message: 'activiteId, ingredientId et date requis' });
  try {
    // Verify ownership
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });
    const prixPerte = await getPrixPourPerte('stock_entreprise_daily', 'activite_id', activiteId, ingredientId, date);
    res.json({ prixUnitaire: prixPerte.ht });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getPrixLaboPerte = async (req, res) => {
  const { laboId } = req.params;
  const { ingredientId, date } = req.query;
  if (!ingredientId || !date) return res.status(400).json({ message: 'ingredientId et date requis' });
  try {
    const prixPerte = await getPrixPourPerte('stock_labo_daily', 'labo_id', laboId, ingredientId, date);
    res.json({ prixUnitaire: prixPerte.ht });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Date range lookup endpoints ───────────────────────────────────────────────

const getDateRangeEntreprisePerte = async (req, res) => {
  const { activiteId, ingredientId } = req.query;
  if (!activiteId || !ingredientId) return res.status(400).json({ message: 'activiteId et ingredientId requis' });
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a JOIN profil_entreprise pe ON a.entreprise_id = pe.id WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.gerant_parent_id || req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });
    const r = await pool.query(
      `SELECT MIN(date_appro) AS min_date, MAX(date_appro) AS max_date
       FROM stock_entreprise_daily
       WHERE activite_id = $1 AND ingredient_id = $2`,
      [activiteId, ingredientId]
    );
    const row = r.rows[0];
    res.json({
      minDate: row.min_date ? (row.min_date instanceof Date ? row.min_date.toISOString().slice(0, 10) : String(row.min_date).slice(0, 10)) : null,
      maxDate: row.max_date ? (row.max_date instanceof Date ? row.max_date.toISOString().slice(0, 10) : String(row.max_date).slice(0, 10)) : null,
    });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Erreur serveur' }); }
};

const getDateRangeLaboPerte = async (req, res) => {
  const { laboId } = req.params;
  const { ingredientId } = req.query;
  if (!ingredientId) return res.status(400).json({ message: 'ingredientId requis' });
  try {
    const r = await pool.query(
      `SELECT MIN(date_appro) AS min_date, MAX(date_appro) AS max_date
       FROM stock_labo_daily
       WHERE labo_id = $1 AND ingredient_id = $2`,
      [laboId, ingredientId]
    );
    const row = r.rows[0];
    res.json({
      minDate: row.min_date ? (row.min_date instanceof Date ? row.min_date.toISOString().slice(0, 10) : String(row.min_date).slice(0, 10)) : null,
      maxDate: row.max_date ? (row.max_date instanceof Date ? row.max_date.toISOString().slice(0, 10) : String(row.max_date).slice(0, 10)) : null,
    });
  } catch (err) { console.error(err); res.status(500).json({ message: 'Erreur serveur' }); }
};

// ── Labo — list pertes historique ────────────────────────────────────────────
// Pertes de produits transformés du labo (table labo_pertes, produit_id renseigné).
// Projetées au même schéma de colonnes que les pertes d'articles (ingredient_id négatif).
async function fetchLaboPtPertes(laboId, { dateDebut, dateFin, typePerte, ptProduitId }) {
  const params = [laboId];
  const wheres = [`lp.labo_id = $1`, `lp.produit_id IS NOT NULL`];
  if (dateDebut) { params.push(dateDebut); wheres.push(`lp.date_perte >= $${params.length}`); }
  if (dateFin)   { params.push(dateFin);   wheres.push(`lp.date_perte <= $${params.length}`); }
  if (typePerte && ['avarie', 'dechet'].includes(typePerte)) { params.push(typePerte); wheres.push(`lp.type_perte = $${params.length}`); }
  if (ptProduitId) { params.push(ptProduitId); wheres.push(`lp.produit_id = $${params.length}`); }
  const r = await pool.query(
    `SELECT lp.id, -(lp.produit_id) AS ingredient_id, lp.produit_id,
            p.nom AS ingredient_nom, 'unité'::text AS unite_nom, 'Produits Transformés'::text AS categorie_nom,
            lp.quantite, lp.prix_unitaire, lp.type_perte, lp.date_perte, lp.created_at, lp.created_by
     FROM labo_pertes lp JOIN produits p ON p.id = lp.produit_id
     WHERE ${wheres.join(' AND ')}
     ORDER BY lp.date_perte DESC, lp.created_at DESC`,
    params
  );
  return r.rows;
}

const listLaboPertes = async (req, res) => {
  const { laboId } = req.params;
  const { dateDebut, dateFin, typePerte, categorieId, ingredientId, search, ptOnly, ptProduitId } = req.query;
  const clientId = req.user.gerant_parent_id || req.user.id;

  try {
    // Ownership check
    const ownerCheck = await pool.query(
      `SELECT l.id FROM labos l
       JOIN profil_entreprise pe ON l.entreprise_id = pe.id
       WHERE l.id = $1 AND pe.client_id = $2`,
      [laboId, clientId]
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ message: 'Labo introuvable' });

    const params = [laboId];
    const wheres = [`lp.labo_id = $1`, `lp.ingredient_id IS NOT NULL`];

    if (dateDebut)  { params.push(dateDebut); wheres.push(`lp.date_perte >= $${params.length}`); }
    if (dateFin)    { params.push(dateFin);   wheres.push(`lp.date_perte <= $${params.length}`); }
    if (typePerte && ['avarie', 'dechet'].includes(typePerte)) { params.push(typePerte); wheres.push(`lp.type_perte = $${params.length}`); }
    if (categorieId){ params.push(categorieId); wheres.push(`i.categorie_id = $${params.length}`); }
    if (ingredientId){ params.push(ingredientId); wheres.push(`lp.ingredient_id = $${params.length}`); }
    if (search)     { params.push(`%${search}%`); wheres.push(`i.nom ILIKE $${params.length}`); }

    const result = await pool.query(
      `SELECT lp.id, lp.labo_id, lp.ingredient_id,
              i.nom AS ingredient_nom, u.nom AS unite_nom,
              COALESCE(c.nom, 'Sans catégorie') AS categorie_nom,
              lp.quantite, lp.prix_unitaire, lp.type_perte, lp.date_perte, lp.created_at,
              lp.created_by, ub.nom AS created_by_nom
       FROM labo_pertes lp
       JOIN articles i ON i.id = lp.ingredient_id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       LEFT JOIN utilisateurs ub ON ub.id = lp.created_by
       WHERE ${wheres.join(' AND ')}
       ORDER BY lp.date_perte DESC, lp.created_at DESC`,
      params
    );

    const mapDate = (d) => d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10);
    let rows = result.rows.map((r) => ({
      id: r.id,
      laboId: r.labo_id,
      ingredientId: r.ingredient_id,
      ingredientNom: r.ingredient_nom,
      uniteNom: r.unite_nom,
      categorieNom: r.categorie_nom ?? null,
      quantite: parseFloat(r.quantite),
      prixUnitaire: r.prix_unitaire != null ? parseFloat(r.prix_unitaire) : null,
      typePerte: r.type_perte,
      datePerte: mapDate(r.date_perte),
      createdAt: r.created_at,
      createdBy: r.created_by ?? null,
      createdByNom: r.created_by_nom ?? null,
    }));

    // Pertes de produits transformés (table séparée) — incluses par défaut sans filtre
    // article/catégorie/recherche, ou seules si ptOnly.
    const includePt = ptOnly === 'true' || (!categorieId && !ingredientId && !search);
    if (includePt) {
      const ptRows = await fetchLaboPtPertes(laboId, { dateDebut, dateFin, typePerte, ptProduitId });
      const ptMapped = ptRows.map((r) => ({
        id: r.id,
        laboId: Number(laboId),
        ingredientId: r.ingredient_id,
        ingredientNom: r.ingredient_nom,
        uniteNom: 'unité',
        categorieNom: 'Produits Transformés',
        quantite: parseFloat(r.quantite),
        prixUnitaire: r.prix_unitaire != null ? parseFloat(r.prix_unitaire) : null,
        typePerte: r.type_perte,
        datePerte: mapDate(r.date_perte),
        createdAt: r.created_at,
        createdBy: r.created_by ?? null,
        createdByNom: null,
      }));
      rows = ptOnly === 'true' ? ptMapped
        : [...rows, ...ptMapped].sort((a, b) => (b.datePerte || '').localeCompare(a.datePerte || ''));
    }

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Labo — export Excel ───────────────────────────────────────────────────────

const exportLaboPerteExcel = async (req, res) => {
  const { laboId } = req.params;
  const { dateDebut, dateFin, typePerte, categorieId, ingredientId, search, selectedIds, ptOnly, ptProduitId } = req.query;
  const clientId = req.user.gerant_parent_id || req.user.id;

  try {
    const ownerCheck = await pool.query(
      `SELECT l.id FROM labos l JOIN profil_entreprise pe ON l.entreprise_id = pe.id WHERE l.id = $1 AND pe.client_id = $2`,
      [laboId, clientId]
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ message: 'Labo introuvable' });

    const laboRes = await pool.query('SELECT nom FROM labos WHERE id = $1', [laboId]);
    const laboNom = laboRes.rows[0]?.nom || 'Labo';

    const params = [laboId];
    const wheres = [`lp.labo_id = $1`, `lp.ingredient_id IS NOT NULL`];
    if (dateDebut)   { params.push(dateDebut);   wheres.push(`lp.date_perte >= $${params.length}`); }
    if (dateFin)     { params.push(dateFin);     wheres.push(`lp.date_perte <= $${params.length}`); }
    if (typePerte && ['avarie', 'dechet'].includes(typePerte)) { params.push(typePerte); wheres.push(`lp.type_perte = $${params.length}`); }
    if (categorieId) { params.push(categorieId); wheres.push(`i.categorie_id = $${params.length}`); }
    if (ingredientId){ params.push(ingredientId); wheres.push(`lp.ingredient_id = $${params.length}`); }
    if (search)      { params.push(`%${search}%`); wheres.push(`i.nom ILIKE $${params.length}`); }

    const idList = selectedIds ? String(selectedIds).split(',').map(Number).filter(Boolean) : [];

    const result = await pool.query(
      `SELECT lp.id, lp.ingredient_id, i.nom AS ingredient_nom, u.nom AS unite_nom,
              COALESCE(c.nom, 'Sans catégorie') AS categorie_nom,
              lp.quantite, lp.prix_unitaire, lp.type_perte, lp.date_perte, lp.created_at
       FROM labo_pertes lp
       JOIN articles i ON i.id = lp.ingredient_id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       WHERE ${wheres.join(' AND ')}
       ORDER BY lp.date_perte DESC, lp.created_at DESC`,
      params
    );
    let exRows = result.rows;
    const includePt = ptOnly === 'true' || (!categorieId && !ingredientId && !search);
    if (includePt) {
      const ptRows = await fetchLaboPtPertes(laboId, { dateDebut, dateFin, typePerte, ptProduitId });
      exRows = ptOnly === 'true' ? ptRows
        : [...exRows, ...ptRows].sort((a, b) => new Date(b.date_perte) - new Date(a.date_perte));
    }
    res.setHeader('Content-Disposition', `attachment; filename="Historique-Pertes-Labo-${laboNom}.xlsx"`);
    await buildExcelPertes(res, exRows, false, { dateDebut, dateFin, selectedIds: idList });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur génération Excel' });
  }
};

// ── Entreprise pertes — export PDF ────────────────────────────────────────────

const exportEntreprisePertesPdf = async (req, res) => {
  if (req.user.role === 'gerant') { if (!scopeGerantActivite(req, res)) return; }
  const { activiteId, activiteIds, dateDebut, dateFin, typePerte, categorieId, ingredientId, search } = req.query;
  const companyCheck = await pool.query(
    `SELECT pe.id FROM profil_entreprise pe WHERE pe.client_id = $1`,
    [req.user.gerant_parent_id || req.user.id]
  );
  if (companyCheck.rows.length === 0) return res.status(404).json({ message: 'Entreprise introuvable' });
  const entrepriseId = companyCheck.rows[0].id;

  const params = [entrepriseId];
  const wheres = [`a.entreprise_id = $1`];
  if (activiteId) { params.push(activiteId); wheres.push(`p.activite_id = $${params.length}`); }
  else if (activiteIds) { params.push(activiteIds.split(',').map(Number)); wheres.push(`p.activite_id = ANY($${params.length}::int[])`); }
  if (dateDebut) { params.push(dateDebut); wheres.push(`p.date_perte >= $${params.length}`); }
  if (dateFin)   { params.push(dateFin);   wheres.push(`p.date_perte <= $${params.length}`); }
  if (typePerte && ['avarie', 'dechet'].includes(typePerte)) { params.push(typePerte); wheres.push(`p.type_perte = $${params.length}`); }
  if (categorieId) { params.push(categorieId); wheres.push(`i.categorie_id = $${params.length}`); }
  if (ingredientId) { params.push(ingredientId); wheres.push(`p.ingredient_id = $${params.length}`); }
  if (search) { params.push(`%${search}%`); wheres.push(`i.nom ILIKE $${params.length}`); }

  try {
    const result = await pool.query(
      `SELECT p.id, p.activite_id, a.nom AS activite_nom,
              i.nom AS ingredient_nom, u.nom AS unite_nom,
              COALESCE(c.nom, 'Sans catégorie') AS categorie_nom,
              p.quantite, p.prix_unitaire, p.type_perte, p.date_perte
       FROM pertes p JOIN activites a ON a.id = p.activite_id
       JOIN articles i ON i.id = p.ingredient_id JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       WHERE ${wheres.join(' AND ')} ORDER BY p.date_perte DESC, p.created_at DESC`,
      params
    );
    await buildHistoriquePertesPdf(res, result.rows, { dateDebut, dateFin });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ message: 'Erreur génération PDF' });
  }
};

// ── Labo pertes — export PDF ──────────────────────────────────────────────────

const exportLaboPertesPdf = async (req, res) => {
  const { laboId } = req.params;
  const { dateDebut, dateFin, typePerte, categorieId, ingredientId, search, ptOnly, ptProduitId } = req.query;
  const clientId = req.user.gerant_parent_id || req.user.id;

  try {
    const ownerCheck = await pool.query(
      `SELECT l.id FROM labos l JOIN profil_entreprise pe ON l.entreprise_id = pe.id WHERE l.id = $1 AND pe.client_id = $2`,
      [laboId, clientId]
    );
    if (ownerCheck.rows.length === 0) return res.status(404).json({ message: 'Labo introuvable' });

    const laboRes = await pool.query('SELECT nom FROM labos WHERE id = $1', [laboId]);
    const laboNom = laboRes.rows[0]?.nom || 'Labo';

    const params = [laboId];
    const wheres = [`lp.labo_id = $1`, `lp.ingredient_id IS NOT NULL`];
    if (dateDebut) { params.push(dateDebut); wheres.push(`lp.date_perte >= $${params.length}`); }
    if (dateFin)   { params.push(dateFin);   wheres.push(`lp.date_perte <= $${params.length}`); }
    if (typePerte && ['avarie', 'dechet'].includes(typePerte)) { params.push(typePerte); wheres.push(`lp.type_perte = $${params.length}`); }
    if (categorieId) { params.push(categorieId); wheres.push(`i.categorie_id = $${params.length}`); }
    if (ingredientId){ params.push(ingredientId); wheres.push(`lp.ingredient_id = $${params.length}`); }
    if (search)      { params.push(`%${search}%`); wheres.push(`i.nom ILIKE $${params.length}`); }

    const result = await pool.query(
      `SELECT lp.id, lp.ingredient_id, i.nom AS ingredient_nom, u.nom AS unite_nom,
              COALESCE(c.nom, 'Sans catégorie') AS categorie_nom,
              lp.quantite, lp.prix_unitaire, lp.type_perte, lp.date_perte
       FROM labo_pertes lp JOIN articles i ON i.id = lp.ingredient_id
       JOIN unites u ON i.unite_id = u.id LEFT JOIN categories c ON i.categorie_id = c.id
       WHERE ${wheres.join(' AND ')} ORDER BY lp.date_perte DESC, lp.created_at DESC`,
      params
    );
    let pdfRows = result.rows;
    const includePt = ptOnly === 'true' || (!categorieId && !ingredientId && !search);
    if (includePt) {
      const ptRows = await fetchLaboPtPertes(laboId, { dateDebut, dateFin, typePerte, ptProduitId });
      pdfRows = ptOnly === 'true' ? ptRows
        : [...pdfRows, ...ptRows].sort((a, b) => new Date(b.date_perte) - new Date(a.date_perte));
    }
    await buildLaboHistoriquePertesPdf(res, pdfRows, laboNom, { dateDebut, dateFin });
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ message: 'Erreur génération PDF' });
  }
};

module.exports = {
  createPerte, listPertes,
  listEntreprisePertes, updateEntreprisePerte, deleteEntreprisePerte, exportEntreprisePertes, exportEntreprisePertesPdf,
  getPrixEntreprisePerte, getDateRangeEntreprisePerte,
  getPrixLaboPerte, getDateRangeLaboPerte,
  listLaboPertes, exportLaboPerteExcel, exportLaboPertesPdf,
};
