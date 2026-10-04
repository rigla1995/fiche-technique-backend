const pool = require('../config/database');
const { sendSupplementValideEmail } = require('../services/emailService');
const { vocabForClient } = require('../utils/vocabCompte');
const { pushTo, pushToAdmins } = require('../services/sseService');
const { saveNotification, saveNotificationToAdmins } = require('./notificationController');
const { computeBaseMensuelFromConfig, computeBaseLaboFromConfig, computeBaseGerantFromConfig, computeBaseAcheteursFromConfig, computeMensuelTotalFromConfig, palierAcheteurs, loadTarifs, tarifsFor, recalcPaiementsEnAttente } = require('./abonnementController');
// Lot 1a : la capacité s'applique PAR COMPOSANT (applyComposants = seul écrivain des compteurs)
const { applyComposants, invaliderProfilApresCommit, composantsDepuisCompteurs, validerComposition, erreursIntroduites } = require('../services/configComposantsService');
const { getProfil } = require('../services/domaineProfilService');

// Ajouts d'une demande de capacité → composants du domaine (1er composant actif de
// chaque type, comme le backfill) en mode 'add' (la cible acheteurs REMPLACE le quota).
// Renvoie { aboId, result } ou null si le compte n'a pas de config.
const appliquerSupplement = async (db, clientId, { addActivites = 0, addLabos = 0, addGerants = 0, setAcheteurs = null }) => {
  const aboRes = await db.query(
    `SELECT a.id, ac.domaine_id FROM abonnements a
       JOIN abonnement_config ac ON ac.abonnement_id = a.id
      WHERE a.client_id = $1 ORDER BY a.id DESC LIMIT 1`,
    [clientId]
  );
  if (!aboRes.rows.length) return null;
  const { id: aboId, domaine_id: domaineId } = aboRes.rows[0];
  const composants = await composantsDepuisCompteurs(domaineId, {
    nbActivites: addActivites || 0, nbLabos: addLabos || 0, nbGerants: addGerants || 0,
    nbAcheteurs: setAcheteurs || 0,
  }, db);
  const result = await applyComposants(db, aboId, { composants, mode: 'add' });
  return { aboId, result };
};
const mapDemande = (row) => ({
  id: row.id,
  clientId: row.client_id,
  clientNom: row.client_nom || row.nom || null,
  clientEmail: row.client_email || row.email || null,
  type: row.type,
  statut: row.statut,
  // supplement
  nbActivitesSupp: row.nb_activites_supp,
  nbLabosSupp: row.nb_labos_supp,
  nbGerantsSupp: row.nb_gerants_supp,
  // Option Acheteurs : QUOTA TOTAL cible (borne de palier), pas un incrément
  nbAcheteursCible: row.nb_acheteurs_cible || null,
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
      `SELECT sd.*,
              cb.nom AS created_by_nom_joined,
              cu.email AS client_email
       FROM support_demandes sd
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
  // Lot 3, étape 4 : plus d'avenant signé par le titulaire — un ajout de capacité (facturé) n'est demandé que par
  // le titulaire du compte, jamais par un gérant (l'écran ne le lui propose pas).
  if (type === 'supplement' && req.user.role === 'gerant') {
    return res.status(403).json({ message: "Seul le titulaire du compte peut demander un ajout de capacité" });
  }

  try {
    const userRes = await pool.query('SELECT nom FROM utilisateurs WHERE id = $1', [createdById]);
    const createdByNom = userRes.rows[0]?.nom || null;
    const clientRes = clientId !== createdById
      ? await pool.query('SELECT nom FROM utilisateurs WHERE id = $1', [clientId])
      : { rows: [{ nom: createdByNom }] };
    const clientNom = clientRes.rows[0]?.nom || null;

    let params;
    let sql;

    if (type === 'supplement') {
      const { nbActivitesSupp, nbLabosSupp, nbGerantsSupp } = req.body;
      // Option Acheteurs : quota TOTAL cible (palier 10/20/50/100) — pas un incrément
      const nbAcheteursCible = req.body.nbAcheteursCible != null ? parseInt(req.body.nbAcheteursCible, 10) : null;
      const total = (nbActivitesSupp || 0) + (nbLabosSupp || 0) + (nbGerantsSupp || 0) + (nbAcheteursCible ? 1 : 0);
      if (total === 0) return res.status(400).json({ message: 'Indiquez au moins un supplément' });
      if (nbAcheteursCible != null) {
        if (![10, 20, 50, 100].includes(nbAcheteursCible)) {
          return res.status(400).json({ message: 'Palier [[court:acheteur:pl]] invalide (10, 20, 50 ou 100)' });
        }
        const cfgRes = await pool.query(
          `SELECT ac.nb_acheteurs, ac.nb_labos FROM abonnement_config ac
           JOIN abonnements a ON a.id = ac.abonnement_id WHERE a.client_id = $1`,
          [clientId]
        );
        const curAcheteurs = parseInt(cfgRes.rows[0]?.nb_acheteurs) || 0;
        const curLabos = parseInt(cfgRes.rows[0]?.nb_labos) || 0;
        // Comparaison au PALIER courant, pas au quota brut : un quota de 4 est
        // déjà couvert par le palier 10 — redemander « jusqu'à 10 » serait un no-op.
        const palierActuel = palierAcheteurs(curAcheteurs) ?? 0;
        if (nbAcheteursCible <= palierActuel) {
          return res.status(400).json({ message: `Le palier demandé doit être supérieur au palier actuel (jusqu'à ${palierActuel} [[nom:acheteur:pl]])` });
        }
        if (curLabos + (nbLabosSupp || 0) < 1) {
          return res.status(400).json({ message: "L'option [[Court:acheteur:pl]] nécessite au moins [[un:labo]] (ajoutez-en [[acc:labo:un:une]] à la demande)" });
        }
      }
      // Composition RÉSULTANTE validée avec les règles du domaine du compte (lot 1a)
      {
        const curRes = await pool.query(
          `SELECT ac.* FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id
            WHERE a.client_id = $1 ORDER BY a.id DESC LIMIT 1`,
          [clientId]
        );
        const cur = curRes.rows[0];
        if (cur) {
          const profil = cur.domaine_id ? await getProfil(cur.domaine_id) : null;
          // Seules les erreurs INTRODUITES par la demande bloquent : un compte existant
          // déjà « hors règles » (état hérité) peut toujours demander un supplément
          const erreurs = erreursIntroduites(
            validerComposition({ compteurs: cur, regles: profil?.regles }),
            validerComposition({
              compteurs: {
                nb_activites: (parseInt(cur.nb_activites, 10) || 0) + (nbActivitesSupp || 0),
                nb_labos: (parseInt(cur.nb_labos, 10) || 0) + (nbLabosSupp || 0),
                nb_gerants: (parseInt(cur.nb_gerants, 10) || 0) + (nbGerantsSupp || 0),
                nb_acheteurs: nbAcheteursCible != null ? nbAcheteursCible : (parseInt(cur.nb_acheteurs, 10) || 0),
              },
              regles: profil?.regles,
            })
          );
          if (erreurs.length) return res.status(400).json({ message: erreurs[0].message, code: erreurs[0].code, erreurs });
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
    // Lot 3, étape 4 : plus d'avenant à signer (LabFlow est sans engagement, décision du client du 04/10/2026).
    // La demande attend la validation de l'équipe LabFlow, qui applique la capacité (traiter).

    const notifPayload = { eventType: 'new_demande', demandeId: demande.id, type: demande.type, clientNom: clientNom || 'Client' };
    // Don't notify admins for auto-validated aide requests
    if (type !== 'aide') {
      pushToAdmins('new_demande', notifPayload);
      saveNotificationToAdmins(notifPayload).catch(console.error);
    }
    res.status(201).json(demande);
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
              admin.nom AS traite_par_nom,
              cb.nom AS created_by_nom_joined
       FROM support_demandes sd
       LEFT JOIN utilisateurs u       ON u.id = sd.client_id
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

// Admin : traite (valide / refuse) une demande. Lot 3, étape 4 (plus d'avenant) : UNE transaction pose le statut —
// seulement si la demande est encore « en_attente » (une 2e validation ou un double clic répond 409 sans rien
// appliquer) — et, pour un supplément validé, applique la capacité par composant, active l'option Acheteurs et
// recalcule les paiements en attente. Notifications et email de confirmation APRÈS le COMMIT (best effort).
const traiter = async (req, res) => {
  const { id } = req.params;
  const { statut, notesAdmin } = req.body;

  if (!['validée', 'refusée'].includes(statut)) return res.status(400).json({ message: 'Statut invalide' });
  if (!/^\d{1,9}$/.test(String(id))) return res.status(404).json({ message: 'Demande introuvable' });

  const db = await pool.connect();
  let demande;
  let ligne;
  let resultatComposants = null;
  let acheteursAvant = null;
  try {
    await db.query('BEGIN');
    const up = await db.query(
      `UPDATE support_demandes
       SET statut = $1, notes_admin = $2, traite_par = $3, traite_le = NOW()
       WHERE id = $4 AND statut = 'en_attente' RETURNING *`,
      [statut, notesAdmin || null, req.user.id, id]
    );
    if (up.rows.length === 0) {
      await db.query('ROLLBACK');
      const existe = await pool.query('SELECT statut FROM support_demandes WHERE id = $1', [id]);
      if (existe.rows.length === 0) return res.status(404).json({ message: 'Demande introuvable' });
      return res.status(409).json({ message: `Cette demande a déjà été traitée (${existe.rows[0].statut})` });
    }
    ligne = up.rows[0];
    const info = await db.query('SELECT email AS client_email, nom AS client_nom_u FROM utilisateurs WHERE id = $1', [ligne.client_id]);
    demande = { ...ligne, ...(info.rows[0] || {}) };

    if (statut === 'validée' && demande.type === 'supplement') {
      // Configuration DU MOMENT, verrouillée : la demande a pu être faite il y a longtemps (autre demande validée
      // depuis, quota relevé par l'admin, labo retiré). On recontrôle ce que la création avait contrôlé.
      const curRes = await db.query(
        `SELECT ac.* FROM abonnement_config ac
           JOIN abonnements a ON a.id = ac.abonnement_id
          WHERE a.client_id = $1 ORDER BY a.id DESC LIMIT 1 FOR UPDATE OF ac`,
        [demande.client_id]
      );
      const cur = curRes.rows[0];
      if (!cur) {
        await db.query('ROLLBACK');
        return res.status(409).json({ message: "Ce compte n'a pas de configuration d'abonnement : la capacité ne peut pas être ajoutée" });
      }
      // Quota acheteurs AVANT application (la cible REMPLACE le quota) : sert à l'« ancien mensuel » de l'email.
      acheteursAvant = parseInt(cur.nb_acheteurs) || 0;
      if (demande.nb_acheteurs_cible && demande.nb_acheteurs_cible <= (palierAcheteurs(acheteursAvant) ?? 0)) {
        await db.query('ROLLBACK');
        return res.status(409).json({ message: `Le compte a déjà un palier égal ou supérieur (jusqu'à ${palierAcheteurs(acheteursAvant)}) : refusez cette demande` });
      }
      const profil = cur.domaine_id ? await getProfil(cur.domaine_id) : null;
      const erreursCompo = erreursIntroduites(
        validerComposition({ compteurs: cur, regles: profil?.regles }),
        validerComposition({
          compteurs: {
            nb_activites: (parseInt(cur.nb_activites, 10) || 0) + (demande.nb_activites_supp || 0),
            nb_labos: (parseInt(cur.nb_labos, 10) || 0) + (demande.nb_labos_supp || 0),
            nb_gerants: (parseInt(cur.nb_gerants, 10) || 0) + (demande.nb_gerants_supp || 0),
            nb_acheteurs: demande.nb_acheteurs_cible || acheteursAvant,
          },
          regles: profil?.regles,
        })
      );
      if (erreursCompo.length) {
        await db.query('ROLLBACK');
        return res.status(409).json({ message: erreursCompo[0].message, code: erreursCompo[0].code, erreurs: erreursCompo });
      }
      // Capacité appliquée PAR COMPOSANT (1er composant de chaque type ; la cible acheteurs REMPLACE le quota ;
      // formule premium par défaut si 1ère activité), puis paiements en attente recalculés : même transaction.
      const applied = await appliquerSupplement(db, demande.client_id, {
        addActivites: demande.nb_activites_supp || 0,
        addLabos: demande.nb_labos_supp || 0,
        addGerants: demande.nb_gerants_supp || 0,
        setAcheteurs: demande.nb_acheteurs_cible || null,
      });
      resultatComposants = applied?.result ?? null;
      if (applied?.aboId) await recalcPaiementsEnAttente(db, applied.aboId);
      // Passage/activation de l'option Acheteurs : le module doit être actif côté profil
      if (demande.nb_acheteurs_cible) {
        await db.query(
          `UPDATE profil_entreprise
           SET module_acheteurs_actif = true,
               module_acheteurs_activated_at = COALESCE(module_acheteurs_activated_at, NOW())
           WHERE client_id = $1`,
          [demande.client_id]
        );
      }
    }
    await db.query('COMMIT');
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error('[support.traiter]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    db.release();
  }
  invaliderProfilApresCommit(resultatComposants); // composant identité créé à la volée (spec §5.4)

  const traiteePayload = {
    eventType: 'demande_traitee',
    demandeId: Number(id),
    type: demande.type,
    statut,
    notesAdmin: notesAdmin || null,
  };
  pushTo(demande.client_id, 'demande_traitee', traiteePayload);
  saveNotification(demande.client_id, traiteePayload).catch(console.error);

  // Email de confirmation d'un supplément validé (sans PDF ni avenant), best effort.
  if (statut === 'validée' && demande.type === 'supplement' && demande.client_email) {
    const clientNom = demande.client_nom || demande.client_nom_u || 'Client';
    (async () => {
      try {
        const configRes = await pool.query(
          `SELECT ac.* FROM abonnement_config ac
           JOIN abonnements a ON a.id = ac.abonnement_id
           WHERE a.client_id = $1 ORDER BY a.id DESC LIMIT 1`,
          [demande.client_id]
        );
        const cfg = configRes.rows[0];
        if (!cfg) return;
        // Grille du domaine du compte (tarifs_domaine vide ⇒ grille générale)
        const tarifs = tarifsFor(await loadTarifs(), cfg.domaine_id);
        const nbARaw = parseInt(cfg.nb_activites);
        const nbA = Number.isFinite(nbARaw) && nbARaw >= 0 ? nbARaw : 1;
        const nbL = parseInt(cfg.nb_labos) || 0;
        const nbG = parseInt(cfg.nb_gerants) || 0;
        const cfgBefore = {
          ...cfg,
          nb_activites: nbA - (demande.nb_activites_supp || 0),
          nb_labos:     nbL - (demande.nb_labos_supp     || 0),
          nb_gerants:   nbG - (demande.nb_gerants_supp   || 0),
          nb_acheteurs: acheteursAvant != null ? acheteursAvant : (parseInt(cfg.nb_acheteurs) || 0),
        };
        // Traitée par un admin : vocabulaire du compte DESTINATAIRE (I6)
        const voc = await vocabForClient(demande.client_id);
        await sendSupplementValideEmail({
          to: demande.client_email,
          nom: clientNom,
          notesAdmin: notesAdmin || null,
          nbActivitesAdded: demande.nb_activites_supp || 0,
          nbLabosAdded:     demande.nb_labos_supp     || 0,
          nbGerantsAdded:   demande.nb_gerants_supp   || 0,
          acheteursCible:   demande.nb_acheteurs_cible || null,
          nbActivites: nbA,
          nbLabos: nbL,
          nbGerants: nbG,
          nbAcheteurs: parseInt(cfg.nb_acheteurs) || 0,
          activiteCost: computeBaseMensuelFromConfig(cfg, tarifs) || 0,
          laboCost:     computeBaseLaboFromConfig(cfg, tarifs)    || 0,
          gerantCost:   computeBaseGerantFromConfig(cfg, tarifs)  || 0,
          acheteursCost: computeBaseAcheteursFromConfig(cfg, tarifs) || 0,
          ancienMensuel: computeMensuelTotalFromConfig(cfgBefore, tarifs) || 0,
          newMensuel:    computeMensuelTotalFromConfig(cfg, tarifs) || 0,
          dateValidation: new Date().toISOString(),
          voc,
        });
      } catch (e) {
        console.error('[support.traiter] email de confirmation :', e.message);
      }
    })();
  }

  res.json(mapDemande(ligne));
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

module.exports = { listMine, create, listAll, traiter, deleteMine };
