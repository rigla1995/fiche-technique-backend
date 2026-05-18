const pool = require('../config/database');
const { isoDate } = require('../utils/dateUtils');

// ─── Helpers ────────────────────────────────────────────────────────────────

function clientId(req) {
  return req.user.gerant_parent_id || req.user.id;
}

async function getActiviteClientId(activiteId) {
  const r = await pool.query('SELECT client_id FROM activites WHERE id = $1', [activiteId]);
  return r.rows[0]?.client_id ?? null;
}

async function assertActiviteOwner(activiteId, userId) {
  const ownerId = await getActiviteClientId(activiteId);
  if (String(ownerId) !== String(userId)) throw Object.assign(new Error('Accès refusé'), { status: 403 });
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
    const { nom, logo_url, commission_pct = 0 } = req.body;
    if (!nom) return res.status(400).json({ message: 'nom requis' });
    const r = await pool.query(
      'INSERT INTO prestataires_livraison (nom, logo_url, commission_pct) VALUES ($1,$2,$3) RETURNING *',
      [nom, logo_url || null, commission_pct]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const updatePrestataire = async (req, res) => {
  try {
    const { id } = req.params;
    const { nom, logo_url, commission_pct, actif } = req.body;
    const r = await pool.query(
      `UPDATE prestataires_livraison SET
        nom = COALESCE($1, nom),
        logo_url = COALESCE($2, logo_url),
        commission_pct = COALESCE($3, commission_pct),
        actif = COALESCE($4, actif)
       WHERE id = $5 RETURNING *`,
      [nom, logo_url, commission_pct, actif, id]
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

// Activate/deactivate prestataire for a client entreprise
const setEntreprisePrestataires = async (req, res) => {
  try {
    const { id: entrepriseId } = req.params;
    const { prestataire_ids = [] } = req.body;
    await pool.query('BEGIN');
    await pool.query('DELETE FROM entreprise_prestataires WHERE entreprise_id = $1', [entrepriseId]);
    for (const pid of prestataire_ids) {
      await pool.query(
        'INSERT INTO entreprise_prestataires (entreprise_id, prestataire_id) VALUES ($1,$2) ON CONFLICT DO NOTHING',
        [entrepriseId, pid]
      );
    }
    await pool.query('COMMIT');
    res.json({ success: true });
  } catch (e) {
    await pool.query('ROLLBACK');
    res.status(500).json({ message: e.message });
  }
};

// ─── Client — Articles Vendables ─────────────────────────────────────────────

const listArticlesVendables = async (req, res) => {
  try {
    const { activiteId } = req.query;
    if (!activiteId) return res.status(400).json({ message: 'activiteId requis' });
    const cid = clientId(req);
    await assertActiviteOwner(activiteId, cid);

    const r = await pool.query(
      `SELECT av.id, av.activite_id, av.article_type, av.article_id, av.prix_vente, av.actif,
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
       LEFT JOIN ingredients i ON av.article_type = 'ingredient' AND i.id = av.article_id
       LEFT JOIN unites u ON i.unite_id = u.id
       WHERE av.activite_id = $1
       ORDER BY av.article_type, nom`,
      [activiteId]
    );
    res.json(r.rows.map(row => ({
      ...row,
      prix_vente: parseFloat(row.prix_vente),
    })));
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
};

const upsertArticleVendable = async (req, res) => {
  try {
    const { activite_id, article_type, article_id, prix_vente, actif = true } = req.body;
    if (!activite_id || !article_type || !article_id) {
      return res.status(400).json({ message: 'activite_id, article_type, article_id requis' });
    }
    const cid = clientId(req);
    await assertActiviteOwner(activite_id, cid);

    const r = await pool.query(
      `INSERT INTO activite_articles_vendables (activite_id, article_type, article_id, prix_vente, actif)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (activite_id, article_type, article_id) DO UPDATE
         SET prix_vente = EXCLUDED.prix_vente, actif = EXCLUDED.actif
       RETURNING *`,
      [activite_id, article_type, article_id, prix_vente ?? 0, actif]
    );
    res.status(201).json(r.rows[0]);
  } catch (e) {
    if (e.status) return res.status(e.status).json({ message: e.message });
    res.status(500).json({ message: e.message });
  }
};

const updateArticleVendable = async (req, res) => {
  try {
    const { id } = req.params;
    const { prix_vente, actif } = req.body;
    const r = await pool.query(
      `UPDATE activite_articles_vendables SET
        prix_vente = COALESCE($1, prix_vente),
        actif = COALESCE($2, actif)
       WHERE id = $3 RETURNING *`,
      [prix_vente, actif, id]
    );
    if (!r.rows.length) return res.status(404).json({ message: 'Introuvable' });
    res.json(r.rows[0]);
  } catch (e) {
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

// ─── Client — Ventes ─────────────────────────────────────────────────────────

const listVentes = async (req, res) => {
  try {
    const { activiteId, from, to } = req.query;
    if (!activiteId) return res.status(400).json({ message: 'activiteId requis' });
    const cid = clientId(req);
    await assertActiviteOwner(activiteId, cid);

    const params = [activiteId];
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
       WHERE v.activite_id = $1 AND v.statut != 'annulee'${where}
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
    await assertActiviteOwner(vente.activite_id, cid);

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
       LEFT JOIN ingredients i ON vl.article_type = 'ingredient' AND i.id = vl.article_id
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
    const { activite_id, date_vente, type_vente, prestataire_id, notes, lignes = [] } = req.body;
    if (!activite_id || !type_vente) {
      return res.status(400).json({ message: 'activite_id, type_vente requis' });
    }
    const cid = clientId(req);
    await assertActiviteOwner(activite_id, cid);

    await client.query('BEGIN');

    const vRes = await client.query(
      `INSERT INTO ventes (activite_id, date_vente, type_vente, prestataire_id, statut, notes, created_by)
       VALUES ($1, $2, $3, $4, 'confirmee', $5, $6) RETURNING *`,
      [activite_id, date_vente || new Date().toISOString().slice(0, 10), type_vente,
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
        // Compute from fiche technique
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
        // Decrement all ingredients of the fiche technique
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
    await assertActiviteOwner(vente.activite_id, cid);

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
    const { activiteId, period = 'month' } = req.query;
    if (!activiteId) return res.status(400).json({ message: 'activiteId requis' });
    const cid = clientId(req);
    await assertActiviteOwner(activiteId, cid);

    let dateTrunc = 'month';
    if (period === 'week') dateTrunc = 'week';
    else if (period === 'day') dateTrunc = 'day';

    const caRes = await pool.query(
      `SELECT
        COALESCE(SUM(vl.quantite * vl.prix_unitaire) FILTER (WHERE date_trunc('day', v.date_vente) = date_trunc('day', CURRENT_DATE)), 0) as ca_jour,
        COALESCE(SUM(vl.quantite * vl.prix_unitaire) FILTER (WHERE date_trunc('week', v.date_vente) = date_trunc('week', CURRENT_DATE)), 0) as ca_semaine,
        COALESCE(SUM(vl.quantite * vl.prix_unitaire) FILTER (WHERE date_trunc('month', v.date_vente) = date_trunc('month', CURRENT_DATE)), 0) as ca_mois,
        COALESCE(SUM(vl.quantite * (vl.prix_unitaire - COALESCE(vl.cout_unitaire, 0))) FILTER (WHERE date_trunc('month', v.date_vente) = date_trunc('month', CURRENT_DATE)), 0) as marge_mois
       FROM ventes v
       JOIN vente_lignes vl ON vl.vente_id = v.id
       WHERE v.activite_id = $1 AND v.statut = 'confirmee'`,
      [activiteId]
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
       LEFT JOIN ingredients i ON vl.article_type = 'ingredient' AND i.id = vl.article_id
       WHERE v.activite_id = $1 AND v.statut = 'confirmee'
         AND date_trunc('month', v.date_vente) = date_trunc('month', CURRENT_DATE)
       GROUP BY vl.article_type, vl.article_id, nom
       ORDER BY total_ca DESC LIMIT 10`,
      [activiteId]
    );

    const repartitionRes = await pool.query(
      `SELECT v.type_vente, SUM(vl.quantite * vl.prix_unitaire) as total
       FROM ventes v
       JOIN vente_lignes vl ON vl.vente_id = v.id
       WHERE v.activite_id = $1 AND v.statut = 'confirmee'
         AND date_trunc('month', v.date_vente) = date_trunc('month', CURRENT_DATE)
       GROUP BY v.type_vente`,
      [activiteId]
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

// ─── Client — Prestataires actifs pour une entreprise ──────────────────────

const listPrestatairesClient = async (req, res) => {
  try {
    const cid = clientId(req);
    // Get entreprise id for this client
    const peRes = await pool.query(
      'SELECT id FROM profil_entreprise WHERE client_id = $1 LIMIT 1',
      [cid]
    );
    if (!peRes.rows.length) {
      // Return all active prestataires if no entreprise profile found
      const r = await pool.query('SELECT * FROM prestataires_livraison WHERE actif = true ORDER BY nom');
      return res.json(r.rows);
    }
    const entrepriseId = peRes.rows[0].id;
    const r = await pool.query(
      `SELECT pl.* FROM prestataires_livraison pl
       JOIN entreprise_prestataires ep ON ep.prestataire_id = pl.id
       WHERE ep.entreprise_id = $1 AND pl.actif = true
       ORDER BY pl.nom`,
      [entrepriseId]
    );
    // Fallback: if no activation, return all active
    if (!r.rows.length) {
      const all = await pool.query('SELECT * FROM prestataires_livraison WHERE actif = true ORDER BY nom');
      return res.json(all.rows);
    }
    res.json(r.rows);
  } catch (e) {
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
        COALESCE(lt.quantite * lt.prix_unitaire, 0) as valeur
       FROM labo_transfers lt
       LEFT JOIN ingredients i ON i.id = lt.ingredient_id
       LEFT JOIN produits p ON p.id = lt.produit_id
       LEFT JOIN unites u ON i.unite_id = u.id
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
    })));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const laboVentesStats = async (req, res) => {
  try {
    const { laboId, period = 'month' } = req.query;
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
       LEFT JOIN ingredients i ON i.id = lt.ingredient_id
       LEFT JOIN produits p ON p.id = lt.produit_id
       WHERE lt.labo_id = $1 AND lt.prix_unitaire IS NOT NULL
         AND date_trunc('month', lt.date_transfert) = date_trunc('month', CURRENT_DATE)
       GROUP BY nom
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

module.exports = {
  listPrestataires, createPrestataire, updatePrestataire, deletePrestataire, setEntreprisePrestataires,
  listArticlesVendables, upsertArticleVendable, updateArticleVendable, deleteArticleVendable,
  listVentes, getVente, createVente, annulerVente, statsVentes,
  listPrestatairesClient,
  laboVentes, laboVentesStats,
};
