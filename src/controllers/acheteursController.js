const pool = require('../config/database');
const ExcelJS = require('exceljs');
const multer = require('multer');
const { sendInviteEmail, generateInviteToken } = require('../services/emailService');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const HEADERS = ['Nom', 'Entreprise', 'Email', 'Téléphone', 'Adresse', 'Matricule fiscal'];
const MAX_ROWS = 500;

const clientIdOf = (req) => req.user.gerant_parent_id || req.user.id;

const mapAcheteur = (row) => ({
  id: row.id,
  nom: row.nom,
  entreprise: row.entreprise,
  email: row.email,
  telephone: row.telephone,
  adresse: row.adresse,
  matriculeFiscal: row.matricule_fiscal,
  notes: row.notes,
  actif: row.actif !== false,
  userId: row.user_id,
  // aucun = pas de compte ; invite = compte créé, mail envoyé, pas encore activé ; actif = activé
  compte: row.user_id ? (row.user_activated_at ? 'actif' : 'invite') : 'aucun',
  createdAt: row.created_at,
});

// Quota serveur : nb_acheteurs de la config d'abonnement (0 = non configuré → création bloquée).
const getQuota = async (clientId) => {
  const r = await pool.query(
    `SELECT ac.nb_acheteurs FROM abonnements a
     JOIN abonnement_config ac ON ac.abonnement_id = a.id
     WHERE a.client_id = $1`,
    [clientId]
  );
  return parseInt(r.rows[0]?.nb_acheteurs, 10) || 0;
};

const countAcheteurs = async (db, clientId) => {
  const r = await db.query('SELECT COUNT(*)::int AS n FROM acheteurs WHERE client_id = $1', [clientId]);
  return r.rows[0].n;
};

const normEmail = (v) => {
  const e = String(v || '').trim().toLowerCase();
  return e || null;
};
const emailValide = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

// Crée le compte de connexion (utilisateurs role='acheteur') d'une fiche acheteur.
// Retourne { userId, invite } ou { error } — n'envoie PAS l'email (l'appelant
// envoie après COMMIT pour ne pas envoyer d'invitations sur une transaction annulée).
const createCompteAcheteur = async (db, acheteur) => {
  const taken = await db.query('SELECT id FROM utilisateurs WHERE LOWER(email) = $1', [acheteur.email]);
  if (taken.rows.length > 0) return { error: 'Cet email est déjà utilisé par un autre compte LabFlow' };
  const token = generateInviteToken();
  const expires = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const u = await db.query(
    `INSERT INTO utilisateurs (nom, email, mot_de_passe, telephone, role, invite_token, invite_token_expires_at)
     VALUES ($1, $2, NULL, $3, 'acheteur', $4, $5) RETURNING id`,
    [acheteur.nom, acheteur.email, acheteur.telephone || null, token, expires]
  );
  await db.query('UPDATE acheteurs SET user_id = $1, updated_at = NOW() WHERE id = $2', [u.rows[0].id, acheteur.id]);
  return { userId: u.rows[0].id, invite: { to: acheteur.email, nom: acheteur.nom, token, role: 'acheteur' } };
};

// GET /api/acheteurs — carnet du client (+ quota pour l'UI)
const list = async (req, res) => {
  try {
    const clientId = clientIdOf(req);
    const [rows, quota] = await Promise.all([
      pool.query(
        `SELECT a.*, u.activated_at AS user_activated_at
         FROM acheteurs a
         LEFT JOIN utilisateurs u ON u.id = a.user_id
         WHERE a.client_id = $1
         ORDER BY a.nom`,
        [clientId]
      ),
      getQuota(clientId),
    ]);
    res.json({ acheteurs: rows.rows.map(mapAcheteur), quota, utilises: rows.rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /api/acheteurs — ajout d'une ou plusieurs fiches (body { acheteurs: [...] } ou fiche unique).
// Chaque item : { nom*, entreprise, email, telephone, adresse, matriculeFiscal, notes, creerCompte }
const create = async (req, res) => {
  const clientId = clientIdOf(req);
  const items = Array.isArray(req.body.acheteurs) ? req.body.acheteurs : [req.body];
  if (items.length === 0) return res.status(400).json({ message: 'Aucun acheteur à créer' });

  // Validation à plat avant transaction
  const prepared = [];
  const seenEmails = new Set();
  for (let i = 0; i < items.length; i++) {
    const it = items[i] || {};
    const nom = String(it.nom || '').trim();
    if (!nom) return res.status(400).json({ message: `Ligne ${i + 1} : le nom est requis` });
    const email = normEmail(it.email);
    if (email && !emailValide(email)) return res.status(400).json({ message: `Ligne ${i + 1} : email invalide` });
    if (email) {
      if (seenEmails.has(email)) return res.status(400).json({ message: `Ligne ${i + 1} : email en double dans la saisie` });
      seenEmails.add(email);
    }
    const creerCompte = it.creerCompte === true;
    if (creerCompte && !email) return res.status(400).json({ message: `Ligne ${i + 1} : un email est requis pour créer un compte` });
    prepared.push({
      nom, email,
      entreprise: String(it.entreprise || '').trim() || null,
      telephone: String(it.telephone || '').trim() || null,
      adresse: String(it.adresse || '').trim() || null,
      matriculeFiscal: String(it.matriculeFiscal || '').trim() || null,
      notes: String(it.notes || '').trim() || null,
      creerCompte,
    });
  }

  const db = await pool.connect();
  const invites = [];
  const warnings = [];
  try {
    await db.query('BEGIN');

    const quota = await getQuota(clientId);
    const existants = await countAcheteurs(db, clientId);
    if (existants + prepared.length > quota) {
      await db.query('ROLLBACK');
      return res.status(403).json({
        message: quota === 0
          ? "Quota d'acheteurs non configuré — demandez à l'administrateur d'augmenter votre capacité"
          : `Quota d'acheteurs atteint (${existants}/${quota}) — demandez une augmentation de capacité`,
        code: 'QUOTA_ACHETEURS', quota, utilises: existants,
      });
    }

    const created = [];
    for (const p of prepared) {
      let row;
      try {
        const r = await db.query(
          `INSERT INTO acheteurs (client_id, nom, entreprise, email, telephone, adresse, matricule_fiscal, notes, created_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
          [clientId, p.nom, p.entreprise, p.email, p.telephone, p.adresse, p.matriculeFiscal, p.notes, req.user.id]
        );
        row = r.rows[0];
      } catch (e) {
        if (e.code === '23505') {
          await db.query('ROLLBACK');
          return res.status(409).json({ message: `« ${p.email} » existe déjà dans votre carnet` });
        }
        throw e;
      }
      if (p.creerCompte) {
        const compte = await createCompteAcheteur(db, { id: row.id, nom: p.nom, email: p.email, telephone: p.telephone });
        if (compte.error) {
          warnings.push(`${p.nom} : fiche créée, mais compte impossible — ${compte.error}`);
        } else {
          invites.push(compte.invite);
          row.user_id = compte.userId;
        }
      }
      created.push(row);
    }

    await db.query('COMMIT');
    // Envoi des invitations APRÈS commit (best-effort, échec loggé)
    for (const inv of invites) sendInviteEmail(inv).catch((e) => console.error('Invite acheteur:', e));
    res.status(201).json({ acheteurs: created.map(mapAcheteur), invitations: invites.length, warnings });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    db.release();
  }
};

// PUT /api/acheteurs/:id
const update = async (req, res) => {
  const clientId = clientIdOf(req);
  const { id } = req.params;
  try {
    const cur = await pool.query('SELECT * FROM acheteurs WHERE id = $1 AND client_id = $2', [id, clientId]);
    if (cur.rows.length === 0) return res.status(404).json({ message: 'Acheteur introuvable' });
    const a = cur.rows[0];

    const nom = req.body.nom !== undefined ? String(req.body.nom || '').trim() : a.nom;
    if (!nom) return res.status(400).json({ message: 'Le nom est requis' });
    const email = req.body.email !== undefined ? normEmail(req.body.email) : a.email;
    if (email && !emailValide(email)) return res.status(400).json({ message: 'Email invalide' });
    // L'email d'un acheteur AVEC compte est l'identifiant de connexion — modification bloquée en v1.
    if (a.user_id && (email || '') !== (a.email || '')) {
      return res.status(409).json({ message: "Cet acheteur a un compte : l'email de connexion ne peut pas être modifié ici" });
    }
    const actif = req.body.actif !== undefined ? req.body.actif === true : a.actif;

    const val = (body, curVal) => (body !== undefined ? (String(body || '').trim() || null) : curVal);
    const r = await pool.query(
      `UPDATE acheteurs SET nom=$1, entreprise=$2, email=$3, telephone=$4, adresse=$5,
              matricule_fiscal=$6, notes=$7, actif=$8, updated_at=NOW()
       WHERE id=$9 AND client_id=$10
       RETURNING *`,
      [nom, val(req.body.entreprise, a.entreprise), email, val(req.body.telephone, a.telephone),
       val(req.body.adresse, a.adresse), val(req.body.matriculeFiscal, a.matricule_fiscal),
       val(req.body.notes, a.notes), actif, id, clientId]
    );
    const u = r.rows[0].user_id
      ? await pool.query('SELECT activated_at AS user_activated_at FROM utilisateurs WHERE id = $1', [r.rows[0].user_id])
      : { rows: [{}] };
    res.json(mapAcheteur({ ...r.rows[0], ...u.rows[0] }));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ message: 'Cet email existe déjà dans votre carnet' });
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /api/acheteurs/:id — supprime la fiche ET le compte de connexion lié,
// en CONSERVANT tout ce qui a touché le stock : les commandes expédiées/livrées
// (et annulées) restent dans l'historique avec leurs factures fiscales, l'identité
// de l'acheteur figée en snapshot (migr 165, FK ON DELETE SET NULL). Les commandes
// encore en attente n'ont jamais touché le stock : elles sont annulées et tracées.
const remove = async (req, res) => {
  const clientId = clientIdOf(req);
  const { id } = req.params;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    // FOR NO KEY UPDATE (pas FOR UPDATE) : compatible avec le FOR KEY SHARE que
    // prend l'INSERT de facture d'une expédition concurrente — évite le deadlock
    // verrous croisés commande ↔ fiche (l'expédition gagne, la suppression suit).
    const cur = await db.query('SELECT user_id FROM acheteurs WHERE id = $1 AND client_id = $2 FOR NO KEY UPDATE', [id, clientId]);
    if (cur.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Acheteur introuvable' });
    }
    const motif = 'Acheteur supprimé du carnet';
    const attente = await db.query(
      `UPDATE commandes_acheteur
       SET statut = 'annulee', motif_annulation = $3, traite_le = NOW(), traite_par = $4
       WHERE acheteur_id = $1 AND client_id = $2 AND statut = 'en_attente'
       RETURNING id`,
      [id, clientId, motif, req.user.id]
    );
    for (const c of attente.rows) {
      await db.query(
        `INSERT INTO commande_acheteur_statuts (commande_id, statut, date_effet, motif, created_by)
         VALUES ($1, 'annulee', CURRENT_DATE, $2, $3)`,
        [c.id, motif, req.user.id]
      );
    }
    // Snapshot rafraîchi au DERNIER état de la fiche : PDF de facture et
    // historiques continuent d'afficher la bonne identité après suppression.
    await db.query(
      `UPDATE commandes_acheteur ca SET acheteur_nom = a.nom, acheteur_entreprise = a.entreprise
       FROM acheteurs a WHERE a.id = ca.acheteur_id AND ca.acheteur_id = $1`,
      [id]
    );
    await db.query(
      `UPDATE factures_acheteur fa
       SET acheteur_nom = a.nom, acheteur_entreprise = a.entreprise, acheteur_adresse = a.adresse,
           acheteur_matricule_fiscal = a.matricule_fiscal, acheteur_telephone = a.telephone, acheteur_email = a.email
       FROM acheteurs a WHERE a.id = fa.acheteur_id AND fa.acheteur_id = $1`,
      [id]
    );
    await db.query('DELETE FROM acheteurs WHERE id = $1 AND client_id = $2', [id, clientId]);
    if (cur.rows[0].user_id) {
      // Les références d'audit (created_by/traite_par) sont en ON DELETE SET NULL (migr 166).
      await db.query(`DELETE FROM utilisateurs WHERE id = $1 AND role = 'acheteur'`, [cur.rows[0].user_id]);
    }
    await db.query('COMMIT');
    res.json({
      message: 'Acheteur supprimé — ses commandes et factures restent dans l\'historique',
      commandesAnnulees: attente.rows.length,
    });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    // Filet de sécurité si une nouvelle référence apparaît (futur module)
    if (err.code === '23503') {
      return res.status(409).json({
        message: 'Impossible de supprimer : cet acheteur est référencé par des données existantes. Désactivez-le plutôt.',
        code: 'ACHETEUR_REFERENCE',
      });
    }
    if (err.code === '40P01') {
      return res.status(409).json({ message: 'Opération concurrente sur cet acheteur — réessayez.' });
    }
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    db.release();
  }
};

// POST /api/acheteurs/:id/inviter — crée le compte (si absent) ou renvoie l'invitation.
// Comble le trou resendInvite (réservé super_admin) : le client gère SES acheteurs.
const inviter = async (req, res) => {
  const clientId = clientIdOf(req);
  const { id } = req.params;
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const cur = await db.query(
      `SELECT a.*, u.activated_at AS user_activated_at FROM acheteurs a
       LEFT JOIN utilisateurs u ON u.id = a.user_id
       WHERE a.id = $1 AND a.client_id = $2 FOR UPDATE OF a`,
      [id, clientId]
    );
    if (cur.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Acheteur introuvable' });
    }
    const a = cur.rows[0];
    if (!a.email) {
      await db.query('ROLLBACK');
      return res.status(400).json({ message: 'Renseignez un email sur la fiche avant d’inviter cet acheteur' });
    }
    if (a.user_id && a.user_activated_at) {
      await db.query('ROLLBACK');
      return res.status(409).json({ message: 'Le compte de cet acheteur est déjà activé' });
    }

    let invite;
    if (!a.user_id) {
      const compte = await createCompteAcheteur(db, { id: a.id, nom: a.nom, email: a.email, telephone: a.telephone });
      if (compte.error) {
        await db.query('ROLLBACK');
        return res.status(409).json({ message: compte.error });
      }
      invite = compte.invite;
    } else {
      // Compte existant non activé → régénérer le token (48 h ré-armées) et renvoyer
      const token = generateInviteToken();
      const expires = new Date(Date.now() + 48 * 60 * 60 * 1000);
      await db.query(
        `UPDATE utilisateurs SET invite_token = $1, invite_token_expires_at = $2 WHERE id = $3 AND role = 'acheteur'`,
        [token, expires, a.user_id]
      );
      invite = { to: a.email, nom: a.nom, token, role: 'acheteur' };
    }
    await db.query('COMMIT');
    await sendInviteEmail(invite).catch((e) => console.error('Invite acheteur:', e));
    res.json({ message: `Invitation envoyée à ${a.email}` });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    db.release();
  }
};

// GET /api/acheteurs/template — modèle Excel d'import du carnet
const getTemplate = async (req, res) => {
  try {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Acheteurs');
    ws.columns = HEADERS.map((h) => ({ header: h, key: h, width: h === 'Adresse' ? 34 : 22 }));
    const headerRow = ws.getRow(1);
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF7C3AED' } };
      cell.alignment = { horizontal: 'center' };
    });
    ws.addRow(['Ahmed Ben Salah', 'Superette El Amen', 'ahmed@elamen.tn', '98 123 456', 'Rue de la Liberté, Tunis', '1234567/A/M/000']);
    ws.addRow(['Restaurant Le Golfe', '', 'contact@legolfe.tn', '71 987 654', 'Av. Bourguiba, Sousse', '']);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="modele_acheteurs.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur lors de la génération du modèle' });
  }
};

// POST /api/acheteurs/import — import Excel du carnet.
// Champ multipart "creerComptes" ('true') : crée un compte + invitation pour chaque ligne AVEC email.
const importAcheteurs = [
  upload.single('file'),
  async (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'Fichier requis' });
    const clientId = clientIdOf(req);
    const creerComptes = String(req.body.creerComptes || '') === 'true';

    try {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(req.file.buffer);
      const ws = wb.worksheets[0];
      if (!ws) return res.status(400).json({ message: 'Fichier Excel vide ou illisible' });

      const lignes = [];
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        const cell = (i) => String(row.getCell(i).text || '').trim();
        lignes.push({
          row: rowNumber,
          nom: cell(1), entreprise: cell(2), email: cell(3), telephone: cell(4),
          adresse: cell(5), matriculeFiscal: cell(6),
        });
      });
      const nonVides = lignes.filter((l) => l.nom || l.email || l.entreprise);
      if (nonVides.length === 0) return res.status(400).json({ message: 'Aucune ligne à importer' });
      if (nonVides.length > MAX_ROWS) return res.status(400).json({ message: `Maximum ${MAX_ROWS} lignes par fichier` });

      // Validation par ligne (les lignes en erreur sont sautées, le reste est importé)
      const valides = [];
      const details = [];
      const seenEmails = new Set();
      for (const l of nonVides) {
        if (!l.nom) { details.push({ row: l.row, nom: l.nom, status: 'error', error: 'Nom requis' }); continue; }
        const email = normEmail(l.email);
        if (email && !emailValide(email)) { details.push({ row: l.row, nom: l.nom, status: 'error', error: `Email invalide : ${l.email}` }); continue; }
        if (email && seenEmails.has(email)) { details.push({ row: l.row, nom: l.nom, status: 'error', error: 'Email en double dans le fichier' }); continue; }
        if (email) seenEmails.add(email);
        valides.push({ ...l, email });
      }
      if (valides.length === 0) {
        return res.status(400).json({ message: 'Aucune ligne valide', processed: 0, errors: details.length, details });
      }

      const quota = await getQuota(clientId);
      const db = await pool.connect();
      const invites = [];
      let crees = 0;
      let comptes = 0;
      try {
        await db.query('BEGIN');
        const existants = await countAcheteurs(db, clientId);
        if (existants + valides.length > quota) {
          await db.query('ROLLBACK');
          return res.status(403).json({
            message: quota === 0
              ? "Quota d'acheteurs non configuré — demandez à l'administrateur d'augmenter votre capacité"
              : `Ce fichier dépasse votre quota d'acheteurs : ${existants} existants + ${valides.length} à importer > ${quota} autorisés`,
            code: 'QUOTA_ACHETEURS', quota, utilises: existants,
          });
        }

        for (const v of valides) {
          // SAVEPOINT par ligne : une erreur SQL (ex. doublon 23505) avorterait
          // sinon TOUTE la transaction PostgreSQL et le COMMIT final deviendrait
          // un rollback silencieux — les lignes valides seraient perdues.
          await db.query('SAVEPOINT ligne');
          let row;
          try {
            const r = await db.query(
              `INSERT INTO acheteurs (client_id, nom, entreprise, email, telephone, adresse, matricule_fiscal, created_by)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
              [clientId, v.nom, v.entreprise || null, v.email, v.telephone || null, v.adresse || null, v.matriculeFiscal || null, req.user.id]
            );
            row = r.rows[0];
          } catch (e) {
            if (e.code === '23505') {
              await db.query('ROLLBACK TO SAVEPOINT ligne');
              details.push({ row: v.row, nom: v.nom, status: 'error', error: `${v.email} existe déjà dans votre carnet` });
              continue;
            }
            throw e;
          }
          crees++;
          if (creerComptes && v.email) {
            try {
              const compte = await createCompteAcheteur(db, { id: row.id, nom: v.nom, email: v.email, telephone: v.telephone || null });
              if (compte.error) {
                details.push({ row: v.row, nom: v.nom, status: 'warning', error: `Fiche créée, compte impossible : ${compte.error}` });
              } else {
                invites.push(compte.invite);
                comptes++;
                details.push({ row: v.row, nom: v.nom, status: 'ok', compte: true });
                continue;
              }
            } catch (e) {
              if (e.code === '23505') {
                // Course rare sur utilisateurs.email : on annule la ligne entière (fiche + compte)
                await db.query('ROLLBACK TO SAVEPOINT ligne');
                crees--;
                details.push({ row: v.row, nom: v.nom, status: 'error', error: `${v.email} est déjà utilisé par un autre compte LabFlow` });
                continue;
              }
              throw e;
            }
          } else {
            details.push({
              row: v.row, nom: v.nom, status: creerComptes && !v.email ? 'warning' : 'ok',
              error: creerComptes && !v.email ? 'Sans email — compte non créé' : undefined,
            });
          }
        }

        await db.query('COMMIT');
      } catch (err) {
        await db.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        db.release();
      }

      for (const inv of invites) sendInviteEmail(inv).catch((e) => console.error('Invite acheteur:', e));
      details.sort((a, b) => a.row - b.row);
      res.json({
        processed: crees,
        stats: { crees, comptes, invitations: invites.length },
        errors: details.filter((d) => d.status === 'error').length,
        details,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: "Erreur lors de l'import" });
    }
  },
];

module.exports = { list, create, update, remove, inviter, getTemplate, importAcheteurs };
