const pool = require('../config/database');

// ── Ownership guard helpers ──────────────────────────────────────────────────

const getActiviteIds = async (clientId) => {
  const res = await pool.query(
    `SELECT a.id FROM activites a
     JOIN profil_entreprise pe ON pe.id = a.entreprise_id
     WHERE pe.client_id = $1`,
    [clientId]
  );
  return res.rows.map((r) => r.id);
};

const getLaboIds = async (clientId) => {
  const res = await pool.query(
    `SELECT l.id FROM labos l
     JOIN profil_entreprise pe ON pe.id = l.entreprise_id
     WHERE pe.client_id = $1`,
    [clientId]
  );
  return res.rows.map((r) => r.id);
};

// ── Rapport Pertes ────────────────────────────────────────────────────────────

const getRapportPertes = async (req, res) => {
  const { dateFrom, dateTo, categorieId, activiteId } = req.query;
  const clientId = req.user.id;
  const isEntreprise = req.user.compteType === 'entreprise';

  try {
    let rows = [];

    if (isEntreprise) {
      const activiteIds = activiteId
        ? [parseInt(activiteId)]
        : await getActiviteIds(clientId);

      if (activiteIds.length === 0) return res.json({ rows: [], byCategorie: [], byMois: [], byType: [] });

      const params = [];
      const wheres = [];
      let pIdx = 1;

      if (dateFrom)    { wheres.push(`p.date_perte >= $${pIdx++}`); params.push(dateFrom); }
      if (dateTo)      { wheres.push(`p.date_perte <= $${pIdx++}`); params.push(dateTo); }
      if (categorieId) { wheres.push(`c.id = $${pIdx++}`); params.push(categorieId); }

      const actParams = activiteIds.map((_, i) => `$${pIdx + i}`).join(',');
      const fullParams = [...params, ...activiteIds];
      const whereStr = wheres.length ? `AND ${wheres.join(' AND ')}` : '';

      const q = await pool.query(
        `SELECT
           i.nom AS ingredient_nom,
           COALESCE(c.nom, 'Non classé') AS categorie,
           u.nom AS unite,
           a.nom AS activite_nom,
           p.type_perte,
           p.date_perte,
           p.quantite,
           COALESCE(p.prix_unitaire, 0) AS prix_unitaire,
           p.quantite * COALESCE(p.prix_unitaire, 0) AS valeur
         FROM pertes p
         JOIN ingredients i ON i.id = p.ingredient_id
         JOIN unites u ON u.id = i.unite_id
         LEFT JOIN categories c ON c.id = i.categorie_id
         JOIN activites a ON a.id = p.activite_id
         WHERE p.activite_id IN (${actParams}) ${whereStr}
         ORDER BY p.date_perte DESC`,
        fullParams
      );
      rows = q.rows;
    } else {
      // Indépendant — client_pertes (alias: cp)
      const params = [clientId];
      const wheres = [`cp.client_id = $1`];
      let pIdx = 2;

      if (dateFrom)    { wheres.push(`cp.date_perte >= $${pIdx++}`); params.push(dateFrom); }
      if (dateTo)      { wheres.push(`cp.date_perte <= $${pIdx++}`); params.push(dateTo); }
      if (categorieId) { wheres.push(`c.id = $${pIdx++}`); params.push(categorieId); }

      const q = await pool.query(
        `SELECT
           i.nom AS ingredient_nom,
           COALESCE(c.nom, 'Non classé') AS categorie,
           u.nom AS unite,
           NULL AS activite_nom,
           cp.type_perte,
           cp.date_perte,
           cp.quantite,
           COALESCE(cp.prix_unitaire, 0) AS prix_unitaire,
           cp.quantite * COALESCE(cp.prix_unitaire, 0) AS valeur
         FROM client_pertes cp
         JOIN ingredients i ON i.id = cp.ingredient_id
         JOIN unites u ON u.id = i.unite_id
         LEFT JOIN categories c ON c.id = i.categorie_id
         WHERE ${wheres.join(' AND ')}
         ORDER BY cp.date_perte DESC`,
        params
      );
      rows = q.rows;
    }

    // Aggregates for charts
    const byCategorie = Object.values(
      rows.reduce((acc, r) => {
        const k = r.categorie;
        if (!acc[k]) acc[k] = { categorie: k, valeur: 0, quantite: 0 };
        acc[k].valeur += parseFloat(r.valeur);
        acc[k].quantite += parseFloat(r.quantite);
        return acc;
      }, {})
    ).sort((a, b) => b.valeur - a.valeur);

    const byType = Object.values(
      rows.reduce((acc, r) => {
        const k = r.type_perte;
        if (!acc[k]) acc[k] = { type: k, valeur: 0, quantite: 0 };
        acc[k].valeur += parseFloat(r.valeur);
        acc[k].quantite += parseFloat(r.quantite);
        return acc;
      }, {})
    );

    const byMois = Object.values(
      rows.reduce((acc, r) => {
        const mois = r.date_perte.toString().slice(0, 7);
        if (!acc[mois]) acc[mois] = { mois, valeur: 0, quantite: 0 };
        acc[mois].valeur += parseFloat(r.valeur);
        acc[mois].quantite += parseFloat(r.quantite);
        return acc;
      }, {})
    ).sort((a, b) => a.mois.localeCompare(b.mois));

    res.json({ rows, byCategorie, byType, byMois });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Rapport Coût Matière ──────────────────────────────────────────────────────

const getRapportCoutMatiere = async (req, res) => {
  const { dateFrom, dateTo, categorieId, activiteId } = req.query;
  const clientId = req.user.id;
  const isEntreprise = req.user.compteType === 'entreprise';

  try {
    let rows = [];

    if (isEntreprise) {
      const activiteIds = activiteId
        ? [parseInt(activiteId)]
        : await getActiviteIds(clientId);

      if (activiteIds.length === 0) return res.json({ rows: [], byCategorie: [], byMois: [] });

      const params = [];
      const wheres = [`sed.activite_id = ANY($1::int[])`];
      params.push(activiteIds);
      let pIdx = 2;

      wheres.push(`sed.type_appro = 'manuel'`);
      if (dateFrom) { wheres.push(`sed.date_appro >= $${pIdx++}`); params.push(dateFrom); }
      if (dateTo)   { wheres.push(`sed.date_appro <= $${pIdx++}`); params.push(dateTo); }
      if (categorieId) { wheres.push(`c.id = $${pIdx++}`); params.push(categorieId); }

      const q = await pool.query(
        `SELECT
           i.id AS ingredient_id,
           i.nom AS ingredient_nom,
           COALESCE(c.nom, 'Non classé') AS categorie,
           u.nom AS unite,
           SUM(sed.quantite) AS quantite_totale,
           AVG(sed.prix_unitaire) AS prix_moyen,
           SUM(sed.quantite * sed.prix_unitaire) AS cout_total
         FROM stock_entreprise_daily sed
         JOIN ingredients i ON i.id = sed.ingredient_id
         JOIN unites u ON u.id = i.unite_id
         LEFT JOIN categories c ON c.id = i.categorie_id
         WHERE ${wheres.join(' AND ')}
         GROUP BY i.id, i.nom, c.nom, u.nom
         ORDER BY cout_total DESC`,
        params
      );
      rows = q.rows;
    } else {
      const params = [];
      const wheres = [`scd.client_id = $1`, `scd.type_appro = 'manuel'`];
      params.push(clientId);
      let pIdx = 2;

      if (dateFrom) { wheres.push(`scd.date_appro >= $${pIdx++}`); params.push(dateFrom); }
      if (dateTo)   { wheres.push(`scd.date_appro <= $${pIdx++}`); params.push(dateTo); }
      if (categorieId) { wheres.push(`c.id = $${pIdx++}`); params.push(categorieId); }

      const q = await pool.query(
        `SELECT
           i.id AS ingredient_id,
           i.nom AS ingredient_nom,
           COALESCE(c.nom, 'Non classé') AS categorie,
           u.nom AS unite,
           SUM(scd.quantite) AS quantite_totale,
           AVG(scd.prix_unitaire) AS prix_moyen,
           SUM(scd.quantite * scd.prix_unitaire) AS cout_total
         FROM stock_client_daily scd
         JOIN ingredients i ON i.id = scd.ingredient_id
         JOIN unites u ON u.id = i.unite_id
         LEFT JOIN categories c ON c.id = i.categorie_id
         WHERE ${wheres.join(' AND ')}
         GROUP BY i.id, i.nom, c.nom, u.nom
         ORDER BY cout_total DESC`,
        params
      );
      rows = q.rows;
    }

    const total = rows.reduce((s, r) => s + parseFloat(r.cout_total || 0), 0);
    const rowsWithPct = rows.map((r) => ({
      ...r,
      pct: total > 0 ? Math.round((parseFloat(r.cout_total) / total) * 1000) / 10 : 0,
    }));

    const byCategorie = Object.values(
      rowsWithPct.reduce((acc, r) => {
        const k = r.categorie;
        if (!acc[k]) acc[k] = { categorie: k, cout_total: 0 };
        acc[k].cout_total += parseFloat(r.cout_total);
        return acc;
      }, {})
    ).sort((a, b) => b.cout_total - a.cout_total);

    // Monthly trend from stock_client_daily / stock_entreprise_daily
    const monthParams = isEntreprise
      ? [await getActiviteIds(clientId)]
      : [clientId];

    const monthQ = await pool.query(
      isEntreprise
        ? `SELECT to_char(date_appro, 'YYYY-MM') AS mois, SUM(quantite * prix_unitaire) AS cout
           FROM stock_entreprise_daily
           WHERE activite_id = ANY($1::int[]) AND type_appro = 'manuel'
           GROUP BY mois ORDER BY mois`
        : `SELECT to_char(date_appro, 'YYYY-MM') AS mois, SUM(quantite * prix_unitaire) AS cout
           FROM stock_client_daily
           WHERE client_id = $1 AND type_appro = 'manuel'
           GROUP BY mois ORDER BY mois`,
      monthParams
    );

    res.json({ rows: rowsWithPct, byCategorie, byMois: monthQ.rows, total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Rapport Appros ────────────────────────────────────────────────────────────

const getRapportAppros = async (req, res) => {
  const { dateFrom, dateTo, fournisseurId, activiteId, typeAppro } = req.query;
  const clientId = req.user.id;
  const isEntreprise = req.user.compteType === 'entreprise';

  try {
    let rows = [];

    if (isEntreprise) {
      const activiteIds = activiteId
        ? [parseInt(activiteId)]
        : await getActiviteIds(clientId);
      if (activiteIds.length === 0) return res.json({ rows: [], byFournisseur: [], byMois: [] });

      const params = [activiteIds];
      const wheres = [`sed.activite_id = ANY($1::int[])`];
      let pIdx = 2;

      if (dateFrom)     { wheres.push(`sed.date_appro >= $${pIdx++}`); params.push(dateFrom); }
      if (dateTo)       { wheres.push(`sed.date_appro <= $${pIdx++}`); params.push(dateTo); }
      if (fournisseurId){ wheres.push(`sed.fournisseur_id = $${pIdx++}`); params.push(fournisseurId); }
      if (typeAppro)    { wheres.push(`sed.type_appro = $${pIdx++}`); params.push(typeAppro); }

      const q = await pool.query(
        `SELECT
           sed.date_appro, sed.type_appro, sed.ref_facture,
           i.nom AS ingredient_nom,
           COALESCE(c.nom, 'Non classé') AS categorie,
           u.nom AS unite,
           sed.quantite,
           sed.prix_unitaire,
           sed.quantite * sed.prix_unitaire AS total,
           f.nom AS fournisseur_nom,
           a.nom AS activite_nom
         FROM stock_entreprise_daily sed
         JOIN ingredients i ON i.id = sed.ingredient_id
         JOIN unites u ON u.id = i.unite_id
         LEFT JOIN categories c ON c.id = i.categorie_id
         LEFT JOIN fournisseurs f ON f.id = sed.fournisseur_id
         JOIN activites a ON a.id = sed.activite_id
         WHERE ${wheres.join(' AND ')}
         ORDER BY sed.date_appro DESC`,
        params
      );
      rows = q.rows;
    } else {
      const params = [clientId];
      const wheres = [`scd.client_id = $1`];
      let pIdx = 2;

      if (dateFrom)     { wheres.push(`scd.date_appro >= $${pIdx++}`); params.push(dateFrom); }
      if (dateTo)       { wheres.push(`scd.date_appro <= $${pIdx++}`); params.push(dateTo); }
      if (fournisseurId){ wheres.push(`scd.fournisseur_id = $${pIdx++}`); params.push(fournisseurId); }
      if (typeAppro)    { wheres.push(`scd.type_appro = $${pIdx++}`); params.push(typeAppro); }

      const q = await pool.query(
        `SELECT
           scd.date_appro, scd.type_appro, scd.ref_facture,
           i.nom AS ingredient_nom,
           COALESCE(c.nom, 'Non classé') AS categorie,
           u.nom AS unite,
           scd.quantite,
           scd.prix_unitaire,
           scd.quantite * scd.prix_unitaire AS total,
           f.nom AS fournisseur_nom,
           NULL AS activite_nom
         FROM stock_client_daily scd
         JOIN ingredients i ON i.id = scd.ingredient_id
         JOIN unites u ON u.id = i.unite_id
         LEFT JOIN categories c ON c.id = i.categorie_id
         LEFT JOIN fournisseurs f ON f.id = scd.fournisseur_id
         WHERE ${wheres.join(' AND ')}
         ORDER BY scd.date_appro DESC`,
        params
      );
      rows = q.rows;
    }

    const byFournisseur = Object.values(
      rows.reduce((acc, r) => {
        const k = r.fournisseur_nom || 'Sans fournisseur';
        if (!acc[k]) acc[k] = { fournisseur: k, total: 0, count: 0 };
        acc[k].total += parseFloat(r.total || 0);
        acc[k].count += 1;
        return acc;
      }, {})
    ).sort((a, b) => b.total - a.total);

    const byMois = Object.values(
      rows.reduce((acc, r) => {
        const mois = r.date_appro.toString().slice(0, 7);
        if (!acc[mois]) acc[mois] = { mois, total: 0 };
        acc[mois].total += parseFloat(r.total || 0);
        return acc;
      }, {})
    ).sort((a, b) => a.mois.localeCompare(b.mois));

    res.json({ rows, byFournisseur, byMois });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Rapport Stock ─────────────────────────────────────────────────────────────

const getRapportStock = async (req, res) => {
  const { activiteId } = req.query;
  const clientId = req.user.id;
  const isEntreprise = req.user.compteType === 'entreprise';

  try {
    let rows = [];

    if (isEntreprise) {
      const activiteIds = activiteId
        ? [parseInt(activiteId)]
        : await getActiviteIds(clientId);
      if (activiteIds.length === 0) return res.json({ rows: [], byCategorie: [] });

      const q = await pool.query(
        `SELECT
           i.nom AS ingredient_nom,
           COALESCE(c.nom, 'Non classé') AS categorie,
           u.nom AS unite,
           a.nom AS activite_nom,
           ais.seuil_min,
           COALESCE(
             (SELECT sed2.prix_unitaire FROM stock_entreprise_daily sed2
              WHERE sed2.activite_id = sed.activite_id AND sed2.ingredient_id = sed.ingredient_id
              ORDER BY sed2.date_appro DESC LIMIT 1), 0
           ) AS prix_unitaire,
           SUM(CASE WHEN EXTRACT(YEAR FROM sed.date_appro) = EXTRACT(YEAR FROM NOW()) THEN sed.quantite ELSE 0 END) AS quantite
         FROM stock_entreprise_daily sed
         JOIN ingredients i ON i.id = sed.ingredient_id
         JOIN unites u ON u.id = i.unite_id
         LEFT JOIN categories c ON c.id = i.categorie_id
         JOIN activites a ON a.id = sed.activite_id
         LEFT JOIN activite_ingredient_selections ais ON ais.activite_id = sed.activite_id AND ais.ingredient_id = sed.ingredient_id
         WHERE sed.activite_id = ANY($1::int[])
         GROUP BY i.id, i.nom, c.nom, u.nom, a.id, a.nom, ais.seuil_min, sed.activite_id, sed.ingredient_id
         HAVING SUM(CASE WHEN EXTRACT(YEAR FROM sed.date_appro) = EXTRACT(YEAR FROM NOW()) THEN sed.quantite ELSE 0 END) > 0
         ORDER BY categorie, ingredient_nom`,
        [activiteIds]
      );
      rows = q.rows;
    } else {
      const q = await pool.query(
        `SELECT
           i.nom AS ingredient_nom,
           COALESCE(c.nom, 'Non classé') AS categorie,
           u.nom AS unite,
           NULL AS activite_nom,
           cis.seuil_min,
           COALESCE(
             (SELECT scd2.prix_unitaire FROM stock_client_daily scd2
              WHERE scd2.client_id = $1 AND scd2.ingredient_id = scd.ingredient_id
              ORDER BY scd2.date_appro DESC LIMIT 1), 0
           ) AS prix_unitaire,
           SUM(CASE WHEN EXTRACT(YEAR FROM scd.date_appro) = EXTRACT(YEAR FROM NOW()) THEN scd.quantite ELSE 0 END) AS quantite
         FROM stock_client_daily scd
         JOIN ingredients i ON i.id = scd.ingredient_id
         JOIN unites u ON u.id = i.unite_id
         LEFT JOIN categories c ON c.id = i.categorie_id
         LEFT JOIN client_ingredient_selections cis ON cis.client_id = $1 AND cis.ingredient_id = scd.ingredient_id
         WHERE scd.client_id = $1
         GROUP BY i.id, i.nom, c.nom, u.nom, cis.seuil_min, scd.ingredient_id
         HAVING SUM(CASE WHEN EXTRACT(YEAR FROM scd.date_appro) = EXTRACT(YEAR FROM NOW()) THEN scd.quantite ELSE 0 END) > 0
         ORDER BY categorie, ingredient_nom`,
        [clientId]
      );
      rows = q.rows;
    }

    const rowsWithValeur = rows.map((r) => ({
      ...r,
      valeur: parseFloat(r.quantite || 0) * parseFloat(r.prix_unitaire || 0),
      alerte: r.seuil_min != null && parseFloat(r.quantite) <= parseFloat(r.seuil_min)
        ? (parseFloat(r.quantite) <= 0 ? 'critique' : 'attention')
        : 'ok',
    }));

    const byCategorie = Object.values(
      rowsWithValeur.reduce((acc, r) => {
        const k = r.categorie;
        if (!acc[k]) acc[k] = { categorie: k, valeur: 0, count: 0 };
        acc[k].valeur += r.valeur;
        acc[k].count += 1;
        return acc;
      }, {})
    ).sort((a, b) => b.valeur - a.valeur);

    const totalValeur = rowsWithValeur.reduce((s, r) => s + r.valeur, 0);

    res.json({ rows: rowsWithValeur, byCategorie, totalValeur });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Rapport Activités (entreprise only) ───────────────────────────────────────

const getRapportActivites = async (req, res) => {
  const clientId = req.user.id;

  try {
    const activiteIds = await getActiviteIds(clientId);
    if (activiteIds.length === 0) return res.json({ rows: [] });

    const year = new Date().getFullYear();

    const q = await pool.query(
      `SELECT
         a.id AS activite_id,
         a.nom AS activite_nom,
         COALESCE(appros.cout_total, 0) AS cout_appros,
         COALESCE(pertes.valeur_pertes, 0) AS valeur_pertes,
         COALESCE(stock.valeur_stock, 0) AS valeur_stock
       FROM activites a
       LEFT JOIN (
         SELECT activite_id,
           SUM(quantite * prix_unitaire) AS cout_total
         FROM stock_entreprise_daily
         WHERE activite_id = ANY($1::int[])
           AND type_appro = 'manuel'
           AND EXTRACT(YEAR FROM date_appro) = $2
         GROUP BY activite_id
       ) appros ON appros.activite_id = a.id
       LEFT JOIN (
         SELECT activite_id,
           SUM(quantite * COALESCE(prix_unitaire, 0)) AS valeur_pertes
         FROM pertes
         WHERE activite_id = ANY($1::int[])
           AND EXTRACT(YEAR FROM date_perte) = $2
         GROUP BY activite_id
       ) pertes ON pertes.activite_id = a.id
       LEFT JOIN (
         SELECT activite_id,
           SUM(quantite_stock * prix_u) AS valeur_stock
         FROM (
           SELECT activite_id, ingredient_id,
             SUM(CASE WHEN EXTRACT(YEAR FROM date_appro) = $2 THEN quantite ELSE 0 END) AS quantite_stock,
             MAX(prix_unitaire) AS prix_u
           FROM stock_entreprise_daily
           WHERE activite_id = ANY($1::int[])
           GROUP BY activite_id, ingredient_id
         ) sq
         WHERE quantite_stock > 0
         GROUP BY activite_id
       ) stock ON stock.activite_id = a.id
       WHERE a.id = ANY($1::int[])
       ORDER BY cout_appros DESC`,
      [activiteIds, year]
    );

    res.json({ rows: q.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ── Filter options ────────────────────────────────────────────────────────────

const getRapportFilters = async (req, res) => {
  const clientId = req.user.id;
  const isEntreprise = req.user.compteType === 'entreprise';

  try {
    const [catRes, fourn, acts] = await Promise.all([
      pool.query('SELECT id, nom FROM categories ORDER BY nom'),
      isEntreprise
        ? pool.query(
            `SELECT f.id, f.nom FROM fournisseurs f
             JOIN profil_entreprise pe ON pe.id = f.entreprise_id
             WHERE pe.client_id = $1 ORDER BY f.nom`,
            [clientId]
          )
        : pool.query(
            `SELECT id, nom FROM fournisseurs WHERE client_id = $1 ORDER BY nom`,
            [clientId]
          ),
      isEntreprise
        ? pool.query(
            `SELECT a.id, a.nom FROM activites a
             JOIN profil_entreprise pe ON pe.id = a.entreprise_id
             WHERE pe.client_id = $1 ORDER BY a.nom`,
            [clientId]
          )
        : Promise.resolve({ rows: [] }),
    ]);

    res.json({
      categories: catRes.rows,
      fournisseurs: fourn.rows,
      activites: acts.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = {
  getRapportPertes,
  getRapportCoutMatiere,
  getRapportAppros,
  getRapportStock,
  getRapportActivites,
  getRapportFilters,
};
