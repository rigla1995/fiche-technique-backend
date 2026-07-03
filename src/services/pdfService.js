const PDFDocument = require('pdfkit');

const APP_NAME = process.env.APP_NAME || 'Fiche Technique';

const fmtDt = (n) => (n != null ? `${Math.round(Number(n))} DT` : '—');
const todayFr = () => new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
const fmtDate = (d) => d
  ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
  : todayFr();

const generateAvenantPdf = (params) => new Promise((resolve, reject) => {
  const {
    nom, notesAdmin,
    nbActivitesAdded, nbLabosAdded, nbGerantsAdded,
    nbActivites, nbLabos, nbGerants,
    activiteCost, laboCost, gerantCost, newMensuel,
    promoApplied, effectifMensuel,
    dateAvenant,
    ancienMensuel,
  } = params;

  try {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 }, autoFirstPage: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    doc.on('error', reject);

    const PW = doc.page.width;   // 595.28
    const PH = doc.page.height;  // 841.89
    const ML = 54;
    const CW = PW - ML * 2;
    const RX = ML + CW;
    const dateStr = fmtDate(dateAvenant);
    const ref = `AVN-${Date.now().toString().slice(-8)}`;

    // ── Helpers ──────────────────────────────────────────────────────────────
    const fill = (x, y, w, h, hex) => { doc.rect(x, y, w, h).fill(hex); };

    const hline = (y, hex = '#e2e8f0', x1 = ML, x2 = RX) => {
      doc.save().moveTo(x1, y).lineTo(x2, y).lineWidth(0.5).stroke(hex).restore();
    };

    const txt = (str, x, y, size, bold, hex, opts = {}) => {
      doc.fontSize(size)
         .font(bold ? 'Helvetica-Bold' : 'Helvetica')
         .fillColor(hex)
         .text(str, x, y, { lineBreak: false, ...opts });
    };

    const sectionHdr = (label, y) => {
      fill(ML, y, CW, 20, '#f0f4ff');
      hline(y, '#c7d2fe'); hline(y + 20, '#c7d2fe');
      txt(label, ML + 8, y + 6, 8, true, '#3730a3');
      return y + 26;
    };

    let y = 0;

    // ── HEADER ────────────────────────────────────────────────────────────────
    fill(0, 0, PW, 119, '#1e1b4b');
    fill(0, 108, PW, 11, '#d97706');
    txt(APP_NAME, ML, 28, 22, true, '#ffffff');
    txt('AVENANT AU CONTRAT D\'ABONNEMENT', ML, 52, 10, false, '#fde68a');
    txt(`Réf. ${ref}`, ML, 28, 8, false, '#fbbf24', { align: 'right', width: CW });
    txt(`Émis le ${dateStr}`, ML, 42, 8, false, '#fcd34d', { align: 'right', width: CW });
    y = 153;

    // ── OBJET ─────────────────────────────────────────────────────────────────
    y = sectionHdr('OBJET DE L\'AVENANT', y);
    const objetText =
      `Le présent avenant modifie le contrat d'abonnement en vigueur entre ${APP_NAME} et le client ${nom}. ` +
      `Il prend effet à compter du ${dateStr} et complète les termes initiaux du contrat sans les remplacer.`;
    // measure text height
    const objetLines = doc.fontSize(8).font('Helvetica').heightOfString(objetText, { width: CW - 16 });
    const objetH = Math.max(40, objetLines + 20);
    fill(ML, y, CW, objetH, '#fffbeb');
    hline(y, '#fde68a'); hline(y + objetH, '#fde68a');
    doc.fontSize(8).font('Helvetica').fillColor('#78350f')
       .text(objetText, ML + 8, y + 8, { width: CW - 16, lineGap: 2, lineBreak: true });
    y += objetH + 10;

    // ── CLIENT ────────────────────────────────────────────────────────────────
    y = sectionHdr('CLIENT', y);
    fill(ML, y, CW, 36, '#f8fafc');
    hline(y, '#e2e8f0'); hline(y + 36, '#e2e8f0');
    txt(nom, ML + 8, y + 12, 9, true, '#0f172a');
    y += 44;

    // ── MODIFICATION APPORTÉE ─────────────────────────────────────────────────
    y = sectionHdr('MODIFICATION APPORTÉE', y);
    const addedParts = [
      nbActivitesAdded > 0 && `+${nbActivitesAdded} activité${nbActivitesAdded > 1 ? 's' : ''}`,
      nbLabosAdded > 0     && `+${nbLabosAdded} labo${nbLabosAdded > 1 ? 's' : ''}`,
      nbGerantsAdded > 0   && `+${nbGerantsAdded} gérant${nbGerantsAdded > 1 ? 's' : ''}`,
    ].filter(Boolean).join('   ·   ');
    fill(ML, y, CW, 44, '#f0fdf4');
    hline(y, '#bbf7d0'); hline(y + 44, '#bbf7d0');
    txt('CAPACITÉ AJOUTÉE', ML + 8, y + 8, 7, true, '#15803d');
    txt(addedParts, ML + 8, y + 24, 13, true, '#14532d');
    y += 52;

    // ── NOUVELLE CONFIGURATION ────────────────────────────────────────────────
    y = sectionHdr('NOUVELLE CONFIGURATION', y);
    // Table header
    fill(ML, y, CW, 22, '#eef2ff');
    hline(y, '#c7d2fe'); hline(y + 22, '#c7d2fe');
    txt('Poste', ML + 8, y + 7, 7, true, '#4338ca');
    txt('Qté', ML + 200, y + 7, 7, true, '#4338ca');
    txt('Tarif mensuel', ML, y + 7, 7, true, '#4338ca', { align: 'right', width: CW - 8 });
    y += 22;

    let rowIdx = 0;
    const drawRow = (label, qty, cost, isTotal = false) => {
      const rh = isTotal ? 28 : 22;
      const yOff = isTotal ? 9 : 7;
      fill(ML, y, CW, rh, isTotal ? '#dbeafe' : (rowIdx % 2 === 0 ? '#fafbff' : '#ffffff'));
      hline(y + rh, '#f1f5f9');
      txt(label, ML + 8, y + yOff, isTotal ? 10 : 9, isTotal, isTotal ? '#1e40af' : '#0f172a');
      if (qty !== null) txt(String(qty), ML + 200, y + yOff, isTotal ? 10 : 9, true, '#4338ca');
      txt(cost, ML, y + yOff, isTotal ? 10 : 8, isTotal, isTotal ? '#1d4ed8' : '#374151', { align: 'right', width: CW - 8 });
      y += rh;
      rowIdx++;
    };

    drawRow('Activités', nbActivites, fmtDt(activiteCost));
    if (nbLabos > 0)   drawRow('Labos', nbLabos, fmtDt(laboCost));
    if (nbGerants > 0) drawRow('Gérants', nbGerants, fmtDt(gerantCost));
    drawRow('Total mensuel', null, fmtDt(newMensuel), true);
    y += 10;

    // ── IMPACT FINANCIER ──────────────────────────────────────────────────────
    y = sectionHdr('IMPACT FINANCIER', y);

    const prevMensuel = ancienMensuel != null ? ancienMensuel : null;
    if (prevMensuel != null) {
      fill(ML, y, CW, 28, '#f8fafc');
      hline(y, '#e2e8f0'); hline(y + 28, '#e2e8f0');
      txt('Mensualité précédente', ML + 8, y + 10, 8, false, '#64748b');
      txt(fmtDt(prevMensuel), ML, y + 10, 10, false, '#94a3b8', { align: 'right', width: CW - 8 });
      y += 28;
    }

    // Nouveau mensuel band
    const mensH = promoApplied && effectifMensuel != null && effectifMensuel !== newMensuel ? 44 : 36;
    fill(ML, y, CW, mensH, '#dbeafe');
    hline(y, '#93c5fd'); hline(y + mensH, '#1d4ed8');
    txt('Nouvelle mensualité', ML + 8, y + 10, 9, true, '#1e40af');
    txt(fmtDt(newMensuel) + ' /mois', ML, y + 10, 11, true, '#1d4ed8', { align: 'right', width: CW - 8 });
    if (promoApplied && effectifMensuel != null && effectifMensuel !== newMensuel) {
      txt(`Promo active : ${fmtDt(effectifMensuel)} /mois effectif`, ML + 8, y + 28, 7, false, '#7c3aed');
    } else {
      txt('Facturation mensuelle récurrente', ML + 8, y + 26, 7, false, '#3b82f6');
    }
    y += mensH + 12;

    // ── NOTE ADMIN ────────────────────────────────────────────────────────────
    if (notesAdmin && notesAdmin.trim()) {
      y = sectionHdr('NOTE', y);
      const noteH = Math.max(28, doc.fontSize(8).font('Helvetica').heightOfString(notesAdmin, { width: CW - 16 }) + 16);
      fill(ML, y, CW, noteH, '#eff6ff');
      hline(y, '#bfdbfe'); hline(y + noteH, '#bfdbfe');
      doc.fontSize(8).font('Helvetica').fillColor('#1e3a5f')
         .text(notesAdmin, ML + 8, y + 8, { width: CW - 16, lineGap: 2, lineBreak: true });
      y += noteH + 10;
    }

    // ── SIGNATURES ────────────────────────────────────────────────────────────
    if (y > PH - 200) { doc.addPage({ margins: { top: 0, bottom: 0, left: 0, right: 0 } }); y = 40; }
    y = sectionHdr('SIGNATURES', y);
    const sw = (CW - 16) / 2;
    const sx1 = ML;
    const sx2 = ML + sw + 16;

    fill(sx1, y, sw, 72, '#f8fafc');
    doc.save().strokeColor('#e2e8f0').lineWidth(0.5).rect(sx1, y, sw, 72).stroke().restore();
    txt('PRESTATAIRE', sx1 + 8, y + 10, 7, true, '#374151');
    txt(APP_NAME, sx1 + 8, y + 24, 8, false, '#64748b');
    txt(`Date : ${dateStr}`, sx1 + 8, y + 36, 7, false, '#64748b');
    hline(y + 57, '#9ca3af', sx1 + 8, sx1 + sw - 8);
    txt('Signature & cachet', sx1 + 8, y + 62, 7, false, '#9ca3af');

    fill(sx2, y, sw, 72, '#f8fafc');
    doc.save().strokeColor('#e2e8f0').lineWidth(0.5).rect(sx2, y, sw, 72).stroke().restore();
    txt('CLIENT', sx2 + 8, y + 10, 7, true, '#374151');
    txt(nom, sx2 + 8, y + 24, 8, false, '#64748b');
    txt(`Date : ${dateStr}`, sx2 + 8, y + 36, 7, false, '#64748b');
    hline(y + 57, '#9ca3af', sx2 + 8, sx2 + sw - 8);
    txt(`Signature — ${nom}`, sx2 + 8, y + 62, 7, false, '#9ca3af');
    y += 82;

    // ── ACCEPTATION NUMÉRIQUE ─────────────────────────────────────────────────
    fill(ML, y, CW, 24, '#fefce8');
    hline(y, '#fde68a'); hline(y + 24, '#fde68a');
    doc.fontSize(7.5).font('Helvetica').fillColor('#92400e')
       .text('Validation numérique : la validation de cet avenant vaut acceptation des nouvelles conditions tarifaires.',
         ML + 8, y + 8, { width: CW - 16, lineBreak: true });

    // ── FOOTER ────────────────────────────────────────────────────────────────
    fill(0, PH - 28, PW, 28, '#1e1b4b');
    txt(`${APP_NAME}  ·  Avenant généré le ${todayFr()}  ·  Document confidentiel`,
      ML, PH - 14, 7, false, '#fbbf24', { align: 'center', width: CW });

    doc.end();
  } catch (err) {
    reject(err);
  }
});

const generateContratPdf = (params) => new Promise((resolve, reject) => {
  const { nom, email, telephone, adresse, montantMensuel, nbActivites, nbLabos, nbGerants, dateContrat } = params;
  try {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 }, autoFirstPage: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
    doc.on('error', reject);

    const PW = doc.page.width;
    const PH = doc.page.height;
    const ML = 54;
    const CW = PW - ML * 2;
    const RX = ML + CW;
    const dateStr = fmtDate(dateContrat);
    const ref = `CTR-${Date.now().toString().slice(-8)}`;

    const fill = (x, y, w, h, hex) => { doc.rect(x, y, w, h).fill(hex); };
    const hline = (y, hex = '#e2e8f0', x1 = ML, x2 = RX) => {
      doc.save().moveTo(x1, y).lineTo(x2, y).lineWidth(0.5).stroke(hex).restore();
    };
    const txt = (str, x, y, size, bold, hex, opts = {}) => {
      doc.fontSize(size).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(hex)
         .text(str, x, y, { lineBreak: false, ...opts });
    };
    const sectionHdr = (label, y) => {
      fill(ML, y, CW, 20, '#f0f4ff');
      hline(y, '#c7d2fe'); hline(y + 20, '#c7d2fe');
      txt(label, ML + 8, y + 6, 8, true, '#3730a3');
      return y + 26;
    };

    let y = 0;

    // Header
    fill(0, 0, PW, 119, '#1e1b4b');
    fill(0, 108, PW, 11, '#d97706');
    txt(APP_NAME, ML, 28, 22, true, '#ffffff');
    txt('CONTRAT D\'ABONNEMENT', ML, 52, 10, false, '#fde68a');
    txt(`Réf. ${ref}`, ML, 28, 8, false, '#fbbf24', { align: 'right', width: CW });
    txt(`Émis le ${dateStr}`, ML, 42, 8, false, '#fcd34d', { align: 'right', width: CW });
    y = 140;

    // Parties
    y = sectionHdr('PARTIES AU CONTRAT', y);
    fill(ML, y, CW, 52, '#f8fafc');
    hline(y, '#e2e8f0'); hline(y + 52, '#e2e8f0');
    txt('PRESTATAIRE', ML + 8, y + 8, 7, true, '#374151');
    txt(APP_NAME, ML + 8, y + 20, 9, true, '#0f172a');
    txt('CLIENT', ML + CW / 2, y + 8, 7, true, '#374151');
    txt(nom, ML + CW / 2, y + 20, 9, true, '#0f172a');
    if (email) txt(email, ML + CW / 2, y + 32, 8, false, '#64748b');
    if (telephone) txt(telephone, ML + CW / 2, y + 42, 8, false, '#64748b');
    y += 60;

    // Objet
    y = sectionHdr('OBJET', y);
    const objetText = `${APP_NAME} met à disposition du Client une plateforme SaaS de gestion de stocks, approvisionnements, pertes, inventaires et ventes pour la restauration. L'accès est fourni via l'interface web sur abonnement mensuel.`;
    const objH = Math.max(44, doc.fontSize(8).font('Helvetica').heightOfString(objetText, { width: CW - 16 }) + 20);
    fill(ML, y, CW, objH, '#fffbeb');
    hline(y, '#fde68a'); hline(y + objH, '#fde68a');
    doc.fontSize(8).font('Helvetica').fillColor('#78350f').text(objetText, ML + 8, y + 8, { width: CW - 16, lineGap: 2, lineBreak: true });
    y += objH + 10;

    // Configuration souscrite
    y = sectionHdr('CONFIGURATION SOUSCRITE', y);
    fill(ML, y, CW, 22, '#eef2ff');
    hline(y, '#c7d2fe'); hline(y + 22, '#c7d2fe');
    txt('Poste', ML + 8, y + 7, 7, true, '#4338ca');
    txt('Quantité', ML, y + 7, 7, true, '#4338ca', { align: 'right', width: CW - 8 });
    y += 22;
    const rows = [
      ['Activités', nbActivites ?? 1],
      ['Labos', nbLabos ?? 0],
      ['Gérants', nbGerants ?? 0],
    ];
    rows.forEach(([label, qty], i) => {
      fill(ML, y, CW, 22, i % 2 === 0 ? '#fafbff' : '#ffffff');
      hline(y + 22, '#f1f5f9');
      txt(String(label), ML + 8, y + 7, 9, false, '#0f172a');
      txt(String(qty), ML, y + 7, 9, true, '#4338ca', { align: 'right', width: CW - 8 });
      y += 22;
    });
    y += 10;

    // Tarification
    y = sectionHdr('TARIFICATION', y);
    const mensH = 36;
    fill(ML, y, CW, mensH, '#dbeafe');
    hline(y, '#93c5fd'); hline(y + mensH, '#1d4ed8');
    txt('Mensualité', ML + 8, y + 10, 9, true, '#1e40af');
    txt(montantMensuel != null ? `${fmtDt(montantMensuel)} / mois` : 'Sur devis', ML, y + 10, 11, true, '#1d4ed8', { align: 'right', width: CW - 8 });
    txt('Facturation mensuelle récurrente', ML + 8, y + 26, 7, false, '#3b82f6');
    y += mensH + 12;

    // Conditions générales
    y = sectionHdr('CONDITIONS GÉNÉRALES', y);
    const cg = [
      'Durée : Le contrat est conclu pour une durée indéterminée, renouvelable tacitement chaque mois.',
      'Résiliation : Chaque partie peut résilier avec un préavis de 30 jours par email.',
      'Confidentialité : Les données du Client sont traitées conformément au RGPD et à la politique de confidentialité de ' + APP_NAME + '.',
      'Disponibilité : Le service est accessible 24h/24 sous réserve de maintenance planifiée.',
    ];
    const cgText = cg.join('\n');
    const cgH = Math.max(50, doc.fontSize(8).font('Helvetica').heightOfString(cgText, { width: CW - 16 }) + 20);
    fill(ML, y, CW, cgH, '#f8fafc');
    hline(y, '#e2e8f0'); hline(y + cgH, '#e2e8f0');
    doc.fontSize(8).font('Helvetica').fillColor('#374151').text(cgText, ML + 8, y + 8, { width: CW - 16, lineGap: 4, lineBreak: true });
    y += cgH + 12;

    // Signatures
    if (y > PH - 180) { doc.addPage({ margins: { top: 0, bottom: 0, left: 0, right: 0 } }); y = 40; }
    y = sectionHdr('SIGNATURES', y);
    const sw = (CW - 16) / 2;
    const sx1 = ML, sx2 = ML + sw + 16;
    fill(sx1, y, sw, 72, '#f8fafc');
    doc.save().strokeColor('#e2e8f0').lineWidth(0.5).rect(sx1, y, sw, 72).stroke().restore();
    txt('PRESTATAIRE', sx1 + 8, y + 10, 7, true, '#374151');
    txt(APP_NAME, sx1 + 8, y + 24, 8, false, '#64748b');
    txt(`Date : ${dateStr}`, sx1 + 8, y + 36, 7, false, '#64748b');
    hline(y + 57, '#9ca3af', sx1 + 8, sx1 + sw - 8);
    txt('Signature validée', sx1 + 8, y + 62, 7, false, '#9ca3af');

    fill(sx2, y, sw, 72, '#f8fafc');
    doc.save().strokeColor('#e2e8f0').lineWidth(0.5).rect(sx2, y, sw, 72).stroke().restore();
    txt('CLIENT', sx2 + 8, y + 10, 7, true, '#374151');
    txt(nom, sx2 + 8, y + 24, 8, false, '#64748b');
    hline(y + 57, '#9ca3af', sx2 + 8, sx2 + sw - 8);
    txt('Signature à l\'activation du compte', sx2 + 8, y + 62, 7, false, '#9ca3af');
    y += 82;

    // Acceptation numérique
    fill(ML, y, CW, 24, '#fefce8');
    hline(y, '#fde68a'); hline(y + 24, '#fde68a');
    doc.fontSize(7.5).font('Helvetica').fillColor('#92400e')
       .text(`En activant votre compte ${APP_NAME}, vous acceptez électroniquement les termes du présent contrat. Cette acceptation est horodatée et constitue une signature électronique valide.`, ML + 8, y + 8, { width: CW - 16, lineBreak: true });

    // Footer
    fill(0, PH - 28, PW, 28, '#1e1b4b');
    txt(`${APP_NAME}  ·  Contrat généré le ${todayFr()}  ·  Document confidentiel`, ML, PH - 14, 7, false, '#fbbf24', { align: 'center', width: CW });

    doc.end();
  } catch (err) {
    reject(err);
  }
});

// Facture mensuelle d'abonnement (générée à la validation d'un paiement).
// Même identité visuelle que le contrat/avenant (en-tête bleu nuit + barre ambre).
// Prestataire & identifiants fiscaux configurables par env (placeholders par défaut).
// Facture pro — déléguée au module de charte (docuseal-templates/generate.js,
// buildFacture) : même identité visuelle que les contrats (logo, dégradé, blocs
// parties, pied légal env-driven). Sortie DÉTERMINISTE conservée (CreationDate =
// date de facture, jamais l'horloge) → copie email == copie re-téléchargée.
const generateFacturePdf = async (params) => {
  // require inline : évite de charger pdfkit/le module de charte deux fois au boot
  const { buildFacture } = require('../../docuseal-templates/generate');
  const buffer = await buildFacture(null, params);
  return buffer.toString('base64');
};

module.exports = { generateAvenantPdf, generateContratPdf, generateFacturePdf };
