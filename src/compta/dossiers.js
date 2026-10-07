// LabFlow Compta, étape S4a « Les dossiers du cabinet » (labflow-reprise/achats-compta/PLAN-S4.md ; SPEC-SOCLE §3.2, D3,
// D4, D10, D16, D17 ; CADRAGE §3). Un dossier = une entité juridique tenue dans une comptabilité (compta.espaces) :
// identité (formulaire et lecture de la patente de LabFlow, D17), régime fiscal, exercice en cours et ses périodes
// mensuelles. Routes (D3) : la comptabilité voyage dans l'adresse (/espaces/:espaceId/dossiers, /dossiers/:dossierId)
// et chaque requête vérifie l'accès de la personne sur compta.acces — accès actif, comptabilité ouverte, dossier dans sa
// liste (tous_dossiers, sinon compta.acces_dossiers : remplie à l'étape S4c), niveau suffisant. Réponses du client du
// 07/10 : le titulaire et un gérant de niveau Complet créent et modifient ; Saisie et Consultation lisent ; archiver,
// désarchiver et supprimer = titulaire seul. Un dossier qui a une écriture ne se supprime jamais (D10 ; aucune écriture
// n'existe avant l'étape de la saisie : dossierMouvemente). Écritures dans la transaction verrouillée (comptabilité)
// puis garde par comptabilité (D4). Règles du chantier : jamais « gerant_parent_id || id » ni une garde cliente.
const pool = require('../config/database');
const { CHAMPS_IDENTITE, lireIdentite, mapIdentite, nomAffiche, identiteComplete } = require('../utils/identite');
const { journaliser } = require('./journal');
const { exigerEcriture, modeTitulaire, etatAbonnement } = require('./garde');
const { erreur, idValide, repondreErreur } = require('./comptablesClient');

// ── Régime fiscal (listes fermées, SPEC-SOCLE §3.2) ─────────────────────────────────────────────────────────────────
const PERSONNES = ['morale', 'physique'];
const IMPOTS = ['IS', 'IRPP'];
const TVA = ['reel', 'forfaitaire', 'non_assujetti'];
const FORMES_PHYSIQUES = ['EI', 'AUTO_ENTREPRENEUR'];
// Proposition de l'assistant d'après la forme juridique (modifiable) : entreprise individuelle et auto-entrepreneur →
// personne physique à l'IRPP ; les sociétés et associations → personne morale à l'IS (une société de personnes qui
// relève de l'IRPP corrige le choix).
const regimeParForme = (forme) => (FORMES_PHYSIQUES.includes(forme) ? { personne: 'physique', impot: 'IRPP' } : { personne: 'morale', impot: 'IS' });

const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const RE_DATE = /^\d{4}-\d{2}-\d{2}$/;
// 'YYYY-MM-DD' réellement existante (pas de 31 février ni de 13e mois : Date.parse rend NaN, jamais une exception) et
// acceptée par PostgreSQL (année 1 au moins).
const dateValide = (s) => {
  if (typeof s !== 'string' || !RE_DATE.test(s) || s < '0001-01-01') return false;
  const t = Date.parse(`${s}T00:00:00Z`);
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === s;
};

// Régime fiscal lu dans le corps → colonnes. `partiel` (modification) : seuls les champs présents ; sinon les trois
// listes sont obligatoires, les oui / non valent non et le début d'activité est vide par défaut.
const COLONNES_REGIME = { personne: 'personne', impot: 'impot', tva: 'tva', exportateurTotal: 'exportateur_total', teledeclaration: 'teledeclaration', debutActivite: 'debut_activite' };
const lireRegime = (body = {}, partiel = false) => {
  if (!body || typeof body !== 'object') throw erreur(400, 'Régime fiscal : requête invalide');
  const r = {};
  for (const [cle, liste, libelle] of [['personne', PERSONNES, 'Personne'], ['impot', IMPOTS, 'Impôt'], ['tva', TVA, 'TVA']]) {
    if (!hasOwn(body, cle)) {
      if (!partiel) throw erreur(400, `${libelle} : choisissez une valeur`);
      continue;
    }
    if (!liste.includes(body[cle])) throw erreur(400, `${libelle} : valeur inconnue`);
    r[cle] = body[cle];
  }
  for (const [cle, libelle] of [['exportateurTotal', 'Exportateur total'], ['teledeclaration', 'Télédéclaration']]) {
    if (!hasOwn(body, cle)) {
      if (!partiel) r[cle] = false;
      continue;
    }
    if (typeof body[cle] !== 'boolean') throw erreur(400, `${libelle} : oui ou non`);
    r[cle] = body[cle];
  }
  if (hasOwn(body, 'debutActivite')) {
    const v = body.debutActivite;
    if (v == null || v === '') r.debutActivite = null;
    else if (!dateValide(v)) throw erreur(400, 'Début d\'activité : date invalide');
    else r.debutActivite = v;
  } else if (!partiel) r.debutActivite = null;
  return r;
};

// ── Exercice et périodes mensuelles (réponse du client du 07/10 : dates libres dès S4) ──────────────────────────────
const MOIS_MAX = 12;
const pad = (n) => String(n).padStart(2, '0');
const dernierJourDuMois = (annee, mois) => new Date(Date.UTC(annee, mois, 0)).getUTCDate(); // mois : 1 à 12
const finDeMois = (s) => {
  const [a, m] = s.split('-').map(Number);
  return `${a}-${pad(m)}-${pad(dernierJourDuMois(a, m))}`;
};
// Mois couverts de debut à fin (un exercice du 15 juillet au 30 juin suivant en couvre 12).
const nbMois = (debut, fin) => {
  const [a0, m0] = debut.split('-').map(Number);
  const [a1, m1] = fin.split('-').map(Number);
  return (a1 * 12 + m1) - (a0 * 12 + m0) + 1;
};
// { debut, fin } contrôlés : dates réelles, fin après le début, fin le dernier jour d'un mois, 12 mois au plus (un
// premier exercice plus court est permis : début d'activité en cours d'année).
const lireExercice = (body = {}) => {
  if (!body || typeof body !== 'object') throw erreur(400, 'Exercice : requête invalide');
  const { debut, fin } = body;
  if (!dateValide(debut)) throw erreur(400, 'Exercice : date de début invalide');
  if (!dateValide(fin)) throw erreur(400, 'Exercice : date de fin invalide');
  if (fin < debut) throw erreur(400, 'Exercice : la fin doit suivre le début');
  if (fin !== finDeMois(fin)) throw erreur(400, 'Exercice : la fin doit être le dernier jour d\'un mois');
  if (nbMois(debut, fin) > MOIS_MAX) throw erreur(400, `Exercice : ${MOIS_MAX} mois au plus`);
  return { debut, fin };
};
// Périodes mensuelles d'un exercice : la première commence au début de l'exercice (même en cours de mois), les
// suivantes au 1er, la dernière finit avec l'exercice.
const periodesDe = ({ debut, fin }) => {
  const periodes = [];
  let [a, m] = debut.split('-').map(Number);
  for (;;) {
    const premier = `${a}-${pad(m)}-01`;
    const dernier = `${a}-${pad(m)}-${pad(dernierJourDuMois(a, m))}`;
    periodes.push({ debut: premier < debut ? debut : premier, fin: dernier > fin ? fin : dernier });
    if (dernier >= fin) break;
    if (m === 12) { a += 1; m = 1; } else m += 1;
  }
  return periodes;
};

// Année civile en cours à Tunis (premier exercice proposé ; dossier « Mon entreprise » d'un client, S4b).
const FORMAT_ANNEE_TUNIS = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Tunis', year: 'numeric' });
const anneeCivile = (d = new Date()) => {
  const a = FORMAT_ANNEE_TUNIS.format(d);
  return { debut: `${a}-01-01`, fin: `${a}-12-31` };
};

// ── Identité (D17 : mêmes règles que le client et le cabinet) ───────────────────────────────────────────────────────
// `partiel` (modification) : seuls les champs présents ; la raison sociale ne se vide jamais.
const lireIdentiteDossier = (body = {}, partiel = false) => {
  if (!body || typeof body !== 'object') throw erreur(400, 'Identité : requête invalide');
  const corps = {};
  for (const { champ } of CHAMPS_IDENTITE) {
    if (!hasOwn(body, champ)) continue;
    const v = body[champ];
    if (v != null && typeof v !== 'string') throw erreur(400, 'Identité : requête invalide');
    corps[champ] = v;
  }
  const { valeurs, erreurs, avertissements } = lireIdentite(corps);
  if (erreurs.length) throw erreur(400, erreurs[0].message);
  if ((!partiel || hasOwn(valeurs, 'raison_sociale')) && !valeurs.raison_sociale) throw erreur(400, 'Raison sociale obligatoire');
  return { valeurs, avertissements };
};

// ── Accès et droits ─────────────────────────────────────────────────────────────────────────────────────────────────
// L'accès de la personne à une comptabilité ouverte (titulaire ou gérant actif), avec la comptabilité ; `verrou` : la
// comptabilité est verrouillée (FOR UPDATE OF e) pour une écriture. Null = pas d'accès (ou comptabilité inconnue).
// `acces_id` : l'accès ; `espace_id` : la comptabilité.
const accesSurEspace = async (db, user, espaceId, verrou = false) => {
  if (!user?.id || !idValide(espaceId)) return null;
  const r = await db.query(
    `SELECT a.id AS acces_id, a.role, a.niveau, a.tous_dossiers, e.id AS espace_id, e.nom, e.type, e.titulaire_id
       FROM compta.acces a
       JOIN compta.espaces e ON e.id = a.espace_id
      WHERE a.personne_id = $1 AND a.espace_id = $2 AND a.etat = 'actif' AND e.etat = 'actif'
      ${verrou ? 'FOR UPDATE OF e' : ''}`,
    [user.id, espaceId]
  );
  return r.rows[0] || null;
};
const exigerAcces = async (db, user, espaceId, verrou = false) => {
  const acces = await accesSurEspace(db, user, espaceId, verrou);
  if (!acces) throw erreur(404, 'Comptabilité introuvable');
  return acces;
};
// Réponses du client du 07/10 (question 6) : Complet crée et modifie ; Saisie et Consultation lisent ; archiver,
// désarchiver et supprimer = titulaire seul.
const droits = (acces) => {
  const complet = acces.role === 'titulaire' || acces.niveau === 'complet';
  return { creer: complet, modifier: complet, archiver: acces.role === 'titulaire', supprimer: acces.role === 'titulaire' };
};
const MSG_NIVEAU = 'Seul le titulaire ou un gérant de niveau Complet peut créer ou modifier un dossier';
const MSG_TITULAIRE = 'Seul le titulaire peut archiver, désarchiver ou supprimer un dossier';

// Dossiers ouverts à l'accès : tous (tous_dossiers), sinon ceux de sa liste (S4c). Paramètres TOUJOURS $2 (tous_dossiers)
// et $3 (identifiant de l'accès) dans les requêtes qui l'emploient ; aucune lecture de dossiers ne s'en passe.
const SQL_VISIBLE = `($2::boolean OR EXISTS (SELECT 1 FROM compta.acces_dossiers ad WHERE ad.acces_id = $3 AND ad.dossier_id = d.id))`;
const paramsVisibles = (acces) => [acces.espace_id, acces.tous_dossiers, acces.acces_id];

// Un dossier « mouvementé » a au moins une écriture (D10) : aucune table d'écritures n'existe avant l'étape de la saisie,
// toujours faux ici. Seul endroit à compléter alors (supprimer un dossier, modifier son exercice).
const dossierMouvemente = async (_db, _dossierId) => false;

// ── Identité LabFlow d'un client (S4b : dossier « Mon entreprise », copie à la création puis reprise à la demande) ───
const texteCourt = (v, max) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim().slice(0, max));
// Ligne profil_entreprise (+ utilisateurs.nom en `contact`) → colonnes d'identité du dossier. Sans validation (LabFlow
// a déjà contrôlé ce qu'il a enregistré ; une vieille adresse libre est seulement bornée). La raison sociale ne se vide
// jamais : nom commercial, sinon nom du contact, sinon « Mon entreprise ».
const identiteLabflow = (row = {}) => {
  const v = {};
  for (const { colonne, max } of CHAMPS_IDENTITE) v[colonne] = texteCourt(row[colonne], max) || null;
  v.raison_sociale = v.raison_sociale || v.nom_commercial || texteCourt(row.contact, 255) || 'Mon entreprise';
  return v;
};
const SQL_IDENTITE_CLIENT = `
  SELECT u.nom AS contact, pe.raison_sociale, pe.nom_commercial, pe.forme_juridique, pe.matricule_fiscal, pe.rne, pe.adresse, pe.ville,
         pe.representant_nom, pe.representant_qualite
    FROM utilisateurs u
    LEFT JOIN profil_entreprise pe ON pe.client_id = u.id
   WHERE u.id = $1`;
const lireIdentiteClient = async (db, clientId) => identiteLabflow((await db.query(SQL_IDENTITE_CLIENT, [clientId])).rows[0] || {});

// Avertissement « déjà porté » dans la même comptabilité (même identifiant à 7 chiffres), parmi les dossiers ouverts à la
// personne (jamais le nom d'un dossier qu'elle ne voit pas) : jamais un refus (groupes, franchises). excludeId = le
// dossier en cours d'écriture.
const avertissementsMatriculeDossier = async (db, acces, mf, excludeId = null) => {
  if (!mf) return [];
  const r = await db.query(
    `SELECT d.nom FROM compta.dossiers d
      WHERE d.espace_id = $1 AND ${SQL_VISIBLE} AND LEFT(d.matricule_fiscal, 7) = LEFT($4, 7) AND ($5::int IS NULL OR d.id <> $5)
      ORDER BY d.id LIMIT 3`,
    [...paramsVisibles(acces), mf, excludeId]
  );
  return r.rows.map((x) => `Ce matricule fiscal est déjà porté par le dossier « ${x.nom} »`);
};

// ── Lectures ────────────────────────────────────────────────────────────────────────────────────────────────────────
const SQL_LISTE = `
  SELECT d.id, d.nom, d.raison_sociale, d.nom_commercial, d.forme_juridique, d.matricule_fiscal, d.adresse, d.ville,
         d.etat, d.source, d.created_at,
         ex.debut AS exercice_debut, ex.fin AS exercice_fin
    FROM compta.dossiers d
    LEFT JOIN LATERAL (
      SELECT x.debut, x.fin FROM compta.exercices x WHERE x.dossier_id = d.id AND x.etat = 'ouvert' ORDER BY x.debut DESC LIMIT 1
    ) ex ON true
   WHERE d.espace_id = $1 AND ${SQL_VISIBLE}
   ORDER BY d.etat, LOWER(d.nom), d.id`;
const presenterLigne = (d) => ({
  id: d.id,
  nom: d.nom,
  raisonSociale: d.raison_sociale,
  nomCommercial: d.nom_commercial,
  formeJuridique: d.forme_juridique,
  matriculeFiscal: d.matricule_fiscal,
  ville: d.ville,
  etat: d.etat,
  source: d.source,
  identiteComplete: identiteComplete(d),
  exercice: d.exercice_debut ? { debut: d.exercice_debut, fin: d.exercice_fin } : null,
  creeLe: d.created_at,
});
const presenterEspace = (acces) => ({ id: acces.espace_id, nom: acces.nom, type: acces.type, role: acces.role, niveau: acces.niveau });
const etatListe = async (db, acces) => {
  const [r, mode] = await Promise.all([
    db.query(SQL_LISTE, paramsVisibles(acces)),
    modeTitulaire(db, acces.espace_id),
  ]);
  return {
    espace: presenterEspace(acces),
    droits: droits(acces),
    dossiers: r.rows.map(presenterLigne),
    etatAbonnement: etatAbonnement(mode),
  };
};

// Le dossier, s'il est dans la comptabilité de l'accès et ouvert à lui ; `verrou` : ligne verrouillée (écriture).
const dossierDe = async (db, acces, dossierId, verrou = false) => {
  if (!idValide(dossierId)) throw erreur(404, 'Dossier introuvable');
  const r = await db.query(
    `SELECT d.* FROM compta.dossiers d WHERE d.espace_id = $1 AND ${SQL_VISIBLE} AND d.id = $4 ${verrou ? 'FOR UPDATE OF d' : ''}`,
    [...paramsVisibles(acces), dossierId]
  );
  if (!r.rows.length) throw erreur(404, 'Dossier introuvable');
  return r.rows[0];
};

const presenterRegime = (d) => ({
  personne: d.personne, impot: d.impot, tva: d.tva, exportateurTotal: d.exportateur_total, teledeclaration: d.teledeclaration, debutActivite: d.debut_activite,
});
// La fiche : identité, régime, exercice en cours (et ses périodes), qui y a accès, droits de la personne.
const presenterFiche = async (db, acces, d) => {
  const [ex, personnes, mode] = await Promise.all([
    db.query('SELECT id, debut, fin, etat FROM compta.exercices WHERE dossier_id = $1 ORDER BY debut DESC', [d.id]),
    db.query(
      `SELECT a.role, a.niveau, COALESCE(a.nom_attendu, u.nom) AS nom, u.email
         FROM compta.acces a
         JOIN utilisateurs u ON u.id = a.personne_id
        WHERE a.espace_id = $1 AND a.etat = 'actif'
          AND (a.tous_dossiers OR EXISTS (SELECT 1 FROM compta.acces_dossiers ad WHERE ad.acces_id = a.id AND ad.dossier_id = $2))
        ORDER BY a.role DESC, a.id`,
      [d.espace_id, d.id]
    ),
    modeTitulaire(db, d.espace_id),
  ]);
  const courant = ex.rows.find((x) => x.etat === 'ouvert') || ex.rows[0] || null;
  const periodes = courant
    ? (await db.query('SELECT debut, fin, etat FROM compta.periodes WHERE exercice_id = $1 ORDER BY debut', [courant.id])).rows
    : [];
  return {
    id: d.id,
    espace: presenterEspace(acces),
    nom: d.nom,
    etat: d.etat,
    source: d.source,
    identite: mapIdentite(d),
    identiteComplete: identiteComplete(d),
    regime: presenterRegime(d),
    pays: d.pays,
    devise: d.devise,
    decimales: d.decimales,
    exercice: courant ? { id: courant.id, debut: courant.debut, fin: courant.fin, etat: courant.etat, periodes } : null,
    exercices: ex.rows.map((x) => ({ id: x.id, debut: x.debut, fin: x.fin, etat: x.etat })),
    acces: personnes.rows.map((p) => ({ role: p.role, niveau: p.niveau, nom: p.nom, email: p.email })),
    droits: droits(acces),
    mouvemente: await dossierMouvemente(db, d.id),
    creeLe: d.created_at,
    modifieLe: d.updated_at,
    etatAbonnement: etatAbonnement(mode),
  };
};

// ── Écritures ───────────────────────────────────────────────────────────────────────────────────────────────────────
// Transaction sur une comptabilité, verrouillée, l'accès de la personne vérifié, garde par comptabilité comprise (D4).
// `{ garde: false }` n'est employé par aucune route des dossiers (rien n'y est « toujours permis »).
const dansEspaceDossiers = async (user, espaceId, travail, { garde = true } = {}) => {
  if (!idValide(espaceId)) throw erreur(404, 'Comptabilité introuvable');
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const acces = await exigerAcces(db, user, espaceId, true);
    if (garde) await exigerEcriture(db, acces.espace_id);
    const resultat = await travail(db, acces);
    await db.query('COMMIT');
    return resultat;
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    db.release();
  }
};
// Même transaction à partir d'un dossier : sa comptabilité est lue, puis verrouillée, puis le dossier relu sous verrou
// (un dossier d'une autre comptabilité, ou fermé à la personne, est « introuvable » : jamais 403).
const dansEspaceDuDossier = async (user, dossierId, travail, options) => {
  if (!idValide(dossierId)) throw erreur(404, 'Dossier introuvable');
  const e = await pool.query('SELECT espace_id FROM compta.dossiers WHERE id = $1', [dossierId]);
  if (!e.rows.length) throw erreur(404, 'Dossier introuvable');
  try {
    return await dansEspaceDossiers(user, e.rows[0].espace_id, async (db, acces) => travail(db, acces, await dossierDe(db, acces, dossierId, true)), options);
  } catch (err) {
    if (err.statusCode === 404) throw erreur(404, 'Dossier introuvable');
    throw err;
  }
};

const COLONNES_IDENTITE = CHAMPS_IDENTITE.map((c) => c.colonne);
// Premier exercice d'un dossier et ses périodes (toutes ouvertes).
const creerExercice = async (db, dossierId, { debut, fin }) => {
  const ex = (await db.query('INSERT INTO compta.exercices (dossier_id, debut, fin) VALUES ($1, $2, $3) RETURNING id', [dossierId, debut, fin])).rows[0];
  await insererPeriodes(db, ex.id, { debut, fin });
  return ex;
};
const insererPeriodes = async (db, exerciceId, exercice) => {
  const periodes = periodesDe(exercice);
  const valeurs = periodes.map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`).join(', ');
  await db.query(`INSERT INTO compta.periodes (exercice_id, debut, fin) VALUES ${valeurs}`, [exerciceId, ...periodes.flatMap((p) => [p.debut, p.fin])]);
  return periodes.length;
};

// ── Routes ──────────────────────────────────────────────────────────────────────────────────────────────────────────

// GET /api/compta/espaces/:espaceId/dossiers — les dossiers ouverts à la personne dans cette comptabilité.
const lister = async (req, res) => {
  try {
    const acces = await exigerAcces(pool, req.user, req.params.espaceId);
    res.json(await etatListe(pool, acces));
  } catch (err) {
    repondreErreur(res, err, '[compta.dossiers.lister]');
  }
};

// POST /api/compta/espaces/:espaceId/dossiers — l'assistant : { identite, regime, exercice }. Tout est contrôlé avant la
// moindre requête ; le dossier, son premier exercice et ses périodes naissent dans la même transaction.
const creer = async (req, res) => {
  try {
    const corps = req.body || {};
    const identite = lireIdentiteDossier(corps.identite || {});
    const regime = lireRegime(corps.regime || {});
    const exercice = lireExercice(corps.exercice || {});
    const { fiche: f, avertissements } = await dansEspaceDossiers(req.user, req.params.espaceId, async (db, acces) => {
      if (!droits(acces).creer) throw erreur(403, MSG_NIVEAU, 'NIVEAU_INSUFFISANT');
      const v = identite.valeurs;
      const colonnes = COLONNES_IDENTITE.filter((c) => hasOwn(v, c));
      const params = [acces.espace_id, nomAffiche(v).slice(0, 255), req.user.id, regime.personne, regime.impot, regime.tva, regime.exportateurTotal, regime.teledeclaration, regime.debutActivite, ...colonnes.map((c) => v[c])];
      const ins = await db.query(
        `INSERT INTO compta.dossiers (espace_id, nom, cree_par, personne, impot, tva, exportateur_total, teledeclaration, debut_activite${colonnes.map((c) => `, ${c}`).join('')})
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9${colonnes.map((_, i) => `, $${i + 10}`).join('')})
         RETURNING *`,
        params
      );
      const d = ins.rows[0];
      const ex = await creerExercice(db, d.id, exercice);
      await journaliser(db, acces.espace_id, req.user.id, 'dossier_cree', { dossier: d.id, nom: d.nom, matricule: d.matricule_fiscal });
      await journaliser(db, acces.espace_id, req.user.id, 'exercice_cree', { dossier: d.id, exercice: ex.id, debut: exercice.debut, fin: exercice.fin });
      return {
        fiche: await presenterFiche(db, acces, d),
        avertissements: [...identite.avertissements, ...await avertissementsMatriculeDossier(db, acces, d.matricule_fiscal, d.id)],
      };
    });
    res.status(201).json({ ...f, avertissements });
  } catch (err) {
    repondreErreur(res, err, '[compta.dossiers.creer]');
  }
};

// GET /api/compta/dossiers/:dossierId — la fiche (lecture : tout niveau).
const fiche = async (req, res) => {
  try {
    if (!idValide(req.params.dossierId)) throw erreur(404, 'Dossier introuvable');
    const e = await pool.query('SELECT espace_id FROM compta.dossiers WHERE id = $1', [req.params.dossierId]);
    const acces = e.rows.length ? await accesSurEspace(pool, req.user, e.rows[0].espace_id) : null;
    if (!acces) throw erreur(404, 'Dossier introuvable');
    const d = await dossierDe(pool, acces, req.params.dossierId);
    res.json(await presenterFiche(pool, acces, d));
  } catch (err) {
    repondreErreur(res, err, '[compta.dossiers.fiche]');
  }
};

// Partie du corps présente et non vide (un `{}` vaut « rien »).
const partie = (corps, cle, lire) => {
  if (!corps[cle]) return null;
  const lu = lire(corps[cle]);
  const valeurs = cle === 'identite' ? lu.valeurs : lu;
  return Object.keys(valeurs).length ? lu : null;
};

// Écrit les colonnes d'identité et de régime données (le nom suit l'identité) et journalise les champs réellement
// changés, avec la valeur d'avant et celle d'après (D16). `identite` : colonnes → valeurs ; `regime` : clés de l'API.
// → les changements (vide si rien n'a changé : alors aucune ligne de journal).
const mettreAJour = async (db, acces, d, { identite = null, regime = null }, auteurId, details = {}) => {
  const sets = [];
  const params = [d.id];
  const changements = {};
  const poser = (colonne, valeur) => {
    params.push(valeur);
    sets.push(`${colonne} = $${params.length}`);
    if ((d[colonne] ?? null) !== (valeur ?? null)) changements[colonne] = { avant: d[colonne] ?? null, apres: valeur ?? null };
  };
  if (identite) {
    for (const [colonne, valeur] of Object.entries(identite)) poser(colonne, valeur);
    poser('nom', nomAffiche({ ...d, ...identite }).slice(0, 255));
  }
  if (regime) {
    for (const [cle, valeur] of Object.entries(regime)) poser(COLONNES_REGIME[cle], valeur);
  }
  // Rien ne change : ni écriture (updated_at reste juste), ni ligne de journal.
  if (!Object.keys(changements).length) return changements;
  await db.query(`UPDATE compta.dossiers SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`, params);
  await journaliser(db, acces.espace_id, auteurId, 'dossier_modifie', { dossier: d.id, nom: nomAffiche({ ...d, ...(identite || {}) }).slice(0, 255), changements, ...details });
  return changements;
};

// PUT /api/compta/dossiers/:dossierId — { identite?, regime?, exercice? } ; un dossier archivé ne se modifie pas.
// L'exercice ouvert reçoit ses nouvelles dates et ses périodes sont refaites, tant qu'aucune écriture n'existe. Le
// journal garde, pour chaque champ changé, la valeur d'avant et celle d'après (D16).
const modifier = async (req, res) => {
  try {
    const corps = req.body || {};
    const identite = partie(corps, 'identite', (x) => lireIdentiteDossier(x, true));
    const regime = partie(corps, 'regime', (x) => lireRegime(x, true));
    const exercice = corps.exercice ? lireExercice(corps.exercice) : null;
    if (!identite && !regime && !exercice) throw erreur(400, 'Rien à modifier');
    const { fiche: f, avertissements } = await dansEspaceDuDossier(req.user, req.params.dossierId, async (db, acces, d) => {
      if (!droits(acces).modifier) throw erreur(403, MSG_NIVEAU, 'NIVEAU_INSUFFISANT');
      if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\'abord', 'DOSSIER_ARCHIVE');
      await mettreAJour(db, acces, d, { identite: identite ? identite.valeurs : null, regime }, req.user.id);
      if (exercice) {
        const courant = (await db.query(`SELECT id, debut, fin FROM compta.exercices WHERE dossier_id = $1 AND etat = 'ouvert' ORDER BY debut DESC LIMIT 1 FOR UPDATE`, [d.id])).rows[0];
        if (!courant) throw erreur(409, 'Aucun exercice ouvert', 'EXERCICE_CLOS');
        if (await dossierMouvemente(db, d.id)) throw erreur(409, 'Ce dossier a des écritures : les dates de l\'exercice ne changent plus', 'DOSSIER_MOUVEMENTE');
        await db.query('DELETE FROM compta.periodes WHERE exercice_id = $1', [courant.id]);
        await db.query('UPDATE compta.exercices SET debut = $2, fin = $3 WHERE id = $1', [courant.id, exercice.debut, exercice.fin]);
        await insererPeriodes(db, courant.id, exercice);
        await db.query('UPDATE compta.dossiers SET updated_at = NOW() WHERE id = $1', [d.id]);
        await journaliser(db, acces.espace_id, req.user.id, 'exercice_modifie', { dossier: d.id, exercice: courant.id, avant: { debut: courant.debut, fin: courant.fin }, apres: exercice });
      }
      const apres = (await db.query('SELECT * FROM compta.dossiers WHERE id = $1', [d.id])).rows[0];
      return {
        fiche: await presenterFiche(db, acces, apres),
        avertissements: identite ? [...identite.avertissements, ...await avertissementsMatriculeDossier(db, acces, apres.matricule_fiscal, d.id)] : [],
      };
    });
    res.json({ ...f, avertissements });
  } catch (err) {
    repondreErreur(res, err, '[compta.dossiers.modifier]');
  }
};

// POST /api/compta/dossiers/:dossierId/reprendre-identite — dossier « Mon entreprise » d'un client LabFlow (source
// « labflow », S4b) : l'identité LabFlow du client (profil_entreprise, page « Mon entreprise » de LabFlow) est recopiée
// dans le dossier, champ par champ (règle PLAN-S4 §4 : copie à la création, puis indépendante ; recopie à la demande).
// Mêmes droits que la modification. `reprise` : nombre de champs changés (0 = identique).
const reprendreIdentite = async (req, res) => {
  try {
    const { fiche: f, avertissements, reprise } = await dansEspaceDuDossier(req.user, req.params.dossierId, async (db, acces, d) => {
      if (!droits(acces).modifier) throw erreur(403, MSG_NIVEAU, 'NIVEAU_INSUFFISANT');
      if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\'abord', 'DOSSIER_ARCHIVE');
      if (d.source !== 'labflow' || !d.client_labflow_id || d.client_labflow_id !== acces.titulaire_id || acces.type !== 'client_labflow') {
        throw erreur(409, 'Ce dossier n\'est pas celui d\'un client LabFlow : son identité ne se reprend pas', 'PAS_LABFLOW');
      }
      // Seuls les champs que LabFlow connaît sont recopiés : un champ vide dans LabFlow n'efface rien dans le dossier
      // (ce qui n'a été saisi que dans le dossier reste).
      const identite = Object.fromEntries(Object.entries(await lireIdentiteClient(db, d.client_labflow_id)).filter(([, v]) => v != null));
      const changements = await mettreAJour(db, acces, d, { identite }, req.user.id, { reprise: 'labflow' });
      const apres = (await db.query('SELECT * FROM compta.dossiers WHERE id = $1', [d.id])).rows[0];
      return {
        fiche: await presenterFiche(db, acces, apres),
        avertissements: await avertissementsMatriculeDossier(db, acces, apres.matricule_fiscal, d.id),
        reprise: Object.keys(changements).filter((c) => c !== 'nom').length,
      };
    });
    res.json({ ...f, avertissements, reprise });
  } catch (err) {
    repondreErreur(res, err, '[compta.dossiers.reprendre]');
  }
};

// Archiver ou désarchiver (titulaire seul) : le dossier change d'état, rien n'est effacé.
const changerEtat = async (db, acces, d, auteurId, etat) => {
  if (!droits(acces).archiver) throw erreur(403, MSG_TITULAIRE, 'TITULAIRE_SEUL');
  if (d.etat === etat) throw erreur(409, etat === 'archive' ? 'Ce dossier est déjà archivé' : 'Ce dossier n\'est pas archivé', 'DEJA_FAIT');
  const apres = (await db.query('UPDATE compta.dossiers SET etat = $2, updated_at = NOW() WHERE id = $1 RETURNING *', [d.id, etat])).rows[0];
  await journaliser(db, acces.espace_id, auteurId, etat === 'archive' ? 'dossier_archive' : 'dossier_desarchive', { dossier: d.id, nom: d.nom });
  return presenterFiche(db, acces, apres);
};

// POST /api/compta/dossiers/:dossierId/archiver
const archiver = async (req, res) => {
  try {
    res.json(await dansEspaceDuDossier(req.user, req.params.dossierId, (db, acces, d) => changerEtat(db, acces, d, req.user.id, 'archive')));
  } catch (err) {
    repondreErreur(res, err, '[compta.dossiers.archiver]');
  }
};

// POST /api/compta/dossiers/:dossierId/desarchiver
const desarchiver = async (req, res) => {
  try {
    res.json(await dansEspaceDuDossier(req.user, req.params.dossierId, (db, acces, d) => changerEtat(db, acces, d, req.user.id, 'actif')));
  } catch (err) {
    repondreErreur(res, err, '[compta.dossiers.desarchiver]');
  }
};

// DELETE /api/compta/dossiers/:dossierId — titulaire seul, dossier sans écriture (D10), archivé ou non ; le journal garde
// de quoi l'identifier (exercices et périodes suivent en cascade).
const supprimer = async (req, res) => {
  try {
    await dansEspaceDuDossier(req.user, req.params.dossierId, async (db, acces, d) => {
      if (!droits(acces).supprimer) throw erreur(403, MSG_TITULAIRE, 'TITULAIRE_SEUL');
      // S4b : le dossier « Mon entreprise » d'un client LabFlow ne se supprime jamais (il renaîtrait à la prochaine
      // activation) : il s'archive.
      if (d.source === 'labflow') throw erreur(409, 'Le dossier « Mon entreprise » ne se supprime pas : archivez-le', 'DOSSIER_LABFLOW');
      if (await dossierMouvemente(db, d.id)) throw erreur(409, 'Ce dossier a des écritures : il ne peut pas être supprimé, archivez-le', 'DOSSIER_MOUVEMENTE');
      await journaliser(db, acces.espace_id, req.user.id, 'dossier_supprime', { dossier: d.id, nom: d.nom, raisonSociale: d.raison_sociale, matricule: d.matricule_fiscal });
      await db.query('DELETE FROM compta.dossiers WHERE id = $1', [d.id]);
      return {};
    });
    res.status(204).send();
  } catch (err) {
    repondreErreur(res, err, '[compta.dossiers.supprimer]');
  }
};

module.exports = {
  PERSONNES, IMPOTS, TVA, MOIS_MAX, regimeParForme, lireRegime, lireExercice, periodesDe, nbMois, finDeMois, dateValide, anneeCivile, lireIdentiteDossier, droits,
  accesSurEspace, dossierMouvemente, creerExercice, identiteLabflow, lireIdentiteClient, SQL_IDENTITE_CLIENT,
  lister, creer, fiche, modifier, reprendreIdentite, archiver, desarchiver, supprimer,
};
