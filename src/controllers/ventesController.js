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
    const cid = clientId(req);
    const existing = await pool.query(
      `SELECT ap.id, ap.activite_id, ap.labo_id FROM activite_prestataires ap WHERE ap.id = $1`,
      [id]
    );
    if (!existing.rows.length) return res.status(404).json({ message: 'Introuvable' });
    const row = existing.rows[0];
    if (row.activite_id) await assertActiviteOwner(row.activite_id, cid);
    else if (row.labo_id) await assertLaboOwner(row.labo_id, cid);
    const r = await pool.query(
      `UPDATE activite_prestataires SET
        taux_commission = COALESCE($1, taux_commission),
        actif = COALESCE($2, actif)
       WHERE id = $3 RETURNING *`,
      [taux_commission, actif, id]
    );
    res.json(r.rows[0]);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
};

const removeActivitePrestataire = async (req, res) => {
  try {
    const { id } = req.params;
    const cid = clientId(req);
    const existing = await pool.query(
      `SELECT ap.id, ap.activite_id, ap.labo_id FROM activite_prestataires ap WHERE ap.id = $1`,
      [id]
    );
    if (!existing.rows.length) return res.status(404).json({ message: 'Introuvable' });
    const row = existing.rows[0];
    if (row.activite_id) await assertActiviteOwner(row.activite_id, cid);
    else if (row.labo_id) await assertLaboOwner(row.labo_id, cid);
    await pool.query('DELETE FROM activite_prestataires WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
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
              p.nom,
              COALESCE(p.is_supplement, FALSE) as is_supplement,
              p.categorie_produit_id,
              cp.nom as categorie_nom
       FROM activite_articles_vendables av
       JOIN produits p ON p.id = av.article_id
       LEFT JOIN categories_produit cp ON cp.id = p.categorie_produit_id
       WHERE ${whereCol} = $1 AND av.article_type = 'produit'
       ORDER BY p.is_supplement, cp.nom NULLS LAST, p.nom`,
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
    const categorieProduitId = req.body.categorie_produit_id ?? req.body.categorieProduitId ?? null;
    if (!activite_id || !article_type || !article_id) {
      return res.status(400).json({ message: 'activite_id, article_type, article_id requis' });
    }
    if (!['produit', 'ingredient'].includes(article_type)) {
      return res.status(400).json({ message: "article_type doit être 'produit' ou 'ingredient'" });
    }
    // On ne peut pas rendre un article/produit vendable ACTIF sans prix de vente > 0.
    if (actif === true && (prix_vente == null || parseFloat(prix_vente) <= 0)) {
      return res.status(400).json({ message: 'Saisissez un prix de vente supérieur à 0 avant d\'activer cet article.' });
    }
    const cid = clientId(req);
    await assertActiviteOwner(activite_id, cid);

    const r = await pool.query(
      `INSERT INTO activite_articles_vendables (activite_id, article_type, article_id, prix_vente, portion, actif, categorie_produit_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (activite_id, article_type, article_id) DO UPDATE
         SET prix_vente = EXCLUDED.prix_vente,
             portion = EXCLUDED.portion,
             actif = EXCLUDED.actif,
             categorie_produit_id = EXCLUDED.categorie_produit_id
       RETURNING *`,
      [activite_id, article_type, article_id, prix_vente ?? 0, portion ?? null, actif, categorieProduitId]
    );
    const pv = prix_vente ?? 0;
    if (pv > 0) {
      await pool.query(
        `INSERT INTO article_vendable_prix_historique (article_vendable_id, prix_vente, created_by) VALUES ($1,$2,$3)`,
        [r.rows[0].id, pv, req.user.id]
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
    const categorieProduitId = req.body.categorie_produit_id ?? req.body.categorieProduitId;
    const categorieProvided = categorieProduitId !== undefined;

    // On ne peut pas activer sans prix > 0 : on contrôle le prix effectif (nouveau ou existant).
    if (actif === true) {
      let effPrix = prix_vente;
      if (effPrix == null) {
        const cur = await pool.query('SELECT prix_vente FROM activite_articles_vendables WHERE id = $1', [id]);
        effPrix = cur.rows[0]?.prix_vente;
      }
      if (effPrix == null || parseFloat(effPrix) <= 0) {
        return res.status(400).json({ message: 'Saisissez un prix de vente supérieur à 0 avant d\'activer cet article.' });
      }
    }

    const r = await pool.query(
      `UPDATE activite_articles_vendables SET
        prix_vente = COALESCE($1, prix_vente),
        portion = COALESCE($2, portion),
        actif = COALESCE($3, actif),
        categorie_produit_id = CASE WHEN $5::boolean THEN $6 ELSE categorie_produit_id END
       WHERE id = $4 RETURNING *`,
      [prix_vente, portion, actif, id, categorieProvided, categorieProvided ? (categorieProduitId || null) : null]
    );
    if (!r.rows.length) return res.status(404).json({ message: 'Introuvable' });
    if (prix_vente != null && prix_vente > 0) {
      await pool.query(
        `INSERT INTO article_vendable_prix_historique (article_vendable_id, prix_vente, created_by) VALUES ($1,$2,$3)`,
        [id, prix_vente, req.user.id]
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
              COALESCE(p.nom, a.nom) as produit_nom,
              COALESCE(p.is_supplement, FALSE) as is_supplement,
              ub.nom as created_by_nom
       FROM article_vendable_prix_historique avph
       JOIN activite_articles_vendables av ON av.id = avph.article_vendable_id
       LEFT JOIN produits p ON av.article_type = 'produit' AND p.id = av.article_id
       LEFT JOIN articles a ON av.article_type = 'ingredient' AND a.id = av.article_id
       LEFT JOIN utilisateurs ub ON ub.id = avph.created_by
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
      created_by_nom: row.created_by_nom ?? null,
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
              v.created_by, ub.nom as created_by_nom,
              COALESCE(SUM(vl.quantite * vl.prix_unitaire), 0) as total_ca,
              COALESCE(SUM(vl.quantite * (vl.prix_unitaire - COALESCE(vl.cout_unitaire,0))), 0) as total_marge,
              COALESCE(SUM(vl.quantite), 0) as total_quantite,
              COALESCE(
                JSON_AGG(JSON_BUILD_OBJECT(
                  'article_nom', COALESCE(p.nom, a.nom, '—'),
                  'quantite', vl.quantite,
                  'prix_unitaire', vl.prix_unitaire,
                  'article_type', vl.article_type,
                  'is_supplement', COALESCE(p.is_supplement, FALSE)
                ) ORDER BY vl.id) FILTER (WHERE vl.id IS NOT NULL),
                '[]'::json
              ) as lignes
       FROM ventes v
       LEFT JOIN prestataires_livraison pl ON pl.id = v.prestataire_id
       LEFT JOIN utilisateurs ub ON ub.id = v.created_by
       LEFT JOIN vente_lignes vl ON vl.vente_id = v.id
       LEFT JOIN produits p ON vl.article_type = 'produit' AND p.id = vl.article_id
       LEFT JOIN articles a ON vl.article_type = 'ingredient' AND a.id = vl.article_id
       WHERE ${whereCol} = $1 AND v.statut != 'annulee'${where}
       GROUP BY v.id, pl.nom, ub.nom
       ORDER BY v.date_vente DESC, v.created_at DESC
       LIMIT 2000`,
      params
    );

    res.json(r.rows.map(row => ({
      ...row,
      date_vente: isoDate(row.date_vente),
      total_ca: parseFloat(row.total_ca),
      total_marge: parseFloat(row.total_marge),
      total_quantite: parseFloat(row.total_quantite),
      lignes: row.lignes || [],
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

    // Check module_vente_actif for stock deduction
    let moduleVenteActif = false;
    if (activite_id) {
      const mvRes = await pool.query(
        `SELECT pe.module_vente_actif FROM profil_entreprise pe
         JOIN activites a ON a.entreprise_id = pe.id WHERE a.id = $1`,
        [activite_id]
      );
      moduleVenteActif = mvRes.rows[0]?.module_vente_actif === true;
    }

    await client.query('BEGIN');

    const vRes = await client.query(
      `INSERT INTO ventes (activite_id, labo_id, date_vente, type_vente, prestataire_id, statut, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, 'confirmee', $6, $7) RETURNING *`,
      [activite_id || null, labo_id || null,
       date_vente || new Date().toISOString().slice(0, 10), type_vente,
       prestataire_id || null, notes || null, req.user.id]
    );
    const vente = vRes.rows[0];

    // Accumulate stock deduction totals across all lignes before inserting
    const ingredientTotals = new Map(); // ingredient_id -> total qty to deduct
    const ptTotals = new Map();         // sous_produit_id -> total qty to deduct
    const dateApproValue = date_vente || new Date().toISOString().slice(0, 10);

    // Pré-chargement en lot (mêmes calculs qu'avant, mais hors de la boucle).
    const ingArticleIds = [...new Set(lignes.filter((l) => l.article_type === 'ingredient').map((l) => Number(l.article_id)))];
    const prodArticleIds = [...new Set(lignes.filter((l) => l.article_type === 'produit').map((l) => Number(l.article_id)))];

    const ingCostMap = new Map();   // ingredient_id -> AVG prix (ou null)
    if (ingArticleIds.length > 0) {
      // Coût matière = prix moyen dans le stock du périmètre de la vente (activité ou labo).
      const r = activite_id
        ? await client.query(
            `SELECT ingredient_id, AVG(COALESCE(prix_unitaire_tva, prix_unitaire)) AS avg_prix
             FROM stock_entreprise_daily
             WHERE ingredient_id = ANY($1::int[]) AND activite_id = $2 AND quantite > 0
             GROUP BY ingredient_id`,
            [ingArticleIds, activite_id]
          )
        : await client.query(
            `SELECT ingredient_id, AVG(COALESCE(prix_unitaire_tva, prix_unitaire)) AS avg_prix
             FROM stock_labo_daily
             WHERE ingredient_id = ANY($1::int[]) AND labo_id = $2 AND quantite > 0
             GROUP BY ingredient_id`,
            [ingArticleIds, labo_id]
          );
      for (const row of r.rows) ingCostMap.set(row.ingredient_id, row.avg_prix != null ? parseFloat(row.avg_prix) : null);
    }

    const prodCostMap = new Map();  // produit_id -> coût recette (ou null)
    const prodIngMap = new Map();   // produit_id -> [{ingredient_id, portion}]
    const prodSpMap = new Map();    // produit_id -> [{sous_produit_id, portion}]
    if (prodArticleIds.length > 0) {
      const cr = await client.query(
        `SELECT pi.produit_id, SUM(pi.portion * COALESCE(last_prix.prix, 0)) AS cout
         FROM produit_ingredients pi
         LEFT JOIN LATERAL (
           SELECT COALESCE(prix_unitaire_tva, prix_unitaire) AS prix FROM ${activite_id ? 'stock_entreprise_daily' : 'stock_labo_daily'}
           WHERE ingredient_id = pi.ingredient_id AND ${activite_id ? 'activite_id' : 'labo_id'} = $2 AND quantite > 0
           ORDER BY date_appro DESC LIMIT 1
         ) last_prix ON true
         WHERE pi.produit_id = ANY($1::int[])
         GROUP BY pi.produit_id`,
        [prodArticleIds, activite_id || labo_id]
      );
      for (const row of cr.rows) prodCostMap.set(row.produit_id, row.cout != null ? parseFloat(row.cout) : null);

      const ir = await client.query(
        'SELECT produit_id, ingredient_id, portion FROM produit_ingredients WHERE produit_id = ANY($1::int[])',
        [prodArticleIds]
      );
      for (const row of ir.rows) {
        if (!prodIngMap.has(row.produit_id)) prodIngMap.set(row.produit_id, []);
        prodIngMap.get(row.produit_id).push(row);
      }
      const sr = await client.query(
        'SELECT produit_id, sous_produit_id, portion FROM produit_sous_produits WHERE produit_id = ANY($1::int[])',
        [prodArticleIds]
      );
      for (const row of sr.rows) {
        if (!prodSpMap.has(row.produit_id)) prodSpMap.set(row.produit_id, []);
        prodSpMap.get(row.produit_id).push(row);
      }
    }

    // Origine des produits vendus (refonte Espace Produits) : un produit d'ORIGINE LABO est un PT
    // vendu comme valorisé — à la vente on déstocke le PT de l'activité (et non sa recette en
    // articles labo, qui ne sont pas en stock activité). Son coût = coût moyen du PT reçu (transferts).
    const prodOrigineMap = new Map(); // produit_id -> 'labo' | 'activite'
    if (prodArticleIds.length > 0) {
      const or = await client.query('SELECT id, origine FROM produits WHERE id = ANY($1::int[])', [prodArticleIds]);
      for (const row of or.rows) prodOrigineMap.set(row.id, row.origine || 'activite');
      if (activite_id) {
        const laboProdIds = or.rows.filter((r) => (r.origine || 'activite') === 'labo').map((r) => r.id);
        if (laboProdIds.length > 0) {
          const pc = await client.query(
            `SELECT produit_id, AVG(prix_calcule) AS c FROM stock_produits_transformes
             WHERE produit_id = ANY($1::int[]) AND activite_id = $2 AND quantite > 0 AND prix_calcule IS NOT NULL
             GROUP BY produit_id`,
            [laboProdIds, activite_id]
          );
          for (const row of pc.rows) prodCostMap.set(row.produit_id, row.c != null ? parseFloat(row.c) : null);
        }
      }
    }

    for (const ligne of lignes) {
      const { article_type, article_id, quantite, prix_unitaire } = ligne;

      // cout_unitaire depuis les maps pré-chargées (même valeur qu'une requête par ligne)
      let cout = null;
      if (article_type === 'ingredient') {
        cout = ingCostMap.has(Number(article_id)) ? ingCostMap.get(Number(article_id)) : null;
      } else if (article_type === 'produit') {
        cout = prodCostMap.has(Number(article_id)) ? prodCostMap.get(Number(article_id)) : null;
      }

      await client.query(
        `INSERT INTO vente_lignes (vente_id, article_type, article_id, quantite, prix_unitaire, cout_unitaire)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [vente.id, article_type, article_id, quantite, prix_unitaire, cout]
      );

      // Accumulate ingredient and PT sub-product totals for stock deduction
      if (activite_id && moduleVenteActif && article_type === 'produit') {
        if (prodOrigineMap.get(Number(article_id)) === 'labo') {
          // Produit labo (PT) vendu comme valorisé : déstocke le PT de l'activité directement.
          ptTotals.set(Number(article_id),
            (ptTotals.get(Number(article_id)) || 0) + parseFloat(quantite));
        } else {
          // Produit activité : explose la recette (articles + sous-produits PT).
          for (const pi of (prodIngMap.get(Number(article_id)) || [])) {
            ingredientTotals.set(pi.ingredient_id,
              (ingredientTotals.get(pi.ingredient_id) || 0) + parseFloat(pi.portion) * parseFloat(quantite));
          }
          for (const sp of (prodSpMap.get(Number(article_id)) || [])) {
            ptTotals.set(sp.sous_produit_id,
              (ptTotals.get(sp.sous_produit_id) || 0) + parseFloat(sp.portion) * parseFloat(quantite));
          }
        }
      }
      // Direct ingredient sale (valorisé article) — deduct quantity directly from stock
      if (activite_id && moduleVenteActif && article_type === 'ingredient') {
        ingredientTotals.set(article_id,
          (ingredientTotals.get(article_id) || 0) + parseFloat(quantite));
      }
    }

    // Coût matière par ingrédient (même source que le calcul de coût) + fournisseur AUTO, pour
    // tracer les sorties 'vente' avec prix HT / TVA 0 / TTC = HT (lignes hors calcul d'appro).
    let venteAutoFournId = null;
    const venteCostByIng = new Map();
    if (activite_id && ingredientTotals.size > 0) {
      const ingIds = [...ingredientTotals.keys()].map(Number);
      const cr = await client.query(
        `SELECT ingredient_id, AVG(prix_unitaire) AS c FROM stock_entreprise_daily
          WHERE ingredient_id = ANY($1::int[]) AND activite_id = $2 AND quantite > 0 GROUP BY ingredient_id`,
        [ingIds, activite_id]
      );
      for (const row of cr.rows) venteCostByIng.set(row.ingredient_id, row.c != null ? parseFloat(row.c) : 0);
      const fo = await client.query(
        `SELECT f.id FROM fournisseurs f JOIN activites a ON a.entreprise_id = f.entreprise_id
          WHERE a.id = $1 AND f.nom = 'AUTO' LIMIT 1`,
        [activite_id]
      );
      if (fo.rows[0]) venteAutoFournId = fo.rows[0].id;
      else {
        const ent = await client.query(`SELECT entreprise_id FROM activites WHERE id = $1`, [activite_id]);
        if (ent.rows[0]) {
          const nf = await client.query(`INSERT INTO fournisseurs (entreprise_id, nom) VALUES ($1, 'AUTO') RETURNING id`, [ent.rows[0].entreprise_id]);
          venteAutoFournId = nf.rows[0].id;
        }
      }
    }

    // UPSERT per ingredient — accumulate into existing 'vente' row if same day
    for (const [ingredientId, total] of ingredientTotals) {
      const upd = await client.query(
        `UPDATE stock_entreprise_daily
         SET quantite = quantite - $1, updated_at = NOW()
         WHERE activite_id = $2 AND ingredient_id = $3 AND date_appro = $4 AND type_appro = 'vente'`,
        [total, activite_id, ingredientId, dateApproValue]
      );
      if (upd.rowCount === 0) {
        const c = venteCostByIng.get(Number(ingredientId)) ?? 0;
        await client.query(
          `INSERT INTO stock_entreprise_daily
             (activite_id, ingredient_id, quantite, date_appro, type_appro, prix_unitaire, taux_tva, prix_unitaire_tva, fournisseur_id, ref_facture, updated_at, created_by)
           VALUES ($1, $2, $3, $4, 'vente', $5, 0, $5, $6, $7, NOW(), $8)`,
          [activite_id, ingredientId, -total, dateApproValue, c, venteAutoFournId, `vente-${dateApproValue}`, req.user.id]
        );
      }
    }
    // UPSERT per PT sub-product — accumulate into existing vente row if same day
    for (const [sousProduitId, total] of ptTotals) {
      const upd = await client.query(
        `UPDATE stock_produits_transformes
         SET quantite = quantite - $1
         WHERE produit_id = $2 AND activite_id = $3 AND date_appro = $4 AND quantite < 0 AND prix_calcule IS NULL
           AND type_appro IS DISTINCT FROM 'PT'`,
        [total, sousProduitId, activite_id, dateApproValue]
      );
      if (upd.rowCount === 0) {
        await client.query(
          `INSERT INTO stock_produits_transformes (produit_id, activite_id, date_appro, quantite, prix_calcule)
           VALUES ($1, $2, $3, $4, NULL)`,
          [sousProduitId, activite_id, dateApproValue, -total]
        );
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
    // Un gérant ne peut annuler que les ventes qu'il a saisies.
    if (req.user.role === 'gerant' && vente.created_by !== req.user.id)
      return res.status(403).json({ message: 'Vous ne pouvez supprimer que les ventes que vous avez saisies' });

    // Fetch lignes before deleting
    const lignesRes = await client.query('SELECT * FROM vente_lignes WHERE vente_id = $1', [id]);

    await client.query('BEGIN');

    // Hard delete the vente (lignes deleted first to avoid FK constraint)
    await client.query('DELETE FROM vente_lignes WHERE vente_id = $1', [id]);
    await client.query('DELETE FROM ventes WHERE id = $1', [id]);

    // Subtract this vente's stock contribution from the existing 'vente' row
    if (vente.activite_id) {
      const mvRes = await pool.query(
        `SELECT pe.module_vente_actif FROM profil_entreprise pe
         JOIN activites a ON a.entreprise_id = pe.id WHERE a.id = $1`,
        [vente.activite_id]
      );
      const mvActif = mvRes.rows[0]?.module_vente_actif === true;
      if (mvActif) {
        const ingredientTotals = new Map();
        const ptTotals = new Map();
        // Pré-chargement en lot des compositions (mêmes accumulations qu'avant)
        const annulProdIds = [...new Set(lignesRes.rows.filter((l) => l.article_type === 'produit').map((l) => Number(l.article_id)))];
        const annulIngMap = new Map();
        const annulSpMap = new Map();
        if (annulProdIds.length > 0) {
          const ir = await client.query(
            'SELECT produit_id, ingredient_id, portion FROM produit_ingredients WHERE produit_id = ANY($1::int[])',
            [annulProdIds]
          );
          for (const row of ir.rows) {
            if (!annulIngMap.has(row.produit_id)) annulIngMap.set(row.produit_id, []);
            annulIngMap.get(row.produit_id).push(row);
          }
          const sr = await client.query(
            'SELECT produit_id, sous_produit_id, portion FROM produit_sous_produits WHERE produit_id = ANY($1::int[])',
            [annulProdIds]
          );
          for (const row of sr.rows) {
            if (!annulSpMap.has(row.produit_id)) annulSpMap.set(row.produit_id, []);
            annulSpMap.get(row.produit_id).push(row);
          }
        }
        // Origine des produits (refonte) : un produit labo se réintègre comme PT de l'activité.
        const annulOrigineMap = new Map();
        if (annulProdIds.length > 0) {
          const or = await client.query('SELECT id, origine FROM produits WHERE id = ANY($1::int[])', [annulProdIds]);
          for (const row of or.rows) annulOrigineMap.set(row.id, row.origine || 'activite');
        }
        for (const ligne of lignesRes.rows) {
          if (ligne.article_type === 'produit') {
            if (annulOrigineMap.get(Number(ligne.article_id)) === 'labo') {
              ptTotals.set(Number(ligne.article_id),
                (ptTotals.get(Number(ligne.article_id)) || 0) + parseFloat(ligne.quantite));
            } else {
              for (const pi of (annulIngMap.get(Number(ligne.article_id)) || [])) {
                ingredientTotals.set(pi.ingredient_id,
                  (ingredientTotals.get(pi.ingredient_id) || 0) + parseFloat(pi.portion) * parseFloat(ligne.quantite));
              }
              for (const sp of (annulSpMap.get(Number(ligne.article_id)) || [])) {
                ptTotals.set(sp.sous_produit_id,
                  (ptTotals.get(sp.sous_produit_id) || 0) + parseFloat(sp.portion) * parseFloat(ligne.quantite));
              }
            }
          }
          if (ligne.article_type === 'ingredient') {
            ingredientTotals.set(ligne.article_id,
              (ingredientTotals.get(ligne.article_id) || 0) + parseFloat(ligne.quantite));
          }
        }
        for (const [ingredientId, total] of ingredientTotals) {
          // Subtract this vente's portion from the accumulated 'vente' stock entry
          await client.query(
            `UPDATE stock_entreprise_daily
             SET quantite = quantite + $1, updated_at = NOW()
             WHERE activite_id = $2 AND ingredient_id = $3 AND date_appro = $4 AND type_appro = 'vente'`,
            [total, vente.activite_id, ingredientId, vente.date_vente]
          );
          // Clean up the row if net quantity reached 0 (all ventes for this ingredient/day cancelled)
          await client.query(
            `DELETE FROM stock_entreprise_daily
             WHERE activite_id = $1 AND ingredient_id = $2 AND date_appro = $3 AND type_appro = 'vente' AND quantite >= 0`,
            [vente.activite_id, ingredientId, vente.date_vente]
          );
        }
        for (const [sousProduitId, total] of ptTotals) {
          await client.query(
            `UPDATE stock_produits_transformes
             SET quantite = quantite + $1
             WHERE produit_id = $2 AND activite_id = $3 AND date_appro = $4 AND quantite < 0 AND prix_calcule IS NULL
               AND type_appro IS DISTINCT FROM 'PT'`,
            [total, sousProduitId, vente.activite_id, vente.date_vente]
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
         AND v.date_vente >= date_trunc('month', CURRENT_DATE) AND v.date_vente < date_trunc('month', CURRENT_DATE) + interval '1 month'
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
         AND v.date_vente >= date_trunc('month', CURRENT_DATE) AND v.date_vente < date_trunc('month', CURRENT_DATE) + interval '1 month'
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
    const { activiteId, from, to, type, prestataireId, typeProduit, selectedIds: selParam } = req.query;
    if (!activiteId) return res.status(400).json({ message: 'activiteId requis' });
    const cid = clientId(req);
    await assertActiviteOwner(activiteId, cid);
    const selectedSet = new Set(selParam ? selParam.split(',').filter(Boolean) : []);

    const params = [activiteId];
    let where = '';
    if (from)          { params.push(from);          where += ` AND v.date_vente >= $${params.length}`; }
    if (to)            { params.push(to);             where += ` AND v.date_vente <= $${params.length}`; }
    if (type)          { params.push(type);           where += ` AND v.type_vente = $${params.length}`; }
    if (prestataireId) { params.push(prestataireId);  where += ` AND v.prestataire_id = $${params.length}`; }
    // Filtre « type produit » au niveau ligne (aligné sur l'affichage frontend : n'agrège que les
    // lignes correspondantes et exclut les ventes sans ligne correspondante). 'produit' inclut les
    // ventes sans ligne (comme le front : une vente sans ligne compte comme « produit »).
    if (typeProduit === 'valorise') {
      where += ` AND vl.article_type = 'ingredient'`;
    } else if (typeProduit === 'supplement') {
      where += ` AND vl.article_type = 'produit' AND COALESCE(p.is_supplement, FALSE) = TRUE`;
    } else if (typeProduit === 'produit') {
      where += ` AND (vl.id IS NULL OR (vl.article_type = 'produit' AND COALESCE(p.is_supplement, FALSE) = FALSE))`;
    }

    const r = await pool.query(
      `SELECT v.id, v.date_vente, v.type_vente, pl.nom as prestataire_nom, v.statut,
              COALESCE(SUM(vl.quantite * vl.prix_unitaire), 0) as total_ca,
              COALESCE(SUM(vl.quantite * (vl.prix_unitaire - COALESCE(vl.cout_unitaire,0))), 0) as total_marge
       FROM ventes v
       LEFT JOIN prestataires_livraison pl ON pl.id = v.prestataire_id
       LEFT JOIN vente_lignes vl ON vl.vente_id = v.id
       LEFT JOIN produits p ON vl.article_type = 'produit' AND p.id = vl.article_id
       WHERE v.activite_id = $1 AND v.statut != 'annulee'${where}
       GROUP BY v.id, pl.nom
       ORDER BY v.date_vente DESC, v.created_at DESC`,
      params
    );

    const fmtD = (d) => d ? d.split('-').reverse().join('/') : '—';
    const BLUE = '1F3864'; const WHITE = 'FFFFFF'; const ORANGE = 'FF6B00';
    const ALT = 'EEF4FF'; const GOLD = 'FFD700'; const TITLE_BG = '2E4A7A';
    const thin = { style: 'thin', color: { argb: 'B8CCE4' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const hdrFont = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
    const bodyFont = { name: 'Calibri', size: 10 };
    const numFmt = '#,##0.000 "DT"';

    const cols = [
      { header: 'Date',        width: 13 },
      { header: 'Type',        width: 14 },
      { header: 'Prestataire', width: 22 },
      { header: 'CA (DT)',     width: 15 },
      { header: 'Marge (DT)',  width: 15 },
      { header: 'Statut',      width: 14 },
    ];

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Fiche Technique App';
    const ws = wb.addWorksheet('Historique Ventes', { pageSetup: { paperSize: 9, orientation: 'landscape' } });
    ws.columns = cols.map(c => ({ width: c.width }));

    // Title row
    const titleText = `Historique Ventes  —  DU : ${fmtD(from)}   AU : ${fmtD(to)}`;
    const titleRow = ws.addRow([titleText, ...Array(cols.length - 1).fill('')]);
    ws.mergeCells(1, 1, 1, cols.length);
    titleRow.getCell(1).font = { name: 'Calibri', bold: true, size: 13, color: { argb: WHITE } };
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_BG } };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 28;

    // Header row
    const hdrRow = ws.addRow(cols.map(c => c.header));
    hdrRow.eachCell({ includeEmpty: true }, cell => {
      cell.font = hdrFont;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = border;
    });
    hdrRow.height = 22;
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };

    // Data rows
    let totalCA = 0; let totalMarge = 0;
    r.rows.forEach((row, i) => {
      const ca = parseFloat(row.total_ca);
      const marge = parseFloat(row.total_marge);
      totalCA += ca; totalMarge += marge;
      const isSelected = selectedSet.has(row.id);
      const bg = isSelected ? ORANGE : (i % 2 === 0 ? WHITE : ALT);
      const txtColor = isSelected ? WHITE : '1a1a2e';
      const dateStr = isoDate(row.date_vente)?.split('-').reverse().join('/') ?? '';
      const typeLabel = row.type_vente === 'directe' ? 'Directe' : 'Prestataire';
      const statutLabel = row.statut === 'confirmee' ? 'Confirmée' : row.statut;
      const dataRow = ws.addRow([dateStr, typeLabel, row.prestataire_nom || '', ca, marge, statutLabel]);
      for (let c = 1; c <= cols.length; c++) {
        const cell = dataRow.getCell(c);
        cell.font = { ...bodyFont, bold: isSelected, color: { argb: txtColor } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = border;
        cell.alignment = { vertical: 'middle', horizontal: c >= 4 && c <= 5 ? 'right' : (c === 6 ? 'center' : 'left') };
      }
      dataRow.getCell(4).numFmt = numFmt;
      dataRow.getCell(5).numFmt = numFmt;
      dataRow.height = 16;
    });

    // Total row
    const totalRow = ws.addRow(['TOTAL', '', '', totalCA, totalMarge, '']);
    totalRow.eachCell({ includeEmpty: true }, cell => {
      cell.font = { name: 'Calibri', bold: true, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
      cell.border = border;
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
    totalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    totalRow.getCell(4).numFmt = numFmt;
    totalRow.getCell(5).numFmt = numFmt;
    totalRow.height = 18;

    // Footer
    ws.addRow([]);
    ws.addRow([`Généré le ${new Date().toLocaleDateString('fr-TN', { dateStyle: 'long' })} — ${r.rows.length} vente(s) — Montants en Dinars Tunisiens (DT)`])
      .getCell(1).font = { name: 'Calibri', italic: true, size: 9, color: { argb: '888888' } };
    if (selectedSet.size > 0) {
      const noteRow = ws.addRow([`⚠ ${selectedSet.size} vente(s) en surbrillance orange = sélectionnées`]);
      noteRow.getCell(1).font = { name: 'Calibri', bold: true, size: 9, color: { argb: ORANGE } };
    }

    const dateRange = from && to ? `${from}_${to}` : new Date().getFullYear();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Historique-Ventes-${dateRange}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
};

const exportPrixHistoriqueConfigExcel = async (req, res) => {
  try {
    const { activiteId, from, to, filterType, filterNom, selectedIds: selParam } = req.query;
    if (!activiteId) return res.status(400).json({ message: 'activiteId requis' });
    const cid = clientId(req);
    await assertActiviteOwner(activiteId, cid);
    const selectedSet = new Set(selParam ? selParam.split(',').map(Number).filter(Boolean) : []);

    const params = [activiteId];
    let where = '';
    if (from)       { params.push(from);       where += ` AND h.saved_at >= $${params.length}`; }
    if (to)         { params.push(to + 'T23:59:59'); where += ` AND h.saved_at <= $${params.length}`; }
    if (filterType === 'produit')    where += ` AND av.article_type = 'produit' AND COALESCE(p.is_supplement, FALSE) = FALSE`;
    if (filterType === 'supplement') where += ` AND av.article_type = 'produit' AND COALESCE(p.is_supplement, FALSE) = TRUE`;
    if (filterType === 'valorise')   where += ` AND av.article_type = 'ingredient'`;
    if (filterNom) { params.push(`%${filterNom}%`); where += ` AND COALESCE(p.nom, a.nom) ILIKE $${params.length}`; }

    const r = await pool.query(
      `SELECT h.id, h.prix_vente, h.saved_at,
              av.article_type,
              COALESCE(p.nom, a.nom) as produit_nom,
              COALESCE(p.is_supplement, FALSE) as is_supplement
       FROM article_vendable_prix_historique h
       JOIN activite_articles_vendables av ON av.id = h.article_vendable_id
       LEFT JOIN produits p ON av.article_type = 'produit' AND p.id = av.article_id
       LEFT JOIN articles a ON av.article_type = 'ingredient' AND a.id = av.article_id
       WHERE av.activite_id = $1${where}
       ORDER BY h.saved_at DESC
       LIMIT 1000`,
      params
    );

    const fmtD = (d) => d ? d.split('-').reverse().join('/') : '—';
    const BLUE = '1F3864'; const WHITE = 'FFFFFF'; const ORANGE = 'FF6B00';
    const ALT = 'EEF4FF'; const GOLD = 'FFD700'; const TITLE_BG = '2E4A7A';
    const thin = { style: 'thin', color: { argb: 'B8CCE4' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const hdrFont = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
    const bodyFont = { name: 'Calibri', size: 10 };
    const numFmt = '#,##0.000 "DT"';

    const cols = [
      { header: 'Produit / Supplément', width: 30 },
      { header: 'Type',                  width: 14 },
      { header: 'Prix enregistré',       width: 18 },
      { header: 'Date',                  width: 14 },
    ];

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Fiche Technique App';
    const ws = wb.addWorksheet('Historique Config Prix', { pageSetup: { paperSize: 9, orientation: 'landscape' } });
    ws.columns = cols.map(c => ({ width: c.width }));

    // Title row
    const titleText = `Historique Config Prix  —  DU : ${fmtD(from)}   AU : ${fmtD(to)}`;
    const titleRow = ws.addRow([titleText, ...Array(cols.length - 1).fill('')]);
    ws.mergeCells(1, 1, 1, cols.length);
    titleRow.getCell(1).font = { name: 'Calibri', bold: true, size: 13, color: { argb: WHITE } };
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_BG } };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 28;

    // Header row
    const hdrRow = ws.addRow(cols.map(c => c.header));
    hdrRow.eachCell({ includeEmpty: true }, cell => {
      cell.font = hdrFont;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = border;
    });
    hdrRow.height = 22;
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };

    // Data rows
    r.rows.forEach((row, i) => {
      const isSelected = selectedSet.has(Number(row.id));
      const bg = isSelected ? ORANGE : (i % 2 === 0 ? WHITE : ALT);
      const txtColor = isSelected ? WHITE : '1a1a2e';
      const dateStr = new Date(row.saved_at).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
      const dataRow = ws.addRow([
        row.produit_nom || '—',
        row.article_type === 'ingredient' ? 'Produit Valorisé' : (row.is_supplement ? 'Supplément' : 'Produit'),
        parseFloat(row.prix_vente),
        dateStr,
      ]);
      for (let c = 1; c <= cols.length; c++) {
        const cell = dataRow.getCell(c);
        cell.font = { ...bodyFont, bold: isSelected, color: { argb: txtColor } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = border;
        cell.alignment = { vertical: 'middle', horizontal: c === 3 ? 'right' : (c === 2 || c === 4 ? 'center' : 'left') };
      }
      dataRow.getCell(3).numFmt = numFmt;
      dataRow.height = 16;
    });

    // Footer
    ws.addRow([]);
    ws.addRow([`Généré le ${new Date().toLocaleDateString('fr-TN', { dateStyle: 'long' })} — ${r.rows.length} entrée(s) — Prix en Dinars Tunisiens (DT)`])
      .getCell(1).font = { name: 'Calibri', italic: true, size: 9, color: { argb: '888888' } };
    if (selectedSet.size > 0) {
      const noteRow = ws.addRow([`⚠ ${selectedSet.size} entrée(s) en surbrillance orange = sélectionnées`]);
      noteRow.getCell(1).font = { name: 'Calibri', bold: true, size: 9, color: { argb: ORANGE } };
    }

    const dateRange = from && to ? `${from}_${to}` : new Date().getFullYear();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Historique-Config-Prix-${dateRange}.xlsx"`);
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

const exportLaboVentesExcel = async (req, res) => {
  try {
    const { laboId, from, to, filterCategorie, filterActivite, filterArticle, selectedIds } = req.query;
    if (!laboId) return res.status(400).json({ message: 'laboId requis' });

    const params = [laboId];
    let where = '';
    if (from) { params.push(from); where += ` AND lt.date_transfert >= $${params.length}`; }
    if (to)   { params.push(to);   where += ` AND lt.date_transfert <= $${params.length}`; }

    const r = await pool.query(
      `SELECT lt.id, lt.date_transfert, lt.quantite,
        lt.prix_unitaire, lt.note,
        a.nom as activite_nom,
        CASE WHEN lt.ingredient_id IS NOT NULL THEN i.nom WHEN lt.produit_id IS NOT NULL THEN p.nom END as article_nom,
        CASE WHEN lt.ingredient_id IS NOT NULL THEN u.nom ELSE NULL END as unite_nom,
        CASE WHEN lt.ingredient_id IS NOT NULL THEN COALESCE(cat.nom, 'Sans catégorie') ELSE 'Produits Transformés' END as categorie_nom,
        COALESCE(lt.quantite * lt.prix_unitaire, 0) as valeur,
        CASE
          WHEN lt.ingredient_id IS NOT NULL THEN (
            SELECT AVG(sld.prix_unitaire) FROM stock_labo_daily sld
            WHERE sld.labo_id = $1 AND sld.ingredient_id = lt.ingredient_id AND sld.quantite > 0)
          WHEN lt.produit_id IS NOT NULL THEN (
            SELECT SUM(pi.portion * COALESCE((
              SELECT AVG(sld2.prix_unitaire) FROM stock_labo_daily sld2
              WHERE sld2.labo_id = $1 AND sld2.ingredient_id = pi.ingredient_id AND sld2.quantite > 0), 0))
            FROM produit_ingredients pi WHERE pi.produit_id = lt.produit_id)
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

    let rows = r.rows.map(row => ({
      ...row,
      date_transfert: isoDate(row.date_transfert),
      quantite: parseFloat(row.quantite),
      prix_unitaire: row.prix_unitaire != null ? parseFloat(row.prix_unitaire) : null,
      valeur: parseFloat(row.valeur),
      prix_moyen_appro: row.prix_moyen_appro != null ? parseFloat(row.prix_moyen_appro) : null,
    }));

    if (filterCategorie) rows = rows.filter(r => r.categorie_nom === filterCategorie);
    if (filterActivite)  rows = rows.filter(r => r.activite_nom === filterActivite);
    if (filterArticle)   rows = rows.filter(r => r.article_nom === filterArticle);

    const selSet = selectedIds ? new Set(String(selectedIds).split(',').map(s => s.trim()).filter(Boolean)) : new Set();

    const TITLE_BG = '2E4A7A', BLUE = '1F3864', ORANGE = 'FF6B00';
    const ALT = 'EEF4FF', GOLD = 'FFD700';
    const MON = { numFmt: '#,##0.000 "DT"' };

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Ventes Labo');

    const dateLabel = from || to ? `DU: ${from || '…'} AU: ${to || '…'}` : 'Toutes dates';
    const titleRow = ws.addRow([`Historique Ventes Labo — ${dateLabel}`]);
    ws.mergeCells(1, 1, 1, 9);
    const tc = titleRow.getCell(1);
    tc.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 13 };
    tc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + TITLE_BG } };
    tc.alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 28;

    const hRow = ws.addRow(['Date', 'Article', 'Unité', 'Catégorie', 'Activité', 'Qté', 'Val. transfert', 'Val. appro', 'Écart']);
    hRow.eachCell(c => {
      c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + BLUE } };
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    });
    ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: 9 } };
    ws.getRow(2).height = 22;

    [14, 26, 10, 18, 22, 8, 16, 16, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });

    let totalTransfert = 0, totalAppro = 0;
    rows.forEach((row, idx) => {
      const valeur = row.valeur;
      const valAppro = row.prix_moyen_appro != null ? row.prix_moyen_appro * row.quantite : null;
      totalTransfert += valeur;
      if (valAppro != null) totalAppro += valAppro;
      const ecart = valAppro != null ? valeur - valAppro : null;

      const isSel = selSet.has(String(row.id));
      const dr = ws.addRow([
        row.date_transfert, row.article_nom, row.unite_nom ?? '', row.categorie_nom,
        row.activite_nom, row.quantite, valeur, valAppro ?? '', ecart ?? '',
      ]);
      const bg = isSel ? ORANGE : (idx % 2 === 0 ? 'FFFFFFFF' : 'FF' + ALT);
      dr.eachCell(c => {
        c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        if (isSel) c.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      });
      [7, 8, 9].forEach(col => {
        const cell = dr.getCell(col);
        if (cell.value !== '') Object.assign(cell, MON);
      });
    });

    const totalEcart = totalTransfert - totalAppro;
    const tr = ws.addRow(['Total', '', '', '', `${rows.length} ligne${rows.length !== 1 ? 's' : ''}`, '', totalTransfert, totalAppro, totalEcart]);
    tr.eachCell(c => {
      c.font = { bold: true, color: { argb: 'FF000000' } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF' + GOLD } };
    });
    [7, 8, 9].forEach(col => { Object.assign(tr.getCell(col), MON); });

    ws.addRow([]);
    ws.addRow([`Généré le ${new Date().toLocaleDateString('fr-FR')} — ${rows.length} ligne${rows.length !== 1 ? 's' : ''}${selSet.size > 0 ? ` — ${selSet.size} ligne(s) sélectionnée(s) (fond orange)` : ''}`]);

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="historique-ventes-labo.xlsx"');
    await wb.xlsx.write(res);
    res.end();
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const getArticlesValorisés = async (req, res) => {
  try {
    const { activiteId } = req.query;
    if (!activiteId) return res.status(400).json({ message: 'activiteId requis' });
    const cid = clientId(req);
    await assertActiviteOwner(activiteId, cid);

    // La catégorie de produit est désormais portée par l'article (globale).
    // On n'affiche que les articles valorisés ayant une catégorie assignée.
    const r = await pool.query(
      `SELECT a.id, a.nom, u.nom as unite_nom,
              c.nom as categorie_nom, f.nom as famille_nom,
              av.id as av_id, av.prix_vente, av.actif,
              a.categorie_produit_id,
              cp.nom as categorie_produit_nom
       FROM articles a
       JOIN activite_ingredient_selections ais ON ais.ingredient_id = a.id AND ais.activite_id = $1
       JOIN unites u ON a.unite_id = u.id
       LEFT JOIN categories c ON a.categorie_id = c.id
       LEFT JOIN familles f ON c.famille_id = f.id
       LEFT JOIN activite_articles_vendables av
         ON av.article_id = a.id AND av.activite_id = $1 AND av.article_type = 'ingredient'
       LEFT JOIN categories_produit cp ON cp.id = a.categorie_produit_id
       WHERE a.client_id = $2
         AND f.consommable = FALSE
         AND f.vendable = TRUE
         AND a.categorie_produit_id IS NOT NULL
       ORDER BY cp.nom, a.nom`,
      [activiteId, cid]
    );
    const articleRows = r.rows.map(row => ({
      id: row.id,
      nom: row.nom,
      unite_nom: row.unite_nom,
      categorie_nom: row.categorie_nom ?? null,
      famille_nom: row.famille_nom ?? null,
      categorie_produit_id: row.categorie_produit_id ?? null,
      categorie_produit_nom: row.categorie_produit_nom ?? null,
      article_type: 'ingredient',
      vendable: row.av_id ? {
        id: String(row.av_id),
        article_type: 'ingredient',
        article_id: row.id,
        prix_vente: parseFloat(row.prix_vente ?? 0),
        portion: null,
        actif: row.actif,
        categorie_produit_id: row.categorie_produit_id ?? null,
      } : null,
    }));

    // Produits valorisés COMPOSÉS (origine labo, vendable) ayant un PT dans cette activité.
    // Vendus tels quels comme valorisés (article_type='produit').
    const rc = await pool.query(
      `SELECT p.id, p.nom, p.categorie_produit_id, cp.nom as categorie_produit_nom,
              av.id as av_id, av.prix_vente, av.actif
       FROM produits p
       JOIN produit_activite_stock pas ON pas.produit_id = p.id AND pas.activite_id = $1
       LEFT JOIN activite_articles_vendables av
         ON av.article_id = p.id AND av.activite_id = $1 AND av.article_type = 'produit'
       LEFT JOIN categories_produit cp ON cp.id = p.categorie_produit_id
       WHERE p.client_id = $2 AND p.origine = 'labo' AND p.type = 'vendable'
       ORDER BY cp.nom NULLS LAST, p.nom`,
      [activiteId, cid]
    );
    const composeRows = rc.rows.map(row => ({
      id: row.id,
      nom: row.nom,
      unite_nom: null,
      categorie_nom: 'Produits composés (labo)',
      famille_nom: null,
      categorie_produit_id: row.categorie_produit_id ?? null,
      categorie_produit_nom: row.categorie_produit_nom ?? null,
      article_type: 'produit',
      compose: true,
      vendable: row.av_id ? {
        id: String(row.av_id),
        article_type: 'produit',
        article_id: row.id,
        prix_vente: parseFloat(row.prix_vente ?? 0),
        portion: null,
        actif: row.actif,
        categorie_produit_id: row.categorie_produit_id ?? null,
      } : null,
    }));

    res.json([...composeRows, ...articleRows]);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
};

// GET /api/articles-valorisables
// Liste GLOBALE (par client) des articles dont la famille est vendable et non consommable,
// avec leur catégorie de produit assignée. Sert à la page "Articles valorisés" de l'Espace Produit.
const listArticlesValorisables = async (req, res) => {
  try {
    const cid = clientId(req);
    const r = await pool.query(
      `SELECT a.id, a.nom, u.nom as unite_nom,
              c.nom as categorie_nom, f.nom as famille_nom,
              a.categorie_produit_id, cp.nom as categorie_produit_nom
       FROM articles a
       JOIN unites u ON a.unite_id = u.id
       LEFT JOIN categories c ON a.categorie_id = c.id
       LEFT JOIN familles f ON c.famille_id = f.id
       LEFT JOIN categories_produit cp ON cp.id = a.categorie_produit_id
       WHERE a.client_id = $1
         AND f.consommable = FALSE
         AND f.vendable = TRUE
       ORDER BY COALESCE(cp.nom, 'zzz'), f.nom, a.nom`,
      [cid]
    );
    res.json(r.rows.map(row => ({
      id: row.id,
      nom: row.nom,
      unite_nom: row.unite_nom,
      categorie_nom: row.categorie_nom ?? null,
      famille_nom: row.famille_nom ?? null,
      categorie_produit_id: row.categorie_produit_id ?? null,
      categorie_produit_nom: row.categorie_produit_nom ?? null,
    })));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// PUT /api/articles-valorisables/:id/categorie  { categorie_produit_id }
const setArticleCategorieProduit = async (req, res) => {
  try {
    const cid = clientId(req);
    const articleId = parseInt(req.params.id);
    const categorieProduitId = req.body.categorie_produit_id ?? req.body.categorieProduitId ?? null;
    const r = await pool.query(
      `UPDATE articles SET categorie_produit_id = $1 WHERE id = $2 AND client_id = $3 RETURNING id`,
      [categorieProduitId || null, articleId, cid]
    );
    if (!r.rows.length) return res.status(404).json({ message: 'Article introuvable' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

module.exports = {
  listArticlesValorisables, setArticleCategorieProduit,
  listPrestataires, createPrestataire, updatePrestataire, deletePrestataire,
  toggleModuleVente,
  listActivitePrestataires, addActivitePrestataire, updateActivitePrestataire, removeActivitePrestataire,
  listPrestatairesClient,
  listArticlesVendables, upsertArticleVendable, updateArticleVendable, deleteArticleVendable, getPrixHistorique, getPrixHistoriqueConfig,
  listArticlePrixPrestataire, upsertArticlePrixPrestataire,
  getChargesFixes, upsertChargesFixes,
  listVentes, getVente, createVente, annulerVente, statsVentes,
  exportVentesExcel, exportPrixHistoriqueConfigExcel, deleteHistoriqueEntry,
  laboVentes, laboVentesStats, exportLaboVentesExcel,
  getArticlesValorisés,
};
