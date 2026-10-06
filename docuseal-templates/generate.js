/**
 * Module de charte des factures LabFlow (PDF, pdfkit) : facture d'abonnement, facture acheteur, facture
 * d'approvisionnement. Logo vectoriel, mise en page conforme au thème de l'app, pied légal piloté par les
 * variables d'environnement.
 *
 * Chaque builder est DATA-DRIVEN : il reçoit un objet `data` et rend le PDF (fichier si outPath, Buffer sinon).
 * Depuis le lot 3 (LabFlow est sans engagement), il n'y a plus de contrat, d'avenant ni de résiliation : le
 * dossier garde son nom d'origine, auquel des services et des outils se réfèrent.
 *
 * Usage (aperçu avec des valeurs d'exemple) : node docuseal-templates/generate.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

// ── Identité prestataire ────────────────────────────────────────────────────────
// Renseignée par variables d'environnement (Coolify) ; les valeurs par défaut sont
// des valeurs d'EXEMPLE (aperçus locaux). Nom, adresse et matricule retombent sur les
// FACTURE_* : une seule source à configurer.
const envOr = (names, fallback) => {
  for (const n of names) if (process.env[n]) return process.env[n];
  return fallback;
};
// Variable OPTIONNELLE : DÉFINIE VIDE (« PRESTATAIRE_RC= ») = « aucune » — cas d'un
// prestataire auto-entrepreneur, sans registre de commerce ni capital ; ABSENTE =
// valeur d'exemple (aperçus locaux).
const envOpt = (names, fallback) => {
  for (const n of names) if (n in process.env) return String(process.env[n]).trim();
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
  rc: envOpt(['PRESTATAIRE_RC'], 'B0123452024'),
  capital: envOpt(['PRESTATAIRE_CAPITAL'], '10 000 DT'),
  adresse: envOr(['PRESTATAIRE_ADRESSE', 'FACTURE_ADRESSE'], 'Avenue Habib Bourguiba, 1000 Tunis, Tunisie'),
  email: envOr(['PRESTATAIRE_EMAIL'], 'contact@labflow-tn.com'),
  tel: envOr(['PRESTATAIRE_TEL'], '+216 71 000 000'),
};
// Régime de l'auto-entrepreneur (loi n° 2020-33) : pas de matricule fiscal classique
// mais un « identifiant unique » (7 chiffres + lettre), pas de RC ni de capital.
const PRESTATAIRE_AE = /auto.?entrepreneur/i.test(PRESTATAIRE.forme);
const PRESTATAIRE_MF_LABEL = PRESTATAIRE_AE ? 'Identifiant unique' : 'Matricule fiscal';
const PRESTATAIRE_MF_SHORT = PRESTATAIRE_AE ? 'ID' : 'MF';
// Ligne « RC · Capital » : omise quand les deux sont vides (auto-entrepreneur).
const prestataireRcCapital = () => [
  PRESTATAIRE.rc && `RC : ${PRESTATAIRE.rc}`,
  PRESTATAIRE.capital && `Capital : ${PRESTATAIRE.capital}`,
].filter(Boolean).join('  ·  ');
// Libellés [long, court] du matricule d'une partie imprimée sur une facture (vendeur, client) : même règle que
// pour le prestataire — un auto-entrepreneur porte un « identifiant unique ».
const libellesMatricule = (autoEntrepreneur) => (autoEntrepreneur ? ['Identifiant unique', 'ID'] : ['Matricule fiscal', 'MF']);
// Pied de page légal : raison sociale · MF/ID · RC (si présent).
const prestataireLegalLine = () => [
  PRESTATAIRE.raisonSociale,
  `${PRESTATAIRE_MF_SHORT} ${PRESTATAIRE.matricule}`,
  PRESTATAIRE.rc && `RC ${PRESTATAIRE.rc}`,
].filter(Boolean).join('  ·  ');

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

// Cases-repères des zones de champs (mode template) : visibles uniquement avec
// `--guides` en CLI. Le require côté backend n'a jamais ce flag → zones invisibles.
const SLOT_GUIDES = process.argv.includes('--guides');

// ── Géométrie page ─────────────────────────────────────────────────────────────
const ML = 56;                 // marge gauche/droite
const PAGE = { w: 595.28, h: 841.89 };
const CW = PAGE.w - ML * 2;    // largeur contenu
const RX = ML + CW;            // bord droit contenu
const TOPY = 150;              // début du contenu sous l'en-tête
const BOTTOM_LIMIT = PAGE.h - 64; // limite avant footer

// ── Texte sûr pour les polices standard (lot 2b, spec §8.3) ───────────────────
// Portage de src/utils/pdfTexte.ts (frontend). Les polices standard de pdfkit (Helvetica) n'écrivent
// que Windows-1252 : « → » sortait « !’ », une donnée hors police (arabe, emoji) en octets illisibles.
// pdfTexte donne un équivalent lisible aux signes porteurs de sens, retire les signes décoratifs et
// écrit « ? » pour tout le reste. Les parenthèses et guillemets vides ne sont retirés que si un signe
// décoratif a été retiré de la chaîne (« Sauce () » reste tel quel).
// En OPTION seulement : makeCtx(info, { pdfTexte: true }) — facture d'appro. Jamais pour la facture
// acheteur ni la facture d'abonnement.
const HORS_POLICE = /[^\t\n\r\x20-\xFF\u20AC\u201A\u0192\u201E\u2026\u2020\u2021\u02C6\u2030\u0160\u2039\u0152\u017D\u2018\u2019\u201C\u201D\u2022\u2013\u2014\u02DC\u2122\u0161\u203A\u0153\u017E\u0178]/gu;
// Table du front, écrite en points de code (U+…) : caractère → équivalent.
const cp = (...points) => String.fromCodePoint(...points);
const EQUIVALENTS_PDF = new Map([
  // Flèches de parcours et de sens : « Référentiel › Unités », « Reçu ‹ X » (→ ➜ ➔ ⇒ ▸ › ; ← ⇐ ‹ ; ↔ ‹›)
  [0x2192, cp(0x203A)], [0x279C, cp(0x203A)], [0x2794, cp(0x203A)], [0x21D2, cp(0x203A)], [0x25B8, cp(0x203A)],
  [0x2190, cp(0x2039)], [0x21D0, cp(0x2039)], [0x2194, cp(0x2039, 0x203A)],
  // Mathématiques (− –, ≤ <=, ≥ >=, ≠ <>, ≈ ~, Σ et ∑ Somme, ∞ infini)
  [0x2212, cp(0x2013)], [0x2264, '<='], [0x2265, '>='], [0x2260, '<>'], [0x2248, cp(0x7E)],
  [0x03A3, 'Somme'], [0x2211, 'Somme'], [0x221E, 'infini'],
  // Évolution d'un indicateur (▲ +, ▼ –)
  [0x25B2, cp(0x2B)], [0x25BC, cp(0x2013)],
  // Espaces que la police ne connaît pas (fine insécable, fine, de chiffre, ultra-fine ; largeur nulle, BOM retirés)
  [0x202F, cp(0x20)], [0x2009, cp(0x20)], [0x2007, cp(0x20)], [0x200A, cp(0x20)], [0x200B, cp()], [0xFEFF, cp()],
]);
// Décoratifs, retirés (icônes de boutons, de badges, coches, puces) : ✓ ✔ ✕ ✖ ✗ ◆ ◇ ● ○ ■ □ ▪ ⇄ ⇆ ↑ ↓ ↳ ↺ ↻
const DECORATIFS_PDF = new Set([
  0x2713, 0x2714, 0x2715, 0x2716, 0x2717, 0x25C6, 0x25C7, 0x25CF, 0x25CB, 0x25A0, 0x25A1, 0x25AA,
  0x21C4, 0x21C6, 0x2191, 0x2193, 0x21B3, 0x21BA, 0x21BB,
]);
const pdfTexte = (texte) => {
  let decoratifRetire = false;
  const s = String(texte).replace(HORS_POLICE, (c) => {
    const point = c.codePointAt(0);
    if (DECORATIFS_PDF.has(point)) { decoratifRetire = true; return cp(); }
    return EQUIVALENTS_PDF.has(point) ? EQUIVALENTS_PDF.get(point) : '?';
  });
  return decoratifRetire ? s.replace(/\(\s*\)/g, cp()).replace(/«\s*»/g, cp()) : s;
};
// Applique pdfTexte à tout texte écrit OU mesuré par ce document (text, heightOfString, widthOfString) :
// les largeurs et hauteurs mesurées sont celles du texte écrit. pdfTexte est idempotent.
const pdfTexteSur = (doc) => {
  const sur = (s) => (typeof s === 'string' ? pdfTexte(s) : s);
  const { text, heightOfString, widthOfString } = doc;
  doc.text = function texteSur(s, ...reste) { return text.call(this, sur(s), ...reste); };
  doc.heightOfString = function hauteurSur(s, ...reste) { return heightOfString.call(this, sur(s), ...reste); };
  doc.widthOfString = function largeurSur(s, ...reste) { return widthOfString.call(this, sur(s), ...reste); };
  return doc;
};

// ══════════════════════════════════════════════════════════════════════════════
// Contexte de rendu + helpers
// ══════════════════════════════════════════════════════════════════════════════
// options.pdfTexte : texte sûr pour la police (pdfTexteSur ci-dessus), en OPTION seulement.
function makeCtx(info, { pdfTexte: avecPdfTexte = false } = {}) {
  const doc = new PDFDocument({
    size: 'A4',
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    autoFirstPage: true,
    bufferPages: true,
    info,
  });
  if (avecPdfTexte) pdfTexteSur(doc);

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

  // Zone réservée à un champ Docuseal (mode TEMPLATE). Par défaut la zone est
  // INVISIBLE : le fond reste net sous les valeurs remplies dans le document
  // final. `--guides` (CLI) dessine les cases en pointillé — version repère pour
  // le placement des champs dans l'UI, à ne PAS uploader comme template.
  const slot = (x, y, w, h) => {
    if (!SLOT_GUIDES) return;
    doc.save().roundedRect(x, y, w, h, 3).lineWidth(0.7).dash(2, { space: 1.6 })
       .fillAndStroke('#fcfdff', '#c7d2fe').undash().restore();
  };

  return { doc, fill, roundFill, hline, txt, oblique, measure, wrap, fitText, gradientRule, slot };
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
function header(ctx, { eyebrow, title, subtitle, ref, date, dateLabel = 'Établi le' }) {
  const { txt, gradientRule } = ctx;
  ctx.docMeta = { eyebrow, ref };          // réutilisé par newPage (pages 2+)
  drawLogo(ctx, ML, 40, 30, 'dark');

  // Méta document, alignée à droite (mode template : la date vit dans le champ
  // « Date du contrat » posé plus bas, pas de réf figée dans le fond de page)
  txt(eyebrow, ML, 40, 7.5, true, C.indigo, { align: 'right', width: CW, characterSpacing: 1.4 });
  if (!ctx.templateMode) {
    txt(`Réf. ${ref}`, ML, 53, 8, false, C.muted, { align: 'right', width: CW });
    txt(`${dateLabel} ${date}`, ML, 64, 8, false, C.faint, { align: 'right', width: CW });
  }

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
// opts : labels = [émetteur, destinataire] (défaut contrat), mention = ligne
// « Ci-après dénommé » (défaut true — false pour les factures).
function partiesBlock(ctx, y, client, opts = {}) {
  const { txt, wrap, roundFill, measure, slot } = ctx;
  const [labelPres, labelCli] = opts.labels || ['LE PRESTATAIRE', 'LE CLIENT'];
  const withMention = opts.mention !== false;
  const colW = (CW - 14) / 2;
  const cx2 = ML + colW + 14;
  const innerW = colW - 24;
  const padTop = 12, padBot = 12;

  // Spécification des lignes de chaque colonne (w = donnée variable → wrap ;
  // slotH = case vide à recouvrir d'un champ Docuseal en mode template).
  // opts.emetteur = { nom, matricule?, adresse?, email?, tel? } substitue un émetteur
  // arbitraire au PRESTATAIRE (ex. facture acheteur : émetteur = l'entreprise du client).
  const em = opts.emetteur || null;
  // Mentions légales de l'émetteur (lot 3, étape 8 : nomCommercial, forme, matricule, autoEntrepreneur, rne, ville) :
  // chaque ligne est omise quand sa valeur est vide — un émetteur sans mention sort à l'octet près comme avant.
  const emId = em && [em.forme, em.matricule && `${libellesMatricule(em.autoEntrepreneur)[0]} : ${em.matricule}`].filter(Boolean).join('  ·  ');
  const emAdresse = em && [em.adresse, em.ville].filter(Boolean).join(', ');
  const presLines = em ? [
    { t: labelPres, s: 6.8, b: true, c: C.faint, sp: 1, lh: 12 },
    { t: em.nom || 'Émetteur', s: 10, b: true, c: C.ink, w: true, gap: 4 },
    em.nomCommercial && { t: `Nom commercial : ${em.nomCommercial}`, s: 7.5, c: C.muted, w: true, gap: 2 },
    emId && { t: emId, s: 7.5, c: C.muted, w: true, gap: 2 },
    em.rne && { t: `RNE : ${em.rne}`, s: 7.5, c: C.muted, w: true, gap: 2 },
    emAdresse && { t: emAdresse, s: 7.5, c: C.muted, w: true, gap: 2 },
    (em.email || em.tel) && { t: [em.email, em.tel].filter(Boolean).join('  ·  '), s: 7.5, c: C.muted, w: true, gap: 0 },
  ].filter(Boolean) : [
    { t: labelPres, s: 6.8, b: true, c: C.faint, sp: 1, lh: 12 },
    { t: PRESTATAIRE.raisonSociale, s: 10, b: true, c: C.ink, w: true, gap: 4 },
    { t: `${PRESTATAIRE_MF_LABEL} : ${PRESTATAIRE.matricule}`, s: 7.5, c: C.muted, w: true, gap: 2 },
    prestataireRcCapital() && { t: prestataireRcCapital(), s: 7.5, c: C.muted, w: true, gap: 2 },
    { t: PRESTATAIRE.adresse, s: 7.5, c: C.muted, w: true, gap: 2 },
    { t: `${PRESTATAIRE.email}  ·  ${PRESTATAIRE.tel}`, s: 7.5, c: C.muted, w: true, gap: 0 },
  ].filter(Boolean);
  const idClient = [client.forme, client.mfrc].filter(Boolean).join('  ·  ');
  const mentionLine = withMention
    ? { t: 'Ci-après dénommé « le Client »', s: 7.5, c: C.faint, gapBefore: 6, lh: 11 }
    : null;
  const cliLines = (ctx.templateMode ? [
    { t: labelCli, s: 6.8, b: true, c: C.faint, sp: 1, lh: 12 },
    { slotW: innerW, slotH: 15, gap: 4 },            // champ « Nom du client »
    { slotW: innerW * 0.85, slotH: 13, gap: 2 },     // champ « Email »
    mentionLine,
  ] : [
    { t: labelCli, s: 6.8, b: true, c: C.faint, sp: 1, lh: 12 },
    { t: client.nom, s: 10, b: true, c: C.ink, w: true, gap: 4 },
    idClient && { t: idClient, s: 7.5, c: C.muted, w: true, gap: 2 },
    client.rne && { t: `RNE : ${client.rne}`, s: 7.5, c: C.muted, w: true, gap: 2 },
    client.representant && { t: `Représenté par ${client.representant}`, s: 7.5, c: C.muted, w: true, gap: 2 },
    client.email && { t: client.email, s: 7.5, c: C.muted, w: true, gap: 2 },
    client.tel && { t: client.tel, s: 7.5, c: C.muted, w: true, gap: 2 },
    client.adresse && { t: client.adresse, s: 7.5, c: C.muted, w: true, gap: 2 },
    mentionLine,
  ]).filter(Boolean);

  // Mesure de la hauteur d'une colonne (sans dessiner)
  const colHeight = (lines) => lines.reduce((acc, ln) => {
    const before = ln.gapBefore || 0;
    const hh = ln.slotH ? ln.slotH + (ln.gap || 0)
      : ln.w ? measure(ln.t, innerW, ln.s, 1.5) + (ln.gap || 0) : (ln.lh || 12);
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
      if (ln.slotH) {
        slot(x, cy, ln.slotW, ln.slotH);
        cy += ln.slotH + (ln.gap || 0);
      } else if (ln.w) {
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

// ── Footer (toutes les pages) — note et mention légale personnalisables ──
// legalOverride : remplace la ligne légale PRESTATAIRE (ex. facture acheteur,
// émise par l'entreprise du client et non par LabFlow).
function stampFooters(ctx, label, note = 'Document confidentiel — usage strictement contractuel', legalOverride = null) {
  const { doc, txt, fitText, gradientRule } = ctx;
  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    gradientRule(ML, PAGE.h - 38, CW, 1.5);
    // Mention légale sur UNE ligne (clippée) ; l'adresse complète est dans le bloc Parties.
    const legal = fitText(legalOverride || prestataireLegalLine(), 6.5, CW * 0.62);
    txt(legal, ML, PAGE.h - 30, 6.5, false, C.faint, { lineBreak: false });
    txt(`${label}  ·  Page ${i + 1}/${range.count}`, ML, PAGE.h - 30, 6.5, false, C.muted, { align: 'right', width: CW });
    txt(note, ML, PAGE.h - 20, 6.5, false, C.faint, { lineBreak: false });
  }
}

// outPath renseigné → écrit le fichier ; outPath null → résout avec le Buffer du PDF
// (mode service backend : rien sur disque).
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
// FACTURE D'ABONNEMENT (émise au règlement)
// ══════════════════════════════════════════════════════════════════════════════
// data : { numero, dateFacture, periodeLabel, clientNom, clientEmail,
//          client?: { forme, matricule, autoEntrepreneur, rne, adresse, ville },   // copie figée au paiement
//          montantHt, montantTva, montantTtc, tvaRate,
//          produit?: 'compta',                          // LabFlow Compta (étape S2b) : libellés du produit
//          lignes?: [{ libelle, montant }] }            // postes figés sur la mensualité (TTC, somme = montantTtc)
// DÉTERMINISTE : CreationDate = date de facture (jamais l'horloge) → la copie
// jointe à l'email et la copie re-téléchargée sont identiques au byte près.
// Sans produit ni lignes : la facture d'avant, à l'octet près (test/B2-pdfTexte.test.js, identiteFacture).
async function buildFacture(outPath, data) {
  const compta = data.produit === 'compta';
  const lignes = Array.isArray(data.lignes) && data.lignes.length ? data.lignes : null;
  const dateStr = new Date(data.dateFacture || 0)
    .toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const fmt = (n) => `${Number(n || 0).toFixed(3)} DT`;
  const ctx = makeCtx({
    Title: `Facture ${data.numero}`,
    Author: PRESTATAIRE.nom,
    Subject: `Abonnement ${data.periodeLabel}`,
    CreationDate: data.dateFacture ? new Date(data.dateFacture) : new Date(0),
  });
  const { fill, hline, txt, doc } = ctx;
  header(ctx, {
    eyebrow: 'FACTURE',
    title: "Facture d'abonnement",
    subtitle: compta ? 'LabFlow Compta — abonnement mensuel au service en ligne' : 'Plateforme LabFlow — abonnement mensuel au service en ligne',
    ref: data.numero, date: dateStr, dateLabel: 'Émise le',
  });
  let y = TOPY;

  y = section(ctx, y, 'ÉMETTEUR ET CLIENT');
  // data.client (lot 3, étape 8) : identité légale du client figée au paiement — { forme, matricule,
  // autoEntrepreneur, rne, adresse, ville }. Absente : « Facturé à » d'avant (nom, email), à l'octet près.
  const cli = data.client || {};
  y = partiesBlock(ctx, y, {
    nom: data.clientNom || 'Client',
    forme: cli.forme || undefined,
    mfrc: cli.matricule ? `${libellesMatricule(cli.autoEntrepreneur)[0]} : ${cli.matricule}` : undefined,
    rne: cli.rne || undefined,
    email: data.clientEmail || undefined,
    adresse: [cli.adresse, cli.ville].filter(Boolean).join(', ') || undefined,
  }, { labels: ['ÉMETTEUR', 'FACTURÉ À'], mention: false });

  y = section(ctx, y, 'OBJET');
  y = calloutBox(ctx, y,
    compta
      ? `Abonnement mensuel à LabFlow Compta — période : ${data.periodeLabel}. La présente facture est émise au règlement de l'échéance et vaut reçu.`
      : `Abonnement mensuel à la plateforme ${PRESTATAIRE.nom} — période : ${data.periodeLabel}. La présente facture est émise au règlement de l'échéance et vaut reçu.`,
    'neutral');

  y = section(ctx, y, 'DÉTAIL');
  const cHt = ML + 305, cTva = ML + 390, cTtc = RX - 10;
  fill(ML, y, CW, 22, C.indigoSoft); hline(y, '#dfe3ff'); hline(y + 22, '#dfe3ff');
  txt('Désignation', ML + 10, y + 7, 7, true, C.indigo, { characterSpacing: 0.5 });
  txt('Montant HT', ML, y + 7, 7, true, C.indigo, { align: 'right', width: cHt - ML });
  txt(`TVA ${data.tvaRate} %`, ML, y + 7, 7, true, C.indigo, { align: 'right', width: cTva - ML });
  txt('Total TTC', ML, y + 7, 7, true, C.indigo, { align: 'right', width: cTtc - ML });
  y += 22;
  if (lignes) {
    // Une ligne par poste figé (LabFlow Compta, D8) : HT et TVA de chaque ligne tirés de son TTC ; la dernière ligne
    // reçoit l'écart d'arrondi, pour que les lignes s'additionnent exactement aux totaux de la facture.
    const r3 = (n) => Math.round(n * 1000) / 1000;
    let resteHt = Number(data.montantHt || 0);
    let resteTva = Number(data.montantTva || 0);
    lignes.forEach((l, i) => {
      const ttcL = r3(Number(l.montant || 0));
      const derniere = i === lignes.length - 1;
      const htL = derniere ? r3(resteHt) : r3(ttcL / (1 + Number(data.tvaRate || 0) / 100));
      const tvaL = derniere ? r3(resteTva) : r3(ttcL - htL);
      resteHt -= htL; resteTva -= tvaL;
      fill(ML, y, CW, 26, i % 2 ? '#ffffff' : '#fcfcff'); hline(y + 26, C.hairSoft);
      // Libellé seul (la période est dans l'objet) : il tient sur une ligne de la colonne Désignation.
      txt(String(l.libelle || ''), ML + 10, y + 9, 9, false, C.ink, { width: cHt - ML - 90 });
      txt(fmt(htL), ML, y + 9, 8.5, false, C.body, { align: 'right', width: cHt - ML });
      txt(fmt(tvaL), ML, y + 9, 8.5, false, C.body, { align: 'right', width: cTva - ML });
      txt(fmt(ttcL), ML, y + 9, 9, true, C.ink, { align: 'right', width: cTtc - ML });
      y += 26;
    });
    y += 12;
  } else {
    fill(ML, y, CW, 26, '#fcfcff'); hline(y + 26, C.hairSoft);
    txt(compta ? `LabFlow Compta — abonnement mensuel · ${data.periodeLabel}` : `Abonnement mensuel · ${data.periodeLabel}`, ML + 10, y + 9, 9, false, C.ink);
    txt(fmt(data.montantHt), ML, y + 9, 8.5, false, C.body, { align: 'right', width: cHt - ML });
    txt(fmt(data.montantTva), ML, y + 9, 8.5, false, C.body, { align: 'right', width: cTva - ML });
    txt(fmt(data.montantTtc), ML, y + 9, 9, true, C.ink, { align: 'right', width: cTtc - ML });
    y += 26 + 12;
  }

  // Totaux — même langage visuel que le bloc tarification des contrats
  fill(ML, y, CW, 26, C.panel); hline(y, C.hair); hline(y + 26, C.hair);
  txt('Total hors taxes', ML + 10, y + 9, 8.5, false, C.body);
  txt(fmt(data.montantHt), ML, y + 8, 9.5, false, C.ink, { align: 'right', width: CW - 12 });
  y += 26;
  fill(ML, y, CW, 26, C.panel2); hline(y + 26, C.hair);
  txt(`TVA (${data.tvaRate} %)`, ML + 10, y + 9, 8.5, false, C.body);
  txt(fmt(data.montantTva), ML, y + 8, 9.5, false, C.ink, { align: 'right', width: CW - 12 });
  y += 26;
  const th = 36;
  fill(ML, y, CW, th, '#eef2ff'); hline(y, '#c7d2fe'); hline(y + th, C.indigo);
  ctx.gradientRule(ML, y, 3, th);
  txt('TOTAL TTC', ML + 12, y + 12, 9.5, true, C.indigo, { characterSpacing: 0.6 });
  txt(fmt(data.montantTtc), ML, y + 10, 13, true, C.indigo, { align: 'right', width: CW - 12 });
  y += th + 12;

  // Acquittement — pastille pleine largeur avec coche vectorielle (langage contrats)
  const ah = 30;
  fill(ML, y, CW, ah, C.okSoft); hline(y, C.okLine); hline(y + ah, C.okLine);
  doc.save().lineWidth(1.6).strokeColor(C.okText)
     .moveTo(ML + 12, y + 15).lineTo(ML + 16, y + 19).lineTo(ML + 23, y + 10).stroke().restore();
  txt('FACTURE ACQUITTÉE', ML + 32, y + 11, 9, true, C.okText, { characterSpacing: 0.6 });
  txt(`Réglée le ${dateStr}`, ML, y + 11, 8.5, false, '#16a34a', { align: 'right', width: CW - 12 });
  y += ah + 12;

  // Mentions
  doc.fontSize(7).font('Helvetica').fillColor(C.faint)
     .text(`Montants exprimés en dinars tunisiens (DT), toutes taxes comprises — TVA ${data.tvaRate} % incluse (TTC = HT + TVA). Facture générée et émise électroniquement, valable sans signature ni cachet.`,
       ML, y, { width: CW, lineGap: 2 });

  stampFooters(ctx, `Facture ${data.numero}`, compta
    ? 'Facture acquittée — émise électroniquement par LabFlow Compta'
    : 'Facture acquittée — émise électroniquement par la plateforme LabFlow');
  return finish(ctx, outPath);
}

// ══════════════════════════════════════════════════════════════════════════════
// 5) FACTURE DE VENTE ACHETEUR — même charte que la facture d'abonnement,
//    mais émise par l'ENTREPRISE DU CLIENT (profil_entreprise) à un acheteur B2B.
// ══════════════════════════════════════════════════════════════════════════════
// data : { numero, dateFacture,
//          vendeur:  { nom, adresse, tel, email,
//                      nomCommercial?, forme?, matricule?, autoEntrepreneur?, rne?, ville? },   // copie figée à l'émission
//          acheteur: { nom, entreprise, adresse, mf, tel, email },   // snapshot-aware
//          lignes:   [{ designation, quantite, prixHt, tauxTva }],
//          remisePct, montantHt, montantTva, timbreFiscal, montantTimbre,
//          montantTtc, notes }
// DÉTERMINISTE : CreationDate = date de facture (jamais l'horloge) → le PDF
// re-téléchargé est identique au byte près, y compris après suppression de
// l'acheteur (les données viennent alors du snapshot figé de la facture).
async function buildFactureAcheteur(outPath, data) {
  const dateStr = new Date(data.dateFacture || 0)
    .toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const fmt = (n) => `${Number(n || 0).toFixed(3)} DT`;
  const fmtQty = (n) => {
    const x = Number(n || 0);
    return Number.isInteger(x) ? String(x) : x.toFixed(3).replace(/\.?0+$/, '');
  };
  const vendeur = data.vendeur || {};
  const ach = data.acheteur || {};
  const ctx = makeCtx({
    Title: `Facture ${data.numero}`,
    Author: vendeur.nom || 'Vendeur',
    Subject: 'Vente aux acheteurs professionnels',
    CreationDate: data.dateFacture ? new Date(data.dateFacture) : new Date(0),
  });
  const { fill, hline, txt, doc, fitText } = ctx;
  header(ctx, {
    eyebrow: 'FACTURE',
    title: 'Facture de vente',
    // Borné à la largeur de la page : avec une copie figée, le nom est la raison sociale, parfois longue.
    subtitle: fitText(`${vendeur.nom || 'Vendeur'} — vente professionnelle, émise via la plateforme LabFlow`, 9, CW),
    ref: data.numero, date: dateStr, dateLabel: 'Émise le',
  });
  let y = TOPY;

  y = section(ctx, y, 'ÉMETTEUR ET CLIENT');
  const achNom = ach.entreprise
    ? [ach.entreprise, ach.nom].filter(Boolean).join(' — ')
    : (ach.nom || 'Acheteur');
  y = partiesBlock(ctx, y, {
    nom: achNom,
    mfrc: ach.mf ? `MF ${ach.mf}` : undefined,
    email: ach.email || undefined,
    tel: ach.tel || undefined,
    adresse: ach.adresse || undefined,
  }, {
    labels: ['ÉMETTEUR', 'FACTURÉ À'], mention: false,
    emetteur: {
      nom: vendeur.nom || 'Vendeur', adresse: vendeur.adresse, email: vendeur.email, tel: vendeur.tel,
      nomCommercial: vendeur.nomCommercial, forme: vendeur.forme, matricule: vendeur.matricule,
      autoEntrepreneur: vendeur.autoEntrepreneur, rne: vendeur.rne, ville: vendeur.ville,
    },
  });

  // Tableau multi-lignes : Désignation | Qté | PU HT | TVA | Total HT
  y = section(ctx, y, 'DÉTAIL');
  const cQte = ML + 250, cPu = ML + 330, cTva = ML + 385, cTot = RX - 10;
  const thead = () => {
    fill(ML, y, CW, 22, C.indigoSoft); hline(y, '#dfe3ff'); hline(y + 22, '#dfe3ff');
    txt('Désignation', ML + 10, y + 7, 7, true, C.indigo, { characterSpacing: 0.5 });
    txt('Qté', ML, y + 7, 7, true, C.indigo, { align: 'right', width: cQte - ML });
    txt('PU HT', ML, y + 7, 7, true, C.indigo, { align: 'right', width: cPu - ML });
    txt('TVA', ML, y + 7, 7, true, C.indigo, { align: 'right', width: cTva - ML });
    txt('Total HT', ML, y + 7, 7, true, C.indigo, { align: 'right', width: cTot - ML });
    y += 22;
  };
  thead();
  let brutHt = 0;
  (data.lignes || []).forEach((l, i) => {
    if (y + 24 > BOTTOM_LIMIT) { y = newPage(ctx); thead(); }
    const totalLigne = Number(l.prixHt || 0) * Number(l.quantite || 0);
    brutHt += totalLigne;
    fill(ML, y, CW, 24, i % 2 === 0 ? '#fcfcff' : C.white); hline(y + 24, C.hairSoft);
    txt(fitText(String(l.designation ?? ''), 8.5, cQte - ML - 65), ML + 10, y + 8, 8.5, false, C.ink);
    txt(fmtQty(l.quantite), ML, y + 8, 8.5, false, C.body, { align: 'right', width: cQte - ML });
    txt(fmt(l.prixHt), ML, y + 8, 8.5, false, C.body, { align: 'right', width: cPu - ML });
    txt(`${Number(l.tauxTva || 0).toFixed(0)} %`, ML, y + 8, 8.5, false, C.body, { align: 'right', width: cTva - ML });
    txt(fmt(totalLigne), ML, y + 8, 8.5, true, C.ink, { align: 'right', width: cTot - ML });
    y += 24;
  });
  y += 12;

  // Totaux — même langage visuel que la facture d'abonnement (bandes pleine largeur)
  const totalRow = (label, value, opts = {}) => {
    if (y + 26 > BOTTOM_LIMIT) y = newPage(ctx);
    fill(ML, y, CW, 26, opts.bg || C.panel); hline(y, opts.line || C.hair); hline(y + 26, opts.line || C.hair);
    txt(label, ML + 10, y + 9, 8.5, false, opts.color || C.body);
    txt(value, ML, y + 8, 9.5, true, opts.valueColor || C.ink, { align: 'right', width: CW - 12 });
    y += 26;
  };
  const remise = Number(data.remisePct || 0);
  if (remise > 0) {
    const remiseVal = brutHt - Number(data.montantHt || 0);
    const remiseLabel = remise.toFixed(Number.isInteger(remise) ? 0 : 2);
    totalRow('Total brut HT', fmt(brutHt));
    // Signe moins : le tiret demi-cadratin « – », présent dans la police standard (Windows-1252). Le signe
    // mathématique U+2212 d'origine n'y est pas : il s'imprimait « " » sur la facture.
    totalRow(`Remise ${remiseLabel} %`, `– ${fmt(remiseVal)}`, { bg: C.dangerSoft, line: C.dangerLine, color: C.dangerText, valueColor: C.dangerText });
    totalRow('Total HT net', fmt(data.montantHt));
  } else {
    totalRow('Total HT', fmt(data.montantHt));
  }
  totalRow('TVA', fmt(data.montantTva), { bg: C.panel2 });
  if (data.timbreFiscal) totalRow('Timbre fiscal', fmt(data.montantTimbre), { bg: C.panel2 });

  if (y + 48 > BOTTOM_LIMIT) y = newPage(ctx);
  const th = 36;
  fill(ML, y, CW, th, '#eef2ff'); hline(y, '#c7d2fe'); hline(y + th, C.indigo);
  ctx.gradientRule(ML, y, 3, th);
  txt('NET À PAYER', ML + 12, y + 12, 9.5, true, C.indigo, { characterSpacing: 0.6 });
  txt(fmt(data.montantTtc), ML, y + 10, 13, true, C.indigo, { align: 'right', width: CW - 12 });
  y += th + 12;

  if (data.notes && String(data.notes).trim()) {
    // Les notes de commande sont du texte libre NON borné : calloutBox n'a pas de
    // garde de page. Court → panneau (avec garde de hauteur totale) ; long →
    // découpage en blocs rendus par clauses(), qui pagine bloc par bloc.
    const notesText = String(data.notes).trim();
    const hNotes = ctx.measure(notesText, CW - 24, 8.5) + 22;
    if (hNotes <= 300) {
      if (y + 19 + hNotes > BOTTOM_LIMIT) y = newPage(ctx);
      y = section(ctx, y, 'NOTES');
      y = calloutBox(ctx, y, notesText, 'neutral');
    } else {
      y = section(ctx, y, 'NOTES');
      const blocs = notesText.split(/\n+/).flatMap((p) => {
        const out = [];
        let rest = p.trim();
        while (rest.length > 1200) {
          let cut = rest.lastIndexOf(' ', 1200);
          if (cut < 800) cut = 1200;
          out.push(rest.slice(0, cut));
          rest = rest.slice(cut).trimStart();
        }
        if (rest) out.push(rest);
        return out;
      });
      y = clauses(ctx, y, blocs.map((b) => ({ title: '', body: b })));
    }
  }

  // Mentions
  if (y + 30 > BOTTOM_LIMIT) y = newPage(ctx);
  doc.fontSize(7).font('Helvetica').fillColor(C.faint)
     .text('Montants exprimés en dinars tunisiens (DT). Prix saisis hors taxes — TVA appliquée ligne à ligne sur le net après remise. Facture générée et émise électroniquement via la plateforme LabFlow, valable sans signature ni cachet.',
       ML, y, { width: CW, lineGap: 2 });

  stampFooters(ctx, `Facture ${data.numero}`,
    'Facture de vente — émise électroniquement via la plateforme LabFlow',
    [
      vendeur.nom || 'Vendeur',
      vendeur.matricule && `${libellesMatricule(vendeur.autoEntrepreneur)[1]} ${vendeur.matricule}`,
      [vendeur.adresse, vendeur.ville].filter(Boolean).join(', '),
    ].filter(Boolean).join('  ·  '));
  return finish(ctx, outPath);
}

// ══════════════════════════════════════════════════════════════════════════════
// FACTURE D'APPROVISIONNEMENT (récapitulatif d'un appro fournisseur — pages
// « Factures » activités et labo). Même charte que la facture acheteur :
// émetteur = le FOURNISSEUR, facturé à = l'entreprise du client.
// data : { refFacture, dateFacture, contexte, typeSource,
//          fournisseur:{nom,adresse,tel}, entreprise:{nom,adresse,tel,email},
//          lignes:[{designation,unite,quantite,prixHt,tauxTva}],
//          montantHt, montantTva, montantTtc, notes, libelles? }
// ══════════════════════════════════════════════════════════════════════════════
// Libellés (lot 2b, spec §8.3) : le serveur les passe dans data.libelles, rendus dans le vocabulaire du
// compte par src/services/factureApproPdf.js (libellesFactureAppro) ; ces valeurs par défaut (ligne de
// commande, appel sans libellés) sont les textes d'avant le lot. Texte toujours sûr pour la police (pdfTexte).
const LIBELLES_FACTURE_APPRO = {
  sujet: "Facture d'approvisionnement",
  surtitre: 'FACTURE D\'APPROVISIONNEMENT',
  titre: 'Facture d\'approvisionnement',
  sousTitreTransfert: 'Transfert labo → activité',
  approFournisseur: 'Approvisionnement fournisseur',
  fournisseur: 'fournisseur',
  partiesTitre: 'FOURNISSEUR ET CLIENT',
  partiesEmetteur: 'FOURNISSEUR',
  mentions: 'Montants exprimés en dinars tunisiens (DT), prix saisis hors taxes. Récapitulatif d\'approvisionnement généré électroniquement via la plateforme LabFlow à partir des lignes de stock saisies — il ne remplace pas la facture originale du fournisseur.',
  notePied: 'Facture d\'approvisionnement — générée via la plateforme LabFlow',
};
async function buildFactureAppro(outPath, data) {
  const dateStr = data.dateFacture
    ? new Date(data.dateFacture).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    : '—';
  const fmt = (n) => `${Number(n || 0).toFixed(3)} DT`;
  const fmtQty = (n) => {
    const x = Number(n || 0);
    return Number.isInteger(x) ? String(x) : x.toFixed(3).replace(/\.?0+$/, '');
  };
  const fo = data.fournisseur || {};
  const ent = data.entreprise || {};
  const L = { ...LIBELLES_FACTURE_APPRO, ...(data.libelles || {}) };
  const ctx = makeCtx({
    Title: `Facture ${data.refFacture}`,
    Author: fo.nom || 'Fournisseur',
    Subject: L.sujet,
    CreationDate: data.dateFacture ? new Date(data.dateFacture) : new Date(0),
  }, { pdfTexte: true });
  const { fill, hline, txt, doc, fitText } = ctx;
  const sousTitre = [
    data.typeSource === 'transfert' ? L.sousTitreTransfert : `${L.approFournisseur} — ${fo.nom || L.fournisseur}`,
    data.contexte,
  ].filter(Boolean).join('  ·  ');
  header(ctx, {
    eyebrow: L.surtitre,
    title: L.titre,
    subtitle: sousTitre,
    ref: data.refFacture, date: dateStr, dateLabel: 'Datée du',
  });
  let y = TOPY;

  y = section(ctx, y, L.partiesTitre);
  y = partiesBlock(ctx, y, {
    nom: ent.nom || 'Entreprise',
    email: ent.email || undefined,
    tel: ent.tel || undefined,
    adresse: ent.adresse || undefined,
  }, {
    labels: [L.partiesEmetteur, 'FACTURÉ À'], mention: false,
    emetteur: { nom: fo.nom || 'Fournisseur', adresse: fo.adresse, tel: fo.tel },
  });

  // Tableau des lignes : Désignation | Qté | PU HT | TVA | Total HT
  y = section(ctx, y, 'DÉTAIL DES LIGNES');
  const cQte = ML + 250, cPu = ML + 330, cTva = ML + 385, cTot = RX - 10;
  const thead = () => {
    fill(ML, y, CW, 22, C.indigoSoft); hline(y, '#dfe3ff'); hline(y + 22, '#dfe3ff');
    txt('Désignation', ML + 10, y + 7, 7, true, C.indigo, { characterSpacing: 0.5 });
    txt('Qté', ML, y + 7, 7, true, C.indigo, { align: 'right', width: cQte - ML });
    txt('PU HT', ML, y + 7, 7, true, C.indigo, { align: 'right', width: cPu - ML });
    txt('TVA', ML, y + 7, 7, true, C.indigo, { align: 'right', width: cTva - ML });
    txt('Total HT', ML, y + 7, 7, true, C.indigo, { align: 'right', width: cTot - ML });
    y += 22;
  };
  thead();
  (data.lignes || []).forEach((l, i) => {
    if (y + 24 > BOTTOM_LIMIT) { y = newPage(ctx); thead(); }
    const totalLigne = Number(l.prixHt || 0) * Number(l.quantite || 0);
    fill(ML, y, CW, 24, i % 2 === 0 ? '#fcfcff' : C.white); hline(y + 24, C.hairSoft);
    txt(fitText(String(l.designation ?? ''), 8.5, cQte - ML - 65), ML + 10, y + 8, 8.5, false, C.ink);
    txt(`${fmtQty(l.quantite)}${l.unite ? ` ${l.unite}` : ''}`, ML, y + 8, 8.5, false, C.body, { align: 'right', width: cQte - ML });
    txt(fmt(l.prixHt), ML, y + 8, 8.5, false, C.body, { align: 'right', width: cPu - ML });
    txt(`${Number(l.tauxTva || 0).toFixed(0)} %`, ML, y + 8, 8.5, false, C.body, { align: 'right', width: cTva - ML });
    txt(fmt(totalLigne), ML, y + 8, 8.5, true, C.ink, { align: 'right', width: cTot - ML });
    y += 24;
  });
  y += 12;

  // Totaux — bandes pleine largeur, même langage visuel que les autres factures
  const totalRow = (label, value, opts = {}) => {
    if (y + 26 > BOTTOM_LIMIT) y = newPage(ctx);
    fill(ML, y, CW, 26, opts.bg || C.panel); hline(y, opts.line || C.hair); hline(y + 26, opts.line || C.hair);
    txt(label, ML + 10, y + 9, 8.5, false, opts.color || C.body);
    txt(value, ML, y + 8, 9.5, true, opts.valueColor || C.ink, { align: 'right', width: CW - 12 });
    y += 26;
  };
  totalRow('Total HT', fmt(data.montantHt));
  totalRow('TVA', fmt(data.montantTva), { bg: C.panel2 });

  if (y + 48 > BOTTOM_LIMIT) y = newPage(ctx);
  const th = 36;
  fill(ML, y, CW, th, '#eef2ff'); hline(y, '#c7d2fe'); hline(y + th, C.indigo);
  ctx.gradientRule(ML, y, 3, th);
  txt('TOTAL TTC', ML + 12, y + 12, 9.5, true, C.indigo, { characterSpacing: 0.6 });
  txt(fmt(data.montantTtc), ML, y + 10, 13, true, C.indigo, { align: 'right', width: CW - 12 });
  y += th + 12;

  if (data.notes && String(data.notes).trim()) {
    const notesText = String(data.notes).trim();
    const hNotes = ctx.measure(notesText, CW - 24, 8.5) + 22;
    if (y + 19 + hNotes > BOTTOM_LIMIT) y = newPage(ctx);
    y = section(ctx, y, 'NOTES');
    y = calloutBox(ctx, y, notesText, 'neutral');
  }

  // Mentions
  if (y + 30 > BOTTOM_LIMIT) y = newPage(ctx);
  doc.fontSize(7).font('Helvetica').fillColor(C.faint)
     .text(L.mentions,
       ML, y, { width: CW, lineGap: 2 });

  stampFooters(ctx, `Facture ${data.refFacture}`,
    L.notePied,
    [fo.nom || 'Fournisseur', fo.adresse].filter(Boolean).join('  ·  '));
  return finish(ctx, outPath);
}

// ══════════════════════════════════════════════════════════════════════════════
// Données d'exemple (APERÇU) + génération
// ══════════════════════════════════════════════════════════════════════════════
const SAMPLE = {
  facture: {
    numero: 'LF-2026-00123', dateFacture: '2026-06-27', periodeLabel: 'juin 2026',
    clientNom: 'Restaurant Le Carthage', clientEmail: 'gerant@lecarthage.tn',
    montantHt: 319.328, montantTva: 60.672, montantTtc: 380, tvaRate: 19,
  },
  factureAcheteur: {
    numero: 'FA-2026-0042', dateFacture: '2026-07-10',
    vendeur: { nom: 'Restaurant Le Carthage', adresse: 'Rue de Marseille, 1000 Tunis', tel: '+216 22 345 678', email: 'gerant@lecarthage.tn' },
    acheteur: { nom: 'Sami Trabelsi', entreprise: 'Épicerie du Lac', adresse: 'Les Berges du Lac, Tunis', mf: '1122334/C/M/000', tel: '+216 55 111 222', email: 'contact@epiceriedulac.tn' },
    lignes: [
      { designation: 'Farine pâtissière T45', quantite: 25, prixHt: 2.4, tauxTva: 7 },
      { designation: 'Beurre doux plaquette 250 g', quantite: 40, prixHt: 5.85, tauxTva: 7 },
      { designation: 'Tarte au citron meringuée (pièce)', quantite: 12, prixHt: 14.5, tauxTva: 19 },
    ],
    remisePct: 5, montantHt: 442.65, montantTva: 55.353, timbreFiscal: true, montantTimbre: 1,
    montantTtc: 499.003, notes: 'Livraison chaque mardi avant 9h — bon de commande n° BC-118.',
  },
};

// CLI uniquement — ce module est aussi requis par le backend et ne doit alors RIEN générer au chargement.
//   node docuseal-templates/generate.js   → aperçus (valeurs d'exemple)
if (require.main === module) {
  (async () => {
    const dir = __dirname;
    await buildFacture(path.join(dir, 'facture-labflow.pdf'), SAMPLE.facture);
    await buildFactureAcheteur(path.join(dir, 'facture-acheteur-labflow.pdf'), SAMPLE.factureAcheteur);
    console.log('✅ Documents générés (aperçu avec valeurs d\'exemple) :');
    console.log('   -', path.join(dir, 'facture-labflow.pdf'));
    console.log('   -', path.join(dir, 'facture-acheteur-labflow.pdf'));
  })();
}

module.exports = { buildFacture, buildFactureAcheteur, buildFactureAppro, PRESTATAIRE, LIBELLES_FACTURE_APPRO, pdfTexte, pdfTexteSur };
