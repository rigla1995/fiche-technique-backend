// LabFlow Compta, étape E1 « Le bilan et l'état de résultat » (labflow-reprise/achats-compta/PLAN-ETATS-FINANCIERS.md §2
// ligne E1, §3 ; réponses du client du 14/10 — « ok pour les 5 ») et E2 « Les flux de trésorerie, les notes et le jeu
// complet » (§2 ligne E2). Les états financiers d'un exercice (NC 01, 1ʳᵉ partie, annexes 1, 3, 5 et 8), LUS à la demande
// sur les soldes et les mouvements des comptes — seul le texte libre des notes s'écrit :
//   • GET …/dossiers/:dossierId/etats?exercice=&brouillard=  — la page : exercices du dossier, exercice choisi (celui du
//     jour par défaut), bilan et état de résultat (colonnes N et N−1 : l'exercice précédent du dossier, calculé pareil),
//     comptes de chaque poste, état des flux de trésorerie (E2, méthode indirecte), soldes intermédiaires de gestion (E2),
//     notes (texte libre, E2), contrôles, mentions de la NC 01 (§19) ;
//   • GET …/dossiers/:dossierId/etats.pdf?exercice=&brouillard=&complet=  — le bilan et l'état de résultat en PDF A4 à la
//     charte, les mentions sur chaque page ; `complet=1` : le jeu complet (flux, notes : SIG, détail des postes, texte libre),
//     à transcrire au livre d'inventaire ;
//   • PUT …/dossiers/:dossierId/etats/:exerciceId/notes  — le texte libre des notes de l'exercice (titulaire ou Complet,
//     dossier non archivé ; migration 243) ; journal D16 `notes_exercice`.
// Soldes d'un exercice : ses lignes validées (brouillard compris sur demande : situation provisoire), à-nouveaux compris ;
// exercice CLOS : son écriture de détermination du résultat est exclue (les comptes de charges et de produits se lisent
// avant qu'elle ne les solde — PLAN-EXERCICES, choix de X2) ; exercice dont le précédent n'est pas clos : le report
// provisoire de X1 (livres.js) s'ajoute à l'ouverture, comme à la balance. Règles pures : etatsCalcul.js, fluxCalcul.js.
// Lecture : tout accès au dossier.
const pool = require('../config/database');
const { journaliser } = require('./journal');
const { modeTitulaire, etatAbonnement } = require('./garde');
const { erreur, idValide, repondreErreur } = require('./comptablesClient');
const { droits, dansEspaceDuDossier } = require('./dossiers');
const { lectureDossier, presenterDossier } = require('./planComptes');
const { etatsDe } = require('./paquets');
const X = require('./exercices');
const XC = require('./exercicesCalcul');
const { reportComptes, presenterReport } = require('./livres');
const { MARGE, LARGEUR, COULEURS, creerDocument, envoyerPdf, nomPdf } = require('./pdf');
const { jourTunis } = require('./importExcel');
const C = require('./etatsCalcul');
const F = require('./fluxCalcul');

const UNITE = 'Exprimé en dinars tunisiens, trois décimales';
const NOTES_MAX = 20000;
const MSG_NOTES = 'Seul le titulaire ou un gérant de niveau Complet peut rédiger les notes aux états financiers';

// ── Lectures ────────────────────────────────────────────────────────────────────────────────────────────────────────
const SQL_EXERCICES = `
  SELECT id, debut::text AS debut, fin::text AS fin, etat, millesime, clos_le, resultat::text AS resultat, ecriture_resultat_id
    FROM compta.exercices
   WHERE dossier_id = $1
   ORDER BY debut DESC`;
// Les mouvements d'un exercice par compte : solde d'ouverture (à-nouveaux : journal « an »), débits et crédits de l'exercice
// hors à-nouveaux ($3 brouillard compris ; $4 : l'écriture de résultat d'un exercice clos, exclue). Solde de fin = ouverture
// + débit − crédit.
const SQL_MOUVEMENTS = `
  SELECT k.id AS compte_id, k.numero, k.libelle, k.nature,
         COALESCE(SUM(l.debit - l.credit) FILTER (WHERE j.type = 'an'), 0)::numeric(18,3)::text AS ouverture,
         COALESCE(SUM(l.debit) FILTER (WHERE j.type <> 'an'), 0)::numeric(18,3)::text AS debit,
         COALESCE(SUM(l.credit) FILTER (WHERE j.type <> 'an'), 0)::numeric(18,3)::text AS credit
    FROM compta.lignes l
    JOIN compta.ecritures e ON e.id = l.ecriture_id
    JOIN compta.journaux j ON j.id = e.journal_id
    JOIN compta.comptes k ON k.id = l.compte_id
   WHERE l.dossier_id = $1 AND e.exercice_id = $2 AND ($3::boolean OR e.etat = 'validee') AND ($4::int IS NULL OR e.id <> $4)
   GROUP BY k.id
   ORDER BY k.numero`;
const SQL_BROUILLARD = `SELECT COUNT(*)::int AS nb FROM compta.ecritures WHERE dossier_id = $1 AND exercice_id = $2 AND etat = 'brouillard'`;
const SQL_NOTES = `SELECT n.texte, n.modifie_le, u.nom AS modifie_par_nom FROM compta.notes_exercice n LEFT JOIN utilisateurs u ON u.id = n.modifie_par WHERE n.exercice_id = $1`;

// La sélection : exercice (identifiant ; vide = celui du jour, sinon le plus récent des ouverts) et brouillard (« 1 » =
// compris ; validées seulement par défaut : un état financier se lit sur ce qui est validé).
const lireSelection = (query, exercices) => {
  if (!query || typeof query !== 'object') throw erreur(400, 'Paramètres invalides');
  let exercice;
  if (query.exercice === undefined || query.exercice === '') exercice = XC.exerciceParDefaut(exercices);
  else {
    if (!idValide(query.exercice)) throw erreur(404, 'Exercice introuvable');
    exercice = exercices.find((x) => x.id === Number(query.exercice));
    if (!exercice) throw erreur(404, 'Exercice introuvable');
  }
  if (!exercice) throw erreur(409, 'Aucun exercice dans ce dossier', 'EXERCICE_ABSENT');
  return { exercice, brouillard: query.brouillard === '1' || query.brouillard === 'true' };
};
// Les mouvements d'un exercice pour les états : ouverture (à-nouveaux, puis report provisoire de l'exercice précédent non
// clos — X1), débits et crédits hors à-nouveaux, écriture de résultat exclue ; les soldes de fin en découlent.
// → { mouvements, soldes, report }.
const mouvementsDe = async (db, d, x, brouillard) => {
  const lus = (await db.query(SQL_MOUVEMENTS, [d.id, x.id, brouillard, x.etat === 'clos' ? x.ecriture_resultat_id : null])).rows;
  const cartes = new Map(lus.map((r) => [r.compte_id, { compteId: r.compte_id, numero: r.numero, libelle: r.libelle, nature: r.nature, ouverture: C.versMillimes(r.ouverture), debit: C.versMillimes(r.debit), credit: C.versMillimes(r.credit) }]));
  const report = await reportComptes(db, d, { exercice: x, brouillard });
  if (report) {
    for (const [cle, r] of report.comptes) {
      const id = r.compte.id ?? cle;
      const existant = cartes.get(id);
      if (existant) existant.ouverture += r.solde;
      else cartes.set(id, { compteId: r.compte.id, numero: r.compte.numero, libelle: r.compte.libelle, nature: r.compte.nature, ouverture: r.solde, debit: 0n, credit: 0n });
    }
  }
  const mouvements = [...cartes.values()];
  return { mouvements, soldes: mouvements.map((m) => ({ compteId: m.compteId, numero: m.numero, libelle: m.libelle, nature: m.nature, solde: m.ouverture + m.debit - m.credit })), report };
};
const presenterExerciceCourt = (x) => (x ? { id: x.id, debut: x.debut, fin: x.fin, etat: x.etat, millesime: x.millesime } : null);
const presenterNotes = (n) => ({ texte: n ? n.texte : '', modifiePar: n ? n.modifie_par_nom || null : null, modifieLe: n ? n.modifie_le : null, longueurMax: NOTES_MAX });

// L'état complet d'un exercice : → { dossier, droits, etatAbonnement, exercices, exercice, precedent, selection, entete,
// brouillard, provisoire, bilan, resultat, flux, sig, notes, controles, pret, sansPoste }.
const etatsDuDossier = async (db, acces, d, query) => {
  const etats = etatsDe(d.pays);
  if (!etats) throw erreur(409, 'Pas de modèle d\'états financiers pour le pays de ce dossier', 'ETATS_ABSENTS');
  const exercices = (await db.query(SQL_EXERCICES, [d.id])).rows;
  const s = lireSelection(query, exercices);
  const x = s.exercice;
  const precedent = XC.precedentDe(exercices, x);
  const [n, n1, b, notes, mode] = await Promise.all([
    mouvementsDe(db, d, x, s.brouillard),
    precedent ? mouvementsDe(db, d, precedent, s.brouillard) : null,
    db.query(SQL_BROUILLARD, [d.id, x.id]),
    db.query(SQL_NOTES, [x.id]),
    modeTitulaire(db, acces.espace_id),
  ]);
  const clos = x.etat === 'clos';
  const millesimes = { millesime: x.millesime, millesimePrecedent: precedent ? precedent.millesime : null };
  const calc = C.calculerEtats(etats, { soldesN: n.soldes, soldesN1: n1 ? n1.soldes : null, resultatFige: clos ? C.versMillimes(x.resultat || '0') : null, ...millesimes });
  // E2 : les flux (si le paquet en a le modèle) ; leur contrôle s'ajoute à ceux du bilan et de l'état de résultat.
  const flux = etats.flux ? F.calculerFlux(etats.flux, { mouvementsN: n.mouvements, mouvementsN1: n1 ? n1.mouvements : null, resultat: calc.resultats, ...millesimes }) : null;
  const controles = flux ? [...calc.controles, flux.controle] : calc.controles;
  const provisoire = !clos || s.brouillard || !!n.report;
  return {
    dossier: presenterDossier(acces, d),
    droits: droits(acces),
    etatAbonnement: etatAbonnement(mode),
    exercices: exercices.map(presenterExerciceCourt),
    exercice: { ...presenterExerciceCourt(x), fini: x.fin < XC.aujourdhuiTunis(), clos: clos ? { le: x.clos_le, resultat: x.resultat } : null },
    precedent: presenterExerciceCourt(precedent),
    selection: { exercice: x.id, brouillard: s.brouillard },
    // NC 01 §19 : nom, identification, date d'arrêté, unité monétaire — sur chaque page.
    entete: {
      entreprise: d.raison_sociale || d.nom,
      nom: d.nom,
      matricule: d.matricule_fiscal || null,
      forme: d.forme_juridique || null,
      arrete: C.mentionArrete(x, { brouillard: s.brouillard, precedentOuvert: !!n.report }),
      provisoire,
      unite: UNITE,
      colonnes: { n: `Exercice ${x.millesime}`, n1: precedent ? `Exercice ${precedent.millesime}` : 'Premier exercice' },
    },
    brouillard: { nb: b.rows[0].nb, compris: s.brouillard },
    provisoire: { report: presenterReport(n.report) },
    bilan: calc.bilan,
    resultat: calc.resultat,
    flux: flux ? { lignes: flux.lignes, tresorerie: flux.tresorerie } : null,
    sig: calc.sig,
    notes: presenterNotes(notes.rows[0]),
    controles,
    pret: controles.every((c) => c.ok),
    sansPoste: calc.sansPoste,
  };
};

// ── PDF ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const COL = [LARGEUR - 220, 110, 110];
const montant = (v) => C.fmtEtat(C.versMillimes(v));
// Le bilan et l'état de résultat ; `complet` : puis l'état des flux de trésorerie et les notes (soldes intermédiaires de
// gestion, détail des postes, texte libre) — le jeu complet, pour le livre d'inventaire.
const construirePdf = (d, e, { complet = false } = {}) => {
  const entete = `${e.entete.entreprise}${e.entete.matricule ? ` · MF ${e.entete.matricule}` : ''} · ${e.entete.arrete} · ${e.entete.unite}`;
  const p = creerDocument({ titre: `États financiers ${e.exercice.millesime} - ${d.nom}`, suite: `États financiers ${e.exercice.millesime} — ${entete}` });
  const titre = (texte) => {
    p.texte(texte.toUpperCase(), MARGE, p.y, { taille: 14, gras: true, couleur: COULEURS.indigo });
    p.y += 20;
    p.paragraphe(`${e.entete.entreprise}${e.entete.forme ? ` (${e.entete.forme})` : ''}${e.entete.matricule ? ` — matricule fiscal ${e.entete.matricule}` : ''}`, { taille: 10, gras: true });
    p.paragraphe(`${e.entete.arrete} · ${e.entete.unite}${e.precedent ? ` · chiffres de l'exercice précédent (${e.precedent.millesime}) en seconde colonne` : ' · premier exercice : pas de chiffres de l\'exercice précédent'}`, { taille: 8.5, couleur: e.entete.provisoire ? COULEURS.alerte : COULEURS.gris });
    p.y += 4;
  };
  const nouvellePage = (texte) => { p.doc.addPage(); p.y = MARGE; titre(texte); };
  const enTete = () => { p.rangee([{ t: '' }, { t: e.entete.colonnes.n, aligner: 'right' }, { t: e.entete.colonnes.n1, aligner: 'right' }], COL, { taille: 8, gras: true, couleur: COULEURS.gris }); p.filet(p.y); };
  const rangee = (libelle, n, n1, { gras = false, fond = null, retrait = 0, italique = false, taille = 8.5 } = {}) => {
    const cellules = [{ t: `${' '.repeat(retrait)}${libelle}` }, { t: n == null ? '' : montant(n), aligner: 'right' }, { t: n1 == null ? '' : montant(n1), aligner: 'right' }];
    p.assurer(p.hauteurRangee(cellules, COL, taille, gras), enTete);
    p.rangee(cellules, COL, { taille, gras, fond, couleur: italique ? COULEURS.gris : COULEURS.noir });
  };
  // Des lignes à titres, lignes et totaux (état de résultat, flux, soldes intermédiaires) : le même tableau.
  const lignesTableau = (lignes, { final = null, calculs = ['total'] } = {}) => {
    enTete();
    for (const l of lignes) {
      if (l.titre) { rangee(l.titre, null, null, { gras: true }); continue; }
      if (l.calcul && calculs.includes(l.calcul)) { rangee(l.libelle, l.n, l.n1, { gras: true, fond: l.code === final ? COULEURS.fond : COULEURS.bande }); continue; }
      rangee(l.libelle, l.n, l.n1, { retrait: 4, gras: !!l.calcul, italique: l.calcul === 'tresorerieDebut' || l.calcul === 'tresorerieFin' });
    }
  };
  // Le bilan : un côté après l'autre.
  titre('Bilan');
  for (const [cote, libelle] of [['actifs', 'Actifs'], ['passifs', 'Capitaux propres et passifs']]) {
    const c = e.bilan[cote];
    p.assurer(30, null);
    rangee(libelle, null, null, { gras: true, taille: 10 });
    enTete();
    for (const g of c.groupes) {
      rangee(g.libelle, null, null, { gras: true });
      for (const r of g.rubriques) {
        if (r.libelle) rangee(r.libelle, null, null, { gras: true, retrait: 2 });
        for (const po of r.postes) {
          if (po.calcul === 'sousTotal') { rangee(po.libelle, po.n, po.n1, { gras: true, retrait: 2 }); continue; }
          rangee(po.libelle, po.n, po.n1, { retrait: 4, gras: po.calcul === 'resultat' });
          if (po.moins) {
            rangee(po.moins.libelle, `-${po.moins.n.replace('-', '')}`, `-${po.moins.n1.replace('-', '')}`, { retrait: 6, italique: true });
            rangee('', po.net.n, po.net.n1, { retrait: 4, gras: true });
          }
        }
        if (r.total) rangee(r.total.libelle, r.total.n, r.total.n1, { gras: true, retrait: 2, fond: COULEURS.bande });
      }
      if (g.total) rangee(g.total.libelle, g.total.n, g.total.n1, { gras: true, fond: COULEURS.bande });
    }
    p.filet(p.y);
    rangee(c.total.libelle, c.total.n, c.total.n1, { gras: true, fond: COULEURS.fond, taille: 9.5 });
    p.y += 10;
  }
  // L'état de résultat, sur une page neuve.
  nouvellePage('État de résultat');
  lignesTableau(e.resultat.lignes, { final: 'resultatNet' });
  if (complet && e.flux) {
    // E2 : l'état des flux de trésorerie (annexe 5, méthode indirecte).
    nouvellePage('État des flux de trésorerie');
    p.paragraphe('Méthode autorisée (indirecte) : du résultat net à la variation de trésorerie, puis les activités d\'investissement et de financement, d\'après les mouvements des comptes de l\'exercice. Trésorerie : ' + e.flux.tresorerie.libelle.toLowerCase() + '.', { taille: 8, couleur: COULEURS.gris });
    lignesTableau(e.flux.lignes, { final: 'variationTresorerie' });
  }
  if (complet) {
    // E2 : les notes — soldes intermédiaires de gestion, détail des postes, texte libre.
    nouvellePage('Notes aux états financiers');
    if (e.sig) {
      p.paragraphe('1. Soldes intermédiaires de gestion (NC 01, annexe 8)', { taille: 10.5, gras: true, couleur: COULEURS.indigo });
      lignesTableau(e.sig.lignes, { final: 'resultatNet' });
      p.y += 8;
    }
    p.paragraphe(`${e.sig ? '2' : '1'}. Détail des postes du bilan et de l'état de résultat (comptes du dossier)`, { taille: 10.5, gras: true, couleur: COULEURS.indigo });
    enTete();
    const comptes = (liste) => { for (const c of liste) rangee(`${c.numero} ${c.libelle}`, c.n, c.n1, { retrait: 6, taille: 8, italique: true }); };
    for (const cote of ['actifs', 'passifs']) for (const g of e.bilan[cote].groupes) for (const r of g.rubriques) for (const po of r.postes) {
      if (!po.comptes || !po.comptes.length) continue;
      rangee(po.libelle, po.n, po.n1, { retrait: 2, gras: true });
      comptes(po.comptes);
      if (po.moins && po.moins.comptes.length) { rangee(po.moins.libelle, `-${po.moins.n.replace('-', '')}`, `-${po.moins.n1.replace('-', '')}`, { retrait: 4, italique: true }); comptes(po.moins.comptes); }
    }
    for (const l of e.resultat.lignes) {
      if (!l.comptes || !l.comptes.length) continue;
      rangee(l.libelle, l.n, l.n1, { retrait: 2, gras: true });
      comptes(l.comptes);
    }
    p.y += 8;
    p.paragraphe(`${e.sig ? '3' : '2'}. Notes de l'entreprise${e.notes.modifieLe ? ` (rédigées le ${C.fmtJour(String(e.notes.modifieLe).slice(0, 10))}${e.notes.modifiePar ? ` par ${e.notes.modifiePar}` : ''})` : ''}`, { taille: 10.5, gras: true, couleur: COULEURS.indigo });
    if (e.notes.texte) for (const paragraphe of e.notes.texte.split(/\n+/)) p.paragraphe(paragraphe, { taille: 9 });
    else p.paragraphe('Aucune note rédigée pour cet exercice (méthodes comptables, faits marquants : page États financiers, bloc Notes).', { taille: 8.5, couleur: COULEURS.gris });
  }
  p.y += 10;
  for (const c of e.controles) p.paragraphe(`${c.ok ? 'Contrôle' : 'À VÉRIFIER'} — ${c.libelle} : ${c.detail}.`, { taille: 7.5, couleur: c.ok ? COULEURS.gris : COULEURS.alerte });
  if (e.brouillard.nb && !e.brouillard.compris) p.paragraphe(`${e.brouillard.nb} écriture${e.brouillard.nb > 1 ? 's' : ''} en brouillard non comprise${e.brouillard.nb > 1 ? 's' : ''} (écritures validées seulement).`, { taille: 7.5, couleur: COULEURS.gris });
  p.paragraphe(complet
    ? 'États financiers établis par LabFlow Compta selon la norme comptable générale NC 01 (annexes 1, 3, 5 et 8 ; présentation autorisée de l\'état de résultat, méthode indirecte des flux) à partir des écritures du dossier.'
    : 'États financiers établis par LabFlow Compta selon la norme comptable générale NC 01 (annexes 1 et 3, présentation autorisée de l\'état de résultat) à partir des écritures du dossier ; l\'état des flux de trésorerie et les notes forment le jeu complet.', { taille: 7.5, couleur: COULEURS.gris });
  return p.finir(`LabFlow Compta · ${entete} · ${jourTunis()}`);
};

// ── Écriture : les notes ────────────────────────────────────────────────────────────────────────────────────────────
// Transaction verrouillée du dossier, droit « configurer », dossier non archivé.
const ecritureEtats = (req, travail) => dansEspaceDuDossier(req.user, req.params.dossierId, async (db, acces, d) => {
  if (!droits(acces).configurer) throw erreur(403, MSG_NOTES, 'NIVEAU_INSUFFISANT');
  if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\'abord', 'DOSSIER_ARCHIVE');
  return travail(db, acces, d);
});
// Le corps { texte } : texte libre, 20 000 caractères au plus, vide permis (efface).
const lireNotes = (corps) => {
  if (!corps || typeof corps !== 'object') throw erreur(400, 'Requête invalide');
  if (corps.texte != null && typeof corps.texte !== 'string') throw erreur(400, 'Notes : un texte est attendu');
  const texte = String(corps.texte ?? '').replace(/\r\n?/g, '\n').trim();
  if (texte.length > NOTES_MAX) throw erreur(400, `Notes : ${NOTES_MAX} caractères au plus (${texte.length})`, 'NOTES_TROP_LONGUES');
  return texte;
};

// ── Routes ──────────────────────────────────────────────────────────────────────────────────────────────────────────

// GET /api/compta/dossiers/:dossierId/etats?exercice=&brouillard= — pour tout accès au dossier. Rien n'est écrit.
const lire = async (req, res) => {
  try {
    const { acces, d } = await lectureDossier(req.user, req.params.dossierId);
    res.json(await etatsDuDossier(pool, acces, d, req.query));
  } catch (err) {
    repondreErreur(res, err, '[compta.etats.lire]');
  }
};
// GET /api/compta/dossiers/:dossierId/etats.pdf?exercice=&brouillard=&complet= — le bilan et l'état de résultat en PDF, ou
// le jeu complet (lecture : tout niveau ; document construit entier avant l'envoi).
const pdf = async (req, res) => {
  try {
    const { acces, d } = await lectureDossier(req.user, req.params.dossierId);
    const e = await etatsDuDossier(pool, acces, d, req.query);
    const complet = req.query.complet === '1' || req.query.complet === 'true';
    envoyerPdf(res, await construirePdf(d, e, { complet }), nomPdf(complet ? 'etats-financiers-complets' : 'etats-financiers', d.nom, String(e.exercice.millesime)));
  } catch (err) {
    repondreErreur(res, err, '[compta.etats.pdf]');
  }
};
// PUT /api/compta/dossiers/:dossierId/etats/:exerciceId/notes — { texte } ; titulaire ou Complet ; l'exercice du dossier,
// clos ou non (les notes s'écrivent après la clôture). → { notes }.
const notes = async (req, res) => {
  try {
    const texte = lireNotes(req.body);
    if (!idValide(req.params.exerciceId)) throw erreur(404, 'Exercice introuvable');
    const n = await ecritureEtats(req, async (db, acces, d) => {
      const x = (await db.query('SELECT id, millesime FROM compta.exercices WHERE dossier_id = $1 AND id = $2', [d.id, req.params.exerciceId])).rows[0];
      if (!x) throw erreur(409, 'Exercice introuvable dans ce dossier', 'EXERCICE_INTROUVABLE');
      await db.query(
        `INSERT INTO compta.notes_exercice (dossier_id, exercice_id, texte, modifie_par, modifie_le) VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (exercice_id) DO UPDATE SET texte = EXCLUDED.texte, modifie_par = EXCLUDED.modifie_par, modifie_le = NOW()`,
        [d.id, x.id, texte, req.user.id]
      );
      await db.query('UPDATE compta.dossiers SET updated_at = NOW() WHERE id = $1', [d.id]);
      await journaliser(db, acces.espace_id, req.user.id, 'notes_exercice', { dossier: d.id, nom: d.nom, exercice: x.id, millesime: x.millesime, longueur: texte.length });
      return presenterNotes((await db.query(SQL_NOTES, [x.id])).rows[0]);
    });
    res.json({ notes: n });
  } catch (err) {
    repondreErreur(res, err, '[compta.etats.notes]');
  }
};

module.exports = { UNITE, NOTES_MAX, MSG_NOTES, SQL_EXERCICES, SQL_MOUVEMENTS, SQL_BROUILLARD, SQL_NOTES, lireSelection, mouvementsDe, etatsDuDossier, construirePdf, lireNotes, lire, pdf, notes };
