// LabFlow Compta, étape S7a « Lettrage, échéancier, relevés » (labflow-reprise/achats-compta/PLAN-S7.md §3 point 7 : le
// journal général de S6b — periodes.js, pdfkit, texte sûr, pages numérotées — sert de modèle aux relevés, relances et, en
// S7b, aux certificats). Les outils d'un document A4 à la charte : texte rendu sûr pour les polices standard (Helvetica :
// Windows-1252 seulement, `sur` de periodes.js), blocs, tableaux à hauteur de rangée calculée, sauts de page qui redessinent
// l'en-tête du tableau, pieds de page numérotés « Page i / N ». Le document est construit entier en mémoire (bufferPages)
// avant d'être envoyé : jamais un PDF tronqué par une erreur en cours de route.
const { sur } = require('./periodes');

const PAGE = { w: 595.28, h: 841.89 };
const MARGE = 36;
const LARGEUR = PAGE.w - 2 * MARGE;
const BAS = PAGE.h - MARGE - 22;
const COULEURS = { gris: '#475569', noir: '#0f172a', indigo: '#312e81', filet: '#cbd5e1', fond: '#eef2ff', bande: '#f8fafc', alerte: '#b91c1c' };

// Un document : → { doc, y (get/set), texte, hauteur, filet, rangee, hauteurRangee, assurer, finir(pied) } ; `finir` pose
// les pieds de page et rend le Buffer (Promise). `suite` : le titre répété en haut des pages suivantes.
const creerDocument = ({ titre, suite }) => {
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margins: { top: MARGE, bottom: MARGE, left: MARGE, right: MARGE }, bufferPages: true, autoFirstPage: true, info: { Title: sur(titre), Author: 'LabFlow Compta' } });
  const morceaux = [];
  const fin = new Promise((resolve, reject) => {
    doc.on('data', (c) => morceaux.push(c));
    doc.on('end', () => resolve(Buffer.concat(morceaux)));
    doc.on('error', reject);
  });
  const p = { doc, y: MARGE };
  // `hauteurMax` : borne du bloc (pdfkit ajouterait sinon une page dès qu'un texte à largeur dépasse la marge du bas).
  p.texte = (t, x, yy, { taille = 8.5, gras = false, couleur = COULEURS.noir, largeur, aligner = 'left', italique = false, hauteurMax } = {}) => {
    doc.fontSize(taille).font(gras ? 'Helvetica-Bold' : italique ? 'Helvetica-Oblique' : 'Helvetica').fillColor(couleur).text(sur(t), x, yy, { width: largeur, align: aligner, lineBreak: !!largeur, ...(hauteurMax ? { height: hauteurMax } : {}) });
  };
  p.hauteur = (t, largeur, taille = 8.5, gras = false) => doc.fontSize(taille).font(gras ? 'Helvetica-Bold' : 'Helvetica').heightOfString(sur(t) || ' ', { width: largeur });
  p.filet = (yy, couleur = COULEURS.filet) => doc.moveTo(MARGE, yy).lineTo(MARGE + LARGEUR, yy).lineWidth(0.5).strokeColor(couleur).stroke();
  p.hauteurRangee = (cellules, colonnes, taille = 8.5, gras = false) => Math.max(...cellules.map((c, i) => p.hauteur(c.t, colonnes[i] - 6, taille, gras || !!c.gras))) + 4;
  // Les cellules d'une rangée de tableau (hauteur = la plus haute) ; `fond` : bande colorée.
  p.rangee = (cellules, colonnes, { taille = 8.5, gras = false, fond = null, couleur = COULEURS.noir } = {}) => {
    const h = p.hauteurRangee(cellules, colonnes, taille, gras);
    if (fond) doc.rect(MARGE, p.y, LARGEUR, h).fillColor(fond).fill();
    let x = MARGE;
    cellules.forEach((c, i) => {
      p.texte(c.t, x + 3, p.y + 2, { taille, gras: gras || !!c.gras, couleur: c.couleur || couleur, largeur: colonnes[i] - 6, aligner: c.aligner || 'left' });
      x += colonnes[i];
    });
    p.y += h;
    return h;
  };
  // Saut de page avant un bloc de hauteur `h` ; `enTete` (fonction) est redessiné sur la page neuve. → vrai si une page a
  // été ajoutée (toute table passe par ici, jamais par le saut automatique de pdfkit).
  p.assurer = (h, enTete = null) => {
    if (p.y + h <= BAS) return false;
    doc.addPage();
    p.y = MARGE;
    p.texte(`${suite} (suite)`, MARGE, p.y, { taille: 8, couleur: COULEURS.gris });
    p.y += 14;
    if (enTete) enTete();
    return true;
  };
  // Un paragraphe sur toute la largeur (sauts de page compris : par lignes).
  p.paragraphe = (t, { taille = 9.5, gras = false, couleur = COULEURS.noir, apres = 4 } = {}) => {
    const h = p.hauteur(t || ' ', LARGEUR, taille, gras);
    p.assurer(h);
    p.texte(t || ' ', MARGE, p.y, { taille, gras, couleur, largeur: LARGEUR });
    p.y += h + apres;
  };
  // Les pieds de page (texte à gauche, « Page i / N » à droite), puis la fin du document. → Promise<Buffer>.
  p.finir = (pied) => {
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i += 1) {
      doc.switchToPage(pages.start + i);
      const yy = PAGE.h - MARGE + 4;
      doc.moveTo(MARGE, yy - 4).lineTo(MARGE + LARGEUR, yy - 4).lineWidth(0.5).strokeColor(COULEURS.filet).stroke();
      p.texte(pied, MARGE, yy, { taille: 7, couleur: COULEURS.gris, largeur: LARGEUR - 90, hauteurMax: 12 });
      p.texte(`Page ${i + 1} / ${pages.count}`, MARGE + LARGEUR - 90, yy, { taille: 7, couleur: COULEURS.gris, largeur: 90, aligner: 'right', hauteurMax: 12 });
    }
    doc.end();
    return fin;
  };
  return p;
};
// L'envoi d'un PDF construit (nom de fichier sans accent ni caractère spécial).
const nomPdf = (prefixe, nom, suffixe) => `${prefixe}-${String(nom || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'dossier'}${suffixe ? `-${suffixe}` : ''}.pdf`;
const envoyerPdf = (res, pdf, nom) => {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
  res.setHeader('Content-Length', String(pdf.length));
  res.send(pdf);
};

module.exports = { PAGE, MARGE, LARGEUR, BAS, COULEURS, creerDocument, nomPdf, envoyerPdf };
