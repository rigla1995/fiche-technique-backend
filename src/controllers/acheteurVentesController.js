const pool = require('../config/database');
const { computeStockCourant, computeStockPTCourant } = require('../utils/stockUtils');
const { gerantAllowsLabo } = require('../middleware/auth');
const { buildFactureAcheteurPdf } = require('../services/factureAcheteurPdf');

const clientIdOf = (req) => req.user.gerant_parent_id || req.user.id;
const num = (v) => (v === null || v === undefined ? null : Number(v));
const round3 = (v) => Math.round(v * 1000) / 1000;
// Prix TTC dérivé d'un prix HT et d'un taux de TVA (les tarifs acheteurs sont saisis HT).
const ttcDeHt = (ht, tva) => round3(Number(ht || 0) * (1 + (Number(tva) || 0) / 100));

// ═══════════════════════════════════════════════════════════════════════════
// OFFRES (tarifs acheteurs) — prix unitaire HT + taux TVA (TTC dérivé)
// ═══════════════════════════════════════════════════════════════════════════

const mapOffre = (row) => row ? ({
  offreId: row.id,
  prixUnitaireHt: num(row.prix_unitaire_ht) ?? 0,
  tauxTva: num(row.taux_tva) ?? 0,
  prixUnitaireTtc: ttcDeHt(row.prix_unitaire_ht, row.taux_tva),
  actif: row.actif === true,
}) : ({ offreId: null, prixUnitaireHt: 0, tauxTva: 0, prixUnitaireTtc: 0, actif: false });

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
                o.id AS o_id, o.prix_unitaire_ht, o.taux_tva, o.actif
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
        `SELECT p.id, p.nom, p.type, p.origine,
                o.id AS o_id, o.prix_unitaire_ht, o.taux_tva, o.actif
         FROM produits p
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

  if (!Number.isFinite(prixU) || prixU < 0) return res.status(400).json({ message: 'Prix unitaire invalide' });
  if (!Number.isFinite(tva) || tva < 0 || tva > 100) return res.status(400).json({ message: 'Taux de TVA invalide (0 à 100)' });
  if (actif && prixU <= 0) return res.status(400).json({ message: 'Impossible d\'activer une offre sans prix unitaire > 0' });

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
      `INSERT INTO acheteur_offres (client_id, article_type, article_id, prix_unitaire_ht, taux_tva, actif)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (client_id, article_type, article_id) DO UPDATE
       SET prix_unitaire_ht = EXCLUDED.prix_unitaire_ht,
           taux_tva = EXCLUDED.taux_tva,
           actif = EXCLUDED.actif,
           updated_at = NOW()
       RETURNING *`,
      [clientId, articleType, articleId, prixU, tva, actif]
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

// POST /api/acheteurs/ventes — vente manuelle (commande source=client, validée d'office).
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
      if (!Number.isFinite(quantite) || quantite <= 0) return res.status(400).json({ message: `Ligne ${i + 1} : quantité invalide` });
      // != null : un prixHt absent OU null (JSON) retombe sur le tarif de l'offre
      const prixHt = l.prixHt != null && l.prixHt !== '' ? Number(l.prixHt) : num(offre.prix_unitaire_ht);
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
        `INSERT INTO commandes_acheteur (client_id, acheteur_id, labo_id, statut, source, remise_pct, date_commande, notes, traite_le, traite_par, created_by)
         VALUES ($1, $2, $3, 'validee', 'client', $4, $5, $6, NOW(), $7, $7)
         RETURNING *`,
        [clientId, acheteurId, laboId, remisePct, dateCommande, notes || null, req.user.id]
      );
      const commande = cmd.rows[0];
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
      const fact = await db.query(
        `INSERT INTO factures_acheteur
           (client_id, acheteur_id, commande_id, numero, date_facture, montant_brut_ttc, remise_pct, montant_ht, montant_tva, timbre_fiscal, montant_timbre, montant_ttc)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         RETURNING *`,
        [clientId, acheteurId, commande.id, numero, dateCommande, brutTtc, remisePct, montantHt, montantTva, timbreFiscal, montantTimbre, montantTtc]
      );
      await db.query('COMMIT');
      res.status(201).json({
        commande: { id: commande.id, statut: commande.statut, dateCommande, remisePct, acheteurNom: ach.rows[0].nom, laboNom: labo.rows[0].nom },
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
    if (req.query.statut && ['en_attente', 'validee', 'annulee'].includes(req.query.statut)) {
      params.push(req.query.statut);
      conds.push(`ca.statut = $${params.length}`);
    }
    if (req.query.acheteurId) { params.push(req.query.acheteurId); conds.push(`ca.acheteur_id = $${params.length}`); }
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
      `SELECT ca.*, ach.nom AS acheteur_nom, ach.entreprise AS acheteur_entreprise, l.nom AS labo_nom,
              fa.id AS facture_id, fa.numero AS facture_numero, fa.montant_ttc AS facture_ttc,
              (SELECT COUNT(*)::int FROM commande_acheteur_lignes cal WHERE cal.commande_id = ca.id) AS nb_lignes,
              (SELECT COALESCE(SUM(cal.prix_ttc * cal.quantite), 0) FROM commande_acheteur_lignes cal WHERE cal.commande_id = ca.id) AS total_brut,
              ub.nom AS created_by_nom
       FROM commandes_acheteur ca
       JOIN acheteurs ach ON ach.id = ca.acheteur_id
       LEFT JOIN labos l ON l.id = ca.labo_id
       LEFT JOIN factures_acheteur fa ON fa.commande_id = ca.id
       LEFT JOIN utilisateurs ub ON ub.id = ca.created_by
       WHERE ${conds.join(' AND ')}
       ORDER BY ca.date_commande DESC, ca.created_at DESC
       LIMIT ${limit}`,
      params
    );
    res.json(r.rows.map((c) => ({
      id: c.id,
      dateCommande: c.date_commande instanceof Date ? c.date_commande.toISOString().slice(0, 10) : c.date_commande,
      statut: c.statut,
      source: c.source,
      acheteurId: c.acheteur_id,
      acheteurNom: c.acheteur_nom,
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
      `SELECT ca.*, ach.nom AS acheteur_nom, l.nom AS labo_nom,
              fa.id AS facture_id, fa.numero AS facture_numero, fa.montant_ht, fa.montant_tva,
              fa.timbre_fiscal, fa.montant_timbre, fa.montant_ttc, fa.montant_brut_ttc
       FROM commandes_acheteur ca
       JOIN acheteurs ach ON ach.id = ca.acheteur_id
       LEFT JOIN labos l ON l.id = ca.labo_id
       LEFT JOIN factures_acheteur fa ON fa.commande_id = ca.id
       WHERE ca.id = $1 AND ca.client_id = $2`,
      [req.params.id, clientId]
    );
    if (c.rows.length === 0) return res.status(404).json({ message: 'Commande introuvable' });
    const lignes = await pool.query(
      `SELECT * FROM commande_acheteur_lignes WHERE commande_id = $1 ORDER BY id`,
      [req.params.id]
    );
    const row = c.rows[0];
    res.json({
      id: row.id,
      dateCommande: row.date_commande instanceof Date ? row.date_commande.toISOString().slice(0, 10) : row.date_commande,
      statut: row.statut,
      source: row.source,
      acheteurId: row.acheteur_id,
      acheteurNom: row.acheteur_nom,
      laboId: row.labo_id,
      laboNom: row.labo_nom,
      remisePct: num(row.remise_pct) ?? 0,
      notes: row.notes,
      motifAnnulation: row.motif_annulation,
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

// POST /api/acheteurs/commandes/:id/valider — validation d'une commande PORTAIL
// (en attente) : le vendeur choisit le labo source ET la remise éventuelle de la
// commande, le stock est contrôlé puis déduit (flux), les coûts sont figés et la
// facture est générée.
const validerCommande = async (req, res) => {
  const clientId = clientIdOf(req);
  const laboId = Number(req.body.laboId);
  if (!Number.isFinite(laboId)) return res.status(400).json({ message: 'Labo requis pour valider la commande' });
  const timbreFiscal = req.body.timbreFiscal !== false;
  const montantTimbre = timbreFiscal ? (Number.isFinite(Number(req.body.montantTimbre)) ? Number(req.body.montantTimbre) : 1.0) : 0;
  if (montantTimbre < 0) return res.status(400).json({ message: 'Timbre invalide' });
  const remiseIn = req.body.remisePct != null && req.body.remisePct !== '' ? Number(req.body.remisePct) : null;
  if (remiseIn !== null && (!Number.isFinite(remiseIn) || remiseIn < 0 || remiseIn > 100)) {
    return res.status(400).json({ message: 'Remise invalide (0 à 100)' });
  }

  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const c = await db.query(
      `SELECT ca.*, ach.nom AS acheteur_nom, ach.email AS acheteur_email
       FROM commandes_acheteur ca JOIN acheteurs ach ON ach.id = ca.acheteur_id
       WHERE ca.id = $1 AND ca.client_id = $2 FOR UPDATE OF ca`,
      [req.params.id, clientId]
    );
    if (c.rows.length === 0) { await db.query('ROLLBACK'); return res.status(404).json({ message: 'Commande introuvable' }); }
    const cmd = c.rows[0];
    if (cmd.statut !== 'en_attente') {
      await db.query('ROLLBACK');
      return res.status(409).json({ message: `Cette commande est déjà ${cmd.statut === 'validee' ? 'validée' : 'annulée'}` });
    }
    const labo = await db.query(
      `SELECT l.id, l.nom FROM labos l JOIN profil_entreprise pe ON pe.id = l.entreprise_id
       WHERE l.id = $1 AND pe.client_id = $2`,
      [laboId, clientId]
    );
    if (labo.rows.length === 0) { await db.query('ROLLBACK'); return res.status(404).json({ message: 'Labo introuvable' }); }
    if (!gerantAllowsLabo(req, laboId)) { await db.query('ROLLBACK'); return res.status(403).json({ message: 'Labo hors de votre périmètre' }); }

    const lignesRes = await db.query(`SELECT * FROM commande_acheteur_lignes WHERE commande_id = $1 ORDER BY id`, [cmd.id]);
    const lignes = lignesRes.rows;
    if (lignes.length === 0) { await db.query('ROLLBACK'); return res.status(400).json({ message: 'Commande sans ligne' }); }

    // Contrôle de stock sur le labo choisi (agrégat par article, en unités)
    const besoins = new Map();
    for (const l of lignes) {
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
    const artIds = [...new Set(lignes.filter((l) => l.article_type === 'ingredient').map((l) => l.article_id))];
    const prodIds = [...new Set(lignes.filter((l) => l.article_type === 'produit').map((l) => l.article_id))];
    const { artMap, prodMap } = await buildCostMaps(laboId, artIds, prodIds);
    for (const l of lignes) {
      const coutU = l.article_type === 'ingredient' ? artMap.get(l.article_id) ?? null : prodMap.get(l.article_id) ?? null;
      await db.query(`UPDATE commande_acheteur_lignes SET cout_unitaire_ttc = $1 WHERE id = $2`, [coutU, l.id]);
    }

    // Remise décidée à la validation (défaut : celle déjà portée par la commande, 0 pour le portail)
    const remisePct = remiseIn !== null ? remiseIn : (num(cmd.remise_pct) ?? 0);
    const totaux = computeTotauxFacture(lignes, remisePct, timbreFiscal, montantTimbre);
    const dateFacture = new Date().toISOString().slice(0, 10);
    const numero = await nextNumeroFacture(db, clientId, dateFacture);
    const fact = await db.query(
      `INSERT INTO factures_acheteur
         (client_id, acheteur_id, commande_id, numero, date_facture, montant_brut_ttc, remise_pct, montant_ht, montant_tva, timbre_fiscal, montant_timbre, montant_ttc)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING id`,
      [clientId, cmd.acheteur_id, cmd.id, numero, dateFacture, totaux.brutTtc, remisePct, totaux.montantHt, totaux.montantTva, timbreFiscal, totaux.montantTimbre, totaux.montantTtc]
    );
    await db.query(
      `UPDATE commandes_acheteur SET statut = 'validee', labo_id = $1, remise_pct = $2, traite_le = NOW(), traite_par = $3 WHERE id = $4`,
      [laboId, remisePct, req.user.id, cmd.id]
    );
    await db.query('COMMIT');

    // Email à l'acheteur (best-effort)
    if (cmd.acheteur_email) {
      const { sendCommandeAcheteurEmail } = require('../services/emailService');
      sendCommandeAcheteurEmail({
        to: cmd.acheteur_email, nom: cmd.acheteur_nom, statut: 'validee',
        numero, montantTtc: totaux.montantTtc,
      }).catch((e) => console.error('Email commande acheteur:', e));
    }

    res.json({
      commande: { id: cmd.id, statut: 'validee', laboNom: labo.rows[0].nom },
      facture: { id: fact.rows[0].id, numero, ...totaux },
    });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error(err);
    res.status(500).json({ message: 'Erreur serveur' });
  } finally {
    db.release();
  }
};

// POST /api/acheteurs/commandes/:id/annuler — annulation (motif requis).
// Statut → 'annulee' : le stock se réintègre mécaniquement (CTE sur statut='validee').
// La facture est SUPPRIMÉE (choix v1 : pas d'avoir ; trou de numérotation possible).
const annulerCommande = async (req, res) => {
  const clientId = clientIdOf(req);
  const motif = String(req.body.motif || '').trim();
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    const c = await db.query(
      `SELECT ca.*, ach.nom AS acheteur_nom, ach.email AS acheteur_email
       FROM commandes_acheteur ca JOIN acheteurs ach ON ach.id = ca.acheteur_id
       WHERE ca.id = $1 AND ca.client_id = $2 FOR UPDATE OF ca`,
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
    await db.query(`DELETE FROM factures_acheteur WHERE commande_id = $1`, [cmd.id]);
    await db.query(
      `UPDATE commandes_acheteur
       SET statut = 'annulee', motif_annulation = $1, traite_le = NOW(), traite_par = $2
       WHERE id = $3`,
      [motif || null, req.user.id, cmd.id]
    );
    await db.query('COMMIT');
    // Une commande passée depuis le portail : prévenir l'acheteur (best-effort)
    if (cmd.source === 'portail' && cmd.acheteur_email) {
      const { sendCommandeAcheteurEmail } = require('../services/emailService');
      sendCommandeAcheteurEmail({ to: cmd.acheteur_email, nom: cmd.acheteur_nom, statut: 'annulee', motif })
        .catch((e) => console.error('Email commande acheteur:', e));
    }
    res.json({ message: cmd.statut === 'validee' ? 'Commande annulée — le stock a été réintégré' : 'Commande annulée' });
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
      `SELECT fa.*, ach.nom AS acheteur_nom, ach.entreprise AS acheteur_entreprise, ach.adresse AS acheteur_adresse,
              ach.matricule_fiscal AS acheteur_mf, ach.telephone AS acheteur_tel, ach.email AS acheteur_email,
              ca.date_commande, ca.remise_pct AS cmd_remise, ca.notes,
              pe.nom AS vendeur_nom, pe.adresse AS vendeur_adresse, pe.telephone AS vendeur_tel, pe.email AS vendeur_email
       FROM factures_acheteur fa
       JOIN acheteurs ach ON ach.id = fa.acheteur_id
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
  createVente, listCommandes, getCommande, validerCommande, annulerCommande, downloadFacturePdf,
};
