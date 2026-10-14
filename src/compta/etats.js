// LabFlow Compta, étape E1 « Le bilan et l'état de résultat » (labflow-reprise/achats-compta/PLAN-ETATS-FINANCIERS.md §2
// ligne E1, §3 ; réponses du client du 14/10 — « ok pour les 5 »). Les états financiers d'un exercice (NC 01, 1ʳᵉ partie,
// annexes 1 et 3), LUS à la demande sur les soldes des comptes — rien n'est écrit :
//   • GET …/dossiers/:dossierId/etats?exercice=&brouillard=  — la page : exercices du dossier, exercice choisi (celui du
//     jour par défaut), bilan et état de résultat (colonnes N et N−1 : l'exercice précédent du dossier, calculé pareil),
//     comptes de chaque poste, contrôles, mentions de la NC 01 (§19) ;
//   • GET …/dossiers/:dossierId/etats.pdf?exercice=&brouillard=  — le même en PDF A4 à la charte, les mentions sur chaque page.
// Soldes d'un exercice : ses lignes validées (brouillard compris sur demande : situation provisoire), à-nouveaux compris ;
// exercice CLOS : son écriture de détermination du résultat est exclue (les comptes de charges et de produits se lisent
// avant qu'elle ne les solde — PLAN-EXERCICES, choix de X2) ; exercice dont le précédent n'est pas clos : le report
// provisoire de X1 (livres.js) s'ajoute, comme à la balance. Règles pures : etatsCalcul.js. Lecture : tout accès au dossier.
const pool = require('../config/database');
const { modeTitulaire, etatAbonnement } = require('./garde');
const { erreur, idValide, repondreErreur } = require('./comptablesClient');
const { droits } = require('./dossiers');
const { lectureDossier, presenterDossier } = require('./planComptes');
const { etatsDe } = require('./paquets');
const X = require('./exercices');
const XC = require('./exercicesCalcul');
const { reportComptes, presenterReport } = require('./livres');
const { MARGE, LARGEUR, COULEURS, creerDocument, envoyerPdf, nomPdf } = require('./pdf');
const { jourTunis } = require('./importExcel');
const C = require('./etatsCalcul');

const UNITE = 'Exprimé en dinars tunisiens, trois décimales';

// ── Lectures ────────────────────────────────────────────────────────────────────────────────────────────────────────
const SQL_EXERCICES = `
  SELECT id, debut::text AS debut, fin::text AS fin, etat, millesime, clos_le, resultat::text AS resultat, ecriture_resultat_id
    FROM compta.exercices
   WHERE dossier_id = $1
   ORDER BY debut DESC`;
// Les soldes de fin d'un exercice par compte ($3 brouillard compris ; $4 : l'écriture de résultat d'un exercice clos, exclue).
const SQL_SOLDES = `
  SELECT k.id AS compte_id, k.numero, k.libelle, k.nature, SUM(l.debit - l.credit)::numeric(18,3)::text AS solde
    FROM compta.lignes l
    JOIN compta.ecritures e ON e.id = l.ecriture_id
    JOIN compta.comptes k ON k.id = l.compte_id
   WHERE l.dossier_id = $1 AND e.exercice_id = $2 AND ($3::boolean OR e.etat = 'validee') AND ($4::int IS NULL OR e.id <> $4)
   GROUP BY k.id
   ORDER BY k.numero`;
const SQL_BROUILLARD = `SELECT COUNT(*)::int AS nb FROM compta.ecritures WHERE dossier_id = $1 AND exercice_id = $2 AND etat = 'brouillard'`;

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
// Les soldes d'un exercice pour les états : lignes (validées, ou brouillard compris), écriture de résultat exclue, report
// provisoire de l'exercice précédent non clos ajouté (X1). → { soldes, report }.
const soldesDe = async (db, d, x, brouillard) => {
  const lus = (await db.query(SQL_SOLDES, [d.id, x.id, brouillard, x.etat === 'clos' ? x.ecriture_resultat_id : null])).rows;
  const soldes = new Map(lus.map((r) => [r.compte_id, { compteId: r.compte_id, numero: r.numero, libelle: r.libelle, nature: r.nature, solde: C.versMillimes(r.solde) }]));
  const report = await reportComptes(db, d, { exercice: x, brouillard });
  if (report) {
    for (const [cle, r] of report.comptes) {
      const id = r.compte.id ?? cle;
      const existant = soldes.get(id);
      if (existant) existant.solde += r.solde;
      else soldes.set(id, { compteId: r.compte.id, numero: r.compte.numero, libelle: r.compte.libelle, nature: r.compte.nature, solde: r.solde });
    }
  }
  return { soldes: [...soldes.values()], report };
};
const presenterExerciceCourt = (x) => (x ? { id: x.id, debut: x.debut, fin: x.fin, etat: x.etat, millesime: x.millesime } : null);

// L'état complet d'un exercice : → { dossier, droits, etatAbonnement, exercices, exercice, precedent, selection, entete,
// brouillard, provisoire, bilan, resultat, controles, pret, sansPoste }.
const etatsDuDossier = async (db, acces, d, query) => {
  const etats = etatsDe(d.pays);
  if (!etats) throw erreur(409, 'Pas de modèle d\'états financiers pour le pays de ce dossier', 'ETATS_ABSENTS');
  const exercices = (await db.query(SQL_EXERCICES, [d.id])).rows;
  const s = lireSelection(query, exercices);
  const x = s.exercice;
  const precedent = XC.precedentDe(exercices, x);
  const [n, n1, b, mode] = await Promise.all([
    soldesDe(db, d, x, s.brouillard),
    precedent ? soldesDe(db, d, precedent, s.brouillard) : null,
    db.query(SQL_BROUILLARD, [d.id, x.id]),
    modeTitulaire(db, acces.espace_id),
  ]);
  const clos = x.etat === 'clos';
  const calc = C.calculerEtats(etats, {
    soldesN: n.soldes, soldesN1: n1 ? n1.soldes : null,
    resultatFige: clos ? C.versMillimes(x.resultat || '0') : null,
    millesime: x.millesime, millesimePrecedent: precedent ? precedent.millesime : null,
  });
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
    controles: calc.controles,
    pret: calc.pret,
    sansPoste: calc.sansPoste,
  };
};

// ── PDF ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const COL = [LARGEUR - 220, 110, 110];
const montant = (v) => C.fmtEtat(C.versMillimes(v));
const construirePdf = (d, e) => {
  const entete = `${e.entete.entreprise}${e.entete.matricule ? ` · MF ${e.entete.matricule}` : ''} · ${e.entete.arrete} · ${e.entete.unite}`;
  const p = creerDocument({ titre: `États financiers ${e.exercice.millesime} - ${d.nom}`, suite: `États financiers ${e.exercice.millesime} — ${entete}` });
  const titre = (texte) => {
    p.texte(texte.toUpperCase(), MARGE, p.y, { taille: 14, gras: true, couleur: COULEURS.indigo });
    p.y += 20;
    p.paragraphe(`${e.entete.entreprise}${e.entete.forme ? ` (${e.entete.forme})` : ''}${e.entete.matricule ? ` — matricule fiscal ${e.entete.matricule}` : ''}`, { taille: 10, gras: true });
    p.paragraphe(`${e.entete.arrete} · ${e.entete.unite}${e.precedent ? ` · chiffres de l'exercice précédent (${e.precedent.millesime}) en seconde colonne` : ' · premier exercice : pas de chiffres de l\'exercice précédent'}`, { taille: 8.5, couleur: e.entete.provisoire ? COULEURS.alerte : COULEURS.gris });
    p.y += 4;
  };
  const enTete = () => { p.rangee([{ t: '' }, { t: e.entete.colonnes.n, aligner: 'right' }, { t: e.entete.colonnes.n1, aligner: 'right' }], COL, { taille: 8, gras: true, couleur: COULEURS.gris }); p.filet(p.y); };
  const rangee = (libelle, n, n1, { gras = false, fond = null, retrait = 0, italique = false, taille = 8.5 } = {}) => {
    const cellules = [{ t: `${' '.repeat(retrait)}${libelle}` }, { t: n == null ? '' : montant(n), aligner: 'right' }, { t: n1 == null ? '' : montant(n1), aligner: 'right' }];
    p.assurer(p.hauteurRangee(cellules, COL, taille, gras), enTete);
    p.rangee(cellules, COL, { taille, gras, fond, couleur: italique ? COULEURS.gris : COULEURS.noir });
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
  p.doc.addPage();
  p.y = MARGE;
  titre('État de résultat');
  enTete();
  for (const l of e.resultat.lignes) {
    if (l.titre) { rangee(l.titre, null, null, { gras: true }); continue; }
    if (l.calcul === 'total') { rangee(l.libelle, l.n, l.n1, { gras: true, fond: COULEURS.bande }); continue; }
    rangee(l.libelle, l.n, l.n1, { retrait: 4 });
  }
  p.y += 10;
  for (const c of e.controles) p.paragraphe(`${c.ok ? 'Contrôle' : 'À VÉRIFIER'} — ${c.libelle} : ${c.detail}.`, { taille: 7.5, couleur: c.ok ? COULEURS.gris : COULEURS.alerte });
  if (e.brouillard.nb && !e.brouillard.compris) p.paragraphe(`${e.brouillard.nb} écriture${e.brouillard.nb > 1 ? 's' : ''} en brouillard non comprise${e.brouillard.nb > 1 ? 's' : ''} (écritures validées seulement).`, { taille: 7.5, couleur: COULEURS.gris });
  p.paragraphe('États financiers établis par LabFlow Compta selon la norme comptable générale NC 01 (annexes 1 et 3, présentation autorisée de l\'état de résultat) à partir des écritures du dossier ; l\'état des flux de trésorerie et les notes viennent à part.', { taille: 7.5, couleur: COULEURS.gris });
  return p.finir(`LabFlow Compta · ${entete} · ${jourTunis()}`);
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
// GET /api/compta/dossiers/:dossierId/etats.pdf?exercice=&brouillard= — le bilan et l'état de résultat en PDF (lecture :
// tout niveau ; document construit entier avant l'envoi).
const pdf = async (req, res) => {
  try {
    const { acces, d } = await lectureDossier(req.user, req.params.dossierId);
    const e = await etatsDuDossier(pool, acces, d, req.query);
    envoyerPdf(res, await construirePdf(d, e), nomPdf('etats-financiers', d.nom, String(e.exercice.millesime)));
  } catch (err) {
    repondreErreur(res, err, '[compta.etats.pdf]');
  }
};

module.exports = { UNITE, SQL_EXERCICES, SQL_SOLDES, SQL_BROUILLARD, lireSelection, soldesDe, etatsDuDossier, construirePdf, lire, pdf };
