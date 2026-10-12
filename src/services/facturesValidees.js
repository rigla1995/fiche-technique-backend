/* Factures fournisseur, étape F3 (labflow-reprise/achats-compta/PLAN-FACTURES.md §4 « Les correspondances ») : la facture
 * LUE puis VALIDÉE dans la fenêtre « Vérifier la facture ».
 *
 * Une facture validée garde ses lignes telles que validées (`factures_lignes`, montants exacts) ; chaque ligne d'article
 * crée une ligne de stock (quantité × conversion, prix par unité de stock) ; les lignes HORS STOCK (transport,
 * consigne…) restent sur la facture seulement. Ses montants viennent de ces lignes, pas des lignes de stock (arrondies).
 * Elle ne se modifie plus et se supprime EN ENTIER (lignes de stock, lignes, pièces). Ce qui a été décidé pour chaque
 * ligne est APPRIS (`correspondances`, par compte et par fournisseur) : la prochaine facture se reconnaît seule.
 * Fonctions pures en tête (testées par test/factures-validees.test.js), puis les écritures en base. */

const NATURES = ['transport', 'livraison', 'consigne', 'service', 'autre'];
const millime = (x) => Math.round(x * 1000) / 1000;

/** Désignation d'une ligne ramenée à sa forme comparable : minuscules, sans accents, ponctuation en espaces (« 1,5 L »
 * garde sa virgule entre chiffres). MÊME RÈGLE que les écrans (factures/lecture/correspondre.ts) : la clé y est
 * calculée pour retrouver une correspondance, ici pour l'enregistrer. */
const normaliserDesignation = (s) => String(s ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
  .replace(/(\d)[.,](\d)/g, '$1,$2')
  .replace(/[^a-z0-9,]+/g, ' ')
  .replace(/(^|\s),+|,+(\s|$)/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

/** Référence produit du fournisseur ramenée à sa forme comparable : lettres et chiffres seulement, en majuscules
 * (« EAU-15 », « eau 15 » et « EAU.15 » sont la même référence, lue ou imprimée différemment). */
const normaliserReference = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '').toUpperCase();

/** Clé d'apprentissage d'une ligne : sa référence produit, sinon sa désignation normalisée ; null si ni l'une ni l'autre. */
const cleDeLigne = ({ reference, designation }) => {
  const ref = normaliserReference(reference).slice(0, 60);
  if (ref) return `ref:${ref}`;
  const des = normaliserDesignation(designation).slice(0, 190);
  return des ? `des:${des}` : null;
};

/**
 * Répartit le pied de la facture et calcule ce que chaque ligne écrit.
 *   lignes : [{ quantite, montant, tauxTva, conversion (lignes d'article), article: bool }]
 *   remiseGlobale, fodec : montants du pied (≥ 0) ; timbre : montant du timbre (0 si aucun)
 * La remise globale baisse chaque ligne au prorata de son montant ; le FODEC s'ajoute au prorata du net ; la TVA se
 * calcule par taux sur (net + FODEC). Le timbre et les lignes hors stock restent sur la facture, hors coût des articles.
 * → { lignes: [{ net, fodec, cout, quantiteStock, prixStock }], ht, fodec, tva, ttc, parTaux: [{ taux, base, montant }] }
 */
const repartir = (lignes, { remiseGlobale = 0, fodec = 0, timbre = 0 } = {}) => {
  const brut = lignes.reduce((s, l) => s + l.montant, 0);
  const remise = Math.min(Math.max(0, remiseGlobale || 0), brut);
  const nets = lignes.map((l) => (brut > 0 ? l.montant - remise * (l.montant / brut) : 0));
  const totalNet = nets.reduce((s, n) => s + n, 0);
  const f = Math.max(0, fodec || 0);
  const calc = lignes.map((l, i) => {
    const net = nets[i];
    const partFodec = totalNet > 0 ? f * (net / totalNet) : 0;
    const cout = net + partFodec;
    if (!l.article) return { net, fodec: partFodec, cout, quantiteStock: null, prixStock: null };
    const quantiteStock = millime(l.quantite * l.conversion);
    const prixStock = quantiteStock > 0 ? millime(cout / (l.quantite * l.conversion)) : null;
    return { net, fodec: partFodec, cout, quantiteStock, prixStock };
  });
  const taux = new Map();
  lignes.forEach((l, i) => taux.set(l.tauxTva, (taux.get(l.tauxTva) ?? 0) + calc[i].cout));
  const parTaux = [...taux].sort((a, b) => a[0] - b[0])
    .map(([t, base]) => ({ taux: t, base: millime(base), montant: millime(base * t / 100) }));
  const ht = millime(brut - remise);
  const fodecArrondi = millime(f);
  const tva = millime(parTaux.reduce((s, x) => s + x.montant, 0));
  const ttc = millime(ht + fodecArrondi + tva + (timbre || 0));
  return { lignes: calc, ht, fodec: fodecArrondi, tva, ttc, parTaux };
};

// ── En base ────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Message rendu quand on touche à une ligne d'une facture validée. */
const MESSAGE_VALIDEE = 'Cette ligne vient d\'une facture validée : elle ne se modifie plus. Pour la refaire, supprimez la facture entière (page Factures), puis déposez-la de nouveau.';
const refusValidee = { code: 'FACTURE_VALIDEE', message: MESSAGE_VALIDEE };

/** La facture `factureId` est-elle validée ? (absente : non) */
const estValidee = async (db, factureId) => {
  if (!factureId) return false;
  const r = await db.query('SELECT validee_le IS NOT NULL AS v FROM factures WHERE id = $1', [factureId]);
  return r.rows[0]?.v === true;
};

/**
 * Apprend les décisions d'une facture validée : une correspondance par clé (la dernière ligne d'une même clé l'emporte),
 * créée ou remplacée (« la dernière décision l'emporte ») ; `emplois` compte les factures qui l'ont confirmée.
 * → nombre de correspondances écrites.
 */
const apprendre = async (db, { clientId, fournisseurId, auteurId, lignes }) => {
  const parCle = new Map();
  for (const l of lignes) {
    const cle = cleDeLigne(l);
    if (cle) parCle.set(cle, l);
  }
  for (const [cle, l] of parCle) {
    await db.query(
      `INSERT INTO correspondances (client_id, fournisseur_id, cle, designation, reference, unite_facture, article_id,
                                    nature_hors_stock, conversion, emplois, derniere_fois, auteur_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, NOW(), $10)
       ON CONFLICT (client_id, fournisseur_id, cle) DO UPDATE
         SET designation = EXCLUDED.designation, reference = EXCLUDED.reference, unite_facture = EXCLUDED.unite_facture,
             article_id = EXCLUDED.article_id, nature_hors_stock = EXCLUDED.nature_hors_stock,
             conversion = EXCLUDED.conversion, emplois = correspondances.emplois + 1, derniere_fois = NOW(),
             auteur_id = EXCLUDED.auteur_id`,
      [clientId, fournisseurId, cle, l.designation.slice(0, 300), l.reference ? l.reference.slice(0, 60) : null,
        l.unite ? l.unite.slice(0, 30) : null, l.articleId ?? null, l.articleId ? null : l.horsStock,
        l.articleId ? l.conversion : 1, auteurId]
    );
  }
  return parCle.size;
};

/**
 * Supprime une facture validée EN ENTIER : ses lignes de stock, ses lignes, ses pièces (fichiers effacés après la
 * validation de la transaction, par l'appelant), la facture ; journal « facture_supprimee ». À appeler dans une
 * transaction, sous `verrouillerFactures` (et, pour un labo, après le verrou du stock du labo).
 * → { clesAEffacer, nbStock }.
 */
const supprimerFactureValidee = async (db, { facture, clientId, auteurId }) => {
  const e = await db.query('DELETE FROM stock_entreprise_daily WHERE facture_id = $1 RETURNING id', [facture.id]);
  const l = await db.query('DELETE FROM stock_labo_daily WHERE facture_id = $1 RETURNING id', [facture.id]);
  const pieces = await db.query('SELECT cle, apercu_cle, nom_origine FROM factures_pieces WHERE facture_id = $1', [facture.id]);
  const n = await db.query('SELECT COUNT(*)::int AS n FROM factures_lignes WHERE facture_id = $1', [facture.id]);
  await db.query(
    `INSERT INTO factures_journal (client_id, facture_id, action, auteur_id, details) VALUES ($1, NULL, 'facture_supprimee', $2, $3)`,
    [clientId, auteurId, JSON.stringify({
      factureId: facture.id, ref: facture.ref_facture, date: facture.date_facture, motif: 'facture_validee_supprimee',
      lignes: n.rows[0].n, lignesStock: e.rowCount + l.rowCount, pieces: pieces.rows.map((p) => p.nom_origine),
    })]
  );
  await db.query('DELETE FROM factures WHERE id = $1', [facture.id]);
  return { clesAEffacer: pieces.rows.flatMap((p) => [p.cle, p.apercu_cle]).filter(Boolean), nbStock: e.rowCount + l.rowCount };
};

module.exports = {
  NATURES, millime, normaliserDesignation, normaliserReference, cleDeLigne, repartir,
  MESSAGE_VALIDEE, refusValidee, estValidee, apprendre, supprimerFactureValidee,
};
