const pool = require('../config/database');
const { sendAvenantEmail } = require('../services/emailService');
const { generateAvenantPdf } = require('../services/pdfService');
const { pushTo, pushToAdmins } = require('../services/sseService');
const { saveNotification, saveNotificationToAdmins } = require('./notificationController');
const { computeBaseMensuelFromConfig, computeBaseLaboFromConfig, computeBaseGerantFromConfig, computeBaseAcheteursFromConfig, computeAvenantPricing } = require('./abonnementController');
const {
  createSubmission, createSubmissionFromPdf, getSubmissionDocuments,
  isConfigured: docusealConfigured, isConfiguredPdf: docusealPdfConfigured,
} = require('../services/docusealService');
const { buildAvenantDocument, avenantExtraFields } = require('../services/contractPdfService');
const { sendDocusealSigningEmail } = require('../services/emailService');

const fmtDtS = (n) => (n != null ? `${Math.round(Number(n))} DT` : '—');

// Soumission Docuseal de l'avenant : flux « PDF rempli » (document généré pour le
// client, prestataire pré-signé) avec REPLI sur le flux template historique si la
// génération ou l'API échoue. Retourne { submissionId, signingUrl }.
const submitAvenantForSignature = async ({ demandeId, info, pricing, ajouts }) => {
  const clientName = info.nom || 'Client';
  if (docusealPdfConfigured() && pricing) {
    try {
      const docu = await buildAvenantDocument({
        demandeId,
        client: { nom: clientName, email: info.email, telephone: info.telephone, adresse: info.adresse },
        pricing,
        ajouts,
        abonnementId: info.abo_id,
        abonnementDate: info.abo_created_at,
      });
      return await createSubmissionFromPdf({
        pdfBase64: docu.base64,
        documentName: docu.documentName,
        clientName,
        clientEmail: info.email,
      });
    } catch (e) {
      console.error('[avenant] flux PDF rempli échoué, repli sur le template:', e.message);
    }
  }
  return createSubmission({
    type: 'avenant',
    clientName,
    clientEmail: info.email,
    nbActivites: pricing?.nbActivites,
    nbLabos: pricing?.nbLabos,
    nbGerants: pricing?.nbGerants,
    montantMensuel: pricing?.effMensuel,
    extraFields: avenantExtraFields({ ajouts, abonnementId: info.abo_id, abonnementDate: info.abo_created_at, pricing }),
  });
};

const mapDemande = (row) => ({
  id: row.id,
  clientId: row.client_id,
  clientNom: row.client_nom || row.nom || null,
  clientEmail: row.client_email || row.email || null,
  type: row.type,
  statut: row.statut,
  // ingredient_manquant
  domaineId: row.domaine_id,
  domaineNom: row.domaine_nom || null,
  categorieNom: row.categorie_nom,
  uniteNom: row.unite_nom,
  nomIngredient: row.nom_ingredient,
  // supplement
  nbActivitesSupp: row.nb_activites_supp,
  nbLabosSupp: row.nb_labos_supp,
  nbGerantsSupp: row.nb_gerants_supp,
  // Option Acheteurs : QUOTA TOTAL cible (borne de palier), pas un incrément
  nbAcheteursCible: row.nb_acheteurs_cible || null,
  docusealSubmissionId: row.docuseal_submission_id || null,
  // aide
  description: row.description,
  // admin
  notesAdmin: row.notes_admin,
  traitePar: row.traite_par,
  traiteParNom: row.traite_par_nom || null,
  traiteLe: row.traite_le,
  createdAt: row.created_at,
  // creator (gérant or client)
  createdBy: row.created_by || row.client_id,
  createdByNom: row.created_by_nom || row.client_nom || null,
});

// Client: list my support requests (includes requests created by gérants)
const listMine = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  try {
    const result = await pool.query(
      `SELECT sd.*, da.nom AS domaine_nom,
              cb.nom AS created_by_nom_joined,
              cu.email AS client_email
       FROM support_demandes sd
       LEFT JOIN domaines_activite da ON da.id = sd.domaine_id
       LEFT JOIN utilisateurs cb ON cb.id = sd.created_by
       LEFT JOIN utilisateurs cu ON cu.id = sd.client_id
       WHERE sd.client_id = $1
       ORDER BY sd.created_at DESC`,
      [clientId]
    );
    res.json(result.rows.map((row) => mapDemande({ ...row, created_by_nom: row.created_by_nom || row.created_by_nom_joined })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Client: create a support request
const create = async (req, res) => {
  const createdById = req.user.id;
  // Gérant requests are owned by their parent enterprise client
  const clientId = req.user.gerant_parent_id || req.user.id;
  const { type } = req.body;
  const validTypes = ['supplement', 'aide'];
  if (!validTypes.includes(type)) return res.status(400).json({ message: 'Type invalide' });

  try {
    const userRes = await pool.query('SELECT nom FROM utilisateurs WHERE id = $1', [createdById]);
    const createdByNom = userRes.rows[0]?.nom || null;
    const clientRes = clientId !== createdById
      ? await pool.query('SELECT nom FROM utilisateurs WHERE id = $1', [clientId])
      : { rows: [{ nom: createdByNom }] };
    const clientNom = clientRes.rows[0]?.nom || null;

    let params;
    let sql;

    if (type === 'ingredient_manquant') {
      const { domaineId, categorieNom, uniteNom, nomIngredient } = req.body;
      if (!nomIngredient) return res.status(400).json({ message: 'Nom de l\'ingrédient requis' });
      sql = `INSERT INTO support_demandes
             (client_id, client_nom, type, domaine_id, categorie_nom, unite_nom, nom_ingredient, created_by, created_by_nom)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`;
      params = [clientId, clientNom, type, domaineId || null, categorieNom || null, uniteNom || null, nomIngredient, createdById, createdByNom];
    } else if (type === 'supplement') {
      const { nbActivitesSupp, nbLabosSupp, nbGerantsSupp } = req.body;
      // Option Acheteurs : quota TOTAL cible (palier 10/20/50/100) — pas un incrément
      const nbAcheteursCible = req.body.nbAcheteursCible != null ? parseInt(req.body.nbAcheteursCible, 10) : null;
      const total = (nbActivitesSupp || 0) + (nbLabosSupp || 0) + (nbGerantsSupp || 0) + (nbAcheteursCible ? 1 : 0);
      if (total === 0) return res.status(400).json({ message: 'Indiquez au moins un supplément' });
      if (nbAcheteursCible != null) {
        if (![10, 20, 50, 100].includes(nbAcheteursCible)) {
          return res.status(400).json({ message: 'Palier acheteurs invalide (10, 20, 50 ou 100)' });
        }
        const cfgRes = await pool.query(
          `SELECT ac.nb_acheteurs, ac.nb_labos FROM abonnement_config ac
           JOIN abonnements a ON a.id = ac.abonnement_id WHERE a.client_id = $1`,
          [clientId]
        );
        const curAcheteurs = parseInt(cfgRes.rows[0]?.nb_acheteurs) || 0;
        const curLabos = parseInt(cfgRes.rows[0]?.nb_labos) || 0;
        if (nbAcheteursCible <= curAcheteurs) {
          return res.status(400).json({ message: `Le palier demandé doit être supérieur au quota actuel (${curAcheteurs} acheteurs)` });
        }
        if (curLabos + (nbLabosSupp || 0) < 1) {
          return res.status(400).json({ message: "L'option Acheteurs nécessite au moins un labo (ajoutez-en un à la demande)" });
        }
      }
      sql = `INSERT INTO support_demandes
             (client_id, client_nom, type, nb_activites_supp, nb_labos_supp, nb_gerants_supp, nb_acheteurs_cible, created_by, created_by_nom)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`;
      params = [clientId, clientNom, type, nbActivitesSupp || 0, nbLabosSupp || 0, nbGerantsSupp || 0, nbAcheteursCible, createdById, createdByNom];
    } else {
      const { description } = req.body;
      if (!description?.trim()) return res.status(400).json({ message: 'Description requise' });
      // aide requests are auto-validated on creation
      sql = `INSERT INTO support_demandes (client_id, client_nom, type, description, statut, created_by, created_by_nom)
             VALUES ($1,$2,$3,$4,'validée',$5,$6) RETURNING *`;
      params = [clientId, clientNom, type, description.trim(), createdById, createdByNom];
    }

    const result = await pool.query(sql, params);
    const demande = mapDemande(result.rows[0]);

    // Nouveau flux : une demande de capacité déclenche un avenant Docuseal à signer.
    // À la signature (webhook), la capacité est appliquée et la demande validée automatiquement.
    let signingUrl = null;
    if (type === 'supplement' && (docusealPdfConfigured() || docusealConfigured('avenant'))) {
      try {
        const infoRes = await pool.query(
          `SELECT u.nom, u.email, u.telephone, pe.adresse,
                  a.id AS abo_id, a.created_at AS abo_created_at
             FROM utilisateurs u
             LEFT JOIN profil_entreprise pe ON pe.client_id = u.id
             LEFT JOIN abonnements a ON a.client_id = u.id
            WHERE u.id = $1
            ORDER BY a.id DESC
            LIMIT 1`,
          [clientId]
        );
        const info = infoRes.rows[0] || {};
        const clientEmail = info.email || null;
        const clientNomFull = info.nom || clientNom || 'Client';
        if (clientEmail) {
          const ajouts = {
            addActivites: req.body.nbActivitesSupp || 0,
            addLabos: req.body.nbLabosSupp || 0,
            addGerants: req.body.nbGerantsSupp || 0,
            setAcheteurs: demande.nbAcheteursCible || null,
          };
          const pricing = await computeAvenantPricing(clientId, ajouts);
          const sub = await submitAvenantForSignature({ demandeId: demande.id, info, pricing, ajouts });
          if (sub?.submissionId) {
            await pool.query('UPDATE support_demandes SET docuseal_submission_id = $1 WHERE id = $2',
              [String(sub.submissionId), demande.id]);
          }
          if (sub?.signingUrl) {
            signingUrl = sub.signingUrl;
            sendDocusealSigningEmail({
              to: clientEmail,
              nom: clientNomFull,
              signingUrl: sub.signingUrl,
              avenant: {
                addActivites: req.body.nbActivitesSupp || 0,
                addLabos: req.body.nbLabosSupp || 0,
                addGerants: req.body.nbGerantsSupp || 0,
                setAcheteurs: demande.nbAcheteursCible || null,
              },
            })
              .catch((e) => console.error('[avenant] envoi email signature:', e.message));
          }
        }
      } catch (e) {
        console.error('[avenant] création soumission Docuseal:', e.message);
      }
    }

    const notifPayload = { eventType: 'new_demande', demandeId: demande.id, type: demande.type, clientNom: clientNom || 'Client' };
    // Don't notify admins for auto-validated aide requests
    if (type !== 'aide') {
      pushToAdmins('new_demande', notifPayload);
      saveNotificationToAdmins(notifPayload).catch(console.error);
    }
    // On n'expose PAS le lien de signature au front : le client signe l'avenant via l'email reçu.
    res.status(201).json({ ...demande, avenantEmailSent: !!signingUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Admin: list all support requests
const listAll = async (req, res) => {
  const { statut, type } = req.query;
  try {
    const conditions = ['1=1'];
    const params = [];
    let i = 1;
    if (statut) { conditions.push(`sd.statut = $${i++}`); params.push(statut); }
    if (type)   { conditions.push(`sd.type = $${i++}`);   params.push(type); }

    const result = await pool.query(
      `SELECT sd.*,
              u.nom AS client_nom, u.email AS client_email,
              da.nom AS domaine_nom,
              admin.nom AS traite_par_nom,
              cb.nom AS created_by_nom_joined
       FROM support_demandes sd
       LEFT JOIN utilisateurs u       ON u.id = sd.client_id
       LEFT JOIN domaines_activite da ON da.id = sd.domaine_id
       LEFT JOIN utilisateurs admin   ON admin.id = sd.traite_par
       LEFT JOIN utilisateurs cb      ON cb.id = sd.created_by
       WHERE ${conditions.join(' AND ')}
       ORDER BY
         CASE sd.statut WHEN 'en_attente' THEN 0 WHEN 'validée' THEN 1 ELSE 2 END,
         sd.created_at DESC`,
      params
    );
    res.json(result.rows.map((row) => mapDemande({ ...row, created_by_nom: row.created_by_nom || row.created_by_nom_joined })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Admin: process (validate/refuse) a support request
const traiter = async (req, res) => {
  const { id } = req.params;
  const { statut, notesAdmin } = req.body;

  if (!['validée', 'refusée'].includes(statut)) return res.status(400).json({ message: 'Statut invalide' });

  try {
    const demandeRes = await pool.query(
      `SELECT sd.*, u.email AS client_email, u.nom AS client_nom_u
       FROM support_demandes sd
       LEFT JOIN utilisateurs u ON u.id = sd.client_id
       WHERE sd.id = $1`,
      [id]
    );
    if (demandeRes.rows.length === 0) return res.status(404).json({ message: 'Demande introuvable' });
    const demande = demandeRes.rows[0];

    // Une demande de capacité avec avenant Docuseal en attente est validée automatiquement
    // à la signature du client — l'admin ne peut pas la valider manuellement (mais peut la refuser).
    if (statut === 'validée' && demande.type === 'supplement' && demande.docuseal_submission_id && demande.statut === 'en_attente') {
      return res.status(409).json({ message: "Cette demande sera validée automatiquement dès que le client aura signé l'avenant." });
    }

    const result = await pool.query(
      `UPDATE support_demandes
       SET statut = $1, notes_admin = $2, traite_par = $3, traite_le = NOW()
       WHERE id = $4 RETURNING *`,
      [statut, notesAdmin || null, req.user.id, id]
    );

    const traiteePayload = {
      eventType: 'demande_traitee',
      demandeId: Number(id),
      type: demande.type,
      statut,
      notesAdmin: notesAdmin || null,
    };
    pushTo(demande.client_id, 'demande_traitee', traiteePayload);
    saveNotification(demande.client_id, traiteePayload).catch(console.error);

    // NOTE : plus aucun catalogue commun — chaque client gère son propre référentiel.
    // La validation d'une demande « ingrédient manquant » ne crée plus rien : l'admin
    // répond via notes_admin et le client crée l'article dans son référentiel.

    // Update abonnement_config when supplement request is validated.
    // Skip if an avenant Docuseal is pending (docuseal_submission_id) : la capacité
    // est alors appliquée automatiquement par le webhook à la signature (évite le double).
    let acheteursAvant = null;
    if (statut === 'validée' && demande.type === 'supplement' && !demande.docuseal_submission_id) {
      // Quota acheteurs AVANT application — nécessaire pour l'« ancien mensuel » de
      // l'email d'avenant (la cible REMPLACE le quota, l'avant n'est pas dérivable après coup).
      if (demande.nb_acheteurs_cible) {
        const avantRes = await pool.query(
          `SELECT ac.nb_acheteurs FROM abonnement_config ac
           JOIN abonnements a ON a.id = ac.abonnement_id WHERE a.client_id = $1`,
          [demande.client_id]
        );
        acheteursAvant = parseInt(avantRes.rows[0]?.nb_acheteurs) || 0;
      }
      await pool.query(
        `UPDATE abonnement_config ac
         SET nb_activites = nb_activites + $1,
             nb_labos     = nb_labos     + $2,
             nb_gerants   = nb_gerants   + $3,
             -- Option Acheteurs : quota TOTAL cible (palier), pas un incrément
             nb_acheteurs = COALESCE($5::int, nb_acheteurs),
             -- un compte dépôt qui gagne sa 1ère activité reçoit une formule (défaut premium)
             formule_activites = CASE WHEN nb_activites + $1 >= 1 THEN COALESCE(formule_activites, 'premium') ELSE formule_activites END,
             updated_at   = NOW()
         FROM abonnements a
         WHERE a.id = ac.abonnement_id AND a.client_id = $4`,
        [demande.nb_activites_supp || 0, demande.nb_labos_supp || 0, demande.nb_gerants_supp || 0, demande.client_id, demande.nb_acheteurs_cible || null]
      );
      // Passage/activation de l'option Acheteurs : le module doit être actif côté profil
      if (demande.nb_acheteurs_cible) {
        await pool.query(
          `UPDATE profil_entreprise
           SET module_acheteurs_actif = true,
               module_acheteurs_activated_at = COALESCE(module_acheteurs_activated_at, NOW())
           WHERE client_id = $1`,
          [demande.client_id]
        );
      }
    }

    // Send avenant email (PDF) only for the manual fallback (no Docuseal submission)
    if (statut === 'validée' && demande.type === 'supplement' && !demande.docuseal_submission_id) {
      const clientEmail = demande.client_email;
      const clientNom = demande.client_nom || demande.client_nom_u || 'Client';
      if (clientEmail) {
        (async () => {
          try {
            const tarifsRes = await pool.query('SELECT cle, valeur_dt FROM tarifs_config');
            const tarifs = {};
            tarifsRes.rows.forEach((r) => { tarifs[r.cle] = parseFloat(r.valeur_dt); });

            // Fetch config AFTER update
            const configRes = await pool.query(
              `SELECT ac.* FROM abonnement_config ac
               JOIN abonnements a ON a.id = ac.abonnement_id
               WHERE a.client_id = $1`,
              [demande.client_id]
            );
            const cfg = configRes.rows[0];
            if (!cfg) return;

            const nbARaw = parseInt(cfg.nb_activites);
            const nbA = Number.isFinite(nbARaw) && nbARaw >= 0 ? nbARaw : 1;
            const nbL = parseInt(cfg.nb_labos) || 0;
            const nbG = parseInt(cfg.nb_gerants) || 0;

            // Reconstruct config BEFORE supplement to compute ancien mensuel
            const cfgBefore = {
              ...cfg,
              nb_activites: nbA - (demande.nb_activites_supp || 0),
              nb_labos:     nbL - (demande.nb_labos_supp     || 0),
              nb_gerants:   nbG - (demande.nb_gerants_supp   || 0),
              // La cible acheteurs REMPLACE le quota : l'avant a été capturé avant l'UPDATE
              nb_acheteurs: acheteursAvant != null ? acheteursAvant : (parseInt(cfg.nb_acheteurs) || 0),
            };
            const ancienActivite = computeBaseMensuelFromConfig(cfgBefore, tarifs) || 0;
            const ancienLabo     = computeBaseLaboFromConfig(cfgBefore, tarifs)    || 0;
            const ancienGerant   = computeBaseGerantFromConfig(cfgBefore, tarifs)  || 0;
            const ancienMensuel  = ancienActivite + ancienLabo + ancienGerant + (computeBaseAcheteursFromConfig(cfgBefore, tarifs) || 0);

            const activiteCost = computeBaseMensuelFromConfig(cfg, tarifs) || 0;
            const laboCost     = computeBaseLaboFromConfig(cfg, tarifs)    || 0;
            const gerantCost   = computeBaseGerantFromConfig(cfg, tarifs)  || 0;
            const newMensuel   = activiteCost + laboCost + gerantCost + (computeBaseAcheteursFromConfig(cfg, tarifs) || 0);
            const dateAvenant  = new Date().toISOString();

            const pdfData = {
              nom: clientNom,
              notesAdmin: notesAdmin || null,
              nbActivitesAdded: demande.nb_activites_supp || 0,
              nbLabosAdded:     demande.nb_labos_supp     || 0,
              nbGerantsAdded:   demande.nb_gerants_supp   || 0,
              acheteursCible:   demande.nb_acheteurs_cible || null,
              nbActivites: nbA,
              nbLabos: nbL,
              nbGerants: nbG,
              activiteCost,
              laboCost,
              gerantCost,
              formuleActivites: cfg.formule_activites || null,
              nbAcheteurs: parseInt(cfg.nb_acheteurs) || 0,
              acheteursCost: computeBaseAcheteursFromConfig(cfg, tarifs) || 0,
              newMensuel,
              ancienMensuel,
              promoApplied: false,
              effectifMensuel: newMensuel,
              dateAvenant,
            };

            const pdfBase64 = await generateAvenantPdf(pdfData).catch((e) => {
              console.error('PDF generation error:', e);
              return null;
            });

            await sendAvenantEmail({ to: clientEmail, ...pdfData, pdfBase64 });
          } catch (e) {
            console.error('Avenant email error:', e);
          }
        })();
      }
    }

    res.json(mapDemande(result.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Admin: preview avenant PDF for a supplement request (no DB changes)
const previewAvenant = async (req, res) => {
  const { id } = req.params;
  try {
    const demandeRes = await pool.query(
      `SELECT sd.*, u.nom AS client_nom_u
       FROM support_demandes sd
       LEFT JOIN utilisateurs u ON u.id = sd.client_id
       WHERE sd.id = $1 AND sd.type = 'supplement'`,
      [id]
    );
    if (demandeRes.rows.length === 0) return res.status(404).json({ message: 'Demande introuvable' });
    const demande = demandeRes.rows[0];

    const tarifsRes = await pool.query('SELECT cle, valeur_dt FROM tarifs_config');
    const tarifs = {};
    tarifsRes.rows.forEach((r) => { tarifs[r.cle] = parseFloat(r.valeur_dt); });

    const configRes = await pool.query(
      `SELECT ac.* FROM abonnement_config ac
       JOIN abonnements a ON a.id = ac.abonnement_id
       WHERE a.client_id = $1`,
      [demande.client_id]
    );
    const cfg = configRes.rows[0];
    if (!cfg) return res.status(404).json({ message: 'Configuration abonnement introuvable' });

    // Simulate config after supplement is applied
    const cfgAfter = {
      ...cfg,
      nb_activites: ((v) => (Number.isFinite(v) && v >= 0 ? v : 1))(parseInt(cfg.nb_activites)) + (demande.nb_activites_supp || 0),
      nb_labos:     (parseInt(cfg.nb_labos)     || 0) + (demande.nb_labos_supp     || 0),
      nb_gerants:   (parseInt(cfg.nb_gerants)   || 0) + (demande.nb_gerants_supp   || 0),
      // Option Acheteurs : la cible remplace le quota
      nb_acheteurs: demande.nb_acheteurs_cible || (parseInt(cfg.nb_acheteurs) || 0),
    };

    const ancienActivite = computeBaseMensuelFromConfig(cfg, tarifs)     || 0;
    const ancienLabo     = computeBaseLaboFromConfig(cfg, tarifs)         || 0;
    const ancienGerant   = computeBaseGerantFromConfig(cfg, tarifs)       || 0;
    const ancienMensuel  = ancienActivite + ancienLabo + ancienGerant + (computeBaseAcheteursFromConfig(cfg, tarifs) || 0);

    const activiteCost = computeBaseMensuelFromConfig(cfgAfter, tarifs) || 0;
    const laboCost     = computeBaseLaboFromConfig(cfgAfter, tarifs)    || 0;
    const gerantCost   = computeBaseGerantFromConfig(cfgAfter, tarifs)  || 0;
    const newMensuel   = activiteCost + laboCost + gerantCost + (computeBaseAcheteursFromConfig(cfgAfter, tarifs) || 0);

    const clientNom = demande.client_nom || demande.client_nom_u || 'Client';
    const pdfData = {
      nom: clientNom,
      notesAdmin: null,
      nbActivitesAdded: demande.nb_activites_supp || 0,
      nbLabosAdded:     demande.nb_labos_supp     || 0,
      nbGerantsAdded:   demande.nb_gerants_supp   || 0,
      acheteursCible:   demande.nb_acheteurs_cible || null,
      nbActivites: cfgAfter.nb_activites,
      nbLabos:     cfgAfter.nb_labos,
      nbGerants:   cfgAfter.nb_gerants,
      activiteCost,
      laboCost,
      gerantCost,
      formuleActivites: cfg.formule_activites || null,
      nbAcheteurs: parseInt(cfgAfter.nb_acheteurs) || 0,
      acheteursCost: computeBaseAcheteursFromConfig(cfgAfter, tarifs) || 0,
      newMensuel,
      ancienMensuel,
      promoApplied: false,
      effectifMensuel: newMensuel,
      dateAvenant: new Date().toISOString(),
    };

    const pdfBase64 = await generateAvenantPdf(pdfData);
    res.json({ pdfBase64 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Client: delete a pending support request
const deleteMine = async (req, res) => {
  const { id } = req.params;
  const clientId = req.user.id;
  try {
    const result = await pool.query(
      `DELETE FROM support_demandes
       WHERE id = $1 AND client_id = $2 AND statut = 'en_attente'
       RETURNING id`,
      [id, clientId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Demande introuvable ou déjà traitée' });
    }
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Client: télécharge le contrat (avenant) signé — proxifié pour ne PAS exposer Docuseal au client
const getContratSigne = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  try {
    const { rows } = await pool.query(
      'SELECT docuseal_submission_id FROM support_demandes WHERE id = $1 AND client_id = $2',
      [req.params.id, clientId]
    );
    const dem = rows[0];
    if (!dem) return res.status(404).json({ message: 'Demande introuvable' });
    if (!dem.docuseal_submission_id) return res.status(404).json({ message: 'Aucun avenant associé à cette demande' });
    const docs = await getSubmissionDocuments(dem.docuseal_submission_id);
    if (!docs.length) return res.status(404).json({ message: "Le contrat signé n'est pas encore disponible" });
    // Récupère le PDF côté serveur et le renvoie en pièce jointe (le client ne voit jamais Docuseal)
    const fileRes = await fetch(docs[0].url);
    if (!fileRes.ok) return res.status(502).json({ message: 'Contrat momentanément indisponible' });
    const buf = Buffer.from(await fileRes.arrayBuffer());
    const base = String(docs[0].name || 'contrat-avenant').replace(/[^a-zA-Z0-9._-]/g, '_');
    const filename = base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', buf.length);
    return res.send(buf);
  } catch (err) {
    console.error('[contrat-signe]', err.message);
    res.status(500).json({ message: 'Erreur lors de la récupération du contrat signé' });
  }
};

module.exports = { listMine, create, listAll, traiter, deleteMine, previewAvenant, getContratSigne };
