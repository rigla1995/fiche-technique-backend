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
      `SELECT ac.nb_activites, ac.nb_labos, ac.formule_activites, ac.domaine_id
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
  // Verrou Espace Produit : formule basique sans labo souscrit ni créé (même règle que
  // manuelVisibilite / requireFormulePremium) — R1 paramétrée par domaine, fonction unique.
  const { getProfil, espaceProduitVerrouille } = require('./domaineProfilService');
  const profil = cfg.domaine_id ? await getProfil(cfg.domaine_id) : null;
  const espaceProduit = !espaceProduitVerrouille(
    { formule_activites: cfg.formule_activites, nb_labos: Math.max(prevLabo, counts.labos) },
    profil?.regles
  );

  // Les libellés ET les questions suggérées suivent la CONFIG du compte : un
  // compte sans labo ne voit jamais « Comment créer mon labo ? », etc.
  const etapes = [];
  const add = (key, titre, fait, detail, questions) =>
    etapes.push({ key, titre, fait: !!fait, detail: detail || null, questions: questions || [] });

  // 1-2 : un client connecté a forcément signé son contrat et activé son compte
  add('contrat', 'Contrat signé', true);
  add('activation', 'Compte activé', true);

  // 3 : capacités souscrites créées (activités et/ou labos selon la config)
  const actOk = prevAct === 0 || counts.activites >= prevAct;
  const laboOk = prevLabo === 0 || counts.labos >= prevLabo;
  const capParts = [];
  if (prevAct > 0) capParts.push(`${Math.min(counts.activites, prevAct)}/${prevAct} activité${prevAct > 1 ? 's' : ''}`);
  if (prevLabo > 0) capParts.push(`${Math.min(counts.labos, prevLabo)}/${prevLabo} labo${prevLabo > 1 ? 's' : ''}`);
  const capTitre = prevAct > 0 && prevLabo > 0
    ? 'Activités & labos de votre formule'
    : prevLabo > 0 ? `Labo${prevLabo > 1 ? 's' : ''} de votre formule` : `Activité${prevAct > 1 ? 's' : ''} de votre formule`;
  const capQuestions = [];
  if (prevAct > 0 && counts.activites < prevAct) capQuestions.push(prevAct > 1 ? 'Comment créer mes activités ?' : 'Comment créer mon activité ?');
  if (prevLabo > 0 && counts.labos < prevLabo) capQuestions.push(prevLabo > 1 ? 'Comment créer mes labos ?' : 'Comment créer mon labo ?');
  if (prevAct > 0 && prevLabo > 0) capQuestions.push('Quelle est la différence entre une activité et un labo ?');
  add('capacites', capTitre, actOk && laboOk, capParts.join(' · ') || null, capQuestions);

  // 4 : référentiel de base
  const refManque = [];
  if (!counts.unites) refManque.push('unités');
  if (!counts.familles) refManque.push('familles');
  if (!counts.categories) refManque.push('catégories');
  add('referentiel', 'Référentiel de base (unités, familles, catégories)', refManque.length === 0,
    refManque.length ? `à créer : ${refManque.join(', ')}` : `${counts.unites} unités · ${counts.familles} familles · ${counts.categories} catégories`,
    [
      'Par quoi commencer pour mon référentiel ?',
      'À quoi servent les familles et les catégories ?',
      'Comment créer mes unités ?',
    ]);

  // 5 : articles + affectation à chaque activité / labo créé
  const affOk = counts.articles > 0 && selAct.n >= counts.activites && selLabo.n >= counts.labos;
  const affParts = [`${counts.articles} article${counts.articles > 1 ? 's' : ''}`];
  if (counts.activites > 0) affParts.push(`${selAct.n}/${counts.activites} activité${counts.activites > 1 ? 's' : ''} affectée${counts.activites > 1 ? 's' : ''}`);
  if (counts.labos > 0) affParts.push(`${selLabo.n}/${counts.labos} labo${counts.labos > 1 ? 's' : ''}`);
  const aAct = prevAct > 0 || counts.activites > 0;
  const aLabo = prevLabo > 0 || counts.labos > 0;
  const ciblesQuestions = [
    ...(aAct ? [counts.activites > 1 || prevAct > 1 ? 'mes activités' : 'mon activité'] : []),
    ...(aLabo ? [counts.labos > 1 || prevLabo > 1 ? 'mes labos' : 'mon labo'] : []),
  ].join(' et ') || 'mes espaces';
  const ciblesTitre = aAct && aLabo ? 'aux activités/labos' : aLabo ? 'au labo' : 'aux activités';
  add('articles', `Articles + affectation ${ciblesTitre}`, affOk, affParts.join(' · '),
    [
      'Comment ajouter mes articles ?',
      'Comment importer mes articles en masse ?',
      `Comment affecter les articles à ${ciblesQuestions} ?`,
    ]);

  // 6 : fournisseurs
  add('fournisseurs', 'Fournisseurs', counts.fournisseurs > 0,
    counts.fournisseurs ? `${counts.fournisseurs} fournisseur${counts.fournisseurs > 1 ? 's' : ''}` : null,
    [
      'Comment ajouter mes fournisseurs ?',
      'Comment importer mes fournisseurs depuis Excel ?',
      'À quoi servent les affectations d\'un fournisseur ?',
    ]);

  // 7 : produits & fiches techniques (sauf Espace Produit verrouillé)
  if (espaceProduit) {
    add('produits', 'Produits & fiches techniques', counts.produits > 0,
      counts.produits ? `${counts.produits} produit${counts.produits > 1 ? 's' : ''}` : null,
      [
        'Comment créer un produit et sa fiche technique ?',
        'C\'est quoi un produit valorisé ?',
        'Comment est calculé le coût de revient d\'une recette ?',
      ]);
  }

  // 8 : première saisie (appro, et vente si des activités existent)
  const saisieOk = saisies.appro_activite || saisies.appro_labo || saisies.vente;
  const saisieQuestions = ['Comment saisir mon premier approvisionnement ?'];
  if (counts.activites > 0 || prevAct > 0) saisieQuestions.push('Comment saisir une vente ?');
  saisieQuestions.push('Comment mon stock est-il calculé ?');
  add('saisie', counts.activites > 0 || prevAct > 0 ? 'Première saisie (appro / vente)' : 'Premier approvisionnement du labo', saisieOk,
    saisieOk ? null : 'aucun approvisionnement ni vente pour l\'instant', saisieQuestions);

  // 9 : base acheteurs (si le module est actif)
  if (moduleAcheteurs) {
    add('acheteurs', 'Carnet d\'acheteurs', counts.acheteurs > 0,
      counts.acheteurs ? `${counts.acheteurs} acheteur${counts.acheteurs > 1 ? 's' : ''}` : null,
      [
        'Comment remplir mon carnet d\'acheteurs ?',
        'Comment importer mes acheteurs depuis Excel ?',
        'Comment configurer mes tarifs acheteurs ?',
      ]);
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
Règles : concentre-toi sur la PREMIÈRE étape « À FAIRE » ; explique concrètement où cliquer et quoi faire dans LabFlow (appuie-toi sur search_knowledge_base pour les procédures) ; ne parle JAMAIS d'une capacité que ce compte n'a pas (pas de labo si aucun labo ci-dessus, pas d'acheteurs si l'étape n'existe pas) ; le client ne peut PAS taper de texte libre (il clique des questions proposées) : n'utilise JAMAIS ask_clarification, réponds toujours complètement ; propose l'étape suivante quand une étape semble terminée ; reste encourageant.

## FORMAT DES RÉPONSES DU GUIDE (obligatoire)
- Commence par un court titre en **gras** avec un emoji (ex. **🧂 Créer vos unités**)
- Actions en liste numérotée : 1. 2. 3. — UNE action par ligne, courte
- Chemins de navigation TOUJOURS au format : 📍 **Menu → Page** (ex. 📍 **Référentiel → Unités**)
- Une ligne VIDE entre chaque bloc (titre, liste, remarque) — jamais de pavé de texte
- Termine par « ➡️ **Prochaine étape :** … » (la suite logique de sa mise en route)`;
}

module.exports = { computeOnboardingEtat, onboardingPromptBlock };
