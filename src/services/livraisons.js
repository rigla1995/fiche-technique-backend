/* Module « Livreurs », étape L3 — ce que les contrôleurs partagent sur les tentatives de livraison
 * (`commande_livraisons`, migration 253) : motifs d'échec, option d'encaissement du compte, dernière tentative d'une
 * commande et sa forme dans l'API. Aucune dépendance vers un contrôleur (importé par livraisons, acheteurVentes,
 * livreurs et portail). */

const MOTIFS = {
  absent: 'Client absent',
  adresse_introuvable: 'Adresse introuvable',
  refus: 'Refus du client',
  marchandise_abimee: 'Marchandise abîmée',
  autre: 'Autre',
};

/** Le compte fait-il encaisser ses livreurs ? (abonnement_config.livreurs_encaissement du dernier abonnement) */
const encaissementDe = async (db, clientId) => {
  const r = await db.query(
    `SELECT ac.livreurs_encaissement FROM abonnements a JOIN abonnement_config ac ON ac.abonnement_id = a.id
      WHERE a.client_id = $1 ORDER BY a.id DESC LIMIT 1`,
    [clientId]
  );
  return r.rows[0]?.livreurs_encaissement === true;
};

/** Modes de paiement actifs (référentiel partagé : espèces, virement, chèque, carte…). */
const modesActifs = async (db) => (await db.query(
  'SELECT id, code, libelle FROM modes_paiement WHERE actif = true ORDER BY ordre, id'
)).rows.map((m) => ({ id: m.id, code: m.code, libelle: m.libelle }));

const SELECT_LIVRAISON = `
  SELECT cl.id, cl.commande_id, cl.livreur_id, cl.livreur_nom, cl.resultat, cl.motif, cl.note, cl.rapportee_depot,
         cl.receptionnaire, cl.montant_percu, cl.mode_paiement_id, mp.libelle AS mode_paiement,
         cl.piece_cle, cl.piece_type, cl.piece_taille, cl.piece_nom, cl.apercu_cle, cl.created_at
    FROM commande_livraisons cl
    LEFT JOIN modes_paiement mp ON mp.id = cl.mode_paiement_id`;

/** Dernière tentative (livrée ou échec) d'une commande ; null si le livreur n'est jamais passé. */
const derniereLivraison = async (db, commandeId) => (await db.query(
  `${SELECT_LIVRAISON} WHERE cl.commande_id = $1 ORDER BY cl.created_at DESC, cl.id DESC LIMIT 1`, [commandeId]
)).rows[0] || null;

/** Toutes les tentatives d'une commande, de la plus récente à la plus ancienne. */
const livraisonsDe = async (db, commandeId) => (await db.query(
  `${SELECT_LIVRAISON} WHERE cl.commande_id = $1 ORDER BY cl.created_at DESC, cl.id DESC`, [commandeId]
)).rows;

/** La facture signée la plus récente d'une commande (pour la servir) ; null s'il n'y en a pas. */
const dernierePiece = async (db, commandeId) => (await db.query(
  `SELECT piece_cle AS cle, piece_type AS type_mime, piece_nom AS nom_origine, apercu_cle
     FROM commande_livraisons WHERE commande_id = $1 AND piece_cle IS NOT NULL
    ORDER BY created_at DESC, id DESC LIMIT 1`, [commandeId]
)).rows[0] || null;

const num = (v) => (v == null ? null : Number(v));

/** Forme complète (vendeur, livreur) d'une tentative. */
const versApi = (r) => (r ? {
  id: r.id,
  resultat: r.resultat,
  motif: r.motif || null,
  motifLibelle: r.motif ? MOTIFS[r.motif] || r.motif : null,
  note: r.note || null,
  rapporteeDepot: r.rapportee_depot === true,
  receptionnaire: r.receptionnaire || null,
  montantPercu: num(r.montant_percu),
  modePaiement: r.mode_paiement || null,
  livreurId: r.livreur_id ?? null,
  livreurNom: r.livreur_nom,
  le: r.created_at,
  factureSignee: r.piece_cle ? { nom: r.piece_nom, type: r.piece_type, taille: r.piece_taille, avecApercu: !!r.apercu_cle } : null,
} : null);

/** Forme réduite pour le portail acheteur : ni la note interne, ni le retour au dépôt. */
const versApiPortail = (r) => (r ? {
  resultat: r.resultat,
  motifLibelle: r.motif ? MOTIFS[r.motif] || r.motif : null,
  receptionnaire: r.receptionnaire || null,
  livreurNom: r.livreur_nom,
  le: r.created_at,
  factureSignee: !!r.piece_cle,
} : null);

module.exports = { MOTIFS, encaissementDe, modesActifs, derniereLivraison, livraisonsDe, dernierePiece, versApi, versApiPortail };
