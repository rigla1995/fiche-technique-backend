/**
 * Génère les 3 documents LabFlow (contrat / avenant / résiliation) en PDF.
 *
 * NOUVELLE APPROCHE (« PDF rempli ») :
 *   - les VALEURS sont rendues directement dans le document (plus de cases de saisie) ;
 *   - notre signature est déjà apposée (cachet électronique du prestataire) ;
 *   - logo vectoriel LabFlow + mise en page conforme au thème de l'app.
 *
 * Chaque builder est DATA-DRIVEN : il reçoit un objet `data` et peut donc être
 * appelé par le backend pour générer le document d'un client donné, puis envoyé à
 * DocuSeal via `createSubmissionFromPdf` (DocuSeal ne pose alors que la signature
 * du client). Ici, on génère un APERÇU avec des valeurs d'exemple pour validation.
 *
 * Usage : node docuseal-templates/generate.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// ── Identité prestataire ────────────────────────────────────────────────────────
// Renseignée par variables d'environnement (Coolify) ; les valeurs par défaut sont
// des PLACEHOLDERS détectés par checkPrestatairePlaceholders (FACTURE_STRICT=1 en
// prod pour refuser toute génération tant qu'ils subsistent). Nom, adresse et
// matricule retombent sur les FACTURE_* déjà utilisées par les factures
// (pdfService) : une seule source à configurer.
const envOr = (names, fallback) => {
  for (const n of names) if (process.env[n]) return process.env[n];
  return fallback;
};
// FACTURE_MATRICULE_FISCAL est parfois saisi avec son libellé (« Matricule fiscal : … »
// pour le pied de facture) — ici on ne veut que la valeur.
const stripMfLabel = (v) => String(v).replace(/^\s*(matricule\s+fiscal|mf)\s*:?\s*/i, '').trim();
const PRESTATAIRE_NOM = envOr(['PRESTATAIRE_NOM', 'FACTURE_PRESTATAIRE_NOM'], 'LabFlow');
const PRESTATAIRE_FORME = envOr(['PRESTATAIRE_FORME'], 'SARL');
const PRESTATAIRE = {
  nom: PRESTATAIRE_NOM,
  forme: PRESTATAIRE_FORME,
  raisonSociale: envOr(['PRESTATAIRE_RAISON_SOCIALE'], `${PRESTATAIRE_NOM} ${PRESTATAIRE_FORME}`),
  matricule: stripMfLabel(envOr(['PRESTATAIRE_MATRICULE', 'FACTURE_MATRICULE_FISCAL'], '1234567/A/M/000')),
  rc: envOr(['PRESTATAIRE_RC'], 'B0123452024'),
  capital: envOr(['PRESTATAIRE_CAPITAL'], '10 000 DT'),
  adresse: envOr(['PRESTATAIRE_ADRESSE', 'FACTURE_ADRESSE'], 'Avenue Habib Bourguiba, 1000 Tunis, Tunisie'),
  ville: envOr(['PRESTATAIRE_VILLE'], 'Tunis'),
  email: envOr(['PRESTATAIRE_EMAIL'], 'contact@labflow-tn.com'),
  tel: envOr(['PRESTATAIRE_TEL'], '+216 71 000 000'),
  signataire: envOr(['PRESTATAIRE_SIGNATAIRE'], 'La Direction'),
};

// Taux de TVA affiché dans les clauses — même source que la facturation.
// Les montants d'abonnement saisis dans l'app sont TTC (la facture en déduit le HT).
const TVA_RATE = Number(process.env.FACTURE_TVA_RATE || 19);

// Garde-fou : signale les mentions légales encore fictives. STRICT (génération refusée,
// le backend se replie sur le flux template) si FACTURE_STRICT=1 ou par DÉFAUT en
// production — un acte signé avec une identité fictive est juridiquement vicié.
// FACTURE_STRICT=0 désactive explicitement le mode strict (déconseillé en prod).
function checkPrestatairePlaceholders() {
  const fictifs = ['1234567/A/M/000', 'B0123452024', 'Avenue Habib Bourguiba, 1000 Tunis, Tunisie', 'La Direction', '+216 71 000 000'];
  const found = Object.entries(PRESTATAIRE).filter(([, v]) => fictifs.includes(v)).map(([k]) => k);
  if (found.length) {
    const strict = process.env.FACTURE_STRICT === '1'
      || (process.env.NODE_ENV === 'production' && process.env.FACTURE_STRICT !== '0');
    const msg = `[contrats] ⚠ mentions légales prestataire encore fictives : ${found.join(', ')} — à renseigner avant la prod.`;
    if (strict) throw new Error(msg);
    console.warn(msg);
  }
}

// ── Palette de marque (gradient sky → indigo → violet) ────────────────────────
const C = {
  grad: ['#0ea5e9', '#6366f1', '#a855f7'],
  ink: '#0f172a',
  indigoDeep: '#1e1b4b',
  indigo: '#4338ca',
  indigoSoft: '#eef2ff',
  indigoLabel: '#3730a3',
  violet: '#7c3aed',
  violetSoft: '#f5f3ff',
  body: '#334155',
  muted: '#64748b',
  faint: '#94a3b8',
  hair: '#e2e8f0',
  hairSoft: '#eef2f6',
  panel: '#f8fafc',
  panel2: '#f1f5f9',
  white: '#ffffff',
  // teintes d'accent par nature de document
  okSoft: '#f0fdf4', okLine: '#bbf7d0', okText: '#15803d',
  warnSoft: '#fffbeb', warnLine: '#fde68a', warnText: '#92400e',
  dangerSoft: '#fef2f2', dangerLine: '#fecaca', dangerText: '#b91c1c',
};

// ── Géométrie page ─────────────────────────────────────────────────────────────
const ML = 56;                 // marge gauche/droite
const PAGE = { w: 595.28, h: 841.89 };
const CW = PAGE.w - ML * 2;    // largeur contenu
const RX = ML + CW;            // bord droit contenu
const TOPY = 150;              // début du contenu sous l'en-tête
const BOTTOM_LIMIT = PAGE.h - 64; // limite avant footer

// ══════════════════════════════════════════════════════════════════════════════
// Contexte de rendu + helpers
// ══════════════════════════════════════════════════════════════════════════════
function makeCtx(info) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    autoFirstPage: true,
    bufferPages: true,
    info,
  });

  const fill = (x, y, w, h, hex) => doc.rect(x, y, w, h).fill(hex);
  const roundFill = (x, y, w, h, r, hex, stroke) => {
    doc.save().roundedRect(x, y, w, h, r);
    if (stroke) doc.fillAndStroke(hex, stroke); else doc.fill(hex);
    doc.restore();
  };
  const hline = (y, hex = C.hair, x1 = ML, x2 = RX, w = 0.6) => {
    doc.save().moveTo(x1, y).lineTo(x2, y).lineWidth(w).stroke(hex).restore();
  };
  const txt = (str, x, y, size, bold, hex, opts = {}) => {
    doc.fontSize(size).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(hex)
       .text(str == null ? '' : String(str), x, y, { lineBreak: false, ...opts });
  };
  const oblique = (str, x, y, size, hex, opts = {}) => {
    doc.fontSize(size).font('Helvetica-BoldOblique').fillColor(hex)
       .text(str, x, y, { lineBreak: false, ...opts });
  };
  // Mesure la hauteur d'un paragraphe pour un dimensionnement précis des panneaux.
  const measure = (str, width, size = 8.5, lineGap = 2.4) =>
    doc.fontSize(size).font('Helvetica').heightOfString(str == null ? '' : String(str), { width, lineGap });
  // wrap : rendu d'une DONNÉE variable avec retour à la ligne (anti-troncature) ;
  // renvoie la hauteur réellement consommée. À utiliser pour tout champ data.
  const wrap = (str, x, y, size, bold, hex, width, lineGap = 2, opts = {}) => {
    const s = str == null ? '' : String(str);
    doc.fontSize(size).font(bold ? 'Helvetica-Bold' : 'Helvetica').fillColor(hex);
    const h = doc.heightOfString(s, { width, lineGap, ...opts });
    doc.text(s, x, y, { width, lineGap, lineBreak: true, ...opts });
    return h;
  };
  // fitText : tronque proprement (avec « … ») pour tenir sur UNE ligne ≤ maxW.
  // À utiliser dans les zones à hauteur fixe (cachet, pied de page) où le nom
  // complet figure déjà ailleurs (bloc Parties).
  const fitText = (str, size, maxW, bold = false) => {
    const s = str == null ? '' : String(str);
    doc.fontSize(size).font(bold ? 'Helvetica-Bold' : 'Helvetica');
    if (doc.widthOfString(s) <= maxW) return s;
    let lo = 0, hi = s.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (doc.widthOfString(s.slice(0, mid) + '…') <= maxW) lo = mid; else hi = mid - 1;
    }
    return s.slice(0, lo).trimEnd() + '…';
  };

  // Filet dégradé horizontal (signature visuelle de la marque)
  const gradientRule = (x, y, w, h = 2.5) => {
    const g = doc.linearGradient(x, y, x + w, y);
    g.stop(0, C.grad[0]).stop(0.52, C.grad[1]).stop(1, C.grad[2]);
    doc.rect(x, y, w, h).fill(g);
  };

  return { doc, fill, roundFill, hline, txt, oblique, measure, wrap, fitText, gradientRule };
}

// ── Logo LabFlow vectoriel (losange dégradé + monogramme LF + wordmark) ────────
// h = hauteur du losange. variant 'dark' = wordmark sombre (fond clair).
// iconOnly = true : dessine seulement le losange (sceau/cachet), sans wordmark.
function drawLogo(ctx, x, yTop, h, variant = 'dark', iconOnly = false) {
  const { doc } = ctx;
  const S = h / 2;                 // demi-côté du carré
  const cx = x + S, cy = yTop + S; // centre du losange
  const r = S * 0.34;              // rayon des coins

  // Losange : carré arrondi tourné de 45°, rempli d'un dégradé.
  // On découpe (clip) à la forme tournée puis on peint un dégradé axé sur la page
  // → pas d'artefact de dégradé sous rotation.
  doc.save();
  doc.translate(cx, cy).rotate(45).roundedRect(-S, -S, 2 * S, 2 * S, r).clip();
  doc.rotate(-45).translate(-cx, -cy);
  const g = doc.linearGradient(cx - S, cy - S, cx + S, cy + S);
  g.stop(0, C.grad[0]).stop(0.52, C.grad[1]).stop(1, C.grad[2]);
  doc.rect(cx - S * 1.6, cy - S * 1.6, S * 3.2, S * 3.2).fill(g);
  doc.restore();

  // Monogramme « LF » blanc, dans le repère tourné (coords SVG / 15.56 * S).
  const k = S / 15.56;
  const mono = [
    [-6.71, -4.78, 2.96, 13.10],
    [-6.71, 5.41, 9.88, 2.96],
    [3.74, -8.32, 2.96, 16.64],
    [-6.71, -8.32, 13.41, 2.96],
    [-1.30, -1.20, 8.00, 2.96],
  ];
  doc.save().translate(cx, cy).rotate(45).fillColor(C.white);
  mono.forEach(([mx, my, mw, mh]) => {
    doc.roundedRect(mx * k, my * k, mw * k, mh * k, 1.05 * k).fill(C.white);
  });
  doc.restore();

  if (iconOnly) return cx + S;

  // Wordmark « LabFlow »
  const labColor = variant === 'dark' ? C.indigoDeep : C.white;
  const flowColor = variant === 'dark' ? C.grad[2] : 'rgba(255,255,255,0.62)';
  const wx = x + h + h * 0.34;
  const wy = yTop + h * 0.5 - h * 0.30;
  doc.font('Helvetica-Bold').fontSize(h * 0.62).fillColor(labColor)
     .text('Lab', wx, wy, { lineBreak: false, continued: true, characterSpacing: 0.2 })
     .font('Helvetica').fillColor(flowColor)
     .text('Flow', { lineBreak: false, characterSpacing: 1.4 });

  return wx + doc.widthOfString('Flow'); // x de fin approx.
}

// ── En-tête de document ─────────────────────────────────────────────────────
function header(ctx, { eyebrow, title, subtitle, ref, date }) {
  const { txt, gradientRule } = ctx;
  ctx.docMeta = { eyebrow, ref };          // réutilisé par newPage (pages 2+)
  drawLogo(ctx, ML, 40, 30, 'dark');

  // Méta document, alignée à droite
  txt(eyebrow, ML, 40, 7.5, true, C.indigo, { align: 'right', width: CW, characterSpacing: 1.4 });
  txt(`Réf. ${ref}`, ML, 53, 8, false, C.muted, { align: 'right', width: CW });
  txt(`Établi le ${date}`, ML, 64, 8, false, C.faint, { align: 'right', width: CW });

  // Filet dégradé pleine largeur
  gradientRule(ML, 88, CW, 2.5);

  // Titre principal
  txt(title, ML, 102, 17, true, C.ink, { width: CW });
  if (subtitle) txt(subtitle, ML, 126, 9, false, C.muted, { width: CW });
}

// ── Nouvelle page de continuation (bandeau léger, pas de grand vide en haut) ──
function newPage(ctx) {
  const { doc, txt, gradientRule } = ctx;
  doc.addPage();
  const m = ctx.docMeta || {};
  drawLogo(ctx, ML, 34, 15, 'dark');
  if (m.eyebrow) txt(m.eyebrow, ML, 36, 7, true, C.indigo, { align: 'right', width: CW, characterSpacing: 1.2 });
  if (m.ref) txt(`Réf. ${m.ref}`, ML, 45, 7.5, false, C.faint, { align: 'right', width: CW });
  gradientRule(ML, 58, CW, 1.5);
  return 74;
}

// ── En-tête de section (avec garde « keep-with-next » anti-orphelin) ─────────
function section(ctx, y, label, minNext = 54) {
  const { fill, hline, txt, gradientRule } = ctx;
  if (y + 19 + minNext > BOTTOM_LIMIT) y = newPage(ctx);
  fill(ML, y, CW, 19, C.indigoSoft);
  gradientRule(ML, y, 3, 19);          // accent dégradé à gauche
  txt(label, ML + 12, y + 5.5, 8, true, C.indigoLabel, { characterSpacing: 0.8 });
  hline(y + 19, '#dfe3ff');
  return y + 25;
}

// ── Paragraphe encadré (objet, conditions…) ──────────────────────────────────
function calloutBox(ctx, y, text, tone = 'warn') {
  const { fill, hline, doc } = ctx;
  const map = {
    warn: [C.warnSoft, C.warnLine, C.warnText],
    danger: [C.dangerSoft, C.dangerLine, C.dangerText],
    neutral: [C.panel, C.hair, C.body],
  }[tone];
  const innerW = CW - 24;
  const h = ctx.measure(text, innerW) + 16;
  fill(ML, y, CW, h, map[0]); hline(y, map[1]); hline(y + h, map[1]);
  doc.fontSize(8.5).font('Helvetica').fillColor(map[2])
     .text(text, ML + 12, y + 8, { width: innerW, lineGap: 2.4 });
  return y + h + 10;
}

// ── Bloc « parties » (prestataire + client) en deux colonnes ──────────────────
// Hauteur calculée dynamiquement : aucun champ data n'est tronqué ni ne déborde.
function partiesBlock(ctx, y, client) {
  const { txt, wrap, roundFill, measure } = ctx;
  const colW = (CW - 14) / 2;
  const cx2 = ML + colW + 14;
  const innerW = colW - 24;
  const padTop = 12, padBot = 12;

  // Spécification des lignes de chaque colonne (w = donnée variable → wrap).
  const presLines = [
    { t: 'LE PRESTATAIRE', s: 6.8, b: true, c: C.faint, sp: 1, lh: 12 },
    { t: PRESTATAIRE.raisonSociale, s: 10, b: true, c: C.ink, w: true, gap: 4 },
    { t: `Matricule fiscal : ${PRESTATAIRE.matricule}`, s: 7.5, c: C.muted, w: true, gap: 2 },
    { t: `RC : ${PRESTATAIRE.rc}  ·  Capital : ${PRESTATAIRE.capital}`, s: 7.5, c: C.muted, w: true, gap: 2 },
    { t: PRESTATAIRE.adresse, s: 7.5, c: C.muted, w: true, gap: 2 },
    { t: `${PRESTATAIRE.email}  ·  ${PRESTATAIRE.tel}`, s: 7.5, c: C.muted, w: true, gap: 0 },
  ];
  const idClient = [client.forme, client.mfrc].filter(Boolean).join('  ·  ');
  const cliLines = [
    { t: 'LE CLIENT', s: 6.8, b: true, c: C.faint, sp: 1, lh: 12 },
    { t: client.nom, s: 10, b: true, c: C.ink, w: true, gap: 4 },
    idClient && { t: idClient, s: 7.5, c: C.muted, w: true, gap: 2 },
    client.representant && { t: `Représenté par ${client.representant}`, s: 7.5, c: C.muted, w: true, gap: 2 },
    client.email && { t: client.email, s: 7.5, c: C.muted, w: true, gap: 2 },
    client.tel && { t: client.tel, s: 7.5, c: C.muted, w: true, gap: 2 },
    client.adresse && { t: client.adresse, s: 7.5, c: C.muted, w: true, gap: 2 },
    { t: 'Ci-après dénommé « le Client »', s: 7.5, c: C.faint, gapBefore: 6, lh: 11 },
  ].filter(Boolean);

  // Mesure de la hauteur d'une colonne (sans dessiner)
  const colHeight = (lines) => lines.reduce((acc, ln) => {
    const before = ln.gapBefore || 0;
    const hh = ln.w ? measure(ln.t, innerW, ln.s, 1.5) + (ln.gap || 0) : (ln.lh || 12);
    return acc + before + hh;
  }, 0);

  const contentH = Math.max(colHeight(presLines), colHeight(cliLines));
  const h = padTop + contentH + padBot;

  // Garde de saut de page
  if (y + h + 14 > BOTTOM_LIMIT) y = newPage(ctx);

  // Cartes + accents dégradés symétriques (signature de marque sur les deux)
  roundFill(ML, y, colW, h, 5, C.panel, C.hair);
  roundFill(cx2, y, colW, h, 5, C.white, C.hair);
  ctx.gradientRule(ML, y, colW, 2.5);
  ctx.gradientRule(cx2, y, colW, 2.5);

  // Rendu d'une colonne
  const renderCol = (lines, x) => {
    let cy = y + padTop;
    for (const ln of lines) {
      cy += ln.gapBefore || 0;
      if (ln.w) {
        cy += wrap(ln.t, x, cy, ln.s, ln.b, ln.c, innerW, 1.5) + (ln.gap || 0);
      } else {
        txt(ln.t, x, cy, ln.s, ln.b, ln.c, ln.sp ? { characterSpacing: ln.sp } : {});
        cy += ln.lh || 12;
      }
    }
  };
  renderCol(presLines, ML + 12);
  renderCol(cliLines, cx2 + 12);

  return y + h + 14;
}

// ── Tableau ressource / quantité ──────────────────────────────────────────────
function configTable(ctx, y, rows, qtyHeader = 'Quantité souscrite') {
  const { fill, hline, txt } = ctx;
  fill(ML, y, CW, 22, C.indigoSoft); hline(y, '#dfe3ff'); hline(y + 22, '#dfe3ff');
  txt('Ressource', ML + 10, y + 7, 7, true, C.indigo, { characterSpacing: 0.5 });
  txt(qtyHeader, ML, y + 7, 7, true, C.indigo, { align: 'right', width: CW - 10, characterSpacing: 0.5 });
  y += 22;
  rows.forEach(([label, qty], i) => {
    fill(ML, y, CW, 24, i % 2 === 0 ? '#fcfcff' : C.white);
    hline(y + 24, C.hairSoft);
    txt(label, ML + 10, y + 8, 9, false, C.ink);
    txt(String(qty), ML, y + 7, 10, true, C.indigo, { align: 'right', width: CW - 12 });
    y += 24;
  });
  return y + 12;
}

// ── Bloc tarification ─────────────────────────────────────────────────────────
function pricingBlock(ctx, y, { onboarding, mensuel, mensuelBase, promoDetail }) {
  const { fill, hline, txt } = ctx;
  if (onboarding != null) {
    fill(ML, y, CW, 30, C.panel); hline(y, C.hair); hline(y + 30, C.hair);
    txt("Frais d'activation (onboarding) — payables une seule fois", ML + 10, y + 10, 8.5, false, C.body);
    txt(onboarding, ML, y + 8, 11, true, C.ink, { align: 'right', width: CW - 12 });
    y += 30;
  }
  // Mensualité (mise en avant, dégradé latéral)
  const promo = mensuelBase && mensuelBase !== mensuel;
  const h = promo ? 46 : 36;
  fill(ML, y, CW, h, '#eef2ff'); hline(y, '#c7d2fe'); hline(y + h, C.indigo);
  ctx.gradientRule(ML, y, 3, h);
  txt('Mensualité applicable', ML + 12, y + 10, 9.5, true, C.indigo);
  txt(`${mensuel} / mois`, ML, y + 8, 13, true, C.indigo, { align: 'right', width: CW - 12 });
  if (promo) {
    txt(`Tarif de base ${mensuelBase} — remise promotionnelle appliquée`, ML + 12, y + 28, 7.5, false, C.violet);
  } else {
    txt('Facturation mensuelle récurrente, par avance', ML + 12, y + 25, 7.5, false, '#6366f1');
  }
  y += h + (promoDetail ? 10 : 12);

  if (promoDetail) {
    const innerW = CW - 24;
    const ph = ctx.measure(promoDetail, innerW, 8) + 22;
    fill(ML, y, CW, ph, C.violetSoft); hline(y, '#e9d5ff'); hline(y + ph, '#e9d5ff');
    txt('CONDITIONS PARTICULIÈRES', ML + 12, y + 8, 6.8, true, C.violet, { characterSpacing: 1 });
    ctx.doc.fontSize(8).font('Helvetica').fillColor('#5b21b6')
       .text(promoDetail, ML + 12, y + 20, { width: innerW, lineGap: 2.2 });
    y += ph + 12;
  }
  return y;
}

// ── Clauses numérotées (gère le saut de page) ────────────────────────────────
function clauses(ctx, y, items) {
  const { doc, txt } = ctx;
  items.forEach((it) => {
    const hasTitle = it.title && it.title.trim();
    const bodyH = doc.fontSize(8.5).font('Helvetica').heightOfString(it.body, { width: CW - 4, lineGap: 2.2 });
    const titleH = hasTitle ? 12 : 0;
    const blockH = titleH + bodyH + 7;
    if (y + blockH > BOTTOM_LIMIT) { y = newPage(ctx); }
    if (hasTitle) { txt(it.title, ML, y, 9, true, C.indigoDeep); y += titleH; }
    doc.fontSize(8.5).font('Helvetica').fillColor(C.body)
       .text(it.body, ML, y, { width: CW - 4, lineGap: 2.2, align: 'justify' });
    y += bodyH + 7;
  });
  return y;
}

// ── Bloc signatures : prestataire pré-signé (cachet) + client ────────────────
function signatures(ctx, y, { client, date, previewMode = true }) {
  const { doc, hline, txt, wrap, fitText, oblique, roundFill } = ctx;
  const h = 96, need = 14 + 25 + h + 32;
  if (y > BOTTOM_LIMIT - need) { y = newPage(ctx); }

  // Mention de clôture (équilibre le bas de page + valeur juridique)
  txt(`Fait à ${PRESTATAIRE.ville}, le ${date}, en deux exemplaires originaux.`,
      ML, y, 8.5, false, C.muted, { align: 'center', width: CW });
  y += 14;

  y = section(ctx, y, 'SIGNATURES');

  const sw = (CW - 16) / 2;
  const sx1 = ML, sx2 = ML + sw + 16;

  // ── LE PRESTATAIRE (déjà signé) ──
  roundFill(sx1, y, sw, h, 6, C.panel, C.hair);
  txt('LE PRESTATAIRE', sx1 + 12, y + 12, 6.8, true, C.faint, { characterSpacing: 1 });
  txt(fitText(PRESTATAIRE.raisonSociale, 9, sw - 50, true), sx1 + 12, y + 23, 9, true, C.ink);

  // Cachet électronique : losange seul dans un encadré pointillé (coin haut-droit)
  const stamp = 22, stX = sx1 + sw - stamp - 14, stY = y + 12;
  doc.save().roundedRect(stX - 4, stY - 3, stamp + 8, stamp + 6, 5)
     .lineWidth(0.8).dash(2, { space: 1.6 }).stroke('#c7d2fe').undash().restore();
  drawLogo(ctx, stX, stY, stamp, 'dark', true);

  // Signature stylisée (nom court de marque, toujours dans la carte) + filet
  oblique(PRESTATAIRE.nom, sx1 + 12, y + 40, 16, C.indigo);
  hline(y + 63, '#cbd5e1', sx1 + 12, sx1 + sw - 12, 0.8);
  txt(fitText(`Pour ${PRESTATAIRE.nom} — ${PRESTATAIRE.signataire}`, 7.5, sw - 24), sx1 + 12, y + 67, 7.5, false, C.muted);
  // pastille « signé » avec coche vectorielle — largeur ajustée au texte
  const okLabel = `Signé électroniquement le ${date}`;
  doc.fontSize(7.5).font('Helvetica');
  const okY = y + 78, pillW = Math.min(sw - 24, doc.widthOfString(okLabel) + 27);
  doc.save().roundedRect(sx1 + 12, okY, pillW, 15, 7.5).fill(C.okSoft).restore();
  doc.save().lineWidth(1.3).strokeColor(C.okText)
     .moveTo(sx1 + 19, okY + 7.5).lineTo(sx1 + 21.5, okY + 10).lineTo(sx1 + 26, okY + 5).stroke().restore();
  txt(okLabel, sx1 + 31, okY + 4.3, 7.5, false, C.okText);

  // ── LE CLIENT (à signer) ──
  roundFill(sx2, y, sw, h, 6, C.white, C.hair);
  txt('LE CLIENT', sx2 + 12, y + 12, 6.8, true, C.faint, { characterSpacing: 1 });
  txt(fitText(client.nom, 9, sw - 24, true), sx2 + 12, y + 23, 9, true, C.ink);
  txt('Lu et approuvé, bon pour accord', sx2 + 12, y + 34, 7.5, false, C.muted);
  // zone de signature (≥ 40pt pour une image de signature manuscrite)
  doc.save().roundedRect(sx2 + 12, y + 44, sw - 24, 40, 5)
     .lineWidth(0.8).dash(3, { space: 2 }).stroke('#cbd5e1').undash().restore();
  if (previewMode) {
    txt('Signature électronique du client', sx2 + 12, y + 61, 7.5, false, '#cbd5e1', { align: 'center', width: sw - 24 });
  } else {
    // En production : balise détectée par DocuSeal (texte blanc, invisible)
    txt('{{Signature;type=signature}}', sx2 + 16, y + 58, 7, false, C.white);
  }
  txt('Nom, qualité et date', sx2 + 12, y + 88, 7.5, false, C.faint);

  // Mention de validité de la signature électronique (loi tunisienne n° 2000-83)
  const noteH = wrap(
    "Les parties reconnaissent la valeur juridique de la signature électronique au sens de la loi n° 2000-83 du 9 août 2000 ; le procédé en garantit l'identification du signataire et l'intégrité du document.",
    ML, y + h + 8, 6.8, false, C.faint, CW, 1.5, { align: 'center' });
  return y + h + 8 + noteH + 6;
}

// ── Footer (toutes les pages) ────────────────────────────────────────────────
function stampFooters(ctx, label) {
  const { doc, txt, fitText, gradientRule } = ctx;
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    gradientRule(ML, PAGE.h - 38, CW, 1.5);
    // Mention légale sur UNE ligne (clippée) ; l'adresse complète est dans le bloc Parties.
    const legal = fitText(`${PRESTATAIRE.raisonSociale}  ·  MF ${PRESTATAIRE.matricule}  ·  RC ${PRESTATAIRE.rc}`, 6.5, CW * 0.62);
    txt(legal, ML, PAGE.h - 30, 6.5, false, C.faint, { lineBreak: false });
    txt(`${label}  ·  Page ${i + 1}/${range.count}`, ML, PAGE.h - 30, 6.5, false, C.muted, { align: 'right', width: CW });
    txt('Document confidentiel — usage strictement contractuel', ML, PAGE.h - 20, 6.5, false, C.faint, { lineBreak: false });
  }
}

// outPath renseigné → écrit le fichier ; outPath null → résout avec le Buffer du PDF
// (mode service backend : le document part en base64 vers DocuSeal, rien sur disque).
function finish(ctx, outPath) {
  return new Promise((resolve, reject) => {
    if (!outPath) {
      const chunks = [];
      ctx.doc.on('data', (c) => chunks.push(c));
      ctx.doc.on('end', () => resolve(Buffer.concat(chunks)));
      ctx.doc.on('error', reject);
      ctx.doc.end();
      return;
    }
    const stream = fs.createWriteStream(outPath);
    ctx.doc.pipe(stream);
    stream.on('finish', resolve);
    stream.on('error', reject);
    ctx.doc.end();
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// 1) CONTRAT D'ABONNEMENT
// ══════════════════════════════════════════════════════════════════════════════
async function buildContrat(outPath, data) {
  const previewMode = data.previewMode !== false;
  const ctx = makeCtx({ Title: `Contrat d'abonnement — ${data.client.nom}`, Author: PRESTATAIRE.raisonSociale });
  header(ctx, {
    eyebrow: "CONTRAT D'ABONNEMENT",
    title: "Contrat d'abonnement SaaS",
    subtitle: "Plateforme LabFlow — gestion pour la restauration et les métiers de bouche",
    ref: data.ref, date: data.date,
  });
  let y = TOPY;

  y = section(ctx, y, 'ENTRE LES SOUSSIGNÉS');
  y = partiesBlock(ctx, y, data.client);

  y = section(ctx, y, 'ARTICLE 1 — OBJET DU CONTRAT');
  y = calloutBox(ctx, y,
    `${PRESTATAIRE.nom} met à la disposition du Client, sur abonnement, une plateforme logicielle en mode SaaS (Software as a Service) accessible par navigateur web, dédiée à la gestion des stocks, approvisionnements, pertes, inventaires, fiches techniques et ventes pour les métiers de la restauration. Le présent contrat définit les conditions de cette mise à disposition.`,
    'neutral');

  y = section(ctx, y, 'ARTICLE 2 — CONFIGURATION SOUSCRITE');
  y = configTable(ctx, y, [
    ['Points de vente (activités)', data.config.activites],
    ['Laboratoires de production', data.config.labos],
    ['Comptes gérants', data.config.gerants],
  ]);

  y = section(ctx, y, 'ARTICLE 3 — PRIX ET MODALITÉS DE PAIEMENT');
  y = pricingBlock(ctx, y, data.pricing);
  y = clauses(ctx, y, [{
    title: '', body:
      `Le Client s'acquitte des frais d'activation à la souscription, puis de la mensualité par avance au début de chaque période mensuelle. En cas de promotion, le tarif promotionnel s'applique pour la durée indiquée ci-dessus, puis le tarif de base reprend automatiquement. Tout retard de paiement supérieur à 15 jours peut entraîner la suspension de l'accès au service. Les montants sont exprimés en dinars tunisiens (DT), toutes taxes comprises (TVA au taux en vigueur de ${TVA_RATE} % incluse) ; la facture conforme émise à chaque échéance en présente la ventilation (hors taxes, TVA, TTC).`,
  }]);
  y += 4;

  y = section(ctx, y, 'ARTICLE 4 — CONDITIONS GÉNÉRALES');
  y = clauses(ctx, y, [
    { title: '4.1 Durée', body: "Le contrat est conclu pour une durée indéterminée à compter de l'activation du compte, renouvelable par tacite reconduction à chaque échéance mensuelle." },
    { title: '4.2 Obligations du prestataire', body: `${PRESTATAIRE.nom} s'engage, au titre d'une obligation de moyens renforcée, à mettre tout en œuvre pour assurer la disponibilité du service en continu, sous réserve des opérations de maintenance planifiées et des cas de force majeure ; il assure la sauvegarde régulière des données et apporte un support technique au Client.` },
    { title: '4.3 Obligations du client', body: "Le Client s'engage à utiliser le service conformément à sa destination, à fournir des informations exactes, à préserver la confidentialité de ses identifiants et à régler les sommes dues aux échéances convenues." },
    { title: '4.4 Propriété des données et confidentialité', body: `Les données saisies par le Client restent sa propriété exclusive. ${PRESTATAIRE.nom} s'interdit toute exploitation à d'autres fins que l'exécution du service et est tenu à une obligation de confidentialité sur l'ensemble des informations du Client.` },
    { title: '4.5 Protection des données à caractère personnel', body: `Pour les données à caractère personnel hébergées (personnel, clients, fournisseurs du Client), le Client agit en qualité de responsable du traitement et ${PRESTATAIRE.nom} en qualité de sous-traitant, agissant sur instruction du Client et conformément à la loi n° 2004-63 du 27 juillet 2004 relative à la protection des données personnelles. ${PRESTATAIRE.nom} met en œuvre les mesures de sécurité appropriées, astreint son personnel à la confidentialité, ne conserve les données que pour la durée du contrat et accomplit, le cas échéant, les formalités auprès de l'INPDP.` },
    { title: '4.6 Réversibilité', body: `À la résiliation, le Client peut obtenir l'export de ses données dans un format exploitable. À défaut de demande, ${PRESTATAIRE.nom} conserve les données pendant 30 jours après la date d'effet, puis procède à leur suppression définitive.` },
    { title: '4.7 Propriété intellectuelle', body: `La plateforme, son code, sa marque et ses contenus demeurent la propriété exclusive de ${PRESTATAIRE.nom}. L'abonnement confère un simple droit d'usage personnel et non exclusif, non cessible.` },
    { title: '4.8 Responsabilité', body: `La responsabilité de ${PRESTATAIRE.nom} est limitée aux dommages directs et ne saurait excéder le montant des sommes versées par le Client au cours des trois derniers mois.` },
    { title: '4.9 Force majeure', body: "Aucune des parties ne saurait être tenue responsable d'un manquement résultant d'un cas de force majeure au sens du droit tunisien (notamment panne d'hébergement, coupure réseau, catastrophe ou fait d'un tiers). Les obligations affectées sont suspendues pendant la durée de l'événement ; si celui-ci perdure au-delà de 30 jours, chaque partie peut résilier de plein droit, sans indemnité." },
    { title: '4.10 Résiliation', body: "Chaque partie peut résilier le contrat moyennant un préavis de 30 jours notifié par email. Le non-paiement ou le manquement grave d'une partie autorise l'autre à résilier de plein droit." },
    { title: '4.11 Droit applicable et litiges', body: "Le présent contrat est soumis au droit tunisien. À défaut de règlement amiable, tout litige relève de la compétence des tribunaux de Tunis." },
  ]);
  y += 6;

  y = signatures(ctx, y, { client: data.client, date: data.date, previewMode });
  stampFooters(ctx, "Contrat d'abonnement");
  return finish(ctx, outPath);
}

// ══════════════════════════════════════════════════════════════════════════════
// 2) AVENANT AU CONTRAT
// ══════════════════════════════════════════════════════════════════════════════
async function buildAvenant(outPath, data) {
  const previewMode = data.previewMode !== false;
  const ctx = makeCtx({ Title: `Avenant — ${data.client.nom}`, Author: PRESTATAIRE.raisonSociale });
  header(ctx, {
    eyebrow: 'AVENANT AU CONTRAT',
    title: "Avenant au contrat d'abonnement",
    subtitle: 'Modification de la configuration souscrite et de la tarification',
    ref: data.ref, date: data.date,
  });
  let y = TOPY;

  y = section(ctx, y, 'ENTRE LES SOUSSIGNÉS');
  y = partiesBlock(ctx, y, data.client);

  y = section(ctx, y, "ARTICLE 1 — OBJET DE L'AVENANT");
  const refInitial = data.contratRef
    ? `le contrat d'abonnement n° ${data.contratRef}${data.contratDate ? ` du ${data.contratDate}` : ''}`
    : `le contrat d'abonnement en vigueur`;
  y = calloutBox(ctx, y,
    `Le présent avenant modifie ${refInitial} conclu entre ${PRESTATAIRE.nom} et le Client. Il prend effet à la date de signature ci-dessous et complète les termes du contrat initial sans s'y substituer. Seules les clauses expressément modifiées par le présent avenant sont concernées ; toutes les autres dispositions du contrat demeurent inchangées.`,
    'neutral');

  if (data.ajout) {
    if (y + 60 > BOTTOM_LIMIT) y = newPage(ctx);
    y = fillAddedBanner(ctx, y, data.ajout);
  }

  y = section(ctx, y, 'ARTICLE 2 — NOUVELLE CONFIGURATION');
  y = configTable(ctx, y, [
    ['Points de vente (activités)', data.config.activites],
    ['Laboratoires de production', data.config.labos],
    ['Comptes gérants', data.config.gerants],
  ], 'Nouvelle quantité');

  y = section(ctx, y, 'ARTICLE 3 — NOUVELLE TARIFICATION');
  y = pricingBlock(ctx, y, { mensuel: data.pricing.mensuel, mensuelBase: data.pricing.mensuelBase });
  y = clauses(ctx, y, [{
    title: '', body:
      `La nouvelle mensualité s'applique à compter de la première échéance suivant la signature du présent avenant. Elle s'entend toutes taxes comprises (TVA au taux en vigueur de ${TVA_RATE} % incluse), la facture émise à chaque échéance en présentant la ventilation. Les frais d'activation déjà réglés ne sont pas dus à nouveau et les modalités de paiement du contrat initial restent applicables.`,
  }]);
  y += 4;

  y = section(ctx, y, 'ARTICLE 4 — DISPOSITIONS FINALES');
  y = clauses(ctx, y, [
    { title: "4.1 Prise d'effet", body: "Le présent avenant entre en vigueur à sa date de signature électronique. Il fait partie intégrante du contrat d'abonnement initial dont il suit le sort." },
    { title: '4.2 Droit applicable', body: "Le présent avenant est soumis au droit tunisien. Tout litige relève de la compétence des tribunaux de Tunis." },
  ]);
  y += 6;

  y = signatures(ctx, y, { client: data.client, date: data.date, previewMode });
  stampFooters(ctx, 'Avenant au contrat');
  return finish(ctx, outPath);
}

// Bandeau « capacité ajoutée » (avenant) — hauteur dynamique, texte wrappé
function fillAddedBanner(ctx, y, ajout) {
  const { fill, hline, txt, wrap, measure } = ctx;
  const innerW = CW - 24;
  const ajoutH = measure(ajout, innerW, 12, 1);
  const h = 22 + ajoutH + 9;
  fill(ML, y, CW, h, C.okSoft); hline(y, C.okLine); hline(y + h, C.okLine);
  ctx.gradientRule(ML, y, 3, h);
  txt('CAPACITÉ AJOUTÉE PAR CET AVENANT', ML + 12, y + 9, 6.8, true, C.okText, { characterSpacing: 1 });
  wrap(ajout, ML + 12, y + 22, 12, true, '#14532d', innerW, 1);
  return y + h + 12;
}

// ══════════════════════════════════════════════════════════════════════════════
// 3) RÉSILIATION DU CONTRAT
// ══════════════════════════════════════════════════════════════════════════════
async function buildResiliation(outPath, data) {
  const previewMode = data.previewMode !== false;
  const ctx = makeCtx({ Title: `Résiliation — ${data.client.nom}`, Author: PRESTATAIRE.raisonSociale });
  header(ctx, {
    eyebrow: 'RÉSILIATION DE CONTRAT',
    title: "Résiliation du contrat d'abonnement",
    subtitle: 'Constat de fin de la mise à disposition de la plateforme',
    ref: data.ref, date: data.date,
  });
  let y = TOPY;

  y = section(ctx, y, 'ENTRE LES SOUSSIGNÉS');
  y = partiesBlock(ctx, y, data.client);

  y = section(ctx, y, 'ARTICLE 1 — OBJET');
  y = calloutBox(ctx, y,
    `Le présent document constate la résiliation du contrat d'abonnement conclu entre ${PRESTATAIRE.nom} et le Client. Il met fin à la mise à disposition de la plateforme dans les conditions définies ci-après.`,
    'danger');

  y = section(ctx, y, "ARTICLE 2 — DATE D'EFFET ET PRÉAVIS");
  const { fill, hline, txt } = ctx;
  fill(ML, y, CW, 30, '#fff7ed'); hline(y, '#fed7aa'); hline(y + 30, '#fed7aa');
  txt('Date de la demande de résiliation', ML + 10, y + 10, 8.5, false, '#9a3412');
  txt(data.date, ML, y + 8, 11, true, '#9a3412', { align: 'right', width: CW - 12 });
  y += 38;
  y = clauses(ctx, y, [{
    title: '', body:
      "La résiliation prend effet à l'issue d'un préavis de 30 jours à compter de la date ci-dessus. Le service reste accessible et facturé jusqu'au terme de ce préavis ; aucune nouvelle mensualité n'est due au-delà.",
  }]);
  y += 4;

  y = section(ctx, y, 'ARTICLE 3 — EFFETS ET DISPOSITIONS FINALES');
  y = clauses(ctx, y, [
    { title: '3.1 Effets de la résiliation', body: "Au terme du préavis, l'accès du Client et de ses gérants à la plateforme est désactivé. Les sommes échues avant la date d'effet restent dues." },
    { title: '3.2 Sort des données', body: `Le Client peut demander l'export de ses données avant la date d'effet. À défaut, ${PRESTATAIRE.nom} conserve les données pendant 30 jours après la résiliation, puis procède à leur suppression définitive.` },
    { title: '3.3 Solde de tout compte', body: "La résiliation ne donne lieu à aucun remboursement des sommes déjà réglées au titre des périodes échues ou en cours, sauf disposition contraire convenue entre les parties." },
    { title: '3.4 Droit applicable', body: "La présente résiliation est soumise au droit tunisien. Tout litige relève de la compétence des tribunaux de Tunis." },
  ]);
  y += 6;

  y = signatures(ctx, y, { client: data.client, date: data.date, previewMode });
  stampFooters(ctx, 'Résiliation de contrat');
  return finish(ctx, outPath);
}

// ══════════════════════════════════════════════════════════════════════════════
// Données d'exemple (APERÇU) + génération
// ══════════════════════════════════════════════════════════════════════════════
const SAMPLE = {
  contrat: {
    ref: 'CTR-2026-00042',
    date: '27 juin 2026',
    client: {
      nom: 'Restaurant Le Carthage', forme: 'SARL', mfrc: 'MF 9876543/B/M/000',
      representant: 'M. Karim Ben Ali, gérant',
      email: 'gerant@lecarthage.tn', tel: '+216 22 345 678', adresse: 'Rue de Marseille, 1000 Tunis',
    },
    config: { activites: 3, labos: 1, gerants: 2 },
    pricing: {
      onboarding: '600 DT', mensuel: '240 DT', mensuelBase: '300 DT',
      promoDetail: "Offre de lancement : remise de 20 % sur la mensualité pendant 3 mois (240 DT/mois au lieu de 300 DT). Le tarif de base de 300 DT/mois reprend automatiquement à compter du 27 septembre 2026.",
    },
  },
  avenant: {
    ref: 'AVN-2026-00017',
    date: '27 juin 2026',
    contratRef: 'CTR-2026-00042',
    contratDate: '12 mars 2026',
    client: { nom: 'Restaurant Le Carthage', forme: 'SARL', mfrc: 'MF 9876543/B/M/000', representant: 'M. Karim Ben Ali, gérant', email: 'gerant@lecarthage.tn' },
    ajout: '+1 activité   ·   +1 compte gérant',
    config: { activites: 4, labos: 1, gerants: 3 },
    pricing: { mensuel: '360 DT', mensuelBase: '360 DT' },
  },
  resiliation: {
    ref: 'RES-2026-00009',
    date: '27 juin 2026',
    client: { nom: 'Restaurant Le Carthage', forme: 'SARL', mfrc: 'MF 9876543/B/M/000', representant: 'M. Karim Ben Ali, gérant', email: 'gerant@lecarthage.tn' },
  },
};

// Aperçu CLI uniquement — ce module est aussi requis par le backend
// (contractPdfService) et ne doit alors RIEN générer au chargement.
if (require.main === module) {
  (async () => {
    const dir = __dirname;
    checkPrestatairePlaceholders();
    await buildContrat(path.join(dir, 'contrat-labflow.pdf'), SAMPLE.contrat);
    await buildAvenant(path.join(dir, 'avenant-labflow.pdf'), SAMPLE.avenant);
    await buildResiliation(path.join(dir, 'resiliation-labflow.pdf'), SAMPLE.resiliation);
    console.log('✅ Documents générés (aperçu avec valeurs d\'exemple) :');
    console.log('   -', path.join(dir, 'contrat-labflow.pdf'));
    console.log('   -', path.join(dir, 'avenant-labflow.pdf'));
    console.log('   -', path.join(dir, 'resiliation-labflow.pdf'));
  })();
}

module.exports = { buildContrat, buildAvenant, buildResiliation, checkPrestatairePlaceholders, PRESTATAIRE };
