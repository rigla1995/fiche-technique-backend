const pool = require('../config/database');
const { computeStockCourant, computeStockPTCourant } = require('../utils/stockUtils');
const { gerantAllowsLabo } = require('../middleware/auth');
const { buildFactureAcheteurPdf } = require('../services/factureAcheteurPdf');

const clientIdOf = (req) => req.user.gerant_parent_id || req.user.id;
const num = (v) => (v === null || v === undefined ? null : Number(v));
const round3 = (v) => Math.round(v * 1000) / 1000;
// Prix TTC dérivé d'un prix HT et d'un taux de TVA (les tarifs acheteurs sont saisis HT).
const ttcDeHt = (ht, tva) => round3(Number(ht || 0) * (1 + (Number(tva) || 0) / 100));
const { promoDe, prixEffectifHt } = require('../utils/offrePromo');

// ═══════════════════════════════════════════════════════════════════════════
// OFFRES (tarifs acheteurs) — prix unitaire HT + taux TVA (TTC dérivé)
// Une promo éventuelle (promo_pct + promo_active) remise sur le prix HT : le prix
// de référence n'est jamais écrasé, le prix EFFECTIF est celui qui est facturé.
// ═══════════════════════════════════════════════════════════════════════════

const mapOffre = (row) => {
  if (!row) {
    return {
      offreId: null, prixUnitaireHt: 0, tauxTva: 0, prixUnitaireTtc: 0, actif: false,
      promoPct: 0, promoActive: false, prixPromoHt: 0, prixPromoTtc: 0,
    };
  }
  const promoHt = prixEffectifHt(row);
  return {
    offreId: row.id,
    prixUnitaireHt: num(row.prix_unitaire_ht) ?? 0,
    tauxTva: num(row.taux_tva) ?? 0,
    prixUnitaireTtc: ttcDeHt(row.prix_unitaire_ht, row.taux_tva),
    actif: row.actif === true,
    // Écran de configuration : on renvoie le taux STOCKÉ (même promo désactivée,
    // pour ne pas perdre la saisie) et l'état d'activation séparément.
    // Le taux réellement appliqué est promoDe(row) — cf. portail.
    promoPct: num(row.promo_pct) ?? 0,
    promoActive: row.promo_active === true,
    // Prix réellement appliqué (= prix de référence si aucune promo active)
    prixPromoHt: promoHt,
    prixPromoTtc: ttcDeHt(promoHt, row.taux_tva),
  };
};

// Prédicat SQL des produits proposables aux acheteurs : composés fabriqués au labo
// + utilisables rattachés à au moins un labo du client ($n = paramètre clientId).
const PRODUIT_ELIGIBLE_SQL = (p, n) => `(
  ${p}.origine = 'labo'
  OR (${p}.type = 'utilisable' AND EXISTS (
    SELECT 1 FROM labo_pt_selections lps
    JOIN labos lx ON lx.id = lps.labo_id
    JOIN profil_entreprise pex ON pex.id = lx.entreprise_id
    WHERE lps.produit_id = ${p}.id AND pex.client_id = $${n}
  ))
)`;

// Sections de l'écran Tarifs et du portail pour les produits.
const produitSection = (type) => (type === 'utilisable' ? 'Produits Utilisables' : 'Produits Composés');

// GET /api/acheteurs/offres — articles commandables + produits (composés labo et
// utilisables liés à un labo), avec leur offre éventuelle. Écran « Tarifs Acheteurs ».
// Filet : un article/produit devenu INÉLIGIBLE mais dont l'offre est encore ACTIVE
// reste listé (sinon il serait vendu au portail sans être gérable nulle part).
const listOffres = async (req, res) => {
  try {
    const clientId = clientIdOf(req);
    const [arts, prods] = await Promise.all([
      pool.query(
        `SELECT a.id, a.nom, u.nom AS unite, COALESCE(c.nom, 'Sans catégorie') AS categorie, f.nom AS famille,
                o.id AS o_id, o.prix_unitaire_ht, o.taux_tva, o.actif, o.promo_pct, o.promo_active
         FROM articles a
         JOIN unites u ON u.id = a.unite_id
         LEFT JOIN categories c ON c.id = a.categorie_id
         LEFT JOIN familles f ON f.id = c.famille_id
         LEFT JOIN acheteur_offres o ON o.client_id = $1 AND o.article_type = 'ingredient' AND o.article_id = a.id
         WHERE a.client_id = $1 AND (a.commandable = true OR o.actif = true)
         ORDER BY COALESCE(c.nom, 'zzz'), a.nom`,
        [clientId]
      ),
      pool.query(
        `SELECT p.id, p.nom, p.type, p.origine, cp.nom AS categorie_produit,
                o.id AS o_id, o.prix_unitaire_ht, o.taux_tva, o.actif, o.promo_pct, o.promo_active
         FROM produits p
         LEFT JOIN categories_produit cp ON cp.id = p.categorie_produit_id
         LEFT JOIN acheteur_offres o ON o.client_id = $1 AND o.article_type = 'produit' AND o.article_id = p.id
         WHERE p.client_id = $1 AND (${PRODUIT_ELIGIBLE_SQL('p', 1)} OR o.actif = true)
         ORDER BY (p.type = 'utilisable'), p.nom`,
        [clientId]
      ),
    ]);
    res.json({
      articles: arts.rows.map((r) => ({
        articleType: 'ingredient', articleId: r.id, nom: r.nom, unite: r.unite,
        categorie: r.categorie, famille: r.famille,
        ...mapOffre(r.o_id ? { ...r, id: r.o_id } : null),
      })),
      produits: prods.rows.map((r) => ({
        articleType: 'produit', articleId: r.id, nom: r.nom, unite: 'unité',
        categorie: produitSection(r.type), famille: null,
        categorieProduit: r.categorie_produit || null,
        ...mapOffre(r.o_id ? { ...r, id: r.o_id } : null),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// L'article/produit est-il proposable pour ce client ?
const isEligible = async (clientId, articleType, articleId) => {
  if (articleType === 'ingredient') {
    const r = await pool.query(
      `SELECT 1 FROM articles WHERE id = $1 AND client_id = $2 AND commandable = true`,
      [articleId, clientId]
    );
    return r.rows.length > 0;
  }
  const r = await pool.query(
    `SELECT 1 FROM produits p WHERE p.id = $1 AND p.client_id = $2 AND ${PRODUIT_ELIGIBLE_SQL('p', 2)}`,
    [articleId, clientId]
  );
  return r.rows.length > 0;
};

// POST /api/acheteurs/offres — upsert d'une offre (rafale depuis l'écran Tarifs).
const upsertOffre = async (req, res) => {
  const clientId = clientIdOf(req);
  const { articleType, articleId } = req.body;
  if (!['ingredient', 'produit'].includes(articleType) || !Number.isFinite(Number(articleId))) {
    return res.status(400).json({ message: 'Article invalide' });
  }
  const prixU = Number(req.body.prixUnitaireHt);
  const tva = Number(req.body.tauxTva ?? 0);
  const actif = req.body.actif === true;
  // Arrondi à la précision de la colonne NUMERIC(5,2) AVANT tout test : sinon un
  // taux < 0,005 passerait la validation puis serait stocké 0.00, violant la
  // contrainte promo_coherente (500 opaque au lieu d'un message clair).
  const promoBrut = Number(req.body.promoPct ?? 0);
  const promoPct = Number.isFinite(promoBrut) ? Math.round(promoBrut * 100) / 100 : NaN;
  // Une promo sans taux est neutralisée (invariant repris par la contrainte SQL)
  const promoActive = req.body.promoActive === true && promoPct > 0;

  if (!Number.isFinite(prixU) || prixU < 0) return res.status(400).json({ message: 'Prix unitaire invalide' });
  if (!Number.isFinite(tva) || tva < 0 || tva > 100) return res.status(400).json({ message: 'Taux de TVA invalide (0 à 100)' });
  if (actif && prixU <= 0) return res.status(400).json({ message: 'Impossible d\'activer une offre sans prix unitaire > 0' });
  if (!Number.isFinite(promoPct) || promoPct < 0 || promoPct > 100) {
    return res.status(400).json({ message: 'Taux de promotion invalide (0 à 100)' });
  }
  if (req.body.promoActive === true && promoPct <= 0) {
    return res.status(400).json({ message: 'Taux de promotion trop faible (minimum 0,01 %)' });
  }
  if (promoActive && prixU <= 0) {
    return res.status(400).json({ message: 'Impossible d\'activer une promotion sans prix unitaire > 0' });
  }

  try {
    const prev = await pool.query(
      `SELECT id, prix_unitaire_ht, taux_tva FROM acheteur_offres
       WHERE client_id = $1 AND article_type = $2 AND article_id = $3`,
      [clientId, articleType, articleId]
    );
    // Une offre EXISTANTE reste modifiable même si l'article n'est plus éligible
    // (il faut pouvoir la désactiver) ; l'éligibilité ne gate que les nouvelles offres.
    if (prev.rows.length === 0 && !(await isEligible(clientId, articleType, articleId))) {
      return res.status(400).json({ message: 'Article non proposable (article non commandable ou produit hors labo)' });
    }
    const r = await pool.query(
      `INSERT INTO acheteur_offres (client_id, article_type, article_id, prix_unitaire_ht, taux_tva, actif, promo_pct, promo_active, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (client_id, article_type, article_id) DO UPDATE
       SET prix_unitaire_ht = EXCLUDED.prix_unitaire_ht,
           taux_tva = EXCLUDED.taux_tva,
           actif = EXCLUDED.actif,
           promo_pct = EXCLUDED.promo_pct,
           promo_active = EXCLUDED.promo_active,
           updated_at = NOW()
       RETURNING *`,
      // Le taux saisi est conservé même promo désactivée (on ne perd pas la saisie) ;
      // seul `promo_active` décide de son application.
      [clientId, articleType, articleId, prixU, tva, actif, promoPct, promoActive, req.user.id]
    );
    const row = r.rows[0];
    // Historisation à chaque changement de prix (prix > 0), pattern module ventes
    const p = prev.rows[0];
    const changed = !p || num(p.prix_unitaire_ht) !== prixU || num(p.taux_tva) !== tva;
    if (prixU > 0 && changed) {
      await pool.query(
        `INSERT INTO acheteur_offre_prix_historique (offre_id, prix_unitaire_ht, taux_tva, created_by)
         VALUES ($1, $2, $3, $4)`,
        [row.id, prixU, tva, req.user.id]
      );
    }
    res.json({ articleType, articleId, ...mapOffre(row) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/acheteurs/offres/:id/historique — 5 derniers prix
const getOffreHistorique = async (req, res) => {
  try {
    const clientId = clientIdOf(req);
    const r = await pool.query(
      `SELECT h.prix_unitaire_ht, h.taux_tva, h.saved_at, u.nom AS created_by_nom
       FROM acheteur_offre_prix_historique h
       JOIN acheteur_offres o ON o.id = h.offre_id AND o.client_id = $1
       LEFT JOIN utilisateurs u ON u.id = h.created_by
       WHERE h.offre_id = $2
       ORDER BY h.saved_at DESC LIMIT 5`,
      [clientId, req.params.id]
    );
    res.json(r.rows.map((h) => ({
      prixUnitaireHt: num(h.prix_unitaire_ht),
      tauxTva: num(h.taux_tva),
      savedAt: h.saved_at,
      createdByNom: h.created_by_nom,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// ═══════════════════════════════════════════════════════════════════════════
// VENTES (commandes) — vente manuelle du client, validée d'office
// ═══════════════════════════════════════════════════════════════════════════

// Totaux de facture (partagé vente manuelle / validation de commande portail) :
// prix saisis HT → remise proportionnelle sur le HT → TVA calculée ligne à ligne
// sur le net remisé → timbre. Le TTC est toujours dérivé, jamais re-taxé.
// brutTtc (affichage) part du prix TTC unitaire FIGÉ sur la ligne pour rester
// identique aux totaux des listes (SUM(prix_ttc × quantite)).
const computeTotauxFacture = (lignes, remisePct, timbreFiscal, montantTimbre) => {
  const facteur = 1 - remisePct / 100;
  let brutHt = 0;
  let brutTtc = 0;
  let montantHt = 0;
  let montantTva = 0;
  for (const l of lignes) {
    const qte = Number(l.quantite);
    const ht = Number(l.prixHt ?? l.prix_ht) * qte;
    const tva = (Number(l.tauxTva ?? l.taux_tva) || 0) / 100;
    const ttcU = Number(l.prixTtc ?? l.prix_ttc);
    brutHt += ht;
    brutTtc += Number.isFinite(ttcU) ? ttcU * qte : ht * (1 + tva);
    montantHt += ht * facteur;
    montantTva += ht * facteur * tva;
  }
  brutHt = round3(brutHt);
  brutTtc = round3(brutTtc);
  montantHt = round3(montantHt);
  montantTva = round3(montantTva);
  const timbre = timbreFiscal ? montantTimbre : 0;
  return { brutHt, brutTtc, montantHt, montantTva, montantTimbre: timbre, montantTtc: round3(montantHt + montantTva + timbre) };
};

// Coût matière TTC par unité au labo (figé sur la ligne à la validation) :
// articles = moyenne TTC des appros manuels ; produits = moyenne TTC des réceptions/productions.
const buildCostMaps = async (laboId, artIds, prodIds) => {
  const [arts, prods] = await Promise.all([
    artIds.length
      ? pool.query(
          `SELECT ingredient_id, AVG(COALESCE(prix_unitaire_tva, prix_unitaire)) AS cout
           FROM stock_labo_daily
           WHERE labo_id = $1 AND ingredient_id = ANY($2::int[]) AND quantite > 0 AND type_appro = 'manuel'
           GROUP BY ingredient_id`,
          [laboId, artIds]
        )
      : { rows: [] },
    prodIds.length
      ? pool.query(
          `SELECT produit_id, AVG(COALESCE(prix_unitaire_tva, prix_unitaire)) AS cout
           FROM stock_labo_pt_daily
           WHERE labo_id = $1 AND produit_id = ANY($2::int[]) AND quantite > 0 AND prix_unitaire IS NOT NULL
           GROUP BY produit_id`,
          [laboId, prodIds]
        )
      : { rows: [] },
  ]);
  const artMap = new Map(arts.rows.map((r) => [Number(r.ingredient_id), num(r.cout)]));
  const prodMap = new Map(prods.rows.map((r) => [Number(r.produit_id), num(r.cout)]));
  return { artMap, prodMap };
};

// Trace d'une transition d'état (historique complet de la commande).
// date_effet = date métier saisie (expédition / livraison), NULL sinon.
const logStatut = (db, commandeId, statut, dateEffet, motif, userId) => db.query(
  `INSERT INTO commande_acheteur_statuts (commande_id, statut, date_effet, motif, created_by)
   VALUES ($1, $2, $3, $4, $5)`,
  [commandeId, statut, dateEffet || null, motif || null, userId || null]
);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
// Plafond du schéma NUMERIC(10,3) des quantités — au-delà : 400 propre, pas un 500 SQL
const MAX_QTE = 9999999.999;
const aujourdHui = () => new Date().toISOString().slice(0, 10);

// Numéro de facture séquentiel par client et par année : FA-2026-0001.
// Advisory lock transactionnel → pas de doublon même en concurrence.
const nextNumeroFacture = async (db, clientId, dateFacture) => {
  const year = new Date(dateFacture).getFullYear();
  await db.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`facture_acheteur_${clientId}_${year}`]);
  const r = await db.query(
    `SELECT numero FROM factures_acheteur WHERE client_id = $1 AND numero LIKE $2 ORDER BY numero DESC LIMIT 1`,
    [clientId, `FA-${year}-%`]
  );
  const lastSeq = r.rows[0] ? parseInt(r.rows[0].numero.split('-')[2], 10) || 0 : 0;
  return `FA-${year}-${String(lastSeq + 1).padStart(4, '0')}`;
};

// POST /api/acheteurs/ventes — vente manuelle (commande source=client) : le stock
// sort immédiatement (statut 'expediee', ou 'livree' directement avec sa date).
// Lignes pré-remplies au tarif côté front, prix HT modifiable ligne à ligne.
// La remise se décide À CETTE COMMANDE (défaut 0 — plus de remise de fiche acheteur).
const createVente = async (req, res) => {
  const clientId = clientIdOf(req);
  const { acheteurId, laboId, notes } = req.body;
  const dateCommande = req.body.dateCommande || new Date().toISOString().slice(0, 10);
  const lignesIn = Array.isArray(req.body.lignes) ? req.body.lignes : [];
  if (!Number.isFinite(Number(acheteurId))) return res.status(400).json({ message: 'Acheteur requis' });
  if (!Number.isFinite(Number(laboId))) return res.status(400).json({ message: 'Labo requis' });
  if (lignesIn.length === 0) return res.status(400).json({ message: 'Au moins une ligne est requise' });

  const statut = req.body.statut === 'livree' ? 'livree' : 'expediee';
  const dateExpedition = req.body.dateExpedition || dateCommande;
  const dateLivraison = statut === 'livree' ? (req.body.dateLivraison || dateExpedition) : null;
  if (!DATE_RE.test(dateCommande) || !DATE_RE.test(dateExpedition) || (dateLivraison && !DATE_RE.test(dateLivraison))) {
    return res.status(400).json({ message: 'Date invalide (AAAA-MM-JJ)' });
  }
  // La facture est datée/numérotée à l'expédition : pas d'antidatage hors exercice ni de date future
  const ajd = aujourdHui();
  if (dateExpedition > ajd) return res.status(400).json({ message: 'La date d\'expédition ne peut pas être dans le futur' });
  if (dateExpedition.slice(0, 4) !== ajd.slice(0, 4)) {
    return res.status(400).json({ message: `La date d'expédition doit être dans l'exercice en cours (${ajd.slice(0, 4)})` });
  }
  if (dateExpedition < dateCommande) return res.status(400).json({ message: 'La date d\'expédition ne peut pas précéder la date de commande' });
  if (dateLivraison && dateLivraison < dateExpedition) {
    return res.status(400).json({ message: 'La date de livraison ne peut pas précéder la date d\'expédition' });
  }

  try {
    // Gardes de périmètre
    const [ach, labo] = await Promise.all([
      pool.query(`SELECT * FROM acheteurs WHERE id = $1 AND client_id = $2`, [acheteurId, clientId]),
      pool.query(
        `SELECT l.id, l.nom FROM labos l JOIN profil_entreprise pe ON pe.id = l.entreprise_id
         WHERE l.id = $1 AND pe.client_id = $2`,
        [laboId, clientId]
      ),
    ]);
    if (ach.rows.length === 0) return res.status(404).json({ message: 'Acheteur introuvable' });
    if (ach.rows[0].actif === false) return res.status(400).json({ message: 'Cet acheteur est désactivé' });
    if (labo.rows.length === 0) return res.status(404).json({ message: 'Labo introuvable' });
    if (!gerantAllowsLabo(req, laboId)) return res.status(403).json({ message: 'Labo hors de votre périmètre' });

    const remisePct = req.body.remisePct !== undefined && req.body.remisePct !== ''
      ? Number(req.body.remisePct)
      : 0;
    if (!Number.isFinite(remisePct) || remisePct < 0 || remisePct > 100) {
      return res.status(400).json({ message: 'Remise invalide (0 à 100)' });
    }
    const timbreFiscal = req.body.timbreFiscal !== false;
    const montantTimbre = timbreFiscal ? (Number.isFinite(Number(req.body.montantTimbre)) ? Number(req.body.montantTimbre) : 1.0) : 0;
    if (montantTimbre < 0) return res.status(400).json({ message: 'Timbre invalide' });

    // Offres ACTIVES des lignes demandées (prix HT par défaut + taux de TVA figé)
    const offres = await pool.query(
      `SELECT * FROM acheteur_offres WHERE client_id = $1 AND actif = true`,
      [clientId]
    );
    const offreMap = new Map(offres.rows.map((o) => [`${o.article_type}:${o.article_id}`, o]));

    // Noms/désignations
    const artIds = [...new Set(lignesIn.filter((l) => l.articleType === 'ingredient').map((l) => Number(l.articleId)))];
    const prodIds = [...new Set(lignesIn.filter((l) => l.articleType === 'produit').map((l) => Number(l.articleId)))];
    const [artNoms, prodNoms] = await Promise.all([
      artIds.length ? pool.query(`SELECT a.id, a.nom, u.nom AS unite FROM articles a JOIN unites u ON u.id = a.unite_id WHERE a.id = ANY($1::int[]) AND a.client_id = $2`, [artIds, clientId]) : { rows: [] },
      prodIds.length ? pool.query(`SELECT id, nom FROM produits WHERE id = ANY($1::int[]) AND client_id = $2`, [prodIds, clientId]) : { rows: [] },
    ]);
    const nomMap = new Map([
      ...artNoms.rows.map((r) => [`ingredient:${r.id}`, { nom: r.nom, unite: r.unite }]),
      ...prodNoms.rows.map((r) => [`produit:${r.id}`, { nom: r.nom, unite: 'unité' }]),
    ]);

    // Validation des lignes + agrégat des besoins en UNITÉS pour le contrôle de stock
    const lignes = [];
    const besoins = new Map(); // key type:id → { nom, unites }
    for (let i = 0; i < lignesIn.length; i++) {
      const l = lignesIn[i];
      const key = `${l.articleType}:${Number(l.articleId)}`;
      const offre = offreMap.get(key);
      const meta = nomMap.get(key);
      if (!offre || !meta) {
        return res.status(400).json({ message: `Ligne ${i + 1} : article sans offre active — configurez d'abord vos Tarifs Acheteurs` });
      }
      const quantite = Number(l.quantite);
      if (!Number.isFinite(quantite) || quantite <= 0 || quantite > MAX_QTE) return res.status(400).json({ message: `Ligne ${i + 1} : quantité invalide` });
      // != null : un prixHt absent OU null (JSON) retombe sur le tarif de l'offre
      // Défaut = prix EFFECTIF de l'offre (promo appliquée si active), pour qu'une
      // vente manuelle facture le même prix que celui affiché au portail.
      const prixHt = l.prixHt != null && l.prixHt !== '' ? Number(l.prixHt) : prixEffectifHt(offre);
      if (!Number.isFinite(prixHt) || prixHt < 0) return res.status(400).json({ message: `Ligne ${i + 1} : prix invalide` });
      const tauxTva = num(offre.taux_tva) ?? 0;
      const quantiteUnites = round3(quantite);
      if (quantiteUnites <= 0) return res.status(400).json({ message: `Ligne ${i + 1} : quantité invalide` });

      lignes.push({
        articleType: l.articleType, articleId: Number(l.articleId),
        designation: meta.nom, unite: meta.unite, quantite, quantiteUnites,
        prixHt, prixTtc: ttcDeHt(prixHt, tauxTva), tauxTva,
      });
      const b = besoins.get(key) || { nom: meta.nom, unite: meta.unite, type: l.articleType, id: Number(l.articleId), unites: 0 };
      b.unites = round3(b.unites + quantiteUnites);
      besoins.set(key, b);
    }

    // Contrôle de stock labo (422 détaillé, comme la production PT)
    const manquants = [];
    for (const b of besoins.values()) {
      const dispo = b.type === 'ingredient'
        ? await computeStockCourant('labo', laboId, b.id)
        : await computeStockPTCourant('labo', laboId, b.id);
      if (dispo < b.unites) {
        manquants.push({ nom: b.nom, unite: b.unite, disponible: dispo, necessaire: b.unites, manquant: round3(b.unites - dispo) });
      }
    }
    if (manquants.length > 0) {
      return res.status(422).json({ message: 'Stock labo insuffisant', manquants });
    }

    // Coûts matière TTC figés (marge)
    const { artMap, prodMap } = await buildCostMaps(laboId, artIds, prodIds);

    const { brutHt, brutTtc, montantHt, montantTva, montantTtc } = computeTotauxFacture(lignes, remisePct, timbreFiscal, montantTimbre);

    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const cmd = await db.query(
        `INSERT INTO commandes_acheteur
           (client_id, acheteur_id, acheteur_nom, acheteur_entreprise, labo_id, statut, source, remise_pct, date_commande, date_expedition, date_livraison, notes, traite_le, traite_par, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'client', $7, $8, $9, $10, $11, NOW(), $12, $12)
         RETURNING *`,
        [clientId, acheteurId, ach.rows[0].nom, ach.rows[0].entreprise, laboId, statut, remisePct, dateCommande, dateExpedition, dateLivraison, notes || null, req.user.id]
      );
      const commande = cmd.rows[0];
      // Historique : le stock sort à l'expédition ; la livraison directe trace les deux jalons
      await logStatut(db, commande.id, 'expediee', dateExpedition, null, req.user.id);
      if (statut === 'livree') await logStatut(db, commande.id, 'livree', dateLivraison, null, req.user.id);
      for (const l of lignes) {
        const coutU = l.articleType === 'ingredient' ? artMap.get(l.articleId) ?? null : prodMap.get(l.articleId) ?? null;
        await db.query(
          `INSERT INTO commande_acheteur_lignes
             (commande_id, article_type, article_id, designation, quantite, quantite_unites, prix_ht, prix_ttc, taux_tva, cout_unitaire_ttc)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [commande.id, l.articleType, l.articleId, l.designation, l.quantite, l.quantiteUnites, l.prixHt, l.prixTtc, l.tauxTva, coutU]
        );
      }
      const numero = await nextNumeroFacture(db, clientId, dateCommande);
      const a0 = ach.rows[0];
      const fact = await db.query(
        `INSERT INTO factures_acheteur
           (client_id, acheteur_id, acheteur_nom, acheteur_entreprise, acheteur_adresse, acheteur_matricule_fiscal, acheteur_telephone, acheteur_email,
            commande_id, numero, date_facture, montant_brut_ttc, remise_pct, montant_ht, montant_tva, timbre_fiscal, montant_timbre, montant_ttc, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         RETURNING *`,
        [clientId, acheteurId, a0.nom, a0.entreprise, a0.adresse, a0.matricule_fiscal, a0.telephone, a0.email,
         commande.id, numero, dateCommande, brutTtc, remisePct, montantHt, montantTva, timbreFiscal, montantTimbre, montantTtc, req.user.id]
      );
      await db.query('COMMIT');
      res.status(201).json({
        commande: { id: commande.id, statut, dateCommande, dateExpedition, dateLivraison, remisePct, acheteurNom: ach.rows[0].nom, laboNom: labo.rows[0].nom },
        facture: {
          id: fact.rows[0].id, numero, montantHt, montantTva, montantTimbre, montantTtc, brutHt, brutTtc,
        },
      });
    } catch (err) {
      await db.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      db.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/acheteurs/commandes — historique (filtres : statut, acheteurId, from, to)
const listCommandes = async (req, res) => {
  try {
    const clientId = clientIdOf(req);
    const conds = ['ca.client_id = $1'];
    const params = [clientId];
    if (req.query.statut && ['en_attente', 'expediee', 'livree', 'annulee'].includes(req.query.statut)) {
      params.push(req.query.statut);
      conds.push(`ca.statut = $${params.length}`);
    }
    // 'supprimes' = commandes orphelines (acheteur supprimé, conservées par la migr 165)
    if (req.query.acheteurId === 'supprimes') {
      conds.push('ca.acheteur_id IS NULL');
    } else if (req.query.acheteurId) { params.push(req.query.acheteurId); conds.push(`ca.acheteur_id = $${params.length}`); }
    if (req.query.from) { params.push(req.query.from); conds.push(`ca.date_commande >= $${params.length}`); }
    if (req.query.to) { params.push(req.query.to); conds.push(`ca.date_commande <= $${params.length}`); }
    // Gérant : ne voit que les commandes de ses labos (+ celles en attente sans labo, traitées au lot portail)
    if (req.user.role === 'gerant') {
      const ids = req.user.gerantLaboIds || [];
      params.push(ids.length ? ids : [-1]);
      conds.push(`(ca.labo_id = ANY($${params.length}::int[]) OR ca.labo_id IS NULL)`);
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);

    const r = await pool.query(
      `SELECT ca.*, COALESCE(ach.nom, ca.acheteur_nom) AS acheteur_nom,
              CASE WHEN ach.id IS NULL THEN ca.acheteur_entreprise ELSE ach.entreprise END AS acheteur_entreprise,
              (ach.id IS NULL) AS acheteur_supprime, l.nom AS labo_nom,
              fa.id AS facture_id, fa.numero AS facture_numero, fa.montant_ttc AS facture_ttc,
              (SELECT COUNT(*)::int FROM commande_acheteur_lignes cal WHERE cal.commande_id = ca.id) AS nb_lignes,
              (SELECT COALESCE(SUM(cal.prix_ttc * cal.quantite), 0) FROM commande_acheteur_lignes cal WHERE cal.commande_id = ca.id) AS total_brut,
              ub.nom AS created_by_nom
       FROM commandes_acheteur ca
       LEFT JOIN acheteurs ach ON ach.id = ca.acheteur_id
       LEFT JOIN labos l ON l.id = ca.labo_id
       LEFT JOIN factures_acheteur fa ON fa.commande_id = ca.id
       LEFT JOIN utilisateurs ub ON ub.id = ca.created_by
       WHERE ${conds.join(' AND ')}
       ORDER BY ca.date_commande DESC, ca.created_at DESC
       LIMIT ${limit}`,
      params
    );
    const isoDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
    res.json(r.rows.map((c) => ({
      id: c.id,
      dateCommande: isoDate(c.date_commande),
      dateExpedition: isoDate(c.date_expedition),
      dateLivraison: isoDate(c.date_livraison),
      statut: c.statut,
      source: c.source,
      acheteurId: c.acheteur_id,
      acheteurNom: c.acheteur_supprime ? `${c.acheteur_nom || '—'} (supprimé)` : c.acheteur_nom,
      acheteurEntreprise: c.acheteur_entreprise,
      laboId: c.labo_id,
      laboNom: c.labo_nom,
      remisePct: num(c.remise_pct) ?? 0,
      notes: c.notes,
      motifAnnulation: c.motif_annulation,
      nbLignes: c.nb_lignes,
      totalBrutTtc: num(c.total_brut) ?? 0,
      factureId: c.facture_id,
      factureNumero: c.facture_numero,
      factureTtc: num(c.facture_ttc),
      createdByNom: c.created_by_nom,
      createdAt: c.created_at,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/acheteurs/commandes/:id — détail + lignes
const getCommande = async (req, res) => {
  try {
    const clientId = clientIdOf(req);
    const c = await pool.query(
      `SELECT ca.*, COALESCE(ach.nom, ca.acheteur_nom) AS acheteur_nom,
              (ach.id IS NULL) AS acheteur_supprime, l.nom AS labo_nom,
              fa.id AS facture_id, fa.numero AS facture_numero, fa.montant_ht, fa.montant_tva,
              fa.timbre_fiscal, fa.montant_timbre, fa.montant_ttc, fa.montant_brut_ttc
       FROM commandes_acheteur ca
       LEFT JOIN acheteurs ach ON ach.id = ca.acheteur_id
       LEFT JOIN labos l ON l.id = ca.labo_id
       LEFT JOIN factures_acheteur fa ON fa.commande_id = ca.id
       WHERE ca.id = $1 AND ca.client_id = $2`,
      [req.params.id, clientId]
    );
    if (c.rows.length === 0) return res.status(404).json({ message: 'Commande introuvable' });
    const [lignes, histo] = await Promise.all([
      pool.query(`SELECT * FROM commande_acheteur_lignes WHERE commande_id = $1 ORDER BY id`, [req.params.id]),
      pool.query(
        `SELECT s.statut, s.date_effet, s.motif, s.created_at, u.nom AS created_by_nom
         FROM commande_acheteur_statuts s
         LEFT JOIN utilisateurs u ON u.id = s.created_by
         WHERE s.commande_id = $1 ORDER BY s.created_at, s.id`,
        [req.params.id]
      ),
    ]);
    const row = c.rows[0];
    const isoDate = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d);
    res.json({
      id: row.id,
      dateCommande: isoDate(row.date_commande),
      dateExpedition: isoDate(row.date_expedition),
      dateLivraison: isoDate(row.date_livraison),
      statut: row.statut,
      source: row.source,
      acheteurId: row.acheteur_id,
      acheteurNom: row.acheteur_supprime ? `${row.acheteur_nom || '—'} (supprimé)` : row.acheteur_nom,
      laboId: row.labo_id,
      laboNom: row.labo_nom,
      remisePct: num(row.remise_pct) ?? 0,
      notes: row.notes,
      motifAnnulation: row.motif_annulation,
      historique: histo.rows.map((h) => ({
        statut: h.statut, dateEffet: isoDate(h.date_effet), motif: h.motif,
        parNom: h.created_by_nom, le: h.created_at,
      })),
      facture: row.facture_id ? {
        id: row.facture_id, numero: row.facture_numero,
        montantBrutTtc: num(row.montant_brut_ttc), montantHt: num(row.montant_ht), montantTva: num(row.montant_tva),
        timbreFiscal: row.timbre_fiscal, montantTimbre: num(row.montant_timbre), montantTtc: num(row.montant_ttc),
      } : null,
      lignes: lignes.rows.map((l) => ({
        id: l.id, articleType: l.article_type, articleId: l.article_id, designation: l.designation,
        quantite: num(l.quantite), quantiteUnites: num(l.quantite_unites),
        prixHt: num(l.prix_ht), prixTtc: num(l.prix_ttc), tauxTva: num(l.taux_tva), coutUnitaireTtc: num(l.cout_unitaire_ttc),
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// POST /api/acheteurs/commandes/:id/expedier — expédition d'une commande EN ATTENTE :
// le vendeur choisit le labo source, peut AJUSTER LES QUANTITÉS demandées (0 =
// ligne RETIRÉE de la commande), fixe la remise éventuelle et la date
// d'expédition ; le stock est contrôlé puis déduit (flux), les coûts sont figés
// et la facture est générée sur les lignes retenues.
const expedierCommande = async (req, res) => {
  const clientId = clientIdOf(req);
  const laboId = Number(req.body.laboId);
  if (!Number.isFinite(laboId)) return res.status(400).json({ message: 'Labo requis pour expédier la commande' });
  const timbreFiscal = req.body.timbreFiscal !== false;
  const montantTimbre = timbreFiscal ? (Number.isFinite(Number(req.body.montantTimbre)) ? Number(req.body.montantTimbre) : 1.0) : 0;
  if (montantTimbre < 0) return res.status(400).json({ message: 'Timbre invalide' });
  const remiseIn = req.body.remisePct != null && req.body.remisePct !== '' ? Number(req.body.remisePct) : null;
  if (remiseIn !== null && (!Number.isFinite(remiseIn) || remiseIn < 0 || remiseIn > 100)) {
    return res.status(400).json({ message: 'Remise invalide (0 à 100)' });
  }
  const dateExpedition = req.body.dateExpedition || aujourdHui();
  if (!DATE_RE.test(dateExpedition)) return res.status(400).json({ message: 'Date d\'expédition invalide (AAAA-MM-JJ)' });
  // La facture est datée/numérotée à l'expédition : pas d'antidatage hors exercice ni de date future
  const ajd = aujourdHui();
  if (dateExpedition > ajd) return res.status(400).json({ message: 'La date d\'expédition ne peut pas être dans le futur' });
  if (dateExpedition.slice(0, 4) !== ajd.slice(0, 4)) {
    return res.status(400).json({ message: `La date d'expédition doit être dans l'exercice en cours (${ajd.slice(0, 4)})` });
  }
  // Ajustements de quantités { ligneId → quantite } décidés par le vendeur.
  // Une quantité de 0 exactement = ligne RETIRÉE de la commande.
  const quantitesIn = Array.isArray(req.body.quantites) ? req.body.quantites : [];
  const qteMap = new Map();
  for (const q of quantitesIn) {
    const ligneId = Number(q.ligneId);
    const quantite = Number(q.quantite);
    if (!Number.isFinite(ligneId)) return res.status(400).json({ message: 'Ligne de quantité invalide' });
    if (quantite === 0) { qteMap.set(ligneId, 0); continue; }
    if (!Number.isFinite(quantite) || round3(quantite) <= 0 || quantite > MAX_QTE) {
      return res.status(400).json({ message: 'Quantité invalide (supérieure à 0, ou 0 pour retirer la ligne)' });
    }
    qteMap.set(ligneId, round3(quantite));
  }

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const c = await db.query(
      `SELECT ca.*, COALESCE(ach.nom, ca.acheteur_nom) AS acheteur_nom, ach.email AS acheteur_email,
              ach.entreprise AS acheteur_entr, ach.adresse AS acheteur_adr,
              ach.matricule_fiscal AS acheteur_mf, ach.telephone AS acheteur_tel
       FROM commandes_acheteur ca LEFT JOIN acheteurs ach ON ach.id = ca.acheteur_id
       WHERE ca.id = $1 AND ca.client_id = $2 FOR UPDATE OF ca`,
      [req.params.id, clientId]
    );
    if (c.rows.length === 0) { await db.query('ROLLBACK'); return res.status(404).json({ message: 'Commande introuvable' }); }
    const cmd = c.rows[0];
    if (cmd.statut !== 'en_attente') {
      await db.query('ROLLBACK');
      return res.status(409).json({ message: `Cette commande n'est plus en attente (statut : ${cmd.statut})` });
    }
    const labo = await db.query(
      `SELECT l.id, l.nom FROM labos l JOIN profil_entreprise pe ON pe.id = l.entreprise_id
       WHERE l.id = $1 AND pe.client_id = $2`,
      [laboId, clientId]
    );
    if (labo.rows.length === 0) { await db.query('ROLLBACK'); return res.status(404).json({ message: 'Labo introuvable' }); }
    if (!gerantAllowsLabo(req, laboId)) { await db.query('ROLLBACK'); return res.status(403).json({ message: 'Labo hors de votre périmètre' }); }

    const lignesRes = await db.query(`SELECT * FROM commande_acheteur_lignes WHERE commande_id = $1 ORDER BY id FOR UPDATE`, [cmd.id]);
    const lignes = lignesRes.rows;
    if (lignes.length === 0) { await db.query('ROLLBACK'); return res.status(400).json({ message: 'Commande sans ligne' }); }
    // Chronologie : l'expédition ne peut pas précéder la commande
    const dateCommandeIso = cmd.date_commande instanceof Date ? cmd.date_commande.toISOString().slice(0, 10) : cmd.date_commande;
    if (dateExpedition < dateCommandeIso) {
      await db.query('ROLLBACK');
      return res.status(400).json({ message: 'La date d\'expédition ne peut pas précéder la date de commande' });
    }
    // Tout ligneId d'ajustement doit appartenir à CETTE commande (pas d'ignorance silencieuse)
    const idsLignes = new Set(lignes.map((l) => l.id));
    for (const ligneId of qteMap.keys()) {
      if (!idsLignes.has(ligneId)) {
        await db.query('ROLLBACK');
        return res.status(400).json({ message: 'Ajustement de quantité sur une ligne inconnue de cette commande' });
      }
    }

    // Ajustements décidés par le vendeur : quantité 0 = ligne retirée (DELETE),
    // sinon quantité mise à jour (prix figés inchangés). La facture, le stock et
    // les coûts ne portent que sur les lignes retenues.
    const lignesRetenues = [];
    for (const l of lignes) {
      const nouvelle = qteMap.get(l.id);
      if (nouvelle === 0) {
        await db.query(`DELETE FROM commande_acheteur_lignes WHERE id = $1`, [l.id]);
        continue;
      }
      if (nouvelle !== undefined && nouvelle !== Number(l.quantite)) {
        await db.query(
          `UPDATE commande_acheteur_lignes SET quantite = $1, quantite_unites = $1 WHERE id = $2`,
          [nouvelle, l.id]
        );
        l.quantite = nouvelle;
        l.quantite_unites = nouvelle;
      }
      lignesRetenues.push(l);
    }
    if (lignesRetenues.length === 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({ message: 'Toutes les lignes ont été retirées — refusez plutôt la commande' });
    }

    // Contrôle de stock sur le labo choisi (agrégat par article, en unités)
    const besoins = new Map();
    for (const l of lignesRetenues) {
      const key = `${l.article_type}:${l.article_id}`;
      const b = besoins.get(key) || { type: l.article_type, id: l.article_id, nom: l.designation, unites: 0 };
      b.unites = round3(b.unites + Number(l.quantite_unites));
      besoins.set(key, b);
    }
    const manquants = [];
    for (const b of besoins.values()) {
      const dispo = b.type === 'ingredient'
        ? await computeStockCourant('labo', laboId, b.id)
        : await computeStockPTCourant('labo', laboId, b.id);
      if (dispo < b.unites) {
        manquants.push({ nom: b.nom, unite: '', disponible: dispo, necessaire: b.unites, manquant: round3(b.unites - dispo) });
      }
    }
    if (manquants.length > 0) {
      await db.query('ROLLBACK');
      return res.status(422).json({ message: 'Stock labo insuffisant', manquants });
    }

    // Coûts matière figés + facture
    const artIds = [...new Set(lignesRetenues.filter((l) => l.article_type === 'ingredient').map((l) => l.article_id))];
    const prodIds = [...new Set(lignesRetenues.filter((l) => l.article_type === 'produit').map((l) => l.article_id))];
    const { artMap, prodMap } = await buildCostMaps(laboId, artIds, prodIds);
    for (const l of lignesRetenues) {
      const coutU = l.article_type === 'ingredient' ? artMap.get(l.article_id) ?? null : prodMap.get(l.article_id) ?? null;
      await db.query(`UPDATE commande_acheteur_lignes SET cout_unitaire_ttc = $1 WHERE id = $2`, [coutU, l.id]);
    }

    // Remise décidée à l'expédition (défaut : celle déjà portée par la commande, 0 pour le portail)
    const remisePct = remiseIn !== null ? remiseIn : (num(cmd.remise_pct) ?? 0);
    const totaux = computeTotauxFacture(lignesRetenues, remisePct, timbreFiscal, montantTimbre);
    const numero = await nextNumeroFacture(db, clientId, dateExpedition);
    const fact = await db.query(
      `INSERT INTO factures_acheteur
         (client_id, acheteur_id, acheteur_nom, acheteur_entreprise, acheteur_adresse, acheteur_matricule_fiscal, acheteur_telephone, acheteur_email,
          commande_id, numero, date_facture, montant_brut_ttc, remise_pct, montant_ht, montant_tva, timbre_fiscal, montant_timbre, montant_ttc, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING id`,
      [clientId, cmd.acheteur_id, cmd.acheteur_nom, cmd.acheteur_entr, cmd.acheteur_adr, cmd.acheteur_mf, cmd.acheteur_tel, cmd.acheteur_email,
       cmd.id, numero, dateExpedition, totaux.brutTtc, remisePct, totaux.montantHt, totaux.montantTva, timbreFiscal, totaux.montantTimbre, totaux.montantTtc, req.user.id]
    );
    await db.query(
      `UPDATE commandes_acheteur
       SET statut = 'expediee', labo_id = $1, remise_pct = $2, date_expedition = $3, traite_le = NOW(), traite_par = $4
       WHERE id = $5`,
      [laboId, remisePct, dateExpedition, req.user.id, cmd.id]
    );
    await logStatut(db, cmd.id, 'expediee', dateExpedition, null, req.user.id);
    await db.query('COMMIT');

    // Aucun email à l'acheteur sur les changements de statut (décision produit
    // 2026-07-20) : il suit sa commande dans « Mes commandes » sur le portail.

    res.json({
      commande: { id: cmd.id, statut: 'expediee', dateExpedition, laboNom: labo.rows[0].nom },
      facture: { id: fact.rows[0].id, numero, ...totaux },
    });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    if (err.code === '40P01') {
      return res.status(409).json({ message: 'Opération concurrente sur cette commande — réessayez.' });
    }
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    db.release();
  }
};

// POST /api/acheteurs/commandes/:id/livrer — clôture logistique d'une commande
// EXPÉDIÉE : date de livraison + historique (le stock et la facture ne bougent pas).
const livrerCommande = async (req, res) => {
  const clientId = clientIdOf(req);
  const dateLivraison = req.body.dateLivraison || new Date().toISOString().slice(0, 10);
  if (!DATE_RE.test(dateLivraison)) return res.status(400).json({ message: 'Date de livraison invalide (AAAA-MM-JJ)' });
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const c = await db.query(
      `SELECT ca.* FROM commandes_acheteur ca WHERE ca.id = $1 AND ca.client_id = $2 FOR UPDATE`,
      [req.params.id, clientId]
    );
    if (c.rows.length === 0) { await db.query('ROLLBACK'); return res.status(404).json({ message: 'Commande introuvable' }); }
    const cmd = c.rows[0];
    if (cmd.statut !== 'expediee') {
      await db.query('ROLLBACK');
      return res.status(409).json({ message: `Seule une commande expédiée peut être livrée (statut : ${cmd.statut})` });
    }
    if (!gerantAllowsLabo(req, cmd.labo_id)) { await db.query('ROLLBACK'); return res.status(403).json({ message: 'Labo hors de votre périmètre' }); }
    // Chronologie : la livraison ne peut pas précéder l'expédition
    const dateExpIso = cmd.date_expedition instanceof Date ? cmd.date_expedition.toISOString().slice(0, 10) : cmd.date_expedition;
    if (dateExpIso && dateLivraison < dateExpIso) {
      await db.query('ROLLBACK');
      return res.status(400).json({ message: 'La date de livraison ne peut pas précéder la date d\'expédition' });
    }
    await db.query(
      `UPDATE commandes_acheteur SET statut = 'livree', date_livraison = $1, traite_le = NOW(), traite_par = $2 WHERE id = $3`,
      [dateLivraison, req.user.id, cmd.id]
    );
    await logStatut(db, cmd.id, 'livree', dateLivraison, null, req.user.id);
    await db.query('COMMIT');
    res.json({ commande: { id: cmd.id, statut: 'livree', dateLivraison } });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    db.release();
  }
};

// POST /api/acheteurs/commandes/:id/annuler — annulation depuis n'importe quel état.
// Statut → 'annulee' : le stock se réintègre mécaniquement (les CTE ne comptent que
// 'expediee'/'livree'). La facture est SUPPRIMÉE (choix v1 : pas d'avoir).
const annulerCommande = async (req, res) => {
  const clientId = clientIdOf(req);
  const motif = String(req.body.motif || '').trim();
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const c = await db.query(
      // (plus de jointure sur acheteurs : l'email d'annulation a été supprimé)
      `SELECT ca.* FROM commandes_acheteur ca
       WHERE ca.id = $1 AND ca.client_id = $2 FOR UPDATE`,
      [req.params.id, clientId]
    );
    if (c.rows.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ message: 'Commande introuvable' });
    }
    const cmd = c.rows[0];
    if (cmd.statut === 'annulee') {
      await db.query('ROLLBACK');
      return res.status(409).json({ message: 'Commande déjà annulée' });
    }
    // Un gérant n'annule que ses propres ventes — mais peut refuser les commandes
    // du portail (les traiter fait partie de son périmètre).
    if (req.user.role === 'gerant' && cmd.source !== 'portail' && cmd.created_by !== req.user.id) {
      await db.query('ROLLBACK');
      return res.status(403).json({ message: 'Vous ne pouvez annuler que vos propres ventes' });
    }
    // Périmètre labo (même règle que expedier/livrer) : une commande déjà expédiée
    // depuis un labo hors périmètre ne peut pas être annulée par ce gérant.
    if (cmd.labo_id && !gerantAllowsLabo(req, cmd.labo_id)) {
      await db.query('ROLLBACK');
      return res.status(403).json({ message: 'Labo hors de votre périmètre' });
    }
    await db.query(`DELETE FROM factures_acheteur WHERE commande_id = $1`, [cmd.id]);
    await db.query(
      `UPDATE commandes_acheteur
       SET statut = 'annulee', motif_annulation = $1, traite_le = NOW(), traite_par = $2
       WHERE id = $3`,
      [motif || null, req.user.id, cmd.id]
    );
    await logStatut(db, cmd.id, 'annulee', new Date().toISOString().slice(0, 10), motif || null, req.user.id);
    await db.query('COMMIT');
    // Pas d'email à l'acheteur (cf. note dans emailService) : l'annulation et son
    // motif s'affichent dans « Mes commandes » sur le portail.
    const stockConcerne = cmd.statut === 'expediee' || cmd.statut === 'livree';
    res.json({ message: stockConcerne ? 'Commande annulée — le stock a été réintégré' : 'Commande annulée' });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    db.release();
  }
};

// GET /api/acheteurs/factures/:id/pdf — facture fiscale PDF
const downloadFacturePdf = async (req, res) => {
  try {
    const clientId = clientIdOf(req);
    const f = await pool.query(
      `SELECT fa.*, COALESCE(ach.nom, fa.acheteur_nom) AS acheteur_nom,
              CASE WHEN ach.id IS NULL THEN fa.acheteur_entreprise ELSE ach.entreprise END AS acheteur_entreprise,
              CASE WHEN ach.id IS NULL THEN fa.acheteur_adresse ELSE ach.adresse END AS acheteur_adresse,
              CASE WHEN ach.id IS NULL THEN fa.acheteur_matricule_fiscal ELSE ach.matricule_fiscal END AS acheteur_mf,
              CASE WHEN ach.id IS NULL THEN fa.acheteur_telephone ELSE ach.telephone END AS acheteur_tel,
              CASE WHEN ach.id IS NULL THEN fa.acheteur_email ELSE ach.email END AS acheteur_email,
              ca.date_commande, ca.remise_pct AS cmd_remise, ca.notes,
              pe.nom AS vendeur_nom, pe.adresse AS vendeur_adresse, pe.telephone AS vendeur_tel, pe.email AS vendeur_email
       FROM factures_acheteur fa
       LEFT JOIN acheteurs ach ON ach.id = fa.acheteur_id
       JOIN commandes_acheteur ca ON ca.id = fa.commande_id
       LEFT JOIN profil_entreprise pe ON pe.client_id = fa.client_id
       WHERE fa.id = $1 AND fa.client_id = $2`,
      [req.params.id, clientId]
    );
    if (f.rows.length === 0) return res.status(404).json({ message: 'Facture introuvable' });
    const lignes = await pool.query(
      `SELECT * FROM commande_acheteur_lignes WHERE commande_id = $1 ORDER BY id`,
      [f.rows[0].commande_id]
    );
    const buffer = await buildFactureAcheteurPdf(f.rows[0], lignes.rows);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${f.rows[0].numero}.pdf"`);
    res.send(buffer);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Erreur lors de la génération de la facture' });
  }
};

module.exports = {
  listOffres, upsertOffre, getOffreHistorique,
  createVente, listCommandes, getCommande, expedierCommande, livrerCommande, annulerCommande, downloadFacturePdf,
};
