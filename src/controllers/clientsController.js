const { validationResult } = require('express-validator');
const pool = require('../config/database');
const {
  createAbonnement, insertPromoForAbonnement,
  recalcPaiementsEnAttente, remapperComposants, loadConfigComplete,
} = require('./abonnementController');
const {
  CompositionError, deriveCompteurs, validerComposition, erreursIntroduites, resolveComposants, composantsDepuisCompteurs,
  applyComposants, invaliderProfilApresCommit, listComposantsConfig,
} = require('../services/configComposantsService');
const { getProfil, getDomaineDefautId } = require('../services/domaineProfilService');
const { oublierConversationsIA } = require('../services/clientConfigService');
const { generateInviteToken, sendWelcomeEmail } = require('../services/emailService');
const { lireIdentite, nomAffiche, identiteComplete, mapIdentite } = require('../utils/identite');
const { journaliser } = require('../compta/journal');

// Message d'un doublon refusé par la base (23505), selon la contrainte réelle (lot 3) : avant, toute collision
// répondait « email déjà utilisé ». utilisateurs_email_key : vu en production le 04/10.
const messageDoublon = (err) => {
  if (err?.constraint === 'utilisateurs_email_key' || err?.constraint === 'utilisateurs_email_lower_key') return 'Cet email est déjà utilisé';
  if (err?.constraint === 'profil_entreprise_telephone_unique') return 'Ce numéro de téléphone est déjà utilisé';
  return 'Enregistrement impossible : une donnée qui doit être unique est déjà utilisée';
};

const mapClient = (row) => ({
  id: row.id,
  name: row.nom,
  email: row.email,
  phone: row.telephone,
  role: row.role,
  onboardingStep: row.onboarding_step ?? 0,
  active: row.actif,
  createdAt: row.created_at,
  activatedAt: row.activated_at || null,
  // 'site' = converti depuis une demande d'accès du site vitrine ; sinon 'manuel'.
  origine: row.origine || 'manuel',
  domaineIds: row.domaine_ids || [],
  // Domaine du compte (lot 1a) : abonnement_config du dernier abonnement → domaines_activite
  domaineId: row.domaine_id ?? null,
  domaineNom: row.domaine_nom ?? null,
  // Adresse portée par profil_entreprise (fiche « Consulter » côté admin)
  adresse: row.adresse ?? null,
  // Lot 3 (spec §2) : identité légale (profil_entreprise), nom affiché, pastille « Identité à compléter » —
  // seulement quand la requête a lu l'identité (liste, fiche) : les réponses de create / update ne changent pas (I9).
  ...('raison_sociale' in row ? {
    entreprise: mapIdentite(row),
    nomAffiche: nomAffiche({ ...row, contact: row.nom }),
    identiteComplete: identiteComplete(row),
  } : {}),
});

// Colonnes d'identité lues par la liste et la fiche (GROUP BY pe.id : clé primaire, Postgres admet pe.*)
const IDENTITE_COLS = `pe.raison_sociale, pe.nom_commercial, pe.forme_juridique, pe.matricule_fiscal, pe.rne,
              pe.ville, pe.representant_nom, pe.representant_qualite`;

// Sous-requête LATERAL : domaine du dernier abonnement du client (id + nom)
const DOMAINE_LATERAL = `
       LEFT JOIN LATERAL (
         SELECT da.id AS domaine_id, da.nom AS domaine_nom
           FROM abonnements a
           JOIN abonnement_config ac ON ac.abonnement_id = a.id
           JOIN domaines_activite da ON da.id = ac.domaine_id
          WHERE a.client_id = u.id
          ORDER BY a.id DESC LIMIT 1
       ) dom ON true`;

const saveClientDomaines = async (client, clientId, domaineIds) => {
  await client.query('DELETE FROM client_domaines WHERE client_id = $1', [clientId]);
  if (domaineIds && domaineIds.length > 0) {
    const values = domaineIds.map((_, i) => `($1, $${i + 2})`).join(', ');
    await client.query(
      `INSERT INTO client_domaines (client_id, domaine_id) VALUES ${values} ON CONFLICT DO NOTHING`,
      [clientId, ...domaineIds]
    );
  }
};

const list = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.nom, u.email, u.telephone, u.role, u.onboarding_step, u.actif, u.created_at, u.activated_at, u.origine,
              pe.adresse, ${IDENTITE_COLS}, dom.domaine_id, dom.domaine_nom,
              ARRAY_REMOVE(ARRAY_AGG(DISTINCT cd.domaine_id), NULL) as domaine_ids
       FROM utilisateurs u
       LEFT JOIN profil_entreprise pe ON pe.client_id = u.id
       LEFT JOIN client_domaines cd ON cd.client_id = u.id
       ${DOMAINE_LATERAL}
       WHERE u.role = 'client'
       GROUP BY u.id, pe.id, dom.domaine_id, dom.domaine_nom
       ORDER BY u.nom`
    );
    res.json(result.rows.map(mapClient));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Fiche d'un client (rôle client), ou null. Lot 3 : activated_at ajouté (oubli ancien : activatedAt valait null).
const chargerClient = async (db, id) => {
  const result = await db.query(
    `SELECT u.id, u.nom, u.email, u.telephone, u.role, u.onboarding_step, u.actif, u.created_at, u.activated_at, u.origine,
            pe.adresse, ${IDENTITE_COLS}, dom.domaine_id, dom.domaine_nom,
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT cd.domaine_id), NULL) as domaine_ids
     FROM utilisateurs u
     LEFT JOIN profil_entreprise pe ON pe.client_id = u.id
     LEFT JOIN client_domaines cd ON cd.client_id = u.id
     ${DOMAINE_LATERAL}
     WHERE u.id = $1 AND u.role = 'client'
     GROUP BY u.id, pe.id, dom.domaine_id, dom.domaine_nom`,
    [id]
  );
  return result.rows[0] ? mapClient(result.rows[0]) : null;
};

const getById = async (req, res) => {
  const { id } = req.params;
  if (!/^\d{1,9}$/.test(String(id))) return res.status(404).json({ message: 'Client introuvable' });
  try {
    const client = await chargerClient(pool, id);
    if (!client) {
      return res.status(404).json({ message: 'Client introuvable' });
    }
    res.json(client);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Avertissement « déjà porté » (lot 3) : même identifiant (7 premiers caractères du matricule) sur un autre compte.
// Jamais un refus : groupes et franchises partagent un matricule. excludeId = le compte en cours d'édition.
const avertissementsMatricule = async (db, mf, excludeId = null) => {
  if (!mf) return [];
  const r = await db.query(
    `SELECT u.nom, pe.raison_sociale, pe.nom_commercial
       FROM profil_entreprise pe JOIN utilisateurs u ON u.id = pe.client_id
      WHERE LEFT(pe.matricule_fiscal, 7) = LEFT($1, 7) AND ($2::int IS NULL OR pe.client_id <> $2)
      ORDER BY pe.client_id LIMIT 3`,
    [mf, excludeId]
  );
  return r.rows.map((x) => `Ce matricule fiscal est déjà porté par le compte « ${nomAffiche({ ...x, contact: x.nom })} »`);
};

// POST /admin/clients/identite/controle — lot 3, étape 2 (spec §3) : contrôle de l'identité saisie à la 1re étape de
// l'assistant de création, avec les règles de la création (rien n'est écrit). 200 { valeurs normalisées,
// avertissements } ou 400 { message, erreurs }. Jamais 500 (l'écran perdrait la saisie) : erreur de base → 422.
const controlerIdentite = async (req, res) => {
  const { valeurs, erreurs, avertissements } = lireIdentite(req.body || {});
  if (erreurs.length) return res.status(400).json({ message: erreurs[0].message, erreurs });
  try {
    avertissements.push(...await avertissementsMatricule(pool, valeurs.matricule_fiscal));
  } catch (err) {
    console.error('[clients.controlerIdentite]', err.message);
    return res.status(422).json({ message: "Contrôle de l'identité indisponible — réessayez." });
  }
  res.json({ valeurs: mapIdentite(valeurs), avertissements });
};

// PUT /admin/clients/:id/identite — lot 3, étape 1 (spec §2) : identité légale saisie par l'admin.
// N'écrit QUE les colonnes d'identité présentes dans le corps (+ adresse) ; rien d'autre ne les lit à cette étape.
// Un matricule fiscal déjà porté par un autre compte (même identifiant à 7 chiffres) n'est pas refusé (groupes,
// franchises) : avertissement. Garde de l'id : 1 à 9 chiffres (au-delà, Postgres répondrait 22003, donc 500).
const updateIdentite = async (req, res) => {
  const { id } = req.params;
  if (!/^\d{1,9}$/.test(String(id))) return res.status(404).json({ message: 'Client introuvable' });
  const { valeurs, erreurs, avertissements } = lireIdentite(req.body || {});
  if (erreurs.length) {
    return res.status(400).json({ message: erreurs[0].message, erreurs });
  }
  const colonnes = Object.keys(valeurs);
  try {
    const u = await pool.query(`SELECT id, nom, email FROM utilisateurs WHERE id = $1 AND role = 'client'`, [id]);
    if (!u.rows.length) return res.status(404).json({ message: 'Client introuvable' });
    if (colonnes.length) {
      // Ligne créée si absente (nom et email NOT NULL : copie du contact, comme à la création du compte).
      const params = [id, u.rows[0].nom, u.rows[0].email, ...colonnes.map((c) => valeurs[c])];
      await pool.query(
        `INSERT INTO profil_entreprise (client_id, nom, email, ${colonnes.join(', ')})
         VALUES ($1, $2, $3, ${colonnes.map((_, i) => `$${i + 4}`).join(', ')})
         ON CONFLICT (client_id) DO UPDATE SET ${colonnes.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}, updated_at = NOW()`,
        params
      );
    }
    avertissements.push(...await avertissementsMatricule(pool, valeurs.matricule_fiscal, Number(id)));
    const client = await chargerClient(pool, id);
    res.json({ ...client, avertissements });
  } catch (err) {
    console.error('[clients.updateIdentite]', err);
    res.status(500).json({ message: "Erreur lors de l'enregistrement de l'identité" });
  }
};

// ── Seeds par domaine à la création du compte (lot 1b §5) ────────────────────
// regles.unites_seed      : unités de MESURE créées pour le client (table unites, UNIQUE(nom, client_id)).
// regles.prestataires_seed : canaux = prestataires_livraison EXISTANTS (par nom, insensible à la casse),
//                            liés au compte dans entreprise_prestataires ; un nom inconnu est ignoré (warn).
// Listes vides (défaut de tous les domaines existants) = comportement actuel : rien n'est créé.
const appliquerSeedsDomaine = async (clientId, domaineId) => {
  const profil = domaineId != null ? await getProfil(domaineId) : null;
  const regles = profil?.regles || {};
  const unites = Array.isArray(regles.unites_seed) ? regles.unites_seed.map((u) => String(u).trim()).filter(Boolean) : [];
  const canaux = Array.isArray(regles.prestataires_seed) ? regles.prestataires_seed.map((p) => String(p).trim()).filter(Boolean) : [];
  let nbUnites = 0;
  let nbCanaux = 0;
  for (const nom of unites) {
    const r = await pool.query(
      'INSERT INTO unites (nom, client_id) VALUES ($1, $2) ON CONFLICT (nom, client_id) DO NOTHING RETURNING id',
      [nom.slice(0, 50), clientId]
    );
    nbUnites += r.rowCount;
  }
  if (canaux.length) {
    const pe = await pool.query('SELECT id FROM profil_entreprise WHERE client_id = $1', [clientId]);
    const entrepriseId = pe.rows[0]?.id;
    for (const nom of entrepriseId ? canaux : []) {
      const p = await pool.query(
        'SELECT id FROM prestataires_livraison WHERE lower(nom) = lower($1) ORDER BY actif DESC, created_at LIMIT 1',
        [nom]
      );
      if (!p.rows.length) { console.warn(`[clients.create] prestataires_seed : canal « ${nom} » inconnu (à créer dans Admin › Prestataires)`); continue; }
      const r = await pool.query(
        'INSERT INTO entreprise_prestataires (entreprise_id, prestataire_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [entrepriseId, p.rows[0].id]
      );
      nbCanaux += r.rowCount;
    }
  }
  if (nbUnites || nbCanaux) console.log(`[clients.create] seeds domaine « ${profil?.slug || '?'} » (client ${clientId}) : ${nbUnites} unité(s), ${nbCanaux} canal(aux)`);
  return { nbUnites, nbCanaux };
};

const create = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  // Lot 3 : rogné une seule fois (la garde de 100 caractères porte sur la valeur réellement enregistrée).
  const nom = String(req.body.name || req.body.nom || '').trim();
  const { email, telephone } = req.body;
  const domaineIds = Array.isArray(req.body.domaineIds) ? req.body.domaineIds.map(Number).filter(Boolean) : [];

  // New config-based fields (new modal flow).
  // != null (et pas truthy) : 0 activité est valide (compte dépôt = labo + acheteurs).
  const nbActivites  = req.body.nbActivites  != null ? parseInt(req.body.nbActivites)  : null;
  const nbLabos      = req.body.nbLabos      != null ? parseInt(req.body.nbLabos)      : null;
  const nbGerants    = req.body.nbGerants    != null ? parseInt(req.body.nbGerants)    : null;
  // Option Acheteurs à la création : quota = borne du palier (0 = pas d'option)
  const nbAcheteurs  = req.body.nbAcheteurs  != null ? parseInt(req.body.nbAcheteurs)  : 0;
  // Formule des activités : basique | premium (défaut premium quand il y a des activités)
  const formuleActivites = req.body.formuleActivites === 'basique' ? 'basique' : 'premium';
  const montantOnboardingConfig = req.body.montantOnboarding != null ? parseFloat(req.body.montantOnboarding) : null;

  if (!nom) return res.status(400).json({ message: 'Nom requis' });
  if (!email) return res.status(400).json({ message: 'Email requis' });
  // utilisateurs.nom est un VARCHAR(100) : 400 explicite plutôt qu'une erreur de base (500).
  if (nom.length > 100) return res.status(400).json({ message: 'Nom du contact : 100 caractères au maximum' });

  // Lot 3, étape 2 (spec §3) : identité légale lue et contrôlée AVANT toute écriture, mêmes règles que
  // PUT /admin/clients/:id/identite (src/utils/identite.js). Toute l'identité est facultative (pastille ensuite).
  // L'adresse (rue) est une colonne d'identité, normalisée ici.
  const identite = lireIdentite(req.body);
  if (identite.erreurs.length) return res.status(400).json({ message: identite.erreurs[0].message, erreurs: identite.erreurs });
  const adresse = identite.valeurs.adresse ?? null;
  const colonnesIdentite = Object.keys(identite.valeurs).filter((c) => c !== 'adresse');

  // ── Domaine du compte + composition (lot 1a) — validée AVANT toute écriture ──
  // domaineId (int) sinon domaineIds[0] (legacy) sinon domaine par défaut (restauration).
  // composants [{ code, nb }] sinon dérivés des compteurs nbActivites/nbLabos/nbGerants/nbAcheteurs.
  const composantsIn = Array.isArray(req.body.composants) ? req.body.composants : null;
  const aUneConfig = nbActivites != null || (composantsIn && composantsIn.length > 0);
  const domaineIdReq = parseInt(req.body.domaineId, 10);
  const domaineExplicite = (Number.isFinite(domaineIdReq) && domaineIdReq > 0) || domaineIds.length > 0;
  let domaineId = Number.isFinite(domaineIdReq) && domaineIdReq > 0 ? domaineIdReq : (domaineIds[0] ?? null);
  let config = null;
  let composantsResolus = [];
  try {
    if (domaineId == null) domaineId = await getDomaineDefautId();
    const profil = domaineId != null ? await getProfil(domaineId) : null;
    if (domaineExplicite && !profil) return res.status(400).json({ message: 'Domaine inconnu' });
    if (aUneConfig) {
      if (!profil) return res.status(400).json({ message: "Aucun domaine d'activité disponible" });
      const items = composantsIn && composantsIn.length
        ? composantsIn
        : await composantsDepuisCompteurs(domaineId, {
            nbActivites: nbActivites ?? 1, nbLabos: nbLabos || 0, nbGerants: nbGerants || 0, nbAcheteurs,
          });
      composantsResolus = await resolveComposants(pool, domaineId, items, { creer: false });
      const compteurs = deriveCompteurs(composantsResolus);
      const erreurs = validerComposition({ compteurs, regles: profil.regles, composants: composantsResolus });
      if (erreurs.length) throw new CompositionError(erreurs);
      config = {
        nbActivites: compteurs.nb_activites, nbLabos: compteurs.nb_labos, nbGerants: compteurs.nb_gerants,
        nbAcheteurs: compteurs.nb_acheteurs, formuleActivites,
        montantOnboarding: montantOnboardingConfig || 0,
        domaineId,
        composants: composantsResolus.map((c) => ({ code: c.code, nb: c.nb })),
      };
    }
  } catch (err) {
    if (err instanceof CompositionError) return res.status(400).json({ message: err.message, code: err.code, erreurs: err.erreurs });
    console.error('[clients.create] validation composition:', err);
    return res.status(400).json({ message: 'Configuration invalide' });
  }
  const nbAcheteursEff = config ? config.nbAcheteurs : nbAcheteurs;

  try {
    // Lot 3 : téléphone comparé sur ses 8 derniers chiffres (« +216 20 123 456 » = « 20123456 ») avec celui des comptes
    // (utilisateurs, tous rôles, comme avant) et des fiches entreprise À JOUR. Une copie périmée de profil_entreprise
    // (le contact a changé de numéro depuis : la copie n'est jamais resynchronisée — 1 cas en production au 04/10)
    // n'est pas un doublon. Le compte qui porte le numéro est nommé (route admin).
    if (telephone) {
      const tel8 = String(telephone).replace(/\D/g, '').slice(-8);
      const telCheck = await pool.query(
        `SELECT u.nom AS porteur FROM utilisateurs u
          WHERE RIGHT(regexp_replace(COALESCE(u.telephone, ''), '[^0-9]', '', 'g'), 8) = $1
         UNION ALL
         SELECT COALESCE(pe.nom_commercial, pe.raison_sociale, pe.nom) FROM profil_entreprise pe
           JOIN utilisateurs u2 ON u2.id = pe.client_id
          WHERE RIGHT(regexp_replace(COALESCE(pe.telephone, ''), '[^0-9]', '', 'g'), 8) = $1
            AND RIGHT(regexp_replace(COALESCE(u2.telephone, ''), '[^0-9]', '', 'g'), 8) = $1
         LIMIT 1`,
        [tel8]
      );
      if (telCheck.rows.length > 0) {
        return res.status(409).json({ message: `Ce numéro de téléphone est déjà utilisé (compte « ${telCheck.rows[0].porteur} »)` });
      }
    }

    // Comparaison sans la casse, comme GET /auth/check-email (contrôle de l'assistant).
    const existing = await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
    }

    const inviteToken = generateInviteToken();
    const inviteExpires = new Date(Date.now() + 48 * 60 * 60 * 1000);

    let user;
    const dbClient = await pool.connect();
    try {
      await dbClient.query('BEGIN');

      const userResult = await dbClient.query(
        `INSERT INTO utilisateurs (nom, email, mot_de_passe, telephone, role, onboarding_step, invite_token, invite_token_expires_at)
         VALUES ($1, $2, NULL, $3, 'client', 1, $4, $5)
         RETURNING id, nom, email, telephone, role, onboarding_step, actif, created_at`,
        [nom, email, telephone || null, inviteToken, inviteExpires]
      );
      user = userResult.rows[0];

      // Lot 3 : une copie périmée de profil_entreprise porte peut-être EXACTEMENT ce numéro (contrainte UNIQUE
      // profil_entreprise_telephone_unique) : la copie du nouveau compte reste alors vide, le compte est créé.
      let telProfil = telephone || null;
      if (telProfil) {
        const perime = await dbClient.query('SELECT client_id FROM profil_entreprise WHERE telephone = $1', [telProfil]);
        if (perime.rows.length) {
          console.warn(`[clients.create] téléphone ${telProfil} encore copié dans le profil du compte ${perime.rows[0].client_id} (copie périmée) : copie du nouveau compte laissée vide`);
          telProfil = null;
        }
      }
      // Lot 3 : + colonnes d'identité saisies (raison sociale, matricule fiscal…), déjà contrôlées.
      await dbClient.query(
        `INSERT INTO profil_entreprise (client_id, nom, email, telephone, adresse${colonnesIdentite.map((c) => `, ${c}`).join('')})
         VALUES ($1, $2, $3, $4, $5${colonnesIdentite.map((_, i) => `, $${i + 6}`).join('')})
         ON CONFLICT (client_id) DO NOTHING
         RETURNING id`,
        [user.id, nom, email, telProfil, adresse || null, ...colonnesIdentite.map((c) => identite.valeurs[c])]
      );

      // Option Acheteurs choisie dès la création : module activé immédiatement
      if (nbAcheteursEff > 0) {
        await dbClient.query(
          `UPDATE profil_entreprise SET module_acheteurs_actif = true, module_acheteurs_activated_at = NOW()
           WHERE client_id = $1`,
          [user.id]
        );
      }

      // Un seul domaine par compte : client_domaines = [domaineId] (legacy : domaineIds[0])
      if (domaineId != null && (config || domaineExplicite)) {
        await saveClientDomaines(dbClient, user.id, [domaineId]);
      }

      await dbClient.query('COMMIT');
    } catch (err) {
      await dbClient.query('ROLLBACK');
      throw err;
    } finally {
      dbClient.release();
    }

    // Create abonnement with config (validée ci-dessus) — transactionnel dans createAbonnement :
    // abonnements + abonnement_config (domaine_id) + composants + paiement du mois.
    // Plus de repli tarifaire legacy (entreprise_onboarding purgé avec l'ancien modèle)
    const montantOnboarding = montantOnboardingConfig;

    const aboId = await createAbonnement(user.id, montantOnboarding, config);
    // Détail réel écrit en base (nom du domaine) pour la réponse
    const cfgComplete = config ? await loadConfigComplete(aboId).catch(() => null) : null;

    // Seeds par domaine (unités de mesure, canaux) — jamais bloquant pour la création.
    try {
      await appliquerSeedsDomaine(user.id, domaineId);
    } catch (seedErr) {
      console.warn(`[clients.create] seeds domaine non appliqués (client ${user.id}) : ${seedErr.message}`);
    }

    // Create promotions passed during client creation
    const promotions = Array.isArray(req.body.promotions) ? req.body.promotions : [];
    if (promotions.length > 0) {
      const todayStr = new Date().toISOString().slice(0, 10);
      for (const promoData of promotions) {
        await insertPromoForAbonnement(aboId, todayStr, promoData, req.user.id);
      }
    }

    // Promo SYSTÈME « 1er mois offert » : mensualité du mois de création à 0 DT,
    // créée automatiquement pour tout nouveau client (couvre la conversion d'une
    // demande d'accès ET la création directe), et non supprimable (is_system).
    // Insérée APRÈS les promos manuelles : si l'admin a déjà posé une promo
    // mensualité sur ce mois, la sienne prime et la promo système est simplement
    // ignorée (try/catch) — elle ne doit jamais faire échouer la création.
    try {
      const premierDuMois = `${new Date().toISOString().slice(0, 7)}-01`;
      await insertPromoForAbonnement(aboId, premierDuMois, {
        type: 'free_months',
        appliesTo: 'mensualite',
        dateDebut: premierDuMois,
        monthsDuration: 1,
        isSystem: true,
      }, req.user.id);
    } catch (promoErr) {
      console.warn(`[clients.create] promo « 1er mois offert » non appliquée (abo ${aboId}) : ${promoErr.message}`);
    }

    // Lot 3, étape 3 : LabFlow est sans engagement — plus de contrat à signer. L'email d'activation part tout de suite
    // (jeton de 48 h créé plus haut) ; un échec d'envoi n'empêche pas la création (« ✉️ Renvoyer » côté admin).
    try {
      await sendWelcomeEmail({ to: email, nom, token: inviteToken });
      await pool.query(`UPDATE abonnements SET invite_sent = TRUE WHERE client_id = $1`, [user.id]).catch(() => {});
    } catch (emailErr) {
      console.error('Welcome email error:', emailErr.message);
    }

    const domaineIdsOut = domaineId != null && (config || domaineExplicite) ? [domaineId] : [];
    res.status(201).json({
      ...mapClient(user),
      domaineIds: domaineIdsOut,
      domaineId: domaineIdsOut[0] ?? null,
      domaineNom: cfgComplete?.domaine_nom ?? null,
    });
  } catch (err) {
    // Erreur métier de createAbonnement (ex. DOMAINE_INTROUVABLE) : 400 explicite, jamais un 500 wizard
    if (err?.status === 400) return res.status(400).json({ message: err.message, code: err.code || 'CONFIG_INVALIDE' });
    // Lot 3 : doublon détecté par la base (course entre deux créations) — message selon la contrainte réelle.
    if (err?.code === '23505') return res.status(409).json({ message: messageDoublon(err) });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const update = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const nom = req.body.name || req.body.nom;
  const { email, active, actif } = req.body;
  const telephone = req.body.telephone || req.body.phone;
  const activeValue = active !== undefined ? active : actif;
  const onboardingStep = req.body.onboardingStep !== undefined ? req.body.onboardingStep : null;
  // Domaine du compte (lot 1a) : domaineId (int) ou domaineIds legacy (= [domaineId]). 400 si inconnu.
  const domaineIdsLegacy = Array.isArray(req.body.domaineIds) ? req.body.domaineIds.map(Number).filter(Boolean) : null;
  const domaineIdReq = parseInt(req.body.domaineId, 10);
  let domaineId = null;
  if (Number.isFinite(domaineIdReq) && domaineIdReq > 0) domaineId = domaineIdReq;
  else if (domaineIdsLegacy && domaineIdsLegacy.length) domaineId = domaineIdsLegacy[0];
  if (domaineId != null) {
    const dom = await pool.query('SELECT id FROM domaines_activite WHERE id = $1', [domaineId]);
    if (!dom.rows.length) return res.status(400).json({ message: 'Domaine inconnu' });
  }
  // `domaineIds: []` (legacy) est IGNORÉ : vider client_domaines casserait l'invariant
  // « client_domaines = exactement le domaine de abonnement_config » (1 domaine par compte).
  const domaineIds = domaineId != null ? [domaineId] : null;

  // Check tel uniqueness (exclude current user)
  if (telephone) {
    const telCheck = await pool.query(
      'SELECT id FROM utilisateurs WHERE telephone = $1 AND id != $2',
      [telephone, id]
    );
    if (telCheck.rows.length > 0)
      return res.status(409).json({ message: 'Ce numéro de téléphone est déjà utilisé' });
  }

  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const result = await dbClient.query(
      `UPDATE utilisateurs
       SET nom = COALESCE($1, nom),
           email = COALESCE($2, email),
           telephone = COALESCE($3, telephone),
           actif = COALESCE($4, actif),
           onboarding_step = COALESCE($5, onboarding_step),
           updated_at = NOW()
       WHERE id = $6 AND role = 'client'
       RETURNING id, nom, email, telephone, role, onboarding_step, actif, created_at`,
      [nom || null, email || null, telephone || null, activeValue !== undefined ? activeValue : null, onboardingStep !== null ? onboardingStep : null, id]
    );
    if (result.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ message: 'Client introuvable' });
    }

    const updatedUser = result.rows[0];

    // Update domain assignments if provided
    if (domaineIds !== null) {
      await saveClientDomaines(dbClient, id, domaineIds);
    }

    // Changement de domaine (lot 1a) : abonnement_config.domaine_id du dernier abonnement,
    // composants re-mappés sur le nouveau domaine (même code sinon 1er composant du type,
    // compteurs et mensualité conservés), paiements en attente recalculés sur sa grille.
    let aboIdDomaine = null;
    let vocabChange = false; // purge de l'assistant : seulement si le vocabulaire change
    let resultatComposants = null;
    if (domaineId != null) {
      const aboRes = await dbClient.query(
        `SELECT a.id, ac.domaine_id FROM abonnements a
           JOIN abonnement_config ac ON ac.abonnement_id = a.id
          WHERE a.client_id = $1 ORDER BY a.id DESC LIMIT 1`,
        [id]
      );
      if (aboRes.rows.length && aboRes.rows[0].domaine_id !== domaineId) {
        aboIdDomaine = aboRes.rows[0].id;
        // Domaine NULL (config antérieure au backfill de la 187) = restauration : l'y rattacher ne purge rien
        vocabChange = (aboRes.rows[0].domaine_id ?? (await getDomaineDefautId(dbClient))) !== domaineId;
        const composants = await remapperComposants(dbClient, aboIdDomaine, domaineId);
        // Composition re-mappée validée contre les règles / bornes (nb_min, nb_max) du
        // domaine CIBLE : seules les erreurs introduites par le changement bloquent (400).
        const actuels = await listComposantsConfig(aboIdDomaine, dbClient);
        const cfgCur = (await dbClient.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1', [aboIdDomaine])).rows[0] || {};
        const [profilAvant, profilCible] = await Promise.all([
          aboRes.rows[0].domaine_id ? getProfil(aboRes.rows[0].domaine_id) : null, getProfil(domaineId),
        ]);
        const resolus = await resolveComposants(dbClient, domaineId, composants, { creer: false, actuels });
        const erreurs = erreursIntroduites(
          validerComposition({ compteurs: cfgCur, regles: profilAvant?.regles, composants: actuels }),
          validerComposition({ compteurs: deriveCompteurs(resolus), regles: profilCible?.regles, composants: resolus })
        );
        if (erreurs.length) throw new CompositionError(erreurs);
        resultatComposants = await applyComposants(dbClient, aboIdDomaine, { domaineId, composants, mode: 'set' });
      }
    }

    await dbClient.query('COMMIT');
    // Composant identité créé à la volée : le profil du domaine en cache ne l'a pas (spec §5.4)
    invaliderProfilApresCommit(resultatComposants);
    if (aboIdDomaine) {
      await recalcPaiementsEnAttente(pool, aboIdDomaine).catch((e) => console.error('[clients.update] recalc paiements:', e.message));
      // Domaine changé : l'assistant oublie les conversations dites dans l'ancien vocabulaire
      // (lot 2b, spec §5.6) — au mieux, jamais un 500.
      if (vocabChange) await oublierConversationsIA(id).catch((e) => console.error('[clients.update] purge assistant:', e.message));
    }

    // Return with fresh domaineIds + domaine du compte
    const [domainesRes, domRes] = await Promise.all([
      pool.query('SELECT domaine_id FROM client_domaines WHERE client_id = $1', [id]),
      pool.query(
        `SELECT da.id AS domaine_id, da.nom AS domaine_nom FROM abonnements a
           JOIN abonnement_config ac ON ac.abonnement_id = a.id
           JOIN domaines_activite da ON da.id = ac.domaine_id
          WHERE a.client_id = $1 ORDER BY a.id DESC LIMIT 1`,
        [id]
      ),
    ]);
    res.json({
      ...mapClient({ ...updatedUser, domaine_id: domRes.rows[0]?.domaine_id ?? null, domaine_nom: domRes.rows[0]?.domaine_nom ?? null }),
      domaineIds: domainesRes.rows.map((r) => r.domaine_id),
    });
  } catch (err) {
    await dbClient.query('ROLLBACK').catch(() => {});
    if (err.code === '23505') {
      return res.status(409).json({ message: messageDoublon(err) });
    }
    if (err instanceof CompositionError) {
      return res.status(400).json({ message: err.message, code: err.code, erreurs: err.erreurs });
    }
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    dbClient.release();
  }
};

const remove = async (req, res) => {
  const { id } = req.params;
  const dbClient = await pool.connect();
  try {
    await dbClient.query('BEGIN');

    const check = await dbClient.query(
      "SELECT id, nom, email FROM utilisateurs WHERE id = $1 AND role = 'client'",
      [id]
    );
    if (check.rows.length === 0) {
      await dbClient.query('ROLLBACK');
      return res.status(404).json({ message: 'Client introuvable' });
    }

    // Collect all user IDs owned by this client (client + its gérants)
    const usersRes = await dbClient.query(
      "SELECT id FROM utilisateurs WHERE id = $1 OR gerant_parent_id = $1",
      [id]
    );
    const userIds = usersRes.rows.map((r) => r.id);
    const uPlaceholders = userIds.map((_, i) => `$${i + 1}`).join(', ');

    // SET NULL on created_by columns that have no ON DELETE action.
    // Use SAVEPOINT per table so a missing table/column doesn't abort the transaction.
    const auditTables = [
      'stock_entreprise_daily', 'stock_labo_daily',
      'pertes', 'labo_transfers', 'inventaires', 'ventes',
      'acheteurs', 'commandes_acheteur', 'acheteur_offre_prix_historique',
    ];
    for (const t of auditTables) {
      await dbClient.query('SAVEPOINT sp_audit');
      try {
        await dbClient.query(
          `UPDATE ${t} SET created_by = NULL WHERE created_by IN (${uPlaceholders})`,
          userIds
        );
        await dbClient.query('RELEASE SAVEPOINT sp_audit');
      } catch (_) {
        await dbClient.query('ROLLBACK TO SAVEPOINT sp_audit');
      }
    }
    // commandes_acheteur.traite_par référence aussi utilisateurs sans ON DELETE
    await dbClient.query('SAVEPOINT sp_audit');
    try {
      await dbClient.query(
        `UPDATE commandes_acheteur SET traite_par = NULL WHERE traite_par IN (${uPlaceholders})`,
        userIds
      );
      await dbClient.query('RELEASE SAVEPOINT sp_audit');
    } catch (_) {
      await dbClient.query('ROLLBACK TO SAVEPOINT sp_audit');
    }

    // Delete RESTRICT-blocked tables before cascade reaches articles/produits/unites.
    // produit_ingredients references articles (ingredient_id RESTRICT) and unites (unite_id RESTRICT)
    await dbClient.query(
      `DELETE FROM produit_ingredients WHERE produit_id IN (
         SELECT id FROM produits WHERE client_id = $1
       )`,
      [id]
    );
    // produit_sous_produits references produits (sous_produit_id RESTRICT)
    await dbClient.query(
      `DELETE FROM produit_sous_produits
       WHERE produit_id IN (SELECT id FROM produits WHERE client_id = $1)
          OR sous_produit_id IN (SELECT id FROM produits WHERE client_id = $1)`,
      [id]
    );
    // article_vendable_prix_historique may not exist in all deployments
    await dbClient.query('SAVEPOINT sp_avph');
    try {
      await dbClient.query(
        `DELETE FROM article_vendable_prix_historique
         WHERE article_id IN (SELECT id FROM articles WHERE client_id = $1)`,
        [id]
      );
      await dbClient.query('RELEASE SAVEPOINT sp_avph');
    } catch (_) {
      await dbClient.query('ROLLBACK TO SAVEPOINT sp_avph');
    }

    // Delete the client — all remaining data cascades automatically:
    //   utilisateurs → profil_entreprise → activites/labos/fournisseurs → stock/pertes/ventes/inventaires
    //   utilisateurs → abonnements → paiements/promotions/abonnement_config
    //   utilisateurs → unites/articles/produits/categories/familles/client_domaines/...
    //   utilisateurs → gérant child accounts (gerant_parent_id CASCADE)
    // LabFlow Compta (S2c, D10) : la comptabilité du client (module Comptabilité) ne cascade pas (titulaire RESTRICT) :
    // sans dossier à cette étape, elle est retirée avant le compte, avec ses accès ; le journal reste.
    const espacesCompta = await dbClient.query(
      `SELECT id FROM compta.espaces WHERE titulaire_id = $1 AND type = 'client_labflow'`,
      [id]
    );
    for (const e of espacesCompta.rows) {
      // Le compte va disparaître : le journal garde de quoi l'identifier.
      await journaliser(dbClient, e.id, req.user?.id, 'espace_supprime', { titulaire: Number(id), espace: e.id, nom: check.rows[0].nom, email: check.rows[0].email });
      await dbClient.query('DELETE FROM compta.espaces WHERE id = $1', [e.id]);
    }
    await dbClient.query(
      "DELETE FROM utilisateurs WHERE id = $1 AND role = 'client'",
      [id]
    );

    // Les comptes portail acheteurs ne cascadent pas (aucun lien gerant_parent_id) :
    // balayage d'existence APRÈS le pivot — la fiche acheteurs a cascadé, le compte
    // devenu orphelin est purgé (sinon son email resterait verrouillé à jamais).
    // Étanche aux créations concurrentes (une fiche committée pendant la fenêtre a
    // cascadé aussi) et nettoie au passage les orphelins historiques.
    await dbClient.query(
      `DELETE FROM utilisateurs u
       WHERE u.role = 'acheteur'
         AND NOT EXISTS (SELECT 1 FROM acheteurs a WHERE a.user_id = u.id)`
    );

    await dbClient.query('COMMIT');

    res.status(204).send();
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Client delete error:', err);
    res.status(500).json({ message: 'Erreur lors de la suppression du client' });
  } finally {
    dbClient.release();
  }
};

module.exports = { list, getById, updateIdentite, controlerIdentite, create, update, remove, avertissementsMatricule };
