const ExcelJS = require('exceljs');
const pool = require('../config/database');
const { brandHeader, headerRow, dataRowStyle, brandFooter, finalize, FMT_DT, FMT_QTE } = require('./excelBrandService');

const todayFr = () => new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';

const SCOPE_CTE = `
  WITH pe AS (SELECT id FROM profil_entreprise WHERE client_id = $1),
  client_activites AS (SELECT id FROM activites WHERE entreprise_id IN (SELECT id FROM pe)),
  client_labos AS (SELECT id FROM labos WHERE entreprise_id IN (SELECT id FROM pe))
`;

async function fetchReportData(clientId) {
  const [stockRows, pertesRows, inventaireRows, transferRows, clientRow] = await Promise.all([

    pool.query(
      `${SCOPE_CTE}
       SELECT i.nom AS ingredient, s.quantite, s.date_appro, s.prix_unitaire
       FROM (
         SELECT sed.ingredient_id, sed.quantite, sed.date_appro, sed.prix_unitaire
         FROM stock_entreprise_daily sed
         WHERE sed.activite_id IN (SELECT id FROM client_activites)
         UNION ALL
         SELECT sld.ingredient_id, sld.quantite, sld.date_appro, sld.prix_unitaire
         FROM stock_labo_daily sld
         WHERE sld.labo_id IN (SELECT id FROM client_labos)
       ) s
       JOIN articles i ON i.id = s.ingredient_id
       ORDER BY s.date_appro DESC LIMIT 200`,
      [clientId]
    ),

    pool.query(
      `${SCOPE_CTE}
       SELECT i.nom AS ingredient, p.quantite, p.type_perte, p.date_perte
       FROM (
         SELECT p.ingredient_id, p.quantite, p.type_perte, p.date_perte
         FROM pertes p
         WHERE p.activite_id IN (SELECT id FROM client_activites) AND p.ingredient_id IS NOT NULL
         UNION ALL
         SELECT lp.ingredient_id, lp.quantite, lp.type_perte, lp.date_perte
         FROM labo_pertes lp
         WHERE lp.labo_id IN (SELECT id FROM client_labos) AND lp.ingredient_id IS NOT NULL
       ) p
       JOIN articles i ON i.id = p.ingredient_id
       ORDER BY p.date_perte DESC LIMIT 100`,
      [clientId]
    ),

    pool.query(
      `${SCOPE_CTE}
       SELECT i.nom AS ingredient, inv.quantite_reelle, inv.date_inventaire
       FROM inventaires inv
       JOIN articles i ON i.id = inv.ingredient_id
       WHERE inv.ingredient_id IS NOT NULL
         AND (
           inv.activite_id IN (SELECT id FROM client_activites)
           OR inv.labo_id IN (SELECT id FROM client_labos)
         )
       ORDER BY inv.date_inventaire DESC LIMIT 100`,
      [clientId]
    ),

    pool.query(
      `${SCOPE_CTE}
       SELECT i.nom AS ingredient, lt.quantite, lt.date_transfert
       FROM labo_transfers lt
       JOIN articles i ON i.id = lt.ingredient_id
       WHERE lt.activite_id IN (SELECT id FROM client_activites) AND lt.ingredient_id IS NOT NULL
       ORDER BY lt.date_transfert DESC LIMIT 100`,
      [clientId]
    ),

    pool.query(
      `SELECT u.nom FROM utilisateurs u WHERE u.id = $1`,
      [clientId]
    ),
  ]);

  return {
    clientNom: clientRow.rows[0]?.nom || 'Client',
    stock: stockRows.rows,
    pertes: pertesRows.rows,
    inventaires: inventaireRows.rows,
    transferts: transferRows.rows,
  };
}

async function generateExcel(clientId) {
  const data = await fetchReportData(clientId);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'LabFlow AI Agent';
  workbook.created = new Date();

  const exportedLe = new Date().toLocaleDateString('fr-FR');

  // Feuille chartée : bandeau + filet + méta, en-têtes indigo, zébrage, footer.
  // formats = numFmt par colonne (null = pas de format numérique).
  const buildSheet = (name, { titre, labels, widths, formats, rows }) => {
    const ws = workbook.addWorksheet(name);
    const colCount = labels.length;
    const headerIdx = brandHeader(workbook, ws, {
      titre,
      sousTitre: data.clientNom,
      meta: `Exporté le ${exportedLe} · ${rows.length} ligne${rows.length > 1 ? 's' : ''}`,
      colCount,
    });
    headerRow(ws, headerIdx, labels, { widths });
    rows.forEach((values, i) => {
      const row = ws.addRow(values);
      dataRowStyle(row, { index: i, colCount });
      formats.forEach((fmt, c) => { if (fmt) row.getCell(c + 1).numFmt = fmt; });
    });
    const lastDataRow = headerIdx + rows.length;
    brandFooter(ws, colCount);
    finalize(ws, { headerRowIdx: headerIdx, colCount, lastDataRow });
  };

  buildSheet('Stock', {
    titre: 'Rapport LabFlow — Stock actuel',
    labels: ['Ingrédient', 'Quantité', 'Date appro', 'Prix unitaire (TND)'],
    widths: [30, 14, 16, 20],
    formats: [null, FMT_QTE, null, FMT_DT],
    rows: data.stock.map(r => [r.ingredient, Number(r.quantite), fmtDate(r.date_appro), r.prix_unitaire ? Number(r.prix_unitaire) : '']),
  });

  buildSheet('Pertes', {
    titre: 'Rapport LabFlow — Pertes récentes',
    labels: ['Ingrédient', 'Quantité', 'Type', 'Date'],
    widths: [30, 14, 14, 16],
    formats: [null, FMT_QTE, null, null],
    rows: data.pertes.map(r => [r.ingredient, Number(r.quantite), r.type_perte, fmtDate(r.date_perte)]),
  });

  buildSheet('Inventaires', {
    titre: 'Rapport LabFlow — Inventaires récents',
    labels: ['Ingrédient', 'Quantité réelle', 'Date inventaire'],
    widths: [30, 18, 18],
    formats: [null, FMT_QTE, null],
    rows: data.inventaires.map(r => [r.ingredient, Number(r.quantite_reelle), fmtDate(r.date_inventaire)]),
  });

  buildSheet('Transferts Labo→Activité', {
    titre: 'Rapport LabFlow — Transferts labo → activités',
    labels: ['Ingrédient', 'Quantité', 'Date transfert'],
    widths: [30, 14, 18],
    formats: [null, FMT_QTE, null],
    rows: data.transferts.map(r => [r.ingredient, Number(r.quantite), fmtDate(r.date_transfert)]),
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer, clientNom: data.clientNom, filename: `rapport-labflow-${todayFr().replace(/ /g, '-')}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}

// Point d'entrée des envois de rapport par les agents IA (chat web, Messenger).
// Le rapport est toujours un classeur Excel charté.
async function generateAndSendReport(clientId, email, clientNom) {
  const { sendRapportWithAttachment } = require('./emailService');

  const reportData = await generateExcel(clientId);

  await sendRapportWithAttachment({
    to: email,
    clientNom: reportData.clientNom || clientNom,
    buffer: reportData.buffer,
    filename: reportData.filename,
    mimeType: reportData.mimeType,
    format: 'excel',
  });

  return reportData.filename;
}

module.exports = { generateAndSendReport };
