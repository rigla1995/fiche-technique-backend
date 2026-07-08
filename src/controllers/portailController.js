const pool = require('../config/database');
const { computeStockCourant, computeStockPTCourant } = require('../utils/stockUtils');
const { pushTo } = require('../services/sseService');
const { saveNotification } = require('./notificationController');

// Portail acheteur (rôle 'acheteur') : catalogue de commande + suivi.
// Périmètre = le compte client parent (req.user.acheteurClientId), fiche = req.user.acheteurId.
// L'acheteur ne voit JAMAIS les quantités de stock — uniquement un badge
// disponible / rupture (rupture si stock courant agrégé ≤ seuil agrégé, tous labos).

const num = (v) => (v === null || v === undefined ? null : Number(v));

// GET /api/portail/catalogue — offres actives du vendeur + badge dispo
const getCatalogue = async (req, res) => {
  try {
    const clientId = req.user.acheteurClientId;
    const [vendeur, labos, offres, fiche] = await Promise.all([
      pool.query(`SELECT nom, telephone, email FROM profil_entreprise WHERE client_id = $1`, [clientId]),
      pool.query(
        `SELECT l.id FROM labos l JOIN profil_entreprise pe ON pe.id = l.entreprise_id WHERE pe.client_id = $1`,
        [clientId]
      ),
      pool.query(
        `SELECT o.*,
                CASE WHEN o.article_type = 'ingredient' THEN a.nom ELSE p.nom END AS nom,
                CASE WHEN o.article_type = 'ingredient' THEN u.nom ELSE 'unité' END AS unite,
                CASE WHEN o.article_type = 'ingredient' THEN COALESCE(c.nom, 'Sans catégorie') ELSE 'Produit composé' END AS categorie,
                CASE WHEN o.article_type = 'ingredient'
                     THEN (SELECT COALESCE(SUM(lis.seuil_min), 0) FROM labo_ingredient_selections lis
                           JOIN labos l2 ON l2.id = lis.labo_id
                           JOIN profil_entreprise pe2 ON pe2.id = l2.entreprise_id
                           WHERE pe2.client_id = o.client_id AND lis.ingredient_id = o.article_id)
                     ELSE (SELECT COALESCE(SUM(lps.seuil_min), 0) FROM labo_pt_selections lps
                           JOIN labos l3 ON l3.id = lps.labo_id
                           JOIN profil_entreprise pe3 ON pe3.id = l3.entreprise_id
                           WHERE pe3.client_id = o.client_id AND lps.produit_id = o.article_id)
                END AS seuil_total
         FROM acheteur_offres o
         LEFT JOIN articles a ON o.article_type = 'ingredient' AND a.id = o.article_id
         LEFT JOIN unites u ON u.id = a.unite_id
         LEFT JOIN categories c ON c.id = a.categorie_id
         LEFT JOIN produits p ON o.article_type = 'produit' AND p.id = o.article_id
         WHERE o.client_id = $1 AND o.actif = true
         ORDER BY categorie, nom`,
        [clientId]
      ),
      pool.query(`SELECT remise_pct FROM acheteurs WHERE id = $1`, [req.user.acheteurId]),
    ]);

    const laboIds = labos.rows.map((l) => l.id);
    const items = [];
    for (const o of offres.rows) {
      // Stock courant agrégé (multi-labo v1 : somme des labos ; jamais exposé, sert au badge)
      let stockTotal = 0;
      for (const laboId of laboIds) {
        stockTotal += o.article_type === 'ingredient'
          ? await computeStockCourant('labo', laboId, o.article_id)
          : await computeStockPTCourant('labo', laboId, o.article_id);
      }
      const seuil = num(o.seuil_total) ?? 0;
      items.push({
        articleType: o.article_type,
        articleId: o.article_id,
        nom: o.nom,
        unite: o.unite,
        categorie: o.categorie,
        prixUnitaireTtc: num(o.prix_unitaire_ttc) ?? 0,
        tailleLot: num(o.taille_lot),
        prixLotTtc: num(o.prix_lot_ttc),
        // rupture quand le stock atteint le seuil (décision produit) — quantités jamais renvoyées
        disponible: stockTotal > seuil,
      });
    }

    res.json({
      vendeur: vendeur.rows[0]?.nom || 'Votre fournisseur',
      remisePct: num(fiche.rows[0]?.remise_pct) ?? 0,
      offres: items,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /api/portail/commandes — commande en attente (prix FIGÉS depuis les offres,
// non modifiables par l'acheteur ; le labo est choisi par le vendeur au traitement).
const createCommande = async (req, res) => {
  const clientId = req.user.acheteurClientId;
  const acheteurId = req.user.acheteurId;
  const lignesIn = Array.isArray(req.body.lignes) ? req.body.lignes : [];
  if (lignesIn.length === 0) return res.status(400).json({ message: 'Votre panier est vide' });

  try {
    const offres = await pool.query(`SELECT * FROM acheteur_offres WHERE client_id = $1 AND actif = true`, [clientId]);
    const offreMap = new Map(offres.rows.map((o) => [`${o.article_type}:${o.article_id}`, o]));
    const artIds = [...new Set(lignesIn.filter((l) => l.articleType === 'ingredient').map((l) => Number(l.articleId)))];
    const prodIds = [...new Set(lignesIn.filter((l) => l.articleType === 'produit').map((l) => Number(l.articleId)))];
    const [artNoms, prodNoms] = await Promise.all([
      artIds.length ? pool.query(`SELECT id, nom FROM articles WHERE id = ANY($1::int[]) AND client_id = $2`, [artIds, clientId]) : { rows: [] },
      prodIds.length ? pool.query(`SELECT id, nom FROM produits WHERE id = ANY($1::int[]) AND client_id = $2`, [prodIds, clientId]) : { rows: [] },
    ]);
    const nomMap = new Map([
      ...artNoms.rows.map((r) => [`ingredient:${r.id}`, r.nom]),
      ...prodNoms.rows.map((r) => [`produit:${r.id}`, r.nom]),
    ]);

    const lignes = [];
    for (let i = 0; i < lignesIn.length; i++) {
      const l = lignesIn[i];
      const key = `${l.articleType}:${Number(l.articleId)}`;
      const offre = offreMap.get(key);
      const nom = nomMap.get(key);
      if (!offre || !nom) return res.status(400).json({ message: `Ligne ${i + 1} : article non proposé` });
      const mode = l.mode === 'lot' ? 'lot' : 'unite';
      if (mode === 'lot' && (offre.taille_lot === null || offre.prix_lot_ttc === null)) {
        return res.status(400).json({ message: `Ligne ${i + 1} : pas de vente par lot pour « ${nom} »` });
      }
      const quantite = Number(l.quantite);
      if (!Number.isFinite(quantite) || quantite <= 0) return res.status(400).json({ message: `Ligne ${i + 1} : quantité invalide` });
      const tailleLot = mode === 'lot' ? num(offre.taille_lot) : null;
      lignes.push({
        articleType: l.articleType, articleId: Number(l.articleId), designation: nom,
        mode, quantite, tailleLot,
        quantiteUnites: Math.round((mode === 'lot' ? quantite * tailleLot : quantite) * 1000) / 1000,
        prixTtc: mode === 'lot' ? num(offre.prix_lot_ttc) : num(offre.prix_unitaire_ttc),
        tauxTva: num(offre.taux_tva) ?? 0,
      });
    }

    const fiche = await pool.query(`SELECT nom, remise_pct FROM acheteurs WHERE id = $1`, [acheteurId]);
    const remisePct = num(fiche.rows[0]?.remise_pct) ?? 0;

    const db = await pool.connect();
    let commande;
    try {
      await db.query('BEGIN');
      const cmd = await db.query(
        `INSERT INTO commandes_acheteur (client_id, acheteur_id, labo_id, statut, source, remise_pct, date_commande, notes, created_by)
         VALUES ($1, $2, NULL, 'en_attente', 'portail', $3, CURRENT_DATE, $4, $5)
         RETURNING *`,
        [clientId, acheteurId, remisePct, String(req.body.notes || '').trim() || null, req.user.id]
      );
      commande = cmd.rows[0];
      for (const l of lignes) {
        await db.query(
          `INSERT INTO commande_acheteur_lignes
             (commande_id, article_type, article_id, designation, mode, quantite, taille_lot, quantite_unites, prix_ttc, taux_tva)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [commande.id, l.articleType, l.articleId, l.designation, l.mode, l.quantite, l.tailleLot, l.quantiteUnites, l.prixTtc, l.tauxTva]
        );
      }
      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      db.release();
    }

    // Notification temps réel + persistée au compte client (best-effort)
    const total = lignes.reduce((s, l) => s + l.prixTtc * l.quantite, 0);
    const payload = {
      eventType: 'nouvelle_commande_acheteur',
      type: 'commande_acheteur',
      clientNom: fiche.rows[0]?.nom || 'Acheteur',
      statut: 'en_attente',
      notesAdmin: `${lignes.length} ligne${lignes.length > 1 ? 's' : ''} · ${Math.round(total * 1000) / 1000} DT`,
    };
    try { pushTo(clientId, 'nouvelle_commande_acheteur', payload); } catch { /* best-effort */ }
    saveNotification(clientId, payload).catch(console.error);

    res.status(201).json({ id: commande.id, statut: 'en_attente', nbLignes: lignes.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/portail/commandes — les commandes de l'acheteur connecté
const listMesCommandes = async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT ca.id, ca.date_commande, ca.statut, ca.source, ca.remise_pct, ca.motif_annulation, ca.created_at,
              fa.id AS facture_id, fa.numero AS facture_numero, fa.montant_ttc AS facture_ttc,
              (SELECT COUNT(*)::int FROM commande_acheteur_lignes cal WHERE cal.commande_id = ca.id) AS nb_lignes,
              (SELECT COALESCE(SUM(cal.prix_ttc * cal.quantite), 0) FROM commande_acheteur_lignes cal WHERE cal.commande_id = ca.id) AS total_brut
       FROM commandes_acheteur ca
       LEFT JOIN factures_acheteur fa ON fa.commande_id = ca.id
       WHERE ca.acheteur_id = $1
       ORDER BY ca.created_at DESC
       LIMIT 200`,
      [req.user.acheteurId]
    );
    res.json(r.rows.map((c) => ({
      id: c.id,
      dateCommande: c.date_commande instanceof Date ? c.date_commande.toISOString().slice(0, 10) : c.date_commande,
      statut: c.statut,
      remisePct: num(c.remise_pct) ?? 0,
      motifAnnulation: c.motif_annulation,
      nbLignes: c.nb_lignes,
      totalBrutTtc: num(c.total_brut) ?? 0,
      factureId: c.facture_id,
      factureNumero: c.facture_numero,
      factureTtc: num(c.facture_ttc),
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/portail/commandes/:id — détail (lignes)
const getMaCommande = async (req, res) => {
  try {
    const c = await pool.query(
      `SELECT ca.*, fa.numero AS facture_numero, fa.montant_ttc AS facture_ttc, fa.id AS facture_id
       FROM commandes_acheteur ca
       LEFT JOIN factures_acheteur fa ON fa.commande_id = ca.id
       WHERE ca.id = $1 AND ca.acheteur_id = $2`,
      [req.params.id, req.user.acheteurId]
    );
    if (c.rows.length === 0) return res.status(404).json({ message: 'Commande introuvable' });
    const lignes = await pool.query(`SELECT * FROM commande_acheteur_lignes WHERE commande_id = $1 ORDER BY id`, [req.params.id]);
    const row = c.rows[0];
    res.json({
      id: row.id,
      dateCommande: row.date_commande instanceof Date ? row.date_commande.toISOString().slice(0, 10) : row.date_commande,
      statut: row.statut,
      remisePct: num(row.remise_pct) ?? 0,
      motifAnnulation: row.motif_annulation,
      notes: row.notes,
      factureId: row.facture_id,
      factureNumero: row.facture_numero,
      factureTtc: num(row.facture_ttc),
      lignes: lignes.rows.map((l) => ({
        designation: l.designation, mode: l.mode, quantite: num(l.quantite),
        tailleLot: num(l.taille_lot), prixTtc: num(l.prix_ttc), tauxTva: num(l.taux_tva),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/portail/factures/:id/pdf — facture de L'ACHETEUR connecté
const downloadMaFacture = async (req, res) => {
  try {
    const { buildFactureAcheteurPdf } = require('../services/factureAcheteurPdf');
    const f = await pool.query(
      `SELECT fa.*, ach.nom AS acheteur_nom, ach.entreprise AS acheteur_entreprise, ach.adresse AS acheteur_adresse,
              ach.matricule_fiscal AS acheteur_mf, ach.telephone AS acheteur_tel, ach.email AS acheteur_email,
              ca.date_commande, ca.notes,
              pe.nom AS vendeur_nom, pe.adresse AS vendeur_adresse, pe.telephone AS vendeur_tel, pe.email AS vendeur_email
       FROM factures_acheteur fa
       JOIN acheteurs ach ON ach.id = fa.acheteur_id
       JOIN commandes_acheteur ca ON ca.id = fa.commande_id
       LEFT JOIN profil_entreprise pe ON pe.client_id = fa.client_id
       WHERE fa.id = $1 AND fa.acheteur_id = $2`,
      [req.params.id, req.user.acheteurId]
    );
    if (f.rows.length === 0) return res.status(404).json({ message: 'Facture introuvable' });
    const lignes = await pool.query(`SELECT * FROM commande_acheteur_lignes WHERE commande_id = $1 ORDER BY id`, [f.rows[0].commande_id]);
    const buffer = await buildFactureAcheteurPdf(f.rows[0], lignes.rows);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${f.rows[0].numero}.pdf"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur lors de la génération de la facture' });
  }
};

module.exports = { getCatalogue, createCommande, listMesCommandes, getMaCommande, downloadMaFacture };
