const pool = require('../config/database');

// ── État de mise en route d'un compte, calculé EN DIRECT contre sa config ────
// Le bot d'onboarding (bulle 🤖) n'existe que tant que la configuration
// souscrite n'est pas entièrement mise en place ; il disparaît quand tout est
// fait et RÉAPPARAÎT automatiquement après un avenant (nouvelle activité,
// nouveau labo, module acheteurs…) puisque rien n'est stocké : chaque étape
// est recalculée données réelles vs souscription à chaque appel.

const one = async (sql, params) => {
  const { rows } = await pool.query(sql, params);
  return rows[0] || {};
};

async function computeOnboardingEtat(clientId) {
  const pe = await one(
    'SELECT id, module_acheteurs_actif FROM profil_entreprise WHERE client_id = $1',
    [clientId]
  );
  if (!pe.id) {
    // Compte pas encore configuré (profil absent) : tout reste à faire,
    // mais sans profil on ne peut rien compter — le bot s'affiche.
    return { complet: false, etapes: [], aFaire: 'capacites' };
  }
  const entrepriseId = pe.id;
  const moduleAcheteurs = pe.module_acheteurs_actif === true;

  const [cfg, counts, selAct, selLabo, saisies] = await Promise.all([
    one(
      `SELECT ac.nb_activites, ac.nb_labos, ac.formule_activites
       FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id
       WHERE a.client_id = $1 ORDER BY a.id DESC LIMIT 1`,
      [clientId]
    ),
    one(
      `SELECT
        (SELECT COUNT(*)::int FROM activites WHERE entreprise_id = $1) AS activites,
        (SELECT COUNT(*)::int FROM labos WHERE entreprise_id = $1) AS labos,
        (SELECT COUNT(*)::int FROM unites WHERE client_id = $2) AS unites,
        (SELECT COUNT(*)::int FROM familles WHERE client_id = $2) AS familles,
        (SELECT COUNT(*)::int FROM categories WHERE client_id = $2) AS categories,
        (SELECT COUNT(*)::int FROM articles WHERE client_id = $2) AS articles,
        (SELECT COUNT(*)::int FROM fournisseurs WHERE entreprise_id = $1 AND is_labo IS NOT TRUE AND nom <> 'AUTO') AS fournisseurs,
        (SELECT COUNT(*)::int FROM produits WHERE client_id = $2) AS produits,
        (SELECT COUNT(*)::int FROM acheteurs WHERE client_id = $2) AS acheteurs`,
      [entrepriseId, clientId]
    ),
    one(
      `SELECT COUNT(DISTINCT s.activite_id)::int AS n
       FROM activite_ingredient_selections s
       JOIN activites a ON a.id = s.activite_id
       WHERE a.entreprise_id = $1`,
      [entrepriseId]
    ),
    one(
      `SELECT COUNT(DISTINCT s.labo_id)::int AS n
       FROM labo_ingredient_selections s
       JOIN labos l ON l.id = s.labo_id
       WHERE l.entreprise_id = $1`,
      [entrepriseId]
    ),
    one(
      `SELECT
        EXISTS (SELECT 1 FROM stock_entreprise_daily sd JOIN activites a ON a.id = sd.activite_id
                WHERE a.entreprise_id = $1 AND sd.quantite > 0) AS appro_activite,
        EXISTS (SELECT 1 FROM stock_labo_daily sl JOIN labos l ON l.id = sl.labo_id
                WHERE l.entreprise_id = $1 AND sl.quantite > 0) AS appro_labo,
        EXISTS (SELECT 1 FROM ventes v JOIN activites a ON a.id = v.activite_id
                WHERE a.entreprise_id = $1) AS vente`,
      [entrepriseId]
    ),
  ]);

  const prevAct = Number(cfg.nb_activites) || 0;
  const prevLabo = Number(cfg.nb_labos) || 0;
  // Verrou Espace Produit : formule basique sans labo souscrit (même règle que manuelVisibilite)
  const espaceProduit = !(cfg.formule_activites === 'basique' && prevLabo === 0 && counts.labos === 0);

  const etapes = [];
  const add = (key, titre, fait, detail) => etapes.push({ key, titre, fait: !!fait, detail: detail || null });

  // 1-2 : un client connecté a forcément signé son contrat et activé son compte
  add('contrat', 'Contrat signé', true);
  add('activation', 'Compte activé', true);

  // 3 : capacités souscrites créées (activités et/ou labos selon la config)
  const actOk = prevAct === 0 || counts.activites >= prevAct;
  const laboOk = prevLabo === 0 || counts.labos >= prevLabo;
  const capParts = [];
  if (prevAct > 0) capParts.push(`${Math.min(counts.activites, prevAct)}/${prevAct} activité${prevAct > 1 ? 's' : ''}`);
  if (prevLabo > 0) capParts.push(`${Math.min(counts.labos, prevLabo)}/${prevLabo} labo${prevLabo > 1 ? 's' : ''}`);
  add('capacites', 'Activités & labos de votre formule', actOk && laboOk, capParts.join(' · ') || null);

  // 4 : référentiel de base
  const refManque = [];
  if (!counts.unites) refManque.push('unités');
  if (!counts.familles) refManque.push('familles');
  if (!counts.categories) refManque.push('catégories');
  add('referentiel', 'Référentiel de base (unités, familles, catégories)', refManque.length === 0,
    refManque.length ? `à créer : ${refManque.join(', ')}` : `${counts.unites} unités · ${counts.familles} familles · ${counts.categories} catégories`);

  // 5 : articles + affectation à chaque activité / labo créé
  const affOk = counts.articles > 0 && selAct.n >= counts.activites && selLabo.n >= counts.labos;
  const affParts = [`${counts.articles} article${counts.articles > 1 ? 's' : ''}`];
  if (counts.activites > 0) affParts.push(`${selAct.n}/${counts.activites} activité${counts.activites > 1 ? 's' : ''} affectée${counts.activites > 1 ? 's' : ''}`);
  if (counts.labos > 0) affParts.push(`${selLabo.n}/${counts.labos} labo${counts.labos > 1 ? 's' : ''}`);
  add('articles', 'Articles + affectation aux activités/labos', affOk, affParts.join(' · '));

  // 6 : fournisseurs
  add('fournisseurs', 'Fournisseurs', counts.fournisseurs > 0,
    counts.fournisseurs ? `${counts.fournisseurs} fournisseur${counts.fournisseurs > 1 ? 's' : ''}` : null);

  // 7 : produits & fiches techniques (sauf Espace Produit verrouillé)
  if (espaceProduit) {
    add('produits', 'Produits & fiches techniques', counts.produits > 0,
      counts.produits ? `${counts.produits} produit${counts.produits > 1 ? 's' : ''}` : null);
  }

  // 8 : première saisie (appro, et vente si des activités existent)
  const saisieOk = saisies.appro_activite || saisies.appro_labo || saisies.vente;
  add('saisie', 'Première saisie (appro / vente)', saisieOk,
    saisieOk ? null : 'aucun approvisionnement ni vente pour l\'instant');

  // 9 : base acheteurs (si le module est actif)
  if (moduleAcheteurs) {
    add('acheteurs', 'Carnet d\'acheteurs', counts.acheteurs > 0,
      counts.acheteurs ? `${counts.acheteurs} acheteur${counts.acheteurs > 1 ? 's' : ''}` : null);
  }

  const complet = etapes.every((e) => e.fait);
  const aFaire = etapes.find((e) => !e.fait)?.key || null;
  return { complet, etapes, aFaire };
}

// Bloc de contexte injecté dans le prompt du bot pendant la mise en route.
function onboardingPromptBlock(etat) {
  if (!etat || etat.complet) return '';
  const lignes = etat.etapes.map((e) => `- [${e.fait ? 'FAIT' : 'À FAIRE'}] ${e.titre}${e.detail ? ` (${e.detail})` : ''}`).join('\n');
  return `\n\n## MISSION PRIORITAIRE : guide de mise en route
Ce client est EN PHASE D'ONBOARDING. Ton rôle premier est de le guider pas à pas pour terminer sa mise en route. Son avancement réel :
${lignes}
Règles : concentre-toi sur la PREMIÈRE étape « À FAIRE » ; explique concrètement où cliquer et quoi faire dans LabFlow (appuie-toi sur search_knowledge_base pour les procédures) ; propose l'étape suivante quand une étape semble terminée ; reste encourageant et bref.`;
}

module.exports = { computeOnboardingEtat, onboardingPromptBlock };
