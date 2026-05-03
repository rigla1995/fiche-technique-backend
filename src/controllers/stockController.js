const pool = require('../config/database');
const ExcelJS = require('exceljs');

const todayStr = () => new Date().toISOString().split('T')[0];
const isoDate = (d) => {
  if (!d) return null;
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
};

// ─── Stock Client (independant) ──────────────────────────────────────────────

const getStockClient = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT i.id as ingredient_id, i.nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie,
              COALESCE(SUM(scd.quantite) FILTER (WHERE date_trunc('month', scd.date_appro) = date_trunc('month', CURRENT_DATE)), 0) as total_quantite,
              (SELECT scd2.prix_unitaire FROM stock_client_daily scd2
               WHERE scd2.client_id = $1 AND scd2.ingredient_id = i.id
               ORDER BY scd2.date_appro DESC LIMIT 1) as prix_unitaire,
              (SELECT scd2.date_appro FROM stock_client_daily scd2
               WHERE scd2.client_id = $1 AND scd2.ingredient_id = i.id
               ORDER BY scd2.date_appro DESC LIMIT 1) as date_appro,
              (SELECT scd2.fournisseur_id FROM stock_client_daily scd2
               WHERE scd2.client_id = $1 AND scd2.ingredient_id = i.id
               ORDER BY scd2.date_appro DESC LIMIT 1) as last_fournisseur_id,
              (SELECT scd2.ref_facture FROM stock_client_daily scd2
               WHERE scd2.client_id = $1 AND scd2.ingredient_id = i.id
               ORDER BY scd2.date_appro DESC LIMIT 1) as last_ref_facture
       FROM client_ingredient_selections cis
       JOIN ingredients i ON cis.ingredient_id = i.id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       LEFT JOIN stock_client_daily scd ON scd.ingredient_id = i.id AND scd.client_id = $1
       WHERE cis.client_id = $1
       GROUP BY i.id, i.nom, u.nom, c.nom
       ORDER BY categorie NULLS LAST, i.nom`,
      [req.user.id]
    );
    res.json(result.rows.map((row) => ({
      ingredientId: row.ingredient_id,
      nom: row.nom,
      unite: row.unite_nom,
      categorie: row.categorie,
      prixUnitaire: row.prix_unitaire !== null ? parseFloat(row.prix_unitaire) : null,
      quantite: parseFloat(row.total_quantite),
      totalQuantite: parseFloat(row.total_quantite),
      dateAppro: isoDate(row.date_appro),
      seuilMin: null,
      lastFournisseurId: row.last_fournisseur_id ?? null,
      lastRefFacture: row.last_ref_facture ?? null,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateStockClient = async (req, res) => {
  const { ingredientId } = req.params;
  const { quantite, prixUnitaire, dateAppro, fournisseurId, refFacture } = req.body;
  const da = dateAppro || todayStr();

  if (quantite !== null && quantite !== undefined && parseFloat(quantite) < 0)
    return res.status(400).json({ message: 'Quantité invalide' });

  try {
    await pool.query(
      `INSERT INTO stock_client_daily
         (client_id, ingredient_id, date_appro, quantite, prix_unitaire, type_appro, fournisseur_id, ref_facture, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'manuel', $6, $7, NOW())
       ON CONFLICT (client_id, ingredient_id, date_appro, type_appro)
       DO UPDATE SET quantite = $4, prix_unitaire = $5, fournisseur_id = $6, ref_facture = $7, updated_at = NOW()`,
      [req.user.id, ingredientId, da, quantite ?? null, prixUnitaire ?? null,
       fournisseurId ?? null, refFacture ?? null]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getStockClientSummary = async (req, res) => {
  try {
    const [fourn, appro] = await Promise.all([
      pool.query(`SELECT COUNT(*) FROM fournisseurs WHERE client_id = $1`, [req.user.id]),
      pool.query(
        `SELECT EXISTS (
           SELECT 1 FROM stock_client_daily WHERE client_id = $1
         ) AS has_appros`,
        [req.user.id]
      ),
    ]);
    res.json({
      hasFournisseurs: parseInt(fourn.rows[0].count) > 0,
      hasAppros: appro.rows[0].has_appros ?? false,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── Stock Entreprise ──────────────────────────────────────────────────────

const getStockEntreprise = async (req, res) => {
  const { activiteId } = req.params;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité introuvable' });

    const result = await pool.query(
      `SELECT i.id as ingredient_id, i.nom, u.nom as unite_nom,
              COALESCE(c.nom, 'Sans catégorie') as categorie,
              ais.seuil_min,
              COALESCE(SUM(sed.quantite) FILTER (WHERE date_trunc('month', sed.date_appro) = date_trunc('month', CURRENT_DATE)), 0) as total_quantite,
              (SELECT sed2.prix_unitaire FROM stock_entreprise_daily sed2
               WHERE sed2.activite_id = $1 AND sed2.ingredient_id = i.id
               ORDER BY sed2.date_appro DESC LIMIT 1) as prix_unitaire,
              (SELECT sed2.date_appro FROM stock_entreprise_daily sed2
               WHERE sed2.activite_id = $1 AND sed2.ingredient_id = i.id
               ORDER BY sed2.date_appro DESC LIMIT 1) as date_appro,
              (SELECT sed2.fournisseur_id FROM stock_entreprise_daily sed2
               WHERE sed2.activite_id = $1 AND sed2.ingredient_id = i.id
               ORDER BY sed2.date_appro DESC LIMIT 1) as last_fournisseur_id,
              (SELECT sed2.ref_facture FROM stock_entreprise_daily sed2
               WHERE sed2.activite_id = $1 AND sed2.ingredient_id = i.id
               ORDER BY sed2.date_appro DESC LIMIT 1) as last_ref_facture,
              (SELECT sed2.type_appro FROM stock_entreprise_daily sed2
               WHERE sed2.activite_id = $1 AND sed2.ingredient_id = i.id
               ORDER BY sed2.date_appro DESC LIMIT 1) as last_type_appro
       FROM activite_ingredient_selections ais
       JOIN ingredients i ON ais.ingredient_id = i.id
       JOIN unites u ON i.unite_id = u.id
       LEFT JOIN categories c ON i.categorie_id = c.id
       LEFT JOIN stock_entreprise_daily sed ON sed.ingredient_id = i.id AND sed.activite_id = $1
       WHERE ais.activite_id = $1
       GROUP BY i.id, i.nom, u.nom, c.nom, ais.seuil_min
       ORDER BY categorie NULLS LAST, i.nom`,
      [activiteId]
    );
    res.json(result.rows.map((row) => ({
      ingredientId: row.ingredient_id,
      nom: row.nom,
      unite: row.unite_nom,
      categorie: row.categorie,
      seuilMin: row.seuil_min !== null ? parseFloat(row.seuil_min) : null,
      prixUnitaire: row.prix_unitaire !== null ? parseFloat(row.prix_unitaire) : null,
      quantite: parseFloat(row.total_quantite),
      totalQuantite: parseFloat(row.total_quantite),
      dateAppro: isoDate(row.date_appro),
      lastFournisseurId: row.last_fournisseur_id ?? null,
      lastRefFacture: row.last_ref_facture ?? null,
      lastTypeAppro: row.last_type_appro ?? null,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateStockEntreprise = async (req, res) => {
  const { activiteId, ingredientId } = req.params;
  const { quantite, prixUnitaire, dateAppro, fournisseurId, refFacture } = req.body;
  const da = dateAppro || todayStr();

  if (quantite !== null && quantite !== undefined && parseFloat(quantite) < 0)
    return res.status(400).json({ message: 'Quantité invalide' });

  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité introuvable' });

    await pool.query(
      `INSERT INTO stock_entreprise_daily
         (activite_id, ingredient_id, date_appro, quantite, prix_unitaire, type_appro, fournisseur_id, ref_facture, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'manuel', $6, $7, NOW())
       ON CONFLICT (activite_id, ingredient_id, date_appro, type_appro)
       DO UPDATE SET quantite = $4, prix_unitaire = $5, fournisseur_id = $6, ref_facture = $7, updated_at = NOW()`,
      [activiteId, ingredientId, da, quantite ?? null, prixUnitaire ?? null,
       fournisseurId ?? null, refFacture ?? null]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const updateSeuilMin = async (req, res) => {
  const { activiteId, ingredientId } = req.params;
  const { seuilMin } = req.body;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité introuvable' });

    await pool.query(
      `UPDATE activite_ingredient_selections
       SET seuil_min = $1
       WHERE activite_id = $2 AND ingredient_id = $3`,
      [seuilMin ?? null, activiteId, ingredientId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── History ──────────────────────────────────────────────────────────────────

const getHistoryClient = async (req, res) => {
  const { ingredientId } = req.params;
  try {
    const result = await pool.query(
      `SELECT scd.date_appro, scd.quantite, scd.prix_unitaire, scd.type_appro,
              scd.ref_facture, f.nom as fournisseur_nom, scd.updated_at
       FROM stock_client_daily scd
       LEFT JOIN fournisseurs f ON f.id = scd.fournisseur_id
       WHERE scd.client_id = $1 AND scd.ingredient_id = $2
       ORDER BY scd.date_appro DESC
       LIMIT 5`,
      [req.user.id, ingredientId]
    );
    res.json(result.rows.map(mapHistEntry));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

const getHistoryEntreprise = async (req, res) => {
  const { activiteId, ingredientId } = req.params;
  try {
    const check = await pool.query(
      `SELECT a.id FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2`,
      [activiteId, req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité introuvable' });

    const result = await pool.query(
      `SELECT sed.date_appro, sed.quantite, sed.prix_unitaire, sed.type_appro,
              sed.ref_facture, f.nom as fournisseur_nom, sed.updated_at
       FROM stock_entreprise_daily sed
       LEFT JOIN fournisseurs f ON f.id = sed.fournisseur_id
       WHERE sed.activite_id = $1 AND sed.ingredient_id = $2
       ORDER BY sed.date_appro DESC
       LIMIT 5`,
      [activiteId, ingredientId]
    );
    res.json(result.rows.map(mapHistEntry));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── Historique Approvisionnement ─────────────────────────────────────────────

const getHistoriqueAppro = async (req, res) => {
  const { activiteId, franchiseGroup, activiteIds: activiteIdsParam, entType, ingredientId, categorieId, startDate, endDate, fournisseurId, refFacture } = req.query;
  const currentYear = new Date().getFullYear();

  try {
    if (activiteId || franchiseGroup || activiteIdsParam || entType) {
      // Resolve activiteIds list
      let activiteIds = [];
      if (activiteId) {
        const check = await pool.query(
          `SELECT a.id FROM activites a
           JOIN profil_entreprise pe ON a.entreprise_id = pe.id
           WHERE a.id = $1 AND pe.client_id = $2`,
          [activiteId, req.user.id]
        );
        if (check.rows.length === 0) return res.status(404).json({ message: 'Activité introuvable' });
        activiteIds = [activiteId];
      } else if (franchiseGroup) {
        const gRes = await pool.query(
          `SELECT a.id FROM activites a
           JOIN profil_entreprise pe ON a.entreprise_id = pe.id
           WHERE pe.client_id = $1 AND a.franchise_group = $2`,
          [req.user.id, franchiseGroup]
        );
        activiteIds = gRes.rows.map((r) => r.id);
        if (activiteIds.length === 0) return res.json([]);
      } else if (activiteIdsParam) {
        // Comma-separated list of activiteIds
        const requested = activiteIdsParam.split(',').map(Number).filter(Boolean);
        const check = await pool.query(
          `SELECT a.id FROM activites a
           JOIN profil_entreprise pe ON a.entreprise_id = pe.id
           WHERE a.id = ANY($1) AND pe.client_id = $2`,
          [requested, req.user.id]
        );
        activiteIds = check.rows.map((r) => r.id);
        if (activiteIds.length === 0) return res.json([]);
      } else if (entType) {
        // All activities of a given type for this client
        const typeFilter = entType === 'franchise' ? `a.type = 'franchise'` : `(a.type = 'distincte' OR a.type IS NULL)`;
        const allRes = await pool.query(
          `SELECT a.id FROM activites a
           JOIN profil_entreprise pe ON a.entreprise_id = pe.id
           WHERE pe.client_id = $1 AND ${typeFilter}`,
          [req.user.id]
        );
        activiteIds = allRes.rows.map((r) => r.id);
        if (activiteIds.length === 0) return res.json([]);
      }

      const idList = activiteIds.map((_, i) => `$${i + 1}`).join(',');
      const params = [...activiteIds, currentYear];
      let extraWhere = '';
      if (ingredientId) { params.push(ingredientId); extraWhere += ` AND sed.ingredient_id = $${params.length}`; }
      else if (categorieId) { params.push(categorieId); extraWhere += ` AND i.categorie_id = $${params.length}`; }
      if (startDate) { params.push(startDate); extraWhere += ` AND sed.date_appro >= $${params.length}`; }
      if (endDate) { params.push(endDate); extraWhere += ` AND sed.date_appro <= $${params.length}`; }
      if (fournisseurId) { params.push(fournisseurId); extraWhere += ` AND sed.fournisseur_id = $${params.length}`; }
      if (refFacture) { params.push(`%${refFacture}%`); extraWhere += ` AND sed.ref_facture ILIKE $${params.length}`; }

      const result = await pool.query(
        `SELECT sed.id, sed.activite_id, sed.date_appro, sed.quantite, sed.prix_unitaire, sed.type_appro,
                sed.ref_facture, sed.fournisseur_id, f.nom as fournisseur_nom, sed.updated_at,
                i.id as ingredient_id, i.nom as ingredient_nom, u.nom as unite_nom,
                COALESCE(c.nom, 'Sans catégorie') as categorie_nom
         FROM stock_entreprise_daily sed
         JOIN ingredients i ON i.id = sed.ingredient_id
         JOIN unites u ON i.unite_id = u.id
         LEFT JOIN categories c ON i.categorie_id = c.id
         LEFT JOIN fournisseurs f ON f.id = sed.fournisseur_id
         WHERE sed.activite_id IN (${idList}) AND EXTRACT(YEAR FROM sed.date_appro) = $${activiteIds.length + 1}${extraWhere}
         ORDER BY sed.date_appro DESC, i.nom`,
        params
      );
      res.json(result.rows.map(mapHistoriqueEntry));
    } else {
      const params = [req.user.id, currentYear];
      let extraWhere = '';
      if (ingredientId) { params.push(ingredientId); extraWhere += ` AND scd.ingredient_id = $${params.length}`; }
      else if (categorieId) { params.push(categorieId); extraWhere += ` AND i.categorie_id = $${params.length}`; }
      if (startDate) { params.push(startDate); extraWhere += ` AND scd.date_appro >= $${params.length}`; }
      if (endDate) { params.push(endDate); extraWhere += ` AND scd.date_appro <= $${params.length}`; }
      if (fournisseurId) { params.push(fournisseurId); extraWhere += ` AND scd.fournisseur_id = $${params.length}`; }
      if (refFacture) { params.push(`%${refFacture}%`); extraWhere += ` AND scd.ref_facture ILIKE $${params.length}`; }

      const result = await pool.query(
        `SELECT scd.id, scd.date_appro, scd.quantite, scd.prix_unitaire, scd.type_appro,
                scd.ref_facture, scd.fournisseur_id, f.nom as fournisseur_nom, scd.updated_at,
                i.id as ingredient_id, i.nom as ingredient_nom, u.nom as unite_nom,
                COALESCE(c.nom, 'Sans catégorie') as categorie_nom
         FROM stock_client_daily scd
         JOIN ingredients i ON i.id = scd.ingredient_id
         JOIN unites u ON i.unite_id = u.id
         LEFT JOIN categories c ON i.categorie_id = c.id
         LEFT JOIN fournisseurs f ON f.id = scd.fournisseur_id
         WHERE scd.client_id = $1 AND EXTRACT(YEAR FROM scd.date_appro) = $2${extraWhere}
         ORDER BY scd.date_appro DESC, i.nom`,
        params
      );
      res.json(result.rows.map(mapHistoriqueEntry));
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// PUT /api/stock/historique/:id  (activiteId required for entreprise, clientId for independant)
const updateHistoriqueEntry = async (req, res) => {
  const { id } = req.params;
  const { quantite, prixUnitaire, fournisseurId, refFacture, isEntreprise } = req.body;
  try {
    if (isEntreprise) {
      // Verify ownership
      const check = await pool.query(
        `SELECT sed.id, sed.activite_id, sed.ingredient_id, sed.quantite as old_quantite, sed.type_appro, sed.date_appro
         FROM stock_entreprise_daily sed
         JOIN activites a ON a.id = sed.activite_id
         JOIN profil_entreprise pe ON pe.id = a.entreprise_id
         WHERE sed.id = $1 AND pe.client_id = $2`,
        [id, req.user.id]
      );
      if (check.rows.length === 0) return res.status(404).json({ message: 'Entrée introuvable' });
      const entry = check.rows[0];
      await pool.query(
        `UPDATE stock_entreprise_daily SET quantite=$1, prix_unitaire=$2, fournisseur_id=$3, ref_facture=$4, updated_at=NOW()
         WHERE id=$5`,
        [quantite ?? null, prixUnitaire ?? null, fournisseurId || null, refFacture || null, id]
      );
      // If transfert, adjust labo stock
      if (entry.type_appro === 'transfert') {
        const oldQty = parseFloat(entry.old_quantite) || 0;
        const newQty = parseFloat(quantite) || 0;
        const delta = oldQty - newQty;
        if (delta !== 0) {
          await pool.query(
            `UPDATE stock_labo_daily SET quantite = COALESCE(quantite,0) + $1, updated_at=NOW()
             WHERE ingredient_id=$2 AND date_appro=$3 AND labo_id=(
               SELECT l.id FROM labos l JOIN profil_entreprise pe ON pe.id=l.entreprise_id
               JOIN activites a ON a.entreprise_id=pe.id WHERE a.id=$4 LIMIT 1)`,
            [delta, entry.ingredient_id, entry.date_appro, entry.activite_id]
          );
        }
      }
    } else {
      const check = await pool.query(
        `SELECT id FROM stock_client_daily WHERE id=$1 AND client_id=$2`,
        [id, req.user.id]
      );
      if (check.rows.length === 0) return res.status(404).json({ message: 'Entrée introuvable' });
      await pool.query(
        `UPDATE stock_client_daily SET quantite=$1, prix_unitaire=$2, fournisseur_id=$3, ref_facture=$4, updated_at=NOW()
         WHERE id=$5`,
        [quantite ?? null, prixUnitaire ?? null, fournisseurId || null, refFacture || null, id]
      );
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// DELETE /api/stock/historique/:id
const deleteHistoriqueEntry = async (req, res) => {
  const { id } = req.params;
  const { isEntreprise } = req.query;
  try {
    if (isEntreprise === 'true') {
      const check = await pool.query(
        `SELECT sed.id, sed.activite_id, sed.ingredient_id, sed.quantite, sed.type_appro, sed.date_appro
         FROM stock_entreprise_daily sed
         JOIN activites a ON a.id = sed.activite_id
         JOIN profil_entreprise pe ON pe.id = a.entreprise_id
         WHERE sed.id = $1 AND pe.client_id = $2`,
        [id, req.user.id]
      );
      if (check.rows.length === 0) return res.status(404).json({ message: 'Entrée introuvable' });
      const entry = check.rows[0];
      await pool.query('DELETE FROM stock_entreprise_daily WHERE id=$1', [id]);
      // If transfert, restore labo stock
      if (entry.type_appro === 'transfert') {
        const qty = parseFloat(entry.quantite) || 0;
        await pool.query(
          `UPDATE stock_labo_daily SET quantite = COALESCE(quantite,0) + $1, updated_at=NOW()
           WHERE ingredient_id=$2 AND date_appro=$3 AND labo_id=(
             SELECT l.id FROM labos l JOIN profil_entreprise pe ON pe.id=l.entreprise_id
             JOIN activites a ON a.entreprise_id=pe.id WHERE a.id=$4 LIMIT 1)`,
          [qty, entry.ingredient_id, entry.date_appro, entry.activite_id]
        );
      }
    } else {
      const check = await pool.query(
        `SELECT id FROM stock_client_daily WHERE id=$1 AND client_id=$2`,
        [id, req.user.id]
      );
      if (check.rows.length === 0) return res.status(404).json({ message: 'Entrée introuvable' });
      await pool.query('DELETE FROM stock_client_daily WHERE id=$1', [id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

function mapHistEntry(r) {
  return {
    dateAppro: isoDate(r.date_appro),
    quantite: r.quantite !== null ? parseFloat(r.quantite) : null,
    prixUnitaire: r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : null,
    typeAppro: r.type_appro || 'manuel',
    fournisseurNom: r.fournisseur_nom || null,
    refFacture: r.ref_facture || null,
    updatedAt: r.updated_at,
  };
}

function mapHistoriqueEntry(r) {
  return {
    id: r.id,
    activiteId: r.activite_id || null,
    dateAppro: isoDate(r.date_appro),
    quantite: r.quantite !== null ? parseFloat(r.quantite) : null,
    prixUnitaire: r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : null,
    typeAppro: r.type_appro || 'manuel',
    fournisseurId: r.fournisseur_id || null,
    fournisseurNom: r.fournisseur_nom || null,
    refFacture: r.ref_facture || null,
    updatedAt: r.updated_at,
    ingredientId: r.ingredient_id,
    ingredientNom: r.ingredient_nom,
    uniteNom: r.unite_nom,
    categorieNom: r.categorie_nom,
  };
}

// ─── Duplicate Franchise ──────────────────────────────────────────────────────

const duplicateStockToFranchise = async (req, res) => {
  const { activiteId } = req.params;
  try {
    const check = await pool.query(
      `SELECT a.id, a.entreprise_id, a.franchise_group FROM activites a
       JOIN profil_entreprise pe ON a.entreprise_id = pe.id
       WHERE a.id = $1 AND pe.client_id = $2 AND a.type = 'franchise'`,
      [activiteId, req.user.id]
    );
    if (check.rows.length === 0)
      return res.status(404).json({ message: 'Activité franchise introuvable' });

    const { entreprise_id: entrepriseId, franchise_group: franchiseGroup } = check.rows[0];

    const source = await pool.query(
      `SELECT DISTINCT ON (ingredient_id) ingredient_id, quantite, prix_unitaire, date_appro
       FROM stock_entreprise_daily WHERE activite_id = $1 AND type_appro = 'manuel'
       ORDER BY ingredient_id, date_appro DESC`,
      [activiteId]
    );

    const others = await pool.query(
      `SELECT id FROM activites
       WHERE entreprise_id = $1 AND type = 'franchise' AND franchise_group = $2 AND id != $3`,
      [entrepriseId, franchiseGroup, activiteId]
    );

    for (const act of others.rows) {
      const targetSel = await pool.query(
        'SELECT ingredient_id FROM activite_ingredient_selections WHERE activite_id = $1',
        [act.id]
      );
      const targetIngSet = new Set(targetSel.rows.map((r) => r.ingredient_id));
      for (const row of source.rows) {
        if (!targetIngSet.has(row.ingredient_id)) continue;
        await pool.query(
          `INSERT INTO stock_entreprise_daily
             (activite_id, ingredient_id, date_appro, quantite, prix_unitaire, type_appro, updated_at)
           VALUES ($1, $2, $3, $4, $5, 'manuel', NOW())
           ON CONFLICT (activite_id, ingredient_id, date_appro, type_appro)
           DO UPDATE SET quantite = $4, prix_unitaire = $5, updated_at = NOW()`,
          [act.id, row.ingredient_id, row.date_appro, row.quantite, row.prix_unitaire]
        );
      }
    }

    res.json({ duplicatedTo: others.rows.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ─── Export Excel Historique Appro ───────────────────────────────────────────
const exportHistoriqueExcel = async (req, res) => {
  const { activiteId, franchiseGroup, activiteIds: activiteIdsParam, entType, ingredientId, categorieId, startDate, endDate, fournisseurId, refFacture, selectedIds: selectedIdsParam } = req.query;
  const selectedSet = new Set(selectedIdsParam ? selectedIdsParam.split(',').map(Number).filter(Boolean) : []);
  console.log('[exportHistoriqueExcel] selectedIdsParam:', selectedIdsParam, '| selectedSet size:', selectedSet.size);
  const currentYear = new Date().getFullYear();
  const isEntreprise = !!(activiteId || franchiseGroup || activiteIdsParam || entType);

  try {
    let rows = [];
    let activiteNames = {};

    if (isEntreprise) {
      let activiteIds = [];
      if (activiteId) {
        activiteIds = [activiteId];
      } else if (franchiseGroup) {
        const gRes = await pool.query(
          `SELECT a.id FROM activites a JOIN profil_entreprise pe ON a.entreprise_id = pe.id WHERE pe.client_id = $1 AND a.franchise_group = $2`,
          [req.user.id, franchiseGroup]
        );
        activiteIds = gRes.rows.map((r) => r.id);
      } else if (activiteIdsParam) {
        activiteIds = activiteIdsParam.split(',').map(Number).filter(Boolean);
      } else if (entType) {
        const typeFilter = entType === 'franchise' ? `a.type = 'franchise'` : `(a.type = 'distincte' OR a.type IS NULL)`;
        const allRes = await pool.query(`SELECT a.id FROM activites a JOIN profil_entreprise pe ON a.entreprise_id = pe.id WHERE pe.client_id = $1 AND ${typeFilter}`, [req.user.id]);
        activiteIds = allRes.rows.map((r) => r.id);
      }
      if (activiteIds.length === 0) return res.status(404).json({ message: 'Aucune activité' });

      // Load activite names
      const actRes = await pool.query('SELECT id, nom FROM activites WHERE id = ANY($1)', [activiteIds]);
      actRes.rows.forEach((r) => { activiteNames[r.id] = r.nom; });

      const idList = activiteIds.map((_, i) => `$${i + 1}`).join(',');
      const params = [...activiteIds, currentYear];
      let extraWhere = '';
      if (ingredientId) { params.push(ingredientId); extraWhere += ` AND sed.ingredient_id = $${params.length}`; }
      else if (categorieId) { params.push(categorieId); extraWhere += ` AND i.categorie_id = $${params.length}`; }
      if (startDate) { params.push(startDate); extraWhere += ` AND sed.date_appro >= $${params.length}`; }
      if (endDate) { params.push(endDate); extraWhere += ` AND sed.date_appro <= $${params.length}`; }
      if (fournisseurId) { params.push(fournisseurId); extraWhere += ` AND sed.fournisseur_id = $${params.length}`; }
      if (refFacture) { params.push(`%${refFacture}%`); extraWhere += ` AND sed.ref_facture ILIKE $${params.length}`; }
      const result = await pool.query(
        `SELECT sed.id, sed.activite_id, sed.date_appro, sed.quantite, sed.prix_unitaire, sed.type_appro,
                sed.ref_facture, f.nom as fournisseur_nom, i.nom as ingredient_nom,
                u.nom as unite_nom, COALESCE(c.nom, 'Sans catégorie') as categorie_nom
         FROM stock_entreprise_daily sed
         JOIN ingredients i ON i.id = sed.ingredient_id JOIN unites u ON i.unite_id = u.id
         LEFT JOIN categories c ON i.categorie_id = c.id LEFT JOIN fournisseurs f ON f.id = sed.fournisseur_id
         WHERE sed.activite_id IN (${idList}) AND EXTRACT(YEAR FROM sed.date_appro) = $${activiteIds.length + 1}${extraWhere}
         ORDER BY sed.date_appro DESC, i.nom`, params
      );
      rows = result.rows;
    } else {
      const params = [req.user.id, currentYear];
      let extraWhere = '';
      if (ingredientId) { params.push(ingredientId); extraWhere += ` AND scd.ingredient_id = $${params.length}`; }
      else if (categorieId) { params.push(categorieId); extraWhere += ` AND i.categorie_id = $${params.length}`; }
      if (startDate) { params.push(startDate); extraWhere += ` AND scd.date_appro >= $${params.length}`; }
      if (endDate) { params.push(endDate); extraWhere += ` AND scd.date_appro <= $${params.length}`; }
      if (fournisseurId) { params.push(fournisseurId); extraWhere += ` AND scd.fournisseur_id = $${params.length}`; }
      if (refFacture) { params.push(`%${refFacture}%`); extraWhere += ` AND scd.ref_facture ILIKE $${params.length}`; }
      const result = await pool.query(
        `SELECT scd.id, scd.date_appro, scd.quantite, scd.prix_unitaire, scd.type_appro,
                scd.ref_facture, f.nom as fournisseur_nom, i.nom as ingredient_nom,
                u.nom as unite_nom, COALESCE(c.nom, 'Sans catégorie') as categorie_nom
         FROM stock_client_daily scd
         JOIN ingredients i ON i.id = scd.ingredient_id JOIN unites u ON i.unite_id = u.id
         LEFT JOIN categories c ON i.categorie_id = c.id LEFT JOIN fournisseurs f ON f.id = scd.fournisseur_id
         WHERE scd.client_id = $1 AND EXTRACT(YEAR FROM scd.date_appro) = $2${extraWhere}
         ORDER BY scd.date_appro DESC, i.nom`, params
      );
      rows = result.rows;
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Fiche Technique App';
    const sheet = workbook.addWorksheet('Historique Appro', { pageSetup: { paperSize: 9, orientation: 'landscape' } });

    const BLUE = '1F3864'; const WHITE = 'FFFFFF'; const ORANGE = 'FF6B00'; const ALT = 'EEF4FF'; const GOLD = 'FFD700';
    const TITLE_BG = '2E4A7A';
    const thin = { style: 'thin', color: { argb: 'B8CCE4' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const hdrFont = { name: 'Calibri', bold: true, size: 10, color: { argb: WHITE } };
    const bodyFont = { name: 'Calibri', size: 10 };

    const cols = [
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Ingrédient', key: 'ing', width: 26 },
      { header: 'Catégorie', key: 'cat', width: 18 },
      { header: 'Quantité', key: 'qty', width: 11 },
      { header: 'Unité', key: 'unit', width: 9 },
      { header: 'Prix/DT', key: 'prix', width: 11 },
      { header: 'Coût total DT', key: 'cout', width: 14 },
      ...(isEntreprise ? [
        { header: 'Activité', key: 'act', width: 18 },
        { header: 'Fournisseur', key: 'fourn', width: 18 },
        { header: 'Réf. Facture', key: 'ref', width: 16 },
        { header: 'Type', key: 'type', width: 10 },
      ] : [
        { header: 'Fournisseur', key: 'fourn', width: 18 },
        { header: 'Réf. Facture', key: 'ref', width: 16 },
      ]),
    ];
    sheet.columns = cols.map((c) => ({ width: c.width }));

    // Title row
    const fmtD = (d) => d ? d.split('-').reverse().join('/') : '—';
    const titleText = `Historique Appro  —  DU : ${fmtD(startDate)}   AU : ${fmtD(endDate)}`;
    const titleRow = sheet.addRow([titleText, ...Array(cols.length - 1).fill('')]);
    sheet.mergeCells(1, 1, 1, cols.length);
    titleRow.getCell(1).font = { name: 'Calibri', bold: true, size: 13, color: { argb: WHITE } };
    titleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_BG } };
    titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    titleRow.height = 28;

    // Header row (now row 2)
    const hdrRow = sheet.addRow(cols.map((c) => c.header));
    hdrRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = hdrFont;
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLUE } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.border = border;
    });
    hdrRow.height = 22;
    sheet.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };

    if (rows.length > 0) console.log('[exportHistoriqueExcel] first row id:', rows[0].id, '| typeof:', typeof rows[0].id, '| isSelected:', selectedSet.has(Number(rows[0].id)));
    // Data rows
    let totalQty = 0; let totalCout = 0;
    rows.forEach((r, i) => {
      const qty = r.quantite !== null ? parseFloat(r.quantite) : 0;
      const prix = r.prix_unitaire !== null ? parseFloat(r.prix_unitaire) : 0;
      const cout = qty * prix;
      totalQty += qty; totalCout += cout;
      const isSelected = selectedSet.has(Number(r.id));
      const dateStr = r.date_appro ? new Date(r.date_appro).toISOString().slice(0, 10).split('-').reverse().join('/') : '';
      const rowData = [
        dateStr,
        r.ingredient_nom,
        r.categorie_nom,
        qty,
        r.unite_nom,
        prix,
        cout,
        ...(isEntreprise ? [activiteNames[r.activite_id] || '', r.fournisseur_nom || '', r.ref_facture || '', r.type_appro || 'manuel'] : [r.fournisseur_nom || '', r.ref_facture || '']),
      ];
      const dataRow = sheet.addRow(rowData);
      const bg = isSelected ? ORANGE : (i % 2 === 0 ? WHITE : ALT);
      const txtColor = isSelected ? WHITE : '1a1a2e';
      // Use getCell loop to ensure ALL cells (including empty) get the fill
      for (let c = 1; c <= cols.length; c++) {
        const cell = dataRow.getCell(c);
        cell.font = { ...bodyFont, bold: isSelected, color: { argb: txtColor } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
        cell.border = border;
        cell.alignment = { vertical: 'middle', horizontal: c <= 3 ? 'left' : (c === 5 ? 'center' : 'right') };
      }
      const numFmt = '#,##0.000';
      dataRow.getCell(4).numFmt = numFmt;
      dataRow.getCell(6).numFmt = numFmt + ' "DT"';
      dataRow.getCell(7).numFmt = numFmt + ' "DT"';
      dataRow.height = 16;
    });

    // Total row
    const totalRow = sheet.addRow([
      'TOTAL', '', '',
      totalQty, '', '',
      totalCout,
      ...(isEntreprise ? ['', '', '', ''] : ['', '']),
    ]);
    totalRow.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = { name: 'Calibri', bold: true, size: 10 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GOLD } };
      cell.border = border;
      cell.alignment = { vertical: 'middle', horizontal: 'right' };
    });
    totalRow.getCell(1).alignment = { horizontal: 'left', vertical: 'middle' };
    totalRow.getCell(4).numFmt = '#,##0.000';
    totalRow.getCell(7).numFmt = '#,##0.000 "DT"';
    totalRow.height = 18;

    // Footer
    sheet.addRow([]);
    const footerRow = sheet.addRow([`Généré le ${new Date().toLocaleDateString('fr-TN', { dateStyle: 'long' })} — ${rows.length} enregistrement(s) — Prix en Dinars Tunisiens (DT)`]);
    footerRow.getCell(1).font = { name: 'Calibri', italic: true, size: 9, color: { argb: '888888' } };
    if (selectedSet.size > 0) {
      const noteRow = sheet.addRow([`⚠ ${selectedSet.size} appro(s) en surbrillance orange = sélectionnés`]);
      noteRow.getCell(1).font = { name: 'Calibri', bold: true, size: 9, color: { argb: ORANGE } };
    }

    const dateRange = startDate && endDate ? `${startDate}_${endDate}` : currentYear;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="Historique-Appro-${dateRange}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur génération Excel' });
  }
};

module.exports = {
  getStockClient, updateStockClient, getStockClientSummary,
  getStockEntreprise, updateStockEntreprise, updateSeuilMin,
  getHistoryClient, getHistoryEntreprise,
  getHistoriqueAppro, updateHistoriqueEntry, deleteHistoriqueEntry,
  duplicateStockToFranchise,
  exportHistoriqueExcel,
};
