const pool = require('../config/database');
const { sendAvenantEmail } = require('../services/emailService');
const { generateAvenantPdf } = require('../services/pdfService');
const { pushTo, pushToAdmins } = require('../services/sseService');
const { saveNotification, saveNotificationToAdmins } = require('./notificationController');
const { computeBaseMensuelFromConfig, computeBaseLaboFromConfig, computeBaseGerantFromConfig, computeAvenantPricing } = require('./abonnementController');
const { createSubmission, getSubmissionDocuments, isConfigured: docusealConfigured } = require('../services/docusealService');
const { sendDocusealSigningEmail } = require('../services/emailService');

const fmtDtS = (n) => (n != null ? `${Math.round(Number(n))} DT` : '—');

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
      const total = (nbActivitesSupp || 0) + (nbLabosSupp || 0) + (nbGerantsSupp || 0);
      if (total === 0) return res.status(400).json({ message: 'Indiquez au moins un supplément' });
      sql = `INSERT INTO support_demandes
             (client_id, client_nom, type, nb_activites_supp, nb_labos_supp, nb_gerants_supp, created_by, created_by_nom)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`;
      params = [clientId, clientNom, type, nbActivitesSupp || 0, nbLabosSupp || 0, nbGerantsSupp || 0, createdById, createdByNom];
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
    if (type === 'supplement' && docusealConfigured('avenant')) {
      try {
        const emailRes = await pool.query('SELECT nom, email FROM utilisateurs WHERE id = $1', [clientId]);
        const clientEmail = emailRes.rows[0]?.email || null;
        const clientNomFull = emailRes.rows[0]?.nom || clientNom || 'Client';
        if (clientEmail) {
          const pricing = await computeAvenantPricing(clientId, {
            addActivites: req.body.nbActivitesSupp || 0,
            addLabos: req.body.nbLabosSupp || 0,
            addGerants: req.body.nbGerantsSupp || 0,
          });
          const sub = await createSubmission({
            type: 'avenant',
            clientName: clientNomFull,
            clientEmail,
            nbActivites: pricing?.nbActivites,
            nbLabos: pricing?.nbLabos,
            nbGerants: pricing?.nbGerants,
            montantMensuel: pricing?.effMensuel,
          });
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
  // Admin-editable overrides for ingredient requests
  const { domaineId: adminDomaineId, domaineIds: adminDomaineIds, categorieNom: adminCategorieNom, uniteNom: adminUniteNom, nomIngredient: adminNomIngredient } = req.body;

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

    // Auto-create ingredient in global catalogue when ingredient request is validated
    if (statut === 'validée' && demande.type === 'ingredient_manquant' && (adminNomIngredient || demande.nom_ingredient)) {
      const finalDomaineIds = Array.isArray(adminDomaineIds) && adminDomaineIds.length > 0
        ? adminDomaineIds.map(Number).filter(Boolean)
        : adminDomaineId != null ? [Number(adminDomaineId)]
        : demande.domaine_id ? [Number(demande.domaine_id)]
        : [];
      const finalCategorieNom = adminCategorieNom != null ? adminCategorieNom : demande.categorie_nom;
      const finalUniteNom = adminUniteNom != null ? adminUniteNom : demande.unite_nom;
      const finalNomIngredient = adminNomIngredient != null ? adminNomIngredient.trim() : demande.nom_ingredient;

      // Resolve or create unit (global: client_id IS NULL)
      let uniteId = null;
      if (finalUniteNom) {
        const existingUnite = await pool.query(
          'SELECT id FROM unites WHERE nom = $1 AND client_id IS NULL LIMIT 1',
          [finalUniteNom]
        );
        if (existingUnite.rows.length > 0) {
          uniteId = existingUnite.rows[0].id;
        } else {
          const newUnite = await pool.query(
            'INSERT INTO unites (nom) VALUES ($1) RETURNING id',
            [finalUniteNom]
          );
          uniteId = newUnite.rows[0].id;
        }
      }

      // Resolve or create category
      let categorieId = null;
      if (finalCategorieNom) {
        const catRes = await pool.query(
          `INSERT INTO categories (nom) VALUES ($1)
           ON CONFLICT (nom) DO UPDATE SET nom = EXCLUDED.nom RETURNING id`,
          [finalCategorieNom]
        );
        categorieId = catRes.rows[0].id;
      }

      // Admin no longer creates global articles — each client manages their own referential
    }

    // Update abonnement_config when supplement request is validated.
    // Skip if an avenant Docuseal is pending (docuseal_submission_id) : la capacité
    // est alors appliquée automatiquement par le webhook à la signature (évite le double).
    if (statut === 'validée' && demande.type === 'supplement' && !demande.docuseal_submission_id) {
      await pool.query(
        `UPDATE abonnement_config ac
         SET nb_activites = nb_activites + $1,
             nb_labos     = nb_labos     + $2,
             nb_gerants   = nb_gerants   + $3,
             updated_at   = NOW()
         FROM abonnements a
         WHERE a.id = ac.abonnement_id AND a.client_id = $4`,
        [demande.nb_activites_supp || 0, demande.nb_labos_supp || 0, demande.nb_gerants_supp || 0, demande.client_id]
      );
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

            const nbA = parseInt(cfg.nb_activites) || 1;
            const nbL = parseInt(cfg.nb_labos) || 0;
            const nbG = parseInt(cfg.nb_gerants) || 0;

            // Reconstruct config BEFORE supplement to compute ancien mensuel
            const cfgBefore = {
              ...cfg,
              nb_activites: nbA - (demande.nb_activites_supp || 0),
              nb_labos:     nbL - (demande.nb_labos_supp     || 0),
              nb_gerants:   nbG - (demande.nb_gerants_supp   || 0),
            };
            const ancienActivite = computeBaseMensuelFromConfig(cfgBefore, tarifs) || 0;
            const ancienLabo     = computeBaseLaboFromConfig(cfgBefore, tarifs)    || 0;
            const ancienGerant   = computeBaseGerantFromConfig(cfgBefore, tarifs)  || 0;
            const ancienMensuel  = ancienActivite + ancienLabo + ancienGerant;

            const activiteCost = computeBaseMensuelFromConfig(cfg, tarifs) || 0;
            const laboCost     = computeBaseLaboFromConfig(cfg, tarifs)    || 0;
            const gerantCost   = computeBaseGerantFromConfig(cfg, tarifs)  || 0;
            const newMensuel   = activiteCost + laboCost + gerantCost;
            const dateAvenant  = new Date().toISOString();

            const pdfData = {
              nom: clientNom,
              notesAdmin: notesAdmin || null,
              nbActivitesAdded: demande.nb_activites_supp || 0,
              nbLabosAdded:     demande.nb_labos_supp     || 0,
              nbGerantsAdded:   demande.nb_gerants_supp   || 0,
              nbActivites: nbA,
              nbLabos: nbL,
              nbGerants: nbG,
              activiteCost,
              laboCost,
              gerantCost,
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
      nb_activites: (parseInt(cfg.nb_activites) || 1) + (demande.nb_activites_supp || 0),
      nb_labos:     (parseInt(cfg.nb_labos)     || 0) + (demande.nb_labos_supp     || 0),
      nb_gerants:   (parseInt(cfg.nb_gerants)   || 0) + (demande.nb_gerants_supp   || 0),
    };

    const ancienActivite = computeBaseMensuelFromConfig(cfg, tarifs)     || 0;
    const ancienLabo     = computeBaseLaboFromConfig(cfg, tarifs)         || 0;
    const ancienGerant   = computeBaseGerantFromConfig(cfg, tarifs)       || 0;
    const ancienMensuel  = ancienActivite + ancienLabo + ancienGerant;

    const activiteCost = computeBaseMensuelFromConfig(cfgAfter, tarifs) || 0;
    const laboCost     = computeBaseLaboFromConfig(cfgAfter, tarifs)    || 0;
    const gerantCost   = computeBaseGerantFromConfig(cfgAfter, tarifs)  || 0;
    const newMensuel   = activiteCost + laboCost + gerantCost;

    const clientNom = demande.client_nom || demande.client_nom_u || 'Client';
    const pdfData = {
      nom: clientNom,
      notesAdmin: null,
      nbActivitesAdded: demande.nb_activites_supp || 0,
      nbLabosAdded:     demande.nb_labos_supp     || 0,
      nbGerantsAdded:   demande.nb_gerants_supp   || 0,
      nbActivites: cfgAfter.nb_activites,
      nbLabos:     cfgAfter.nb_labos,
      nbGerants:   cfgAfter.nb_gerants,
      activiteCost,
      laboCost,
      gerantCost,
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

// Client: lien de téléchargement du contrat (avenant) signé d'une demande
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
    res.json({ url: docs[0].url, name: docs[0].name });
  } catch (err) {
    console.error('[contrat-signe]', err.message);
    res.status(500).json({ message: 'Erreur lors de la récupération du contrat signé' });
  }
};

module.exports = { listMine, create, listAll, traiter, deleteMine, previewAvenant, getContratSigne };
