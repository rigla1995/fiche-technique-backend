/**
 * Génère les PDF de contrat / avenant / résiliation DÉJÀ REMPLIS côté backend.
 * Le seul champ laissé à Docuseal est la signature (balise {{Signature;type=signature}}),
 * détectée automatiquement par l'API Docuseal lors de la création du template depuis le PDF.
 *
 * → Aucune configuration de champ nécessaire dans l'UI Docuseal.
 */
const PDFDocument = require('pdfkit');

// Infos prestataire — à finaliser avec l'avocat (mêmes valeurs que l'aperçu front et generate.js)
const PRESTATAIRE = {
  nom: process.env.APP_NAME || 'LabFlow',
  forme: 'SARL',
  matricule: '1234567/A/M/000',
  rc: 'B0123452024',
  adresse: 'Avenue Habib Bourguiba, 1000 Tunis, Tunisie',
  email: 'contact@labflow-tn.com',
  tel: '+216 71 000 000',
};
const INDIGO = '#1e1b4b';
const AMBER = '#d97706';

const fmtDt = (n) => (n != null ? `${Math.round(Number(n))} DT` : '—');
const fmtDate = (d) => new Date(d || Date.now()).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
const ref = (prefix) => `${prefix}-${Date.now().toString().slice(-8)}`;

function buildDoc(render) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 }, autoFirstPage: true, bufferPages: true });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks).toString('base64')));
      doc.on('error', reject);

      const PW = doc.page.width, PH = doc.page.height, ML = 54, CW = PW - ML * 2, RX = ML + CW;
      const fill = (x, y, w, h, hex) => { doc.rect(x, y, w, h).fill(hex); };
      const hline = (y, hex = '#e2e8f0', x1 = ML, x2 = RX) => { doc.save().moveTo(x1, y).lineTo(x2, y).lineWidth(0.5).stroke(hex).restore(); };
      const txt = (str, x, y, size, bold, hex, opts = {}) => {
        doc.fontSize(size).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(hex).text(str, x, y, { lineBreak: false, ...opts });
      };
      const sectionHdr = (label, y) => {
        fill(ML, y, CW, 20, '#f0f4ff'); hline(y, '#c7d2fe'); hline(y + 20, '#c7d2fe');
        txt(label, ML + 8, y + 6, 8, true, '#3730a3'); return y + 26;
      };
      const valueCell = (value, x, y, w) => {
        doc.save().roundedRect(x, y, w, 16, 3).fillAndStroke('#f8fafc', '#cbd5e1').restore();
        txt(value ?? '', x + 5, y + 4.5, 8, true, '#0f172a', { width: w - 10 });
      };
      const ctx = { doc, PW, PH, ML, CW, RX, fill, hline, txt, sectionHdr, valueCell };

      const header = (title) => {
        fill(0, 0, PW, 119, INDIGO); fill(0, 108, PW, 11, AMBER);
        txt(PRESTATAIRE.nom, ML, 28, 22, true, '#ffffff');
        txt(title, ML, 52, 10, false, '#fde68a');
      };
      const refDate = (refStr, dateStr) => {
        txt(`Réf. ${refStr}`, ML, 28, 8, false, '#fbbf24', { align: 'right', width: CW });
        txt(`Date : ${dateStr}`, ML, 42, 8, false, '#fcd34d', { align: 'right', width: CW });
      };
      const signatures = (clientNom, y) => {
        if (y > PH - 170) { doc.addPage({ margins: { top: 0, bottom: 0, left: 0, right: 0 } }); y = 40; }
        y = sectionHdr('SIGNATURES', y);
        const sw = (CW - 16) / 2, sx1 = ML, sx2 = ML + sw + 16;
        fill(sx1, y, sw, 92, '#f8fafc'); doc.save().strokeColor('#e2e8f0').lineWidth(0.5).rect(sx1, y, sw, 92).stroke().restore();
        txt('LE PRESTATAIRE', sx1 + 8, y + 10, 7, true, '#374151');
        txt(PRESTATAIRE.nom, sx1 + 8, y + 24, 8, true, '#0f172a');
        txt('Bon pour accord', sx1 + 8, y + 38, 7, false, '#64748b');
        hline(y + 76, '#9ca3af', sx1 + 8, sx1 + sw - 8);
        txt('Signature & cachet', sx1 + 8, y + 80, 7, false, '#9ca3af');
        fill(sx2, y, sw, 92, '#f8fafc'); doc.save().strokeColor('#e2e8f0').lineWidth(0.5).rect(sx2, y, sw, 92).stroke().restore();
        txt('LE CLIENT', sx2 + 8, y + 10, 7, true, '#374151');
        txt(clientNom, sx2 + 8, y + 24, 8, true, '#0f172a');
        txt('Lu et approuvé, bon pour accord', sx2 + 8, y + 38, 7, false, '#64748b');
        doc.save().roundedRect(sx2 + 8, y + 52, sw - 16, 22, 3).fillAndStroke('#ffffff', '#cbd5e1').restore();
        // Seule balise laissée à Docuseal :
        txt('{{Signature;type=signature}}', sx2 + 12, y + 60, 7, false, '#94a3b8');
        txt('Signature électronique', sx2 + 8, y + 80, 7, false, '#9ca3af');
        return y + 102;
      };
      const clauses = (items, y) => {
        items.forEach((it) => {
          const bodyH = doc.fontSize(8).font('Helvetica').heightOfString(it.body, { width: CW - 12 });
          if (y + 12 + bodyH + 12 > PH - 40) { doc.addPage({ margins: { top: 0, bottom: 0, left: 0, right: 0 } }); y = 40; }
          txt(it.title, ML, y, 8.5, true, '#1e293b'); y += 12;
          doc.fontSize(8).font('Helvetica').fillColor('#475569').text(it.body, ML, y, { width: CW - 12, lineGap: 2, lineBreak: true });
          y += bodyH + 10;
        });
        return y;
      };
      const stampFooter = (label) => {
        const r = doc.bufferedPageRange();
        for (let i = r.start; i < r.start + r.count; i++) {
          doc.switchToPage(i);
          fill(0, PH - 28, PW, 28, INDIGO);
          txt(`${PRESTATAIRE.nom}  ·  ${label}  ·  Page ${i + 1}/${r.count}  ·  Document confidentiel`, ML, PH - 14, 7, false, '#fbbf24', { align: 'center', width: CW, height: 10 });
        }
      };

      render({ ...ctx, header, refDate, signatures, clauses, stampFooter });
      doc.end();
    } catch (err) { reject(err); }
  });
}

// ── CONTRAT ─────────────────────────────────────────────────────────────────
function generateContratFilled(data) {
  const { nom, email, nbActivites = 0, nbLabos = 0, nbGerants = 0, montantOnboarding, montantMensuel, detailPromotion } = data;
  return buildDoc((c) => {
    const { ML, CW, RX, fill, hline, txt, sectionHdr, valueCell, header, refDate, signatures, clauses, stampFooter } = c;
    header("CONTRAT D'ABONNEMENT");
    refDate(ref('CTR'), fmtDate());
    let y = 138;

    y = sectionHdr('ENTRE LES SOUSSIGNÉS', y);
    fill(ML, y, CW, 88, '#f8fafc'); hline(y, '#e2e8f0'); hline(y + 88, '#e2e8f0');
    const colW = CW / 2;
    txt('LE PRESTATAIRE', ML + 8, y + 8, 7, true, '#374151');
    txt(`${PRESTATAIRE.nom} ${PRESTATAIRE.forme}`, ML + 8, y + 20, 9, true, '#0f172a');
    txt(`Matricule fiscal : ${PRESTATAIRE.matricule}`, ML + 8, y + 34, 7.5, false, '#64748b');
    txt(`RC : ${PRESTATAIRE.rc}`, ML + 8, y + 46, 7.5, false, '#64748b');
    txt(PRESTATAIRE.adresse, ML + 8, y + 58, 7.5, false, '#64748b', { width: colW - 16 });
    txt(`${PRESTATAIRE.email}  ·  ${PRESTATAIRE.tel}`, ML + 8, y + 72, 7.5, false, '#64748b');
    const cx = ML + colW;
    txt('LE CLIENT', cx + 8, y + 8, 7, true, '#374151');
    valueCell(nom, cx + 8, y + 20, colW - 20);
    valueCell(email, cx + 8, y + 42, colW - 20);
    txt('Ci-après dénommé « le Client »', cx + 8, y + 66, 7.5, false, '#94a3b8');
    y += 96;

    y = sectionHdr('ARTICLE 1 — OBJET', y);
    const objet = `${PRESTATAIRE.nom} met à la disposition du Client, sur abonnement, une plateforme logicielle en mode SaaS accessible par navigateur web, dédiée à la gestion des stocks, approvisionnements, pertes, inventaires, fiches techniques et ventes pour les métiers de la restauration.`;
    const oH = c.doc.fontSize(8).font('Helvetica').heightOfString(objet, { width: CW - 16 }) + 16;
    fill(ML, y, CW, oH, '#fffbeb'); hline(y, '#fde68a'); hline(y + oH, '#fde68a');
    c.doc.fontSize(8).font('Helvetica').fillColor('#78350f').text(objet, ML + 8, y + 8, { width: CW - 16, lineGap: 2 });
    y += oH + 12;

    y = sectionHdr('ARTICLE 2 — CONFIGURATION SOUSCRITE', y);
    fill(ML, y, CW, 22, '#eef2ff'); hline(y, '#c7d2fe'); hline(y + 22, '#c7d2fe');
    txt('Ressource', ML + 8, y + 7, 7, true, '#4338ca');
    txt('Quantité souscrite', ML, y + 7, 7, true, '#4338ca', { align: 'right', width: CW - 8 });
    y += 22;
    [['Points de vente (activités)', nbActivites], ['Laboratoires de production', nbLabos], ['Comptes gérants', nbGerants]].forEach(([label, qty], i) => {
      fill(ML, y, CW, 24, i % 2 === 0 ? '#fafbff' : '#ffffff'); hline(y + 24, '#f1f5f9');
      txt(label, ML + 8, y + 8, 9, false, '#0f172a');
      txt(String(qty), ML, y + 8, 9, true, '#4338ca', { align: 'right', width: CW - 12 });
      y += 24;
    });
    y += 12;

    y = sectionHdr('ARTICLE 3 — PRIX ET MODALITÉS DE PAIEMENT', y);
    fill(ML, y, CW, 28, '#f8fafc'); hline(y, '#e2e8f0'); hline(y + 28, '#e2e8f0');
    txt("Frais d'activation (onboarding), payables une fois", ML + 8, y + 9, 8, false, '#374151');
    txt(fmtDt(montantOnboarding), ML, y + 9, 11, true, '#0369a1', { align: 'right', width: CW - 12 });
    y += 28;
    fill(ML, y, CW, 28, '#dbeafe'); hline(y, '#93c5fd'); hline(y + 28, '#1d4ed8');
    txt('Mensualité applicable (promotion incluse)', ML + 8, y + 10, 9, true, '#1e40af');
    txt(`${fmtDt(montantMensuel)} /mois`, ML, y + 9, 11, true, '#1d4ed8', { align: 'right', width: CW - 12 });
    y += 32;
    fill(ML, y, CW, 42, '#fffbeb'); hline(y, '#fde68a'); hline(y + 42, '#fde68a');
    txt('CONDITIONS PARTICULIÈRES', ML + 8, y + 7, 7, true, '#b45309');
    c.doc.fontSize(8).font('Helvetica').fillColor('#78350f').text(detailPromotion || 'Aucune promotion — tarifs standard.', ML + 8, y + 18, { width: CW - 16, lineGap: 1.5, lineBreak: true, height: 20 });
    y += 50;

    y = sectionHdr('ARTICLE 4 — CONDITIONS GÉNÉRALES', y);
    y = clauses([
      { title: '4.1 Durée', body: "Le contrat est conclu pour une durée indéterminée à compter de l'activation du compte, renouvelable par tacite reconduction mensuelle." },
      { title: '4.2 Prix et paiement', body: "Frais d'activation à la souscription, mensualité par avance ; en cas de promotion, le tarif promotionnel s'applique pour la durée indiquée puis le tarif de base reprend automatiquement." },
      { title: '4.3 Données', body: `Les données du Client restent sa propriété exclusive ; ${PRESTATAIRE.nom} en garantit la restitution sur demande.` },
      { title: '4.4 Résiliation', body: "Chaque partie peut résilier moyennant un préavis de 30 jours par email ; suspension possible en cas de non-paiement." },
      { title: '4.5 Droit applicable', body: "Le présent contrat est soumis au droit tunisien ; tout litige relève des tribunaux de Tunis." },
    ], y);

    y = signatures(nom, y);
    stampFooter("Contrat d'abonnement");
  });
}

// ── AVENANT ─────────────────────────────────────────────────────────────────
function generateAvenantFilled(data) {
  const { nom, email, nbActivites = 0, nbLabos = 0, nbGerants = 0, montantMensuel, ajout } = data;
  return buildDoc((c) => {
    const { ML, CW, fill, hline, txt, sectionHdr, valueCell, header, refDate, signatures, clauses, stampFooter } = c;
    header("AVENANT AU CONTRAT D'ABONNEMENT");
    refDate(ref('AVN'), fmtDate());
    let y = 138;

    y = sectionHdr('CLIENT CONCERNÉ', y);
    fill(ML, y, CW, 50, '#f8fafc'); hline(y, '#e2e8f0'); hline(y + 50, '#e2e8f0');
    txt('LE CLIENT', ML + 8, y + 8, 7, true, '#374151');
    valueCell(nom, ML + 8, y + 20, CW / 2 - 16);
    valueCell(email, ML + CW / 2, y + 20, CW / 2 - 16);
    y += 58;

    y = sectionHdr("ARTICLE 1 — OBJET DE L'AVENANT", y);
    const objet = `Le présent avenant modifie le contrat d'abonnement en vigueur entre ${PRESTATAIRE.nom} et le Client${ajout ? ` (${ajout})` : ''}. Il prend effet à la date de signature et complète les termes du contrat initial sans s'y substituer.`;
    const oH = c.doc.fontSize(8).font('Helvetica').heightOfString(objet, { width: CW - 16 }) + 16;
    fill(ML, y, CW, oH, '#fffbeb'); hline(y, '#fde68a'); hline(y + oH, '#fde68a');
    c.doc.fontSize(8).font('Helvetica').fillColor('#78350f').text(objet, ML + 8, y + 8, { width: CW - 16, lineGap: 2 });
    y += oH + 12;

    y = sectionHdr('ARTICLE 2 — NOUVELLE CONFIGURATION', y);
    fill(ML, y, CW, 22, '#eef2ff'); hline(y, '#c7d2fe'); hline(y + 22, '#c7d2fe');
    txt('Ressource', ML + 8, y + 7, 7, true, '#4338ca');
    txt('Nouvelle quantité', ML, y + 7, 7, true, '#4338ca', { align: 'right', width: CW - 8 });
    y += 22;
    [['Points de vente (activités)', nbActivites], ['Laboratoires de production', nbLabos], ['Comptes gérants', nbGerants]].forEach(([label, qty], i) => {
      fill(ML, y, CW, 24, i % 2 === 0 ? '#fafbff' : '#ffffff'); hline(y + 24, '#f1f5f9');
      txt(label, ML + 8, y + 8, 9, false, '#0f172a');
      txt(String(qty), ML, y + 8, 9, true, '#4338ca', { align: 'right', width: CW - 12 });
      y += 24;
    });
    y += 12;

    y = sectionHdr('ARTICLE 3 — NOUVELLE TARIFICATION', y);
    fill(ML, y, CW, 28, '#dbeafe'); hline(y, '#93c5fd'); hline(y + 28, '#1d4ed8');
    txt('Nouvelle mensualité (promotion incluse)', ML + 8, y + 10, 9, true, '#1e40af');
    txt(`${fmtDt(montantMensuel)} /mois`, ML, y + 9, 11, true, '#1d4ed8', { align: 'right', width: CW - 12 });
    y += 36;

    y = clauses([
      { title: 'Article 4 — Prise d\'effet', body: "Le présent avenant entre en vigueur à sa date de signature électronique et fait partie intégrante du contrat d'abonnement initial." },
      { title: 'Article 5 — Droit applicable', body: "Le présent avenant est soumis au droit tunisien ; tout litige relève des tribunaux de Tunis." },
    ], y);

    y = signatures(nom, y);
    stampFooter('Avenant au contrat');
  });
}

// ── RÉSILIATION ───────────────────────────────────────────────────────────────
function generateResiliationFilled(data) {
  const { nom, email } = data;
  return buildDoc((c) => {
    const { ML, CW, fill, hline, txt, sectionHdr, valueCell, header, refDate, signatures, clauses, stampFooter } = c;
    header("RÉSILIATION DU CONTRAT D'ABONNEMENT");
    refDate(ref('RES'), fmtDate());
    let y = 138;

    y = sectionHdr('CLIENT CONCERNÉ', y);
    fill(ML, y, CW, 50, '#f8fafc'); hline(y, '#e2e8f0'); hline(y + 50, '#e2e8f0');
    txt('LE CLIENT', ML + 8, y + 8, 7, true, '#374151');
    valueCell(nom, ML + 8, y + 20, CW / 2 - 16);
    valueCell(email, ML + CW / 2, y + 20, CW / 2 - 16);
    y += 58;

    y = sectionHdr('ARTICLE 1 — OBJET', y);
    const objet = `Le présent document constate la résiliation du contrat d'abonnement conclu entre ${PRESTATAIRE.nom} et le Client, et met fin à la mise à disposition de la plateforme dans les conditions ci-après.`;
    const oH = c.doc.fontSize(8).font('Helvetica').heightOfString(objet, { width: CW - 16 }) + 16;
    fill(ML, y, CW, oH, '#fef2f2'); hline(y, '#fecaca'); hline(y + oH, '#fecaca');
    c.doc.fontSize(8).font('Helvetica').fillColor('#7f1d1d').text(objet, ML + 8, y + 8, { width: CW - 16, lineGap: 2 });
    y += oH + 12;

    y = clauses([
      { title: 'Article 2 — Préavis et date d\'effet', body: "La résiliation prend effet à l'issue d'un préavis de 30 jours à compter de la date de signature. Le service reste accessible et facturé jusqu'au terme du préavis." },
      { title: 'Article 3 — Effets', body: "Au terme du préavis, l'accès du Client et de ses gérants est désactivé. Les sommes échues avant la date d'effet restent dues." },
      { title: 'Article 4 — Sort des données', body: `Le Client peut exporter ses données avant la date d'effet ; à défaut, ${PRESTATAIRE.nom} les conserve 30 jours puis les supprime définitivement.` },
      { title: 'Article 5 — Droit applicable', body: "La présente résiliation est soumise au droit tunisien ; tout litige relève des tribunaux de Tunis." },
    ], y);

    y = signatures(nom, y);
    stampFooter('Résiliation de contrat');
  });
}

module.exports = { generateContratFilled, generateAvenantFilled, generateResiliationFilled };
