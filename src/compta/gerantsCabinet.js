// LabFlow Compta, étape S3c « Les gérants du cabinet » (labflow-reprise/achats-compta/PLAN-S3c.md ; SPEC-SOCLE D2, D3,
// D4, D14, D16). Deux côtés :
// - le TITULAIRE du cabinet gère les accès de ses collaborateurs (page « Mes gérants ») : ajout dans la limite achetée
//   (abonnement_config.nb_gerants_compta de son abonnement LabFlow Compta), niveau, désactivation (la place reste
//   comptée), réactivation, retrait (la place est libérée), renvoi de l'invitation ; au-delà de la limite, une demande
//   à l'équipe LabFlow ;
// - le COLLABORATEUR : la page « Cabinet … » (identité du cabinet, titulaire, son niveau), sans « Quitter » — réponse du
//   client du 07/10 : le titulaire gère son équipe.
// Mêmes règles que le comptable du client (comptablesClient.js) : adresse inconnue → compte LabFlow Compta et invitation
// 48 h ; adresse connue → accès ajouté tout de suite (D14) ; désactiver, retirer, réattribuer sans email. Garde par
// comptabilité (D4) : le mode de l'abonnement du cabinet ; désactiver et retirer restent permis en lecture seule ou
// bloqué (réponse du client du 07/10), la demande de gérants non (comme tout ajout de capacité).
// Règles du chantier : jamais « gerant_parent_id || id » ni les gardes clientes ; l'accès est vérifié sur compta.acces.
const pool = require('../config/database');
const { pushToAdmins } = require('../services/sseService');
const { saveNotificationToAdmins } = require('../controllers/notificationController');
const { mapIdentite } = require('../utils/identite');
const { journaliser } = require('./journal');
const { exigerEcriture, modeTitulaire, etatAbonnement } = require('./garde');
const { sendAccesCabinetEmail, sendGerantsCabinetEmail } = require('./emails');
const { tarif } = require('./tarifsCompta');
const { computeMensuelTotalFromConfig } = require('../controllers/abonnementController');
const { NB_GERANTS_MAX, grilleGenerale } = require('./moduleClient');
const {
  NIVEAUX, SQL_COMPTABLES, erreur, idValide, repondreErreur, lireSaisie, presenterComptable, jetonInvitation, attribuer,
} = require('./comptablesClient');

const TEXTES_CABINET = {
  titulaire: 'Cette adresse est la vôtre : vous êtes le titulaire de ce cabinet',
  double: 'Cette personne fait déjà partie de votre cabinet',
};
const MSG_DESACTIVE = 'Cet accès est désactivé : réactivez-le d\'abord';

// ── Lectures ────────────────────────────────────────────────────────────────────────────────────────────────────────

// Le cabinet (ouvert) dont la personne est titulaire ; verrouillé pour une écriture.
const cabinetDuTitulaire = async (db, userId, verrou = false) => {
  const r = await db.query(
    `SELECT e.id, e.nom, e.titulaire_id
       FROM compta.espaces e
       JOIN compta.acces a ON a.espace_id = e.id
      WHERE a.personne_id = $1 AND a.role = 'titulaire' AND a.etat = 'actif'
        AND e.type = 'cabinet' AND e.etat = 'actif'
      ${verrou ? 'FOR UPDATE OF e' : ''}`,
    [userId]
  );
  return r.rows[0] || null;
};
const exigerCabinet = async (db, user, verrou = false) => {
  const espace = user?.role === 'comptable' ? await cabinetDuTitulaire(db, user.id, verrou) : null;
  if (!espace) throw erreur(403, 'Page réservée au titulaire d\'un cabinet LabFlow Compta');
  return espace;
};

// Gérants achetés par le cabinet (abonnement LabFlow Compta de son titulaire).
const limiteGerants = async (db, titulaireId) => {
  const r = await db.query(
    `SELECT ac.nb_gerants_compta
       FROM abonnements a JOIN abonnement_config ac ON ac.abonnement_id = a.id
      WHERE a.client_id = $1 AND a.produit = 'compta'
      ORDER BY a.id DESC LIMIT 1`,
    [titulaireId]
  );
  return Number(r.rows[0]?.nb_gerants_compta) || 0;
};

// Places occupées : tous les accès de gérant du cabinet, désactivés compris (réponse du client du 07/10).
const placesOccupees = async (db, espaceId) =>
  (await db.query(`SELECT COUNT(*)::int AS n FROM compta.acces WHERE espace_id = $1 AND role = 'gerant'`, [espaceId])).rows[0].n;

const demandeEnAttente = async (db, titulaireId) => {
  const r = await db.query(
    `SELECT 1 FROM support_demandes
      WHERE client_id = $1 AND type = 'supplement' AND statut = 'en_attente' AND nb_gerants_compta_supp > 0
      LIMIT 1`,
    [titulaireId]
  );
  return r.rows.length > 0;
};

const lireGerants = async (db, espaceId) =>
  (await db.query(`${SQL_COMPTABLES} ORDER BY a.id`, [espaceId])).rows.map(presenterComptable);

const etatCabinet = async (db, espace) => {
  const [gerants, limite, demande, mode, tarifs] = await Promise.all([
    lireGerants(db, espace.id),
    limiteGerants(db, espace.titulaire_id),
    demandeEnAttente(db, espace.titulaire_id),
    modeTitulaire(db, espace.id),
    grilleGenerale(db),
  ]);
  return {
    cabinet: { id: espace.id, nom: espace.nom },
    gerants,
    places: { utilisees: gerants.length, limite },
    niveaux: NIVEAUX,
    demandeEnCours: demande,
    prixGerant: tarif(tarifs, 'compta_gerant_cabinet_mensuel'),
    nbGerantsMax: NB_GERANTS_MAX,
    etatAbonnement: etatAbonnement(mode),
  };
};

// ── Écritures ───────────────────────────────────────────────────────────────────────────────────────────────────────

// Transaction sur le cabinet du titulaire, verrouillé, garde par comptabilité comprise. Ordre des verrous de l'admin
// (gérants achetés, validation d'une demande) : configuration de l'abonnement, puis cabinet — un ajout ne se croise pas
// avec une baisse de la limite, sans interblocage. `{ garde: false }` : désactiver ou retirer, permis quel que soit
// l'abonnement (routes.js, ECRITURES_TOUJOURS_PERMISES).
const dansCabinet = async (user, travail, { garde = true } = {}) => {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    if (user?.role === 'comptable') {
      await db.query(
        `SELECT 1 FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id
          WHERE a.client_id = $1 AND a.produit = 'compta' FOR UPDATE OF ac`,
        [user.id]
      );
    }
    const espace = await exigerCabinet(db, user, true);
    if (garde) await exigerEcriture(db, espace.id);
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

const gerantDe = async (db, espace, id) => {
  if (!idValide(id)) throw erreur(404, 'Accès introuvable');
  const r = await db.query(`${SQL_COMPTABLES} AND a.id = $2`, [espace.id, id]);
  if (!r.rows.length) throw erreur(404, 'Accès introuvable');
  return r.rows[0];
};

// Email à la personne qui vient de recevoir l'accès (après le COMMIT ; un échec d'envoi ne défait rien).
const prevenir = async (attribution, espace) => {
  try {
    await sendAccesCabinetEmail({ to: attribution.email, nom: attribution.nom, cabinetNom: espace.nom, token: attribution.jeton });
    return true;
  } catch (e) {
    console.error('[compta.gerants] email :', e.message);
    return false;
  }
};

// ── Routes du titulaire (compta., page « Mes gérants ») ─────────────────────────────────────────────────────────────

// GET /api/compta/cabinet/gerants
const lister = async (req, res) => {
  try {
    const espace = await exigerCabinet(pool, req.user);
    res.json(await etatCabinet(pool, espace));
  } catch (err) {
    repondreErreur(res, err, '[compta.gerants.lister]');
  }
};

// POST /api/compta/cabinet/gerants — { nom, email, niveau } : un collaborateur, dans la limite achetée.
const ajouter = async (req, res) => {
  try {
    const saisie = lireSaisie(req.body);
    const out = await dansCabinet(req.user, async (db, espace) => {
      // L'une après l'autre : un client de transaction ne mène qu'une requête à la fois.
      const limite = await limiteGerants(db, espace.titulaire_id);
      if (await placesOccupees(db, espace.id) >= limite) {
        throw erreur(409, limite > 0
          ? `Limite atteinte : ${limite} gérant${limite > 1 ? 's' : ''} prévu${limite > 1 ? 's' : ''} dans votre abonnement. Demandez-en davantage à l'équipe LabFlow.`
          : 'Aucun gérant n\'est prévu dans votre abonnement : demandez-en à l\'équipe LabFlow.', 'LIMITE_ATTEINTE');
      }
      const accesId = (await db.query(
        `INSERT INTO compta.acces (espace_id, personne_id, role, niveau, tous_dossiers, obligatoire, etat)
         VALUES ($1, NULL, 'gerant', $2, true, false, 'a_attribuer') RETURNING id`,
        [espace.id, saisie.niveau]
      )).rows[0].id;
      const attribution = await attribuer(db, { espace, accesId, ...saisie, textes: TEXTES_CABINET });
      await journaliser(db, espace.id, req.user.id, 'acces_attribue', {
        acces: accesId, personne: attribution.personneId, niveau: saisie.niveau, nouvelle: attribution.nouvelle,
      });
      return { attribution };
    });
    const emailEnvoye = await prevenir(out.attribution, out.espace);
    res.status(201).json({ ...(await etatCabinet(pool, out.espace)), emailEnvoye, nouvelle: out.attribution.nouvelle });
  } catch (err) {
    repondreErreur(res, err, '[compta.gerants.ajouter]');
  }
};

// PUT /api/compta/cabinet/gerants/:id — { nom, email, niveau } : modifier le nom et le niveau, ou donner l'accès à une
// autre adresse (la personne qui le perd n'est pas prévenue). Un accès désactivé se réactive d'abord.
const modifier = async (req, res) => {
  try {
    const saisie = lireSaisie(req.body, true);
    const out = await dansCabinet(req.user, async (db, espace) => {
      const acces = await gerantDe(db, espace, req.params.id);
      if (acces.etat_acces === 'desactive') throw erreur(409, MSG_DESACTIVE, 'ACCES_DESACTIVE');
      const adresseActuelle = acces.email ? acces.email.toLowerCase() : null;
      if (acces.personne_id == null || (saisie.email && saisie.email !== adresseActuelle)) {
        const complet = lireSaisie({ niveau: acces.niveau, ...req.body });
        const attribution = await attribuer(db, { espace, accesId: acces.id, ...complet, textes: TEXTES_CABINET });
        await journaliser(db, espace.id, req.user.id, acces.personne_id == null ? 'acces_attribue' : 'acces_reattribue', {
          acces: acces.id, personne: attribution.personneId, precedente: acces.personne_id, niveau: complet.niveau, nouvelle: attribution.nouvelle,
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
    res.json({ ...(await etatCabinet(pool, out.espace)), ...(out.attribution ? { emailEnvoye, nouvelle: out.attribution.nouvelle } : {}) });
  } catch (err) {
    repondreErreur(res, err, '[compta.gerants.modifier]');
  }
};

// POST /api/compta/cabinet/gerants/:id/desactiver — le collaborateur ne voit plus le cabinet ; sa fiche est gardée et sa
// place reste comptée. Sans email. Permis quel que soit l'abonnement (réponse du client du 07/10).
const desactiver = async (req, res) => {
  try {
    const out = await dansCabinet(req.user, async (db, espace) => {
      const acces = await gerantDe(db, espace, req.params.id);
      if (acces.personne_id == null) throw erreur(409, 'Aucune personne n\'a cet accès', 'ACCES_VIDE');
      if (acces.etat_acces === 'desactive') throw erreur(409, 'Cet accès est déjà désactivé', 'DEJA_DESACTIVE');
      await db.query(`UPDATE compta.acces SET etat = 'desactive', updated_at = NOW() WHERE id = $1`, [acces.id]);
      await journaliser(db, espace.id, req.user.id, 'acces_desactive', { acces: acces.id, personne: acces.personne_id });
      return {};
    }, { garde: false });
    res.json(await etatCabinet(pool, out.espace));
  } catch (err) {
    repondreErreur(res, err, '[compta.gerants.desactiver]');
  }
};

// POST /api/compta/cabinet/gerants/:id/reactiver — l'accès désactivé revient tel quel (nom, niveau).
const reactiver = async (req, res) => {
  try {
    const out = await dansCabinet(req.user, async (db, espace) => {
      const acces = await gerantDe(db, espace, req.params.id);
      if (acces.personne_id == null || acces.etat_acces !== 'desactive') throw erreur(409, 'Cet accès n\'est pas désactivé', 'PAS_DESACTIVE');
      await db.query(`UPDATE compta.acces SET etat = 'actif', updated_at = NOW() WHERE id = $1`, [acces.id]);
      await journaliser(db, espace.id, req.user.id, 'acces_reactive', { acces: acces.id, personne: acces.personne_id });
      return {};
    });
    res.json(await etatCabinet(pool, out.espace));
  } catch (err) {
    repondreErreur(res, err, '[compta.gerants.reactiver]');
  }
};

// DELETE /api/compta/cabinet/gerants/:id — l'accès disparaît, la place est libérée. Sans email. Permis quel que soit
// l'abonnement (réponse du client du 07/10).
const retirer = async (req, res) => {
  try {
    const out = await dansCabinet(req.user, async (db, espace) => {
      const acces = await gerantDe(db, espace, req.params.id);
      await db.query('DELETE FROM compta.acces WHERE id = $1', [acces.id]);
      await journaliser(db, espace.id, req.user.id, 'acces_retire', { acces: acces.id, personne: acces.personne_id });
      return {};
    }, { garde: false });
    res.json(await etatCabinet(pool, out.espace));
  } catch (err) {
    repondreErreur(res, err, '[compta.gerants.retirer]');
  }
};

// POST /api/compta/cabinet/gerants/:id/inviter — nouvelle invitation (48 h) pour un compte LabFlow Compta jamais activé.
const inviter = async (req, res) => {
  try {
    const out = await dansCabinet(req.user, async (db, espace) => {
      const acces = await gerantDe(db, espace, req.params.id);
      if (acces.etat_acces === 'desactive') throw erreur(409, MSG_DESACTIVE, 'ACCES_DESACTIVE');
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
    repondreErreur(res, err, '[compta.gerants.inviter]');
  }
};

// POST /api/compta/cabinet/demande-gerants — { nombre } : demande de gérants à l'équipe LabFlow (une à la fois). La
// validation par l'admin (supportController.traiter) augmente les gérants achetés, facturés à partir du mois suivant.
// Refusée en lecture seule, comme tout ajout de capacité (réponse du client du 07/10).
const demander = async (req, res) => {
  const nombre = Number(req.body?.nombre);
  if (!Number.isInteger(nombre) || nombre < 1 || nombre > NB_GERANTS_MAX) {
    return res.status(400).json({ message: `Nombre de gérants : entier de 1 à ${NB_GERANTS_MAX}` });
  }
  try {
    const out = await dansCabinet(req.user, async (db, espace) => {
      const limite = await limiteGerants(db, espace.titulaire_id);
      if (limite + nombre > NB_GERANTS_MAX) throw erreur(400, `Au plus ${NB_GERANTS_MAX} gérants pour un cabinet`);
      if (await demandeEnAttente(db, espace.titulaire_id)) {
        throw erreur(409, 'Une demande de gérants attend déjà la validation de l\'équipe LabFlow', 'DEMANDE_EN_COURS');
      }
      const auteur = (await db.query('SELECT nom FROM utilisateurs WHERE id = $1', [req.user.id])).rows[0]?.nom || null;
      const demande = (await db.query(
        `INSERT INTO support_demandes
           (client_id, client_nom, type, nb_activites_supp, nb_labos_supp, nb_gerants_supp, nb_acheteurs_cible, created_by, created_by_nom, nb_gerants_compta_supp)
         VALUES ($1, $2, 'supplement', 0, 0, 0, NULL, $1, $3, $4) RETURNING id`,
        [espace.titulaire_id, espace.nom, auteur, nombre]
      )).rows[0].id;
      await journaliser(db, espace.id, req.user.id, 'demande_gerants', { demande, nombre });
      return { demande };
    });
    // Après le COMMIT : l'équipe LabFlow est prévenue (cloche de l'admin), comme pour les autres demandes.
    const payload = { eventType: 'new_demande', demandeId: out.demande, type: 'supplement', clientNom: out.espace.nom };
    try { pushToAdmins('new_demande', payload); } catch { /* best effort */ }
    saveNotificationToAdmins(payload).catch((e) => console.error('[compta.gerants.demander] notification :', e.message));
    res.status(201).json(await etatCabinet(pool, out.espace));
  } catch (err) {
    repondreErreur(res, err, '[compta.gerants.demander]');
  }
};

// ── Validation d'une demande par l'admin (supportController.traiter) ────────────────────────────────────────────────

// La demande vient-elle d'un cabinet (abonnement LabFlow Compta) ? `abonnementId` : celui de la configuration verrouillée.
const estAbonnementCabinet = async (db, abonnementId) =>
  (await db.query('SELECT produit FROM abonnements WHERE id = $1', [abonnementId])).rows[0]?.produit === 'compta';

// Après la validation : email de LabFlow Compta au titulaire (gérants achetés, total mensuel avant et après, hors
// promotion). L'appelant n'attend pas ; un échec est seulement journalisé.
const prevenirDemandeValidee = async ({ clientId, email, nom, nbAjoutes, notesAdmin }) => {
  const r = await pool.query(
    `SELECT ac.nb_gerants_compta FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id
      WHERE a.client_id = $1 AND a.produit = 'compta' ORDER BY a.id DESC LIMIT 1`,
    [clientId]
  );
  if (!r.rows.length) return;
  const tarifs = await grilleGenerale(pool);
  const nbGerants = Number(r.rows[0].nb_gerants_compta) || 0;
  const mensuel = (nb) => computeMensuelTotalFromConfig({ produit: 'compta', nb_gerants_compta: nb }, tarifs) || 0;
  await sendGerantsCabinetEmail({
    to: email, nom, nbAjoutes, nbGerants, ancienMensuel: mensuel(nbGerants - nbAjoutes), nouveauMensuel: mensuel(nbGerants), notesAdmin,
  });
};

// ── Route du collaborateur (compta., page « Cabinet … ») ─────────────────────────────────────────────────────────────

// GET /api/compta/cabinets/:espaceId — le cabinet dont la personne est collaboratrice (accès actif, cabinet ouvert) :
// identité du cabinet (celle de ses factures), titulaire, son accès, l'état de l'abonnement du cabinet.
const membre = async (req, res) => {
  try {
    if (!idValide(req.params.espaceId)) return res.status(404).json({ message: 'Cabinet introuvable' });
    const r = await pool.query(
      `SELECT a.niveau, a.attribue_le, e.id AS espace_id, e.nom AS espace_nom, e.titulaire_id
         FROM compta.acces a
         JOIN compta.espaces e ON e.id = a.espace_id
        WHERE a.personne_id = $1 AND a.espace_id = $2 AND a.role = 'gerant' AND a.etat = 'actif'
          AND e.type = 'cabinet' AND e.etat = 'actif'`,
      [req.user.id, req.params.espaceId]
    );
    const acces = r.rows[0];
    if (!acces) return res.status(404).json({ message: 'Cabinet introuvable' });
    const [cabinet, mode] = await Promise.all([
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
    const x = cabinet.rows[0] || {};
    res.json({
      cabinet: { id: acces.espace_id, nom: acces.espace_nom },
      identite: mapIdentite(x),
      titulaire: { nom: x.contact || null, email: x.email || null, telephone: x.telephone || null },
      acces: { niveau: acces.niveau, membreDepuis: acces.attribue_le },
      etatAbonnement: etatAbonnement(mode),
    });
  } catch (err) {
    repondreErreur(res, err, '[compta.cabinet.membre]');
  }
};

module.exports = {
  TEXTES_CABINET, placesOccupees, estAbonnementCabinet, prevenirDemandeValidee,
  lister, ajouter, modifier, desactiver, reactiver, retirer, inviter, demander, membre,
};
