const pool = require('../config/database');
const ExcelJS = require('exceljs');

const isoDate = (d) => {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
};

async function checkLaboOwner(laboId, userId) {
  const r = await pool.query(
    `SELECT l.id FROM labos l JOIN profil_entreprise pe ON l.entreprise_id = pe.id
     WHERE l.id = $1 AND pe.client_id = $2`,
    [laboId, userId]
  );
  return r.rows.length > 0;
}

async function checkActiviteOwner(activiteId, userId) {
  const r = await pool.query(
    `SELECT a.id FROM activites a JOIN profil_entreprise pe ON a.entreprise_id = pe.id
     WHERE a.id = $1 AND pe.client_id = $2
     UNION
     SELECT a.id FROM activites a WHERE a.id = $1 AND a.client_id = $3`,
    [activiteId, userId, userId]
  );
  return r.rows.length > 0;
}

// ─── GET labo inventaire stock ────────────────────────────────────────────────

const getLaboInventaireStock = async (req, res) => {
  const { laboId } = req.params;
  try {
    const ok = await checkLaboOwner(laboId, req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const ingRes = await pool.query(
      `SELECT i.id as ingredient_id, i.nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie, lis.seuil_min
       FROM labo_ingredient_selections lis
       JOIN ingredients i ON lis.ingredient_id = i.id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       WHERE lis.labo_id = $1
       ORDER BY categorie NULLS LAST, i.nom`,
      [laboId]
    );

    // Last 5 inventaires per ingredient (for collapsible history)
    const recentInvRes = await pool.query(
      `SELECT id, ingredient_id, quantite_reelle, date_inventaire
       FROM inventaires
       WHERE labo_id = $1 AND ingredient_id IS NOT NULL
       ORDER BY ingredient_id, date_inventaire DESC, created_at DESC`,
      [laboId]
    );
    const recentInvMap = {};
    for (const r of recentInvRes.rows) {
      if (!recentInvMap[r.ingredient_id]) recentInvMap[r.ingredient_id] = [];
      if (recentInvMap[r.ingredient_id].length < 5) {
        recentInvMap[r.ingredient_id].push({
          id: r.id,
          qty: parseFloat(r.quantite_reelle),
          date: isoDate(r.date_inventaire),
        });
      }
    }
    // All distinct inventaire dates per ingredient (for alarm on any date)
    const allDatesRes = await pool.query(
      `SELECT ingredient_id, ARRAY_AGG(DISTINCT date_inventaire::text) as dates
       FROM inventaires
       WHERE labo_id = $1 AND ingredient_id IS NOT NULL
       GROUP BY ingredient_id`,
      [laboId]
    );
    const allDatesMap = {};
    for (const r of allDatesRes.rows) {
      allDatesMap[r.ingredient_id] = (r.dates || []).map(isoDate).filter(Boolean);
    }

    res.json(ingRes.rows.map((r) => ({
      ingredientId: r.ingredient_id,
      nom: r.nom,
      unite: r.unite_nom,
      categorie: r.categorie,
      seuilMin: r.seuil_min !== null ? parseFloat(r.seuil_min) : null,
      recentInventaires: recentInvMap[r.ingredient_id] || [],
      inventaireDates: allDatesMap[r.ingredient_id] || [],
    })));
  } catch (err) {
    console.error('[getLaboInventaireStock]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── POST save labo inventaire ────────────────────────────────────────────────

const saveLaboInventaire = async (req, res) => {
  const { laboId } = req.params;
  const { dateInventaire, entries } = req.body;
  if (!dateInventaire || !Array.isArray(entries) || entries.length === 0)
    return res.status(400).json({ message: 'dateInventaire et entries[] requis' });
  try {
    const ok = await checkLaboOwner(laboId, req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const upserted = [];
    for (const e of entries) {
      const r = await pool.query(
        `INSERT INTO inventaires (labo_id, ingredient_id, quantite_reelle, date_inventaire, note)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (labo_id, ingredient_id, date_inventaire)
           WHERE labo_id IS NOT NULL AND ingredient_id IS NOT NULL
         DO UPDATE SET quantite_reelle = EXCLUDED.quantite_reelle, note = EXCLUDED.note, updated_at = NOW()
         RETURNING id, ingredient_id, quantite_reelle, date_inventaire, note, created_at`,
        [laboId, e.ingredientId, e.quantiteReelle, dateInventaire, e.note || null]
      );
      upserted.push(r.rows[0]);
    }
    res.json(upserted.map((r) => ({
      id: r.id,
      ingredientId: r.ingredient_id,
      quantiteReelle: parseFloat(r.quantite_reelle),
      dateInventaire: isoDate(r.date_inventaire),
      note: r.note,
      createdAt: r.created_at,
    })));
  } catch (err) {
    console.error('[saveLaboInventaire]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── GET activite inventaire stock ───────────────────────────────────────────

const getActiviteInventaireStock = async (req, res) => {
  const { activiteId } = req.params;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité introuvable' });

    const ingRes = await pool.query(
      `SELECT i.id as ingredient_id, i.nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie, ais.seuil_min
       FROM activite_ingredient_selections ais
       JOIN ingredients i ON ais.ingredient_id = i.id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       WHERE ais.activite_id = $1
       ORDER BY categorie NULLS LAST, i.nom`,
      [activiteId]
    );

    const recentInvRes = await pool.query(
      `SELECT id, ingredient_id, quantite_reelle, date_inventaire
       FROM inventaires
       WHERE activite_id = $1 AND ingredient_id IS NOT NULL
       ORDER BY ingredient_id, date_inventaire DESC, created_at DESC`,
      [activiteId]
    );
    const recentInvMap = {};
    for (const r of recentInvRes.rows) {
      if (!recentInvMap[r.ingredient_id]) recentInvMap[r.ingredient_id] = [];
      if (recentInvMap[r.ingredient_id].length < 5) {
        recentInvMap[r.ingredient_id].push({
          id: r.id, qty: parseFloat(r.quantite_reelle), date: isoDate(r.date_inventaire),
        });
      }
    }
    const allDatesRes = await pool.query(
      `SELECT ingredient_id, ARRAY_AGG(DISTINCT date_inventaire::text) as dates
       FROM inventaires
       WHERE activite_id = $1 AND ingredient_id IS NOT NULL
       GROUP BY ingredient_id`,
      [activiteId]
    );
    const allDatesMap = {};
    for (const r of allDatesRes.rows) {
      allDatesMap[r.ingredient_id] = (r.dates || []).map(isoDate).filter(Boolean);
    }

    res.json(ingRes.rows.map((r) => ({
      ingredientId: r.ingredient_id,
      nom: r.nom,
      unite: r.unite_nom,
      categorie: r.categorie,
      seuilMin: r.seuil_min !== null ? parseFloat(r.seuil_min) : null,
      recentInventaires: recentInvMap[r.ingredient_id] || [],
      inventaireDates: allDatesMap[r.ingredient_id] || [],
    })));
  } catch (err) {
    console.error('[getActiviteInventaireStock]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── POST save activite inventaire ───────────────────────────────────────────

const saveActiviteInventaire = async (req, res) => {
  const { activiteId } = req.params;
  const { dateInventaire, entries } = req.body;
  if (!dateInventaire || !Array.isArray(entries) || entries.length === 0)
    return res.status(400).json({ message: 'dateInventaire et entries[] requis' });
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité introuvable' });

    const upserted = [];
    for (const e of entries) {
      const r = await pool.query(
        `INSERT INTO inventaires (activite_id, ingredient_id, quantite_reelle, date_inventaire, note)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (activite_id, ingredient_id, date_inventaire)
           WHERE activite_id IS NOT NULL AND ingredient_id IS NOT NULL
         DO UPDATE SET quantite_reelle = EXCLUDED.quantite_reelle, note = EXCLUDED.note, updated_at = NOW()
         RETURNING id, ingredient_id, quantite_reelle, date_inventaire, note, created_at`,
        [activiteId, e.ingredientId, e.quantiteReelle, dateInventaire, e.note || null]
      );
      upserted.push(r.rows[0]);
    }
    res.json(upserted.map((r) => ({
      id: r.id,
      ingredientId: r.ingredient_id,
      quantiteReelle: parseFloat(r.quantite_reelle),
      dateInventaire: isoDate(r.date_inventaire),
      note: r.note,
      createdAt: r.created_at,
    })));
  } catch (err) {
    console.error('[saveActiviteInventaire]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── GET historique inventaire (labo) ────────────────────────────────────────

const getLaboInventaireHistorique = async (req, res) => {
  const { laboId } = req.params;
  const { startDate, endDate, ingredientId } = req.query;
  try {
    const ok = await checkLaboOwner(laboId, req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const conditions = ['inv.labo_id = $1'];
    const params = [laboId];
    let idx = 2;
    if (startDate)    { conditions.push(`inv.date_inventaire >= $${idx++}`); params.push(startDate); }
    if (endDate)      { conditions.push(`inv.date_inventaire <= $${idx++}`); params.push(endDate); }
    if (ingredientId) { conditions.push(`inv.ingredient_id = $${idx++}`); params.push(ingredientId); }

    const result = await pool.query(
      `SELECT inv.id, inv.date_inventaire, inv.quantite_reelle, inv.note, inv.created_at, inv.updated_at,
              i.id as ingredient_id, i.nom as ingredient_nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie_nom,
              l.nom as labo_nom
       FROM inventaires inv
       LEFT JOIN ingredients i ON i.id = inv.ingredient_id
       LEFT JOIN unites u ON u.id = i.unite_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       LEFT JOIN labos l ON l.id = inv.labo_id
       WHERE ${conditions.join(' AND ')} AND inv.ingredient_id IS NOT NULL
       ORDER BY inv.date_inventaire DESC, inv.created_at DESC`,
      params
    );

    res.json(result.rows.map((r) => ({
      id: r.id,
      dateInventaire: isoDate(r.date_inventaire),
      quantiteReelle: parseFloat(r.quantite_reelle),
      note: r.note,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      ingredientId: r.ingredient_id,
      ingredientNom: r.ingredient_nom,
      unite: r.unite_nom,
      categorie: r.categorie_nom,
      laboNom: r.labo_nom,
    })));
  } catch (err) {
    console.error('[getLaboInventaireHistorique]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── GET historique inventaire (activite) ────────────────────────────────────

const getActiviteInventaireHistorique = async (req, res) => {
  const { activiteId } = req.params;
  const { startDate, endDate, ingredientId } = req.query;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité introuvable' });

    const conditions = ['inv.activite_id = $1'];
    const params = [activiteId];
    let idx = 2;
    if (startDate)    { conditions.push(`inv.date_inventaire >= $${idx++}`); params.push(startDate); }
    if (endDate)      { conditions.push(`inv.date_inventaire <= $${idx++}`); params.push(endDate); }
    if (ingredientId) { conditions.push(`inv.ingredient_id = $${idx++}`); params.push(ingredientId); }

    const result = await pool.query(
      `SELECT inv.id, inv.date_inventaire, inv.quantite_reelle, inv.note, inv.created_at, inv.updated_at,
              i.id as ingredient_id, i.nom as ingredient_nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie_nom,
              a.nom as activite_nom
       FROM inventaires inv
       LEFT JOIN ingredients i ON i.id = inv.ingredient_id
       LEFT JOIN unites u ON u.id = i.unite_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       LEFT JOIN activites a ON a.id = inv.activite_id
       WHERE ${conditions.join(' AND ')} AND inv.ingredient_id IS NOT NULL
       ORDER BY inv.date_inventaire DESC, inv.created_at DESC`,
      params
    );

    res.json(result.rows.map((r) => ({
      id: r.id,
      dateInventaire: isoDate(r.date_inventaire),
      quantiteReelle: parseFloat(r.quantite_reelle),
      note: r.note,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      ingredientId: r.ingredient_id,
      ingredientNom: r.ingredient_nom,
      unite: r.unite_nom,
      categorie: r.categorie_nom,
      activiteNom: r.activite_nom,
    })));
  } catch (err) {
    console.error('[getActiviteInventaireHistorique]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── PUT update inventaire entry ─────────────────────────────────────────────

const updateInventaireEntry = async (req, res) => {
  const { inventaireId } = req.params;
  const { quantiteReelle, note } = req.body;
  if (quantiteReelle === undefined || quantiteReelle === null)
    return res.status(400).json({ message: 'quantiteReelle requis' });
  try {
    const check = await pool.query(
      `SELECT inv.id FROM inventaires inv
       LEFT JOIN labos l ON l.id = inv.labo_id
       LEFT JOIN activites a ON a.id = inv.activite_id
       LEFT JOIN profil_entreprise pe1 ON l.entreprise_id = pe1.id
       LEFT JOIN profil_entreprise pe2 ON a.entreprise_id = pe2.id
       WHERE inv.id = $1 AND (pe1.client_id = $2 OR pe2.client_id = $2 OR inv.client_id = $2)`,
      [inventaireId, req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Inventaire introuvable' });

    const r = await pool.query(
      `UPDATE inventaires SET quantite_reelle = $1, note = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING id, ingredient_id, quantite_reelle, date_inventaire, note, updated_at`,
      [quantiteReelle, note !== undefined ? note : null, inventaireId]
    );
    const row = r.rows[0];
    res.json({
      id: row.id,
      ingredientId: row.ingredient_id,
      quantiteReelle: parseFloat(row.quantite_reelle),
      dateInventaire: isoDate(row.date_inventaire),
      note: row.note,
      updatedAt: row.updated_at,
    });
  } catch (err) {
    console.error('[updateInventaireEntry]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── Export Excel — labo inventaire historique ────────────────────────────────

const exportLaboInventaireExcel = async (req, res) => {
  const { laboId } = req.params;
  const { startDate, endDate, ingredientId, selectedIds: selectedIdsParam } = req.query;
  const selectedSet = new Set(selectedIdsParam ? selectedIdsParam.split(',').filter(Boolean) : []);

  try {
    const ok = await checkLaboOwner(laboId, req.user.id);
    if (!ok) return res.status(404).json({ message: 'Labo introuvable' });

    const conditions = ['inv.labo_id = $1', 'inv.ingredient_id IS NOT NULL'];
    const params = [laboId];
    let idx = 2;
    if (startDate)    { conditions.push(`inv.date_inventaire >= $${idx++}`); params.push(startDate); }
    if (endDate)      { conditions.push(`inv.date_inventaire <= $${idx++}`); params.push(endDate); }
    if (ingredientId) { conditions.push(`inv.ingredient_id = $${idx++}`); params.push(ingredientId); }

    const laboRes = await pool.query('SELECT nom FROM labos WHERE id = $1', [laboId]);
    const laboNom = laboRes.rows[0]?.nom || 'Labo';

    const result = await pool.query(
      `SELECT inv.id, inv.date_inventaire, inv.quantite_reelle, inv.note,
              i.nom as ingredient_nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie_nom
       FROM inventaires inv
       LEFT JOIN ingredients i ON i.id = inv.ingredient_id
       LEFT JOIN unites u ON u.id = i.unite_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY inv.date_inventaire DESC, inv.created_at DESC`,
      params
    );

    const rows = result.rows;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fiche Technique App';
    const sheet = workbook.addWorksheet(`Inventaire ${laboNom}`, { pageSetup: { paperSize: 9, orientation: 'landscape' } });

    const BLUE = '1F3864'; const WHITE = 'FFFFFF'; const ORANGE = 'F59E0B';
    const ALT = 'FFF7ED'; const GOLD = 'FFD700'; const TITLE_BG = '2E4A7A';
    const thin = { style: 'thin', color: { argb: 'B8CCE4' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const hdrFont = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
    const bodyFont = { name: 'Calibri', size: 10 };
    const fmtD = (d) => d ? d.split('-').reverse().join('/') : '—';

    const cols = [
      { header: 'Date', width: 12 },
      { header: 'Ingrédient', width: 26 },
      { header: 'Catégorie', width: 18 },
      { header: 'Qté réelle', width: 13 },
      { header: 'Unité', width: 9 },
      { header: 'Labo', width: 18 },
      { header: 'Note', width: 24 },
    ];
    sheet.columns = cols.map((c) => ({ width: c.width }));

    const titleText = `Historique Inventaire — ${laboNom}  —  DU : ${fmtD(startDate)}   AU : ${fmtD(endDate)}`;
    const titleRow = sheet.addRow([titleText, ...Array(cols.length - 1).fill('')]);
    sheet.mergeCells(1, 1, 1, cols.length);
    titleRow.getCell(1).font = { name: 'Calibri', bold: true, size: 13, color: { argb: WHITE } };
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_BG } };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 28;

    const hdrRow = sheet.addRow(cols.map((c) => c.header));
    hdrRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = hdrFont;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = border;
    });
    hdrRow.height = 22;
    sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };

    rows.forEach((r, i) => {
      const qty = parseFloat(r.quantite_reelle);
      const isSelected = selectedSet.has(String(r.id));
      const dateStr = r.date_inventaire ? isoDate(r.date_inventaire).split('-').reverse().join('/') : '';
      const dataRow = sheet.addRow([dateStr, r.ingredient_nom, r.categorie_nom, qty, r.unite_nom, laboNom, r.note || '']);
      const bg = isSelected ? ORANGE : (i % 2 === 0 ? WHITE : ALT);
      const txtColor = isSelected ? WHITE : '1a1a2e';
      for (let c = 1; c <= cols.length; c++) {
        const cell = dataRow.getCell(c);
        cell.font = { ...bodyFont, bold: isSelected, color: { argb: txtColor } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = border;
        cell.alignment = { vertical: 'middle', horizontal: c <= 3 ? 'left' : (c === 5 ? 'center' : c === 4 ? 'right' : 'left') };
      }
      dataRow.getCell(4).numFmt = '#,##0.000';
      dataRow.height = 16;
    });

    const totalRow = sheet.addRow(['TOTAL', '', '', rows.reduce((s, r) => s + parseFloat(r.quantite_reelle), 0), '', '', '']);
    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Calibri', bold: true, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
      cell.border = border;
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
    totalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    totalRow.getCell(4).numFmt = '#,##0.000';
    totalRow.height = 18;

    sheet.addRow([]);
    const footerRow = sheet.addRow([`Généré le ${new Date().toLocaleDateString('fr-TN', { dateStyle: 'long' })} — Labo : ${laboNom} — ${rows.length} enregistrement(s)`]);
    footerRow.getCell(1).font = { name: 'Calibri', italic: true, size: 9, color: { argb: '888888' } };
    if (selectedSet.size > 0) {
      const noteRow = sheet.addRow([`⚠ ${selectedSet.size} inventaire(s) en surbrillance = sélectionnés`]);
      noteRow.getCell(1).font = { name: 'Calibri', bold: true, size: 9, color: { argb: ORANGE } };
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Inventaire-${laboNom}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[exportLaboInventaireExcel]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── Export Excel — activite inventaire historique ────────────────────────────

const exportActiviteInventaireExcel = async (req, res) => {
  const { activiteId } = req.params;
  const { startDate, endDate, ingredientId, selectedIds: selectedIdsParam } = req.query;
  const selectedSet = new Set(selectedIdsParam ? selectedIdsParam.split(',').filter(Boolean) : []);

  try {
    const check = await pool.query(
      `SELECT a.id, a.nom FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité introuvable' });
    const activiteNom = check.rows[0].nom;

    const conditions = ['inv.activite_id = $1', 'inv.ingredient_id IS NOT NULL'];
    const params = [activiteId];
    let idx = 2;
    if (startDate)    { conditions.push(`inv.date_inventaire >= $${idx++}`); params.push(startDate); }
    if (endDate)      { conditions.push(`inv.date_inventaire <= $${idx++}`); params.push(endDate); }
    if (ingredientId) { conditions.push(`inv.ingredient_id = $${idx++}`); params.push(ingredientId); }

    const result = await pool.query(
      `SELECT inv.id, inv.date_inventaire, inv.quantite_reelle, inv.note,
              i.nom as ingredient_nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie_nom
       FROM inventaires inv
       LEFT JOIN ingredients i ON i.id = inv.ingredient_id
       LEFT JOIN unites u ON u.id = i.unite_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY inv.date_inventaire DESC, inv.created_at DESC`,
      params
    );

    const rows = result.rows;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fiche Technique App';
    const sheet = workbook.addWorksheet(`Inventaire ${activiteNom}`, { pageSetup: { paperSize: 9, orientation: 'landscape' } });

    const BLUE = '1F3864'; const WHITE = 'FFFFFF'; const ORANGE = 'F59E0B';
    const ALT = 'FFF7ED'; const GOLD = 'FFD700'; const TITLE_BG = '2E4A7A';
    const thin = { style: 'thin', color: { argb: 'B8CCE4' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const hdrFont = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
    const bodyFont = { name: 'Calibri', size: 10 };
    const fmtD = (d) => d ? d.split('-').reverse().join('/') : '—';

    const cols = [
      { header: 'Date', width: 12 },
      { header: 'Ingrédient', width: 26 },
      { header: 'Catégorie', width: 18 },
      { header: 'Qté réelle', width: 13 },
      { header: 'Unité', width: 9 },
      { header: 'Activité', width: 20 },
      { header: 'Note', width: 24 },
    ];
    sheet.columns = cols.map((c) => ({ width: c.width }));

    const titleText = `Historique Inventaire — ${activiteNom}  —  DU : ${fmtD(startDate)}   AU : ${fmtD(endDate)}`;
    const titleRow = sheet.addRow([titleText, ...Array(cols.length - 1).fill('')]);
    sheet.mergeCells(1, 1, 1, cols.length);
    titleRow.getCell(1).font = { name: 'Calibri', bold: true, size: 13, color: { argb: WHITE } };
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_BG } };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 28;

    const hdrRow = sheet.addRow(cols.map((c) => c.header));
    hdrRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = hdrFont;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = border;
    });
    hdrRow.height = 22;
    sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };

    rows.forEach((r, i) => {
      const qty = parseFloat(r.quantite_reelle);
      const isSelected = selectedSet.has(String(r.id));
      const dateStr = r.date_inventaire ? isoDate(r.date_inventaire).split('-').reverse().join('/') : '';
      const dataRow = sheet.addRow([dateStr, r.ingredient_nom, r.categorie_nom, qty, r.unite_nom, activiteNom, r.note || '']);
      const bg = isSelected ? ORANGE : (i % 2 === 0 ? WHITE : ALT);
      const txtColor = isSelected ? WHITE : '1a1a2e';
      for (let c = 1; c <= cols.length; c++) {
        const cell = dataRow.getCell(c);
        cell.font = { ...bodyFont, bold: isSelected, color: { argb: txtColor } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = border;
        cell.alignment = { vertical: 'middle', horizontal: c <= 3 ? 'left' : (c === 5 ? 'center' : c === 4 ? 'right' : 'left') };
      }
      dataRow.getCell(4).numFmt = '#,##0.000';
      dataRow.height = 16;
    });

    const totalRow = sheet.addRow(['TOTAL', '', '', rows.reduce((s, r) => s + parseFloat(r.quantite_reelle), 0), '', '', '']);
    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Calibri', bold: true, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
      cell.border = border;
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
    totalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    totalRow.getCell(4).numFmt = '#,##0.000';
    totalRow.height = 18;

    sheet.addRow([]);
    const footerRow = sheet.addRow([`Généré le ${new Date().toLocaleDateString('fr-TN', { dateStyle: 'long' })} — Activité : ${activiteNom} — ${rows.length} enregistrement(s)`]);
    footerRow.getCell(1).font = { name: 'Calibri', italic: true, size: 9, color: { argb: '888888' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Inventaire-${activiteNom}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[exportActiviteInventaireExcel]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── GET client inventaire stock (indep) ─────────────────────────────────────

const getClientInventaireStock = async (req, res) => {
  const clientId = req.user.id;
  try {
    const ingRes = await pool.query(
      `SELECT i.id as ingredient_id, i.nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie, cis.seuil_min
       FROM client_ingredient_selections cis
       JOIN ingredients i ON cis.ingredient_id = i.id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       WHERE cis.client_id = $1
       ORDER BY categorie NULLS LAST, i.nom`,
      [clientId]
    );

    const recentInvRes = await pool.query(
      `SELECT id, ingredient_id, quantite_reelle, date_inventaire
       FROM inventaires
       WHERE client_id = $1 AND ingredient_id IS NOT NULL
       ORDER BY ingredient_id, date_inventaire DESC, created_at DESC`,
      [clientId]
    );
    const recentInvMap = {};
    for (const r of recentInvRes.rows) {
      if (!recentInvMap[r.ingredient_id]) recentInvMap[r.ingredient_id] = [];
      if (recentInvMap[r.ingredient_id].length < 5) {
        recentInvMap[r.ingredient_id].push({ id: r.id, qty: parseFloat(r.quantite_reelle), date: isoDate(r.date_inventaire) });
      }
    }
    const allDatesRes = await pool.query(
      `SELECT ingredient_id, ARRAY_AGG(DISTINCT date_inventaire::text) as dates
       FROM inventaires
       WHERE client_id = $1 AND ingredient_id IS NOT NULL
       GROUP BY ingredient_id`,
      [clientId]
    );
    const allDatesMap = {};
    for (const r of allDatesRes.rows) {
      allDatesMap[r.ingredient_id] = (r.dates || []).map(isoDate).filter(Boolean);
    }

    res.json(ingRes.rows.map((r) => ({
      ingredientId: r.ingredient_id,
      nom: r.nom,
      unite: r.unite_nom,
      categorie: r.categorie,
      seuilMin: r.seuil_min !== null ? parseFloat(r.seuil_min) : null,
      recentInventaires: recentInvMap[r.ingredient_id] || [],
      inventaireDates: allDatesMap[r.ingredient_id] || [],
    })));
  } catch (err) {
    console.error('[getClientInventaireStock]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── POST save client inventaire (indep) ─────────────────────────────────────

const saveClientInventaire = async (req, res) => {
  const clientId = req.user.id;
  const { dateInventaire, entries } = req.body;
  if (!dateInventaire || !Array.isArray(entries) || entries.length === 0)
    return res.status(400).json({ message: 'dateInventaire et entries[] requis' });
  try {
    const upserted = [];
    for (const e of entries) {
      const r = await pool.query(
        `INSERT INTO inventaires (client_id, ingredient_id, quantite_reelle, date_inventaire, note)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (client_id, ingredient_id, date_inventaire)
           WHERE client_id IS NOT NULL AND ingredient_id IS NOT NULL
         DO UPDATE SET quantite_reelle = EXCLUDED.quantite_reelle, note = EXCLUDED.note, updated_at = NOW()
         RETURNING id, ingredient_id, quantite_reelle, date_inventaire, note, created_at`,
        [clientId, e.ingredientId, e.quantiteReelle, dateInventaire, e.note || null]
      );
      upserted.push(r.rows[0]);
    }
    res.json(upserted.map((r) => ({
      id: r.id,
      ingredientId: r.ingredient_id,
      quantiteReelle: parseFloat(r.quantite_reelle),
      dateInventaire: isoDate(r.date_inventaire),
      note: r.note,
      createdAt: r.created_at,
    })));
  } catch (err) {
    console.error('[saveClientInventaire]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── GET historique inventaire (client indep) ─────────────────────────────────

const getClientInventaireHistorique = async (req, res) => {
  const clientId = req.user.id;
  const { startDate, endDate, ingredientId } = req.query;
  try {
    const conditions = ['inv.client_id = $1', 'inv.ingredient_id IS NOT NULL'];
    const params = [clientId];
    let idx = 2;
    if (startDate)    { conditions.push(`inv.date_inventaire >= $${idx++}`); params.push(startDate); }
    if (endDate)      { conditions.push(`inv.date_inventaire <= $${idx++}`); params.push(endDate); }
    if (ingredientId) { conditions.push(`inv.ingredient_id = $${idx++}`); params.push(ingredientId); }

    const result = await pool.query(
      `SELECT inv.id, inv.date_inventaire, inv.quantite_reelle, inv.note, inv.created_at, inv.updated_at,
              i.id as ingredient_id, i.nom as ingredient_nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie_nom
       FROM inventaires inv
       LEFT JOIN ingredients i ON i.id = inv.ingredient_id
       LEFT JOIN unites u ON u.id = i.unite_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY inv.date_inventaire DESC, inv.created_at DESC`,
      params
    );

    res.json(result.rows.map((r) => ({
      id: r.id,
      dateInventaire: isoDate(r.date_inventaire),
      quantiteReelle: parseFloat(r.quantite_reelle),
      note: r.note,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      ingredientId: r.ingredient_id,
      ingredientNom: r.ingredient_nom,
      unite: r.unite_nom,
      categorie: r.categorie_nom,
    })));
  } catch (err) {
    console.error('[getClientInventaireHistorique]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── Export Excel — client inventaire historique ──────────────────────────────

const exportClientInventaireExcel = async (req, res) => {
  const clientId = req.user.id;
  const { startDate, endDate, ingredientId, selectedIds: selectedIdsParam } = req.query;
  const selectedSet = new Set(selectedIdsParam ? selectedIdsParam.split(',').filter(Boolean) : []);

  try {
    const conditions = ['inv.client_id = $1', 'inv.ingredient_id IS NOT NULL'];
    const params = [clientId];
    let idx = 2;
    if (startDate)    { conditions.push(`inv.date_inventaire >= $${idx++}`); params.push(startDate); }
    if (endDate)      { conditions.push(`inv.date_inventaire <= $${idx++}`); params.push(endDate); }
    if (ingredientId) { conditions.push(`inv.ingredient_id = $${idx++}`); params.push(ingredientId); }

    const result = await pool.query(
      `SELECT inv.id, inv.date_inventaire, inv.quantite_reelle, inv.note,
              i.nom as ingredient_nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie_nom
       FROM inventaires inv
       LEFT JOIN ingredients i ON i.id = inv.ingredient_id
       LEFT JOIN unites u ON u.id = i.unite_id
       LEFT JOIN categories c ON c.id = i.categorie_id
       WHERE ${conditions.join(' AND ')}
       ORDER BY inv.date_inventaire DESC, inv.created_at DESC`,
      params
    );

    const rows = result.rows;
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fiche Technique App';
    const sheet = workbook.addWorksheet('Inventaire Indép', { pageSetup: { paperSize: 9, orientation: 'landscape' } });

    const BLUE = '1F3864'; const WHITE = 'FFFFFF'; const ORANGE = 'F59E0B';
    const ALT = 'FFF7ED'; const GOLD = 'FFD700'; const TITLE_BG = '2E4A7A';
    const thin = { style: 'thin', color: { argb: 'B8CCE4' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const hdrFont = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
    const bodyFont = { name: 'Calibri', size: 10 };
    const fmtD = (d) => d ? d.split('-').reverse().join('/') : '—';

    const cols = [
      { header: 'Date', width: 12 },
      { header: 'Ingrédient', width: 26 },
      { header: 'Catégorie', width: 18 },
      { header: 'Qté réelle', width: 13 },
      { header: 'Unité', width: 9 },
      { header: 'Note', width: 24 },
    ];
    sheet.columns = cols.map((c) => ({ width: c.width }));

    const titleText = `Historique Inventaire — Compte Indépendant  —  DU : ${fmtD(startDate)}   AU : ${fmtD(endDate)}`;
    const titleRow = sheet.addRow([titleText, ...Array(cols.length - 1).fill('')]);
    sheet.mergeCells(1, 1, 1, cols.length);
    titleRow.getCell(1).font = { name: 'Calibri', bold: true, size: 13, color: { argb: WHITE } };
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_BG } };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 28;

    const hdrRow = sheet.addRow(cols.map((c) => c.header));
    hdrRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = hdrFont;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = border;
    });
    hdrRow.height = 22;
    sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };

    rows.forEach((r, i) => {
      const qty = parseFloat(r.quantite_reelle);
      const isSelected = selectedSet.has(String(r.id));
      const dateStr = r.date_inventaire ? isoDate(r.date_inventaire).split('-').reverse().join('/') : '';
      const dataRow = sheet.addRow([dateStr, r.ingredient_nom, r.categorie_nom, qty, r.unite_nom, r.note || '']);
      const bg = isSelected ? ORANGE : (i % 2 === 0 ? WHITE : ALT);
      const txtColor = isSelected ? WHITE : '1a1a2e';
      for (let c = 1; c <= cols.length; c++) {
        const cell = dataRow.getCell(c);
        cell.font = { ...bodyFont, bold: isSelected, color: { argb: txtColor } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = border;
        cell.alignment = { vertical: 'middle', horizontal: c <= 3 ? 'left' : (c === 5 ? 'center' : c === 4 ? 'right' : 'left') };
      }
      dataRow.getCell(4).numFmt = '#,##0.000';
      dataRow.height = 16;
    });

    const totalRow = sheet.addRow(['TOTAL', '', '', rows.reduce((s, r) => s + parseFloat(r.quantite_reelle), 0), '', '']);
    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Calibri', bold: true, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
      cell.border = border;
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
    totalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    totalRow.getCell(4).numFmt = '#,##0.000';
    totalRow.height = 18;

    sheet.addRow([]);
    const footerRow = sheet.addRow([`Généré le ${new Date().toLocaleDateString('fr-TN', { dateStyle: 'long' })} — ${rows.length} enregistrement(s)`]);
    footerRow.getCell(1).font = { name: 'Calibri', italic: true, size: 9, color: { argb: '888888' } };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="Inventaire-Indep.xlsx"');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('[exportClientInventaireExcel]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  getLaboInventaireStock,
  saveLaboInventaire,
  getActiviteInventaireStock,
  saveActiviteInventaire,
  getLaboInventaireHistorique,
  getActiviteInventaireHistorique,
  updateInventaireEntry,
  exportLaboInventaireExcel,
  exportActiviteInventaireExcel,
  getClientInventaireStock,
  saveClientInventaire,
  getClientInventaireHistorique,
  exportClientInventaireExcel,
};
