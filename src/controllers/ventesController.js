const pool = require('../config/database');
const { isoDate } = require('../utils/dateUtils');
const ExcelJS = require('exceljs');

// ─── Helpers ────────────────────────────────────────────────────────────────

function clientId(req) {
  return req.user.gerant_parent_id || req.user.id;
}

async function getActiviteClientId(activiteId) {
  const r = await pool.query(
    `SELECT pe.client_id FROM activites a
     JOIN profil_entreprise pe ON pe.id = a.entreprise_id
     WHERE a.id = $1`,
    [activiteId]
  );
  return r.rows[0]?.client_id ?? null;
}

async function assertActiviteOwner(activiteId, userId) {
  const ownerId = await getActiviteClientId(activiteId);
  if (String(ownerId) !== String(userId)) throw Object.assign(new Error('Accès refusé'), { status: 403 });
}

async function assertLaboOwner(laboId, userId) {
  const r = await pool.query(
    `SELECT pe.client_id FROM labos l
     JOIN profil_entreprise pe ON pe.id = l.entreprise_id
     WHERE l.id = $1`,
    [laboId]
  );
  const ownerId = r.rows[0]?.client_id;
  if (!ownerId || String(ownerId) !== String(userId)) throw Object.assign(new Error('Accès refusé'), { status: 403 });
}

// ─── Admin — Prestataires ────────────────────────────────────────────────────

const listPrestataires = async (req, res) => {
  try {
    const r = await pool.query('SELECT * FROM prestataires_livraison ORDER BY nom');
    res.json(r.rows);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const createPrestataire = async (req, res) => {
  try {
    const { nom, logo_url } = req.body;
    if (!nom) return res.status(400).json({ message: 'nom requis' });
    const r = await pool.query(
      'INSERT INTO prestataires_livraison (nom, logo_url) VALUES ($1,$2) RETURNING *',
      [nom, logo_url || null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const updatePrestataire = async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, logo_url, actif } = req.body;
    const r = await pool.query(
      `UPDATE prestataires_livraison SET
        nom = COALESCE($1, nom),
        logo_url = COALESCE($2, logo_url),
        actif = COALESCE($3, actif)
       WHERE id = $4 RETURNING *`,
      [nom, logo_url, actif, id]
    );
    if (!r.rows.length) return res.status(404).json({ message: 'Introuvable' });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const deletePrestataire = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM prestataires_livraison WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Admin — Toggle module vente for an entreprise
const toggleModuleVente = async (req, res) => {
  try {
    const { entrepriseId } = req.params;
    const { actif } = req.body;
    const r = await pool.query(
      `UPDATE profil_entreprise SET module_vente_actif = $1 WHERE id = $2
       RETURNING id, module_vente_actif`,
      [actif, entrepriseId]
    );
    if (!r.rows.length) return res.status(404).json({ message: 'Entreprise introuvable' });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ─── Client — Prestataires par activité ──────────────────────────────────────

const listActivitePrestataires = async (req, res) => {
  try {
    const { activiteId, laboId } = req.query;
    if (!activiteId && !laboId) return res.status(400).json({ message: 'activiteId ou laboId requis' });
    const cid = clientId(req);
    if (activiteId) await assertActiviteOwner(activiteId, cid);
    else await assertLaboOwner(laboId, cid);
    const whereCol = activiteId ? 'ap.activite_id' : 'ap.labo_id';
    const whereVal = activiteId || laboId;
    const r = await pool.query(
      `SELECT ap.id, ap.activite_id, ap.labo_id, ap.prestataire_id, ap.taux_commission, ap.actif,
              pl.nom as prestataire_nom, pl.logo_url
       FROM activite_prestataires ap
       JOIN prestataires_livraison pl ON pl.id = ap.prestataire_id
       WHERE ${whereCol} = $1
       ORDER BY pl.nom`,
      [whereVal]
    );
    res.json(r.rows.map(row => ({ ...row, taux_commission: parseFloat(row.taux_commission) })));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
};

const addActivitePrestataire = async (req, res) => {
  try {
    const { activite_id, prestataire_id, taux_commission = 0 } = req.body;
    if (!activite_id || !prestataire_id) {
      return res.status(400).json({ message: 'activite_id et prestataire_id requis' });
    }
    const cid = clientId(req);
    await assertActiviteOwner(activite_id, cid);
    const r = await pool.query(
      `INSERT INTO activite_prestataires (activite_id, prestataire_id, taux_commission)
       VALUES ($1,$2,$3)
       ON CONFLICT (activite_id, prestataire_id) DO UPDATE
         SET taux_commission = EXCLUDED.taux_commission, actif = true
       RETURNING *`,
      [activite_id, prestataire_id, taux_commission]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
};

const updateActivitePrestataire = async (req, res) => {
  try {
    const { id } = req.params;
    const { taux_commission, actif } = req.body;
    const r = await pool.query(
      `UPDATE activite_prestataires SET
        taux_commission = COALESCE($1, taux_commission),
        actif = COALESCE($2, actif)
       WHERE id = $3 RETURNING *`,
      [taux_commission, actif, id]
    );
    if (!r.rows.length) return res.status(404).json({ message: 'Introuvable' });
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const removeActivitePrestataire = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM activite_prestataires WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// Returns active prestataires for a given activité (used when creating a vente)
const listPrestatairesClient = async (req, res) => {
  try {
    const { activiteId } = req.query;
    if (activiteId) {
      const cid = clientId(req);
      await assertActiviteOwner(activiteId, cid);
      const r = await pool.query(
        `SELECT pl.id, pl.nom, pl.logo_url, ap.taux_commission, ap.id as activite_prestataire_id
         FROM activite_prestataires ap
         JOIN prestataires_livraison pl ON pl.id = ap.prestataire_id
         WHERE ap.activite_id = $1 AND ap.actif = true AND pl.actif = true
         ORDER BY pl.nom`,
        [activiteId]
      );
      return res.json(r.rows.map(row => ({ ...row, taux_commission: parseFloat(row.taux_commission) })));
    }
    // Fallback: return all active prestataires
    const r = await pool.query('SELECT * FROM prestataires_livraison WHERE actif = true ORDER BY nom');
    res.json(r.rows);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
};

// ─── Client — Articles Vendables ─────────────────────────────────────────────

const listArticlesVendables = async (req, res) => {
  try {
    const { activiteId, laboId } = req.query;
    if (!activiteId && !laboId) return res.status(400).json({ message: 'activiteId ou laboId requis' });
    const cid = clientId(req);
    if (activiteId) await assertActiviteOwner(activiteId, cid);
    else await assertLaboOwner(laboId, cid);

    const whereCol = activiteId ? 'av.activite_id' : 'av.labo_id';
    const whereVal = activiteId || laboId;

    const r = await pool.query(
      `SELECT av.id, av.activite_id, av.labo_id, av.article_type, av.article_id,
              av.prix_vente, av.portion, av.actif,
              CASE av.article_type
                WHEN 'produit' THEN p.nom
                WHEN 'ingredient' THEN i.nom
              END as nom,
              CASE av.article_type
                WHEN 'ingredient' THEN u.nom
                ELSE NULL
              END as unite_nom
       FROM activite_articles_vendables av
       LEFT JOIN produits p ON av.article_type = 'produit' AND p.id = av.article_id
       LEFT JOIN articles i ON av.article_type = 'ingredient' AND i.id = av.article_id
       LEFT JOIN unites u ON i.unite_id = u.id
       WHERE ${whereCol} = $1
       ORDER BY av.article_type, nom`,
      [whereVal]
    );
    res.json(r.rows.map(row => ({
      ...row,
      prix_vente: parseFloat(row.prix_vente),
      portion: row.portion != null ? parseFloat(row.portion) : null,
    })));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
};

const upsertArticleVendable = async (req, res) => {
  try {
    const { activite_id, article_type, article_id, prix_vente, portion, actif = true } = req.body;
    if (!activite_id || !article_type || !article_id) {
      return res.status(400).json({ message: 'activite_id, article_type, article_id requis' });
    }
    const cid = clientId(req);
    await assertActiviteOwner(activite_id, cid);

    const r = await pool.query(
      `INSERT INTO activite_articles_vendables (activite_id, article_type, article_id, prix_vente, portion, actif)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (activite_id, article_type, article_id) DO UPDATE
         SET prix_vente = EXCLUDED.prix_vente,
             portion = EXCLUDED.portion,
             actif = EXCLUDED.actif
       RETURNING *`,
      [activite_id, article_type, article_id, prix_vente ?? 0, portion ?? null, actif]
    );
    const pv = prix_vente ?? 0;
    if (pv > 0) {
      await pool.query(
        `INSERT INTO article_vendable_prix_historique (article_vendable_id, prix_vente) VALUES ($1,$2)`,
        [r.rows[0].id, pv]
      );
    }
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
};

const updateArticleVendable = async (req, res) => {
  try {
    const { id } = req.params;
    const { prix_vente, portion, actif } = req.body;
    const r = await pool.query(
      `UPDATE activite_articles_vendables SET
        prix_vente = COALESCE($1, prix_vente),
        portion = COALESCE($2, portion),
        actif = COALESCE($3, actif)
       WHERE id = $4 RETURNING *`,
      [prix_vente, portion, actif, id]
    );
    if (!r.rows.length) return res.status(404).json({ message: 'Introuvable' });
    if (prix_vente != null && prix_vente > 0) {
      await pool.query(
        `INSERT INTO article_vendable_prix_historique (article_vendable_id, prix_vente) VALUES ($1,$2)`,
        [id, prix_vente]
      );
    }
    res.json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const getPrixHistorique = async (req, res) => {
  try {
    const { id } = req.params;
    const r = await pool.query(
      `SELECT prix_vente, saved_at FROM article_vendable_prix_historique
       WHERE article_vendable_id = $1 ORDER BY saved_at DESC LIMIT 5`,
      [id]
    );
    res.json(r.rows.map(row => ({ prix_vente: parseFloat(row.prix_vente), saved_at: row.saved_at })));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const getPrixHistoriqueConfig = async (req, res) => {
  try {
    const { activiteId } = req.query;
    if (!activiteId) return res.status(400).json({ message: 'activiteId requis' });
    const cid = clientId(req);
    await assertActiviteOwner(activiteId, cid);
    const r = await pool.query(
      `SELECT avph.id, avph.article_vendable_id, avph.prix_vente, avph.saved_at,
              av.article_type, av.article_id,
              p.nom as produit_nom, p.is_supplement
       FROM article_vendable_prix_historique avph
       JOIN activite_articles_vendables av ON av.id = avph.article_vendable_id
       LEFT JOIN produits p ON av.article_type = 'produit' AND p.id = av.article_id
       WHERE av.activite_id = $1
       ORDER BY avph.saved_at DESC
       LIMIT 500`,
      [activiteId]
    );
    res.json(r.rows.map(row => ({
      id: row.id,
      article_vendable_id: row.article_vendable_id,
      prix_vente: parseFloat(row.prix_vente),
      saved_at: row.saved_at,
      article_type: row.article_type,
      produit_nom: row.produit_nom ?? null,
      is_supplement: row.is_supplement ?? false,
    })));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
};

const deleteArticleVendable = async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM activite_articles_vendables WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ─── Client — Prix prestataire par article ───────────────────────────────────

const listArticlePrixPrestataire = async (req, res) => {
  try {
    const { activiteId, laboId } = req.query;
    if (!activiteId && !laboId) return res.status(400).json({ message: 'activiteId ou laboId requis' });
    const cid = clientId(req);
    if (activiteId) await assertActiviteOwner(activiteId, cid);
    else await assertLaboOwner(laboId, cid);
    const whereCol = activiteId ? 'av.activite_id' : 'av.labo_id';
    const whereVal = activiteId || laboId;
    const r = await pool.query(
      `SELECT app.id, app.article_vendable_id, app.activite_prestataire_id,
              app.prix_vente, app.updated_at,
              ap.prestataire_id, ap.taux_commission,
              pl.nom as prestataire_nom,
              av.article_type, av.article_id, av.prix_vente as prix_base, av.portion,
              CASE av.article_type
                WHEN 'ingredient' THEN i.nom
                WHEN 'produit' THEN p.nom
              END as article_nom
       FROM article_prix_prestataire app
       JOIN activite_prestataires ap ON ap.id = app.activite_prestataire_id
       JOIN prestataires_livraison pl ON pl.id = ap.prestataire_id
       JOIN activite_articles_vendables av ON av.id = app.article_vendable_id
       LEFT JOIN articles i ON av.article_type = 'ingredient' AND i.id = av.article_id
       LEFT JOIN produits p ON av.article_type = 'produit' AND p.id = av.article_id
       WHERE ${whereCol} = $1
       ORDER BY pl.nom, article_nom`,
      [whereVal]
    );
    res.json(r.rows.map(row => ({
      ...row,
      prix_vente: row.prix_vente != null ? parseFloat(row.prix_vente) : null,
      prix_base: row.prix_base != null ? parseFloat(row.prix_base) : null,
      taux_commission: parseFloat(row.taux_commission),
      portion: row.portion != null ? parseFloat(row.portion) : null,
    })));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
};

const upsertArticlePrixPrestataire = async (req, res) => {
  try {
    const { article_vendable_id, activite_prestataire_id, prix_vente } = req.body;
    if (!article_vendable_id || !activite_prestataire_id) {
      return res.status(400).json({ message: 'article_vendable_id et activite_prestataire_id requis' });
    }
    const r = await pool.query(
      `INSERT INTO article_prix_prestataire (article_vendable_id, activite_prestataire_id, prix_vente, updated_at)
       VALUES ($1,$2,$3, NOW())
       ON CONFLICT (article_vendable_id, activite_prestataire_id) DO UPDATE
         SET prix_vente = EXCLUDED.prix_vente, updated_at = NOW()
       RETURNING *`,
      [article_vendable_id, activite_prestataire_id, prix_vente]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// ─── Client — Charges fixes ──────────────────────────────────────────────────

const getChargesFixes = async (req, res) => {
  try {
    const { activiteId } = req.query;
    if (!activiteId) return res.status(400).json({ message: 'activiteId requis' });
    const cid = clientId(req);
    await assertActiviteOwner(activiteId, cid);
    const r = await pool.query('SELECT * FROM charges_fixes WHERE activite_id = $1', [activiteId]);
    res.json(r.rows[0] || null);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
};

const upsertChargesFixes = async (req, res) => {
  try {
    const { activite_id, mode, montant_global, loyer, charges_personnel, electricite_gaz, eau } = req.body;
    if (!activite_id) return res.status(400).json({ message: 'activite_id requis' });
    const cid = clientId(req);
    await assertActiviteOwner(activite_id, cid);
    const r = await pool.query(
      `INSERT INTO charges_fixes
         (activite_id, mode, montant_global, loyer, charges_personnel, electricite_gaz, eau, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, NOW())
       ON CONFLICT (activite_id) DO UPDATE SET
         mode = EXCLUDED.mode,
         montant_global = EXCLUDED.montant_global,
         loyer = EXCLUDED.loyer,
         charges_personnel = EXCLUDED.charges_personnel,
         electricite_gaz = EXCLUDED.electricite_gaz,
         eau = EXCLUDED.eau,
         updated_at = NOW()
       RETURNING *`,
      [activite_id, mode || 'global', montant_global ?? null, loyer ?? null,
       charges_personnel ?? null, electricite_gaz ?? null, eau ?? null]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
};

// ─── Client — Ventes ─────────────────────────────────────────────────────────

const listVentes = async (req, res) => {
  try {
    const { activiteId, laboId, from, to } = req.query;
    if (!activiteId && !laboId) return res.status(400).json({ message: 'activiteId ou laboId requis' });
    const cid = clientId(req);
    if (activiteId) await assertActiviteOwner(activiteId, cid);
    else await assertLaboOwner(laboId, cid);
    const whereCol = activiteId ? 'v.activite_id' : 'v.labo_id';
    const whereVal = activiteId || laboId;

    const params = [whereVal];
    let where = '';
    if (from) { params.push(from); where += ` AND v.date_vente >= $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND v.date_vente <= $${params.length}`; }

    const r = await pool.query(
      `SELECT v.id, v.date_vente, v.type_vente, v.statut, v.notes, v.created_at,
              v.prestataire_id, pl.nom as prestataire_nom,
              COALESCE(SUM(vl.quantite * vl.prix_unitaire), 0) as total_ca,
              COALESCE(SUM(vl.quantite * (vl.prix_unitaire - COALESCE(vl.cout_unitaire,0))), 0) as total_marge
       FROM ventes v
       LEFT JOIN prestataires_livraison pl ON pl.id = v.prestataire_id
       LEFT JOIN vente_lignes vl ON vl.vente_id = v.id
       WHERE ${whereCol} = $1 AND v.statut != 'annulee'${where}
       GROUP BY v.id, pl.nom
       ORDER BY v.date_vente DESC, v.created_at DESC`,
      params
    );

    res.json(r.rows.map(row => ({
      ...row,
      date_vente: isoDate(row.date_vente),
      total_ca: parseFloat(row.total_ca),
      total_marge: parseFloat(row.total_marge),
    })));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
};

const getVente = async (req, res) => {
  try {
    const { id } = req.params;
    const vRes = await pool.query(
      `SELECT v.*, pl.nom as prestataire_nom
       FROM ventes v
       LEFT JOIN prestataires_livraison pl ON pl.id = v.prestataire_id
       WHERE v.id = $1`,
      [id]
    );
    if (!vRes.rows.length) return res.status(404).json({ message: 'Introuvable' });
    const vente = vRes.rows[0];
    const cid = clientId(req);
    if (vente.labo_id) await assertLaboOwner(vente.labo_id, cid);
    else await assertActiviteOwner(vente.activite_id, cid);

    const lignesRes = await pool.query(
      `SELECT vl.*,
              CASE vl.article_type
                WHEN 'produit' THEN p.nom
                WHEN 'ingredient' THEN i.nom
              END as article_nom,
              CASE vl.article_type
                WHEN 'ingredient' THEN u.nom
                ELSE NULL
              END as unite_nom
       FROM vente_lignes vl
       LEFT JOIN produits p ON vl.article_type = 'produit' AND p.id = vl.article_id
       LEFT JOIN articles i ON vl.article_type = 'ingredient' AND i.id = vl.article_id
       LEFT JOIN unites u ON i.unite_id = u.id
       WHERE vl.vente_id = $1`,
      [id]
    );

    res.json({
      ...vente,
      date_vente: isoDate(vente.date_vente),
      lignes: lignesRes.rows.map(l => ({
        ...l,
        quantite: parseFloat(l.quantite),
        prix_unitaire: parseFloat(l.prix_unitaire),
        cout_unitaire: l.cout_unitaire != null ? parseFloat(l.cout_unitaire) : null,
      })),
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
};

const createVente = async (req, res) => {
  const client = await pool.connect();
  try {
    const { activite_id, labo_id, date_vente, type_vente, prestataire_id, notes, lignes = [] } = req.body;
    if ((!activite_id && !labo_id) || !type_vente) {
      return res.status(400).json({ message: 'activite_id ou labo_id, et type_vente requis' });
    }
    const cid = clientId(req);
    if (labo_id) await assertLaboOwner(labo_id, cid);
    else await assertActiviteOwner(activite_id, cid);

    await client.query('BEGIN');

    const vRes = await client.query(
      `INSERT INTO ventes (activite_id, labo_id, date_vente, type_vente, prestataire_id, statut, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, 'confirmee', $6, $7) RETURNING *`,
      [activite_id || null, labo_id || null,
       date_vente || new Date().toISOString().slice(0, 10), type_vente,
       prestataire_id || null, notes || null, req.user.id]
    );
    const vente = vRes.rows[0];

    for (const ligne of lignes) {
      const { article_type, article_id, quantite, prix_unitaire } = ligne;

      // Calculate cout_unitaire from stock
      let cout = null;
      if (article_type === 'ingredient') {
        const coutRes = await client.query(
          `SELECT AVG(prix_unitaire) as avg_prix
           FROM stock_client_daily
           WHERE ingredient_id = $1 AND client_id = $2 AND quantite > 0`,
          [article_id, cid]
        );
        cout = coutRes.rows[0]?.avg_prix != null ? parseFloat(coutRes.rows[0].avg_prix) : null;
      } else if (article_type === 'produit') {
        const coutRes = await client.query(
          `SELECT SUM(pi.portion * COALESCE(last_prix.prix_unitaire, 0)) as cout
           FROM produit_ingredients pi
           LEFT JOIN LATERAL (
             SELECT prix_unitaire FROM stock_client_daily
             WHERE ingredient_id = pi.ingredient_id AND client_id = $2 AND quantite > 0
             ORDER BY date_appro DESC LIMIT 1
           ) last_prix ON true
           WHERE pi.produit_id = $1`,
          [article_id, cid]
        );
        cout = coutRes.rows[0]?.cout != null ? parseFloat(coutRes.rows[0].cout) : null;
      }

      await client.query(
        `INSERT INTO vente_lignes (vente_id, article_type, article_id, quantite, prix_unitaire, cout_unitaire)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [vente.id, article_type, article_id, quantite, prix_unitaire, cout]
      );

      // Decrement stock
      if (article_type === 'ingredient') {
        await client.query(
          `INSERT INTO stock_client_daily (client_id, ingredient_id, quantite, date_appro, type_appro, created_by)
           VALUES ($1, $2, $3, $4, 'vente', $5)`,
          [cid, article_id, -Math.abs(quantite),
           date_vente || new Date().toISOString().slice(0, 10), req.user.id]
        );
      } else if (article_type === 'produit') {
        const ftRes = await client.query(
          'SELECT ingredient_id, portion FROM produit_ingredients WHERE produit_id = $1',
          [article_id]
        );
        for (const pi of ftRes.rows) {
          await client.query(
            `INSERT INTO stock_client_daily (client_id, ingredient_id, quantite, date_appro, type_appro, created_by)
             VALUES ($1, $2, $3, $4, 'vente', $5)`,
            [cid, pi.ingredient_id, -(parseFloat(pi.portion) * parseFloat(quantite)),
             date_vente || new Date().toISOString().slice(0, 10), req.user.id]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.status(201).json({ id: vente.id, ...vente, date_vente: isoDate(vente.date_vente) });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  } finally {
    client.release();
  }
};

const annulerVente = async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const vRes = await client.query('SELECT * FROM ventes WHERE id = $1', [id]);
    if (!vRes.rows.length) return res.status(404).json({ message: 'Introuvable' });
    const vente = vRes.rows[0];
    const cid = clientId(req);
    if (vente.labo_id) await assertLaboOwner(vente.labo_id, cid);
    else await assertActiviteOwner(vente.activite_id, cid);

    if (vente.statut === 'annulee') return res.status(400).json({ message: 'Déjà annulée' });

    await client.query('BEGIN');
    await client.query("UPDATE ventes SET statut = 'annulee' WHERE id = $1", [id]);

    // Reverse stock decrements
    const lignesRes = await client.query('SELECT * FROM vente_lignes WHERE vente_id = $1', [id]);
    for (const ligne of lignesRes.rows) {
      if (ligne.article_type === 'ingredient') {
        await client.query(
          `INSERT INTO stock_client_daily (client_id, ingredient_id, quantite, date_appro, type_appro, created_by)
           VALUES ($1, $2, $3, $4, 'annulation_vente', $5)`,
          [cid, ligne.article_id, Math.abs(parseFloat(ligne.quantite)),
           vente.date_vente, req.user.id]
        );
      } else if (ligne.article_type === 'produit') {
        const ftRes = await client.query(
          'SELECT ingredient_id, portion FROM produit_ingredients WHERE produit_id = $1',
          [ligne.article_id]
        );
        for (const pi of ftRes.rows) {
          await client.query(
            `INSERT INTO stock_client_daily (client_id, ingredient_id, quantite, date_appro, type_appro, created_by)
             VALUES ($1, $2, $3, $4, 'annulation_vente', $5)`,
            [cid, pi.ingredient_id, parseFloat(pi.portion) * parseFloat(ligne.quantite),
             vente.date_vente, req.user.id]
          );
        }
      }
    }

    await client.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  } finally {
    client.release();
  }
};

const statsVentes = async (req, res) => {
  try {
    const { activiteId, laboId } = req.query;
    if (!activiteId && !laboId) return res.status(400).json({ message: 'activiteId ou laboId requis' });
    const cid = clientId(req);
    if (activiteId) await assertActiviteOwner(activiteId, cid);
    else await assertLaboOwner(laboId, cid);
    const whereCol = activiteId ? 'v.activite_id' : 'v.labo_id';
    const whereVal = activiteId || laboId;

    const caRes = await pool.query(
      `SELECT
        COALESCE(SUM(vl.quantite * vl.prix_unitaire) FILTER (WHERE date_trunc('day', v.date_vente) = date_trunc('day', CURRENT_DATE)), 0) as ca_jour,
        COALESCE(SUM(vl.quantite * vl.prix_unitaire) FILTER (WHERE date_trunc('week', v.date_vente) = date_trunc('week', CURRENT_DATE)), 0) as ca_semaine,
        COALESCE(SUM(vl.quantite * vl.prix_unitaire) FILTER (WHERE date_trunc('month', v.date_vente) = date_trunc('month', CURRENT_DATE)), 0) as ca_mois,
        COALESCE(SUM(vl.quantite * (vl.prix_unitaire - COALESCE(vl.cout_unitaire, 0))) FILTER (WHERE date_trunc('month', v.date_vente) = date_trunc('month', CURRENT_DATE)), 0) as marge_mois
       FROM ventes v
       JOIN vente_lignes vl ON vl.vente_id = v.id
       WHERE ${whereCol} = $1 AND v.statut = 'confirmee'`,
      [whereVal]
    );

    const topRes = await pool.query(
      `SELECT
        vl.article_type, vl.article_id,
        CASE vl.article_type WHEN 'produit' THEN p.nom WHEN 'ingredient' THEN i.nom END as nom,
        SUM(vl.quantite) as total_qte,
        SUM(vl.quantite * vl.prix_unitaire) as total_ca
       FROM ventes v
       JOIN vente_lignes vl ON vl.vente_id = v.id
       LEFT JOIN produits p ON vl.article_type = 'produit' AND p.id = vl.article_id
       LEFT JOIN articles i ON vl.article_type = 'ingredient' AND i.id = vl.article_id
       WHERE ${whereCol} = $1 AND v.statut = 'confirmee'
         AND date_trunc('month', v.date_vente) = date_trunc('month', CURRENT_DATE)
       GROUP BY vl.article_type, vl.article_id,
                (CASE vl.article_type WHEN 'produit' THEN p.nom WHEN 'ingredient' THEN i.nom END)
       ORDER BY total_ca DESC LIMIT 10`,
      [whereVal]
    );

    const repartitionRes = await pool.query(
      `SELECT v.type_vente, SUM(vl.quantite * vl.prix_unitaire) as total
       FROM ventes v
       JOIN vente_lignes vl ON vl.vente_id = v.id
       WHERE ${whereCol} = $1 AND v.statut = 'confirmee'
         AND date_trunc('month', v.date_vente) = date_trunc('month', CURRENT_DATE)
       GROUP BY v.type_vente`,
      [whereVal]
    );

    const r = caRes.rows[0];
    res.json({
      ca_jour: parseFloat(r.ca_jour),
      ca_semaine: parseFloat(r.ca_semaine),
      ca_mois: parseFloat(r.ca_mois),
      marge_mois: parseFloat(r.marge_mois),
      top_articles: topRes.rows.map(x => ({
        ...x,
        total_qte: parseFloat(x.total_qte),
        total_ca: parseFloat(x.total_ca),
      })),
      repartition: repartitionRes.rows.map(x => ({
        type: x.type_vente,
        total: parseFloat(x.total),
      })),
    });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
};

// ─── Labo — Ventes (= transferts valorisés) ──────────────────────────────────

const laboVentes = async (req, res) => {
  try {
    const { laboId, from, to } = req.query;
    if (!laboId) return res.status(400).json({ message: 'laboId requis' });

    const params = [laboId];
    let where = '';
    if (from) { params.push(from); where += ` AND lt.date_transfert >= $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND lt.date_transfert <= $${params.length}`; }

    const r = await pool.query(
      `SELECT
        lt.id, lt.date_transfert, lt.quantite,
        lt.prix_unitaire, lt.prix_unitaire_tva, lt.taux_tva,
        lt.note, lt.ref_facture,
        a.nom as activite_nom,
        CASE
          WHEN lt.ingredient_id IS NOT NULL THEN i.nom
          WHEN lt.produit_id IS NOT NULL THEN p.nom
        END as article_nom,
        CASE
          WHEN lt.ingredient_id IS NOT NULL THEN 'ingredient'
          WHEN lt.produit_id IS NOT NULL THEN 'produit'
        END as article_type,
        CASE WHEN lt.ingredient_id IS NOT NULL THEN u.nom ELSE NULL END as unite_nom,
        CASE WHEN lt.ingredient_id IS NOT NULL THEN COALESCE(cat.nom, 'Sans catégorie') ELSE 'Produits Transformés' END as categorie_nom,
        COALESCE(lt.quantite * lt.prix_unitaire, 0) as valeur,
        CASE
          WHEN lt.ingredient_id IS NOT NULL THEN (
            SELECT AVG(sld.prix_unitaire)
            FROM stock_labo_daily sld
            WHERE sld.labo_id = $1 AND sld.ingredient_id = lt.ingredient_id AND sld.quantite > 0
          )
          WHEN lt.produit_id IS NOT NULL THEN (
            SELECT SUM(pi.portion * COALESCE((
              SELECT AVG(sld2.prix_unitaire)
              FROM stock_labo_daily sld2
              WHERE sld2.labo_id = $1 AND sld2.ingredient_id = pi.ingredient_id AND sld2.quantite > 0
            ), 0))
            FROM produit_ingredients pi
            WHERE pi.produit_id = lt.produit_id
          )
        END as prix_moyen_appro
       FROM labo_transfers lt
       LEFT JOIN articles i ON i.id = lt.ingredient_id
       LEFT JOIN produits p ON p.id = lt.produit_id
       LEFT JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories cat ON cat.id = i.categorie_id
       JOIN activites a ON a.id = lt.activite_id
       WHERE lt.labo_id = $1${where}
       ORDER BY lt.date_transfert DESC, lt.created_at DESC`,
      params
    );

    res.json(r.rows.map(row => ({
      ...row,
      date_transfert: isoDate(row.date_transfert),
      quantite: parseFloat(row.quantite),
      prix_unitaire: row.prix_unitaire != null ? parseFloat(row.prix_unitaire) : null,
      valeur: parseFloat(row.valeur),
      prix_moyen_appro: row.prix_moyen_appro != null ? parseFloat(row.prix_moyen_appro) : null,
      categorie_nom: row.categorie_nom ?? 'Sans catégorie',
    })));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const laboVentesStats = async (req, res) => {
  try {
    const { laboId } = req.query;
    if (!laboId) return res.status(400).json({ message: 'laboId requis' });

    const r = await pool.query(
      `SELECT
        COALESCE(SUM(lt.quantite * lt.prix_unitaire) FILTER (WHERE date_trunc('month', lt.date_transfert) = date_trunc('month', CURRENT_DATE)), 0) as valeur_mois,
        COALESCE(SUM(lt.quantite * lt.prix_unitaire) FILTER (WHERE date_trunc('week', lt.date_transfert) = date_trunc('week', CURRENT_DATE)), 0) as valeur_semaine,
        COUNT(*) FILTER (WHERE date_trunc('month', lt.date_transfert) = date_trunc('month', CURRENT_DATE)) as nb_transferts_mois
       FROM labo_transfers lt
       WHERE lt.labo_id = $1 AND lt.prix_unitaire IS NOT NULL`,
      [laboId]
    );

    const topRes = await pool.query(
      `SELECT
        CASE WHEN lt.ingredient_id IS NOT NULL THEN i.nom ELSE p.nom END as nom,
        SUM(lt.quantite * lt.prix_unitaire) as total_valeur
       FROM labo_transfers lt
       LEFT JOIN articles i ON i.id = lt.ingredient_id
       LEFT JOIN produits p ON p.id = lt.produit_id
       WHERE lt.labo_id = $1 AND lt.prix_unitaire IS NOT NULL
         AND date_trunc('month', lt.date_transfert) = date_trunc('month', CURRENT_DATE)
       GROUP BY (CASE WHEN lt.ingredient_id IS NOT NULL THEN i.nom ELSE p.nom END)
       ORDER BY total_valeur DESC LIMIT 5`,
      [laboId]
    );

    const row = r.rows[0];
    res.json({
      valeur_mois: parseFloat(row.valeur_mois),
      valeur_semaine: parseFloat(row.valeur_semaine),
      nb_transferts_mois: parseInt(row.nb_transferts_mois),
      top_articles: topRes.rows.map(x => ({
        nom: x.nom,
        total_valeur: parseFloat(x.total_valeur),
      })),
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const exportVentesExcel = async (req, res) => {
  try {
    const { activiteId, from, to, type } = req.query;
    if (!activiteId) return res.status(400).json({ message: 'activiteId requis' });
    const cid = clientId(req);
    await assertActiviteOwner(activiteId, cid);

    const params = [activiteId];
    let where = '';
    if (from) { params.push(from); where += ` AND v.date_vente >= $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND v.date_vente <= $${params.length}`; }
    if (type) { params.push(type); where += ` AND v.type_vente = $${params.length}`; }

    const r = await pool.query(
      `SELECT v.date_vente, v.type_vente, pl.nom as prestataire_nom, v.statut,
              COALESCE(SUM(vl.quantite * vl.prix_unitaire), 0) as total_ca,
              COALESCE(SUM(vl.quantite * (vl.prix_unitaire - COALESCE(vl.cout_unitaire,0))), 0) as total_marge
       FROM ventes v
       LEFT JOIN prestataires_livraison pl ON pl.id = v.prestataire_id
       LEFT JOIN vente_lignes vl ON vl.vente_id = v.id
       WHERE v.activite_id = $1 AND v.statut != 'annulee'${where}
       GROUP BY v.id, pl.nom
       ORDER BY v.date_vente DESC, v.created_at DESC`,
      params
    );

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Historique Ventes');
    ws.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Type', key: 'type', width: 16 },
      { header: 'Prestataire', key: 'prestataire', width: 20 },
      { header: 'CA (DT)', key: 'ca', width: 14 },
      { header: 'Marge (DT)', key: 'marge', width: 14 },
      { header: 'Statut', key: 'statut', width: 14 },
    ];
    const hRow = ws.getRow(1);
    hRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } };
      cell.alignment = { horizontal: 'center' };
    });
    for (const row of r.rows) {
      ws.addRow({
        date: isoDate(row.date_vente),
        type: row.type_vente === 'directe' ? 'Directe' : 'Prestataire',
        prestataire: row.prestataire_nom || '',
        ca: parseFloat(row.total_ca),
        marge: parseFloat(row.total_marge),
        statut: row.statut === 'confirmee' ? 'Confirmée' : row.statut,
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="historique-ventes.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
};

const exportPrixHistoriqueConfigExcel = async (req, res) => {
  try {
    const { activiteId } = req.query;
    if (!activiteId) return res.status(400).json({ message: 'activiteId requis' });
    const cid = clientId(req);
    await assertActiviteOwner(activiteId, cid);

    const r = await pool.query(
      `SELECT h.id, h.prix_vente, h.saved_at,
              av.article_type,
              COALESCE(p.nom, i.nom) as produit_nom,
              COALESCE(p.is_supplement, FALSE) as is_supplement
       FROM article_vendable_prix_historique h
       JOIN activite_articles_vendables av ON av.id = h.article_vendable_id
       LEFT JOIN produits p ON p.id = av.article_id AND av.article_type = 'produit'
       LEFT JOIN articles i ON i.id = av.article_id AND av.article_type = 'ingredient'
       WHERE av.activite_id = $1
       ORDER BY h.saved_at DESC
       LIMIT 1000`,
      [activiteId]
    );

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Historique Config Prix');
    ws.columns = [
      { header: 'Produit', key: 'produit', width: 28 },
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Prix (DT)', key: 'prix', width: 14 },
      { header: 'Date', key: 'date', width: 14 },
    ];
    const hRow = ws.getRow(1);
    hRow.eachCell(cell => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB45309' } };
      cell.alignment = { horizontal: 'center' };
    });
    for (const row of r.rows) {
      ws.addRow({
        produit: row.produit_nom || '—',
        type: row.is_supplement ? 'Supplément' : 'Produit',
        prix: parseFloat(row.prix_vente),
        date: new Date(row.saved_at).toLocaleDateString('fr-FR'),
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="historique-config-prix.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
};

const deleteHistoriqueEntry = async (req, res) => {
  try {
    const { id } = req.params;
    const cid = clientId(req);
    const check = await pool.query(
      `SELECT av.activite_id FROM article_vendable_prix_historique h
       JOIN activite_articles_vendables av ON av.id = h.article_vendable_id
       WHERE h.id = $1`,
      [id]
    );
    if (!check.rows.length) return res.status(404).json({ message: 'Introuvable' });
    await assertActiviteOwner(check.rows[0].activite_id, cid);
    await pool.query('DELETE FROM article_vendable_prix_historique WHERE id = $1', [id]);
    res.status(204).end();
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
};

module.exports = {
  listPrestataires, createPrestataire, updatePrestataire, deletePrestataire,
  toggleModuleVente,
  listActivitePrestataires, addActivitePrestataire, updateActivitePrestataire, removeActivitePrestataire,
  listPrestatairesClient,
  listArticlesVendables, upsertArticleVendable, updateArticleVendable, deleteArticleVendable, getPrixHistorique, getPrixHistoriqueConfig,
  listArticlePrixPrestataire, upsertArticlePrixPrestataire,
  getChargesFixes, upsertChargesFixes,
  listVentes, getVente, createVente, annulerVente, statsVentes,
  exportVentesExcel, exportPrixHistoriqueConfigExcel, deleteHistoriqueEntry,
  laboVentes, laboVentesStats,
};
