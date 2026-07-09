const pool = require('../config/database');
const { computeStockCourant, computeStockPTCourant } = require('../utils/stockUtils');
const { pushTo } = require('../services/sseService');
const { saveNotification } = require('./notificationController');

// Portail acheteur (rôle 'acheteur') : catalogue de commande + suivi.
// Périmètre = le compte client parent (req.user.acheteurClientId), fiche = req.user.acheteurId.
// L'acheteur ne voit JAMAIS les quantités de stock — uniquement un badge
// disponible / rupture (rupture si stock courant agrégé ≤ seuil agrégé, tous labos).

const num = (v) => (v === null || v === undefined ? null : Number(v));
const round3 = (v) => Math.round(v * 1000) / 1000;
// Prix TTC affiché à l'acheteur, dérivé du tarif HT + TVA de l'offre.
const ttcDeHt = (ht, tva) => round3(Number(ht || 0) * (1 + (Number(tva) || 0) / 100));

// GET /api/portail/catalogue — offres actives du vendeur + badge dispo
const getCatalogue = async (req, res) => {
  try {
    const clientId = req.user.acheteurClientId;
    const [vendeur, labos, offres] = await Promise.all([
      pool.query(`SELECT nom, telephone, email FROM profil_entreprise WHERE client_id = $1`, [clientId]),
      pool.query(
        `SELECT l.id FROM labos l JOIN profil_entreprise pe ON pe.id = l.entreprise_id WHERE pe.client_id = $1`,
        [clientId]
      ),
      pool.query(
        `SELECT o.*,
                CASE WHEN o.article_type = 'ingredient' THEN a.nom ELSE p.nom END AS nom,
                CASE WHEN o.article_type = 'ingredient' THEN u.nom ELSE 'unité' END AS unite,
                CASE WHEN o.article_type = 'ingredient' THEN COALESCE(c.nom, 'Sans catégorie')
                     WHEN p.type = 'utilisable' THEN 'Produits Utilisables'
                     ELSE 'Produits Composés' END AS categorie,
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
        prixUnitaireTtc: ttcDeHt(o.prix_unitaire_ht, o.taux_tva),
        // rupture quand le stock atteint le seuil (décision produit) — quantités jamais renvoyées
        disponible: stockTotal > seuil,
      });
    }

    res.json({
      vendeur: vendeur.rows[0]?.nom || 'Votre fournisseur',
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
      const quantite = Number(l.quantite);
      if (!Number.isFinite(quantite) || round3(quantite) <= 0) return res.status(400).json({ message: `Ligne ${i + 1} : quantité invalide` });
      lignes.push({
        articleType: l.articleType, articleId: Number(l.articleId), designation: nom,
        quantite,
        quantiteUnites: round3(quantite),
        prixHt: num(offre.prix_unitaire_ht) ?? 0,
        prixTtc: ttcDeHt(offre.prix_unitaire_ht, offre.taux_tva),
        tauxTva: num(offre.taux_tva) ?? 0,
      });
    }

    const fiche = await pool.query(`SELECT nom FROM acheteurs WHERE id = $1`, [acheteurId]);
    // La remise se décide côté vendeur À LA VALIDATION — la commande part sans remise.
    const db = await pool.connect();
    let commande;
    try {
      await db.query('BEGIN');
      const cmd = await db.query(
        `INSERT INTO commandes_acheteur (client_id, acheteur_id, labo_id, statut, source, remise_pct, date_commande, notes, created_by)
         VALUES ($1, $2, NULL, 'en_attente', 'portail', 0, CURRENT_DATE, $3, $4)
         RETURNING *`,
        [clientId, acheteurId, String(req.body.notes || '').trim() || null, req.user.id]
      );
      commande = cmd.rows[0];
      for (const l of lignes) {
        await db.query(
          `INSERT INTO commande_acheteur_lignes
             (commande_id, article_type, article_id, designation, quantite, quantite_unites, prix_ht, prix_ttc, taux_tva)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [commande.id, l.articleType, l.articleId, l.designation, l.quantite, l.quantiteUnites, l.prixHt, l.prixTtc, l.tauxTva]
        );
      }
      // Historique des états : trace de la création
      await db.query(
        `INSERT INTO commande_acheteur_statuts (commande_id, statut, date_effet, created_by)
         VALUES ($1, 'en_attente', CURRENT_DATE, $2)`,
        [commande.id, req.user.id]
      );
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

const isoDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);

// GET /api/portail/commandes — les commandes de l'acheteur connecté
const listMesCommandes = async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT ca.id, ca.date_commande, ca.date_expedition, ca.date_livraison, ca.statut, ca.source,
              ca.remise_pct, ca.motif_annulation, ca.created_at,
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
      dateCommande: isoDate(c.date_commande),
      dateExpedition: isoDate(c.date_expedition),
      dateLivraison: isoDate(c.date_livraison),
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

// GET /api/portail/commandes/:id — détail COMPLET : lignes, facture (référence,
// remise, HT/TVA/timbre/TTC) et historique des états.
const getMaCommande = async (req, res) => {
  try {
    const c = await pool.query(
      `SELECT ca.*, fa.id AS facture_id, fa.numero AS facture_numero, fa.montant_brut_ttc, fa.remise_pct AS fa_remise,
              fa.montant_ht, fa.montant_tva, fa.timbre_fiscal, fa.montant_timbre, fa.montant_ttc
       FROM commandes_acheteur ca
       LEFT JOIN factures_acheteur fa ON fa.commande_id = ca.id
       WHERE ca.id = $1 AND ca.acheteur_id = $2`,
      [req.params.id, req.user.acheteurId]
    );
    if (c.rows.length === 0) return res.status(404).json({ message: 'Commande introuvable' });
    const [lignes, histo] = await Promise.all([
      pool.query(`SELECT * FROM commande_acheteur_lignes WHERE commande_id = $1 ORDER BY id`, [req.params.id]),
      pool.query(
        `SELECT statut, date_effet, motif, created_at FROM commande_acheteur_statuts
         WHERE commande_id = $1 ORDER BY created_at, id`,
        [req.params.id]
      ),
    ]);
    const row = c.rows[0];
    res.json({
      id: row.id,
      dateCommande: isoDate(row.date_commande),
      dateExpedition: isoDate(row.date_expedition),
      dateLivraison: isoDate(row.date_livraison),
      statut: row.statut,
      remisePct: num(row.remise_pct) ?? 0,
      motifAnnulation: row.motif_annulation,
      notes: row.notes,
      factureId: row.facture_id,
      factureNumero: row.facture_numero,
      facture: row.facture_id ? {
        id: row.facture_id, numero: row.facture_numero,
        montantBrutTtc: num(row.montant_brut_ttc), remisePct: num(row.fa_remise) ?? 0,
        montantHt: num(row.montant_ht), montantTva: num(row.montant_tva),
        timbreFiscal: row.timbre_fiscal, montantTimbre: num(row.montant_timbre), montantTtc: num(row.montant_ttc),
      } : null,
      factureTtc: num(row.montant_ttc),
      historique: histo.rows.map((h) => ({
        statut: h.statut, dateEffet: isoDate(h.date_effet), motif: h.motif, le: h.created_at,
      })),
      lignes: lignes.rows.map((l) => ({
        designation: l.designation, quantite: num(l.quantite),
        prixTtc: num(l.prix_ttc), tauxTva: num(l.taux_tva),
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
