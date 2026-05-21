const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const pool = require('../config/database');

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
         UNION ALL
         SELECT scd.ingredient_id, scd.quantite, scd.date_appro, scd.prix_unitaire
         FROM stock_client_daily scd
         WHERE scd.client_id = $1
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
         UNION ALL
         SELECT cp.ingredient_id, cp.quantite, cp.type_perte, cp.date_perte
         FROM client_pertes cp
         WHERE cp.client_id = $1
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
           inv.client_id = $1
           OR inv.activite_id IN (SELECT id FROM client_activites)
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

  const headerStyle = { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }, alignment: { horizontal: 'center' } };
  const addHeader = (ws, cols) => {
    ws.columns = cols;
    const row = ws.getRow(1);
    cols.forEach((c, i) => { row.getCell(i + 1).value = c.header; row.getCell(i + 1).style = headerStyle; });
    ws.getRow(1).commit();
  };

  // Stock sheet
  const wsStock = workbook.addWorksheet('Stock');
  addHeader(wsStock, [
    { header: 'Ingrédient', key: 'ingredient', width: 30 },
    { header: 'Quantité', key: 'quantite', width: 14 },
    { header: 'Date appro', key: 'date_appro', width: 16 },
    { header: 'Prix unitaire (TND)', key: 'prix_unitaire', width: 20 },
  ]);
  data.stock.forEach(r => wsStock.addRow({ ingredient: r.ingredient, quantite: Number(r.quantite), date_appro: fmtDate(r.date_appro), prix_unitaire: r.prix_unitaire ? Number(r.prix_unitaire) : '' }));
  wsStock.eachRow((row, n) => { if (n > 1) row.eachCell(c => { c.alignment = { horizontal: 'left' }; }); });

  // Pertes sheet
  const wsPertes = workbook.addWorksheet('Pertes');
  addHeader(wsPertes, [
    { header: 'Ingrédient', key: 'ingredient', width: 30 },
    { header: 'Quantité', key: 'quantite', width: 14 },
    { header: 'Type', key: 'type_perte', width: 14 },
    { header: 'Date', key: 'date_perte', width: 16 },
  ]);
  data.pertes.forEach(r => wsPertes.addRow({ ingredient: r.ingredient, quantite: Number(r.quantite), type_perte: r.type_perte, date_perte: fmtDate(r.date_perte) }));

  // Inventaire sheet
  const wsInv = workbook.addWorksheet('Inventaires');
  addHeader(wsInv, [
    { header: 'Ingrédient', key: 'ingredient', width: 30 },
    { header: 'Quantité réelle', key: 'quantite_reelle', width: 18 },
    { header: 'Date inventaire', key: 'date_inventaire', width: 18 },
  ]);
  data.inventaires.forEach(r => wsInv.addRow({ ingredient: r.ingredient, quantite_reelle: Number(r.quantite_reelle), date_inventaire: fmtDate(r.date_inventaire) }));

  // Transferts sheet
  const wsTrans = workbook.addWorksheet('Transferts Labo→Activité');
  addHeader(wsTrans, [
    { header: 'Ingrédient', key: 'ingredient', width: 30 },
    { header: 'Quantité', key: 'quantite', width: 14 },
    { header: 'Date transfert', key: 'date_transfert', width: 18 },
  ]);
  data.transferts.forEach(r => wsTrans.addRow({ ingredient: r.ingredient, quantite: Number(r.quantite), date_transfert: fmtDate(r.date_transfert) }));

  const buffer = await workbook.xlsx.writeBuffer();
  return { buffer, clientNom: data.clientNom, filename: `rapport-labflow-${todayFr().replace(/ /g, '-')}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
}

async function generatePdf(clientId) {
  const data = await fetchReportData(clientId);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 50, right: 50 } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('end', () => resolve({ buffer: Buffer.concat(chunks), clientNom: data.clientNom, filename: `rapport-labflow-${todayFr().replace(/ /g, '-')}.pdf`, mimeType: 'application/pdf' }));
    doc.on('error', reject);

    const INDIGO = '#4F46E5';
    const GRAY = '#374151';
    const LIGHT = '#6B7280';

    // Header
    doc.rect(0, 0, doc.page.width, 70).fill(INDIGO);
    doc.fillColor('#fff').fontSize(20).font('Helvetica-Bold').text('LabFlow', 50, 18);
    doc.fontSize(10).font('Helvetica').text(`Rapport — ${data.clientNom} — ${todayFr()}`, 50, 44);

    const section = (title, y) => {
      doc.moveDown(0.5);
      doc.fillColor(INDIGO).fontSize(13).font('Helvetica-Bold').text(title, { underline: false });
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(INDIGO).lineWidth(1).stroke();
      doc.moveDown(0.3);
    };

    const row = (cols, widths, isHeader = false) => {
      const x0 = 50;
      let x = x0;
      doc.fontSize(9).font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fillColor(isHeader ? INDIGO : GRAY);
      cols.forEach((col, i) => { doc.text(col, x, doc.y, { width: widths[i], continued: i < cols.length - 1 }); x += widths[i]; });
      doc.moveDown(0.2);
    };

    doc.moveDown(2);

    // Stock
    section('Stock actuel');
    row(['Ingrédient', 'Quantité', 'Date appro', 'Prix (TND)'], [200, 80, 100, 80], true);
    data.stock.slice(0, 40).forEach(r => row([r.ingredient, String(r.quantite ?? ''), fmtDate(r.date_appro), r.prix_unitaire ? String(r.prix_unitaire) : '—'], [200, 80, 100, 80]));

    doc.addPage();

    // Pertes
    section('Pertes récentes');
    row(['Ingrédient', 'Quantité', 'Type', 'Date'], [200, 80, 100, 80], true);
    data.pertes.slice(0, 40).forEach(r => row([r.ingredient, String(r.quantite ?? ''), r.type_perte || '', fmtDate(r.date_perte)], [200, 80, 100, 80]));

    doc.moveDown(1);

    // Inventaires
    section('Inventaires récents');
    row(['Ingrédient', 'Quantité réelle', 'Date'], [220, 120, 100], true);
    data.inventaires.slice(0, 40).forEach(r => row([r.ingredient, String(r.quantite_reelle ?? ''), fmtDate(r.date_inventaire)], [220, 120, 100]));

    // Footer
    doc.fontSize(8).fillColor(LIGHT).text(`Généré par l'assistant IA LabFlow · ${todayFr()}`, 50, doc.page.height - 50, { align: 'center', width: 495 });

    doc.end();
  });
}

// Main entry point for Telegram bot
async function generateAndSendReport(clientId, email, clientNom, format) {
  const { sendRapportWithAttachment } = require('./emailService');

  let reportData;
  if (format === 'excel') {
    reportData = await generateExcel(clientId);
  } else {
    reportData = await generatePdf(clientId);
  }

  await sendRapportWithAttachment({
    to: email,
    clientNom: reportData.clientNom || clientNom,
    buffer: reportData.buffer,
    filename: reportData.filename,
    mimeType: reportData.mimeType,
    format,
  });

  return reportData.filename;
}

module.exports = { generateAndSendReport };
