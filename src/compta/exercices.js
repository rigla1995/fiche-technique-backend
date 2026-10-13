// LabFlow Compta, étape X1 « L'exercice suivant » (labflow-reprise/achats-compta/PLAN-EXERCICES.md §2 ligne X1, §3, §5 ;
// réponses du client du 13/10 — « ok pour les 5 »). Un dossier tient DEUX exercices ouverts au plus : on saisit en 2027
// pendant que 2026 attend son bilan. L'exercice suivant s'ouvre :
//   • À LA MAIN, avant l'heure, depuis la fiche du dossier (titulaire ou Complet) : le lendemain de la fin du dernier
//     exercice, 12 mois proposés (une fin plus proche est permise : changement de date de clôture) ;
//   • DE LUI-MÊME, à la première écriture datée après le dernier exercice — saisie, import, contre-passation, facture envoyée
//     depuis LabFlow — si sa date est d'aujourd'hui ou d'avant et tombe dans l'exercice proposé (règles : exercicesCalcul.js).
// Dans la transaction verrouillée de l'appelant (dossier relu sous verrou) : millésime unique dans le dossier (migration
// 234), périodes mensuelles, journal D16 `exercice_ouvert` (manuelle ou automatique, et ce qui l'a déclenchée). Rien ne se
// clôt ici (étape X2).
const { journaliser } = require('./journal');
const { erreur, repondreErreur } = require('./comptablesClient');
const { droits, dansEspaceDuDossier, presenterFiche, insererPeriodes, lireExercice } = require('./dossiers');
const C = require('./exercicesCalcul');

const MSG_OUVRIR = 'Seul le titulaire ou un gérant de niveau Complet peut ouvrir l\'exercice suivant';
const SQL_EXERCICES = 'SELECT id, debut::text AS debut, fin::text AS fin, etat, millesime FROM compta.exercices WHERE dossier_id = $1 ORDER BY debut DESC';

// Les exercices du dossier (du plus récent au plus ancien), sans leurs périodes.
const exercicesSeuls = async (db, dossierId) => (await db.query(SQL_EXERCICES, [dossierId])).rows;
// Les exercices du dossier avec leurs périodes (du plus récent au plus ancien) : la lecture commune de la saisie, des
// périodes, des livres et des taxes.
const exercicesDuDossier = async (db, dossierId) => {
  const ex = await exercicesSeuls(db, dossierId);
  if (!ex.length) return [];
  const periodes = (await db.query('SELECT id, exercice_id, debut::text AS debut, fin::text AS fin, etat FROM compta.periodes WHERE exercice_id = ANY($1) ORDER BY debut', [ex.map((x) => x.id)])).rows;
  return ex.map((x) => ({ id: x.id, debut: x.debut, fin: x.fin, etat: x.etat, millesime: x.millesime, periodes: periodes.filter((p) => p.exercice_id === x.id).map((p) => ({ id: p.id, debut: p.debut, fin: p.fin, etat: p.etat })) }));
};

// L'exercice précédent d'un exercice, s'il est encore OUVERT (ses soldes se reprennent alors en provisoire) ; sinon null.
const precedentOuvert = async (db, dossierId, exercice) => {
  const p = (await db.query(
    'SELECT id, debut::text AS debut, fin::text AS fin, etat, millesime FROM compta.exercices WHERE dossier_id = $1 AND fin < $2::date ORDER BY fin DESC LIMIT 1',
    [dossierId, exercice.debut]
  )).rows[0];
  return p && p.etat === 'ouvert' ? p : null;
};

// Ouvre l'exercice suivant du dossier `d` (relu sous verrou par l'appelant). `fin` : celle choisie à la main (sinon 12
// mois) ; `mode` : « manuelle » ou « auto » ; `declencheur` : ce qui a provoqué l'ouverture automatique ({ date, origine }).
// → { id, debut, fin, etat, millesime, premier: false }.
const ouvrirSuivant = async (db, d, { fin = null, mode, auteurId = null, espaceId, declencheur = null }) => {
  const exercices = await exercicesSeuls(db, d.id);
  const s = C.exerciceSuivant(exercices);
  if (!s) throw erreur(409, 'Aucun exercice dans ce dossier', 'EXERCICE_ABSENT');
  if (s.bloquant) throw erreur(409, `L'exercice ${C.libelleExercice(s.bloquant)} n'est pas clos : un dossier tient deux exercices ouverts au plus, clôturez-le avant d'ouvrir le suivant`, 'DEUX_EXERCICES_OUVERTS');
  const dates = fin ? lireExercice({ debut: s.debut, fin }) : { debut: s.debut, fin: s.fin };
  const millesime = C.millesimeDe(dates.debut, dates.fin, exercices.map((x) => x.millesime));
  if (millesime == null) throw erreur(409, `Les années ${dates.debut.slice(0, 4)} et ${dates.fin.slice(0, 4)} portent déjà un exercice de ce dossier : choisissez une autre date de fin`, 'MILLESIME_PRIS');
  const ex = (await db.query(
    'INSERT INTO compta.exercices (dossier_id, debut, fin, millesime, ouverture, ouvert_par) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
    [d.id, dates.debut, dates.fin, millesime, mode, auteurId]
  )).rows[0];
  const nbPeriodes = await insererPeriodes(db, ex.id, dates);
  await db.query('UPDATE compta.dossiers SET updated_at = NOW() WHERE id = $1', [d.id]);
  await journaliser(db, espaceId, auteurId, 'exercice_ouvert', {
    dossier: d.id, nom: d.nom, exercice: ex.id, debut: dates.debut, fin: dates.fin, millesime, periodes: nbPeriodes, mode, ...(declencheur ? { declencheur } : {}),
  });
  return { id: ex.id, debut: dates.debut, fin: dates.fin, etat: 'ouvert', millesime, premier: false };
};

// L'ouverture automatique (PLAN-EXERCICES §3) : une écriture datée `date`, hors de tout exercice, ouvre l'exercice suivant
// si les règles le permettent. `ctx` : { espaceId, auteurId, origine } (null : jamais d'ouverture). → l'exercice ouvert, ou
// null (la date reste refusée par l'appelant).
const ouvrirSiBesoin = async (db, dossierId, date, ctx) => {
  if (!ctx) return null;
  const s = C.ouvertureAutoPour(await exercicesSeuls(db, dossierId), date, C.aujourdhuiTunis());
  if (!s) return null;
  const d = (await db.query('SELECT id, nom FROM compta.dossiers WHERE id = $1', [dossierId])).rows[0];
  return ouvrirSuivant(db, d, { mode: 'auto', auteurId: ctx.auteurId, espaceId: ctx.espaceId, declencheur: { date, origine: ctx.origine } });
};

// Pourquoi une date après le dernier exercice n'ouvre rien (complément du refus « hors de l'exercice »), ou ''.
const raisonSansOuverture = (exercices, date, aujourdhui = C.aujourdhuiTunis()) => {
  const s = C.exerciceSuivant(exercices);
  if (!s || date < s.debut) return '';
  if (s.bloquant) return ` ; l'exercice suivant ne s'ouvre pas tant que l'exercice ${C.libelleExercice(s.bloquant)} n'est pas clos`;
  if (date > s.fin) return ` ; l'exercice suivant (${C.libelleExercice(s)}) ne la contient pas`;
  if (date > aujourdhui) return ` ; l'exercice suivant (${C.libelleExercice(s)}) s'ouvrira de lui-même à la première écriture datée d'un jour passé, ou depuis la fiche du dossier`;
  return '';
};

// ── Route ───────────────────────────────────────────────────────────────────────────────────────────────────────────

// Corps de l'ouverture à la main : { fin? } (vide = 12 mois).
const lireOuverture = (corps) => {
  if (corps != null && typeof corps !== 'object') throw erreur(400, 'Ouverture : requête invalide');
  const fin = corps?.fin;
  if (fin == null || fin === '') return { fin: null };
  if (typeof fin !== 'string') throw erreur(400, 'Exercice : date de fin invalide');
  return { fin };
};

// POST /api/compta/dossiers/:dossierId/exercices/suivant — { fin? } : ouvre l'exercice suivant (titulaire ou Complet,
// dossier non archivé) ; deux exercices ouverts au plus. → 201 la fiche du dossier.
const ouvrir = async (req, res) => {
  try {
    const { fin } = lireOuverture(req.body);
    const f = await dansEspaceDuDossier(req.user, req.params.dossierId, async (db, acces, d) => {
      if (!droits(acces).configurer) throw erreur(403, MSG_OUVRIR, 'NIVEAU_INSUFFISANT');
      if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\'abord', 'DOSSIER_ARCHIVE');
      await ouvrirSuivant(db, d, { fin, mode: 'manuelle', auteurId: req.user.id, espaceId: acces.espace_id });
      return presenterFiche(db, acces, (await db.query('SELECT * FROM compta.dossiers WHERE id = $1', [d.id])).rows[0]);
    });
    res.status(201).json(f);
  } catch (err) {
    repondreErreur(res, err, '[compta.exercices.ouvrir]');
  }
};

module.exports = {
  MSG_OUVRIR, SQL_EXERCICES, exercicesSeuls, exercicesDuDossier, precedentOuvert, ouvrirSuivant, ouvrirSiBesoin, raisonSansOuverture, lireOuverture,
  ouvrir,
};
