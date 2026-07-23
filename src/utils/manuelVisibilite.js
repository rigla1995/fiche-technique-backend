const pool = require('../config/database');

// ── Filtrage du manuel selon la configuration réelle du compte ────────────────
// Le manuel ne documente que ce que le compte peut voir : les fiches d'espaces
// absents (module Acheteurs OFF, 0 labo, 0 activité, Espace Produit verrouillé)
// sont masquées, ainsi que les fiches réservées au client pour un gérant.
// Deux fiches « VITRINES » restent visibles même option non souscrite (décision
// client 2026-07-23, upsell assumé) : acheteurs-module et fiches-techniques.
// Les admins (super_admin / boss) voient toujours le manuel complet.

// Contexte de config du compte (gérant → compte parent). null = pas de filtre.
const buildManuelContexte = async (user) => {
  const role = user.role;
  if (role !== 'client' && role !== 'gerant') return null;
  const clientId = user.gerant_parent_id || user.id;
  const pe = await pool.query(
    'SELECT id, module_acheteurs_actif FROM profil_entreprise WHERE client_id = $1',
    [clientId]
  );
  if (pe.rows.length === 0) {
    // Compte pas encore configuré : on ne montre que le tronc commun
    return { role, hasActivites: false, hasLabos: false, moduleAcheteurs: false, espaceProduit: false };
  }
  const entrepriseId = pe.rows[0].id;
  const [acts, labs, formule] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS n FROM activites WHERE entreprise_id = $1', [entrepriseId]),
    pool.query('SELECT COUNT(*)::int AS n FROM labos WHERE entreprise_id = $1', [entrepriseId]),
    pool.query(
      `SELECT ac.formule_activites FROM abonnement_config ac
       JOIN abonnements a ON a.id = ac.abonnement_id
       WHERE a.client_id = $1 ORDER BY a.id DESC LIMIT 1`,
      [clientId]
    ),
  ]);
  const hasActivites = acts.rows[0].n > 0;
  const hasLabos = labs.rows[0].n > 0;
  // Verrou Espace Produit : formule basique SANS labo (la base labo l'inclut)
  const espaceProduit = !(formule.rows[0]?.formule_activites === 'basique' && !hasLabos);
  return { role, hasActivites, hasLabos, moduleAcheteurs: pe.rows[0].module_acheteurs_actif === true, espaceProduit };
};

const clientSeul = (c) => c.role !== 'gerant';
const actOuLabo = (c) => c.hasActivites || c.hasLabos;

// Règles par slug — un slug ABSENT de la table est visible pour tous les comptes.
// Vitrines volontairement sans règle : 'acheteurs-module', 'fiches-techniques'.
const REGLES_VISIBILITE = {
  // Onboarding & gestion du compte — réservés au client
  'onboarding-suivi': clientSeul,
  'onboarding-contrat': clientSeul,
  'onboarding-activation': clientSeul,
  'onboarding-configuration': clientSeul,
  'onboarding-avenants': clientSeul,
  activites: clientSeul,
  gerants: clientSeul,
  'historique-paiements': clientSeul,
  rapports: clientSeul,
  dashboard: clientSeul, // le gérant n'a plus de tableau de bord (2026-07-23)
  'dashboard-gerant': () => false, // écran supprimé — fiche masquée pour tous
  // Espace Produit — verrouillé en formule basique sans labo
  'categories-produits': (c) => c.espaceProduit,
  'produits-vendables': (c) => c.espaceProduit,
  'produits-utilisables': (c) => c.espaceProduit,
  'articles-valorises': (c) => c.espaceProduit,
  // Stock & appro
  'stock-activites': (c) => c.hasActivites,
  inventaire: actOuLabo,
  pertes: actOuLabo,
  historique: actOuLabo,
  factures: actOuLabo,
  'stock-labo': (c) => c.hasLabos,
  transferts: (c) => c.hasLabos,
  'rapports-labo': (c) => c.hasLabos,
  // Espace Vente (module vente intégré par défaut → gate = présence d'activités)
  'configuration-vente': (c) => c.hasActivites,
  charges: (c) => c.hasActivites,
  'saisie-ventes': (c) => c.hasActivites,
  'rapports-vente': (c) => c.hasActivites,
  'ventes-labo': (c) => c.hasLabos,
  // Espace Acheteurs — module OFF : seule la vitrine 'acheteurs-module' reste
  'acheteurs-carnet': (c) => c.moduleAcheteurs,
  'acheteurs-tarifs': (c) => c.moduleAcheteurs,
  'acheteurs-ventes': (c) => c.moduleAcheteurs,
  'acheteurs-portail': (c) => c.moduleAcheteurs,
  // Calculs propres au labo
  'calc-production-pt': (c) => c.hasLabos,
  'calc-transferts': (c) => c.hasLabos,
};

const manuelSectionVisible = (slug, ctx) => {
  if (!ctx) return true; // admin/boss : manuel complet
  const regle = REGLES_VISIBILITE[slug];
  return regle ? regle(ctx) : true;
};

module.exports = { buildManuelContexte, manuelSectionVisible, REGLES_VISIBILITE };
