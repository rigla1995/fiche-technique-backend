const PDFDocument = require('pdfkit');

// Facture fiscale du module Acheteurs : l'ÉMETTEUR est le compte client LabFlow
// (profil_entreprise), le destinataire est l'acheteur B2B. Montants TTC saisis,
// HT/TVA dérivés (règle HT/TTC de l'app : jamais re-taxé), timbre fiscal optionnel.

const VIOLET = '#4c1d95';
const VIOLET_LIGHT = '#f5f3ff';
const INK = '#111827';
const BODY = '#374151';
const MUTED = '#6b7280';
const HAIR = '#e5e7eb';

const fmt = (n) => `${Number(n || 0).toFixed(3)} DT`;
const fmtQty = (n) => {
  const v = Number(n || 0);
  return Number.isInteger(v) ? String(v) : v.toFixed(3).replace(/\.?0+$/, '');
};

const buildFactureAcheteurPdf = (f, lignes) => new Promise((resolve, reject) => {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 46, bottom: 46, left: 46, right: 46 } });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.on('error', reject);

  const ML = 46;
  const PW = doc.page.width - 92; // largeur utile
  const RX = ML + PW;
  const dateStr = new Date(f.date_facture).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  // ── En-tête
  doc.rect(ML, 46, PW, 64).fill(VIOLET);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(16).text('FACTURE', ML + 18, 62);
  doc.font('Helvetica').fontSize(9).fillColor('#ddd6fe')
    .text(`N° ${f.numero}  ·  Émise le ${dateStr}`, ML + 18, 86);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#ffffff')
    .text(f.vendeur_nom || 'Vendeur', ML, 62, { width: PW - 18, align: 'right' });
  doc.font('Helvetica').fontSize(8).fillColor('#ddd6fe')
    .text([f.vendeur_adresse, f.vendeur_tel, f.vendeur_email].filter(Boolean).join('  ·  ') || ' ',
      ML, 82, { width: PW - 18, align: 'right' });

  let y = 130;

  // ── Blocs émetteur / client
  const half = PW / 2 - 8;
  doc.rect(ML, y, half, 84).fill(VIOLET_LIGHT);
  doc.rect(ML + half + 16, y, half, 84).fill('#f8fafc');
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(VIOLET).text('ÉMETTEUR', ML + 12, y + 10, { characterSpacing: 0.5 });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(f.vendeur_nom || '—', ML + 12, y + 24, { width: half - 24 });
  doc.font('Helvetica').fontSize(8).fillColor(BODY)
    .text([f.vendeur_adresse, f.vendeur_tel, f.vendeur_email].filter(Boolean).join('\n') || ' ', ML + 12, y + 40, { width: half - 24, lineGap: 2 });

  const bx = ML + half + 16;
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED).text('FACTURÉ À', bx + 12, y + 10, { characterSpacing: 0.5 });
  doc.font('Helvetica-Bold').fontSize(10).fillColor(INK)
    .text(f.acheteur_entreprise ? `${f.acheteur_entreprise} — ${f.acheteur_nom}` : f.acheteur_nom, bx + 12, y + 24, { width: half - 24 });
  doc.font('Helvetica').fontSize(8).fillColor(BODY)
    .text([
      f.acheteur_adresse,
      f.acheteur_mf ? `MF : ${f.acheteur_mf}` : null,
      [f.acheteur_tel, f.acheteur_email].filter(Boolean).join('  ·  ') || null,
    ].filter(Boolean).join('\n') || ' ', bx + 12, y + 40, { width: half - 24, lineGap: 2 });

  y += 84 + 20;

  // ── Tableau des lignes
  const cDes = ML + 10;
  const cQte = ML + Math.round(PW * 0.52);
  const cPu = ML + Math.round(PW * 0.66);
  const cTva = ML + Math.round(PW * 0.80);
  const cTot = RX - 10;

  doc.rect(ML, y, PW, 20).fill(VIOLET_LIGHT);
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(VIOLET);
  doc.text('DÉSIGNATION', cDes, y + 6);
  doc.text('QTÉ', ML, y + 6, { width: cQte - ML + 30, align: 'right' });
  doc.text('PU TTC', ML, y + 6, { width: cPu - ML + 30, align: 'right' });
  doc.text('TVA', ML, y + 6, { width: cTva - ML + 24, align: 'right' });
  doc.text('TOTAL TTC', ML, y + 6, { width: cTot - ML, align: 'right' });
  y += 20;

  for (const l of lignes) {
    if (y > doc.page.height - 220) { doc.addPage(); y = 46; }
    const totalLigne = Number(l.prix_ttc) * Number(l.quantite);
    const qtyLabel = l.mode === 'lot'
      ? `${fmtQty(l.quantite)} lot${Number(l.quantite) > 1 ? 's' : ''} (×${fmtQty(l.taille_lot)})`
      : fmtQty(l.quantite);
    doc.moveTo(ML, y + 20).lineTo(RX, y + 20).lineWidth(0.5).strokeColor(HAIR).stroke();
    doc.font('Helvetica').fontSize(8.5).fillColor(INK).text(l.designation, cDes, y + 6, { width: cQte - cDes - 14, ellipsis: true, height: 12 });
    doc.fillColor(BODY);
    doc.text(qtyLabel, ML, y + 6, { width: cQte - ML + 30, align: 'right' });
    doc.text(fmt(l.prix_ttc), ML, y + 6, { width: cPu - ML + 30, align: 'right' });
    doc.text(`${Number(l.taux_tva || 0).toFixed(0)} %`, ML, y + 6, { width: cTva - ML + 24, align: 'right' });
    doc.font('Helvetica-Bold').fillColor(INK).text(fmt(totalLigne), ML, y + 6, { width: cTot - ML, align: 'right' });
    y += 20;
  }

  y += 14;
  if (y > doc.page.height - 200) { doc.addPage(); y = 46; }

  // ── Totaux
  const totW = Math.round(PW * 0.46);
  const totX = RX - totW;
  const totLine = (label, value, opts = {}) => {
    doc.rect(totX, y, totW, 20).fill(opts.bg || '#f8fafc');
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.big ? 10 : 8.5)
      .fillColor(opts.color || BODY).text(label, totX + 10, y + 6);
    doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(opts.big ? 11 : 8.5)
      .fillColor(opts.color || INK).text(value, totX, y + (opts.big ? 5 : 6), { width: totW - 10, align: 'right' });
    y += 20;
  };
  totLine('Total brut TTC', fmt(f.montant_brut_ttc));
  if (Number(f.remise_pct) > 0) {
    const remiseVal = Number(f.montant_brut_ttc) * Number(f.remise_pct) / 100;
    totLine(`Remise ${Number(f.remise_pct).toFixed(Number.isInteger(Number(f.remise_pct)) ? 0 : 2)} %`, `− ${fmt(remiseVal)}`, { color: '#b91c1c' });
  }
  totLine('Total HT', fmt(f.montant_ht));
  totLine('TVA', fmt(f.montant_tva));
  if (f.timbre_fiscal) totLine('Timbre fiscal', fmt(f.montant_timbre));
  y += 2;
  doc.rect(totX, y, totW, 28).fill(VIOLET);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff').text('NET À PAYER', totX + 10, y + 9, { characterSpacing: 0.5 });
  doc.fontSize(12).text(fmt(f.montant_ttc), totX, y + 8, { width: totW - 10, align: 'right' });
  y += 28 + 16;

  // ── Notes + mentions
  if (f.notes) {
    doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text('NOTES', ML, y);
    doc.font('Helvetica').fontSize(8.5).fillColor(BODY).text(String(f.notes), ML, y + 12, { width: PW });
    y = doc.y + 14;
  }
  doc.font('Helvetica').fontSize(7).fillColor(MUTED)
    .text('Montants exprimés en dinars tunisiens (DT). TVA calculée par ligne au taux indiqué (les prix saisis sont TTC). Facture générée électroniquement par LabFlow.',
      ML, Math.max(y, doc.page.height - 80), { width: PW, lineGap: 2 });

  doc.end();
});

module.exports = { buildFactureAcheteurPdf };
