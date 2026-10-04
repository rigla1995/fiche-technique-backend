const { validationResult } = require('express-validator');
const pool = require('../config/database');
const {
  createAbonnement, insertPromoForAbonnement, computeEffectivePricing,
  recalcPaiementsEnAttente, remapperComposants, loadConfigComplete,
} = require('./abonnementController');
const {
  CompositionError, deriveCompteurs, validerComposition, erreursIntroduites, resolveComposants, composantsDepuisCompteurs,
  applyComposants, invaliderProfilApresCommit, listComposantsConfig,
} = require('../services/configComposantsService');
const { getProfil, getDomaineDefautId } = require('../services/domaineProfilService');
const { vocabDefaut, vocabDuDomaine } = require('../utils/vocabCompte');
const { oublierConversationsIA } = require('../services/clientConfigService');
const { generateInviteToken, sendWelcomeWithContractEmail, sendDocusealSigningEmail } = require('../services/emailService');
const { generateContratPdf } = require('../services/pdfService');
const {
  createContractSubmission, createSubmission, createSubmissionFromPdf,
  isConfigured: docusealConfigured, isConfiguredPdf: docusealPdfConfigured,
} = require('../services/docusealService');
const { buildContratDocument, buildResiliationDocument } = require('../services/contractPdfService');
const { lireIdentite, nomAffiche, identiteComplete, mapIdentite } = require('../utils/identite');

// Formatage pour les champs Docuseal
const fmtDtC = (n) => (n != null ? `${Math.round(Number(n))} DT` : '—');
const fmtDateC = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }) : '';

// Construit les champs promo du contrat à partir du détail tarifaire effectif.
// Retourne { montantOnboarding, montantMensuel, extraFields } pour la soumission Docuseal.
// `domaineNom` (lot 1a) : champ « Domaine » du flux template (filtré par le retry 422
// tant que le template DocuSeal ne le porte pas — cf docuseal-templates/CHAMPS.md).
// `voc` (lot 2b, spec §8.2) : vocabulaire du compte, pour la VALEUR « Option Acheteurs » ; les noms de
// champs DocuSeal ne changent pas (un nom traduit serait retiré en silence par le retry 422).
const buildContractPricingFields = (pricing, domaineNom = null, voc = vocabDefaut) => {
  if (!pricing) return { montantOnboarding: null, montantMensuel: null, extraFields: [] };
  const { baseOnboarding, effOnboarding, baseMensuel, effMensuel, promoMens, promoOb, promoMonths, baseResumeDate, hasPromo } = pricing;

  let detail;
  if (!hasPromo) {
    detail = 'Aucune promotion — tarifs standard.';
  } else {
    const parts = [];
    if (promoOb) {
      parts.push(effOnboarding === 0
        ? "Frais d'activation offerts (au lieu de " + fmtDtC(baseOnboarding) + ')'
        : `Frais d'activation : ${fmtDtC(effOnboarding)} au lieu de ${fmtDtC(baseOnboarding)}`);
    }
    if (promoMens) {
      let m = effMensuel === 0
        ? `Mensualité offerte (au lieu de ${fmtDtC(baseMensuel)})`
        : `Mensualité : ${fmtDtC(effMensuel)} au lieu de ${fmtDtC(baseMensuel)}`;
      if (promoMonths) m += ` pendant ${promoMonths} mois`;
      if (baseResumeDate) m += `, puis ${fmtDtC(baseMensuel)} à partir du ${fmtDateC(baseResumeDate)}`;
      parts.push(m);
    }
    detail = parts.join('  ·  ');
  }

  // Formule d'activités + option Acheteurs : nouvelles lignes du contrat (le
  // template Docuseal doit porter les champs éponymes, cf docuseal-templates/CHAMPS.md ;
  // createSubmission ignore proprement les champs absents d'un template en retard).
  // Formule : Basique/Premium. Défense — si la formule manque alors qu'il y a des
  // activités, on retombe sur « Activité Premium » (aligné sur buildContratDocument),
  // pour ne jamais envoyer un champ Formule vide au contrat.
  const aDesActivites = (pricing.nbActivites ?? 1) >= 1;
  const formuleLabel = pricing.formuleActivites
    ? (pricing.formuleActivites === 'basique' ? 'Activité Basique' : 'Activité Premium')
    : (aDesActivites ? 'Activité Premium' : '');
  const acheteursLabel = pricing.palierAcheteurs
    ? `Palier jusqu'à ${pricing.palierAcheteurs} ${voc.nom('acheteur', true)}`
    : '';

  return {
    montantOnboarding: effOnboarding,
    montantMensuel: effMensuel,
    extraFields: [
      { name: 'Formule', default_value: formuleLabel },
      { name: 'Option Acheteurs', default_value: acheteursLabel },
      { name: 'Détail promotion', default_value: detail },
      { name: 'Mensualité après promo', default_value: hasPromo && promoMens ? fmtDtC(baseMensuel) : '' },
      { name: 'Reprise prix de base', default_value: baseResumeDate ? fmtDateC(baseResumeDate) : '' },
      { name: 'Domaine', default_value: domaineNom || '' },
    ],
  };
};

// Soumission Docuseal du contrat : d'abord le flux « PDF rempli » (document généré
// par client, prestataire pré-signé — createSubmissionFromPdf), avec REPLI sur le
// flux template historique si la génération ou l'API échoue, ou si seul le template
// est configuré. Retourne { submissionId, signingUrl } dans les deux cas.
// voc : vocabulaire du compte créé (vocabDuDomaine, lot 2b spec §8.2) — valeurs du document et des champs.
const submitContratForSignature = async ({ aboId, pricing, nom, email, telephone, adresse, config, montantOnboarding, voc = vocabDefaut }) => {
  if (docusealPdfConfigured() && pricing) {
    try {
      const docu = await buildContratDocument({
        abonnementId: aboId,
        client: { nom, email, telephone, adresse },
        config,
        pricing,
        montantOnboarding,
        voc,
      });
      return await createSubmissionFromPdf({
        pdfBase64: docu.base64,
        documentName: docu.documentName,
        clientName: nom,
        clientEmail: email,
      });
    } catch (e) {
      console.error('[docuseal] flux PDF rempli échoué, repli sur le template:', e.message);
    }
  }
  const pf = buildContractPricingFields(pricing, config?.domaineNom || null, voc);
  return createContractSubmission({
    clientName: nom,
    clientEmail: email,
    nbActivites:       config.nbActivites ?? 1,
    nbLabos:           config.nbLabos ?? 0,
    nbGerants:         config.nbGerants ?? 0,
    montantOnboarding: pf.montantOnboarding ?? montantOnboarding ?? null,
    montantMensuel:    pf.montantMensuel ?? null,
    extraFields:       pf.extraFields,
  });
};

// Acte de résiliation : même logique PDF rempli → repli template.
const submitResiliationForSignature = async ({ id, nom, email }) => {
  const clientName = nom || 'Client';
  if (docusealPdfConfigured()) {
    try {
      const docu = await buildResiliationDocument({ clientId: id, client: { nom: clientName, email } });
      return await createSubmissionFromPdf({
        pdfBase64: docu.base64,
        documentName: docu.documentName,
        clientName,
        clientEmail: email,
      });
    } catch (e) {
      console.error('[resiliation] flux PDF rempli échoué, repli sur le template:', e.message);
    }
  }
  return createSubmission({ type: 'resiliation', clientName, clientEmail: email });
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
    if (valeurs.matricule_fiscal) {
      const autres = await pool.query(
        `SELECT u.nom, pe.raison_sociale, pe.nom_commercial
           FROM profil_entreprise pe JOIN utilisateurs u ON u.id = pe.client_id
          WHERE LEFT(pe.matricule_fiscal, 7) = LEFT($1, 7) AND pe.client_id <> $2
          ORDER BY pe.client_id LIMIT 3`,
        [valeurs.matricule_fiscal, id]
      );
      for (const r of autres.rows) {
        avertissements.push(`Ce matricule fiscal est déjà porté par le compte « ${nomAffiche({ ...r, contact: r.nom })} »`);
      }
    }
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

  const nom = req.body.name || req.body.nom;
  const { email, telephone, adresse } = req.body;
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
  const contractPdfBase64 = req.body.contractPdfBase64 || null;

  if (!nom) return res.status(400).json({ message: 'Nom requis' });
  if (!email) return res.status(400).json({ message: 'Email requis' });

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

  if (telephone) {
    const telCheck = await pool.query('SELECT id FROM utilisateurs WHERE telephone = $1', [telephone]);
    if (telCheck.rows.length > 0)
      return res.status(409).json({ message: 'Ce numéro de téléphone est déjà utilisé' });
  }

  try {
    const existing = await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [email]);
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

      const peResult = await dbClient.query(
        `INSERT INTO profil_entreprise (client_id, nom, email, telephone, adresse)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (client_id) DO NOTHING
         RETURNING id`,
        [user.id, nom, email, telephone || null, adresse || null]
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
    // Détail réel écrit en base (libellés des composants + nom du domaine) pour le contrat
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

    // Auto-generate contract PDF, send via Docuseal (e-signature) + welcome email
    try {
      // Vocabulaire du compte créé (domaine du profil, en cache : aucune requête de plus)
      const voc = await vocabDuDomaine(domaineId);
      const aboConfig = config || {};
      const pdfBase64 = contractPdfBase64 || await generateContratPdf({
        nom,
        email,
        telephone: telephone || null,
        adresse: adresse || null,
        montantMensuel: montantOnboarding || null,
        nbActivites: aboConfig.nbActivites ?? 1,
        nbLabos: aboConfig.nbLabos ?? 0,
        nbGerants: aboConfig.nbGerants ?? 0,
        formuleActivites: (aboConfig.nbActivites ?? 1) >= 1 ? formuleActivites : null,
        nbAcheteurs: nbAcheteursEff,
        dateContrat: new Date(),
      }, voc);

      // Contrat e-signature : PDF rempli par client (prioritaire) ou template Docuseal.
      if (docusealPdfConfigured() || docusealConfigured()) {
        // + composants (libellés du domaine) et nom du domaine pour le document (lot 1a)
        const aboConfigForDocuseal = {
          ...(config || {}),
          composants: cfgComplete?.composants || [],
          domaineNom: cfgComplete?.domaine_nom || null,
          domaineSlug: cfgComplete?.domaine_slug || null,
        };
        const pricing = await computeEffectivePricing(user.id).catch(() => null);
        submitContratForSignature({
          aboId,
          pricing,
          nom,
          email,
          telephone: telephone || null,
          adresse: adresse || null,
          config: aboConfigForDocuseal,
          montantOnboarding,
          voc,
        })
          .then(({ submissionId, signingUrl }) => {
            console.log(`[docuseal] Contrat soumis: ${submissionId} pour ${email}`);
            if (submissionId) {
              pool.query('UPDATE abonnements SET contrat_submission_id = $1 WHERE client_id = $2', [String(submissionId), user.id])
                .catch((e) => console.error('[docuseal] Stockage contrat_submission_id échoué:', e.message));
            }
            if (signingUrl) {
              sendDocusealSigningEmail({ to: email, nom, signingUrl, voc })
                .then(() => console.log(`[docuseal] Email de signature envoyé à ${email}`))
                .catch((err) => console.error('[docuseal] Erreur envoi email signature:', err.message));
            }
          })
          .catch((err) => console.error('[docuseal] Erreur création contrat:', err.message));
        // Mail d'activation DIFFÉRÉ : envoyé par le webhook Docuseal une fois le contrat signé.
      } else {
        // Fallback (Docuseal non configuré) : on envoie l'activation immédiatement avec le PDF en pièce jointe
        await sendWelcomeWithContractEmail({ to: email, nom, token: inviteToken, contractPdfBase64: pdfBase64 });
        await pool.query(`UPDATE abonnements SET invite_sent = TRUE WHERE client_id = $1`, [user.id]).catch(() => {});
      }
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
      return res.status(409).json({ message: 'Cet email est déjà utilisé' });
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
    const deletedClient = check.rows[0];

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

    // Le client est supprimé. On lui envoie son acte de résiliation Docuseal pour
    // archive/formalité (best-effort, n'impacte pas la suppression déjà effectuée).
    if (deletedClient.email && (docusealPdfConfigured() || docusealConfigured('resiliation'))) {
      submitResiliationForSignature(deletedClient)
        .then(({ signingUrl }) => signingUrl
          // Vocabulaire par défaut, voulu (spec §5.6) : le compte est supprimé AVANT l'envoi,
          // et la variante résiliation n'écrit aucun terme.
          ? sendDocusealSigningEmail({ to: deletedClient.email, nom: deletedClient.nom || 'Client', signingUrl, type: 'resiliation', voc: vocabDefaut })
          : null)
        .then(() => console.log(`[resiliation] acte envoyé à ${deletedClient.email}`))
        .catch((e) => console.error('[resiliation] envoi échoué:', e.message));
    }

    res.status(204).send();
  } catch (err) {
    await dbClient.query('ROLLBACK');
    console.error('Client delete error:', err);
    res.status(500).json({ message: 'Erreur lors de la suppression du client' });
  } finally {
    dbClient.release();
  }
};

module.exports = { list, getById, updateIdentite, create, update, remove, buildContractPricingFields };
