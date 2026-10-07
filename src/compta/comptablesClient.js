// LabFlow Compta, étape S3b « Le comptable du client » (labflow-reprise/achats-compta/PLAN-S3b.md ; SPEC-SOCLE D2, D3,
// D4, D14, D16). Deux côtés :
// - le TITULAIRE (client LabFlow qui a le module) gère les accès comptables de sa comptabilité : son comptable (accès
//   OBLIGATOIRE, compris dans le module : désigné, réattribué ou retiré — il redevient « à attribuer », jamais supprimé)
//   et ses gérants comptables supplémentaires (dans la limite achetée, abonnement_config.nb_gerants_compta) ;
// - la PERSONNE à qui une comptabilité est confiée : sa page « Comptabilité de … » et « Quitter cet accès ».
// Une adresse inconnue crée un compte LabFlow Compta (rôle « comptable », invitation 48 h) ; une adresse connue reçoit
// l'accès tout de suite (email « on vous a confié … »). Réponses du client du 07/10 : retrait et réattribution SANS
// email à la personne qui perd l'accès ; quand un comptable quitte, le client est prévenu (cloche et email).
// Règles du chantier : jamais « gerant_parent_id || id » ni les gardes clientes ; l'accès est vérifié sur compta.acces ;
// chaque écriture du titulaire passe par la garde par comptabilité (garde.js, D4) ; quitter un accès n'est jamais refusé.
const pool = require('../config/database');
const { generateInviteToken } = require('../services/emailService');
const { sendAccesComptaEmail, sendComptablePartiEmail } = require('./emails');
const { pushTo } = require('../services/sseService');
const { saveNotification } = require('../controllers/notificationController');
const { vocabForClient } = require('../utils/vocabCompte');
const { mapIdentite } = require('../utils/identite');
const { journaliser } = require('./journal');
const { exigerEcriture, modeTitulaire, etatAbonnement } = require('./garde');

const NIVEAUX = ['consultation', 'saisie', 'complet'];
// Adresse simple : ni espace, ni chevrons, virgules, guillemets ou parenthèses (relecture de S3b).
const RE_EMAIL = /^[^\s@<>,;:"'()[\]\\]+@[^\s@<>,;:"'()[\]\\]+\.[^\s@<>,;:"'()[\]\\]+$/;
// Adresses qui ne reçoivent jamais d'accès : l'équipe LabFlow et les acheteurs (portail de commande).
const ROLES_REFUSES = ['super_admin', 'boss', 'acheteur'];
const INVITATION_MS = 48 * 60 * 60 * 1000;
// Une invitation encore valable plus de 24 h est renvoyée telle quelle (relecture de S3b : un tiers ne doit pas pouvoir
// périmer sans fin le lien d'un compte non activé en le désignant ou en renvoyant l'invitation).
const INVITATION_REUTILISABLE_MS = 24 * 60 * 60 * 1000;

const erreur = (statusCode, message, code) => Object.assign(new Error(message), { statusCode, code });
const idValide = (v) => /^\d{1,9}$/.test(String(v));
const repondreErreur = (res, err, journal) => {
  if (err.statusCode) return res.status(err.statusCode).json({ message: err.message, ...(err.code ? { code: err.code } : {}) });
  console.error(journal, err);
  return res.status(500).json({ message: 'Erreur serveur' });
};

// ── Lectures ────────────────────────────────────────────────────────────────────────────────────────────────────────

// La comptabilité (ouverte) dont la personne est titulaire, comme client LabFlow ; verrouillée pour une écriture.
const espaceDuTitulaire = async (db, userId, verrou = false) => {
  const r = await db.query(
    `SELECT e.id, e.nom, e.titulaire_id
       FROM compta.espaces e
       JOIN compta.acces a ON a.espace_id = e.id
      WHERE a.personne_id = $1 AND a.role = 'titulaire' AND a.etat = 'actif'
        AND e.type = 'client_labflow' AND e.etat = 'actif'
      ${verrou ? 'FOR UPDATE OF e' : ''}`,
    [userId]
  );
  return r.rows[0] || null;
};
const exigerEspace = async (db, user, verrou = false) => {
  const espace = user?.role === 'client' ? await espaceDuTitulaire(db, user.id, verrou) : null;
  if (!espace) throw erreur(404, 'Le module Comptabilité n\'est pas activé sur ce compte', 'MODULE_INACTIF');
  return espace;
};

// Gérants comptables supplémentaires achetés (en plus du comptable compris dans le module).
const limiteSupplementaires = async (db, titulaireId) => {
  const r = await db.query(
    `SELECT ac.nb_gerants_compta
       FROM abonnements a JOIN abonnement_config ac ON ac.abonnement_id = a.id
      WHERE a.client_id = $1 AND a.produit = 'labflow'
      ORDER BY a.id DESC LIMIT 1`,
    [titulaireId]
  );
  return Number(r.rows[0]?.nb_gerants_compta) || 0;
};

const SQL_COMPTABLES = `
  SELECT a.id, a.obligatoire, a.niveau, a.nom_attendu, a.email_attendu, a.attribue_le, a.personne_id,
         u.nom, u.email, u.role AS personne_role, u.activated_at, (u.mot_de_passe IS NOT NULL) AS a_mot_de_passe
    FROM compta.acces a
    LEFT JOIN utilisateurs u ON u.id = a.personne_id
   WHERE a.espace_id = $1 AND a.role = 'gerant'`;

// Un accès comptable tel que le titulaire le voit : le nom qu'il a saisi (sinon celui de la personne), l'adresse de la
// personne, l'état « invitation envoyée » tant que le compte n'est pas activé.
const presenterComptable = (x) => {
  const attribue = x.personne_id != null;
  const invitation = attribue && !x.activated_at && !x.a_mot_de_passe;
  return {
    id: x.id,
    obligatoire: x.obligatoire,
    etat: attribue ? 'actif' : 'a_attribuer',
    niveau: x.niveau,
    nom: attribue ? (x.nom_attendu || x.nom || null) : null,
    email: attribue ? (x.email || x.email_attendu || null) : null,
    invitationEnAttente: invitation,
    // Seul un compte LabFlow Compta jamais activé reçoit une nouvelle invitation (les autres ont la leur).
    invitationRenvoyable: invitation && x.personne_role === 'comptable',
    attribueLe: attribue ? x.attribue_le : null,
  };
};

const lireComptables = async (db, espaceId) =>
  (await db.query(`${SQL_COMPTABLES} ORDER BY a.obligatoire DESC, a.id`, [espaceId])).rows.map(presenterComptable);

// Demande d'ajout de gérants comptables encore en attente (une à la fois, comme les autres suppléments).
const demandeEnAttente = async (db, titulaireId) => {
  const r = await db.query(
    `SELECT 1 FROM support_demandes
      WHERE client_id = $1 AND type = 'supplement' AND statut = 'en_attente' AND nb_gerants_compta_supp > 0
      LIMIT 1`,
    [titulaireId]
  );
  return r.rows.length > 0;
};

const etatTitulaire = async (db, espace) => {
  const [comptables, limite, demande] = await Promise.all([
    lireComptables(db, espace.id),
    limiteSupplementaires(db, espace.titulaire_id),
    demandeEnAttente(db, espace.titulaire_id),
  ]);
  const supplementaires = comptables.filter((c) => !c.obligatoire).length;
  return {
    espace: { id: espace.id, nom: espace.nom },
    comptables,
    supplementaires: { utilises: supplementaires, limite },
    niveaux: NIVEAUX,
    demandeEnCours: demande,
  };
};

// ── Saisie ──────────────────────────────────────────────────────────────────────────────────────────────────────────

// { nom, email, niveau } d'une désignation. `partiel` : modification (champs absents gardés).
// Jeton d'invitation d'un compte non activé : celui en cours s'il est valable encore plus de 24 h, sinon un nouveau (48 h).
const jetonInvitation = async (db, personneId) => {
  const r = await db.query('SELECT invite_token, invite_token_expires_at FROM utilisateurs WHERE id = $1', [personneId]);
  const { invite_token: actuel, invite_token_expires_at: expire } = r.rows[0] || {};
  if (actuel && expire && new Date(expire).getTime() - Date.now() > INVITATION_REUTILISABLE_MS) return actuel;
  const jeton = generateInviteToken();
  await db.query(
    'UPDATE utilisateurs SET invite_token = $1, invite_token_expires_at = $2, updated_at = NOW() WHERE id = $3 AND activated_at IS NULL',
    [jeton, new Date(Date.now() + INVITATION_MS), personneId]
  );
  return jeton;
};

const lireSaisie = (body, partiel = false) => {
  const out = {};
  if (body?.nom !== undefined || !partiel) {
    const nom = String(body?.nom ?? '').trim();
    if (!nom || [...nom].length > 100) throw erreur(400, 'Nom requis (100 caractères au plus)');
    out.nom = nom;
  }
  if (body?.email !== undefined || !partiel) {
    const email = String(body?.email ?? '').trim().toLowerCase();
    if (!email || email.length > 255 || !RE_EMAIL.test(email)) throw erreur(400, 'Adresse email invalide');
    out.email = email;
  }
  if (body?.niveau !== undefined || !partiel) {
    const niveau = body?.niveau ?? 'complet';
    if (!NIVEAUX.includes(niveau)) throw erreur(400, 'Niveau attendu : consultation, saisie ou complet');
    out.niveau = niveau;
  }
  return out;
};

/**
 * Donne l'accès `accesId` (de l'espace verrouillé) à la personne de l'adresse `email`, dans la transaction `db`.
 * Personne inconnue → compte LabFlow Compta créé (rôle « comptable », adresse en minuscules, invitation 48 h) ;
 * personne connue → accès ajouté tout de suite (D14) ; compte LabFlow Compta jamais activé → nouvelle invitation.
 * Renvoie { personneId, nom, email, nouvelle, jeton } (jeton : invitation à envoyer après le COMMIT).
 */
const attribuer = async (db, { espace, accesId, nom, email, niveau }) => {
  const existant = (await db.query(
    `SELECT id, nom, email, role, actif, activated_at, (mot_de_passe IS NOT NULL) AS a_mot_de_passe
       FROM utilisateurs WHERE LOWER(email) = LOWER($1)
      ORDER BY (email = $1) DESC, id LIMIT 1`,
    [email]
  )).rows[0];
  let personneId;
  let jeton = null;
  let nouvelle = false;
  if (existant) {
    if (existant.id === espace.titulaire_id) {
      throw erreur(409, 'Cette adresse est la vôtre : vous êtes déjà titulaire de cette comptabilité', 'ADRESSE_TITULAIRE');
    }
    if (ROLES_REFUSES.includes(existant.role) || existant.actif !== true) {
      throw erreur(409, 'Cette adresse ne peut pas recevoir d\'accès à une comptabilité', 'ADRESSE_REFUSEE');
    }
    const double = await db.query(
      'SELECT 1 FROM compta.acces WHERE espace_id = $1 AND personne_id = $2 AND id <> $3',
      [espace.id, existant.id, accesId]
    );
    if (double.rows.length) throw erreur(409, 'Cette personne a déjà un accès à votre comptabilité', 'DEJA_ACCES');
    personneId = existant.id;
    if (existant.role === 'comptable' && !existant.activated_at && !existant.a_mot_de_passe) jeton = await jetonInvitation(db, personneId);
  } else {
    jeton = generateInviteToken();
    nouvelle = true;
    personneId = (await db.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, telephone, role, onboarding_step, invite_token, invite_token_expires_at)
       VALUES ($1, $2, NULL, NULL, 'comptable', 0, $3, $4) RETURNING id`,
      [nom, email, jeton, new Date(Date.now() + INVITATION_MS)]
    )).rows[0].id;
  }
  const maj = await db.query(
    `UPDATE compta.acces
        SET personne_id = $2, etat = 'actif', niveau = $3, nom_attendu = $4, email_attendu = $5,
            attribue_le = NOW(), updated_at = NOW()
      WHERE id = $1`,
    [accesId, personneId, niveau, nom, email]
  );
  if (!maj.rowCount) throw erreur(404, 'Accès introuvable');
  // L'email part à l'adresse enregistrée de la personne (une personne existante garde la sienne).
  return { personneId, nom, email: existant ? existant.email : email, nouvelle, jeton };
};

// Email à la personne qui vient de recevoir l'accès (après le COMMIT ; un échec d'envoi ne défait rien).
const prevenir = async (attribution, espace) => {
  try {
    await sendAccesComptaEmail({ to: attribution.email, nom: attribution.nom, clientNom: espace.nom, token: attribution.jeton });
    return true;
  } catch (e) {
    console.error('[compta.comptables] email :', e.message);
    return false;
  }
};

// Transaction sur l'espace du titulaire, verrouillé (désignations, limite et unicité se suivent au lieu de se croiser),
// garde par comptabilité comprise.
const dansEspace = async (user, travail) => {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // Ordre des verrous de moduleClient.basculer : configuration du compte, puis comptabilité (une désignation ne se
    // croise pas avec une baisse de la limite par l'admin, sans interblocage).
    if (user?.role === 'client') {
      await db.query(
        `SELECT 1 FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id WHERE a.client_id = $1 FOR UPDATE OF ac`,
        [user.id]
      );
    }
    const espace = await exigerEspace(db, user, true);
    await exigerEcriture(db, espace.id);
    const resultat = await travail(db, espace);
    await db.query('COMMIT');
    return { espace, ...resultat };
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    // Deux créations simultanées de la même adresse : l'index unique tranche.
    if (err.code === '23505') throw erreur(409, 'Cette adresse vient d\'être enregistrée : réessayez', 'ADRESSE_CONCURRENTE');
    throw err;
  } finally {
    db.release();
  }
};

const accesDe = async (db, espace, id) => {
  if (!idValide(id)) throw erreur(404, 'Accès introuvable');
  const r = await db.query(`${SQL_COMPTABLES} AND a.id = $2`, [espace.id, id]);
  if (!r.rows.length) throw erreur(404, 'Accès introuvable');
  return r.rows[0];
};

// ── Routes du titulaire (app., page Gérants ; compta., « Ma comptabilité ») ───────────────────────────────────────

// GET /api/compta/mes-comptables
const lister = async (req, res) => {
  try {
    const espace = await exigerEspace(pool, req.user);
    res.json(await etatTitulaire(pool, espace));
  } catch (err) {
    repondreErreur(res, err, '[compta.comptables.lister]');
  }
};

// POST /api/compta/mes-comptables — { nom, email, niveau } : un gérant comptable supplémentaire, dans la limite.
const ajouter = async (req, res) => {
  try {
    const saisie = lireSaisie(req.body);
    const out = await dansEspace(req.user, async (db, espace) => {
      // L'une après l'autre : un client de transaction ne mène qu'une requête à la fois.
      const limite = await limiteSupplementaires(db, espace.titulaire_id);
      const utilises = await db.query(`SELECT COUNT(*)::int AS n FROM compta.acces WHERE espace_id = $1 AND role = 'gerant' AND NOT obligatoire`, [espace.id]);
      if (utilises.rows[0].n >= limite) {
        throw erreur(409, limite > 0
          ? `Limite atteinte : ${limite} gérant${limite > 1 ? 's' : ''} comptable${limite > 1 ? 's' : ''} supplémentaire${limite > 1 ? 's' : ''}. Demandez-en davantage à l'équipe LabFlow.`
          : 'Aucun gérant comptable supplémentaire n\'est prévu : demandez-en à l\'équipe LabFlow.', 'LIMITE_ATTEINTE');
      }
      const accesId = (await db.query(
        `INSERT INTO compta.acces (espace_id, personne_id, role, niveau, tous_dossiers, obligatoire, etat)
         VALUES ($1, NULL, 'gerant', $2, true, false, 'a_attribuer') RETURNING id`,
        [espace.id, saisie.niveau]
      )).rows[0].id;
      const attribution = await attribuer(db, { espace, accesId, ...saisie });
      await journaliser(db, espace.id, req.user.id, 'acces_attribue', {
        acces: accesId, personne: attribution.personneId, obligatoire: false, niveau: saisie.niveau, nouvelle: attribution.nouvelle,
      });
      return { accesId, attribution };
    });
    const emailEnvoye = await prevenir(out.attribution, out.espace);
    res.status(201).json({ ...(await etatTitulaire(pool, out.espace)), emailEnvoye, nouvelle: out.attribution.nouvelle });
  } catch (err) {
    repondreErreur(res, err, '[compta.comptables.ajouter]');
  }
};

// PUT /api/compta/mes-comptables/:id — { nom, email, niveau } : désigner (accès vide), réattribuer (autre adresse) ou
// modifier le nom et le niveau. La personne qui perd l'accès n'est pas prévenue (réponse du client du 07/10).
const modifier = async (req, res) => {
  try {
    const saisie = lireSaisie(req.body, true);
    const out = await dansEspace(req.user, async (db, espace) => {
      const acces = await accesDe(db, espace, req.params.id);
      const adresseActuelle = acces.email ? acces.email.toLowerCase() : null;
      const changePersonne = acces.personne_id == null || (saisie.email && saisie.email !== adresseActuelle);
      if (changePersonne) {
        const complet = lireSaisie({ niveau: acces.niveau, ...req.body });
        const attribution = await attribuer(db, { espace, accesId: acces.id, ...complet });
        await journaliser(db, espace.id, req.user.id, acces.personne_id == null ? 'acces_attribue' : 'acces_reattribue', {
          acces: acces.id, personne: attribution.personneId, precedente: acces.personne_id, obligatoire: acces.obligatoire,
          niveau: complet.niveau, nouvelle: attribution.nouvelle,
        });
        return { attribution };
      }
      const niveau = saisie.niveau ?? acces.niveau;
      const nom = saisie.nom ?? acces.nom_attendu ?? acces.nom;
      await db.query('UPDATE compta.acces SET niveau = $2, nom_attendu = $3, updated_at = NOW() WHERE id = $1', [acces.id, niveau, nom]);
      await journaliser(db, espace.id, req.user.id, 'acces_modifie', {
        acces: acces.id, personne: acces.personne_id, avant: { niveau: acces.niveau, nom: acces.nom_attendu }, apres: { niveau, nom },
      });
      return { attribution: null };
    });
    const emailEnvoye = out.attribution ? await prevenir(out.attribution, out.espace) : null;
    res.json({ ...(await etatTitulaire(pool, out.espace)), ...(out.attribution ? { emailEnvoye, nouvelle: out.attribution.nouvelle } : {}) });
  } catch (err) {
    repondreErreur(res, err, '[compta.comptables.modifier]');
  }
};

// DELETE /api/compta/mes-comptables/:id — retire la personne : l'accès obligatoire redevient « à attribuer » (jamais
// supprimé) ; un accès supplémentaire est supprimé. Sans email (réponse du client du 07/10).
const retirer = async (req, res) => {
  try {
    const out = await dansEspace(req.user, async (db, espace) => {
      const acces = await accesDe(db, espace, req.params.id);
      // Un accès supplémentaire resté vide (sa personne a été supprimée : ON DELETE SET NULL) se retire aussi ; l'accès
      // obligatoire vide n'a rien à retirer.
      if (acces.personne_id == null && acces.obligatoire) throw erreur(409, 'Aucune personne n\'a cet accès', 'ACCES_VIDE');
      await viderOuSupprimer(db, acces);
      await journaliser(db, espace.id, req.user.id, 'acces_retire', { acces: acces.id, personne: acces.personne_id, obligatoire: acces.obligatoire });
      return {};
    });
    res.json(await etatTitulaire(pool, out.espace));
  } catch (err) {
    repondreErreur(res, err, '[compta.comptables.retirer]');
  }
};

// L'accès obligatoire n'est jamais supprimé : il redevient « à attribuer » ; un accès supplémentaire disparaît.
const viderOuSupprimer = (db, acces) => (acces.obligatoire
  ? db.query(
    `UPDATE compta.acces SET personne_id = NULL, etat = 'a_attribuer', nom_attendu = NULL, email_attendu = NULL,
            attribue_le = NULL, updated_at = NOW()
      WHERE id = $1`,
    [acces.id]
  )
  : db.query('DELETE FROM compta.acces WHERE id = $1', [acces.id]));

// POST /api/compta/mes-comptables/:id/inviter — nouvelle invitation (48 h) pour un compte LabFlow Compta jamais activé.
const inviter = async (req, res) => {
  try {
    const out = await dansEspace(req.user, async (db, espace) => {
      const acces = await accesDe(db, espace, req.params.id);
      if (!presenterComptable(acces).invitationRenvoyable) {
        throw erreur(409, 'Le compte de cette personne n\'attend pas d\'invitation', 'INVITATION_INUTILE');
      }
      const jeton = await jetonInvitation(db, acces.personne_id);
      await journaliser(db, espace.id, req.user.id, 'invitation_renvoyee', { acces: acces.id, personne: acces.personne_id });
      return { attribution: { email: acces.email, nom: acces.nom_attendu || acces.nom, jeton } };
    });
    if (!(await prevenir(out.attribution, out.espace))) {
      return res.status(502).json({ message: 'L\'invitation n\'a pas pu être envoyée, réessayez dans un instant' });
    }
    res.json({ ok: true });
  } catch (err) {
    repondreErreur(res, err, '[compta.comptables.inviter]');
  }
};

// ── Routes de la personne à qui une comptabilité est confiée (compta.) ───────────────────────────────────────────────

// Son accès (gérant, actif) à une comptabilité de client LabFlow ouverte ; verrouillé pour « quitter ».
const accesConfie = async (db, userId, espaceId, verrou = false) => {
  if (!idValide(espaceId)) return null;
  const r = await db.query(
    `SELECT a.id, a.niveau, a.obligatoire, a.attribue_le, e.id AS espace_id, e.nom AS espace_nom, e.titulaire_id
       FROM compta.acces a
       JOIN compta.espaces e ON e.id = a.espace_id
      WHERE a.personne_id = $1 AND a.espace_id = $2 AND a.role = 'gerant' AND a.etat = 'actif'
        AND e.type = 'client_labflow' AND e.etat = 'actif'
      ${verrou ? 'FOR UPDATE OF e, a' : ''}`,
    [userId, espaceId]
  );
  return r.rows[0] || null;
};

// GET /api/compta/confiees/:espaceId — la page « Comptabilité de … » : identité et contact du client, l'accès de la
// personne, l'état de l'abonnement du client (D4 : une comptabilité confiée suit l'abonnement de son client).
const confiee = async (req, res) => {
  try {
    const acces = await accesConfie(pool, req.user.id, req.params.espaceId);
    if (!acces) return res.status(404).json({ message: 'Comptabilité introuvable' });
    const [client, mode] = await Promise.all([
      pool.query(
        `SELECT u.nom AS contact, u.email, u.telephone,
                pe.raison_sociale, pe.nom_commercial, pe.forme_juridique, pe.matricule_fiscal, pe.rne, pe.adresse, pe.ville,
                pe.representant_nom, pe.representant_qualite
           FROM utilisateurs u
           LEFT JOIN profil_entreprise pe ON pe.client_id = u.id
          WHERE u.id = $1`,
        [acces.titulaire_id]
      ),
      modeTitulaire(pool, acces.espace_id),
    ]);
    const c = client.rows[0] || {};
    res.json({
      espace: { id: acces.espace_id, nom: acces.espace_nom },
      identite: mapIdentite(c),
      contact: { nom: c.contact || null, email: c.email || null, telephone: c.telephone || null },
      acces: { niveau: acces.niveau, obligatoire: acces.obligatoire, confieeLe: acces.attribue_le },
      etatAbonnement: etatAbonnement(mode),
    });
  } catch (err) {
    repondreErreur(res, err, '[compta.confiee]');
  }
};

// POST /api/compta/confiees/:espaceId/quitter — la personne quitte l'accès qu'on lui a confié. Jamais refusé par la
// garde par comptabilité (c'est son propre accès, pas une écriture dans la comptabilité). Le client est prévenu par la
// cloche et par email (réponse du client du 07/10).
const quitter = async (req, res) => {
  const db = await pool.connect();
  let acces;
  try {
    await db.query('BEGIN');
    acces = await accesConfie(db, req.user.id, req.params.espaceId, true);
    if (!acces) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Comptabilité introuvable' });
    }
    await viderOuSupprimer(db, acces);
    await journaliser(db, acces.espace_id, req.user.id, 'acces_quitte', { acces: acces.id, personne: req.user.id, obligatoire: acces.obligatoire });
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    return repondreErreur(res, err, '[compta.quitter]');
  } finally {
    db.release();
  }
  res.json({ ok: true });
  // Après la réponse : le client est prévenu (best effort).
  const comptableNom = req.user.nom || req.user.email;
  const payload = {
    eventType: 'comptable_parti', type: 'comptable_parti', clientNom: comptableNom,
    notesAdmin: acces.obligatoire ? 'Accès de votre comptable à désigner de nouveau' : 'Gérant comptable supplémentaire retiré',
  };
  try { pushTo(acces.titulaire_id, 'comptable_parti', payload); } catch { /* best effort */ }
  saveNotification(acces.titulaire_id, payload).catch((e) => console.error('[compta.quitter] notification :', e.message));
  (async () => {
    try {
      const t = await pool.query('SELECT nom, email FROM utilisateurs WHERE id = $1', [acces.titulaire_id]);
      if (!t.rows[0]?.email) return;
      await sendComptablePartiEmail({ to: t.rows[0].email, nom: t.rows[0].nom, comptableNom, voc: await vocabForClient(acces.titulaire_id) });
    } catch (e) {
      console.error('[compta.quitter] email :', e.message);
    }
  })();
};

module.exports = {
  NIVEAUX, ROLES_REFUSES, lireSaisie, presenterComptable, lireComptables, attribuer, viderOuSupprimer,
  lister, ajouter, modifier, retirer, inviter, confiee, quitter,
};
