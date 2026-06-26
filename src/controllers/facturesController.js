const pool = require('../config/database');

/**
 * GET /api/factures
 * Query params: activiteId, laboId, startDate, endDate, fournisseurId, ref, limit, offset
 */
const list = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  const {
    activiteId, laboId, startDate, endDate,
    fournisseurId, ref,
    limit = 50, offset = 0,
  } = req.query;

  const params = [clientId];
  const conds = [];

  if (activiteId) {
    params.push(parseInt(activiteId));
    conds.push(`f.activite_id = $${params.length}`);
  }
  if (laboId) {
    params.push(parseInt(laboId));
    conds.push(`f.labo_id = $${params.length}`);
  }
  if (startDate) {
    params.push(startDate);
    conds.push(`f.date_facture >= $${params.length}`);
  }
  if (endDate) {
    params.push(endDate);
    conds.push(`f.date_facture <= $${params.length}`);
  }
  if (fournisseurId) {
    params.push(parseInt(fournisseurId));
    conds.push(`f.fournisseur_id = $${params.length}`);
  }
  if (ref) {
    params.push(`%${ref}%`);
    conds.push(`f.ref_facture ILIKE $${params.length}`);
  }

  const where = conds.length > 0 ? ' AND ' + conds.join(' AND ') : '';

  const lim = Math.min(parseInt(limit) || 50, 200);
  const off = parseInt(offset) || 0;
  params.push(lim, off);

  try {
    const result = await pool.query(
      `SELECT
         f.id,
         f.ref_facture,
         f.date_facture,
         f.fournisseur_id,
         fo.nom AS fournisseur_nom,
         f.activite_id,
         a.nom AS activite_nom,
         f.labo_id,
         lb.nom AS labo_nom,
         f.type_source,
         f.montant_ht,
         f.montant_tva,
         f.montant_ttc,
         f.notes,
         f.created_at
       FROM factures f
       LEFT JOIN fournisseurs fo ON fo.id = f.fournisseur_id
       LEFT JOIN activites a ON a.id = f.activite_id
       LEFT JOIN labos lb ON lb.id = f.labo_id
       WHERE f.client_id = $1${where}
       ORDER BY f.date_facture DESC, f.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    res.json(result.rows.map((r) => ({
      id: r.id,
      refFacture: r.ref_facture,
      dateFacture: r.date_facture,
      fournisseurId: r.fournisseur_id,
      fournisseurNom: r.fournisseur_nom,
      activiteId: r.activite_id,
      activiteNom: r.activite_nom,
      laboId: r.labo_id,
      laboNom: r.labo_nom,
      typeSource: r.type_source,
      montantHT: parseFloat(r.montant_ht),
      montantTva: parseFloat(r.montant_tva),
      montantTTC: parseFloat(r.montant_ttc),
      notes: r.notes,
      createdAt: r.created_at,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

/**
 * GET /api/factures/:id/lignes
 * Returns the stock lines linked to this facture.
 */
const getLignes = async (req, res) => {
  const clientId = req.user.gerant_parent_id || req.user.id;
  const { id } = req.params;

  try {
    // Verify ownership
    const check = await pool.query(
      `SELECT id, activite_id, labo_id FROM factures WHERE id = $1 AND client_id = $2`,
      [id, clientId]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ message: 'Facture introuvable' });
    }
    const facture = check.rows[0];

    let rows = [];

    if (facture.activite_id) {
      // stock_entreprise_daily
      const r = await pool.query(
        `SELECT sed.id, sed.date_appro, sed.quantite, sed.prix_unitaire, sed.taux_tva, sed.prix_unitaire_tva,
                sed.type_appro, sed.ref_facture,
                i.nom AS ingredient_nom, i.id AS ingredient_id,
                u.nom AS unite_nom,
                COALESCE(c.nom, 'Sans catégorie') AS categorie_nom,
                f.nom AS fournisseur_nom, sed.fournisseur_id,
                sed.activite_id, a.nom AS activite_nom
         FROM stock_entreprise_daily sed
         JOIN articles i ON i.id = sed.ingredient_id
         JOIN unites u ON u.id = i.unite_id
         LEFT JOIN categories c ON c.id = i.categorie_id
         LEFT JOIN fournisseurs f ON f.id = sed.fournisseur_id
         LEFT JOIN activites a ON a.id = sed.activite_id
         WHERE sed.facture_id = $1
         ORDER BY sed.date_appro, i.nom`,
        [id]
      );
      rows = r.rows;
    } else if (facture.labo_id) {
      // stock_labo_daily
      const r = await pool.query(
        `SELECT sld.id, sld.date_appro, sld.quantite, sld.prix_unitaire, sld.taux_tva, sld.prix_unitaire_tva,
                sld.type_appro, sld.ref_facture,
                i.nom AS ingredient_nom, i.id AS ingredient_id,
                u.nom AS unite_nom,
                COALESCE(c.nom, 'Sans catégorie') AS categorie_nom,
                f.nom AS fournisseur_nom, sld.fournisseur_id,
                NULL::int AS activite_id, NULL::text AS activite_nom
         FROM stock_labo_daily sld
         JOIN articles i ON i.id = sld.ingredient_id
         JOIN unites u ON u.id = i.unite_id
         LEFT JOIN categories c ON c.id = i.categorie_id
         LEFT JOIN fournisseurs f ON f.id = sld.fournisseur_id
         WHERE sld.facture_id = $1
         ORDER BY sld.date_appro, i.nom`,
        [id]
      );
      rows = r.rows;
    }

    res.json(rows.map((r) => ({
      id: r.id,
      dateAppro: r.date_appro,
      quantite: r.quantite != null ? parseFloat(r.quantite) : null,
      prixUnitaire: r.prix_unitaire != null ? parseFloat(r.prix_unitaire) : null,
      tauxTva: r.taux_tva != null ? parseFloat(r.taux_tva) : null,
      prixUnitaireTva: r.prix_unitaire_tva != null ? parseFloat(r.prix_unitaire_tva) : null,
      typeAppro: r.type_appro,
      refFacture: r.ref_facture,
      ingredientId: r.ingredient_id,
      ingredientNom: r.ingredient_nom,
      uniteNom: r.unite_nom,
      categorieNom: r.categorie_nom,
      fournisseurId: r.fournisseur_id,
      fournisseurNom: r.fournisseur_nom,
      activiteId: r.activite_id,
      activiteNom: r.activite_nom,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { list, getLignes };
