// LabFlow Compta, étape S6b « La validation et les périodes » (labflow-reprise/achats-compta/PLAN-S6.md §1 ligne S6b, §2,
// §4 ; réponses du client du 08/10 — « ok pour les 8 » : numéro définitif attribué à la validation, continu par journal
// et par exercice (AC-2026-000001), provisoire en brouillard ; le niveau Saisie ne valide pas ; CADRAGE §4 : validation =
// définitif (NC 01 §54, §56), une erreur se corrige par contre-passation, piste d'audit). La validation d'une écriture
// (ou de toutes celles d'une période, dans l'ordre des dates puis des numéros provisoires) et la contre-passation d'une
// écriture validée (écriture inverse, même journal, liée à l'origine, validée aussitôt). Routes (D3) : /api/compta/
// dossiers/:dossierId/ecritures/:ecritureId/valider, …/contrepasser, /dossiers/:dossierId/periodes/:periodeId/valider ;
// chaque écriture passe par la transaction verrouillée du dossier (dansEspaceDuDossier : comptabilité verrouillée, dossier
// relu sous verrou, garde par comptabilité D4), puis par le droit « configurer » (titulaire, Complet) et l'état du dossier
// (archivé : rien ne change). Le dossier étant verrouillé, le numéro définitif se calcule sans course : MAX des numéros du
// journal dans l'exercice (une écriture validée ne se supprime jamais, la série reste continue et sans trou).
const { journaliser } = require('./journal');
const { erreur, idValide, repondreErreur } = require('./comptablesClient');
const { droits, dateValide, dansEspaceDuDossier } = require('./dossiers');
const {
  LIBELLE_MAX, numeroProvisoire, fmtDate, millimesDe, lireTexte, lireReference,
  journalDe, periodeDe, ecritureDe, exigerBrouillard, uneEcriture, lignesDe, insererLignes, resumeEcritures, resumePeriode,
} = require('./ecritures');

const MSG_VALIDER = 'Seul le titulaire ou un gérant de niveau Complet peut valider, contre-passer ou clore';
const MSG_ROUVRIR = 'Seul le titulaire peut rouvrir une période';
const MSG_PAR_DROIT = { configurer: MSG_VALIDER, archiver: MSG_ROUVRIR };
// Numéro définitif (réponse 2 du 08/10) : code du journal, année de début de l'exercice, 6 chiffres (999 999 écritures par
// journal et par exercice ; CADRAGE §8 : des dizaines de milliers par an).
const NUMERO_CHIFFRES = 6;
const NUMERO_MAX = 10 ** NUMERO_CHIFFRES - 1;
const RE_NUMERO_FIN = /(\d+)$/;

// ── Transaction ─────────────────────────────────────────────────────────────────────────────────────────────────────
// Toute action définitive : transaction verrouillée du dossier (comptabilité verrouillée, dossier relu sous verrou, garde
// par comptabilité), droit « configurer » (titulaire, Complet — réponse 4 du 08/10) ou « archiver » (titulaire : rouvrir une
// période, réponse 5), dossier non archivé ; puis ce que le travail rend.
const ecritureValidation = (req, travail, droit = 'configurer') => dansEspaceDuDossier(req.user, req.params.dossierId, async (db, acces, d) => {
  if (!droits(acces)[droit]) throw erreur(403, MSG_PAR_DROIT[droit] || MSG_VALIDER, 'NIVEAU_INSUFFISANT');
  if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\'abord', 'DOSSIER_ARCHIVE');
  return travail(db, acces, d);
});

// ── Périodes (lues dans la transaction du dossier) ──────────────────────────────────────────────────────────────────
const SQL_PERIODE = `
  SELECT p.id, p.debut::text AS debut, p.fin::text AS fin, p.etat, p.clos_par, p.clos_le, p.rouvert_par, p.rouvert_le,
         x.id AS exercice_id, x.debut::text AS exercice_debut, x.fin::text AS exercice_fin, x.etat AS exercice_etat
    FROM compta.periodes p
    JOIN compta.exercices x ON x.id = p.exercice_id
   WHERE x.dossier_id = $1 AND p.id = $2`;
// La période, si elle est dans le dossier (avec son exercice).
const periodeDuDossier = async (db, dossierId, periodeId) => {
  if (!idValide(periodeId)) throw erreur(404, 'Période introuvable');
  const p = (await db.query(SQL_PERIODE, [dossierId, periodeId])).rows[0];
  if (!p) throw erreur(404, 'Période introuvable');
  return p;
};
const libellePeriode = (p) => `du ${fmtDate(p.debut)} au ${fmtDate(p.fin)}`;
const exigerExerciceOuvert = (p) => {
  if (p.exercice_etat !== 'ouvert') throw erreur(409, `L'exercice du ${fmtDate(p.exercice_debut)} au ${fmtDate(p.exercice_fin)} est clos`, 'EXERCICE_CLOS');
};
const exigerPeriodeOuverte = (p) => {
  exigerExerciceOuvert(p);
  if (p.etat !== 'ouverte') throw erreur(409, `La période ${libellePeriode(p)} est close`, 'PERIODE_CLOSE');
};

// ── Numéros définitifs ──────────────────────────────────────────────────────────────────────────────────────────────
const numeroDefinitif = (code, exerciceDebut, n) => `${code}-${String(exerciceDebut).slice(0, 4)}-${String(n).padStart(NUMERO_CHIFFRES, '0')}`;
// Le rang d'un numéro (ses chiffres de fin) ; 0 sans numéro.
const rangDe = (numero) => {
  const m = RE_NUMERO_FIN.exec(numero || '');
  return m ? Number(m[1]) : 0;
};
// Le prochain rang d'un journal dans un exercice : MAX sous le verrou du dossier. Le préfixe (code du journal, figé à la
// création ; année de l'exercice) est le même pour toute la série et le rang est complété à 6 chiffres : l'ordre des
// textes est l'ordre des rangs, l'index partiel (dossier, journal, exercice, numero) de la migration 216 sert le MAX.
const prochainRang = async (db, dossierId, journalId, exerciceId) => {
  const r = await db.query('SELECT MAX(numero) AS dernier FROM compta.ecritures WHERE dossier_id = $1 AND journal_id = $2 AND exercice_id = $3 AND numero IS NOT NULL', [dossierId, journalId, exerciceId]);
  return rangDe(r.rows[0].dernier) + 1;
};
// Pose le numéro définitif d'une écriture en brouillard : état validée, auteur et heure de la validation (NOW() du
// serveur, jamais modifiable). `e` : l'écriture (journal_code, numero_provisoire) ; `p` : sa période (exercice_debut).
const poserNumero = async (db, e, p, rang, auteurId) => {
  if (rang > NUMERO_MAX) throw erreur(409, `La série ${e.journal_code}-${String(p.exercice_debut).slice(0, 4)} est pleine (${NUMERO_MAX} écritures) : ouvrez un autre journal`, 'SERIE_PLEINE');
  const numero = numeroDefinitif(e.journal_code, p.exercice_debut, rang);
  await db.query(`UPDATE compta.ecritures SET etat = 'validee', numero = $2, valide_par = $3, valide_le = NOW(), updated_at = NOW() WHERE id = $1`, [e.id, numero, auteurId]);
  return numero;
};

// ── Contre-passation ────────────────────────────────────────────────────────────────────────────────────────────────
// Le jour à Tunis (date par défaut d'une contre-passation).
const aujourdhuiTunis = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
// Corps : { date?, libelle?, reference? } — tout facultatif (date du jour, « Contre-passation de … », pièce de l'origine).
const lireContrepassation = (corps) => {
  if (!corps || typeof corps !== 'object') throw erreur(400, 'Contre-passation : requête invalide');
  let date = null;
  if (corps.date != null && corps.date !== '') {
    if (!dateValide(corps.date)) throw erreur(400, 'Date : date invalide (AAAA-MM-JJ)');
    date = corps.date;
  }
  return { date, libelle: lireTexte(corps.libelle, 'Libellé', LIBELLE_MAX), reference: corps.reference == null || corps.reference === '' ? null : lireReference(corps.reference) };
};
const libelleContrepassation = (e) => `Contre-passation de ${e.numero} : ${e.libelle}`.slice(0, LIBELLE_MAX);
// Les lignes inverses d'une écriture (ses lignes lues en base) : mêmes comptes, tiers, libellés et codes, débits et
// crédits échangés, sans échéance (NC 01 §56 : l'écriture inverse annule l'écriture d'origine, poste pour poste — les
// comptes ne sont pas rejugés : un compte subdivisé depuis reçoit quand même l'annulation de ce qu'il porte).
const lignesInverses = (lignes) => lignes.map((l) => ({
  rang: l.rang, compteId: l.compte_id, tiersId: l.tiers_id, libelle: l.libelle, debit: millimesDe(l.credit), credit: millimesDe(l.debit), taxeId: l.taxe_id, echeance: null,
}));

// ── Routes ──────────────────────────────────────────────────────────────────────────────────────────────────────────

// POST /api/compta/dossiers/:dossierId/ecritures/:ecritureId/valider — une écriture en brouillard, dans une période ouverte
// de l'exercice ouvert : état validée, numéro définitif suivant de son journal dans son exercice, auteur et heure ; journal
// D16 `ecriture_validee`. → { ecriture (avec lignes), nb }.
const valider = async (req, res) => {
  try {
    const resultat = await ecritureValidation(req, async (db, acces, d) => {
      const e = await ecritureDe(db, d.id, req.params.ecritureId);
      exigerBrouillard(e);
      const p = await periodeDuDossier(db, d.id, e.periode_id);
      exigerPeriodeOuverte(p);
      const numero = await poserNumero(db, e, p, await prochainRang(db, d.id, e.journal_id, p.exercice_id), req.user.id);
      await journaliser(db, acces.espace_id, req.user.id, 'ecriture_validee', { dossier: d.id, ecriture: e.id, numeroProvisoire: numeroProvisoire(e.numero_provisoire), numero, journal: e.journal_code, date: e.date, reference: e.reference, libelle: e.libelle, total: e.total_debit });
      return { ecriture: await uneEcriture(db, d.id, e.id), nb: await resumeEcritures(db, d.id) };
    });
    res.json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.validation.valider]');
  }
};

// POST /api/compta/dossiers/:dossierId/periodes/:periodeId/valider — toutes les écritures en brouillard de la période
// (ouverte, exercice ouvert), dans l'ordre des dates puis des numéros provisoires : la numérotation suit la chronologie ;
// un seul MAX par journal, puis les rangs se suivent ; un seul UPDATE pour toute la période (relecture de S6b : le verrou de
// la comptabilité ne reste pas posé le temps de milliers d'allers-retours). Journal D16 `periode_validee` (nombre, série par
// journal, et chaque écriture : identifiant, provisoire, définitif). → { periode (résumé), validees, nb }.
const validerPeriode = async (req, res) => {
  try {
    const resultat = await ecritureValidation(req, async (db, acces, d) => {
      const p = await periodeDuDossier(db, d.id, req.params.periodeId);
      exigerPeriodeOuverte(p);
      const rows = (await db.query(
        `SELECT e.id, e.journal_id, j.code AS journal_code, e.numero_provisoire, e.date::text AS date
           FROM compta.ecritures e JOIN compta.journaux j ON j.id = e.journal_id
          WHERE e.dossier_id = $1 AND e.periode_id = $2 AND e.etat = 'brouillard'
          ORDER BY e.date, e.numero_provisoire`,
        [d.id, p.id]
      )).rows;
      if (!rows.length) throw erreur(409, `Aucune écriture en brouillard dans la période ${libellePeriode(p)}`, 'RIEN_A_VALIDER');
      const rangs = new Map();
      const series = {};
      const numeros = [];
      for (const e of rows) {
        if (!rangs.has(e.journal_id)) rangs.set(e.journal_id, await prochainRang(db, d.id, e.journal_id, p.exercice_id));
        const rang = rangs.get(e.journal_id);
        rangs.set(e.journal_id, rang + 1);
        if (rang > NUMERO_MAX) throw erreur(409, `La série ${e.journal_code}-${String(p.exercice_debut).slice(0, 4)} est pleine (${NUMERO_MAX} écritures) : ouvrez un autre journal`, 'SERIE_PLEINE');
        const numero = numeroDefinitif(e.journal_code, p.exercice_debut, rang);
        numeros.push({ id: e.id, numeroProvisoire: numeroProvisoire(e.numero_provisoire), numero });
        const s = series[e.journal_code] || (series[e.journal_code] = { de: numero, a: numero, nombre: 0 });
        s.a = numero;
        s.nombre += 1;
      }
      const maj = await db.query(
        `UPDATE compta.ecritures e SET etat = 'validee', numero = v.numero, valide_par = $3, valide_le = NOW(), updated_at = NOW()
           FROM unnest($1::int[], $2::text[]) AS v(id, numero)
          WHERE e.id = v.id AND e.dossier_id = $4 AND e.etat = 'brouillard'`,
        [numeros.map((n) => n.id), numeros.map((n) => n.numero), req.user.id, d.id]
      );
      if (maj.rowCount !== numeros.length) throw erreur(409, 'Les écritures de la période ont changé pendant la validation : relisez la page', 'PERIME');
      await journaliser(db, acces.espace_id, req.user.id, 'periode_validee', { dossier: d.id, periode: p.id, debut: p.debut, fin: p.fin, nombre: rows.length, series, ecritures: numeros });
      return { periode: await resumePeriode(db, d.id, p.id), validees: rows.length, nb: await resumeEcritures(db, d.id) };
    });
    res.json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.validation.validerPeriode]');
  }
};

// POST /api/compta/dossiers/:dossierId/ecritures/:ecritureId/contrepasser — { date?, libelle?, reference? } : l'écriture
// inverse d'une écriture validée (une seule fois) — même journal (actif), datée du jour ou de la date choisie (période
// ouverte de l'exercice ouvert, jamais avant l'origine), libellée « Contre-passation de … », même pièce, lignes inverses,
// origine « contrepassation » liée à l'origine, numéro provisoire suivant du dossier et validée aussitôt (numéro définitif
// suivant de son journal dans l'exercice de sa date) ; journal D16 `ecriture_contrepassee`. → 201 { ecriture (l'inverse,
// avec lignes), origine (relue : son lien), nb }.
const contrepasser = async (req, res) => {
  try {
    const c = lireContrepassation(req.body || {});
    const resultat = await ecritureValidation(req, async (db, acces, d) => {
      const e = await ecritureDe(db, d.id, req.params.ecritureId);
      if (e.etat !== 'validee') throw erreur(409, `L'écriture ${numeroProvisoire(e.numero_provisoire)} est en brouillard : modifiez-la ou supprimez-la, la contre-passation sert aux écritures validées`, 'ECRITURE_BROUILLARD');
      if (e.contrepassee_par_id) throw erreur(409, `L'écriture ${e.numero} est déjà contre-passée par ${e.contrepassee_par_numero}`, 'DEJA_CONTREPASSEE');
      const date = c.date || aujourdhuiTunis();
      if (date < e.date) throw erreur(400, `La contre-passation (${fmtDate(date)}) ne peut pas précéder l'écriture d'origine (${fmtDate(e.date)})`, 'DATE_AVANT_ORIGINE');
      const journal = await journalDe(db, d.id, e.journal_id);
      const { exercice, periode } = await periodeDe(db, d.id, date);
      const lignes = lignesInverses((await lignesDe(db, [e.id])).get(e.id));
      const libelle = c.libelle || libelleContrepassation(e);
      const reference = c.reference || e.reference;
      const rang = await prochainRang(db, d.id, journal.id, exercice.id);
      if (rang > NUMERO_MAX) throw erreur(409, `La série ${journal.code}-${String(exercice.debut).slice(0, 4)} est pleine (${NUMERO_MAX} écritures) : ouvrez un autre journal`, 'SERIE_PLEINE');
      const numero = numeroDefinitif(journal.code, exercice.debut, rang);
      // Compteur provisoire du dossier (verrouillé par la transaction), comme toute écriture.
      const provisoire = (await db.query('UPDATE compta.dossiers SET prochain_provisoire = prochain_provisoire + 1 WHERE id = $1 RETURNING prochain_provisoire - 1 AS n', [d.id])).rows[0].n;
      const ins = await db.query(
        `INSERT INTO compta.ecritures (dossier_id, exercice_id, periode_id, journal_id, date, numero_provisoire, numero, reference, libelle, etat, total_debit, total_credit, origine, origine_id, cree_par, valide_par, valide_le)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'validee', $10, $10, 'contrepassation', $11, $12, $12, NOW()) RETURNING id`,
        [d.id, exercice.id, periode.id, journal.id, date, provisoire, numero, reference, libelle, e.total_debit, e.id, req.user.id]
      );
      await insererLignes(db, d, ins.rows[0].id, date, lignes);
      await journaliser(db, acces.espace_id, req.user.id, 'ecriture_contrepassee', {
        dossier: d.id, ecriture: e.id, numero: e.numero, journal: journal.code, total: e.total_debit,
        contrepassation: { id: ins.rows[0].id, numeroProvisoire: numeroProvisoire(provisoire), numero, date, reference, libelle },
      });
      return { ecriture: await uneEcriture(db, d.id, ins.rows[0].id), origine: await uneEcriture(db, d.id, e.id), nb: await resumeEcritures(db, d.id) };
    });
    res.status(201).json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.validation.contrepasser]');
  }
};

module.exports = {
  MSG_VALIDER, MSG_ROUVRIR, NUMERO_CHIFFRES, NUMERO_MAX, numeroDefinitif, rangDe, lireContrepassation, libelleContrepassation, lignesInverses,
  SQL_PERIODE, periodeDuDossier, libellePeriode, exigerExerciceOuvert, exigerPeriodeOuverte, ecritureValidation,
  valider, validerPeriode, contrepasser,
};
