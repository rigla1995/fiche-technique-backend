/**
 * Génère les 2 templates PDF à uploader dans DocuSeal :
 *   - contrat-labflow.pdf  (contrat d'abonnement)
 *   - avenant-labflow.pdf  (avenant au contrat)
 *
 * Les balises {{Nom du champ}} sont détectées automatiquement par DocuSeal à l'upload
 * et deviennent des champs pré-remplis par l'API (voir src/services/docusealService.js).
 * Champs injectés par le code : Nom du client, Email, Date du contrat,
 * Nb activités, Nb labos, Nb gérants, Montant onboarding, Montant mensuel.
 *
 * Usage : node docuseal-templates/generate.js
 */
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// ── Identité prestataire (À COMPLÉTER avec les infos légales réelles) ──────────
const PRESTATAIRE = {
  nom: 'LabFlow',
  forme: 'SARL', // forme juridique — à confirmer
  matricule: '________________',     // matricule fiscal
  rc: '________________',            // registre de commerce
  adresse: '________________________________', // adresse du siège
  email: 'contact@labflow-tn.com',
  tel: '________________',
};

const INDIGO = '#1e1b4b';
const AMBER = '#d97706';

// ── Helpers de mise en page ───────────────────────────────────────────────────
function makeDoc() {
  const doc = new PDFDocument({ size: 'A4', margins: { top: 0, bottom: 0, left: 0, right: 0 }, autoFirstPage: true, bufferPages: true });
  const PW = doc.page.width;   // 595.28
  const PH = doc.page.height;  // 841.89
  const ML = 54;
  const CW = PW - ML * 2;
  const RX = ML + CW;

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
  // Cellule "label : {{tag}}" — la balise apparaît en gris encadré, prête pour DocuSeal
  const fieldTag = (tag, x, y, w) => {
    doc.save().roundedRect(x, y, w, 16, 3).fillAndStroke('#ffffff', '#cbd5e1').restore();
    txt(`{{${tag}}}`, x + 5, y + 4.5, 8, false, '#94a3b8', { width: w - 10 });
    return y;
  };

  return { doc, PW, PH, ML, CW, RX, fill, hline, txt, sectionHdr, fieldTag };
}

function header(ctx, title) {
  const { PW, ML, CW, fill, txt } = ctx;
  fill(0, 0, PW, 119, INDIGO);
  fill(0, 108, PW, 11, AMBER);
  txt(PRESTATAIRE.nom, ML, 28, 22, true, '#ffffff');
  txt(title, ML, 52, 10, false, '#fde68a');
  // Réf + date : laissés en balises pour DocuSeal
  txt('Réf. {{Réf}}', ML, 28, 8, false, '#fbbf24', { align: 'right', width: CW });
  txt('Date : {{Date du contrat}}', ML, 42, 8, false, '#fcd34d', { align: 'right', width: CW });
}

// Stampe le footer sur toutes les pages réellement remplies, puis supprime une
// éventuelle page vide en fin de document (créée par le flux de texte pdfkit).
function stampFooters(ctx, label) {
  const { doc, PW, PH, ML, CW, fill, txt } = ctx;
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    fill(0, PH - 28, PW, 28, INDIGO);
    txt(`${PRESTATAIRE.nom}  ·  ${label}  ·  Page ${i + 1}/${range.count}  ·  Document confidentiel`,
      ML, PH - 14, 7, false, '#fbbf24', { align: 'center', width: CW, height: 10 });
  }
}

// Bloc de clauses : titre + liste numérotée, gère le saut de page
function clauses(ctx, y, items) {
  const { doc, PH, ML, CW, txt } = ctx;
  items.forEach((it) => {
    const titleH = 12;
    const bodyH = doc.fontSize(8).font('Helvetica').heightOfString(it.body, { width: CW - 12 });
    const blockH = titleH + bodyH + 12;
    if (y + blockH > PH - 40) { doc.addPage({ margins: { top: 0, bottom: 0, left: 0, right: 0 } }); y = 40; }
    txt(it.title, ML, y, 8.5, true, '#1e293b');
    y += titleH;
    doc.fontSize(8).font('Helvetica').fillColor('#475569')
       .text(it.body, ML, y, { width: CW - 12, lineGap: 2, lineBreak: true });
    y += bodyH + 10;
  });
  return y;
}

// Bloc signatures : prestataire (cachet) + client (balise signature DocuSeal)
function signatures(ctx, y) {
  const { doc, PH, ML, CW, fill, hline, txt, sectionHdr } = ctx;
  if (y > PH - 170) { doc.addPage({ margins: { top: 0, bottom: 0, left: 0, right: 0 } }); y = 40; }
  y = sectionHdr('SIGNATURES', y);
  const sw = (CW - 16) / 2;
  const sx1 = ML, sx2 = ML + sw + 16;

  // Prestataire
  fill(sx1, y, sw, 92, '#f8fafc');
  doc.save().strokeColor('#e2e8f0').lineWidth(0.5).rect(sx1, y, sw, 92).stroke().restore();
  txt('LE PRESTATAIRE', sx1 + 8, y + 10, 7, true, '#374151');
  txt(PRESTATAIRE.nom, sx1 + 8, y + 24, 8, true, '#0f172a');
  txt('Bon pour accord', sx1 + 8, y + 38, 7, false, '#64748b');
  hline(y + 76, '#9ca3af', sx1 + 8, sx1 + sw - 8);
  txt('Signature & cachet', sx1 + 8, y + 80, 7, false, '#9ca3af');

  // Client
  fill(sx2, y, sw, 92, '#f8fafc');
  doc.save().strokeColor('#e2e8f0').lineWidth(0.5).rect(sx2, y, sw, 92).stroke().restore();
  txt('LE CLIENT', sx2 + 8, y + 10, 7, true, '#374151');
  txt('{{Nom du client}}', sx2 + 8, y + 24, 8, false, '#94a3b8');
  txt('Lu et approuvé, bon pour accord', sx2 + 8, y + 38, 7, false, '#64748b');
  // Zone de signature DocuSeal
  doc.save().roundedRect(sx2 + 8, y + 52, sw - 16, 22, 3).fillAndStroke('#ffffff', '#cbd5e1').restore();
  txt('{{Signature;type=signature}}', sx2 + 12, y + 60, 7, false, '#94a3b8');
  txt('Signature électronique', sx2 + 8, y + 80, 7, false, '#9ca3af');
  return y + 102;
}

// ══════════════════════════════════════════════════════════════════════════════
// 1) CONTRAT D'ABONNEMENT
// ══════════════════════════════════════════════════════════════════════════════
function buildContrat(outPath) {
  const ctx = makeDoc();
  const { doc, ML, CW, fill, hline, txt, sectionHdr, fieldTag } = ctx;
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  header(ctx, "CONTRAT D'ABONNEMENT");
  let y = 138;

  // PARTIES
  y = sectionHdr('ENTRE LES SOUSSIGNÉS', y);
  fill(ML, y, CW, 88, '#f8fafc');
  hline(y, '#e2e8f0'); hline(y + 88, '#e2e8f0');
  const colW = CW / 2;
  // Prestataire
  txt('LE PRESTATAIRE', ML + 8, y + 8, 7, true, '#374151');
  txt(PRESTATAIRE.nom + ' ' + PRESTATAIRE.forme, ML + 8, y + 20, 9, true, '#0f172a');
  txt(`Matricule fiscal : ${PRESTATAIRE.matricule}`, ML + 8, y + 34, 7.5, false, '#64748b');
  txt(`RC : ${PRESTATAIRE.rc}`, ML + 8, y + 46, 7.5, false, '#64748b');
  txt(PRESTATAIRE.adresse, ML + 8, y + 58, 7.5, false, '#64748b', { width: colW - 16 });
  txt(`${PRESTATAIRE.email}  ·  ${PRESTATAIRE.tel}`, ML + 8, y + 72, 7.5, false, '#64748b');
  // Client
  const cx = ML + colW;
  txt('LE CLIENT', cx + 8, y + 8, 7, true, '#374151');
  fieldTag('Nom du client', cx + 8, y + 20, colW - 20);
  fieldTag('Email', cx + 8, y + 42, colW - 20);
  txt("Ci-après dénommé « le Client »", cx + 8, y + 66, 7.5, false, '#94a3b8');
  y += 96;

  // OBJET
  y = sectionHdr('ARTICLE 1 — OBJET', y);
  const objet = `${PRESTATAIRE.nom} met à la disposition du Client, sur abonnement, une plateforme logicielle en mode SaaS (Software as a Service) accessible par navigateur web, dédiée à la gestion des stocks, approvisionnements, pertes, inventaires, fiches techniques et ventes pour les métiers de la restauration. Le présent contrat définit les conditions de cette mise à disposition.`;
  const oH = doc.fontSize(8).font('Helvetica').heightOfString(objet, { width: CW - 16 }) + 16;
  fill(ML, y, CW, oH, '#fffbeb'); hline(y, '#fde68a'); hline(y + oH, '#fde68a');
  doc.fontSize(8).font('Helvetica').fillColor('#78350f').text(objet, ML + 8, y + 8, { width: CW - 16, lineGap: 2 });
  y += oH + 12;

  // CONFIGURATION
  y = sectionHdr('ARTICLE 2 — CONFIGURATION SOUSCRITE', y);
  fill(ML, y, CW, 22, '#eef2ff'); hline(y, '#c7d2fe'); hline(y + 22, '#c7d2fe');
  txt('Ressource', ML + 8, y + 7, 7, true, '#4338ca');
  txt('Quantité souscrite', ML, y + 7, 7, true, '#4338ca', { align: 'right', width: CW - 8 });
  y += 22;
  const conf = [['Points de vente (activités)', 'Nb activités'], ['Laboratoires de production', 'Nb labos'], ['Comptes gérants', 'Nb gérants']];
  conf.forEach(([label, tag], i) => {
    fill(ML, y, CW, 24, i % 2 === 0 ? '#fafbff' : '#ffffff'); hline(y + 24, '#f1f5f9');
    txt(label, ML + 8, y + 8, 9, false, '#0f172a');
    fieldTag(tag, RXcol(ctx), y + 4, 70);
    y += 24;
  });
  y += 12;

  // TARIFICATION
  y = sectionHdr('ARTICLE 3 — PRIX ET MODALITÉS DE PAIEMENT', y);
  // Frais d'activation
  fill(ML, y, CW, 28, '#f8fafc'); hline(y, '#e2e8f0'); hline(y + 28, '#e2e8f0');
  txt("Frais d'activation (onboarding), payables une fois", ML + 8, y + 9, 8, false, '#374151');
  fieldTag('Montant onboarding', RXcol(ctx), y + 6, 110);
  y += 28;
  // Mensualité
  fill(ML, y, CW, 34, '#dbeafe'); hline(y, '#93c5fd'); hline(y + 34, '#1d4ed8');
  txt('Abonnement mensuel récurrent', ML + 8, y + 11, 9, true, '#1e40af');
  fieldTag('Montant mensuel', RXcol(ctx), y + 9, 110);
  y += 42;
  const payTxt = `Le Client s'acquitte des frais d'activation à la souscription, puis de la mensualité par avance au début de chaque période mensuelle. Tout retard de paiement supérieur à 15 jours peut entraîner la suspension de l'accès au service. Les montants sont exprimés en dinars tunisiens (DT).`;
  const pH = doc.fontSize(8).font('Helvetica').heightOfString(payTxt, { width: CW - 12 }) + 4;
  doc.fontSize(8).font('Helvetica').fillColor('#475569').text(payTxt, ML, y, { width: CW - 12, lineGap: 2 });
  y += pH + 12;

  // CLAUSES
  y = sectionHdr('ARTICLE 4 — CONDITIONS GÉNÉRALES', y);
  y = clauses(ctx, y, [
    { title: '4.1 Durée', body: "Le contrat est conclu pour une durée indéterminée à compter de l'activation du compte, renouvelable par tacite reconduction à chaque échéance mensuelle." },
    { title: '4.2 Obligations du prestataire', body: `${PRESTATAIRE.nom} s'engage à fournir l'accès au service 24h/24, sous réserve des opérations de maintenance, à assurer la sauvegarde régulière des données et à apporter un support technique au Client.` },
    { title: '4.3 Obligations du client', body: "Le Client s'engage à utiliser le service conformément à sa destination, à fournir des informations exactes, à préserver la confidentialité de ses identifiants et à régler les sommes dues aux échéances convenues." },
    { title: '4.4 Données et confidentialité', body: `Les données saisies par le Client restent sa propriété exclusive. ${PRESTATAIRE.nom} s'interdit toute exploitation à d'autres fins que l'exécution du service et garantit leur restitution sur demande en cas de résiliation.` },
    { title: '4.5 Propriété intellectuelle', body: `La plateforme, son code, sa marque et ses contenus demeurent la propriété exclusive de ${PRESTATAIRE.nom}. L'abonnement confère un simple droit d'usage personnel et non exclusif, non cessible.` },
    { title: '4.6 Responsabilité', body: `La responsabilité de ${PRESTATAIRE.nom} est limitée aux dommages directs et ne saurait excéder le montant des sommes versées par le Client au cours des trois derniers mois.` },
    { title: '4.7 Résiliation', body: "Chaque partie peut résilier le contrat moyennant un préavis de 30 jours notifié par email. Le non-paiement ou le manquement grave d'une partie autorise l'autre à résilier de plein droit." },
    { title: '4.8 Droit applicable et litiges', body: "Le présent contrat est soumis au droit tunisien. À défaut de règlement amiable, tout litige relève de la compétence des tribunaux de Tunis." },
  ]);

  y = signatures(ctx, y);
  stampFooters(ctx, "Contrat d'abonnement");
  doc.end();
  return new Promise((res) => stream.on('finish', res));
}

// position X de la colonne droite pour les fieldTag alignés à droite
function RXcol(ctx) { return ctx.RX - 130; }

// ══════════════════════════════════════════════════════════════════════════════
// 2) AVENANT AU CONTRAT
// ══════════════════════════════════════════════════════════════════════════════
function buildAvenant(outPath) {
  const ctx = makeDoc();
  const { doc, ML, CW, fill, hline, txt, sectionHdr, fieldTag } = ctx;
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  header(ctx, "AVENANT AU CONTRAT D'ABONNEMENT");
  let y = 138;

  // CLIENT
  y = sectionHdr('CLIENT CONCERNÉ', y);
  fill(ML, y, CW, 50, '#f8fafc'); hline(y, '#e2e8f0'); hline(y + 50, '#e2e8f0');
  txt('LE CLIENT', ML + 8, y + 8, 7, true, '#374151');
  fieldTag('Nom du client', ML + 8, y + 20, CW / 2 - 16);
  fieldTag('Email', ML + CW / 2, y + 20, CW / 2 - 16);
  y += 58;

  // OBJET
  y = sectionHdr("ARTICLE 1 — OBJET DE L'AVENANT", y);
  const objet = `Le présent avenant modifie le contrat d'abonnement en vigueur entre ${PRESTATAIRE.nom} et le Client. Il prend effet à la date de signature ci-dessous et complète les termes du contrat initial sans s'y substituer. Seules les clauses expressément modifiées par le présent avenant sont concernées ; toutes les autres dispositions du contrat demeurent inchangées.`;
  const oH = doc.fontSize(8).font('Helvetica').heightOfString(objet, { width: CW - 16 }) + 16;
  fill(ML, y, CW, oH, '#fffbeb'); hline(y, '#fde68a'); hline(y + oH, '#fde68a');
  doc.fontSize(8).font('Helvetica').fillColor('#78350f').text(objet, ML + 8, y + 8, { width: CW - 16, lineGap: 2 });
  y += oH + 12;

  // NOUVELLE CONFIGURATION
  y = sectionHdr('ARTICLE 2 — NOUVELLE CONFIGURATION', y);
  fill(ML, y, CW, 22, '#eef2ff'); hline(y, '#c7d2fe'); hline(y + 22, '#c7d2fe');
  txt('Ressource', ML + 8, y + 7, 7, true, '#4338ca');
  txt('Nouvelle quantité', ML, y + 7, 7, true, '#4338ca', { align: 'right', width: CW - 8 });
  y += 22;
  const conf = [['Points de vente (activités)', 'Nb activités'], ['Laboratoires de production', 'Nb labos'], ['Comptes gérants', 'Nb gérants']];
  conf.forEach(([label, tag], i) => {
    fill(ML, y, CW, 24, i % 2 === 0 ? '#fafbff' : '#ffffff'); hline(y + 24, '#f1f5f9');
    txt(label, ML + 8, y + 8, 9, false, '#0f172a');
    fieldTag(tag, RXcol(ctx), y + 4, 70);
    y += 24;
  });
  y += 12;

  // NOUVELLE TARIFICATION
  y = sectionHdr('ARTICLE 3 — NOUVELLE TARIFICATION', y);
  fill(ML, y, CW, 34, '#dbeafe'); hline(y, '#93c5fd'); hline(y + 34, '#1d4ed8');
  txt('Nouvelle mensualité', ML + 8, y + 11, 9, true, '#1e40af');
  fieldTag('Montant mensuel', RXcol(ctx), y + 9, 110);
  y += 42;
  const tarTxt = "La nouvelle mensualité s'applique à compter de la première échéance suivant la signature du présent avenant. Les modalités de paiement du contrat initial restent applicables.";
  const tH = doc.fontSize(8).font('Helvetica').heightOfString(tarTxt, { width: CW - 12 }) + 4;
  doc.fontSize(8).font('Helvetica').fillColor('#475569').text(tarTxt, ML, y, { width: CW - 12, lineGap: 2 });
  y += tH + 12;

  // CLAUSE
  y = clauses(ctx, y, [
    { title: 'Article 4 — Prise d\'effet', body: "Le présent avenant entre en vigueur à sa date de signature électronique. Il fait partie intégrante du contrat d'abonnement initial dont il suit le sort." },
    { title: 'Article 5 — Droit applicable', body: "Le présent avenant est soumis au droit tunisien. Tout litige relève de la compétence des tribunaux de Tunis." },
  ]);

  y = signatures(ctx, y);
  stampFooters(ctx, 'Avenant au contrat');
  doc.end();
  return new Promise((res) => stream.on('finish', res));
}

(async () => {
  const dir = __dirname;
  await buildContrat(path.join(dir, 'contrat-labflow.pdf'));
  await buildAvenant(path.join(dir, 'avenant-labflow.pdf'));
  console.log('✅ Templates générés :');
  console.log('   -', path.join(dir, 'contrat-labflow.pdf'));
  console.log('   -', path.join(dir, 'avenant-labflow.pdf'));
})();
