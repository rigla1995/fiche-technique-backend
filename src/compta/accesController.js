// LabFlow Compta — ce que voit la personne connectée sur compta. (SPEC-SOCLE D2, D3, D9 ; étapes S1 et S2b).
const pool = require('../config/database');
const {
  loadTarifs, tarifsFor, applyPromoMensualite, applyPromoOnboarding, computeMensuelTotalFromConfig, getFactureForPaiement,
} = require('../controllers/abonnementController');
const { postesCompta } = require('./tarifsCompta');
const { nomAffiche, mapIdentite } = require('../utils/identite');
const moduleCompta = require('./moduleClient');

// GET /api/compta/acces — les comptabilités de la personne, en trois groupes TOUJOURS distincts (CADRAGE §2) : son
// cabinet ; sa comptabilité de client LabFlow (étape S2c) ; celles que des clients LabFlow lui ont confiées. Seuls les
// accès actifs des comptabilités ouvertes comptent (S2c : une comptabilité fermée — module désactivé — n'apparaît
// plus). `lien` : page ouverte par la carte (le cabinet ou la comptabilité de son titulaire à cette étape).
const LIENS_TITULAIRE = { cabinet: '/cabinet', client_labflow: '/ma-comptabilite' };
const listerAcces = async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT e.id, e.type, e.nom, e.etat, a.role
         FROM compta.acces a
         JOIN compta.espaces e ON e.id = a.espace_id
        WHERE a.personne_id = $1 AND a.etat = 'actif' AND e.etat = 'actif'
        ORDER BY e.nom, e.id`,
      [req.user.id]
    );
    const groupes = { cabinets: [], maComptabilite: [], confiees: [] };
    for (const x of r.rows) {
      const carte = { id: x.id, nom: x.nom, etat: x.etat, role: x.role, lien: x.role === 'titulaire' ? LIENS_TITULAIRE[x.type] || null : null };
      if (x.type === 'cabinet') groupes.cabinets.push(carte);
      else if (x.role === 'titulaire') groupes.maComptabilite.push(carte);
      else groupes.confiees.push(carte);
    }
    res.json(groupes);
  } catch (err) {
    console.error('[compta.acces]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/compta/ma-comptabilite — la comptabilité du client LabFlow connecté (étape S2c) : son espace, le module
// (facturé à partir de…, gérants comptables prévus) et l'accès de son comptable (à désigner à l'étape S3). Réservée au
// TITULAIRE de l'espace, vérifié sur compta.acces (jamais une garde cliente, SPEC-SOCLE D3).
const maComptabilite = async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT e.id, e.nom, e.etat, e.created_at
         FROM compta.acces a
         JOIN compta.espaces e ON e.id = a.espace_id
        WHERE a.personne_id = $1 AND a.role = 'titulaire' AND a.etat = 'actif'
          AND e.type = 'client_labflow' AND e.etat = 'actif'`,
      [req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ code: 'MODULE_INACTIF', message: 'Le module Comptabilité n\'est pas activé sur ce compte' });
    const espace = r.rows[0];
    const acces = await pool.query(
      `SELECT a.id, a.etat, a.obligatoire, a.niveau, a.nom_attendu, a.email_attendu, u.nom, u.email
         FROM compta.acces a
         LEFT JOIN utilisateurs u ON u.id = a.personne_id
        WHERE a.espace_id = $1 AND a.role = 'gerant'
        ORDER BY a.obligatoire DESC, a.id`,
      [espace.id]
    );
    const module = await moduleCompta.etat(pool, req.user.id);
    res.json({
      espace: { id: espace.id, nom: espace.nom, etat: espace.etat, ouvertLe: espace.created_at },
      module: module ? {
        actif: module.actif, activeLe: module.activeLe, factureAPartirDe: module.factureAPartirDe,
        nbGerants: module.nbGerants, postes: module.postes, totalMensuel: module.totalMensuel,
      } : null,
      comptables: acces.rows.map((x) => ({
        id: x.id, etat: x.etat, obligatoire: x.obligatoire, niveau: x.niveau,
        nom: x.nom || x.nom_attendu || null, email: x.email || x.email_attendu || null,
      })),
    });
  } catch (err) {
    console.error('[compta.ma-comptabilite]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// Les pages du cabinet (S2b) sont celles de son titulaire, une personne de rôle « comptable ».
const exigerTitulaireCabinet = (req, res, next) => {
  if (req.user?.role !== 'comptable') return res.status(403).json({ message: 'Page réservée au titulaire d\'un cabinet LabFlow Compta' });
  next();
};

// GET /api/compta/cabinet — identité (fiche profil_entreprise, celle des factures), contact, gérants prévus.
const monCabinet = async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT e.id AS espace_id, e.nom AS espace_nom, e.etat AS espace_etat,
              u.nom, u.email, u.telephone,
              pe.raison_sociale, pe.nom_commercial, pe.forme_juridique, pe.matricule_fiscal, pe.rne, pe.adresse, pe.ville,
              pe.representant_nom, pe.representant_qualite,
              ac.nb_gerants_compta
         FROM compta.espaces e
         JOIN utilisateurs u ON u.id = e.titulaire_id
         LEFT JOIN profil_entreprise pe ON pe.client_id = u.id
         LEFT JOIN abonnements a ON a.client_id = u.id AND a.produit = 'compta'
         LEFT JOIN abonnement_config ac ON ac.abonnement_id = a.id
        WHERE e.type = 'cabinet' AND e.titulaire_id = $1`,
      [req.user.id]
    );
    if (!r.rows.length) return res.status(404).json({ message: 'Cabinet introuvable' });
    const x = r.rows[0];
    res.json({
      espace: { id: x.espace_id, nom: x.espace_nom, etat: x.espace_etat },
      nomAffiche: nomAffiche({ ...x, contact: x.nom }),
      identite: mapIdentite(x),
      contact: { nom: x.nom, email: x.email, telephone: x.telephone },
      nbGerants: x.nb_gerants_compta || 0,
    });
  } catch (err) {
    console.error('[compta.cabinet]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/compta/abonnement — l'abonnement du cabinet : état du compte, postes et total mensuel, promotion en cours,
// frais de mise en route, mensualités (une facture par mensualité réglée).
const monAbonnement = async (req, res) => {
  try {
    const a = await pool.query(
      `SELECT a.id, a.mode_compte, a.date_debut, a.montant_onboarding, a.statut_onboarding, ac.nb_gerants_compta
         FROM abonnements a
         LEFT JOIN abonnement_config ac ON ac.abonnement_id = a.id
        WHERE a.client_id = $1 AND a.produit = 'compta'`,
      [req.user.id]
    );
    if (!a.rows.length) return res.status(404).json({ message: 'Abonnement introuvable' });
    const abo = a.rows[0];
    const [paiements, promos, t] = await Promise.all([
      pool.query('SELECT id, mois, montant_dt, statut, date_paiement FROM paiements WHERE abonnement_id = $1 ORDER BY mois DESC', [abo.id]),
      pool.query(
        `SELECT type, applies_to, discount_mensualite, fixed_mensualite, discount_onboarding, fixed_onboarding, date_debut, date_fin
           FROM promotions
          WHERE abonnement_id = $1 AND date_debut <= CURRENT_DATE AND (date_fin IS NULL OR date_fin >= CURRENT_DATE)
          ORDER BY created_at DESC`,
        [abo.id]
      ),
      loadTarifs(),
    ]);
    const tarifs = tarifsFor(t, null);
    const config = { produit: 'compta', nb_gerants_compta: abo.nb_gerants_compta || 0 };
    const totalMensuel = computeMensuelTotalFromConfig(config, tarifs) || 0;
    const promo = promos.rows.find((p) => ['mensualite', 'les_deux'].includes(p.applies_to)) || null;
    // Frais de mise en route : avec leur promotion éventuelle (même calcul que la fiche de l'admin, effectifOnboarding).
    const promoMiseEnRoute = promos.rows.find((p) => ['onboarding', 'les_deux'].includes(p.applies_to)) || null;
    const miseEnRouteBrute = abo.montant_onboarding != null ? Number(abo.montant_onboarding) : 0;
    const miseEnRoute = promoMiseEnRoute ? applyPromoOnboarding(miseEnRouteBrute, promoMiseEnRoute) : miseEnRouteBrute;
    res.json({
      modeCompte: abo.mode_compte,
      dateDebut: abo.date_debut,
      postes: postesCompta(config, tarifs),
      totalMensuel,
      effectifMensuel: applyPromoMensualite(totalMensuel, promo),
      promotion: promo ? {
        type: promo.type,
        pourcentage: promo.discount_mensualite != null ? Number(promo.discount_mensualite) : null,
        prixFixe: promo.fixed_mensualite != null ? Number(promo.fixed_mensualite) : null,
        dateDebut: promo.date_debut,
        dateFin: promo.date_fin,
      } : null,
      miseEnRoute: {
        montant: miseEnRoute,
        ...(miseEnRoute !== miseEnRouteBrute ? { montantInitial: miseEnRouteBrute } : {}),
        statut: abo.statut_onboarding,
      },
      paiements: paiements.rows.map((p) => ({
        id: p.id,
        mois: p.mois,
        montant: Number(p.montant_dt) || 0,
        statut: p.statut,
        datePaiement: p.date_paiement,
        facture: p.statut === 'payé' && Number(p.montant_dt) > 0,
      })),
    });
  } catch (err) {
    console.error('[compta.abonnement]', err);
    res.status(500).json({ message: 'Erreur serveur' });
  }
};

// GET /api/compta/abonnement/paiements/:id/facture — PDF d'une mensualité réglée du cabinet (même facture que celle
// envoyée par email, déterministe).
const telechargerFacture = async (req, res) => {
  if (!/^\d{1,9}$/.test(String(req.params.id))) return res.status(404).json({ message: 'Facture introuvable' });
  try {
    const out = await getFactureForPaiement(Number(req.params.id), req.user.id);
    if (out.error === 404) return res.status(404).json({ message: 'Facture introuvable' });
    if (out.error === 400) return res.status(400).json({ message: 'Facture disponible uniquement pour une mensualité réglée' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="facture-${out.numero}.pdf"`);
    res.send(out.buffer);
  } catch (err) {
    console.error('[compta.facture]', err);
    res.status(500).json({ message: 'Erreur lors de la génération de la facture' });
  }
};

module.exports = { listerAcces, maComptabilite, exigerTitulaireCabinet, monCabinet, monAbonnement, telechargerFacture };
