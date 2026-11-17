// Recette propre à un canal (étape C2 — labflow-reprise/ventes-cartes/PLAN-VENTES-CARTES.md §2.3) : accès à la base.
// Règles pures : src/utils/variantesProduit.js. Une variante est un produit complet (recette, coût, stock, marge), lié à
// son produit d'origine ; elle le remplace sur les canaux choisis, au même prix.
const CS = require('./codesArticlesService');
const canaux = require('./canauxVente');
const V = require('../utils/variantesProduit');

const refus = (r) => new V.ErreurVariante(r.status, r.code, r.message);

/** Ce que le produit d'origine fait sur un canal : son prix (null = aucun) et s'il y est en vente. */
async function etatSur(db, activiteId, produitId, canal) {
  const av = (await db.query(
    `SELECT id, prix_vente, actif, directe FROM activite_articles_vendables
      WHERE activite_id = $1 AND article_type = 'produit' AND article_id = $2`,
    [activiteId, produitId]
  )).rows[0];
  if (!av) return { prix: null, enVente: false };
  if (canal.directe) {
    const prix = parseFloat(av.prix_vente);
    return { prix: prix > 0 ? prix : null, enVente: Boolean(av.actif && av.directe) };
  }
  const app = (await db.query(
    'SELECT prix_vente, en_vente FROM article_prix_prestataire WHERE article_vendable_id = $1 AND activite_prestataire_id = $2',
    [av.id, canal.lienId]
  )).rows[0];
  const prix = app && app.prix_vente != null ? parseFloat(app.prix_vente) : null;
  return { prix: prix > 0 ? prix : null, enVente: Boolean(av.actif && app && app.en_vente && prix > 0) };
}

/**
 * Crée la variante `libelle` du produit `produitId` pour l'activité, dans la transaction de `db` :
 *   1. copie du produit (catégorie, unité, supplément…) et de sa recette (articles et sous-produits), code propre ;
 *   2. affectation à l'activité ;
 *   3. sur chaque canal choisi, la variante prend le prix du produit d'origine et se met en vente à sa place (le
 *      produit d'origine y est décoché, son prix gardé). Un canal où l'origine n'a pas de prix : la variante y reste
 *      à régler (rendu dans `canaux` avec prix null).
 * Rend { variante (ligne produits), canaux: [{ canal, prix, en_vente }] }.
 */
async function creer(db, { clientId, userId, produitId, activiteId, libelle, canaux: choisis }) {
  const parent = (await db.query('SELECT * FROM produits WHERE id = $1 AND client_id = $2 FOR UPDATE', [produitId, clientId])).rows[0];
  if (!parent) throw new V.ErreurVariante(404, 'PRODUIT_INTROUVABLE', '[[Nom:produit]] introuvable');
  const non = V.refusParent(parent);
  if (non) throw refus(non);

  const activite = await db.query(
    'SELECT 1 FROM activites a JOIN profil_entreprise pe ON pe.id = a.entreprise_id WHERE a.id = $1 AND pe.client_id = $2',
    [activiteId, clientId]
  );
  if (!activite.rows.length) throw new V.ErreurVariante(403, 'ACCES_REFUSE', 'Accès refusé');
  const affecte = await db.query(
    `SELECT 1 FROM produits p
      WHERE p.id = $1 AND (p.activite_id = $2
         OR EXISTS (SELECT 1 FROM produit_activite_affectation paa WHERE paa.produit_id = p.id AND paa.activite_id = $2))`,
    [produitId, activiteId]
  );
  if (!affecte.rows.length) {
    throw new V.ErreurVariante(400, 'HORS_ACTIVITE', "[[Ce:produit]] n'est pas [[acc:produit:affecté:affectée]] à [[ce:activite]].");
  }
  const liens = await canaux.liensDe(db, activiteId);
  for (const canal of choisis) canaux.exigerLien(liens, canal);

  const doublon = await db.query(
    'SELECT 1 FROM produits WHERE variante_de_id = $1 AND LOWER(variante_libelle) = LOWER($2)',
    [produitId, libelle]
  );
  if (doublon.rows.length) throw new V.ErreurVariante(409, 'VARIANTE_EXISTANTE', `[[Ce:produit]] a déjà une variante « ${libelle} ».`);

  const code = await CS.codePourFiche(db, clientId, { code: null, categorieId: parent.categorie_produit_id, genre: 'produit' });
  const variante = (await db.query(
    `INSERT INTO produits (nom, description, ref_produit, type, is_supplement, is_stock_ingredient, client_id, activite_id,
                           categorie_produit_id, origine, created_by, unite_id, quantite_produite, variante_de_id, variante_libelle)
     VALUES ($1, $2, $3, 'vendable', $4, false, $5, $6, $7, 'activite', $8, $9, $10, $11, $12)
     RETURNING *, (SELECT u.nom FROM unites u WHERE u.id = produits.unite_id) AS unite_nom,
               (SELECT cp.nom FROM categories_produit cp WHERE cp.id = produits.categorie_produit_id) AS categorie_produit_nom`,
    [V.nomVariante(parent.nom, libelle), parent.description, code, parent.is_supplement === true, clientId, activiteId,
      parent.categorie_produit_id, userId, parent.unite_id, parent.quantite_produite, parent.id, libelle]
  )).rows[0];
  variante.variante_de_nom = parent.nom;

  await db.query(
    `INSERT INTO produit_ingredients (produit_id, ingredient_id, portion, unite_id)
     SELECT $1, ingredient_id, portion, unite_id FROM produit_ingredients WHERE produit_id = $2`,
    [variante.id, parent.id]
  );
  await db.query(
    `INSERT INTO produit_sous_produits (produit_id, sous_produit_id, portion)
     SELECT $1, sous_produit_id, portion FROM produit_sous_produits WHERE produit_id = $2`,
    [variante.id, parent.id]
  );
  await db.query(
    'INSERT INTO produit_activite_affectation (produit_id, activite_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
    [variante.id, activiteId]
  );

  const cellules = [];
  const bilan = [];
  for (const canal of choisis) {
    const etat = await etatSur(db, activiteId, parent.id, canal);
    if (etat.prix != null) cellules.push({ articleType: 'produit', articleId: variante.id, canal, prix: etat.prix, enVente: true });
    if (etat.enVente) cellules.push({ articleType: 'produit', articleId: parent.id, canal, prix: undefined, enVente: false });
    bilan.push({ canal: canal.directe ? 'directe' : canal.lienId, prix: etat.prix, en_vente: etat.prix != null });
  }
  if (cellules.length) await canaux.modifierCellules(db, { activiteId, clientId, userId, cellules });
  return { variante, canaux: bilan };
}

/** Le produit a-t-il des variantes ? (Il ne se supprime pas avant elles.) */
async function nombreDeVariantes(db, produitId) {
  return (await db.query('SELECT COUNT(*)::int AS n FROM produits WHERE variante_de_id = $1', [produitId])).rows[0].n;
}

/** Le produit d'origine change de nom : ses variantes encore nommées « Ancien nom — Libellé » suivent. */
async function renommerVariantes(db, produitId, ancienNom, nouveauNom) {
  if (!nouveauNom || ancienNom === nouveauNom) return 0;
  const r = await db.query('SELECT id, nom, variante_libelle FROM produits WHERE variante_de_id = $1', [produitId]);
  let n = 0;
  for (const v of r.rows) {
    if (!v.variante_libelle || v.nom !== V.nomVariante(ancienNom, v.variante_libelle)) continue;
    await db.query('UPDATE produits SET nom = $1, updated_at = NOW() WHERE id = $2', [V.nomVariante(nouveauNom, v.variante_libelle), v.id]);
    n++;
  }
  return n;
}

module.exports = { creer, nombreDeVariantes, renommerVariantes, etatSur };
