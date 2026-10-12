/* Factures fournisseur, étape F3 (labflow-reprise/achats-compta/PLAN-FACTURES.md §1, §2, §4) : la facture LUE puis
 * VALIDÉE dans la fenêtre « Vérifier la facture », et sa suppression d'un bloc.
 *
 *   POST   /api/appros/facture/validee       la facture validée : ses lignes, ses lignes de stock, ses pièces, ce qui est
 *                                            appris — tout ou rien
 *   DELETE /api/factures/:id                 une facture validée, en entier (réponse 4, question 14 du client)
 *   GET    /api/factures/:id/lignes-validees les lignes telles que validées (articles, conversions, hors stock)
 *
 * Corps multipart de la validation : champ « donnees » (JSON), fichiers « pieces » (1 à 5, OBLIGATOIRES : c'est la
 * facture lue) et « apercus » (copies JPEG des photos HEIC).
 *   donnees = { cible, dateAppro, fournisseurId, refFacture, timbreFiscal, timbreMontant, lecture, apercuDe,
 *               confirmerDoublon, fodec, remiseGlobale,
 *               lignes: [{ designation, reference, quantite, unite, prixUnitaire, remise, tauxTva, montant,
 *                          articleId + conversion  |  horsStock: 'transport' | 'livraison' | 'consigne' | 'service' | 'autre' }] }
 * Règles : fournisseur obligatoire (les correspondances s'apprennent par fournisseur) ; au moins une ligne d'article ;
 * une facture VALIDÉE du même fournisseur et du même numéro ⇒ refus (jamais deux fois) ; une facture saisie à la main
 * du même numéro ⇒ avertissement (`confirmerDoublon`) ; la facture validée ne rejoint jamais une facture saisie à la
 * main. Coût des articles : montant net − part de remise globale + part de FODEC, divisé par (quantité × conversion) ;
 * le timbre et les lignes hors stock restent sur la facture. Un article choisi mais non sélectionné dans le lieu y est
 * sélectionné. */
const pool = require('../config/database');
const { withTransaction } = require('../utils/db');
const stockage = require('../services/stockageFichiers');
const transfertService = require('../services/transfertService');
const P = require('../services/piecesFacture');
const F = require('../services/facturesAppro');
const V = require('../services/facturesValidees');
const A = require('./approFactureController');
const Pont = require('../services/pontCompta');

const { refus } = A;
const CONVERSION_MAX = 100000;

const texte = (v, max) => (typeof v === 'string' ? Array.from(A.propre(v).trim()).slice(0, max).join('').trim() : '');

/** Lit et contrôle `donnees` d'une facture validée. → valeurs propres ; lève Refus (400). */
const lireValidation = (brut) => {
  const { d, v } = A.lireEnTete(brut);
  if (!v.fournisseurId) throw refus(400, 'FOURNISSEUR_REQUIS', 'Choisissez [[le:fournisseur]] de la facture : ses lignes s\'apprennent par [[nom:fournisseur]].');
  if (!Array.isArray(d.lignes) || d.lignes.length === 0) throw refus(400, 'LIGNES_REQUISES', 'Aucune ligne à enregistrer.');
  if (d.lignes.length > A.LIGNES_MAX) throw refus(400, 'TROP_DE_LIGNES', `${A.LIGNES_MAX} lignes au plus par facture.`);
  const lignes = d.lignes.map((l, i) => {
    const n = i + 1;
    const invalide = (quoi) => refus(400, 'LIGNE_INVALIDE', `Ligne ${n} : ${quoi}.`, { ligne: n });
    const designation = texte(l?.designation, 300);
    if (!designation) throw invalide('désignation manquante');
    const reference = texte(l?.reference, 60) || null;
    const unite = texte(l?.unite, 30) || null;
    // Texte LU (avant correction) : la clé d'apprentissage se calcule dessus (une facture suivante est lue pareil).
    const designationLue = texte(l?.designationLue, 300) || null;
    const referenceLue = typeof l?.referenceLue === 'string' ? texte(l.referenceLue, 60) : null;
    const estArticle = l?.articleId != null && l.articleId !== '';
    const quantite = A.auMillime(A.nombre(l?.quantite));
    if (!(quantite > 0) || quantite > A.VALEUR_MAX) throw invalide('quantité invalide');
    // Montant et prix négatifs : seulement pour une ligne hors stock (déconsigne, retour d'emballages).
    const montant = A.auMillime(A.nombre(l?.montant));
    if (!Number.isFinite(montant) || Math.abs(montant) > A.LIGNE_MAX || (estArticle && montant < 0)) throw invalide('montant invalide');
    let prixUnitaire = null;
    if (l?.prixUnitaire != null && l.prixUnitaire !== '') {
      prixUnitaire = A.auMillime(A.nombre(l.prixUnitaire));
      if (!Number.isFinite(prixUnitaire) || Math.abs(prixUnitaire) > A.LIGNE_MAX || (estArticle && prixUnitaire < 0)) throw invalide('prix invalide');
    }
    // Remise de 0 à 100 % (100 % : article offert), au millième comme la colonne.
    const remise = l?.remise == null || l.remise === '' ? 0 : A.auMillime(A.nombre(l.remise));
    if (!(remise >= 0) || remise > 100) throw invalide('remise invalide');
    const tauxTva = l?.tauxTva == null || l.tauxTva === '' ? 0 : Math.round(A.nombre(l.tauxTva) * 100) / 100;
    if (!(tauxTva >= 0) || tauxTva > 100) throw invalide('taux de TVA invalide');
    const base = { designation, reference, unite, designationLue, referenceLue, quantite, montant, prixUnitaire, remise, tauxTva };
    if (estArticle) {
      const articleId = Number(l.articleId);
      if (!Number.isInteger(articleId) || articleId <= 0 || articleId > A.ID_MAX) throw invalide('[[nom:article]] invalide');
      const brute = l.conversion == null || l.conversion === '' ? 1 : A.nombre(l.conversion);
      const conversion = Math.round(brute * 1e6) / 1e6;
      if (!(conversion > 0) || conversion > CONVERSION_MAX) throw invalide('conversion invalide');
      const enStock = quantite * conversion;
      if (!(Math.round(enStock * 1000) / 1000 > 0) || enStock > A.VALEUR_MAX) throw invalide('quantité en [[nom:stock]] invalide');
      return { ...base, articleId, horsStock: null, conversion };
    }
    if (!V.NATURES.includes(l?.horsStock)) throw invalide('choisissez [[un:article]] ou « hors [[nom:stock]] »');
    return { ...base, articleId: null, horsStock: l.horsStock, conversion: null };
  });
  if (!lignes.some((l) => l.articleId)) {
    throw refus(400, 'AUCUN_ARTICLE', 'Aucune ligne n\'est rattachée à [[un:article]] : rien n\'entrerait en [[nom:stock]].');
  }
  const pied = (cle, libelle) => {
    if (d[cle] == null || d[cle] === '') return 0;
    const x = A.auMillime(A.nombre(d[cle]));
    if (!(x >= 0) || x > A.FACTURE_MAX) throw refus(400, 'PIED_INVALIDE', `${libelle} invalide.`);
    return x;
  };
  const fodec = pied('fodec', 'FODEC');
  const remiseGlobale = pied('remiseGlobale', 'Remise globale');
  const totalLignes = lignes.reduce((s, l) => s + Math.max(0, l.montant), 0);
  if (remiseGlobale > totalLignes + 0.0005) throw refus(400, 'PIED_INVALIDE', 'La remise globale dépasse le total des lignes.');
  const calcul = V.repartir(
    lignes.map((l) => ({ quantite: l.quantite, montant: l.montant, tauxTva: l.tauxTva, conversion: l.conversion, article: Boolean(l.articleId) })),
    { remiseGlobale, fodec, timbre: v.timbreMontant }
  );
  if (Math.abs(calcul.ttc) > A.FACTURE_MAX || calcul.ht < 0) throw refus(400, 'MONTANT_INVALIDE', 'Montants de la facture invalides (total négatif ou trop grand).');
  calcul.lignes.forEach((c, i) => {
    const n = i + 1;
    if (c.prixStock == null) return;
    const l = lignes[i];
    if (c.prixStock * (1 + l.tauxTva / 100) > A.VALEUR_MAX) throw refus(400, 'MONTANT_TROP_GRAND', `Ligne ${n} : prix en [[nom:stock]] trop grand.`, { ligne: n });
    // Le prix d'une ligne de stock se garde au millime : pour une unité trop petite (g, ml, pièce à quelques millimes),
    // l'arrondi fausserait la valeur du stock — au-delà de 2 % (un prix d'au moins 25 millimes passe toujours : 1 000
    // gobelets à 0,0425), refusé plutôt qu'enregistré faux (une facture validée ne se corrige plus).
    const ecart = Math.abs(c.quantiteStock * c.prixStock - c.cout);
    if (ecart > Math.max(0.005, 0.02 * Math.abs(c.cout))) {
      throw refus(400, 'PRIX_TROP_PETIT',
        `Ligne ${n} : le prix par unité [[de:stock]] (${(c.cout / c.quantiteStock).toFixed(6).replace('.', ',')} DT) se garde au millime, ce qui fausserait la valeur [[du:stock]] de ${ecart.toFixed(3).replace('.', ',')} DT. Choisissez [[un:article]] dont l'unité est plus grande (kg plutôt que g, L plutôt que ml, paquet ou carton plutôt que pièce).`,
        { ligne: n });
    }
  });
  // Étape F4 : « Envoyer à la comptabilité » (cochée dans la fenêtre si le module Compta est actif).
  return { ...v, lignes, fodec, remiseGlobale, calcul, envoyerCompta: d.envoyerCompta === true };
};

const valider = async (req, res) => {
  const clientId = F.clientDe(req);
  let deposes = [];
  try {
    const v = lireValidation(req.body?.donnees);
    const prepares = P.preparer(req.files, v.apercuDe);
    if (!prepares.length) throw refus(400, 'PIECE_REQUISE', 'La facture lue doit être jointe : déposez-la de nouveau.');
    if (!stockage.disponible()) {
      throw refus(503, 'STOCKAGE_ABSENT', 'Le stockage des factures n\'est pas encore configuré : enregistrez la facture à la main.');
    }
    const articles = v.lignes.map((l, i) => ({ ...l, rang: i + 1 })).filter((l) => l.articleId);
    try {
      await A.controlerAppartenance(req, clientId, { ...v, lignes: articles });
    } catch (e) {
      // Le n° de ligne d'un refus est celui de la facture (les lignes hors stock comprises), pas celui des seuls articles.
      if (e instanceof A.Refus && e.corps.ligne && articles[e.corps.ligne - 1]) {
        const rang = articles[e.corps.ligne - 1].rang;
        e.corps.message = e.corps.message.replace(/^Ligne \d+/, `Ligne ${rang}`);
        e.corps.ligne = rang;
      }
      throw e;
    }
    // Un gérant n'apprend que pour les fournisseurs rattachés au lieu de la saisie (ceux qu'il voit et gère).
    if (req.user.role === 'gerant') {
      const lien = await pool.query(
        v.type === 'activite'
          ? 'SELECT 1 FROM fournisseur_activites WHERE fournisseur_id = $1 AND activite_id = $2'
          : 'SELECT 1 FROM fournisseur_labos WHERE fournisseur_id = $1 AND labo_id = $2',
        [v.fournisseurId, v.cibleId]
      );
      if (!lien.rows.length) throw refus(403, 'FOURNISSEUR_HORS_PERIMETRE', '[[Le:fournisseur]] n\'est pas [[acc:fournisseur:rattaché:rattachée]] à ce lieu : rattachez-[[acc:fournisseur:le:la]] d\'abord.');
    }
    await A.refuserDoublons(req, clientId, v, pool);
    deposes = await P.deposerTout(clientId, prepares);
    const enActivite = v.type === 'activite';
    const resultat = await withTransaction(async (db) => {
      if (!enActivite) await transfertService.lockStockLabo(db, v.cibleId);
      await F.verrouillerFactures(db, clientId);
      await A.refuserDoublons(req, clientId, v, db);
      const c = v.calcul;
      const ins = await db.query(
        `INSERT INTO factures (client_id, ref_facture, date_facture, fournisseur_id, activite_id, labo_id, type_source,
                               montant_ht, montant_tva, montant_ttc, timbre_fiscal, montant_timbre, montant_fodec, remise_globale,
                               created_by, lecture, validee_le, validee_par)
         VALUES ($1, $2, $3, $4, $5, $6, 'manuel', $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW(), $14) RETURNING id`,
        [clientId, v.ref, v.dateAppro, v.fournisseurId, enActivite ? v.cibleId : null, enActivite ? null : v.cibleId,
          c.ht, c.tva, c.ttc, v.timbre, v.timbreMontant, c.fodec || null, v.remiseGlobale || null,
          req.user.id, v.lecture ? JSON.stringify(v.lecture) : null]
      );
      const factureId = ins.rows[0].id;
      const table = enActivite ? 'stock_entreprise_daily' : 'stock_labo_daily';
      const colonne = enActivite ? 'activite_id' : 'labo_id';
      let nbStock = 0;
      for (const [i, l] of v.lignes.entries()) {
        const k = c.lignes[i];
        let stockId = null;
        if (l.articleId) {
          const s = await db.query(
            `INSERT INTO ${table} (${colonne}, ingredient_id, date_appro, quantite, prix_unitaire, type_appro, fournisseur_id,
                                    ref_facture, taux_tva, prix_unitaire_tva, facture_id, updated_at, created_by)
             VALUES ($1, $2, $3, $4, $5, 'manuel', $6, $7, $8, ROUND($5::numeric * (1 + $8::numeric / 100), 3), $9, NOW(), $10)
             RETURNING id`,
            [v.cibleId, l.articleId, v.dateAppro, k.quantiteStock, k.prixStock, v.fournisseurId, v.ref, l.tauxTva, factureId, req.user.id]
          );
          stockId = s.rows[0].id;
          nbStock++;
        }
        await db.query(
          `INSERT INTO factures_lignes (facture_id, client_id, rang, designation, reference, quantite, unite, prix_unitaire,
                                        remise, taux_tva, montant_ht, article_id, nature_hors_stock, conversion,
                                        quantite_stock, prix_stock, stock_entreprise_id, stock_labo_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [factureId, clientId, i + 1, l.designation, l.reference, l.quantite, l.unite, l.prixUnitaire, l.remise, l.tauxTva,
            l.montant, l.articleId, l.horsStock, l.conversion, k.quantiteStock, k.prixStock,
            enActivite ? stockId : null, enActivite ? null : stockId]
        );
      }
      // Un article choisi mais pas encore sélectionné dans ce lieu y est ajouté (il apparaît alors dans sa grille).
      const ids = [...new Set(articles.map((l) => l.articleId))];
      await db.query(
        enActivite
          ? 'INSERT INTO activite_ingredient_selections (activite_id, ingredient_id) SELECT $1, x FROM UNNEST($2::int[]) AS x ON CONFLICT DO NOTHING'
          : 'INSERT INTO labo_ingredient_selections (labo_id, ingredient_id) SELECT $1, x FROM UNNEST($2::int[]) AS x ON CONFLICT DO NOTHING',
        [v.cibleId, ids]
      );
      await P.inserer(db, { factureId, clientId, deposes, ordreDepart: 1, auteurId: req.user.id });
      const appris = await V.apprendre(db, { clientId, fournisseurId: v.fournisseurId, auteurId: req.user.id, lignes: v.lignes });
      await P.journaliser(db, {
        clientId, factureId, action: 'facture_validee', auteurId: req.user.id,
        details: { ref: v.ref, lignes: v.lignes.length, lignesStock: nbStock, appris, ttc: c.ttc, pieces: deposes.map(P.resumePiece) },
      });
      return { factureId, nbLignes: v.lignes.length, nbStock, nbPieces: deposes.length, appris, montantTTC: c.ttc };
    });
    deposes = [];
    // Étape F4 : l'envoi demandé, dans sa propre transaction — un refus laisse la facture validée, « à envoyer ».
    const envoi = await Pont.envoyerSiDemande({ demande: v.envoyerCompta, clientId, factureId: resultat.factureId, auteurId: req.user.id, voc: req.voc });
    return res.status(201).json({ ...resultat, ...envoi });
  } catch (err) {
    if (deposes.length) await P.effacerDeposes(deposes, 'facture validée non enregistrée');
    if (err instanceof A.Refus) return res.status(err.status).json(err.corps);
    if (err instanceof P.ErreurPiece) return res.status(err.status).json({ code: err.code, message: err.message });
    if (err?.code === '23505' && /ux_factures_validees_numero/.test(err.constraint || '')) {
      return res.status(409).json({ code: 'FACTURE_VALIDEE_EXISTANTE', message: 'Cette facture vient d\'être validée : elle ne s\'enregistre pas deux fois.' });
    }
    if (err?.code === '23503') return res.status(409).json({ code: 'DONNEE_DISPARUE', message: 'Une donnée de la saisie vient d\'être supprimée : rechargez la page, puis recommencez.' });
    // Valeur hors des bornes d'une colonne (garde de dernier recours : les contrôles de l'envoi passent avant).
    if (err?.code === '23514' || err?.code === '22003') return res.status(400).json({ code: 'VALEUR_INVALIDE', message: 'Une valeur de la facture est hors des limites admises : relisez les quantités, prix et conversions.' });
    console.error('[facture validée]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

/** DELETE /api/factures/:id — une facture VALIDÉE, en entier ; une facture saisie à la main se corrige ligne par ligne. */
const supprimer = async (req, res) => {
  const clientId = F.clientDe(req);
  try {
    const f0 = await F.factureDuCompte(pool, req.params.id, clientId);
    if (!f0 || !F.gerantVoit(req, f0)) return res.status(404).json({ message: 'Facture introuvable' });
    if (!F.gerantAgitSur(req, f0)) return res.status(403).json({ message: 'Accès non autorisé à cette facture' });
    const r = await withTransaction(async (db) => {
      if (f0.labo_id && !f0.activite_id) await transfertService.lockStockLabo(db, f0.labo_id);
      await F.verrouillerFactures(db, clientId);
      const f = await F.factureDuCompte(db, f0.id, clientId, true);
      if (!f) return { status: 404, corps: { message: 'Facture introuvable' } };
      if (!(await V.estValidee(db, f.id))) {
        return { status: 409, corps: { code: 'FACTURE_NON_VALIDEE', message: 'Seule une facture validée se supprime d\'un bloc ; une facture saisie à la main se corrige ligne par ligne, dans l\'historique.' } };
      }
      return { status: 200, ...(await V.supprimerFactureValidee(db, { facture: f, clientId, auteurId: req.user.id })) };
    });
    if (r.status !== 200) return res.status(r.status).json(r.corps);
    await stockage.supprimerSansErreur(r.clesAEffacer, 'facture validée supprimée');
    return res.json({ ok: true, lignesStock: r.nbStock });
  } catch (err) {
    if (err instanceof Pont.RefusCompta) return res.status(err.status).json({ code: err.code, message: err.message });
    console.error('[facture validée, suppression]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

/** GET /api/factures/:id/lignes-validees — vide pour une facture qui n'a pas été validée. */
const lignesValidees = async (req, res) => {
  const clientId = F.clientDe(req);
  try {
    const f = await F.factureDuCompte(pool, req.params.id, clientId);
    if (!f || !F.gerantVoit(req, f)) return res.status(404).json({ message: 'Facture introuvable' });
    const r = await pool.query(
      `SELECT fl.*, a.nom AS article_nom, u.nom AS unite_stock
       FROM factures_lignes fl
       LEFT JOIN articles a ON a.id = fl.article_id
       LEFT JOIN unites u ON u.id = a.unite_id
       WHERE fl.facture_id = $1 ORDER BY fl.rang`,
      [f.id]
    );
    const n = (x) => (x == null ? null : parseFloat(x));
    return res.json(r.rows.map((x) => ({
      rang: x.rang, designation: x.designation, reference: x.reference, quantite: n(x.quantite), unite: x.unite,
      prixUnitaire: n(x.prix_unitaire), remise: n(x.remise), tauxTva: n(x.taux_tva), montant: n(x.montant_ht),
      articleId: x.article_id, articleNom: x.article_nom, uniteStock: x.unite_stock, horsStock: x.nature_hors_stock,
      conversion: n(x.conversion), quantiteStock: n(x.quantite_stock), prixStock: n(x.prix_stock),
    })));
  } catch (err) {
    console.error('[facture validée, lignes]', err);
    return res.status(500).json({ message: 'Erreur serveur' });
  }
};

module.exports = { valider, supprimer, lignesValidees, lireValidation };
