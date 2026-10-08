// LabFlow Compta, étape S6b « La validation et les périodes » (labflow-reprise/achats-compta/PLAN-S6.md §1 ligne S6b, §2,
// §4 ; réponses du client du 08/10 — réponse 5 : clôture par le titulaire ou Complet quand tout est validé, réouverture
// par le titulaire seul, journalisée, tant que l'exercice est ouvert ; CADRAGE §4 : clôture des périodes et
// centralisation des journaux auxiliaires dans le journal général (NC 01 §45, §57 à §61), journal général imprimable,
// coté et paraphé, pages numérotées (§47, §48), piste d'audit). Les périodes de l'exercice ouvert d'un dossier : la page
// (état, écritures en brouillard et validées, clôtures et réouvertures), la centralisation d'une période (totaux par
// journal des écritures validées), clore, rouvrir, et le journal général d'une période en PDF. Routes (D3) :
// /api/compta/dossiers/:dossierId/periodes… ; lecture pour tout accès au dossier ; clore et rouvrir dans la transaction
// verrouillée du dossier (validation.js : ecritureValidation, droit « configurer » ou « archiver », dossier non archivé).
const pool = require('../config/database');
const { journaliser } = require('./journal');
const { modeTitulaire, etatAbonnement } = require('./garde');
const { erreur, repondreErreur } = require('./comptablesClient');
const { droits } = require('./dossiers');
const { lectureDossier, presenterDossier } = require('./planComptes');
const { SQL_LIGNES, fmtDate, fmtMillimes, millimesDe, texteMillimes, resumeEcritures } = require('./ecritures');
const { ecritureValidation, periodeDuDossier, libellePeriode, exigerExerciceOuvert } = require('./validation');

// ── Lectures ────────────────────────────────────────────────────────────────────────────────────────────────────────
// Les périodes d'un exercice ($1) — ou l'une d'elles ($3, NULL = toutes — avec, pour chacune, ses écritures en brouillard et
// validées et le total des validées ($2 : le dossier, pour l'index (dossier_id, etat)), qui l'a close ou rouverte et quand.
const SQL_PERIODES = `
  SELECT p.id, p.debut::text AS debut, p.fin::text AS fin, p.etat, p.clos_le, cu.nom AS clos_par_nom, p.rouvert_le, ru.nom AS rouvert_par_nom,
         COALESCE(c.nb_brouillard, 0) AS nb_brouillard, COALESCE(c.nb_validees, 0) AS nb_validees, COALESCE(c.total_validees, 0)::numeric(18,3)::text AS total_validees
    FROM compta.periodes p
    LEFT JOIN utilisateurs cu ON cu.id = p.clos_par
    LEFT JOIN utilisateurs ru ON ru.id = p.rouvert_par
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE e.etat = 'brouillard')::int AS nb_brouillard, COUNT(*) FILTER (WHERE e.etat = 'validee')::int AS nb_validees,
             SUM(e.total_debit) FILTER (WHERE e.etat = 'validee') AS total_validees
        FROM compta.ecritures e WHERE e.dossier_id = $2 AND e.periode_id = p.id
    ) c ON true
   WHERE p.exercice_id = $1 AND ($3::int IS NULL OR p.id = $3)
   ORDER BY p.debut`;
const presenterPeriode = (p) => ({
  id: p.id, debut: p.debut, fin: p.fin, etat: p.etat, nbBrouillard: p.nb_brouillard, nbValidees: p.nb_validees, totalValidees: p.total_validees,
  closPar: p.clos_par_nom || null, closLe: p.clos_le, rouvertPar: p.rouvert_par_nom || null, rouvertLe: p.rouvert_le,
});
// L'état de la page : le dossier, les droits, l'exercice en cours (l'ouvert, sinon le plus récent) et ses périodes, tous
// les exercices, les comptes rendus, l'abonnement.
const etatPeriodes = async (db, acces, d) => {
  const [ex, nb, mode] = await Promise.all([
    db.query('SELECT id, debut::text AS debut, fin::text AS fin, etat FROM compta.exercices WHERE dossier_id = $1 ORDER BY debut DESC', [d.id]),
    resumeEcritures(db, d.id),
    modeTitulaire(db, acces.espace_id),
  ]);
  const courant = ex.rows.find((x) => x.etat === 'ouvert') || ex.rows[0] || null;
  const periodes = courant ? (await db.query(SQL_PERIODES, [courant.id, d.id, null])).rows.map(presenterPeriode) : [];
  return {
    dossier: presenterDossier(acces, d),
    droits: droits(acces),
    exercice: courant ? { id: courant.id, debut: courant.debut, fin: courant.fin, etat: courant.etat, periodes } : null,
    exercices: ex.rows,
    nb,
    etatAbonnement: etatAbonnement(mode),
  };
};
// La centralisation d'une période (NC 01 §45) : pour chaque journal, le nombre d'écritures validées et leurs totaux ;
// les totaux généraux en millimes entiers (jamais de flottant) ; le nombre d'écritures en brouillard, non comprises.
const SQL_CENTRALISATION = `
  SELECT j.id, j.code, j.libelle, j.type, COUNT(DISTINCT e.id)::int AS nb_ecritures, COALESCE(SUM(l.debit), 0)::text AS debit, COALESCE(SUM(l.credit), 0)::text AS credit
    FROM compta.ecritures e
    JOIN compta.journaux j ON j.id = e.journal_id
    JOIN compta.lignes l ON l.ecriture_id = e.id
   WHERE e.dossier_id = $1 AND e.periode_id = $2 AND e.etat = 'validee'
   GROUP BY j.id
   ORDER BY j.id`;
const centralisationDe = async (db, dossierId, periodeId) => {
  const [c, b] = await Promise.all([
    db.query(SQL_CENTRALISATION, [dossierId, periodeId]),
    db.query(`SELECT COUNT(*)::int AS n FROM compta.ecritures WHERE dossier_id = $1 AND periode_id = $2 AND etat = 'brouillard'`, [dossierId, periodeId]),
  ]);
  let debit = 0n;
  let credit = 0n;
  for (const j of c.rows) {
    debit += millimesDe(j.debit);
    credit += millimesDe(j.credit);
  }
  return {
    journaux: c.rows.map((j) => ({ id: j.id, code: j.code, libelle: j.libelle, type: j.type, nbEcritures: j.nb_ecritures, debit: j.debit, credit: j.credit })),
    totaux: { debit: texteMillimes(debit), credit: texteMillimes(credit), nbEcritures: c.rows.reduce((n, j) => n + j.nb_ecritures, 0) },
    nbBrouillard: b.rows[0].n,
  };
};

// GET /api/compta/dossiers/:dossierId/periodes — la page (lecture : tout niveau).
const lire = async (req, res) => {
  try {
    const { acces, d } = await lectureDossier(req.user, req.params.dossierId);
    res.json(await etatPeriodes(pool, acces, d));
  } catch (err) {
    repondreErreur(res, err, '[compta.periodes.lire]');
  }
};

// GET /api/compta/dossiers/:dossierId/periodes/:periodeId — une période et sa centralisation (lecture : tout niveau).
const une = async (req, res) => {
  try {
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    const p = await periodeDuDossier(pool, d.id, req.params.periodeId);
    const periode = (await pool.query(SQL_PERIODES, [p.exercice_id, d.id, p.id])).rows[0];
    res.json({ periode: presenterPeriode(periode), ...(await centralisationDe(pool, d.id, p.id)) });
  } catch (err) {
    repondreErreur(res, err, '[compta.periodes.une]');
  }
};

// POST /api/compta/dossiers/:dossierId/periodes/:periodeId/clore — période ouverte d'un exercice ouvert, sans écriture en
// brouillard (sinon 409 avec le nombre) ; qui et quand ; journal D16 `periode_close`. → la page.
const clore = async (req, res) => {
  try {
    const etat = await ecritureValidation(req, async (db, acces, d) => {
      const p = await periodeDuDossier(db, d.id, req.params.periodeId);
      exigerExerciceOuvert(p);
      if (p.etat === 'close') throw erreur(409, `La période ${libellePeriode(p)} est déjà close`, 'DEJA_FAIT');
      const c = (await db.query(`SELECT COUNT(*) FILTER (WHERE etat = 'brouillard')::int AS brouillard, COUNT(*) FILTER (WHERE etat = 'validee')::int AS validees FROM compta.ecritures WHERE dossier_id = $1 AND periode_id = $2`, [d.id, p.id])).rows[0];
      if (c.brouillard > 0) throw erreur(409, `${c.brouillard} écriture${c.brouillard > 1 ? 's' : ''} en brouillard dans la période ${libellePeriode(p)} : validez-les (ou supprimez-les) avant de clore`, 'BROUILLARD_RESTANT');
      await db.query(`UPDATE compta.periodes SET etat = 'close', clos_par = $2, clos_le = NOW(), rouvert_par = NULL, rouvert_le = NULL WHERE id = $1`, [p.id, req.user.id]);
      await journaliser(db, acces.espace_id, req.user.id, 'periode_close', { dossier: d.id, periode: p.id, debut: p.debut, fin: p.fin, nbEcritures: c.validees });
      return etatPeriodes(db, acces, d);
    });
    res.json(etat);
  } catch (err) {
    repondreErreur(res, err, '[compta.periodes.clore]');
  }
};

// POST /api/compta/dossiers/:dossierId/periodes/:periodeId/rouvrir — titulaire seul (réponse 5 du 08/10), période close
// d'un exercice ouvert ; la clôture reste connue (clos_par, clos_le), la réouverture s'y ajoute ; journal D16
// `periode_rouverte`. → la page.
const rouvrir = async (req, res) => {
  try {
    const etat = await ecritureValidation(req, async (db, acces, d) => {
      const p = await periodeDuDossier(db, d.id, req.params.periodeId);
      exigerExerciceOuvert(p);
      if (p.etat !== 'close') throw erreur(409, `La période ${libellePeriode(p)} n'est pas close`, 'DEJA_FAIT');
      await db.query(`UPDATE compta.periodes SET etat = 'ouverte', rouvert_par = $2, rouvert_le = NOW() WHERE id = $1`, [p.id, req.user.id]);
      await journaliser(db, acces.espace_id, req.user.id, 'periode_rouverte', { dossier: d.id, periode: p.id, debut: p.debut, fin: p.fin, closeLe: p.clos_le, closePar: p.clos_par });
      return etatPeriodes(db, acces, d);
    }, 'archiver');
    res.json(etat);
  } catch (err) {
    repondreErreur(res, err, '[compta.periodes.rouvrir]');
  }
};

// ── Journal général d'une période (PDF, NC 01 §45, §47, §48) ────────────────────────────────────────────────────────
// Les polices standard de pdfkit (Helvetica) n'écrivent que Windows-1252 : les libellés comptables sont déjà latins
// (HORS_W1252 à la saisie), le nom du dossier et les noms de personnes sont rendus sûrs ici (« ? » pour le reste).
const HORS_POLICE = /[^\t\n\r\x20-\xFF\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178]/gu;
const sur = (t) => String(t == null ? '' : t).replace(/[\u00a0\u202f\u2007\u2009]/g, ' ').replace(HORS_POLICE, '?');
const PAGE = { w: 595.28, h: 841.89 };
const MARGE = 36;
const LARGEUR = PAGE.w - 2 * MARGE;
const BAS = PAGE.h - MARGE - 22;
const GRIS = '#475569';
const NOIR = '#0f172a';
const INDIGO = '#312e81';
const FILET = '#cbd5e1';
const FOND = '#eef2ff';
const fmt = (texteNumeric) => fmtMillimes(millimesDe(texteNumeric));
const libelleMois = (debut) => new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${debut}T00:00:00Z`));
const horodatage = (d = new Date()) => new Intl.DateTimeFormat('fr-FR', { timeZone: 'Africa/Tunis', dateStyle: 'long', timeStyle: 'short' }).format(d);
// Colonnes des écritures (compte, tiers, libellé, débit, crédit) et de la centralisation (journal, écritures, débit, crédit).
const COL_LIGNES = [170, 64, 149, 70, 70];
const COL_CENTRAL = [243, 70, 105, 105];
// Le document : en-tête (dossier, période, édition), centralisation des journaux auxiliaires, écritures validées dans
// l'ordre chronologique avec leurs lignes, totaux, pages numérotées « Page i / N » (bufferPages). → Buffer.
const construireJournalGeneral = ({ dossier, periode, exercice, ecritures, lignesPar, centralisation }) => new Promise((resolve, reject) => {
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({ size: 'A4', margins: { top: MARGE, bottom: MARGE, left: MARGE, right: MARGE }, bufferPages: true, autoFirstPage: true, info: { Title: `Journal général ${libelleMois(periode.debut)} - ${sur(dossier.nom)}`, Author: 'LabFlow Compta' } });
  const morceaux = [];
  doc.on('data', (c) => morceaux.push(c));
  doc.on('end', () => resolve(Buffer.concat(morceaux)));
  doc.on('error', reject);
  let y = MARGE;
  // `hauteurMax` : borne du bloc (pdfkit ajouterait sinon une page dès qu'un texte à largeur dépasse la marge du bas —
  // c'est le cas des pieds de page, écrits dans la marge).
  const texte = (t, x, yy, { taille = 8.5, gras = false, couleur = NOIR, largeur, aligner = 'left', italique = false, hauteurMax } = {}) => {
    doc.fontSize(taille).font(gras ? 'Helvetica-Bold' : italique ? 'Helvetica-Oblique' : 'Helvetica').fillColor(couleur).text(sur(t), x, yy, { width: largeur, align: aligner, lineBreak: !!largeur, ...(hauteurMax ? { height: hauteurMax } : {}) });
  };
  const hauteur = (t, largeur, taille = 8.5, gras = false) => doc.fontSize(taille).font(gras ? 'Helvetica-Bold' : 'Helvetica').heightOfString(sur(t) || ' ', { width: largeur });
  const filet = (yy, couleur = FILET) => doc.moveTo(MARGE, yy).lineTo(MARGE + LARGEUR, yy).lineWidth(0.5).strokeColor(couleur).stroke();
  // Les cellules d'une ligne de tableau (hauteur = la plus haute) ; `fond` : bande colorée.
  const rangee = (cellules, colonnes, { taille = 8.5, gras = false, fond = null, couleur = NOIR, hautMin = 0 } = {}) => {
    const h = Math.max(hautMin, ...cellules.map((c, i) => hauteur(c.t, colonnes[i] - 6, taille, gras || !!c.gras))) + 4;
    if (fond) doc.rect(MARGE, y, LARGEUR, h).fillColor(fond).fill();
    let x = MARGE;
    cellules.forEach((c, i) => {
      texte(c.t, x + 3, y + 2, { taille, gras: gras || !!c.gras, couleur: c.couleur || couleur, largeur: colonnes[i] - 6, aligner: c.aligner || 'left' });
      x += colonnes[i];
    });
    y += h;
    return h;
  };
  const enTeteLignes = () => {
    rangee([{ t: 'Compte' }, { t: 'Tiers' }, { t: 'Libellé' }, { t: 'Débit', aligner: 'right' }, { t: 'Crédit', aligner: 'right' }], COL_LIGNES, { taille: 7.5, gras: true, couleur: GRIS });
    filet(y);
  };
  const enTeteCentral = () => {
    rangee([{ t: 'Journal' }, { t: 'Écritures', aligner: 'right' }, { t: 'Débit', aligner: 'right' }, { t: 'Crédit', aligner: 'right' }], COL_CENTRAL, { taille: 7.5, gras: true, couleur: GRIS });
    filet(y);
  };
  // Saut de page avant un bloc de hauteur `h` ; `enTete` (fonction) est redessiné sur la page neuve. → vrai si une page a été
  // ajoutée (relecture de S6b : toute table passe par ici, jamais par le saut automatique de pdfkit).
  const assurer = (h, enTete = enTeteLignes) => {
    if (y + h <= BAS) return false;
    doc.addPage();
    y = MARGE;
    texte(`Journal général — ${libelleMois(periode.debut)} — ${dossier.nom} (suite)`, MARGE, y, { taille: 8, couleur: GRIS });
    y += 14;
    if (enTete) enTete();
    return true;
  };
  const hauteurRangee = (cellules, colonnes, taille = 8.5, gras = false) => Math.max(...cellules.map((c, i) => hauteur(c.t, colonnes[i] - 6, taille, gras || !!c.gras))) + 4;

  // En-tête.
  texte('JOURNAL GÉNÉRAL', MARGE, y, { taille: 16, gras: true, couleur: INDIGO });
  texte('LabFlow Compta', MARGE, y + 2, { taille: 9, couleur: GRIS, largeur: LARGEUR, aligner: 'right' });
  y += 22;
  texte(dossier.nom, MARGE, y, { taille: 12, gras: true, largeur: LARGEUR });
  y += hauteur(dossier.nom, LARGEUR, 12, true) + 2;
  const identite = [dossier.raison_sociale && dossier.raison_sociale !== dossier.nom ? dossier.raison_sociale : null, dossier.matricule_fiscal ? `Matricule fiscal ${dossier.matricule_fiscal}` : null, [dossier.adresse, dossier.ville].filter(Boolean).join(', ') || null].filter(Boolean).join(' · ');
  if (identite) {
    texte(identite, MARGE, y, { taille: 8.5, couleur: GRIS, largeur: LARGEUR });
    y += hauteur(identite, LARGEUR) + 2;
  }
  const etatPeriode = periode.etat === 'close'
    ? `Période close${periode.clos_le ? ` le ${horodatage(periode.clos_le)}` : ''}${periode.clos_par_nom ? ` par ${periode.clos_par_nom}` : ''}`
    : 'Période ouverte';
  const lignesEnTete = [
    `Période : ${libelleMois(periode.debut)} (${libellePeriode(periode)}) · Exercice du ${fmtDate(exercice.debut)} au ${fmtDate(exercice.fin)}`,
    `${etatPeriode} · Édité le ${horodatage()} (date de traitement) · Montants en dinars, trois décimales`,
    `${ecritures.length} écriture${ecritures.length > 1 ? 's' : ''} validée${ecritures.length > 1 ? 's' : ''}${centralisation.nbBrouillard ? ` · ${centralisation.nbBrouillard} en brouillard non comprise${centralisation.nbBrouillard > 1 ? 's' : ''}` : ''}`,
  ];
  for (const l of lignesEnTete) {
    texte(l, MARGE, y, { taille: 8.5, largeur: LARGEUR });
    y += hauteur(l, LARGEUR) + 1;
  }
  y += 6;
  filet(y, INDIGO);
  y += 8;

  // Centralisation des journaux auxiliaires (NC 01 §45).
  texte('Centralisation des journaux auxiliaires', MARGE, y, { taille: 10.5, gras: true, couleur: INDIGO });
  y += 16;
  enTeteCentral();
  for (const j of centralisation.journaux) {
    const cellules = [{ t: `${j.code} — ${j.libelle}` }, { t: String(j.nbEcritures), aligner: 'right' }, { t: fmt(j.debit), aligner: 'right' }, { t: fmt(j.credit), aligner: 'right' }];
    assurer(hauteurRangee(cellules, COL_CENTRAL), enTeteCentral);
    rangee(cellules, COL_CENTRAL);
  }
  if (!centralisation.journaux.length) rangee([{ t: 'Aucune écriture validée dans cette période', couleur: GRIS }, { t: '' }, { t: '' }, { t: '' }], COL_CENTRAL);
  assurer(20, enTeteCentral);
  filet(y);
  rangee([{ t: 'Total de la période' }, { t: String(centralisation.totaux.nbEcritures), aligner: 'right' }, { t: fmt(centralisation.totaux.debit), aligner: 'right' }, { t: fmt(centralisation.totaux.credit), aligner: 'right' }], COL_CENTRAL, { gras: true, fond: FOND });
  y += 14;

  // Les écritures, dans l'ordre chronologique, avec leurs lignes ; un titre d'écriture coupé par un saut de page est répété
  // « (suite) » pour que les lignes orphelines disent à quelle écriture elles appartiennent.
  assurer(40, null);
  texte('Écritures validées (ordre chronologique)', MARGE, y, { taille: 10.5, gras: true, couleur: INDIGO });
  y += 16;
  enTeteLignes();
  for (const e of ecritures) {
    const lignes = lignesPar.get(e.id) || [];
    const titre = `${e.numero}   ${fmtDate(e.date)}${e.date_reelle ? ` (opération du ${fmtDate(e.date_reelle)})` : ''}   ${e.journal_code}   Pièce ${e.reference}   ${e.libelle}${e.origine === 'contrepassation' ? '   [contre-passation]' : ''}`;
    const titrer = (suite) => {
      const t = suite ? `${titre}   (suite)` : titre;
      const hTitre = hauteur(t, LARGEUR - 6, 8.5, true) + 4;
      doc.rect(MARGE, y, LARGEUR, hTitre).fillColor('#f8fafc').fill();
      texte(t, MARGE + 3, y + 2, { taille: 8.5, gras: true, largeur: LARGEUR - 6 });
      y += hTitre;
    };
    assurer(hauteur(titre, LARGEUR - 6, 8.5, true) + 4 + 14);
    titrer(false);
    for (const l of lignes) {
      const cellules = [
        { t: `${l.compte_numero}  ${l.compte_libelle}` }, { t: l.tiers_code || '' }, { t: l.libelle || e.libelle },
        { t: millimesDe(l.debit) > 0n ? fmt(l.debit) : '', aligner: 'right' }, { t: millimesDe(l.credit) > 0n ? fmt(l.credit) : '', aligner: 'right' },
      ];
      if (assurer(hauteurRangee(cellules, COL_LIGNES))) titrer(true);
      rangee(cellules, COL_LIGNES);
    }
    filet(y);
  }
  y += 6;
  assurer(44, null);
  rangee([{ t: `Totaux de la période (${ecritures.length} écriture${ecritures.length > 1 ? 's' : ''} validée${ecritures.length > 1 ? 's' : ''})` }, { t: '' }, { t: '' }, { t: fmt(centralisation.totaux.debit), aligner: 'right' }, { t: fmt(centralisation.totaux.credit), aligner: 'right' }], COL_LIGNES, { gras: true, fond: FOND });
  y += 10;
  const arrete = centralisation.totaux.debit === centralisation.totaux.credit ? 'Total des débits égal au total des crédits (partie double, NC 01 §30).' : 'ATTENTION : total des débits différent du total des crédits.';
  assurer(14, null);
  texte(arrete, MARGE, y, { taille: 8, italique: true, couleur: GRIS, largeur: LARGEUR, hauteurMax: 14 });

  // Pieds de page : pages numérotées (NC 01 §47).
  const pages = doc.bufferedPageRange();
  for (let i = 0; i < pages.count; i += 1) {
    doc.switchToPage(pages.start + i);
    const yy = PAGE.h - MARGE + 4;
    doc.moveTo(MARGE, yy - 4).lineTo(MARGE + LARGEUR, yy - 4).lineWidth(0.5).strokeColor(FILET).stroke();
    texte(`LabFlow Compta · ${dossier.nom} · Journal général ${libelleMois(periode.debut)}`, MARGE, yy, { taille: 7, couleur: GRIS, largeur: LARGEUR - 90, hauteurMax: 12 });
    texte(`Page ${i + 1} / ${pages.count}`, MARGE + LARGEUR - 90, yy, { taille: 7, couleur: GRIS, largeur: 90, aligner: 'right', hauteurMax: 12 });
  }
  doc.end();
});

// GET /api/compta/dossiers/:dossierId/periodes/:periodeId/journal-general.pdf — le journal général de la période : les
// écritures VALIDÉES (les brouillards n'y figurent pas, leur nombre est dit), lignes comprises, et la centralisation. Lecture :
// tout niveau. Le document est construit entier avant d'être envoyé (jamais un PDF tronqué par une erreur en cours de route).
const journalGeneral = async (req, res) => {
  try {
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    const p = await periodeDuDossier(pool, d.id, req.params.periodeId);
    const periode = (await pool.query(SQL_PERIODES, [p.exercice_id, d.id, p.id])).rows[0];
    const ecritures = (await pool.query(
      `SELECT e.id, e.numero, e.date::text AS date, e.date_reelle::text AS date_reelle, e.reference, e.libelle, e.total_debit::text AS total_debit, e.origine, j.code AS journal_code
         FROM compta.ecritures e JOIN compta.journaux j ON j.id = e.journal_id
        WHERE e.dossier_id = $1 AND e.periode_id = $2 AND e.etat = 'validee'
        ORDER BY e.date, e.numero, e.id`,
      [d.id, p.id]
    )).rows;
    const lignesPar = new Map(ecritures.map((e) => [e.id, []]));
    if (ecritures.length) for (const l of (await pool.query(SQL_LIGNES, [ecritures.map((e) => e.id)])).rows) lignesPar.get(l.ecriture_id).push(l);
    const centralisation = await centralisationDe(pool, d.id, p.id);
    const pdf = await construireJournalGeneral({ dossier: d, periode, exercice: { debut: p.exercice_debut, fin: p.exercice_fin }, ecritures, lignesPar, centralisation });
    const nom = `journal-general-${String(d.nom).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'dossier'}-${p.debut.slice(0, 7)}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${nom}"`);
    res.setHeader('Content-Length', String(pdf.length));
    res.send(pdf);
  } catch (err) {
    repondreErreur(res, err, '[compta.periodes.journalGeneral]');
  }
};

module.exports = {
  SQL_PERIODES, SQL_CENTRALISATION, presenterPeriode, centralisationDe, etatPeriodes, construireJournalGeneral, sur, libelleMois,
  lire, une, clore, rouvrir, journalGeneral,
};
