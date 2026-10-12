/* LabFlow Compta — comptes d'achat du dossier « Mon entreprise » et pièce d'une écriture venue de LabFlow (étape F4 des
 * factures fournisseur — labflow-reprise/achats-compta/PLAN-FACTURES.md §4 « Vers la comptabilité », ETAPE-F4.md).
 *
 *   GET /api/compta/dossiers/:dossierId/comptes-achat      catégories, articles et natures hors stock du client LabFlow,
 *                                                           avec le compte réglé ou par défaut (lecture : tout niveau)
 *   PUT /api/compta/dossiers/:dossierId/comptes-achat      { type: categorie | article | nature, id | valeur, compteId | null }
 *                                                           (configurer ; null = revenir au compte par défaut)
 *   GET /api/compta/dossiers/:dossierId/ecritures/:ecritureId/pieces                 la facture LabFlow de l'écriture
 *   GET /api/compta/dossiers/:dossierId/ecritures/:ecritureId/pieces/:pieceId/fichier  un de ses fichiers
 *
 * Sans réglage, le pont (src/services/pontCompta.js) impute : 607 (famille vendable non consommable : revendue en l'état),
 * 6022 (famille ni vendable ni consommable : fournitures), 601 (ingrédients, article sans famille) ;
 * transport et livraison 6241, consigne 4096, prestation 604, autre 606. Le réglage d'un article l'emporte sur celui de
 * sa catégorie. Seul le dossier « Mon entreprise » (source « labflow ») a des comptes d'achat. */
const pool = require('../config/database');
const { journaliser } = require('./journal');
const { modeTitulaire, etatAbonnement } = require('./garde');
const { erreur, idValide, repondreErreur } = require('./comptablesClient');
const { droits, dansEspaceDuDossier } = require('./dossiers');
const { lectureDossier, presenterDossier } = require('./planComptes');
const { SQL_FEUILLE, presenterCompteCourt } = require('./configDossier');
const { COMPTES_NATURES, LIBELLES_NATURES, compteParDefaut } = require('../services/pontCompta');
const { servirPiece } = require('../controllers/piecesController');

const MSG_CONFIGURER = 'Seul le titulaire ou un gérant de niveau Complet peut régler les comptes d\'achat';
const NATURES = Object.keys(COMPTES_NATURES);
const NUMEROS_DEFAUT = ['601', '607', '6022', ...new Set(Object.values(COMPTES_NATURES))];

const exigerLabflow = (d) => {
  if (d.source !== 'labflow' || !d.client_labflow_id) {
    throw erreur(409, 'Les comptes d\'achat ne concernent que le dossier « Mon entreprise » d\'un client LabFlow', 'DOSSIER_NON_LABFLOW');
  }
};

// L'état de la page : catégories (compte réglé ou par défaut), articles réglés, natures hors stock, comptes proposés.
const etatComptesAchat = async (db, acces, d) => {
  exigerLabflow(d);
  const client = d.client_labflow_id;
  const [cats, arts, reglages, defauts, comptes, mode] = await Promise.all([
    db.query(
      `SELECT c.id, c.nom, fa.nom AS famille, fa.vendable, fa.consommable,
              (SELECT COUNT(*)::int FROM articles a WHERE a.categorie_id = c.id) AS nb_articles
         FROM categories c LEFT JOIN familles fa ON fa.id = c.famille_id
        WHERE c.client_id = $1 ORDER BY fa.nom NULLS LAST, c.nom`, [client]
    ),
    db.query(`SELECT a.id, a.nom, a.categorie_id, u.nom AS unite FROM articles a LEFT JOIN unites u ON u.id = a.unite_id WHERE a.client_id = $1 ORDER BY a.nom`, [client]),
    db.query(
      `SELECT r.categorie_id, r.article_id, r.nature_hors_stock, k.id, k.numero, k.libelle, k.nature, k.actif, ${SQL_FEUILLE('k')} AS feuille
         FROM compta.comptes_articles r JOIN compta.comptes k ON k.id = r.compte_id WHERE r.dossier_id = $1`, [d.id]
    ),
    db.query(`SELECT k.id, k.numero, k.libelle, k.nature, k.actif, ${SQL_FEUILLE('k')} AS feuille FROM compta.comptes k WHERE k.dossier_id = $1 AND k.numero = ANY($2)`, [d.id, NUMEROS_DEFAUT]),
    // Comptes proposés : charges (classe 6) et comptes fournisseurs (la consigne seulement, contrôlé au réglage).
    db.query(
      `SELECT k.id, k.numero, k.libelle, k.nature, k.actif, ${SQL_FEUILLE('k')} AS feuille FROM compta.comptes k
        WHERE k.dossier_id = $1 AND k.actif AND (k.numero LIKE '6%' OR k.nature = 'fournisseurs') ORDER BY k.numero`, [d.id]
    ),
    modeTitulaire(db, acces.espace_id),
  ]);
  const parNumero = new Map(defauts.rows.map((k) => [k.numero, k]));
  const defaut = (numero) => (parNumero.has(numero) ? presenterCompteCourt(parNumero.get(numero)) : { id: null, numero, libelle: 'absent du plan', imputable: false });
  const regle = (cle, id) => {
    const r = reglages.rows.find((x) => x[cle] === id);
    return r ? presenterCompteCourt(r) : null;
  };
  return {
    dossier: presenterDossier(acces, d),
    droits: droits(acces),
    etatAbonnement: etatAbonnement(mode),
    categories: cats.rows.map((c) => ({
      id: c.id, nom: c.nom, famille: c.famille, nbArticles: c.nb_articles,
      defaut: defaut(compteParDefaut({ vendable: c.vendable, consommable: c.consommable })), compte: regle('categorie_id', c.id),
    })),
    articles: arts.rows.map((a) => ({ id: a.id, nom: a.nom, unite: a.unite, categorieId: a.categorie_id, compte: regle('article_id', a.id) })),
    natures: NATURES.map((valeur) => ({ valeur, libelle: LIBELLES_NATURES[valeur], defaut: defaut(COMPTES_NATURES[valeur]), compte: regle('nature_hors_stock', valeur) })),
    // Un article sans catégorie : le compte des ingrédients.
    sansCategorie: { defaut: defaut(compteParDefaut({})) },
    comptes: comptes.rows.filter((k) => k.feuille).map(presenterCompteCourt),
  };
};

// Transaction d'écriture : droit « configurer », dossier non archivé et « Mon entreprise » ; rend l'état à jour.
const ecritureComptesAchat = (req, travail) => dansEspaceDuDossier(req.user, req.params.dossierId, async (db, acces, d) => {
  if (!droits(acces).configurer) throw erreur(403, MSG_CONFIGURER, 'NIVEAU_INSUFFISANT');
  if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\'abord', 'DOSSIER_ARCHIVE');
  exigerLabflow(d);
  await travail(db, acces, d);
  return etatComptesAchat(db, acces, d);
});

const lire = async (req, res) => {
  try {
    const { acces, d } = await lectureDossier(req.user, req.params.dossierId);
    res.json(await etatComptesAchat(pool, acces, d));
  } catch (err) {
    repondreErreur(res, err, '[compta.comptesAchat.lire]');
  }
};

/** La cible d'un réglage : { colonne, valeur, libelle } ; lève 400 / 404. */
const lireCible = async (db, d, corps) => {
  const type = corps.type;
  if (type === 'nature') {
    if (!NATURES.includes(corps.valeur)) throw erreur(400, 'Nature hors stock inconnue');
    return { colonne: 'nature_hors_stock', valeur: corps.valeur, libelle: LIBELLES_NATURES[corps.valeur] };
  }
  if (type !== 'categorie' && type !== 'article') throw erreur(400, 'Choisissez une catégorie, un article ou une nature hors stock');
  if (!idValide(corps.id)) throw erreur(404, type === 'categorie' ? 'Catégorie introuvable' : 'Article introuvable');
  const table = type === 'categorie' ? 'categories' : 'articles';
  const r = (await db.query(`SELECT id, nom FROM ${table} WHERE id = $1 AND client_id = $2`, [corps.id, d.client_labflow_id])).rows[0];
  if (!r) throw erreur(404, type === 'categorie' ? 'Catégorie introuvable' : 'Article introuvable');
  return { colonne: type === 'categorie' ? 'categorie_id' : 'article_id', valeur: r.id, libelle: r.nom };
};

const regler = async (req, res) => {
  try {
    const corps = req.body || {};
    const resultat = await ecritureComptesAchat(req, async (db, acces, d) => {
      const cible = await lireCible(db, d, corps);
      const avant = (await db.query(`SELECT r.id, r.compte_id, k.numero FROM compta.comptes_articles r JOIN compta.comptes k ON k.id = r.compte_id WHERE r.dossier_id = $1 AND r.${cible.colonne} = $2 FOR UPDATE OF r`, [d.id, cible.valeur])).rows[0];
      if (corps.compteId == null || corps.compteId === '') {
        // Déjà au compte par défaut : rien à écrire, ni en base ni au journal.
        if (!avant) return;
        await db.query('DELETE FROM compta.comptes_articles WHERE id = $1', [avant.id]);
        await journaliser(db, acces.espace_id, req.user.id, 'compte_achat_regle', { dossier: d.id, cible: cible.libelle, avant: avant.numero, apres: null });
        return;
      }
      if (!idValide(corps.compteId)) throw erreur(404, 'Compte introuvable');
      const k = (await db.query(`SELECT k.id, k.numero, k.nature, k.actif, ${SQL_FEUILLE('k')} AS feuille FROM compta.comptes k WHERE k.dossier_id = $1 AND k.id = $2`, [d.id, corps.compteId])).rows[0];
      if (!k) throw erreur(404, 'Compte introuvable');
      if (!k.actif || !k.feuille) throw erreur(409, `Le compte ${k.numero} est désactivé ou a des sous-comptes : choisissez le compte à imputer`, 'COMPTE_NON_IMPUTABLE');
      // Un achat va en charges (classe 6) ; la consigne peut aussi aller au compte du fournisseur (4096, emballages à rendre).
      const consigne = cible.colonne === 'nature_hors_stock' && cible.valeur === 'consigne';
      if (!k.numero.startsWith('6') && !(consigne && k.nature === 'fournisseurs')) {
        throw erreur(400, consigne
          ? `Le compte ${k.numero} ne convient pas à la consigne : choisissez un compte de charges (classe 6) ou un compte fournisseurs (4096)`
          : `Le compte ${k.numero} ne convient pas à un achat : choisissez un compte de charges (classe 6)`, 'COMPTE_INADAPTE');
      }
      // Même compte qu'avant : rien à écrire, ni en base ni au journal.
      if (avant && avant.compte_id === k.id) return;
      if (avant) await db.query('UPDATE compta.comptes_articles SET compte_id = $2, modifie_par = $3, updated_at = NOW() WHERE id = $1', [avant.id, k.id, req.user.id]);
      else await db.query(`INSERT INTO compta.comptes_articles (dossier_id, ${cible.colonne}, compte_id, modifie_par) VALUES ($1, $2, $3, $4)`, [d.id, cible.valeur, k.id, req.user.id]);
      await journaliser(db, acces.espace_id, req.user.id, 'compte_achat_regle', { dossier: d.id, cible: cible.libelle, avant: avant?.numero || null, apres: k.numero });
    });
    res.json(resultat);
  } catch (err) {
    repondreErreur(res, err, '[compta.comptesAchat.regler]');
  }
};

// La facture LabFlow d'une écriture (lecture : tout niveau du dossier) : ses pièces, sans quitter la Compta.
const factureDe = async (req) => {
  const { d } = await lectureDossier(req.user, req.params.dossierId);
  if (!idValide(req.params.ecritureId)) throw erreur(404, 'Écriture introuvable');
  const e = (await pool.query('SELECT id, facture_id FROM compta.ecritures WHERE dossier_id = $1 AND id = $2', [d.id, req.params.ecritureId])).rows[0];
  if (!e) throw erreur(404, 'Écriture introuvable');
  return e.facture_id;
};
const pieces = async (req, res) => {
  try {
    const factureId = await factureDe(req);
    const r = factureId
      ? await pool.query('SELECT id, ordre, type_mime, nom_origine, taille, apercu_cle IS NOT NULL AS avec_apercu FROM factures_pieces WHERE facture_id = $1 ORDER BY ordre', [factureId])
      : { rows: [] };
    res.json({ factureId, pieces: r.rows.map((p) => ({ id: p.id, ordre: p.ordre, type: p.type_mime, nom: p.nom_origine, taille: p.taille, avecApercu: p.avec_apercu === true })) });
  } catch (err) {
    repondreErreur(res, err, '[compta.comptesAchat.pieces]');
  }
};
const fichierPiece = async (req, res) => {
  try {
    const factureId = await factureDe(req);
    if (!factureId || !idValide(req.params.pieceId)) throw erreur(404, 'Pièce introuvable');
    const p = (await pool.query('SELECT cle, type_mime, nom_origine, apercu_cle FROM factures_pieces WHERE id = $1 AND facture_id = $2', [req.params.pieceId, factureId])).rows[0];
    if (!p) throw erreur(404, 'Pièce introuvable');
    await servirPiece(req, res, p);
  } catch (err) {
    if (err && err.status && err.code && !err.statusCode) return res.status(err.status).json({ code: err.code, message: err.message });
    repondreErreur(res, err, '[compta.comptesAchat.fichierPiece]');
  }
};

module.exports = { MSG_CONFIGURER, NATURES, etatComptesAchat, ecritureComptesAchat, lire, regler, pieces, fichierPiece };
