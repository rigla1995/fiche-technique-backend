// LabFlow Compta, étape S6c « Les livres et les imports » (labflow-reprise/achats-compta/PLAN-S6.md §1 ligne S6c, §2
// « S6c », §4 « Imports » : modèle Excel de LabFlow Compta seulement, tout ou rien (SPEC-SOCLE D18), 2 000 lignes ; balance
// d'ouverture → une écriture d'à-nouveaux (journal AN) au premier jour de l'exercice, en brouillard ; écritures →
// brouillard ; droit « configurer » (titulaire, Complet) ; CADRAGE §10 : l'import des données actuelles fait partie de la
// tenue). Deux imports d'écritures d'un dossier, sur l'outil commun importExcel.js (modèle à la charte, lecture du
// classeur, rapport ligne par ligne) et sur les lecteurs de la saisie (ecritures.js : lireEcriture — partie double,
// montants en millimes, textes latins —, journalDe, periodeDe, resoudreLignes — comptes imputables, tiers sur un
// collectif, codes actifs) : une écriture importée obéit à toutes les règles d'une écriture saisie.
// 1) Écritures : une rangée par ligne d'écriture ; les rangées d'une même écriture se suivent et portent le même repère
//    dans la colonne « Écriture » ; journal, date, pièce et libellé se lisent sur la première rangée de l'écriture ; chaque
//    écriture naît en brouillard, origine « import », numéro provisoire suivant du dossier, date de traitement système.
// 2) Balance d'ouverture : une rangée par compte (et par tiers sur un collectif) ; une seule écriture d'à-nouveaux dans le
//    journal de type « an », datée du premier jour de l'exercice ouvert, en brouillard, autant de lignes que le fichier
//    (LIGNES_MAX_BALANCE) ; refusée si l'exercice a déjà des à-nouveaux. Journal D16 : ecritures_importees, balance_importee.
const pool = require('../config/database');
const { journaliser } = require('./journal');
const { erreur, repondreErreur } = require('./comptablesClient');
const { NATURE_PAR_TYPE_TIERS } = require('./paquets');
const { droits, dateValide, dansEspaceDuDossier } = require('./dossiers');
const { lectureDossier } = require('./planComptes');
const {
  lireMontant, fmtDate, texteMillimes, numeroProvisoire, lireEcriture, journalDe, periodeDe, exigerDateAN, resoudreLignes, controlerLignes, insererLignes, uneEcriture, resumeEcritures, resumeEcriture, exerciceOuvert,
} = require('./ecritures');
const { LIGNES_MAX: LIGNES_FICHIER_MAX, lireClasseur, modeleClasseur, envoyerClasseur, erreurImport, repondreImport, nomFichier } = require('./importExcel');

const MSG_IMPORTER = 'Seul le titulaire ou un gérant de niveau Complet peut importer des écritures';
// L'écriture d'à-nouveaux admet autant de lignes que le fichier (un plan avec ses tiers dépasse vite 200 comptes).
const LIGNES_MAX_BALANCE = LIGNES_FICHIER_MAX;
const EN_TETES_ECRITURES = ['Écriture', 'Journal', 'Date', 'Pièce', 'Libellé', 'Compte', 'Tiers', 'Libellé de la ligne', 'Débit', 'Crédit', 'Code de taxe', 'Échéance'];
const LARGEURS_ECRITURES = [11, 10, 13, 18, 34, 11, 11, 30, 15, 15, 13, 13];
const EXEMPLE_ECRITURES = ['Exemple : 1', 'AC', '05/03/2026', 'F-2026-0412', 'Facture STB boissons', '607', '', 'Boissons du mois', '1000,000', '', 'TVA19', ''];
const EN_TETES_BALANCE = ['Compte', 'Tiers', 'Libellé', 'Débit', 'Crédit'];
const LARGEURS_BALANCE = [12, 12, 44, 16, 16];
const EXEMPLE_BALANCE = ['Exemple : 4011', 'F0001', 'Solde fournisseur STB au 31/12', '', '1173,150'];
const TYPE_TIERS_PAR_NATURE = Object.fromEntries(Object.entries(NATURE_PAR_TYPE_TIERS).map(([t, n]) => [n, t]));
const RE_LIGNE_MSG = /^Ligne (\d+)(?:,| :)/;

// ── Transaction ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Un import : transaction verrouillée du dossier (comptabilité verrouillée, dossier relu sous verrou, garde par
// comptabilité), droit « configurer » (titulaire, Complet — PLAN-S6 §4 « Droits »), dossier non archivé ; tout ou rien :
// la moindre erreur annule la transaction (rapport ligne par ligne).
const ecritureImport = (req, travail) => dansEspaceDuDossier(req.user, req.params.dossierId, async (db, acces, d) => {
  if (!droits(acces).configurer) throw erreur(403, MSG_IMPORTER, 'NIVEAU_INSUFFISANT');
  if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\'abord', 'DOSSIER_ARCHIVE');
  return travail(db, acces, d);
});
// Accès, droit et état du dossier jugés AVANT d'analyser le classeur (comme l'import des tiers) ; la transaction les rejoue.
const exigerImport = async (req) => {
  const garde = await lectureDossier(req.user, req.params.dossierId);
  if (!droits(garde.acces).configurer) throw erreur(403, MSG_IMPORTER, 'NIVEAU_INSUFFISANT');
  if (garde.d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\'abord', 'DOSSIER_ARCHIVE');
  if (!req.file?.buffer) throw erreur(400, 'Fichier requis (classeur Excel .xlsx dans le champ « fichier »)', 'FICHIER_REQUIS');
  return garde;
};

// ── Lecture des cellules ────────────────────────────────────────────────────────────────────────────────────────────
// Une date de cellule : AAAA-MM-JJ (cellule date d'Excel, déjà en ISO) ou JJ/MM/AAAA ; → ISO, ou null si vide, 400 sinon.
const RE_FR = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const lireDateCellule = (t, libelle) => {
  if (!t) return null;
  const m = RE_FR.exec(t);
  const iso = m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : t;
  if (!dateValide(iso)) throw erreur(400, `${libelle} : date invalide (JJ/MM/AAAA ou AAAA-MM-JJ)`);
  return iso;
};
// Un montant de cellule : vide = « 0.000 » ; sinon le texte normalisé (virgule acceptée) ; 400 si ce n'est pas un montant.
const lireMontantCellule = (t, libelle) => texteMillimes(lireMontant(t, libelle));
// Les référentiels du dossier, par clé : comptes par numéro, tiers par code (plusieurs types possibles), codes de taxe
// par code, journaux par code (en majuscules).
const referentiels = async (db, dossierId) => {
  const [comptes, tiers, taxes, journaux] = await Promise.all([
    db.query('SELECT id, numero, nature FROM compta.comptes WHERE dossier_id = $1', [dossierId]),
    db.query('SELECT id, type, code FROM compta.tiers WHERE dossier_id = $1', [dossierId]),
    db.query('SELECT id, code FROM compta.taxes WHERE dossier_id = $1', [dossierId]),
    db.query('SELECT id, code, type FROM compta.journaux WHERE dossier_id = $1', [dossierId]),
  ]);
  const parTiers = new Map();
  for (const t of tiers.rows) {
    const cle = t.code.toUpperCase();
    if (!parTiers.has(cle)) parTiers.set(cle, []);
    parTiers.get(cle).push(t);
  }
  return {
    comptes: new Map(comptes.rows.map((k) => [k.numero, k])),
    tiers: parTiers,
    taxes: new Map(taxes.rows.map((x) => [x.code.toUpperCase(), x])),
    journaux: new Map(journaux.rows.map((j) => [j.code.toUpperCase(), j])),
  };
};
// Le compte, le tiers et le code d'une rangée, résolus par leur numéro ou leur code ; les refus sont des messages (rangée
// fausse), jamais des exceptions. → { compteId, tiersId, taxeId, erreurs }.
const resoudreRangee = (refs, { compte, tiers, taxe }) => {
  const erreurs = [];
  const k = compte ? refs.comptes.get(compte) : null;
  if (!compte) erreurs.push('Compte : indiquez le numéro du compte');
  else if (!k) erreurs.push(`Compte : ${compte} n'est pas dans le plan de comptes du dossier`);
  let tiersId = null;
  if (tiers) {
    const candidats = refs.tiers.get(tiers.toUpperCase()) || [];
    const attendu = k ? TYPE_TIERS_PAR_NATURE[k.nature] : null;
    const t = candidats.find((x) => x.type === attendu) || candidats[0];
    if (!t) erreurs.push(`Tiers : ${tiers} n'est pas un tiers du dossier (page Tiers)`);
    else tiersId = t.id;
  }
  let taxeId = null;
  if (taxe) {
    const x = refs.taxes.get(taxe.toUpperCase());
    if (!x) erreurs.push(`Code de taxe : ${taxe} n'est pas un code du dossier (page Taxes)`);
    else taxeId = x.id;
  }
  return { compteId: k ? k.id : null, tiersId, taxeId, erreurs };
};
// Un message de la saisie attribué à une rangée connue perd son préfixe « Ligne n » (le numéro de rangée Excel le remplace).
const sansPrefixe = (message) => { const m = String(message || '').replace(RE_LIGNE_MSG, '').trim(); return m.charAt(0).toUpperCase() + m.slice(1); };
// Le côté d'une rangée : un débit OU un crédit, l'un des deux (mêmes règles que lireLigne, jugées rangée par rangée).
const controlerCote = (ligne) => {
  const d = ligne.debit !== '0.000';
  const c = ligne.credit !== '0.000';
  if (d && c) return 'Un débit ou un crédit, pas les deux';
  if (!d && !c) return 'Indiquez le débit ou le crédit';
  return null;
};
// Attribue un message « Ligne n … » de la saisie à la rangée Excel du rang n ; sinon à la première rangée.
const rangeeDuMessage = (message, rangs) => {
  const m = RE_LIGNE_MSG.exec(message || '');
  const i = m ? Number(m[1]) - 1 : -1;
  return rangs[i] || rangs[0];
};
// Le rapport : une entrée par rangée fausse, triée par numéro de rangée, les messages d'une même rangée réunis.
const rapport = (fausses) => {
  const par = new Map();
  for (const f of fausses) {
    if (!par.has(f.ligne)) par.set(f.ligne, { ligne: f.ligne, repere: f.repere, erreurs: [] });
    for (const e of f.erreurs) if (!par.get(f.ligne).erreurs.includes(e)) par.get(f.ligne).erreurs.push(e);
  }
  return [...par.values()].sort((a, b) => a.ligne - b.ligne);
};

// ── Écritures ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Les rangées lues, groupées par écriture : les rangées qui se suivent avec le même repère (colonne « Écriture » ; une
// rangée sans repère continue l'écriture en cours) ; un repère déjà employé plus haut est refusé.
const grouper = (lignes) => {
  const groupes = [];
  const vus = new Set();
  let courant = null;
  for (const l of lignes) {
    const repere = l.cellules[0];
    if (!courant || (repere !== '' && repere !== courant.repere)) {
      courant = { repere: repere || `rangée ${l.ligne}`, premiere: l.ligne, rangs: [], erreurs: [] };
      if (repere && vus.has(repere)) courant.erreurs.push(`Écriture : le repère « ${repere} » est déjà employé plus haut ; les rangées d'une même écriture se suivent`);
      if (repere) vus.add(repere);
      groupes.push(courant);
    }
    courant.rangs.push(l);
  }
  return groupes;
};
// Un groupe → le corps d'une écriture (tel que la saisie l'envoie) et ses rangées fausses. Journal, date, pièce et libellé :
// ceux de la première rangée ; une autre rangée qui en porte de différents est fausse.
const corpsDuGroupe = (g, refs) => {
  const fausses = [];
  const faute = (l, repere, ...erreurs) => fausses.push({ ligne: l, repere, erreurs });
  const [, journal, date, piece, libelle] = g.rangs[0].cellules;
  const repere = [g.repere, piece].filter(Boolean).join(' — ');
  for (const e of g.erreurs) faute(g.premiere, repere, e);
  const j = journal ? refs.journaux.get(journal.toUpperCase()) : null;
  if (!journal) faute(g.premiere, repere, 'Journal : indiquez le code du journal (AC, VT, BQ…)');
  else if (!j) faute(g.premiere, repere, `Journal : ${journal} n'est pas un journal du dossier (page Journaux)`);
  let dateIso = null;
  try { dateIso = lireDateCellule(date, 'Date'); if (!dateIso) faute(g.premiere, repere, 'Date : indiquez la date de l\'écriture'); } catch (e) { faute(g.premiere, repere, e.message); }
  if (!piece) faute(g.premiere, repere, 'Pièce : indiquez la référence de la pièce justificative');
  if (!libelle) faute(g.premiere, repere, 'Libellé : indiquez le libellé de l\'écriture');
  const lignes = [];
  const reperes = [];
  g.rangs.forEach((l, i) => {
    const [, jr, dr, pr, lr, compte, tiers, libelleLigne, debit, credit, taxe, echeance] = l.cellules;
    const rep = `${repere} · rangée ${i + 1}`;
    reperes.push(rep);
    if (i > 0) {
      if (jr && journal && jr.toUpperCase() !== journal.toUpperCase()) faute(l.ligne, rep, `Journal : ${jr} diffère de la première rangée de l'écriture (${journal})`);
      // Une cellule date d'Excel arrive en ISO, un texte en JJ/MM/AAAA : les deux formes se comparent une fois lues.
      let dateRangee = null;
      try { dateRangee = lireDateCellule(dr, 'Date'); } catch (e) { faute(l.ligne, rep, e.message); }
      if (dateRangee && dateIso && dateRangee !== dateIso) faute(l.ligne, rep, `Date : ${dr} diffère de la première rangée de l'écriture (${date})`);
      if (pr && piece && pr !== piece) faute(l.ligne, rep, `Pièce : ${pr} diffère de la première rangée de l'écriture (${piece})`);
      if (lr && libelle && lr !== libelle) faute(l.ligne, rep, `Libellé : diffère de la première rangée de l'écriture`);
    }
    const r = resoudreRangee(refs, { compte, tiers, taxe });
    for (const e of r.erreurs) faute(l.ligne, rep, e);
    const ligne = { compteId: r.compteId, tiersId: r.tiersId, libelle: libelleLigne || null, debit: '0.000', credit: '0.000', taxeId: r.taxeId, echeance: null };
    try { ligne.debit = lireMontantCellule(debit, 'Débit'); } catch (e) { faute(l.ligne, rep, e.message); }
    try { ligne.credit = lireMontantCellule(credit, 'Crédit'); } catch (e) { faute(l.ligne, rep, e.message); }
    try { ligne.echeance = lireDateCellule(echeance, 'Échéance'); } catch (e) { faute(l.ligne, rep, e.message); }
    if (ligne.echeance && dateIso && ligne.echeance < dateIso) faute(l.ligne, rep, `L'échéance (${fmtDate(ligne.echeance)}) précède la date de l'écriture (${fmtDate(dateIso)})`);
    const cote = controlerCote(ligne);
    if (cote) faute(l.ligne, rep, cote);
    lignes.push(ligne);
  });
  const corps = { journalId: j ? j.id : null, date: dateIso, reference: piece, libelle, lignes };
  // Les règles de l'ensemble (partie double, deux comptes, total) : un refus désigne sa rangée (la première sinon).
  let ecriture = null;
  if (!fausses.length) {
    try { ecriture = lireEcriture(corps); } catch (e) { if (!e.statusCode) throw e; const l = rangeeDuMessage(e.message, g.rangs); faute(l.ligne, repere, sansPrefixe(e.message)); }
  }
  return { ecriture, fausses, repere, reperes, premiere: g.premiere, rangs: g.rangs, cle: j && dateIso && piece ? `${j.id}\u0000${dateIso}\u0000${piece}` : null };
};

// GET /api/compta/dossiers/:dossierId/ecritures/modele-import — le modèle des écritures (lecture : tout niveau).
const modeleEcritures = async (req, res) => {
  try {
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    const { wb } = modeleClasseur({
      feuille: 'Écritures',
      titre: 'Modèle d\'import — écritures',
      sousTitre: d.nom,
      meta: 'Une rangée par ligne d\'écriture ; les rangées d\'une même écriture se suivent et portent le même repère dans « Écriture » (1, 2, 3…) ; journal, date (JJ/MM/AAAA), pièce et libellé se lisent sur sa première rangée ; compte par son numéro, tiers par son code (obligatoire sur un compte collectif), code de taxe par son code, montants en dinars (virgule acceptée), un débit OU un crédit par rangée. Toutes les écritures sont contrôlées : rien n\'est importé à la moindre erreur ; elles naissent en brouillard.',
      enTetes: EN_TETES_ECRITURES,
      largeurs: LARGEURS_ECRITURES,
      exemple: EXEMPLE_ECRITURES,
    });
    await envoyerClasseur(res, wb, `modele-ecritures-${d.id}.xlsx`);
  } catch (err) {
    repondreErreur(res, err, '[compta.importEcritures.modeleEcritures]');
  }
};

// POST /api/compta/dossiers/:dossierId/ecritures/import — fichier « fichier » (multipart) ; titulaire ou Complet. Toutes
// les écritures sont contrôlées (forme, partie double, journal actif, date dans une période ouverte de l'exercice ouvert,
// comptes imputables, tiers, codes) ; à la moindre erreur, 400 avec le rapport rangée par rangée et rien d'écrit ; sinon
// une transaction, chaque écriture en brouillard avec son numéro provisoire, un événement de journal.
// → 201 { importees, premiere, derniere, journaux: { code: nombre }, nb }.
const importerEcritures = async (req, res) => {
  try {
    await exigerImport(req);
    const lignes = await lireClasseur(req.file.buffer, { enTetes: EN_TETES_ECRITURES });
    const fichier = nomFichier(req.file);
    const resultat = await ecritureImport(req, async (db, acces, d) => {
      const refs = await referentiels(db, d.id);
      const groupes = grouper(lignes).map((g) => corpsDuGroupe(g, refs));
      let fausses = groupes.flatMap((g) => g.fausses);
      // Doublons (relecture) : deux écritures du fichier, ou une du fichier et une du dossier, avec le même journal, la même
      // date et la même pièce — un fichier renvoyé deux fois doublerait le mois ; la pièce se distingue au besoin.
      const cles = new Map();
      for (const g of groupes) {
        if (!g.cle) continue;
        if (cles.has(g.cle)) fausses.push({ ligne: g.premiere, repere: g.repere, erreurs: [`Écriture en double dans le fichier : même journal, même date et même pièce que l'écriture ${cles.get(g.cle)}`] });
        else cles.set(g.cle, g.repere);
      }
      const avecCle = groupes.filter((g) => g.cle && g.ecriture);
      if (avecCle.length) {
        const deja = (await db.query(
          `SELECT e.journal_id, e.date::text AS date, e.reference, e.numero, e.numero_provisoire FROM compta.ecritures e
            WHERE e.dossier_id = $1 AND (e.journal_id, e.date, e.reference) IN (SELECT * FROM unnest($2::int[], $3::date[], $4::text[]))`,
          [d.id, avecCle.map((g) => g.ecriture.journalId), avecCle.map((g) => g.ecriture.date), avecCle.map((g) => g.ecriture.reference)]
        )).rows;
        const existantes = new Map(deja.map((e) => [`${e.journal_id}\u0000${e.date}\u0000${e.reference}`, e.numero || numeroProvisoire(e.numero_provisoire)]));
        for (const g of avecCle) if (existantes.has(g.cle)) fausses.push({ ligne: g.premiere, repere: g.repere, erreurs: [`Pièce ${g.ecriture.reference} déjà enregistrée dans ce journal le ${fmtDate(g.ecriture.date)} (écriture ${existantes.get(g.cle)}) : fichier déjà importé, ou pièce à distinguer`] });
      }
      // Contre le dossier (journal actif, période ouverte, à-nouveaux au premier jour, comptes imputables, tiers, codes) :
      // mêmes règles que la saisie ; les lignes sont contrôlées même quand le journal ou la date sont refusés (une seule passe).
      const periodes = new Map();
      const prets = [];
      for (const g of groupes) {
        if (!g.ecriture) continue;
        const avant = fausses.length;
        let journal = null;
        let periode = null;
        try {
          journal = await journalDe(db, d.id, g.ecriture.journalId);
          if (!periodes.has(g.ecriture.date)) periodes.set(g.ecriture.date, await periodeDe(db, d.id, g.ecriture.date));
          periode = periodes.get(g.ecriture.date);
          exigerDateAN(journal, periode.exercice, g.ecriture.date);
        } catch (e) {
          if (!e.statusCode || e.statusCode >= 500) throw e;
          fausses.push({ ligne: g.premiere, repere: g.repere, erreurs: [sansPrefixe(e.message)] });
        }
        const cartes = await controlerLignes(db, d, g.ecriture.lignes);
        for (const { rang, erreur } of cartes.erreurs) fausses.push({ ligne: g.rangs[rang - 1].ligne, repere: g.reperes[rang - 1], erreurs: [sansPrefixe(erreur.message)] });
        if (fausses.length === avant && journal && periode) prets.push({ g, journal, ...periode, cartes });
      }
      fausses = rapport(fausses);
      if (fausses.length) throw erreurImport(fausses, lignes.length);
      const journaux = {};
      let premiere = null;
      let derniere = null;
      for (const { g, journal, exercice, periode, cartes } of prets) {
        const e = g.ecriture;
        const numero = (await db.query('UPDATE compta.dossiers SET prochain_provisoire = prochain_provisoire + 1 WHERE id = $1 RETURNING prochain_provisoire - 1 AS n', [d.id])).rows[0].n;
        const ins = await db.query(
          `INSERT INTO compta.ecritures (dossier_id, exercice_id, periode_id, journal_id, date, numero_provisoire, reference, libelle, total_debit, total_credit, origine, cree_par)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, 'import', $10) RETURNING id`,
          [d.id, exercice.id, periode.id, journal.id, e.date, numero, e.reference, e.libelle, texteMillimes(e.total), req.user.id]
        );
        await insererLignes(db, d, ins.rows[0].id, e.date, e.lignes);
        journaux[journal.code] = (journaux[journal.code] || 0) + 1;
        if (premiere === null) premiere = numero;
        derniere = numero;
        // Le journal des événements garde chaque écriture importée (de quoi la relire si elle est supprimée ensuite).
        await journaliser(db, acces.espace_id, req.user.id, 'ecriture_creee', { dossier: d.id, ecriture: ins.rows[0].id, numeroProvisoire: numeroProvisoire(numero), import: fichier, ...resumeEcriture(e, journal, e.lignes, cartes) });
      }
      await journaliser(db, acces.espace_id, req.user.id, 'ecritures_importees', { dossier: d.id, nombre: prets.length, lignes: lignes.length, journaux, premiere: numeroProvisoire(premiere), derniere: numeroProvisoire(derniere), fichier });
      return { importees: prets.length, lignes: lignes.length, premiere: numeroProvisoire(premiere), derniere: numeroProvisoire(derniere), journaux, nb: await resumeEcritures(db, d.id) };
    });
    res.status(201).json(resultat);
  } catch (err) {
    repondreImport(res, err, '[compta.importEcritures.importerEcritures]');
  }
};

// ── Balance d'ouverture ─────────────────────────────────────────────────────────────────────────────────────────────
// GET /api/compta/dossiers/:dossierId/ecritures/modele-balance-ouverture — le modèle (lecture : tout niveau).
const modeleBalance = async (req, res) => {
  try {
    const { d } = await lectureDossier(req.user, req.params.dossierId);
    const x = await exerciceOuvert(pool, d.id);
    const { wb } = modeleClasseur({
      feuille: 'Balance d\'ouverture',
      titre: 'Modèle d\'import — balance d\'ouverture',
      sousTitre: d.nom,
      meta: `Une rangée par compte (et par tiers sur un compte collectif : fournisseurs, clients), solde au débit OU au crédit, en dinars (virgule acceptée) ; compte par son numéro (comptes imputables du plan), tiers par son code. Le total des débits doit égaler le total des crédits. L'import crée UNE écriture d'à-nouveaux (journal AN) au premier jour de l'exercice ouvert${x ? ` (${fmtDate(x.debut)})` : ''}, en brouillard : vous la relisez, puis la validez.`,
      enTetes: EN_TETES_BALANCE,
      largeurs: LARGEURS_BALANCE,
      exemple: EXEMPLE_BALANCE,
    });
    await envoyerClasseur(res, wb, `modele-balance-ouverture-${d.id}.xlsx`);
  } catch (err) {
    repondreErreur(res, err, '[compta.importEcritures.modeleBalance]');
  }
};

// POST /api/compta/dossiers/:dossierId/ecritures/import-balance-ouverture — fichier « fichier » ; titulaire ou Complet.
// Une seule écriture d'à-nouveaux : journal de type « an » (actif), premier jour de l'exercice ouvert (période ouverte),
// pièce « AN-AAAA », en brouillard, origine « import » ; refusée si l'exercice a déjà des à-nouveaux (409 AN_EXISTANT) ;
// chaque rangée contrôlée (compte imputable, tiers sur un collectif, montant d'un seul côté), partie double exigée ; à la
// moindre erreur, 400 avec le rapport et rien d'écrit. → 201 { ecriture (avec lignes), lignes, nb }.
const importerBalance = async (req, res) => {
  try {
    await exigerImport(req);
    const lignes = await lireClasseur(req.file.buffer, { enTetes: EN_TETES_BALANCE, max: LIGNES_MAX_BALANCE });
    const fichier = nomFichier(req.file);
    const resultat = await ecritureImport(req, async (db, acces, d) => {
      const x = await exerciceOuvert(db, d.id);
      if (!x) throw erreur(409, 'Aucun exercice ouvert dans ce dossier', 'EXERCICE_CLOS');
      const an = (await db.query(`SELECT id, code, actif FROM compta.journaux WHERE dossier_id = $1 AND type = 'an' ORDER BY id LIMIT 1`, [d.id])).rows[0];
      if (!an) throw erreur(409, 'Ce dossier n\'a pas de journal d\'à-nouveaux : créez-le (page Journaux, type À-nouveaux)', 'JOURNAL_AN_ABSENT');
      const journal = await journalDe(db, d.id, an.id);
      const deja = (await db.query(`SELECT COUNT(*)::int AS n, COUNT(*) FILTER (WHERE etat = 'validee')::int AS validees FROM compta.ecritures WHERE dossier_id = $1 AND exercice_id = $2 AND journal_id = $3`, [d.id, x.id, journal.id])).rows[0];
      if (deja.n > 0) throw erreur(409, `L'exercice du ${fmtDate(x.debut)} au ${fmtDate(x.fin)} a déjà ${deja.n} écriture${deja.n > 1 ? 's' : ''} dans le journal ${journal.code} : ${deja.validees ? 'contre-passez-la (validée)' : 'supprimez-la ou corrigez-la (en brouillard)'} avant un nouvel import`, 'AN_EXISTANT');
      let exercice;
      let periode;
      try {
        ({ exercice, periode } = await periodeDe(db, d.id, x.debut));
      } catch (e) {
        if (e.code === 'PERIODE_CLOSE') throw erreur(409, `La période du ${fmtDate(x.debut)} est close : rouvrez-la (page Périodes) avant d'importer la balance d'ouverture`, 'PERIODE_CLOSE');
        throw e;
      }
      const refs = await referentiels(db, d.id);
      let fausses = [];
      const corps = { journalId: journal.id, date: x.debut, reference: `AN-${x.debut.slice(0, 4)}`, libelle: `À-nouveaux au ${fmtDate(x.debut)} — balance d'ouverture importée`, lignes: [] };
      const reperes = [];
      const saines = [];
      const vus = new Map();
      lignes.forEach((l, i) => {
        const [compte, tiers, libelle, debit, credit] = l.cellules;
        const repere = [compte, tiers].filter(Boolean).join(' · ') || `rangée ${l.ligne}`;
        reperes.push(repere);
        const avant = fausses.length;
        const r = resoudreRangee(refs, { compte, tiers, taxe: '' });
        for (const e of r.erreurs) fausses.push({ ligne: l.ligne, repere, erreurs: [e] });
        // Une balance n'a qu'une rangée par compte (et par tiers) : un doublon est signalé.
        if (r.compteId) {
          const cle = `${r.compteId}\u0000${r.tiersId ?? ''}`;
          if (vus.has(cle)) fausses.push({ ligne: l.ligne, repere, erreurs: [`Compte ${compte}${tiers ? ` · ${tiers}` : ''} déjà présent à la rangée ${vus.get(cle)} : une balance n'a qu'un solde par compte et par tiers`] });
          else vus.set(cle, l.ligne);
        }
        const ligne = { compteId: r.compteId, tiersId: r.tiersId, libelle: libelle || null, debit: '0.000', credit: '0.000', taxeId: null, echeance: null };
        try { ligne.debit = lireMontantCellule(debit, 'Débit'); } catch (e) { fausses.push({ ligne: l.ligne, repere, erreurs: [e.message] }); }
        try { ligne.credit = lireMontantCellule(credit, 'Crédit'); } catch (e) { fausses.push({ ligne: l.ligne, repere, erreurs: [e.message] }); }
        const cote = controlerCote(ligne);
        if (cote) fausses.push({ ligne: l.ligne, repere, erreurs: [cote] });
        corps.lignes.push(ligne);
        // Les rangées saines sont contrôlées contre le dossier (compte imputable, tiers sur un collectif) avec leur rang.
        if (fausses.length === avant) saines.push({ ...ligne, rang: i + 1 });
      });
      if (saines.length) for (const { rang, erreur } of (await controlerLignes(db, d, saines)).erreurs) fausses.push({ ligne: lignes[rang - 1].ligne, repere: reperes[rang - 1], erreurs: [sansPrefixe(erreur.message)] });
      let ecriture = null;
      let cartes = null;
      if (!fausses.length) {
        try {
          ecriture = lireEcriture(corps, { lignesMax: LIGNES_MAX_BALANCE });
          cartes = await resoudreLignes(db, d, ecriture.lignes);
        } catch (e) {
          if (!e.statusCode || e.statusCode >= 500) throw e;
          const m = RE_LIGNE_MSG.exec(e.message || '');
          const l = m ? lignes[Number(m[1]) - 1] : null;
          // Un refus de l'ensemble (déséquilibre, un seul compte) se lit sur la dernière rangée, sous le repère « Total ».
          fausses.push(l ? { ligne: l.ligne, repere: reperes[Number(m[1]) - 1], erreurs: [sansPrefixe(e.message)] } : { ligne: lignes[lignes.length - 1].ligne, repere: 'Total de la balance', erreurs: [e.code === 'DESEQUILIBRE' ? `Balance déséquilibrée : ${e.message.replace(/^Écriture déséquilibrée : /, '')}` : e.message] });
        }
      }
      fausses = rapport(fausses);
      if (fausses.length) throw erreurImport(fausses, lignes.length);
      const numero = (await db.query('UPDATE compta.dossiers SET prochain_provisoire = prochain_provisoire + 1 WHERE id = $1 RETURNING prochain_provisoire - 1 AS n', [d.id])).rows[0].n;
      const ins = await db.query(
        `INSERT INTO compta.ecritures (dossier_id, exercice_id, periode_id, journal_id, date, numero_provisoire, reference, libelle, total_debit, total_credit, origine, cree_par)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, 'import', $10) RETURNING id`,
        [d.id, exercice.id, periode.id, journal.id, ecriture.date, numero, ecriture.reference, ecriture.libelle, texteMillimes(ecriture.total), req.user.id]
      );
      await insererLignes(db, d, ins.rows[0].id, ecriture.date, ecriture.lignes);
      await journaliser(db, acces.espace_id, req.user.id, 'balance_importee', { dossier: d.id, exercice: exercice.id, ecriture: ins.rows[0].id, numeroProvisoire: numeroProvisoire(numero), journal: journal.code, date: ecriture.date, lignes: ecriture.lignes.length, total: texteMillimes(ecriture.total), fichier, contenu: resumeEcriture(ecriture, journal, ecriture.lignes, cartes) });
      return { ecriture: await uneEcriture(db, d.id, ins.rows[0].id), lignes: ecriture.lignes.length, total: texteMillimes(ecriture.total), nb: await resumeEcritures(db, d.id) };
    });
    res.status(201).json(resultat);
  } catch (err) {
    repondreImport(res, err, '[compta.importEcritures.importerBalance]');
  }
};

module.exports = {
  MSG_IMPORTER, LIGNES_MAX_BALANCE, EN_TETES_ECRITURES, EXEMPLE_ECRITURES, EN_TETES_BALANCE, EXEMPLE_BALANCE,
  lireDateCellule, lireMontantCellule, resoudreRangee, rangeeDuMessage, sansPrefixe, controlerCote, rapport, grouper, corpsDuGroupe, ecritureImport,
  modeleEcritures, importerEcritures, modeleBalance, importerBalance,
};
