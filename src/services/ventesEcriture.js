// Enregistrement d'une vente : le cœur de la saisie (POST /api/ventes), extrait tel quel du contrôleur pour que l'import
// d'un fichier de caisse (V1a — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §5 bis) crée ses ventes avec
// EXACTEMENT les mêmes règles : conditions du prestataire figées, coût de chaque ligne, sorties de stock.
//   verifierVente  contrôles avant écriture (prestataire activé et réglé, lignes en vente sur le canal) ;
//   ecrireVente    la vente, ses lignes et les sorties de stock, dans la transaction de l'appelant.
// Un refus est une erreur portant `status` et `code`.
const { prestatairesActifsPourClient } = require('./domaineProfilService');
const canauxVente = require('./canauxVente');

const MSG_PRESTATAIRES_DESACTIVES = 'Les [[pl:prestataire]] de livraison ne sont pas proposés à ce compte (règle du domaine ou réglage de l\'administrateur).';
const refus = (status, code, message) => Object.assign(new Error(message), { status, code });

/**
 * Contrôles d'une vente avant écriture. `db` = pool ou client d'une transaction. L'appartenance de l'activité (ou du
 * labo) au compte et l'activation de la vente sont vérifiées par l'appelant.
 * Rend { conditions, moduleVenteActif }.
 */
async function verifierVente(db, { clientId, activite_id, labo_id, type_vente, prestataire_id, lignes = [] }) {
    // P2 : une vente par prestataire FIGE les conditions du prestataire pour cette activité (commission, TVA sur la
    // commission, mode de paiement). Prestataire non activé ici, ou conditions pas encore renseignées : refus.
    let conditions = { taux_commission: null, taux_tva_commission: null, mode_paiement_id: null };
    if (type_vente === 'prestataire') {
      if (!(await prestatairesActifsPourClient(clientId))) throw refus(409, 'PRESTATAIRES_DESACTIVES', MSG_PRESTATAIRES_DESACTIVES);
      if (!prestataire_id) throw refus(400, 'PRESTATAIRE_REQUIS', 'Choisissez [[le:prestataire]] de [[ce:vente]].');
      const lien = await db.query(
        `SELECT taux_commission, taux_tva, mode_paiement_id FROM activite_prestataires
          WHERE prestataire_id = $1 AND actif = true AND ${activite_id ? 'activite_id = $2' : 'labo_id = $2'}`,
        [prestataire_id, activite_id || labo_id]
      );
      if (!lien.rows.length) throw refus(400, 'PRESTATAIRE_NON_ACTIVE', "[[Ce:prestataire]] n'est pas [[acc:prestataire:activé:activée]] pour [[ce:activite]].");
      if (lien.rows[0].mode_paiement_id == null) {
        throw refus(400, 'CONDITIONS_MANQUANTES', 'Renseignez d\'abord la commission, la TVA et le mode de paiement [[du:prestataire]] (Config [[Court:prestataire:pl]]).');
      }
      conditions = { taux_commission: lien.rows[0].taux_commission, taux_tva_commission: lien.rows[0].taux_tva, mode_paiement_id: lien.rows[0].mode_paiement_id };
    }

    // C1 : chaque ligne doit être en vente sur le canal de la vente (case cochée dans Configuration vente).
    if (activite_id) {
      await canauxVente.exigerLignesEnVente(db, { activiteId: activite_id, typeVente: type_vente, prestataireId: prestataire_id, lignes });
    }

    // Check module_vente_actif for stock deduction
    let moduleVenteActif = false;
    if (activite_id) {
      const mvRes = await db.query(
        `SELECT pe.module_vente_actif FROM profil_entreprise pe
         JOIN activites a ON a.entreprise_id = pe.id WHERE a.id = $1`,
        [activite_id]
      );
      moduleVenteActif = mvRes.rows[0]?.module_vente_actif === true;
    }

    return { conditions, moduleVenteActif };
}

/**
 * Écrit la vente dans la transaction de `client` : la ligne `ventes`, ses lignes (avec leur coût), les sorties de stock.
 * `importId` = l'import de caisse qui la crée (null pour une saisie). Rend la ligne `ventes`.
 */
async function ecrireVente(client, { activite_id, labo_id, date_vente, type_vente, prestataire_id, notes, lignes = [], userId, conditions, moduleVenteActif, importId = null }) {
    const vRes = await client.query(
      `INSERT INTO ventes (activite_id, labo_id, date_vente, type_vente, prestataire_id, statut, notes, created_by,
                           taux_commission, taux_tva_commission, mode_paiement_id, import_id)
       VALUES ($1, $2, $3, $4, $5, 'confirmee', $6, $7, $8, $9, $10, $11) RETURNING *`,
      [activite_id || null, labo_id || null,
       date_vente || new Date().toISOString().slice(0, 10), type_vente,
       prestataire_id || null, notes || null, userId,
       conditions.taux_commission, conditions.taux_tva_commission, conditions.mode_paiement_id, importId]
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
          const nf = await client.query(`INSERT INTO fournisseurs (entreprise_id, nom, created_by) VALUES ($1, 'AUTO', $2) RETURNING id`, [ent.rows[0].entreprise_id, userId]);
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
          [activite_id, ingredientId, -total, dateApproValue, c, venteAutoFournId, `vente-${dateApproValue}`, userId]
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
          `INSERT INTO stock_produits_transformes (produit_id, activite_id, date_appro, quantite, prix_calcule, created_by)
           VALUES ($1, $2, $3, $4, NULL, $5)`,
          [sousProduitId, activite_id, dateApproValue, -total, userId]
        );
      }
    }

    return vente;
}

module.exports = { verifierVente, ecrireVente, MSG_PRESTATAIRES_DESACTIVES };
