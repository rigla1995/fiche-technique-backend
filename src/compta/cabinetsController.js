// LabFlow Compta, étape S2b — les cabinets comptables, gérés par l'admin (labflow-reprise/achats-compta/SPEC-SOCLE.md,
// D1, D6-D10, D16 ; PLAN-S2.md). Routes montées sous /admin/comptables (src/compta/adminRoutes.js, super_admin et boss).
//
// Un cabinet = une personne de rôle « comptable » (titulaire), sa fiche d'identité (profil_entreprise, D9 : la copie
// figée des factures fonctionne sans changement), un abonnement « compta » (mensualité, frais de mise en route,
// promotions comme un client — décision du client du 06/10 : PAS de « 1er mois offert »), l'espace « cabinet » et
// l'accès de son titulaire. Création en UNE transaction. Refusée tant que le tarif « LabFlow Compta seul » vaut 0
// (décision du 06/10).
const pool = require('../config/database');
const {
  loadTarifs, tarifsFor, insertPromoForAbonnement, recalcPaiementsEnAttente, computeMensuelTotalFromConfig,
} = require('../controllers/abonnementController');
const { lignesMensualite } = require('../services/pricingEngine');
const { postesCompta, tarif } = require('./tarifsCompta');
const { generateInviteToken, sendWelcomeEmail } = require('../services/emailService');
const { lireIdentite, nomAffiche, identiteComplete, mapIdentite } = require('../utils/identite');
const { premierDuMoisUTC } = require('../utils/dateUtils');
const { journaliser } = require('./journal');
const { avertissementsMatricule } = require('../controllers/clientsController');
const { jetonInvitation } = require('./comptablesClient');
const { sendCabinetOuvertEmail } = require('./emails');
const { nbDossiersDuTitulaire, refusCabinetAvecDossiers } = require('./d10');

const NB_GERANTS_MAX = 50;
const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Même règle que le téléphone d'un client (src/routes/admin.js) : format tunisien, obligatoire pour un cabinet.
const RE_TELEPHONE = /^(\+216[\s-]?)?[2579]\d{7}$/;
const TYPES_PROMO = ['free_months', 'percent_off', 'fixed_price'];
const CIBLES_PROMO = ['mensualite', 'onboarding', 'les_deux'];
const MSG_TARIF = 'Renseignez d\'abord le tarif « LabFlow Compta seul » (menu Tarifs, section LabFlow Compta) : il vaut 0 DT.';

const idValide = (v) => /^\d{1,9}$/.test(String(v));
const nbGerantsDe = (v) => {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= NB_GERANTS_MAX ? n : null;
};

// Colonnes d'identité lues (mêmes que la liste des clients).
const COLONNES = `u.id, u.nom, u.email, u.telephone, u.actif, u.activated_at, u.created_at,
       pe.raison_sociale, pe.nom_commercial, pe.forme_juridique, pe.matricule_fiscal, pe.rne, pe.adresse,
       pe.ville, pe.representant_nom, pe.representant_qualite,
       a.id AS abonnement_id, a.mode_compte, a.invite_sent, a.statut_onboarding, a.montant_onboarding, a.date_debut,
       ac.nb_gerants_compta,
       e.id AS espace_id, e.nom AS espace_nom, e.etat AS espace_etat,
       (SELECT COUNT(*)::int FROM compta.acces g WHERE g.espace_id = e.id AND g.role = 'gerant') AS gerants_en_place,
       (SELECT COUNT(*)::int FROM compta.dossiers d WHERE d.espace_id = e.id) AS nb_dossiers`;
const SOURCE = `FROM utilisateurs u
       JOIN compta.espaces e ON e.titulaire_id = u.id AND e.type = 'cabinet'
       LEFT JOIN profil_entreprise pe ON pe.client_id = u.id
       LEFT JOIN abonnements a ON a.client_id = u.id AND a.produit = 'compta'
       LEFT JOIN abonnement_config ac ON ac.abonnement_id = a.id
      WHERE u.role = 'comptable'`;

const mapCabinet = (row, tarifs) => {
  const config = { produit: 'compta', nb_gerants_compta: row.nb_gerants_compta || 0 };
  return {
    id: row.id,
    name: row.nom,
    email: row.email,
    phone: row.telephone,
    active: row.actif,
    activatedAt: row.activated_at || null,
    createdAt: row.created_at,
    entreprise: mapIdentite(row),
    nomAffiche: nomAffiche({ ...row, contact: row.nom }),
    identiteComplete: identiteComplete(row),
    espace: { id: row.espace_id, nom: row.espace_nom, etat: row.espace_etat },
    // S4a : dossiers du cabinet (archivés compris) — un cabinet qui en a ne se supprime plus (D10).
    nbDossiers: row.nb_dossiers || 0,
    abonnement: row.abonnement_id ? {
      id: row.abonnement_id,
      modeCompte: row.mode_compte,
      inviteSent: row.invite_sent ?? false,
      dateDebut: row.date_debut,
      statutOnboarding: row.statut_onboarding,
      montantOnboarding: row.montant_onboarding != null ? Number(row.montant_onboarding) : null,
      nbGerants: row.nb_gerants_compta || 0,
      // S3c : accès de collaborateurs en place (désactivés compris) — la limite ne descend pas en dessous.
      gerantsEnPlace: row.gerants_en_place || 0,
      postes: postesCompta(config, tarifs),
      totalMensuel: computeMensuelTotalFromConfig(config, tarifs) || 0,
    } : null,
  };
};

const grilleGenerale = async (db = pool) => tarifsFor(await loadTarifs(db), null);

const chargerCabinet = async (db, id, tarifs) => {
  const r = await db.query(`SELECT ${COLONNES} ${SOURCE} AND u.id = $1`, [id]);
  return r.rows.length ? mapCabinet(r.rows[0], tarifs || await grilleGenerale(db)) : null;
};

// GET /admin/comptables — les cabinets (titulaires), du plus récent au plus ancien.
const list = async (req, res) => {
  try {
    const [r, tarifs] = await Promise.all([pool.query(`SELECT ${COLONNES} ${SOURCE} ORDER BY u.created_at DESC`), grilleGenerale()]);
    res.json(r.rows.map((row) => mapCabinet(row, tarifs)));
  } catch (err) {
    console.error('[comptables.list]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /admin/comptables/:id
const get = async (req, res) => {
  if (!idValide(req.params.id)) return res.status(404).json({ message: 'Cabinet introuvable' });
  try {
    const cabinet = await chargerCabinet(pool, req.params.id);
    if (!cabinet) return res.status(404).json({ message: 'Cabinet introuvable' });
    res.json(cabinet);
  } catch (err) {
    console.error('[comptables.get]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /admin/comptables/apercu-prix?nbGerants=n — aperçu de l'assistant « Nouveau comptable » (grille générale).
const apercuPrix = async (req, res) => {
  const nbGerants = nbGerantsDe(req.query.nbGerants);
  if (nbGerants == null) return res.status(400).json({ message: `Nombre de gérants : entier de 0 à ${NB_GERANTS_MAX}` });
  try {
    const tarifs = await grilleGenerale();
    const config = { produit: 'compta', nb_gerants_compta: nbGerants };
    res.json({
      nbGerants,
      cabinetMensuel: tarif(tarifs, 'compta_cabinet_mensuel'),
      gerantMensuel: tarif(tarifs, 'compta_gerant_cabinet_mensuel'),
      miseEnRoute: tarif(tarifs, 'compta_mise_en_route'),
      postes: postesCompta(config, tarifs),
      totalMensuel: computeMensuelTotalFromConfig(config, tarifs) || 0,
      tarifManquant: tarif(tarifs, 'compta_cabinet_mensuel') <= 0,
    });
  } catch (err) {
    console.error('[comptables.apercuPrix]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Promotions saisies dans l'assistant : contrôlées AVANT toute écriture (forme), puis insérées dans la transaction par
// insertPromoForAbonnement (règles et chevauchements, comme pour un client).
// Promotions de l'assistant : recopiées champ par champ (jamais de promotion « système »), pourcentage de 0 à 100,
// prix fixe positif ou nul — une mensualité ne devient jamais négative.
const lirePromotions = (brut) => {
  const liste = Array.isArray(brut) ? brut : [];
  const promotions = [];
  const nombre = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
  for (const p of liste) {
    if (!p || !TYPES_PROMO.includes(p.type) || !CIBLES_PROMO.includes(p.appliesTo) || !/^\d{4}-\d{2}-\d{2}$/.test(String(p.dateDebut || ''))) {
      return { erreur: 'Promotion invalide : type, cible (mensualité, mise en route ou les deux) et date de début requis' };
    }
    const propre = {
      type: p.type, appliesTo: p.appliesTo, dateDebut: p.dateDebut,
      monthsDuration: nombre(p.monthsDuration),
      discountMensualite: nombre(p.discountMensualite), discountOnboarding: nombre(p.discountOnboarding),
      fixedMensualite: nombre(p.fixedMensualite), fixedOnboarding: nombre(p.fixedOnboarding),
    };
    const valeurs = Object.values(propre).filter((v) => typeof v === 'number');
    if (valeurs.some((v) => !Number.isFinite(v) || v < 0)) return { erreur: 'Promotion invalide : montants et durées positifs' };
    if ([propre.discountMensualite, propre.discountOnboarding].some((v) => v != null && v > 100)) {
      return { erreur: 'Promotion invalide : un pourcentage de remise va de 0 à 100' };
    }
    promotions.push(propre);
  }
  return { promotions };
};

// S3c (réponse du client du 07/10) : un cabinet peut s'ouvrir sur un compte LabFlow Compta qui existe déjà — par exemple
// créé par la désignation d'un client (S3b) ou comme collaborateur d'un autre cabinet — tant que ce compte, actif, n'a ni
// cabinet ni abonnement ni fiche d'identité ; la personne garde son mot de passe et ses comptabilités confiées. Toute autre
// adresse connue reste refusée (une adresse = client OU cabinet, D6).
// → { etat: 'libre' } | { etat: 'rattachable', personne } | { etat: 'prise' }.
const etatAdresse = async (db, email) => {
  const r = await db.query(
    `SELECT u.id, u.nom, u.email, u.role, u.actif, u.activated_at, (u.mot_de_passe IS NOT NULL) AS a_mot_de_passe,
            EXISTS (SELECT 1 FROM abonnements a WHERE a.client_id = u.id) AS a_abonnement,
            EXISTS (SELECT 1 FROM compta.espaces e WHERE e.titulaire_id = u.id) AS a_espace,
            EXISTS (SELECT 1 FROM profil_entreprise pe WHERE pe.client_id = u.id) AS a_profil
       FROM utilisateurs u
      WHERE LOWER(u.email) = LOWER($1)
      ORDER BY u.id`,
    [email]
  );
  if (!r.rows.length) return { etat: 'libre' };
  const p = r.rows[0];
  const rattachable = r.rows.length === 1 && p.role === 'comptable' && p.actif === true && !p.a_abonnement && !p.a_espace && !p.a_profil;
  return rattachable ? { etat: 'rattachable', personne: p } : { etat: 'prise' };
};

// GET /admin/comptables/adresse?email=… — l'assistant « Nouveau comptable » signale une adresse déjà prise, ou un compte
// LabFlow Compta auquel le cabinet sera rattaché.
const verifierAdresse = async (req, res) => {
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email || !RE_EMAIL.test(email) || email.length > 255) return res.status(400).json({ message: 'Adresse email invalide' });
  try {
    const a = await etatAdresse(pool, email);
    res.json(a.etat === 'rattachable' ? { etat: a.etat, nom: a.personne.nom, active: !!(a.personne.activated_at || a.personne.a_mot_de_passe) } : { etat: a.etat });
  } catch (err) {
    console.error('[comptables.verifierAdresse]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /admin/comptables — création d'un cabinet en UNE transaction ; email d'activation vers compta. ensuite.
const create = async (req, res) => {
  const nom = String(req.body.name || req.body.nom || '').trim();
  const email = String(req.body.email || '').trim().toLowerCase();
  const telephone = req.body.telephone ? String(req.body.telephone).trim() : null;
  const nbGerants = nbGerantsDe(req.body.nbGerants);
  if (!nom) return res.status(400).json({ message: 'Nom du contact requis' });
  if (nom.length > 100) return res.status(400).json({ message: 'Nom du contact : 100 caractères au maximum' });
  if (!email || !RE_EMAIL.test(email) || email.length > 255) return res.status(400).json({ message: 'Adresse email invalide' });
  if (!telephone || !RE_TELEPHONE.test(telephone.replace(/\s/g, ''))) {
    return res.status(400).json({ message: 'Numéro de téléphone tunisien invalide (ex: +216 XX XXX XXX)' });
  }
  if (nbGerants == null) return res.status(400).json({ message: `Nombre de gérants : entier de 0 à ${NB_GERANTS_MAX}` });
  const identite = lireIdentite(req.body);
  if (identite.erreurs.length) return res.status(400).json({ message: identite.erreurs[0].message, erreurs: identite.erreurs });
  const { promotions, erreur } = lirePromotions(req.body.promotions);
  if (erreur) return res.status(400).json({ message: erreur });

  try {
    const tarifs = await grilleGenerale();
    if (tarif(tarifs, 'compta_cabinet_mensuel') <= 0) return res.status(400).json({ code: 'TARIF_COMPTA_MANQUANT', message: MSG_TARIF });
    const miseEnRoute = req.body.montantMiseEnRoute != null && req.body.montantMiseEnRoute !== ''
      ? Number(req.body.montantMiseEnRoute) : tarif(tarifs, 'compta_mise_en_route');
    if (!Number.isFinite(miseEnRoute) || miseEnRoute < 0) return res.status(400).json({ message: 'Frais de mise en route invalides' });

    // S3c : une adresse connue n'est acceptée que pour un compte LabFlow Compta sans cabinet ni abonnement (rattaché).
    const adresse = await etatAdresse(pool, email);
    if (adresse.etat === 'prise') return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    const rattache = adresse.etat === 'rattachable' ? adresse.personne : null;

    // Mêmes contrôles de doublons que la création d'un client : téléphone sur ses 8 derniers chiffres, email sans casse
    // (la personne rattachée elle-même mise à part).
    if (telephone) {
      const tel8 = telephone.replace(/\D/g, '').slice(-8);
      const t = await pool.query(
        `SELECT u.nom AS porteur FROM utilisateurs u
          WHERE RIGHT(regexp_replace(COALESCE(u.telephone, ''), '[^0-9]', '', 'g'), 8) = $1 AND u.id <> $2
         UNION ALL
         SELECT COALESCE(pe.nom_commercial, pe.raison_sociale, pe.nom) FROM profil_entreprise pe
           JOIN utilisateurs u2 ON u2.id = pe.client_id
          WHERE RIGHT(regexp_replace(COALESCE(pe.telephone, ''), '[^0-9]', '', 'g'), 8) = $1
            AND RIGHT(regexp_replace(COALESCE(u2.telephone, ''), '[^0-9]', '', 'g'), 8) = $1 AND u2.id <> $2
         LIMIT 1`,
        [tel8, rattache?.id ?? 0]
      );
      if (t.rows.length) return res.status(409).json({ message: `Ce numéro de téléphone est déjà utilisé (compte « ${t.rows[0].porteur} »)` });
    }

    // Jeton d'activation : compte neuf, ou compte rattaché jamais activé ; un compte rattaché déjà activé garde son mot de
    // passe et reçoit l'email « votre cabinet est ouvert ».
    let jeton = rattache ? null : generateInviteToken();
    const expire = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const colonnesIdentite = Object.keys(identite.valeurs).filter((c) => c !== 'adresse');
    const nomEspace = nomAffiche({ ...identite.valeurs, contact: nom }) || nom;

    const db = await pool.connect();
    let id;
    try {
      await db.query('BEGIN');
      if (rattache) {
        // La ligne de la personne d'abord verrouillée, PUIS revérifiée par une autre instruction (relecture de S3c : en
        // READ COMMITTED, une instruction voit les écritures validées avant SON début — une revérification faite dans
        // l'instruction qui attend le verrou ne verrait pas le cabinet qu'une requête concurrente vient d'ouvrir).
        await db.query('SELECT 1 FROM utilisateurs WHERE id = $1 FOR UPDATE', [rattache.id]);
        const encore = await etatAdresse(db, email);
        if (encore.etat !== 'rattachable' || encore.personne.id !== rattache.id) {
          throw Object.assign(new Error('Cet email est déjà utilisé'), { statusCode: 409 });
        }
        id = rattache.id;
        await db.query('UPDATE utilisateurs SET nom = $2, telephone = $3, updated_at = NOW() WHERE id = $1', [id, nom, telephone]);
        // Activation lue sous le verrou : un compte jamais activé reçoit l'email d'activation, les autres « cabinet ouvert ».
        if (!encore.personne.activated_at && !encore.personne.a_mot_de_passe) jeton = await jetonInvitation(db, id);
        rattache.email = encore.personne.email;
      } else {
        id = (await db.query(
          `INSERT INTO utilisateurs (nom, email, mot_de_passe, telephone, role, onboarding_step, invite_token, invite_token_expires_at)
           VALUES ($1, $2, NULL, $3, 'comptable', 0, $4, $5) RETURNING id`,
          [nom, email, telephone, jeton, expire]
        )).rows[0].id;
      }

      // Une copie périmée d'une fiche peut porter exactement ce numéro (contrainte unique) : la copie reste alors vide.
      let telFiche = telephone;
      if (telFiche && (await db.query('SELECT 1 FROM profil_entreprise WHERE telephone = $1', [telFiche])).rows.length) telFiche = null;
      await db.query(
        `INSERT INTO profil_entreprise (client_id, nom, email, telephone, adresse${colonnesIdentite.map((c) => `, ${c}`).join('')})
         VALUES ($1, $2, $3, $4, $5${colonnesIdentite.map((_, i) => `, $${i + 6}`).join('')})`,
        [id, nom, email, telFiche, identite.valeurs.adresse ?? null, ...colonnesIdentite.map((c) => identite.valeurs[c])]
      );

      const aboId = (await db.query(
        `INSERT INTO abonnements (client_id, montant_onboarding, date_debut, produit, statut_onboarding)
         VALUES ($1, $2, CURRENT_DATE, 'compta', CASE WHEN $2::numeric = 0 THEN 'gratuit' ELSE 'en_attente' END) RETURNING id`,
        [id, miseEnRoute]
      )).rows[0].id;
      // Configuration sans aucun poste LabFlow (0 activité, 0 labo, pas de formule ni de domaine) : seuls les postes Compta.
      await db.query(
        `INSERT INTO abonnement_config (abonnement_id, nb_activites, nb_labos, nb_gerants, nb_acheteurs, formule_activites,
                                        montant_onboarding, domaine_id, nb_gerants_compta)
         VALUES ($1, 0, 0, 0, 0, NULL, $2, NULL, $3)`,
        [aboId, miseEnRoute, nbGerants]
      );

      // Mensualité du mois, postes figés (D8) ; les promotions de l'assistant la recalculent ensuite.
      const config = { produit: 'compta', nb_gerants_compta: nbGerants };
      const total = computeMensuelTotalFromConfig(config, tarifs) || 0;
      await db.query(
        `INSERT INTO paiements (abonnement_id, mois, montant_dt, statut, lignes) VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [aboId, premierDuMoisUTC(), total, total === 0 ? 'gratuit' : 'en_attente', JSON.stringify(lignesMensualite(config, tarifs, null))]
      );
      const debut = new Date().toISOString().slice(0, 10);
      for (const p of promotions) await insertPromoForAbonnement(aboId, debut, p, req.user.id, db);

      const espaceId = (await db.query(
        `INSERT INTO compta.espaces (type, titulaire_id, nom) VALUES ('cabinet', $1, $2) RETURNING id`,
        [id, nomEspace.slice(0, 200)]
      )).rows[0].id;
      await db.query(
        `INSERT INTO compta.acces (espace_id, personne_id, role, niveau, etat) VALUES ($1, $2, 'titulaire', 'complet', 'actif')`,
        [espaceId, id]
      );
      await journaliser(db, espaceId, req.user.id, 'cabinet_cree', {
        titulaire: id, nbGerants, miseEnRoute, promotions: promotions.length, ...(rattache ? { compteExistant: true } : {}),
      });
      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      db.release();
    }

    // Email d'activation (jeton de 48 h) vers compta., ou « votre cabinet est ouvert » pour un compte rattaché déjà
    // activé ; un échec n'empêche pas la création (« Renvoyer l'invitation »).
    try {
      if (jeton) await sendWelcomeEmail({ to: rattache?.email || email, nom, token: jeton, produit: 'compta' });
      else await sendCabinetOuvertEmail({ to: rattache.email, nom, cabinetNom: nomEspace });
      await pool.query(`UPDATE abonnements SET invite_sent = TRUE WHERE client_id = $1`, [id]);
    } catch (e) {
      console.error('[comptables.create] email d\'activation :', e.message);
    }
    res.status(201).json(await chargerCabinet(pool, id));
  } catch (err) {
    if (err?.statusCode === 400 || err?.statusCode === 409) return res.status(err.statusCode).json({ message: err.message });
    if (err?.code === '23505') {
      // S3c : deux créations simultanées sur le même compte rattaché — la seconde bute sur la fiche ou le cabinet.
      const memeCompte = /email|profil_entreprise_client_id_key|espaces_type_titulaire_id_key/.test(err.constraint || '');
      return res.status(409).json({ message: memeCompte ? 'Cet email est déjà utilisé' : 'Une donnée qui doit être unique est déjà utilisée' });
    }
    console.error('[comptables.create]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Le cabinet visé existe-t-il ? → { id, nom, email, activated_at, abonnement_id, espace_id } ou null.
const cible = async (db, id) => {
  if (!idValide(id)) return null;
  const r = await db.query(
    `SELECT u.id, u.nom, u.email, u.activated_at, a.id AS abonnement_id, e.id AS espace_id ${SOURCE} AND u.id = $1`,
    [id]
  );
  return r.rows[0] || null;
};

// PUT /admin/comptables/:id/identite — mêmes règles et mêmes avertissements que l'identité d'un client
// (src/utils/identite.js, matricule sans clé ou déjà porté par un autre compte) ; le nom de l'espace « cabinet » suit
// le nom affiché (carte de l'accueil de compta.).
const updateIdentite = async (req, res) => {
  const { valeurs, erreurs, avertissements } = lireIdentite(req.body || {});
  if (erreurs.length) return res.status(400).json({ message: erreurs[0].message, erreurs });
  const colonnes = Object.keys(valeurs);
  try {
    const c = await cible(pool, req.params.id);
    if (!c) return res.status(404).json({ message: 'Cabinet introuvable' });
    if (colonnes.length) {
      await pool.query(
        `UPDATE profil_entreprise SET ${colonnes.map((col, i) => `${col} = $${i + 2}`).join(', ')}, updated_at = NOW() WHERE client_id = $1`,
        [c.id, ...colonnes.map((col) => valeurs[col])]
      );
      await journaliser(pool, c.espace_id, req.user.id, 'identite_modifiee', { champs: colonnes });
    }
    avertissements.push(...await avertissementsMatricule(pool, valeurs.matricule_fiscal, c.id));
    const cabinet = await chargerCabinet(pool, c.id);
    if (cabinet?.nomAffiche) {
      await pool.query('UPDATE compta.espaces SET nom = $2, updated_at = NOW() WHERE id = $1', [c.espace_id, cabinet.nomAffiche.slice(0, 200)]);
      cabinet.espace.nom = cabinet.nomAffiche.slice(0, 200);
    }
    res.json({ ...cabinet, avertissements });
  } catch (err) {
    console.error('[comptables.updateIdentite]', err);
    res.status(500).json({ message: "Erreur lors de l'enregistrement de l'identité" });
  }
};

// PUT /admin/comptables/:id/gerants { nbGerants } — gérants achetés ; nouveau montant à partir du mois suivant (règle
// de LabFlow : le mois en cours garde le montant fixé à sa création). S3c : jamais sous les gérants en place (désactivés
// compris) — la configuration est verrouillée d'abord, comme pour un ajout par le titulaire (ordre des verrous).
const updateGerants = async (req, res) => {
  const nbGerants = nbGerantsDe(req.body?.nbGerants);
  if (nbGerants == null) return res.status(400).json({ message: `Nombre de gérants : entier de 0 à ${NB_GERANTS_MAX}` });
  const db = await pool.connect();
  try {
    const c = await cible(db, req.params.id);
    if (!c) return res.status(404).json({ message: 'Cabinet introuvable' });
    await db.query('BEGIN');
    await db.query('SELECT 1 FROM abonnement_config WHERE abonnement_id = $1 FOR UPDATE', [c.abonnement_id]);
    const enPlace = (await db.query(
      `SELECT COUNT(*)::int AS n FROM compta.acces WHERE espace_id = $1 AND role = 'gerant'`,
      [c.espace_id]
    )).rows[0].n;
    if (nbGerants < enPlace) {
      await db.query('ROLLBACK');
      return res.status(409).json({
        code: 'GERANTS_EN_PLACE',
        message: `${enPlace} gérant${enPlace > 1 ? 's sont' : ' est'} en place dans ce cabinet (désactivés compris) : le titulaire doit d'abord en retirer pour descendre à ${nbGerants}.`,
      });
    }
    await db.query('UPDATE abonnement_config SET nb_gerants_compta = $2, updated_at = NOW() WHERE abonnement_id = $1', [c.abonnement_id, nbGerants]);
    await recalcPaiementsEnAttente(db, c.abonnement_id);
    await journaliser(db, c.espace_id, req.user.id, 'gerants_modifies', { nbGerants });
    await db.query('COMMIT');
    res.json(await chargerCabinet(pool, c.id));
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('[comptables.updateGerants]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    db.release();
  }
};

// POST /admin/comptables/:id/invitation — nouveau jeton de 48 h, email d'activation vers compta.
const renvoyerInvitation = async (req, res) => {
  try {
    const c = await cible(pool, req.params.id);
    if (!c) return res.status(404).json({ message: 'Cabinet introuvable' });
    if (c.activated_at) return res.status(409).json({ message: 'Ce compte est déjà activé' });
    const jeton = generateInviteToken();
    await pool.query(
      'UPDATE utilisateurs SET invite_token = $1, invite_token_expires_at = $2, updated_at = NOW() WHERE id = $3',
      [jeton, new Date(Date.now() + 48 * 60 * 60 * 1000), c.id]
    );
    await sendWelcomeEmail({ to: c.email, nom: c.nom, token: jeton, produit: 'compta' });
    await pool.query('UPDATE abonnements SET invite_sent = TRUE WHERE client_id = $1', [c.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[comptables.renvoyerInvitation]', err);
    res.status(500).json({ message: "Erreur lors de l'envoi de l'invitation" });
  }
};

// DELETE /admin/comptables/:id — D10 : refusée dès qu'une comptabilité du cabinet contient un dossier (S4a : rien de
// comptable ne disparaît ; la contrainte RESTRICT de compta.dossiers le garantit aussi) ; refusée aussi dès qu'une
// mensualité est réglée (sa facture a été émise : elle ne doit pas disparaître) ; avant, un cabinet créé par erreur se
// supprime (espace, accès, compte ; le journal reste).
const remove = async (req, res) => {
  const db = await pool.connect();
  try {
    const c = await cible(db, req.params.id);
    if (!c) return res.status(404).json({ message: 'Cabinet introuvable' });
    const nbDossiers = await nbDossiersDuTitulaire(db, c.id);
    if (nbDossiers > 0) return res.status(409).json(refusCabinetAvecDossiers(nbDossiers));
    const regle = await db.query(`SELECT 1 FROM paiements WHERE abonnement_id = $1 AND statut = 'payé' LIMIT 1`, [c.abonnement_id]);
    if (regle.rows.length) {
      return res.status(409).json({ message: 'Ce cabinet a des factures émises (mensualités réglées) : il ne peut pas être supprimé. Archivez-le plutôt (page Abonnements, mode du compte).' });
    }
    await db.query('BEGIN');
    // Ordre des verrous des écritures du titulaire (gerantsCabinet.dansCabinet) : configuration, puis cabinet — une
    // suppression ne s'interbloque pas avec un retrait en cours (relecture de S3c).
    await db.query('SELECT 1 FROM abonnement_config WHERE abonnement_id = $1 FOR UPDATE', [c.abonnement_id]);
    await journaliser(db, c.espace_id, req.user.id, 'cabinet_supprime', { titulaire: c.id, email: c.email });
    await db.query('DELETE FROM compta.espaces WHERE titulaire_id = $1', [c.id]);
    // S3c : une personne qui garde d'autres accès (comptabilités confiées, collaboratrice d'un autre cabinet — cabinet
    // ouvert sur un compte existant) reste : seuls son cabinet, son abonnement et sa fiche d'identité disparaissent.
    const autres = await db.query('SELECT 1 FROM compta.acces WHERE personne_id = $1 LIMIT 1', [c.id]);
    if (autres.rows.length) {
      await db.query(`DELETE FROM support_demandes WHERE client_id = $1 AND statut = 'en_attente'`, [c.id]);
      await db.query('DELETE FROM abonnements WHERE client_id = $1', [c.id]);
      await db.query('DELETE FROM profil_entreprise WHERE client_id = $1', [c.id]);
    } else {
      await db.query('DELETE FROM utilisateurs WHERE id = $1', [c.id]);
    }
    await db.query('COMMIT');
    res.status(204).send();
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    if (err?.code === '23503') return res.status(409).json({ message: 'Ce cabinet ne peut pas être supprimé : des données y sont rattachées' });
    console.error('[comptables.remove]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    db.release();
  }
};

module.exports = { list, get, apercuPrix, verifierAdresse, create, updateIdentite, updateGerants, renvoyerInvitation, remove, mapCabinet, etatAdresse };
