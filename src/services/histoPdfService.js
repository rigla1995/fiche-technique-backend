const PDFDocument = require('pdfkit');
const APP_NAME = process.env.APP_NAME || 'Fiche Technique';

const fmtD = (d) => {
  if (!d) return '—';
  const s = typeof d === 'string' ? d : new Date(d).toISOString();
  const [y, m, day] = s.slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
};
const fmtN = (n, dec = 3) => (n == null ? '—' : parseFloat(n).toFixed(dec));

const THEME = {
  blue:   { header: '#1e40af', dark: '#1e3a8a', light: '#eff6ff' },
  red:    { header: '#991b1b', dark: '#7f1d1d', light: '#fff5f5' },
  purple: { header: '#7e22ce', dark: '#3b0764', light: '#faf5ff' },
  green:  { header: '#065f46', dark: '#064e3b', light: '#f0fdf4' },
};

const renderPdf = (res, filename, title, subtitle, theme, colDefs, rowMapper, rows) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4', layout: 'landscape',
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      autoFirstPage: true,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);
    doc.on('end', resolve);
    doc.on('error', reject);

    try {
      const PW = doc.page.width;   // 841.89
      const PH = doc.page.height;  // 595.28
      const ML = 40;
      const CW = PW - ML * 2;
      const ROW_H = 28;
      const HDR_H = 20;
      const BAND_H = 56;
      const FOOT_H = 22;
      let pageNum = 0;
      let y = 0;

      const fill   = (x, fy, w, h, color) => { doc.rect(x, fy, w, h).fill(color); };
      const hline  = (fy, x1 = ML, x2 = ML + CW, color = '#e2e8f0', lw = 0.3) =>
        doc.save().moveTo(x1, fy).lineTo(x2, fy).lineWidth(lw).stroke(color).restore();
      const txt    = (str, x, fy, size, bold, color, opts = {}) =>
        doc.fontSize(size).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(color)
           .text(str == null ? '—' : String(str), x, fy, { lineBreak: false, ...opts });

      const drawHeader = () => {
        fill(0, 0, PW, BAND_H, theme.header);
        fill(0, BAND_H, PW, 3, theme.dark);
        txt(title, ML, 14, 15, true, '#ffffff', { width: CW * 0.65 });
        if (subtitle) txt(subtitle, ML, 34, 8, false, 'rgba(255,255,255,0.75)', { width: CW * 0.65 });
        txt(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, ML, 18, 7.5, false, 'rgba(255,255,255,0.8)', { width: CW, align: 'right' });
        txt(APP_NAME, ML, 32, 7, false, 'rgba(255,255,255,0.6)', { width: CW, align: 'right' });
        y = BAND_H + 3 + 8;
      };

      const drawColHeaders = () => {
        fill(ML, y, CW, HDR_H, theme.dark);
        let x = ML;
        colDefs.forEach((col) => {
          const opts = { width: col.w - 8, lineBreak: false };
          if (col.align === 'right') opts.align = 'right';
          txt(col.label, x + (col.align === 'right' ? 4 : 5), y + 6, 6.5, true, '#ffffff', opts);
          x += col.w;
        });
        y += HDR_H;
      };

      const drawFooter = (pg) => {
        fill(0, PH - FOOT_H, PW, FOOT_H, '#f1f5f9');
        txt(`${title}  ·  Page ${pg}  ·  ${APP_NAME}`, ML, PH - 14, 7, false, '#94a3b8', { width: CW, align: 'center' });
      };

      const newPage = (pg) => {
        if (pg > 1) {
          doc.addPage({ size: 'A4', layout: 'landscape', margins: { top: 0, bottom: 0, left: 0, right: 0 } });
        }
        drawHeader();
        drawColHeaders();
      };

      pageNum++;
      newPage(pageNum);

      rows.forEach((r, i) => {
        if (y + ROW_H > PH - FOOT_H - 30) {
          drawFooter(pageNum);
          pageNum++;
          newPage(pageNum);
        }

        const bg = i % 2 === 0 ? '#ffffff' : '#f8fafc';
        fill(ML, y, CW, ROW_H, bg);

        const cells = rowMapper(r);
        let x = ML;
        colDefs.forEach((col, ci) => {
          const cell = cells[ci] || { main: '—' };
          const textX = x + 5;
          const textW = col.w - 10;
          const align = col.align === 'right' ? 'right' : 'left';
          txt(cell.main || '—', textX, y + 6, 8, !!cell.mainBold, cell.mainColor || '#1a202c', { width: textW, align });
          if (cell.sub) {
            txt(cell.sub, textX, y + 17, 6.5, false, '#94a3b8', { width: textW, align });
          }
          x += col.w;
        });

        hline(y + ROW_H);
        y += ROW_H;
      });

      // Totals band
      if (y + 26 > PH - FOOT_H - 6) {
        drawFooter(pageNum);
        pageNum++;
        newPage(pageNum);
      }

      drawFooter(pageNum);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });

// ── Historique Appro PDF ──────────────────────────────────────────────────────

const buildHistoriqueApproPdf = (res, rows, filters = {}) => {
  const isEntreprise = rows.some((r) => r.activite_nom);
  const rangeLabel = (filters.startDate || filters.endDate)
    ? `${fmtD(filters.startDate)} → ${fmtD(filters.endDate)}`
    : '';
  const subtitle = `Historique des approvisionnements${rangeLabel ? ' · ' + rangeLabel : ''}`;

  const colDefs = [
    ...(isEntreprise ? [{ label: 'Activité', w: 105, align: 'left' }] : []),
    { label: 'Ingrédient', w: isEntreprise ? 155 : 195, align: 'left' },
    { label: 'Date', w: 65, align: 'left' },
    { label: 'Type', w: 52, align: 'center' },
    { label: 'Quantité', w: 62, align: 'right' },
    { label: 'Prix U. HT', w: 70, align: 'right' },
    { label: 'TVA %', w: 42, align: 'right' },
    { label: 'Prix U. TTC', w: 72, align: 'right' },
    { label: 'Fourn. / Réf', w: isEntreprise ? 140 : 164, align: 'left' },
  ];

  const rowMapper = (r) => [
    ...(isEntreprise ? [{ main: r.activite_nom || '—', mainColor: '#6d28d9' }] : []),
    { main: r.ingredient_nom, sub: `${r.unite_nom}  ·  ${r.categorie_nom || '—'}`, mainBold: true },
    {
      main: fmtD(r.date_appro),
      mainColor: '#1e40af',
    },
    {
      main: r.type_appro === 'transfert' ? 'Transf.' : (r.type_appro === 'produit_transforme' ? 'PT' : (r.type_appro ? 'Manuel' : '—')),
      mainColor: r.type_appro === 'transfert' ? '#0369a1' : (r.type_appro === 'produit_transforme' ? '#7e22ce' : '#059669'),
    },
    { main: fmtN(r.quantite), sub: r.unite_nom, align: 'right', mainColor: '#0f766e' },
    { main: r.prix_unitaire != null ? fmtN(r.prix_unitaire) + ' DT' : '—', mainColor: '#1d4ed8' },
    { main: r.taux_tva != null ? `${r.taux_tva}%` : '—', mainColor: '#6b7280' },
    { main: r.prix_unitaire_tva != null ? fmtN(r.prix_unitaire_tva) + ' DT' : '—', mainColor: '#059669', mainBold: true },
    {
      main: r.fournisseur_nom || '—',
      sub: r.ref_facture || '',
      mainColor: r.fournisseur_nom ? '#374151' : '#94a3b8',
    },
  ];

  const filename = `historique-appro-${new Date().toISOString().slice(0, 10)}.pdf`;
  return renderPdf(res, filename, 'Historique Approvisionnement', subtitle, THEME.blue, colDefs, rowMapper, rows);
};

// ── Historique Pertes PDF ─────────────────────────────────────────────────────

const buildHistoriquePertesPdf = (res, rows, filters = {}, themeKey = 'red') => {
  const isEntreprise = rows.some((r) => r.activite_nom);
  const rangeLabel = (filters.dateDebut || filters.dateFin)
    ? `${fmtD(filters.dateDebut)} → ${fmtD(filters.dateFin)}`
    : '';
  const subtitle = `Historique des pertes et avaries${rangeLabel ? ' · ' + rangeLabel : ''}`;
  const theme = THEME[themeKey] || THEME.red;

  const colDefs = [
    ...(isEntreprise ? [{ label: 'Activité', w: 110, align: 'left' }] : []),
    { label: 'Ingrédient', w: isEntreprise ? 175 : 220, align: 'left' },
    { label: 'Date', w: 65, align: 'left' },
    { label: 'Type', w: 62, align: 'center' },
    { label: 'Quantité', w: 78, align: 'right' },
    { label: 'Prix U.', w: 78, align: 'right' },
    { label: 'Coût Total', w: isEntreprise ? 95 : 124, align: 'right' },
  ];

  const rowMapper = (r) => {
    const qty  = parseFloat(r.quantite);
    const prix = r.prix_unitaire != null ? parseFloat(r.prix_unitaire) : null;
    const cout = prix != null ? qty * prix : null;
    const isAvarie = r.type_perte === 'avarie';
    return [
      ...(isEntreprise ? [{ main: r.activite_nom || '—', mainColor: '#6d28d9' }] : []),
      { main: r.ingredient_nom, sub: `${r.unite_nom}  ·  ${r.categorie_nom || '—'}`, mainBold: true },
      { main: fmtD(r.date_perte), mainColor: theme.header },
      { main: isAvarie ? 'Avarie' : 'Déchet', mainColor: isAvarie ? '#991b1b' : '#c2410c' },
      { main: fmtN(qty), sub: r.unite_nom, mainColor: '#dc2626', mainBold: true },
      { main: prix != null ? fmtN(prix) + ' DT' : '—', mainColor: '#374151' },
      { main: cout != null ? fmtN(cout) + ' DT' : '—', mainColor: '#dc2626', mainBold: cout != null },
    ];
  };

  const filename = `historique-pertes-${new Date().toISOString().slice(0, 10)}.pdf`;
  return renderPdf(res, filename, 'Historique Pertes', subtitle, theme, colDefs, rowMapper, rows);
};

// ── Labo Appro PDF ────────────────────────────────────────────────────────────

const buildLaboHistoriqueApproPdf = (res, rows, laboNom, filters = {}) => {
  const rangeLabel = (filters.startDate || filters.endDate)
    ? `${fmtD(filters.startDate)} → ${fmtD(filters.endDate)}`
    : '';
  const subtitle = `${laboNom}${rangeLabel ? ' · ' + rangeLabel : ''}`;

  const colDefs = [
    { label: 'Ingrédient', w: 195, align: 'left' },
    { label: 'Date', w: 65, align: 'left' },
    { label: 'Type', w: 55, align: 'center' },
    { label: 'Quantité', w: 68, align: 'right' },
    { label: 'Prix U. HT', w: 72, align: 'right' },
    { label: 'TVA %', w: 44, align: 'right' },
    { label: 'Prix U. TTC', w: 74, align: 'right' },
    { label: 'Fourn. / Réf', w: 188, align: 'left' },
  ];

  const rowMapper = (r) => [
    { main: r.ingredient_nom, sub: `${r.unite_nom}  ·  ${r.categorie_nom || '—'}`, mainBold: true },
    { main: fmtD(r.date_appro), mainColor: '#7e22ce' },
    {
      main: r.type_appro === 'transfert' ? 'Transf.' : (r.type_appro === 'produit_transforme' ? 'PT' : (r.type_appro ? 'Manuel' : '—')),
      mainColor: r.type_appro === 'transfert' ? '#0369a1' : (r.type_appro === 'produit_transforme' ? '#7e22ce' : '#059669'),
    },
    { main: fmtN(r.quantite), sub: r.unite_nom, mainColor: '#0f766e' },
    { main: r.prix_unitaire != null ? fmtN(r.prix_unitaire) + ' DT' : '—', mainColor: '#1d4ed8' },
    { main: r.taux_tva != null ? `${r.taux_tva}%` : '—', mainColor: '#6b7280' },
    { main: r.prix_unitaire_tva != null ? fmtN(r.prix_unitaire_tva) + ' DT' : '—', mainColor: '#059669', mainBold: true },
    {
      main: r.fournisseur_nom || '—',
      sub: r.ref_facture || '',
      mainColor: r.fournisseur_nom ? '#374151' : '#94a3b8',
    },
  ];

  const filename = `historique-appro-labo-${new Date().toISOString().slice(0, 10)}.pdf`;
  return renderPdf(res, filename, `Historique Appro — ${laboNom}`, subtitle, THEME.purple, colDefs, rowMapper, rows);
};

// ── Labo Pertes PDF ───────────────────────────────────────────────────────────

const buildLaboHistoriquePertesPdf = (res, rows, laboNom, filters = {}) => {
  const rangeLabel = (filters.dateDebut || filters.dateFin)
    ? `${fmtD(filters.dateDebut)} → ${fmtD(filters.dateFin)}`
    : '';
  const subtitle = `${laboNom}${rangeLabel ? ' · ' + rangeLabel : ''}`;

  const colDefs = [
    { label: 'Ingrédient', w: 220, align: 'left' },
    { label: 'Date', w: 68, align: 'left' },
    { label: 'Type', w: 65, align: 'center' },
    { label: 'Quantité', w: 85, align: 'right' },
    { label: 'Prix U.', w: 85, align: 'right' },
    { label: 'Coût Total', w: 238, align: 'right' },
  ];

  const rowMapper = (r) => {
    const qty  = parseFloat(r.quantite);
    const prix = r.prix_unitaire != null ? parseFloat(r.prix_unitaire) : null;
    const cout = prix != null ? qty * prix : null;
    const isAvarie = r.type_perte === 'avarie';
    return [
      { main: r.ingredient_nom, sub: `${r.unite_nom}  ·  ${r.categorie_nom || '—'}`, mainBold: true },
      { main: fmtD(r.date_perte), mainColor: '#7e22ce' },
      { main: isAvarie ? 'Avarie' : 'Déchet', mainColor: isAvarie ? '#991b1b' : '#c2410c' },
      { main: fmtN(qty), sub: r.unite_nom, mainColor: '#dc2626', mainBold: true },
      { main: prix != null ? fmtN(prix) + ' DT' : '—', mainColor: '#374151' },
      { main: cout != null ? fmtN(cout) + ' DT' : '—', mainColor: '#dc2626', mainBold: cout != null },
    ];
  };

  const filename = `historique-pertes-labo-${new Date().toISOString().slice(0, 10)}.pdf`;
  return renderPdf(res, filename, `Historique Pertes — ${laboNom}`, subtitle, THEME.purple, colDefs, rowMapper, rows);
};

// ── Inventaire Historique PDF ─────────────────────────────────────────────────

const buildInventaireHistoriquePdf = (res, rows, contextLabel, filters = {}) => {
  const rangeLabel = (filters.startDate || filters.endDate)
    ? `${fmtD(filters.startDate)} → ${fmtD(filters.endDate)}`
    : '';
  const subtitle = `${contextLabel}${rangeLabel ? ' · ' + rangeLabel : ''}`;

  const colDefs = [
    { label: 'Ingrédient', w: 230, align: 'left' },
    { label: 'Date', w: 72, align: 'left' },
    { label: 'Qté réelle', w: 90, align: 'right' },
    { label: 'Note', w: 409, align: 'left' },
  ];

  const rowMapper = (r) => [
    { main: r.ingredient_nom, sub: `${r.unite_nom}  ·  ${r.categorie_nom || '—'}`, mainBold: true },
    { main: fmtD(r.date_inventaire), mainColor: '#065f46' },
    { main: fmtN(r.quantite_reelle), sub: r.unite_nom, mainColor: '#0f766e', mainBold: true },
    { main: r.note || '—', mainColor: r.note ? '#374151' : '#94a3b8' },
  ];

  const filename = `historique-inventaire-${new Date().toISOString().slice(0, 10)}.pdf`;
  return renderPdf(res, filename, `Historique Inventaire — ${contextLabel}`, subtitle, THEME.green, colDefs, rowMapper, rows);
};

// ── Transfer Historique PDF ───────────────────────────────────────────────────

const buildTransferHistoriquePdf = (res, rows, laboNom, filters = {}) => {
  const rangeLabel = (filters.startDate || filters.endDate)
    ? `${fmtD(filters.startDate)} → ${fmtD(filters.endDate)}`
    : '';
  const subtitle = `${laboNom}${rangeLabel ? ' · ' + rangeLabel : ''}`;

  const colDefs = [
    { label: 'Ingrédient', w: 175, align: 'left' },
    { label: 'Date', w: 65, align: 'left' },
    { label: 'Activité', w: 115, align: 'left' },
    { label: 'Quantité', w: 68, align: 'right' },
    { label: 'Prix U. HT', w: 72, align: 'right' },
    { label: 'TVA %', w: 44, align: 'right' },
    { label: 'Prix U. TTC', w: 74, align: 'right' },
    { label: 'Coût HT', w: 82, align: 'right' },
    { label: 'Coût TTC', w: 106, align: 'right' },
  ];

  const rowMapper = (r) => [
    { main: r.ingredient_nom, sub: `${r.unite_nom}  ·  ${r.categorie_nom || '—'}`, mainBold: true },
    { main: fmtD(r.date_transfert), mainColor: '#7e22ce' },
    { main: r.activite_nom || '—', mainColor: '#374151' },
    { main: fmtN(r.quantite), sub: r.unite_nom, mainColor: '#059669' },
    { main: r.prix_unitaire != null ? fmtN(r.prix_unitaire) + ' DT' : '—', mainColor: '#374151' },
    { main: r.taux_tva != null ? `${r.taux_tva}%` : '—', mainColor: '#6b7280' },
    { main: r.prix_unitaire_tva != null ? fmtN(r.prix_unitaire_tva) + ' DT' : '—', mainColor: '#059669' },
    {
      main: r.prix_unitaire != null ? fmtN(parseFloat(r.quantite) * parseFloat(r.prix_unitaire)) + ' DT' : '—',
      mainColor: '#1d4ed8',
    },
    {
      main: r.prix_unitaire_tva != null ? fmtN(parseFloat(r.quantite) * parseFloat(r.prix_unitaire_tva)) + ' DT' : '—',
      mainColor: '#059669', mainBold: r.prix_unitaire_tva != null,
    },
  ];

  const filename = `historique-transferts-${new Date().toISOString().slice(0, 10)}.pdf`;
  return renderPdf(res, filename, `Historique Transferts — ${laboNom}`, subtitle, THEME.purple, colDefs, rowMapper, rows);
};

module.exports = {
  buildHistoriqueApproPdf,
  buildHistoriquePertesPdf,
  buildLaboHistoriqueApproPdf,
  buildLaboHistoriquePertesPdf,
  buildInventaireHistoriquePdf,
  buildTransferHistoriquePdf,
};
