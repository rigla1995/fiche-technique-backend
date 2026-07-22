const pool = require('../config/database');
const { pushToAdmins } = require('../services/sseService');
const { deleteByRef } = require('./notificationController');
const { sendDemandeAccesRefusEmail } = require('../services/emailService');

const STATUTS_DEMANDE = ['nouvelle', 'contactee', 'convertie', 'refusee'];
// Logo partenaire : data-URI image base64 uniquement, taille bornée (≈ 220 Ko d'image).
const LOGO_DATA_URI_REGEX = /^data:image\/(png|jpeg|webp|svg\+xml);base64,/;
const LOGO_MAX_CHARS = 300000;

const mapDemande = (row) => ({
  id: row.id,
  nom: row.nom,
  email: row.email,
  telephone: row.telephone,
  ville: row.ville,
  typeActivite: row.type_activite,
  nbPointsVente: row.nb_points_vente,
  aLabo: row.a_labo,
  interetB2b: row.interet_b2b,
  message: row.message,
  configCalculateur: row.config_calculateur,
  statut: row.statut,
  convertedClientId: row.converted_client_id,
  notesAdmin: row.notes_admin,
  traiteParNom: row.traite_par_nom || null,
  traiteLe: row.traite_le,
  createdAt: row.created_at,
});

// GET /admin/site/demandes-acces?statut= — demandes du site vitrine (nouvelles d'abord)
const listDemandesAcces = async (req, res) => {
  try {
    const { statut } = req.query;
    const params = [];
    let where = '';
    if (statut) {
      if (!STATUTS_DEMANDE.includes(statut)) return res.status(400).json({ message: 'Statut invalide' });
      where = 'WHERE da.statut = $1';
      params.push(statut);
    }
    const result = await pool.query(
      `SELECT da.*, admin.nom AS traite_par_nom
       FROM demandes_acces da
       LEFT JOIN utilisateurs admin ON admin.id = da.traite_par
       ${where}
       ORDER BY (da.statut = 'nouvelle') DESC, da.created_at DESC`,
      params
    );
    res.json(result.rows.map(mapDemande));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /admin/site/demandes-acces/:id — body {statut?, notesAdmin?, convertedClientId?}
const updateDemandeAcces = async (req, res) => {
  const { id } = req.params;
  const { statut, notesAdmin, convertedClientId } = req.body;
  try {
    if (statut !== undefined && !STATUTS_DEMANDE.includes(statut)) {
      return res.status(400).json({ message: 'Statut invalide' });
    }
    if (convertedClientId !== undefined && convertedClientId !== null
        && !Number.isInteger(Number(convertedClientId))) {
      return res.status(400).json({ message: 'Client converti invalide' });
    }

    const current = await pool.query('SELECT * FROM demandes_acces WHERE id = $1', [id]);
    if (current.rows.length === 0) return res.status(404).json({ message: 'Demande introuvable' });

    if (convertedClientId !== undefined && convertedClientId !== null) {
      const clientRes = await pool.query('SELECT 1 FROM utilisateurs WHERE id = $1', [convertedClientId]);
      if (clientRes.rows.length === 0) return res.status(400).json({ message: 'Client converti introuvable' });
    }

    // Conversion → le prospect devient client : on marque sa provenance sur le
    // COMPTE CLIENT (utilisateurs.origine='site' — c'est lui qui porte la stat
    // désormais), on retire la notif, puis on SUPPRIME la demande (la file ne
    // garde que les demandes ouvertes : nouvelle / contactée).
    if (statut === 'convertie') {
      const cid = convertedClientId !== undefined && convertedClientId !== null ? Number(convertedClientId) : null;
      if (cid) {
        await pool.query(
          `UPDATE utilisateurs SET origine = 'site', updated_at = NOW() WHERE id = $1 AND role = 'client'`,
          [cid]
        );
      }
      deleteByRef('demande_acces', Number(id), 'demande_acces_recue')
        .then(() => pushToAdmins('notif_removed', { refKind: 'demande_acces', refId: Number(id) }))
        .catch((e) => console.error('[site] retrait notif demande accès:', e.message));
      await pool.query('DELETE FROM demandes_acces WHERE id = $1', [id]);
      return res.json({ deleted: true, converted: true, id: Number(id) });
    }

    // Refus → email de courtoisie (best-effort), retrait de la notif « file
    // d'attente », puis SUPPRESSION définitive de la demande (l'index unique
    // partiel n'autorise qu'une demande OUVERTE : on n'archive pas les refus).
    if (statut === 'refusee') {
      const demande = current.rows[0];
      try {
        await sendDemandeAccesRefusEmail({ to: demande.email, nom: demande.nom });
      } catch (e) {
        console.error('[site] email refus demande accès:', e.message);
      }
      deleteByRef('demande_acces', Number(id), 'demande_acces_recue')
        .then(() => pushToAdmins('notif_removed', { refKind: 'demande_acces', refId: Number(id) }))
        .catch((e) => console.error('[site] retrait notif demande accès:', e.message));
      await pool.query('DELETE FROM demandes_acces WHERE id = $1', [id]);
      return res.json({ deleted: true, id: Number(id) });
    }

    const sets = ['updated_at = NOW()'];
    const params = [];
    let i = 1;
    if (statut !== undefined) {
      sets.push(`statut = $${i++}`);
      params.push(statut);
      // Traçabilité : qui a traité la demande, quand — posé au changement de statut.
      if (statut !== current.rows[0].statut) {
        sets.push(`traite_par = $${i++}`, 'traite_le = NOW()');
        params.push(req.user.id);
      }
    }
    if (notesAdmin !== undefined) {
      sets.push(`notes_admin = $${i++}`);
      params.push(notesAdmin === null ? null : String(notesAdmin));
    }
    if (convertedClientId !== undefined) {
      sets.push(`converted_client_id = $${i++}`);
      params.push(convertedClientId === null ? null : Number(convertedClientId));
    }
    params.push(id);
    await pool.query(`UPDATE demandes_acces SET ${sets.join(', ')} WHERE id = $${i}`, params);

    // La demande est traitée dès qu'elle quitte l'état 'nouvelle' (contactée /
    // refusée / convertie) → retrait de la notif « file d'attente » chez tous les
    // admins : suppression en base + push SSE pour un retrait instantané.
    if (statut !== undefined && statut !== 'nouvelle' && statut !== current.rows[0].statut) {
      deleteByRef('demande_acces', Number(id), 'demande_acces_recue')
        .then(() => pushToAdmins('notif_removed', { refKind: 'demande_acces', refId: Number(id) }))
        .catch((e) => console.error('[site] retrait notif demande accès:', e.message));
    }

    const updated = await pool.query(
      `SELECT da.*, admin.nom AS traite_par_nom
       FROM demandes_acces da
       LEFT JOIN utilisateurs admin ON admin.id = da.traite_par
       WHERE da.id = $1`,
      [id]
    );
    res.json(mapDemande(updated.rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /admin/site/partenaires — clients activés + état vitrine (logo, opt-in)
const listPartenaires = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id AS client_id, pe.nom, u.email, pe.logo_site, pe.site_partenaire_actif
       FROM utilisateurs u
       JOIN profil_entreprise pe ON pe.client_id = u.id
       WHERE u.role = 'client' AND u.activated_at IS NOT NULL
       ORDER BY pe.nom`
    );
    res.json(result.rows.map((r) => ({
      clientId: r.client_id,
      nom: r.nom,
      email: r.email,
      logoSite: r.logo_site,
      sitePartenaireActif: r.site_partenaire_actif,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /admin/site/partenaires/:clientId — body {logoSite?, actif?}
// logoSite : null pour effacer, sinon data-URI image base64 (≤ 300 000 caractères).
const updatePartenaire = async (req, res) => {
  const { clientId } = req.params;
  const { logoSite, actif } = req.body;
  try {
    if (logoSite !== undefined && logoSite !== null) {
      if (typeof logoSite !== 'string' || !LOGO_DATA_URI_REGEX.test(logoSite)) {
        return res.status(400).json({ message: 'Logo invalide : data-URI image (png, jpeg, webp ou svg) attendu' });
      }
      if (logoSite.length > LOGO_MAX_CHARS) {
        return res.status(413).json({ message: 'Logo trop volumineux (300 000 caractères maximum)' });
      }
    }
    if (actif !== undefined && typeof actif !== 'boolean') {
      return res.status(400).json({ message: 'Le champ actif doit être un booléen' });
    }

    const current = await pool.query(
      `SELECT pe.logo_site, pe.site_partenaire_actif
       FROM utilisateurs u
       JOIN profil_entreprise pe ON pe.client_id = u.id
       WHERE u.id = $1 AND u.role = 'client' AND u.activated_at IS NOT NULL`,
      [clientId]
    );
    if (current.rows.length === 0) {
      return res.status(404).json({ message: 'Client introuvable ou non activé' });
    }

    // État final : un partenaire actif doit toujours avoir un logo.
    const logoFinal = logoSite !== undefined ? logoSite : current.rows[0].logo_site;
    let actifFinal = actif !== undefined ? actif : current.rows[0].site_partenaire_actif;
    if (actifFinal && !logoFinal) {
      if (actif === true) {
        return res.status(400).json({ message: 'Ajoutez d\'abord un logo avant d\'activer ce partenaire sur le site' });
      }
      actifFinal = false; // logo effacé → désactivation implicite de l'affichage
    }

    const result = await pool.query(
      `UPDATE profil_entreprise
       SET logo_site = $1, site_partenaire_actif = $2, updated_at = NOW()
       WHERE client_id = $3
       RETURNING client_id, nom, logo_site, site_partenaire_actif`,
      [logoFinal, actifFinal, clientId]
    );
    const row = result.rows[0];
    res.json({
      clientId: row.client_id,
      nom: row.nom,
      logoSite: row.logo_site,
      sitePartenaireActif: row.site_partenaire_actif,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { listDemandesAcces, updateDemandeAcces, listPartenaires, updatePartenaire };
