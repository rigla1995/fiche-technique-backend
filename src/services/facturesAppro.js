/* Factures d'approvisionnement saisies (type_source 'manuel') : accès, montants recalculés depuis leurs lignes, facture
 * vidée de sa dernière ligne (étape F1 — labflow-reprise/achats-compta/PLAN-FACTURES.md §3 constats 5 et 7, §4).
 *
 * Une facture d'appro n'a pas de lignes à elle : ce sont les lignes de stock (stock_entreprise_daily pour une activité,
 * stock_labo_daily pour un labo) qui portent son `facture_id`. Ses montants se RECALCULENT depuis ces lignes (au lieu
 * d'être additionnés appel après appel), timbre compris.
 * Toute écriture qui touche une facture d'appro saisie (enregistrement, pièces, modification ou retrait d'une ligne)
 * prend d'abord le verrou consultatif des factures du compte (`verrouillerFactures`) : jamais deux à la fois. */

/** Verrou consultatif des écritures de factures d'un compte : pg_advisory_xact_lock(CLASSE_VERROU, compte). */
const CLASSE_VERROU = 4221;
const verrouillerFactures = (db, clientId) => db.query('SELECT pg_advisory_xact_lock($1, $2)', [CLASSE_VERROU, clientId]);

/** Normalisation d'un numéro de facture pour les comparaisons (même expression que l'index de la migration 221) ; à
 * appliquer aussi au paramètre comparé, en SQL : les deux côtés suivent alors les mêmes règles (espaces, majuscules). */
const SQL_REF_NORMALISEE = (colonne) => `UPPER(REGEXP_REPLACE(${colonne}, '\\s', '', 'g'))`;
const refNormalisee = (ref) => String(ref || '').replace(/\s/g, '').toUpperCase();

/** Identifiant d'adresse : entier positif de 9 chiffres au plus (au-delà, ce n'est pas une ligne de la base) ; sinon null. */
const idValide = (v) => (typeof v === 'string' && /^\d{1,9}$/.test(v) && Number(v) > 0 ? Number(v)
  : (Number.isInteger(v) && v > 0 && v < 1e9 ? v : null));

/** Un texte saisi par l'utilisateur, glissé dans un `message` rendu au bord : ses « [[ » ne sont jamais des balises. */
const sansBalise = (s) => String(s ?? '').replace(/\[\[/g, '[ [').replace(/\]\]/g, '] ]');

const clientDe = (req) => req.user.gerant_parent_id || req.user.id;

/** Le gérant agit sur une facture si elle est rattachée à l'une de ses activités ou de ses labos ; le client toujours. */
const gerantAgitSur = (req, f) => {
  if (req.user.role !== 'gerant') return true;
  if (f.activite_id != null) return (req.user.gerantActiviteIds || []).includes(Number(f.activite_id));
  if (f.labo_id != null) return (req.user.gerantLaboIds || []).includes(Number(f.labo_id));
  return false;
};

/**
 * Clause SQL (alias `f`) qui limite une lecture de factures au périmètre d'un gérant : ses activités, ses labos, et
 * les cessions émises par l'un de ses labos (fournisseur « labo » de la facture). Ajoute ses paramètres à `params`.
 * '' pour un client.
 */
const clauseGerant = (req, params) => {
  if (req.user.role !== 'gerant') return '';
  const a = req.user.gerantActiviteIds || [];
  const l = req.user.gerantLaboIds || [];
  params.push(a.length ? a : [-1]);
  const pa = params.length;
  params.push(l.length ? l : [-1]);
  const pl = params.length;
  return ` AND (f.activite_id = ANY($${pa}::int[]) OR f.labo_id = ANY($${pl}::int[])
             OR f.fournisseur_id IN (SELECT fl.id FROM fournisseurs fl WHERE fl.is_labo = true AND fl.labo_id = ANY($${pl}::int[])))`;
};

/** La facture du compte (ou null), avec de quoi juger le périmètre d'un gérant. `verrou` : FOR UPDATE. */
const factureDuCompte = async (db, factureId, clientId, verrou = false) => {
  const id = idValide(factureId);
  if (!id) return null;
  const r = await db.query(
    `SELECT f.id, f.client_id, f.ref_facture, f.date_facture, f.fournisseur_id, f.activite_id, f.labo_id, f.type_source,
            f.timbre_fiscal, f.montant_ttc,
            (SELECT fl.labo_id FROM fournisseurs fl WHERE fl.id = f.fournisseur_id AND fl.is_labo = true) AS labo_emetteur_id
     FROM factures f WHERE f.id = $1 AND f.client_id = $2${verrou ? ' FOR UPDATE OF f' : ''}`,
    [id, clientId]
  );
  return r.rows[0] || null;
};

/** Le gérant VOIT une facture qu'il peut toucher, ou une cession émise par l'un de ses labos. */
const gerantVoit = (req, f) => gerantAgitSur(req, f)
  || (req.user.role === 'gerant' && f.labo_emetteur_id != null
    && (req.user.gerantLaboIds || []).includes(Number(f.labo_emetteur_id)));

/**
 * Montants d'une facture recalculés depuis ses lignes de stock : HT = Σ q × PU HT et TVA = Σ q × PU HT × taux, chacun
 * arrondi au millime ; TTC = HT + TVA + timbre (comme une facture : le TTC égale la somme des deux montants affichés) ;
 * une ligne sans PU HT compte pour q × PU TTC. → nombre de lignes rattachées.
 */
const recalculerFacture = async (db, factureId) => {
  const r = await db.query(
    `WITH l AS (
       SELECT quantite, prix_unitaire, taux_tva, prix_unitaire_tva FROM stock_entreprise_daily WHERE facture_id = $1
       UNION ALL
       SELECT quantite, prix_unitaire, taux_tva, prix_unitaire_tva FROM stock_labo_daily WHERE facture_id = $1
     ), t AS (
       SELECT COUNT(*)::int AS n,
              ROUND(COALESCE(SUM(COALESCE(quantite, 0) * COALESCE(prix_unitaire, 0)), 0), 3) AS ht,
              ROUND(COALESCE(SUM(COALESCE(quantite, 0) * COALESCE(prix_unitaire, 0) * COALESCE(taux_tva, 0) / 100), 0), 3) AS tva,
              ROUND(COALESCE(SUM(CASE WHEN prix_unitaire IS NULL THEN COALESCE(quantite, 0) * COALESCE(prix_unitaire_tva, 0) ELSE 0 END), 0), 3) AS sans_ht
       FROM l
     )
     UPDATE factures f
        SET montant_ht = t.ht, montant_tva = t.tva,
            montant_ttc = t.ht + t.tva + t.sans_ht + CASE WHEN f.timbre_fiscal THEN COALESCE(f.montant_timbre, 0) ELSE 0 END
       FROM t
      WHERE f.id = $1
     RETURNING t.n`,
    [factureId]
  );
  return r.rows[0] ? r.rows[0].n : 0;
};

/**
 * Après le retrait d'une ligne : recalcule la facture, ou la supprime (avec ses pièces) si c'était sa dernière ligne.
 * À appeler DANS la transaction du retrait, sous `verrouillerFactures`. → { supprimee, clesAEffacer } ; les fichiers
 * s'effacent après la validation.
 */
const apresRetraitDeLigne = async (db, { factureId, clientId, auteurId }) => {
  if (!factureId) return { supprimee: false, clesAEffacer: [] };
  const n = await recalculerFacture(db, factureId);
  if (n > 0) return { supprimee: false, clesAEffacer: [] };
  const f = await db.query('SELECT ref_facture, date_facture, type_source FROM factures WHERE id = $1', [factureId]);
  if (!f.rows[0] || f.rows[0].type_source !== 'manuel') return { supprimee: false, clesAEffacer: [] };
  const pieces = await db.query('SELECT cle, apercu_cle, nom_origine FROM factures_pieces WHERE facture_id = $1', [factureId]);
  await db.query(
    `INSERT INTO factures_journal (client_id, facture_id, action, auteur_id, details) VALUES ($1, NULL, 'facture_supprimee', $2, $3)`,
    [clientId, auteurId, JSON.stringify({
      factureId, ref: f.rows[0].ref_facture, date: f.rows[0].date_facture, motif: 'derniere_ligne',
      pieces: pieces.rows.map((p) => p.nom_origine),
    })]
  );
  await db.query('DELETE FROM factures WHERE id = $1', [factureId]);
  return { supprimee: true, clesAEffacer: pieces.rows.flatMap((p) => [p.cle, p.apercu_cle]).filter(Boolean) };
};

/**
 * Avant de retirer une ligne (dans la transaction du retrait, sous `verrouillerFactures`) : si c'est la dernière de sa
 * facture et que la facture a des pièces, la suppression doit être confirmée (409 DERNIERE_LIGNE_FACTURE) — sauf
 * `confirme`. → corps de la réponse 409, ou null.
 */
const gardeDerniereLigne = async (db, { factureId, table, confirme }) => {
  if (!factureId || confirme) return null;
  const r = await db.query(
    `SELECT f.ref_facture,
            (SELECT COUNT(*)::int FROM ${table} s WHERE s.facture_id = f.id) AS nb_lignes,
            (SELECT COUNT(*)::int FROM factures_pieces p WHERE p.facture_id = f.id) AS nb_pieces
     FROM factures f WHERE f.id = $1`,
    [factureId]
  );
  const f = r.rows[0];
  if (!f || f.nb_lignes > 1 || f.nb_pieces === 0) return null;
  return {
    code: 'DERNIERE_LIGNE_FACTURE',
    refFacture: f.ref_facture,
    nbPieces: f.nb_pieces,
    message: `C'est la dernière ligne de la facture ${sansBalise(f.ref_facture || '')} : la facture et sa pièce jointe seront supprimées.`,
  };
};

/** Un fournisseur cité par une écriture est-il du compte ? (absent : oui). Étape F2 : avant, les anciennes routes de saisie
 * acceptaient l'identifiant d'un fournisseur d'un autre compte — qui ne pouvait plus, ensuite, supprimer sa fiche. */
const fournisseurDuCompte = async (db, clientId, fournisseurId) => {
  if (fournisseurId == null || fournisseurId === '') return true;
  const id = idValide(fournisseurId);
  if (!id) return false;
  const r = await db.query(
    `SELECT 1 FROM fournisseurs f LEFT JOIN profil_entreprise pe ON pe.id = f.entreprise_id
     WHERE f.id = $1 AND (pe.client_id = $2 OR f.client_id = $2)`,
    [id, clientId]
  );
  return r.rows.length > 0;
};

module.exports = {
  fournisseurDuCompte,
  CLASSE_VERROU, verrouillerFactures, SQL_REF_NORMALISEE, refNormalisee, idValide, sansBalise, clientDe, gerantAgitSur,
  gerantVoit, clauseGerant, factureDuCompte, recalculerFacture, apresRetraitDeLigne, gardeDerniereLigne,
};
