const pool = require('../config/database');
const ExcelJS = require('exceljs');

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
  typePerte: r.type_perte,
  datePerte: r.date_perte instanceof Date ? r.date_perte.toISOString().slice(0, 10) : String(r.date_perte).slice(0, 10),
  createdAt: r.created_at,
});

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
      [activiteId, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });

    const r = await pool.query(
      `INSERT INTO pertes (activite_id, ingredient_id, quantite, type_perte, date_perte)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [activiteId, ingredientId, quantite, typePerte, datePerte]
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
      [activiteId, req.user.id]
    );
    if (check.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });

    const params = [activiteId];
    let extra = '';
    if (ingredientId) { params.push(ingredientId); extra = `AND p.ingredient_id = $${params.length}`; }

    const result = await pool.query(
      `SELECT p.id, p.ingredient_id, i.nom as ingredient_nom, u.nom as unite_nom,
              p.quantite, p.type_perte, p.date_perte, p.created_at
       FROM pertes p
       JOIN ingredients i ON i.id = p.ingredient_id
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

// ── Client indép — list ───────────────────────────────────────────────────────

const listClientPertes = async (req, res) => {
  const { dateDebut, dateFin, typePerte, categorieId, ingredientId, search } = req.query;
  const params = [req.user.id];
  const wheres = [`cp.client_id = $1`, `cp.ingredient_id IS NOT NULL`];

  if (dateDebut) { params.push(dateDebut); wheres.push(`cp.date_perte >= $${params.length}`); }
  if (dateFin)   { params.push(dateFin);   wheres.push(`cp.date_perte <= $${params.length}`); }
  if (typePerte && ['avarie', 'dechet'].includes(typePerte)) { params.push(typePerte); wheres.push(`cp.type_perte = $${params.length}`); }
  if (categorieId) { params.push(categorieId); wheres.push(`i.categorie_id = $${params.length}`); }
  if (ingredientId) { params.push(ingredientId); wheres.push(`cp.ingredient_id = $${params.length}`); }
  if (search) { params.push(`%${search}%`); wheres.push(`i.nom ILIKE $${params.length}`); }

  try {
    const result = await pool.query(
      `SELECT cp.id, cp.ingredient_id, i.nom AS ingredient_nom, u.nom AS unite_nom,
              COALESCE(c.nom, 'Sans catégorie') AS categorie_nom,
              cp.quantite, cp.type_perte, cp.date_perte, cp.created_at
       FROM client_pertes cp
       JOIN ingredients i ON i.id = cp.ingredient_id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       WHERE ${wheres.join(' AND ')}
       ORDER BY cp.date_perte DESC, cp.created_at DESC`,
      params
    );
    res.json(result.rows.map(mapPerte));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Client indép — update ─────────────────────────────────────────────────────

const updateClientPerte = async (req, res) => {
  const { id } = req.params;
  const { quantite, typePerte } = req.body;
  if (!quantite || !typePerte) return res.status(400).json({ message: 'quantite et typePerte requis' });
  if (!['avarie', 'dechet'].includes(typePerte)) return res.status(400).json({ message: 'typePerte invalide' });
  if (parseFloat(quantite) <= 0) return res.status(400).json({ message: 'quantite doit être > 0' });
  try {
    const r = await pool.query(
      `UPDATE client_pertes SET quantite = $1, type_perte = $2
       WHERE id = $3 AND client_id = $4 RETURNING id`,
      [quantite, typePerte, id, req.user.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Perte introuvable' });
    res.json({ message: 'Mise à jour effectuée' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Client indép — delete ─────────────────────────────────────────────────────

const deleteClientPerte = async (req, res) => {
  const { id } = req.params;
  try {
    const r = await pool.query(
      `DELETE FROM client_pertes WHERE id = $1 AND client_id = $2 RETURNING id`,
      [id, req.user.id]
    );
    if (r.rows.length === 0) return res.status(404).json({ message: 'Perte introuvable' });
    res.json({ message: 'Perte supprimée' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Entreprise — list (all activités) ────────────────────────────────────────

const listEntreprisePertes = async (req, res) => {
  const { activiteId, dateDebut, dateFin, typePerte, categorieId, ingredientId, search } = req.query;

  // Verify company ownership
  const companyCheck = await pool.query(
    `SELECT pe.id FROM profil_entreprise pe WHERE pe.client_id = $1`,
    [req.user.id]
  );
  if (companyCheck.rows.length === 0) return res.status(404).json({ message: 'Entreprise introuvable' });
  const entrepriseId = companyCheck.rows[0].id;

  const params = [entrepriseId];
  const wheres = [`a.entreprise_id = $1`];

  if (activiteId) { params.push(activiteId); wheres.push(`p.activite_id = $${params.length}`); }
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
              p.quantite, p.type_perte, p.date_perte, p.created_at
       FROM pertes p
       JOIN activites a ON a.id = p.activite_id
       JOIN ingredients i ON i.id = p.ingredient_id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
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
  const { quantite, typePerte } = req.body;
  if (!quantite || !typePerte) return res.status(400).json({ message: 'quantite et typePerte requis' });
  if (!['avarie', 'dechet'].includes(typePerte)) return res.status(400).json({ message: 'typePerte invalide' });
  if (parseFloat(quantite) <= 0) return res.status(400).json({ message: 'quantite doit être > 0' });
  try {
    const r = await pool.query(
      `UPDATE pertes p SET quantite = $1, type_perte = $2
       FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE p.id = $3 AND p.activite_id = a.id AND pe.client_id = $4
       RETURNING p.id`,
      [quantite, typePerte, id, req.user.id]
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
    const r = await pool.query(
      `DELETE FROM pertes p
       USING activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE p.id = $1 AND p.activite_id = a.id AND pe.client_id = $2
       RETURNING p.id`,
      [id, req.user.id]
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

  rows.forEach((r, i) => {
    const qty = parseFloat(r.quantite);
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
    ];
    const dataRow = sheet.addRow(rowData);

    let bg = i % 2 === 0 ? WHITE : ALT;
    if (isSelected) bg = isAvarie ? 'FFB3B3' : 'FFCC99';

    for (let c = 1; c <= cols.length; c++) {
      const cell = dataRow.getCell(c);
      cell.font = { ...bodyFont, bold: isSelected };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
      cell.border = border;
      const colIdx = cols.findIndex((col) => col.header === (c === 1 ? 'Date' : cols[c - 1]?.header));
      cell.alignment = { vertical: 'middle', horizontal: c === 5 ? 'right' : 'left' };
    }
    const qtyCell = dataRow.getCell(isEntreprise ? 5 : 4);
    qtyCell.numFmt = '#,##0.000';
    qtyCell.alignment = { horizontal: 'right', vertical: 'middle' };
    dataRow.height = 16;
  });

  // Total row
  const totalColIdx = isEntreprise ? 5 : 4;
  const totalRowData = Array(cols.length).fill('');
  totalRowData[0] = 'TOTAL';
  totalRowData[totalColIdx - 1] = totalQty;
  const totalRow = sheet.addRow(totalRowData);
  totalRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { name: 'Calibri', bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
    cell.border = border;
    cell.alignment = { vertical: 'middle', horizontal: 'right' };
  });
  totalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
  totalRow.getCell(totalColIdx).numFmt = '#,##0.000';
  totalRow.height = 18;

  // Footer
  sheet.addRow([]);
  const footerRow = sheet.addRow([`Généré le ${new Date().toLocaleDateString('fr-TN', { dateStyle: 'long' })} — ${rows.length} perte(s)`]);
  footerRow.getCell(1).font = { name: 'Calibri', italic: true, size: 9, color: { argb: '888888' } };

  const dateTag = filters.dateDebut ? filters.dateDebut : new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="Historique-Pertes-${dateTag}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
};

// ── Client indép — export Excel ───────────────────────────────────────────────

const exportClientPertes = async (req, res) => {
  const { dateDebut, dateFin, typePerte, categorieId, ingredientId, search, selectedIds } = req.query;
  const params = [req.user.id];
  const wheres = [`cp.client_id = $1`, `cp.ingredient_id IS NOT NULL`];

  if (dateDebut) { params.push(dateDebut); wheres.push(`cp.date_perte >= $${params.length}`); }
  if (dateFin)   { params.push(dateFin);   wheres.push(`cp.date_perte <= $${params.length}`); }
  if (typePerte && ['avarie', 'dechet'].includes(typePerte)) { params.push(typePerte); wheres.push(`cp.type_perte = $${params.length}`); }
  if (categorieId) { params.push(categorieId); wheres.push(`i.categorie_id = $${params.length}`); }
  if (ingredientId) { params.push(ingredientId); wheres.push(`cp.ingredient_id = $${params.length}`); }
  if (search) { params.push(`%${search}%`); wheres.push(`i.nom ILIKE $${params.length}`); }

  // If specific IDs requested, filter to those
  const idList = selectedIds ? String(selectedIds).split(',').map(Number).filter(Boolean) : [];
  if (idList.length > 0) { params.push(idList); wheres.push(`cp.id = ANY($${params.length})`); }

  try {
    const result = await pool.query(
      `SELECT cp.id, cp.ingredient_id, i.nom AS ingredient_nom, u.nom AS unite_nom,
              COALESCE(c.nom, 'Sans catégorie') AS categorie_nom,
              cp.quantite, cp.type_perte, cp.date_perte, cp.created_at
       FROM client_pertes cp
       JOIN ingredients i ON i.id = cp.ingredient_id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       WHERE ${wheres.join(' AND ')}
       ORDER BY cp.date_perte DESC, cp.created_at DESC`,
      params
    );
    await buildExcelPertes(res, result.rows, false, { dateDebut, dateFin, selectedIds: idList });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur génération Excel' });
  }
};

// ── Entreprise — export Excel ─────────────────────────────────────────────────

const exportEntreprisePertes = async (req, res) => {
  const { activiteId, dateDebut, dateFin, typePerte, categorieId, ingredientId, search, selectedIds } = req.query;

  const companyCheck = await pool.query(
    `SELECT pe.id FROM profil_entreprise pe WHERE pe.client_id = $1`,
    [req.user.id]
  );
  if (companyCheck.rows.length === 0) return res.status(404).json({ message: 'Entreprise introuvable' });
  const entrepriseId = companyCheck.rows[0].id;

  const params = [entrepriseId];
  const wheres = [`a.entreprise_id = $1`];

  if (activiteId) { params.push(activiteId); wheres.push(`p.activite_id = $${params.length}`); }
  if (dateDebut) { params.push(dateDebut); wheres.push(`p.date_perte >= $${params.length}`); }
  if (dateFin)   { params.push(dateFin);   wheres.push(`p.date_perte <= $${params.length}`); }
  if (typePerte && ['avarie', 'dechet'].includes(typePerte)) { params.push(typePerte); wheres.push(`p.type_perte = $${params.length}`); }
  if (categorieId) { params.push(categorieId); wheres.push(`i.categorie_id = $${params.length}`); }
  if (ingredientId) { params.push(ingredientId); wheres.push(`p.ingredient_id = $${params.length}`); }
  if (search) { params.push(`%${search}%`); wheres.push(`i.nom ILIKE $${params.length}`); }

  const idList = selectedIds ? String(selectedIds).split(',').map(Number).filter(Boolean) : [];
  if (idList.length > 0) { params.push(idList); wheres.push(`p.id = ANY($${params.length})`); }

  try {
    const result = await pool.query(
      `SELECT p.id, p.activite_id, a.nom AS activite_nom,
              p.ingredient_id, i.nom AS ingredient_nom, u.nom AS unite_nom,
              COALESCE(c.nom, 'Sans catégorie') AS categorie_nom,
              p.quantite, p.type_perte, p.date_perte, p.created_at
       FROM pertes p
       JOIN activites a ON a.id = p.activite_id
       JOIN ingredients i ON i.id = p.ingredient_id
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

module.exports = {
  createPerte, listPertes,
  listClientPertes, updateClientPerte, deleteClientPerte, exportClientPertes,
  listEntreprisePertes, updateEntreprisePerte, deleteEntreprisePerte, exportEntreprisePertes,
};
