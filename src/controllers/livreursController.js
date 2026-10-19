// Module « Livreurs », étape L1 (labflow-reprise/livreurs/PLAN-LIVREURS.md) : comptes livreurs du compte client.
// Gestion : le client propriétaire ou un gérant ayant l'accès à la base acheteurs (compte = gerant_parent_id || id).
// Espace livreur : GET /api/livreur/moi (le reste arrive aux étapes L2-L3).
// Modèle : gerantController (invitation par e-mail) + acheteurs (fiche à part, rôle dédié). Textes sans balise de
// vocabulaire pour « livreur » (clé absente du lexique) ; les clés existantes gardent leurs balises.
const bcrypt = require('bcryptjs');
const pool = require('../config/database');
const { sendInviteEmail, generateInviteToken } = require('../services/emailService');
const { encryptPassword } = require('../services/passwordCryptoService');
const { invalidateAuthCache } = require('../middleware/auth');
const { checkQuota } = require('../services/quotaService');
const { normaliserTelephone, telephoneAffiche, emailTechnique, estEmailTechnique, motDePasseInitial } = require('../utils/livreurs');

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INTROUVABLE = { message: 'Livreur introuvable' };
const compteDe = (req) => req.user.gerant_parent_id || req.user.id;
const idValide = (id) => /^\d{1,9}$/.test(String(id));

const mapLivreur = (r) => ({
  id: r.id,
  userId: r.user_id,
  nom: r.nom,
  telephone: telephoneAffiche(r.telephone_norm),
  email: r.email || null,
  actif: r.actif,
  activatedAt: r.activated_at || null,
  // Invitation par e-mail pas encore acceptée (livreur AVEC adresse, compte non activé).
  inviteEnAttente: !r.activated_at && !!r.email,
  doitChangerMdp: r.doit_changer_mdp === true,
  creePar: r.cree_par_nom || null,
  createdAt: r.created_at,
});

const SELECT_LIVREUR = `
  SELECT l.id, l.user_id, l.client_id, l.nom, l.telephone, l.telephone_norm, l.email, l.actif, l.created_at,
         u.activated_at, u.doit_changer_mdp, c.nom AS cree_par_nom
    FROM livreurs l
    JOIN utilisateurs u ON u.id = l.user_id
    LEFT JOIN utilisateurs c ON c.id = l.cree_par`;

const lireLivreur = async (db, id, clientId) => {
  if (!idValide(id)) return null;
  const r = await db.query(`${SELECT_LIVREUR} WHERE l.id = $1 AND l.client_id = $2`, [id, clientId]);
  return r.rows[0] || null;
};

// Plafond du compte (abonnement_config.nb_livreurs, 5 par défaut) : null sans configuration.
const plafond = async (clientId) => {
  const r = await pool.query(
    `SELECT ac.nb_livreurs FROM abonnements a JOIN abonnement_config ac ON ac.abonnement_id = a.id
      WHERE a.client_id = $1 ORDER BY a.id DESC LIMIT 1`,
    [clientId]
  );
  const n = parseInt(r.rows[0]?.nb_livreurs, 10);
  return Number.isFinite(n) ? n : null;
};

// GET /api/livreurs — les livreurs du compte + le plafond
const list = async (req, res) => {
  try {
    const clientId = compteDe(req);
    const [rows, max] = await Promise.all([
      pool.query(`${SELECT_LIVREUR} WHERE l.client_id = $1 ORDER BY l.actif DESC, l.nom`, [clientId]),
      plafond(clientId),
    ]);
    res.json({ livreurs: rows.rows.map(mapLivreur), max });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /api/livreurs — { nom, telephone, email? }
//   avec e-mail : compte à activer par le lien d'invitation (48 h), comme un gérant ;
//   sans e-mail : mot de passe initial généré, renvoyé UNE fois (motDePasseInitial), à changer à la première connexion.
const create = async (req, res) => {
  const nom = String(req.body?.nom || '').trim();
  const tel = normaliserTelephone(req.body?.telephone);
  const mail = String(req.body?.email || '').trim().toLowerCase() || null;
  if (!nom) return res.status(400).json({ code: 'NOM_REQUIS', message: 'Nom requis' });
  if (nom.length > 100) return res.status(400).json({ code: 'NOM_TROP_LONG', message: 'Nom : 100 caractères au plus' });
  if (!tel) return res.status(400).json({ code: 'TELEPHONE_INVALIDE', message: 'Téléphone tunisien requis : 8 chiffres (ex. 22 345 678)' });
  if (mail && (!EMAIL.test(mail) || mail.length > 255 || estEmailTechnique(mail))) {
    return res.status(400).json({ code: 'EMAIL_INVALIDE', message: 'Email invalide (exemple : prenom@societe.tn)' });
  }
  const clientId = compteDe(req);
  const db = await pool.connect();
  try {
    const quota = await checkQuota(pool, clientId, 'livreur');
    if (quota) return res.status(409).json(quota);
    const telPris = await pool.query('SELECT 1 FROM livreurs WHERE telephone_norm = $1', [tel]);
    if (telPris.rows.length) return res.status(409).json({ code: 'TELEPHONE_DEJA_PRIS', message: "Ce numéro de téléphone est déjà celui d'un livreur" });
    const loginEmail = mail || emailTechnique(tel);
    const mailPris = await pool.query('SELECT 1 FROM utilisateurs WHERE LOWER(email) = LOWER($1)', [loginEmail]);
    if (mailPris.rows.length) return res.status(409).json({ code: 'EMAIL_DEJA_PRIS', message: 'Email déjà utilisé' });

    let motDePasse = null;
    let token = null;
    let expires = null;
    if (mail) {
      token = generateInviteToken();
      expires = new Date(Date.now() + 48 * 60 * 60 * 1000);
    } else {
      motDePasse = motDePasseInitial();
    }
    const hash = motDePasse ? await bcrypt.hash(motDePasse, 10) : null;
    const enc = motDePasse ? encryptPassword(motDePasse) : null;

    await db.query('BEGIN');
    // $8 : « un mot de passe initial est posé » (compte activé d'emblée, à changer) — paramètre booléen à part : réutiliser
    // $3 (varchar) dans une condition ::text fait refuser la requête par PostgreSQL (types incohérents).
    const u = await db.query(
      `INSERT INTO utilisateurs
         (nom, email, mot_de_passe, mot_de_passe_enc, telephone, role, invite_token, invite_token_expires_at,
          activated_at, password_changed_at, doit_changer_mdp)
       VALUES ($1, $2, $3, $4, $5, 'livreur', $6, $7,
               CASE WHEN $8::boolean THEN NOW() ELSE NULL END,
               CASE WHEN $8::boolean THEN NOW() ELSE NULL END,
               $8::boolean)
       RETURNING id`,
      [nom, loginEmail, hash, enc, telephoneAffiche(tel), token, expires, !!motDePasse]
    );
    const l = await db.query(
      `INSERT INTO livreurs (client_id, user_id, nom, telephone, telephone_norm, email, cree_par)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [clientId, u.rows[0].id, nom, telephoneAffiche(tel), tel, mail, req.user.id]
    );
    await db.query('COMMIT');

    // Le livreur est créé : un échec d'envoi ne produit pas de 5xx (même règle que les gérants), l'invitation se renvoie.
    let emailEnvoye = false;
    if (mail) {
      emailEnvoye = true;
      await sendInviteEmail({ to: mail, nom, token, role: 'livreur', voc: req.voc }).catch((e) => {
        emailEnvoye = false;
        console.error('Invite livreur:', e.message);
      });
    }
    const row = await lireLivreur(pool, l.rows[0].id, clientId);
    res.status(201).json({ ...mapLivreur(row), emailEnvoye, motDePasseInitial: motDePasse });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    db.release();
  }
};

// PUT /api/livreurs/:id — { nom?, telephone?, actif? } (l'e-mail de connexion ne change pas, comme pour un gérant)
const update = async (req, res) => {
  const clientId = compteDe(req);
  try {
    const actuel = await lireLivreur(pool, req.params.id, clientId);
    if (!actuel) return res.status(404).json(INTROUVABLE);
    const nom = req.body?.nom != null ? String(req.body.nom).trim() : null;
    if (nom !== null && (!nom || nom.length > 100)) return res.status(400).json({ code: 'NOM_REQUIS', message: 'Nom requis (100 caractères au plus)' });
    let tel = null;
    if (req.body?.telephone != null) {
      tel = normaliserTelephone(req.body.telephone);
      if (!tel) return res.status(400).json({ code: 'TELEPHONE_INVALIDE', message: 'Téléphone tunisien requis : 8 chiffres (ex. 22 345 678)' });
      if (tel !== actuel.telephone_norm) {
        const pris = await pool.query('SELECT 1 FROM livreurs WHERE telephone_norm = $1 AND id <> $2', [tel, actuel.id]);
        if (pris.rows.length) return res.status(409).json({ code: 'TELEPHONE_DEJA_PRIS', message: "Ce numéro de téléphone est déjà celui d'un livreur" });
      }
    }
    const actif = typeof req.body?.actif === 'boolean' ? req.body.actif : null;

    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query(
        `UPDATE livreurs SET nom = COALESCE($1, nom), telephone = COALESCE($2, telephone), telephone_norm = COALESCE($3, telephone_norm),
                             actif = COALESCE($4, actif), updated_at = NOW()
          WHERE id = $5`,
        [nom, tel ? telephoneAffiche(tel) : null, tel, actif, actuel.id]
      );
      // Miroir sur le compte de connexion : nom, téléphone, actif (authenticate lit utilisateurs.actif), adresse
      // technique suivie du numéro quand le livreur n'a pas d'e-mail réel.
      await db.query(
        `UPDATE utilisateurs SET nom = COALESCE($1, nom), telephone = COALESCE($2, telephone), actif = COALESCE($3, actif),
                                 email = CASE WHEN $4::text IS NOT NULL AND email LIKE 'livreur-%@livreurs.labflow.local' THEN $4 ELSE email END,
                                 updated_at = NOW()
          WHERE id = $5`,
        [nom, tel ? telephoneAffiche(tel) : null, actif, tel && !actuel.email ? emailTechnique(tel) : null, actuel.user_id]
      );
      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      db.release();
    }
    invalidateAuthCache(actuel.user_id);
    res.json(mapLivreur(await lireLivreur(pool, actuel.id, clientId)));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /api/livreurs/:id — supprime la fiche ET le compte de connexion (cascade depuis utilisateurs).
// L2 refusera la suppression d'un livreur affecté à une commande (historique à garder).
const remove = async (req, res) => {
  const clientId = compteDe(req);
  try {
    const actuel = await lireLivreur(pool, req.params.id, clientId);
    if (!actuel) return res.status(404).json(INTROUVABLE);
    // L2 : un livreur déjà confié à des commandes garde sa trace — on le désactive, on ne le supprime pas.
    const aff = await pool.query('SELECT COUNT(*)::int AS n FROM commandes_acheteur WHERE livreur_id = $1', [actuel.id]);
    if (aff.rows[0].n > 0) {
      return res.status(409).json({ code: 'LIVREUR_AFFECTE', message: `${actuel.nom} a ${aff.rows[0].n} livraison${aff.rows[0].n > 1 ? 's' : ''} à son nom : désactivez-le plutôt que de le supprimer` });
    }
    await pool.query('DELETE FROM utilisateurs WHERE id = $1 AND role = $2', [actuel.user_id, 'livreur']);
    invalidateAuthCache(actuel.user_id);
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /api/livreurs/:id/inviter — renvoie l'invitation (livreur avec e-mail, compte non activé), 48 h ré-armées.
const inviter = async (req, res) => {
  const clientId = compteDe(req);
  try {
    const l = await lireLivreur(pool, req.params.id, clientId);
    if (!l) return res.status(404).json(INTROUVABLE);
    if (!l.email) return res.status(400).json({ code: 'SANS_EMAIL', message: "Ce livreur n'a pas d'adresse e-mail : remettez-lui un mot de passe initial (🔑 Nouveau mot de passe)" });
    if (l.activated_at) return res.status(409).json({ code: 'DEJA_ACTIVE', message: 'Le compte de ce livreur est déjà activé' });
    const token = generateInviteToken();
    const expires = new Date(Date.now() + 48 * 60 * 60 * 1000);
    await pool.query(
      `UPDATE utilisateurs SET invite_token = $1, invite_token_expires_at = $2, updated_at = NOW()
        WHERE id = $3 AND activated_at IS NULL`,
      [token, expires, l.user_id]
    );
    try {
      await sendInviteEmail({ to: l.email, nom: l.nom, token, role: 'livreur', voc: req.voc });
    } catch (e) {
      console.error('Invite livreur (renvoi):', e.message);
      return res.status(502).json({ message: "L'invitation n'a pas pu être envoyée, réessayez dans un instant" });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /api/livreurs/:id/mot-de-passe — nouveau mot de passe initial (affiché une fois), sessions du livreur fermées,
// changement exigé à la prochaine connexion. Sert aussi au livreur avec e-mail qui a perdu son mot de passe.
const motDePasse = async (req, res) => {
  const clientId = compteDe(req);
  try {
    const l = await lireLivreur(pool, req.params.id, clientId);
    if (!l) return res.status(404).json(INTROUVABLE);
    const mdp = motDePasseInitial();
    const hash = await bcrypt.hash(mdp, 10);
    await pool.query(
      `UPDATE utilisateurs
          SET mot_de_passe = $1, mot_de_passe_enc = $2, password_changed_at = NOW(), doit_changer_mdp = true,
              activated_at = COALESCE(activated_at, NOW()), invite_token = NULL, invite_token_expires_at = NULL, updated_at = NOW()
        WHERE id = $3`,
      [hash, encryptPassword(mdp), l.user_id]
    );
    invalidateAuthCache(l.user_id);
    res.json({ motDePasseInitial: mdp, livreur: mapLivreur(await lireLivreur(pool, l.id, clientId)) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/livreur/moi — le livreur connecté : sa fiche et l'entreprise qu'il sert.
const moi = async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT l.id, l.nom, l.telephone_norm, l.email, l.actif, u.doit_changer_mdp, pe.nom AS entreprise
         FROM livreurs l
         JOIN utilisateurs u ON u.id = l.user_id
         LEFT JOIN profil_entreprise pe ON pe.client_id = l.client_id
        WHERE l.user_id = $1`,
      [req.user.id]
    );
    const l = r.rows[0];
    if (!l) return res.status(404).json(INTROUVABLE);
    res.json({ id: l.id, nom: l.nom, telephone: telephoneAffiche(l.telephone_norm), email: l.email || null, entreprise: l.entreprise || null, doitChangerMdp: l.doit_changer_mdp === true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Espace livreur (L2) : ses livraisons ──────────────────────────────────────────────────────────────────────────
// Les commandes EXPÉDIÉES qui lui sont confiées (à livrer), puis ses dernières commandes LIVRÉES (mémoire). Lecture
// seule à cette étape : les boutons Livrée / Non livrée arrivent avec L3. Pas de prix par ligne : le total TTC de la
// facture suffit au terrain.
const SELECT_LIVRAISON = `
  SELECT ca.id, ca.statut, ca.date_commande, ca.date_expedition, ca.date_livraison, ca.notes, ca.livraison_affectee_at,
         COALESCE(ach.nom, ca.acheteur_nom) AS acheteur_nom,
         CASE WHEN ach.id IS NULL THEN ca.acheteur_entreprise ELSE ach.entreprise END AS acheteur_entreprise,
         ach.telephone AS acheteur_telephone, ach.adresse AS acheteur_adresse,
         l.nom AS labo_nom, l.adresse AS labo_adresse,
         fa.numero AS facture_numero, fa.montant_ttc,
         (SELECT COUNT(*)::int FROM commande_acheteur_lignes cal WHERE cal.commande_id = ca.id) AS nb_lignes
    FROM commandes_acheteur ca
    LEFT JOIN acheteurs ach ON ach.id = ca.acheteur_id
    LEFT JOIN labos l ON l.id = ca.labo_id
    LEFT JOIN factures_acheteur fa ON fa.commande_id = ca.id`;
const isoDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
const mapLivraison = (c) => ({
  id: c.id,
  statut: c.statut,
  dateCommande: isoDate(c.date_commande),
  dateExpedition: isoDate(c.date_expedition),
  dateLivraison: isoDate(c.date_livraison),
  affecteeLe: c.livraison_affectee_at,
  acheteurNom: c.acheteur_nom,
  acheteurEntreprise: c.acheteur_entreprise || null,
  acheteurTelephone: c.acheteur_telephone || null,
  acheteurAdresse: c.acheteur_adresse || null,
  depart: c.labo_nom || null,
  departAdresse: c.labo_adresse || null,
  nbLignes: c.nb_lignes,
  factureNumero: c.facture_numero || null,
  montantTtc: c.montant_ttc != null ? Number(c.montant_ttc) : null,
  notes: c.notes || null,
});

// GET /api/livreur/commandes
const mesCommandes = async (req, res) => {
  try {
    const r = await pool.query(
      `${SELECT_LIVRAISON}
        WHERE ca.livreur_id = $1 AND ca.statut IN ('expediee', 'livree')
        ORDER BY (ca.statut = 'expediee') DESC, ca.date_expedition DESC, ca.created_at DESC
        LIMIT 100`,
      [req.user.livreurId]
    );
    res.json(r.rows.map(mapLivraison));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/livreur/commandes/:id — détail avec les lignes (désignation, quantité)
const maCommande = async (req, res) => {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(String(req.params.id))) return res.status(404).json({ message: 'Commande introuvable' });
    const r = await pool.query(`${SELECT_LIVRAISON} WHERE ca.id = $1 AND ca.livreur_id = $2`, [req.params.id, req.user.livreurId]);
    if (!r.rows.length) return res.status(404).json({ message: 'Commande introuvable' });
    const lignes = await pool.query('SELECT designation, quantite FROM commande_acheteur_lignes WHERE commande_id = $1 ORDER BY id', [req.params.id]);
    res.json({ ...mapLivraison(r.rows[0]), lignes: lignes.rows.map((l) => ({ designation: l.designation, quantite: Number(l.quantite) })) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { list, create, update, remove, inviter, motDePasse, moi, mesCommandes, maCommande, mapLivreur };
