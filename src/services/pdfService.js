const PDFDocument = require('pdfkit');

const APP_NAME = process.env.APP_NAME || 'Fiche Technique';

const fmtDt = (n) => (n != null ? `${Number(n).toFixed(2)} DT` : '—');
const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  : new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

/**
 * Generate the avenant PDF as a base64 string.
 */
const generateAvenantPdf = ({
  nom,
  notesAdmin,
  nbActivitesAdded, nbLabosAdded, nbGerantsAdded,
  nbActivites, nbLabos, nbGerants,
  activiteCost, laboCost, gerantCost, newMensuel,
  promoApplied, effectifMensuel,
  dateAvenant,
}) => new Promise((resolve, reject) => {
  try {
    const doc = new PDFDocument({ size: 'A4', margin: 60 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    doc.on('error', reject);

    const W = doc.page.width - 120; // usable width
    const INDIGO = '#4338ca';
    const DARK = '#1e1b4b';
    const GRAY = '#6b7280';
    const GREEN = '#16a34a';
    const BG_LIGHT = '#f8fafc';

    const dateStr = fmtDate(dateAvenant);

    // ── Header band ──────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 90).fill(DARK);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20)
      .text(APP_NAME, 60, 28);
    doc.fillColor('#c7d2fe').font('Helvetica').fontSize(10)
      .text('Contrat Avenant — Ajout de capacité', 60, 54);
    doc.fillColor('#ffffff').fontSize(9)
      .text(`Date : ${dateStr}`, 60, 70);

    let y = 115;

    // ── Title ─────────────────────────────────────────────────────────────────
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(15)
      .text('AVENANT AU CONTRAT D\'ABONNEMENT', 60, y, { align: 'center', width: W });
    y += 30;
    doc.fillColor(GRAY).font('Helvetica').fontSize(10)
      .text(`Émis le ${dateStr} — Client : ${nom}`, 60, y, { align: 'center', width: W });
    y += 30;

    // Divider
    doc.moveTo(60, y).lineTo(60 + W, y).strokeColor('#e2e8f0').stroke();
    y += 18;

    // ── Préambule ─────────────────────────────────────────────────────────────
    doc.fillColor('#374151').font('Helvetica').fontSize(10).lineGap(3)
      .text(
        `Le présent avenant modifie le contrat d'abonnement en vigueur entre ${APP_NAME} et le client ` +
        `${nom}. Il prend effet à compter de sa date d'émission et vient compléter les termes initiaux ` +
        `du contrat sans les remplacer.`,
        60, y, { width: W }
      );
    y = doc.y + 20;

    // ── Capacité ajoutée ──────────────────────────────────────────────────────
    const addedParts = [
      nbActivitesAdded > 0 && `+${nbActivitesAdded} activité${nbActivitesAdded > 1 ? 's' : ''}`,
      nbLabosAdded > 0     && `+${nbLabosAdded} labo${nbLabosAdded > 1 ? 's' : ''}`,
      nbGerantsAdded > 0   && `+${nbGerantsAdded} gérant${nbGerantsAdded > 1 ? 's' : ''}`,
    ].filter(Boolean).join('  ·  ');

    doc.rect(60, y, W, 48).fill('#f0fdf4');
    doc.fillColor('#15803d').font('Helvetica-Bold').fontSize(8)
      .text('CAPACITÉ AJOUTÉE', 76, y + 10);
    doc.fillColor('#14532d').font('Helvetica-Bold').fontSize(13)
      .text(addedParts, 76, y + 24);
    y += 64;

    // ── Nouvelle configuration & tarification ──────────────────────────────────
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
      .text('Nouvelle configuration & tarification mensuelle', 60, y);
    y += 16;

    // Table header
    const cols = { label: 60, qty: 60 + W * 0.5, cost: 60 + W * 0.75, total: 60 + W * 0.88 };
    doc.rect(60, y, W, 22).fill(INDIGO);
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(9);
    doc.text('Élément',       cols.label + 6, y + 6);
    doc.text('Quantité',      cols.qty,        y + 6);
    doc.text('Coût (DT/mois)',cols.cost - 20,  y + 6);
    y += 22;

    const drawRow = (label, qty, cost, isTotal = false) => {
      const rowH = isTotal ? 26 : 22;
      doc.rect(60, y, W, rowH).fill(isTotal ? '#eff6ff' : BG_LIGHT);
      doc.moveTo(60, y + rowH).lineTo(60 + W, y + rowH).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
      const fontSize = isTotal ? 10 : 9;
      const fontName = isTotal ? 'Helvetica-Bold' : 'Helvetica';
      const textColor = isTotal ? '#1e40af' : '#111827';
      doc.fillColor(textColor).font(fontName).fontSize(fontSize);
      doc.text(label, cols.label + 6, y + (isTotal ? 8 : 6));
      if (qty !== null) doc.text(String(qty), cols.qty, y + (isTotal ? 8 : 6));
      doc.text(cost, 60 + W - 6, y + (isTotal ? 8 : 6), { align: 'right', width: W - 6 });
      y += rowH;
    };

    drawRow(`Activités`, nbActivites, fmtDt(activiteCost));
    if (nbLabos > 0)   drawRow(`Labos`,   nbLabos,   fmtDt(laboCost));
    if (nbGerants > 0) drawRow(`Gérants`, nbGerants, fmtDt(gerantCost));
    drawRow('Total mensuel (base)', null, fmtDt(newMensuel), true);

    if (promoApplied && effectifMensuel != null && effectifMensuel !== newMensuel) {
      y += 4;
      doc.fillColor('#7c3aed').font('Helvetica-Bold').fontSize(10)
        .text(`Montant effectif après promotion : ${fmtDt(effectifMensuel)} / mois`, 60, y);
      y += 18;
    }
    y += 14;

    // ── Note admin ────────────────────────────────────────────────────────────
    if (notesAdmin) {
      doc.rect(60, y, W, 14).fill('#eff6ff');
      doc.fillColor('#1e40af').font('Helvetica-Bold').fontSize(8)
        .text('NOTE DE L\'ADMINISTRATION', 66, y + 3);
      y += 18;
      doc.rect(60, y, W, 2).fill('#bfdbfe'); // top border accent
      y += 4;
      doc.fillColor('#1e3a5f').font('Helvetica').fontSize(9).lineGap(3)
        .text(notesAdmin, 66, y, { width: W - 12 });
      y = doc.y + 16;
    }

    // ── Clauses légales ───────────────────────────────────────────────────────
    doc.moveTo(60, y).lineTo(60 + W, y).strokeColor('#e2e8f0').lineWidth(0.5).stroke();
    y += 14;
    doc.fillColor(GRAY).font('Helvetica').fontSize(8).lineGap(2)
      .text(
        'Le présent avenant est accepté par les deux parties. Il est réputé signé électroniquement ' +
        'par le client dès lors qu\'il se connecte à la plateforme après réception de ce document. ' +
        'Toutes les autres clauses du contrat initial demeurent inchangées et pleinement en vigueur.',
        60, y, { width: W }
      );
    y = doc.y + 24;

    // ── Signature spaces ──────────────────────────────────────────────────────
    if (y > doc.page.height - 200) {
      doc.addPage();
      y = 60;
    }

    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11)
      .text('Signatures', 60, y);
    y += 20;

    const halfW = (W - 30) / 2;

    // Left — client
    doc.rect(60, y, halfW, 80).stroke('#d1d5db');
    doc.fillColor(GRAY).font('Helvetica').fontSize(8)
      .text('Pour le Client', 66, y + 6)
      .text(`${nom}`, 66, y + 18)
      .text(`Date : ${dateStr}`, 66, y + 30);
    doc.fillColor('#9ca3af').fontSize(8)
      .text('Signature :', 66, y + 50)
      .moveTo(66 + 55, y + 56).lineTo(60 + halfW - 10, y + 56).strokeColor('#9ca3af').lineWidth(0.5).stroke();

    // Right — admin
    const rx = 60 + halfW + 30;
    doc.rect(rx, y, halfW, 80).stroke('#d1d5db');
    doc.fillColor(GRAY).font('Helvetica').fontSize(8)
      .text('Pour la Plateforme', rx + 6, y + 6)
      .text(APP_NAME, rx + 6, y + 18)
      .text(`Date : ${dateStr}`, rx + 6, y + 30);
    doc.fillColor('#9ca3af').fontSize(8)
      .text('Signature :', rx + 6, y + 50)
      .moveTo(rx + 55, y + 56).lineTo(rx + halfW - 10, y + 56).strokeColor('#9ca3af').lineWidth(0.5).stroke();

    y += 96;

    // ── Footer ─────────────────────────────────────────────────────────────────
    const footerY = doc.page.height - 45;
    doc.rect(0, footerY, doc.page.width, 45).fill('#f8fafc');
    doc.fillColor('#94a3b8').font('Helvetica').fontSize(8)
      .text(`${APP_NAME}  ·  Avenant du ${dateStr}  ·  Document généré automatiquement`,
        60, footerY + 14, { align: 'center', width: W });

    doc.end();
  } catch (err) {
    reject(err);
  }
});

module.exports = { generateAvenantPdf };
