const pool = require('../config/database');
// Lot 2b §7.4 — guide de mise en route dans le vocabulaire du compte : terme du lexique pour une
// catégorie, libellé du composant pour le type d'une unité (table identité du moteur).
const { libelleComposant, entreeComposantVoc } = require('../utils/vocab');
const { vocabDuProfil } = require('../utils/vocabCompte');

// ── État de mise en route d'un compte, calculé EN DIRECT contre sa config ────
// Le bot d'onboarding (bulle 🤖) n'existe que tant que la configuration
// souscrite n'est pas entièrement mise en place ; il disparaît quand tout est
// fait et RÉAPPARAÎT automatiquement après un ajout de capacité (nouvelle activité,
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
      `SELECT a.id AS abonnement_id, ac.nb_activites, ac.nb_labos, ac.formule_activites, ac.domaine_id
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
  // Vocabulaire du compte (lot 2b §7.1) : tiré du profil déjà chargé, sans requête de plus.
  const voc = vocabDuProfil(profil);
  const espaceProduit = !espaceProduitVerrouille(
    { formule_activites: cfg.formule_activites, nb_labos: Math.max(prevLabo, counts.labos) },
    profil?.regles
  );

  // Les libellés ET les questions suggérées suivent la CONFIG du compte : un
  // compte sans labo ne voit jamais « Comment créer mon labo ? », etc.
  // Lot 1b §3.5 : chaque étape porte sa `route` (lien de la checklist) ; l'étape « capacités »
  // détaille les composants souscrits (`composants: [{ code, libelle, attendu, crees }]`).
  const etapes = [];
  const add = (key, titre, fait, detail, questions, extra) =>
    etapes.push({ key, titre, fait: !!fait, detail: detail || null, questions: questions || [], route: ROUTES[key] || null, ...(extra || {}) });

  // 1 : un client connecté a forcément activé son compte (lot 3 : plus de contrat à signer, sans engagement)
  add('activation', 'Compte activé', true);

  // 3 : capacités souscrites créées (activités et/ou labos selon la config)
  const actOk = prevAct === 0 || counts.activites >= prevAct;
  const laboOk = prevLabo === 0 || counts.labos >= prevLabo;
  const capTitre = prevAct > 0 && prevLabo > 0
    ? `${voc.Nom('activite', true)} & ${voc.nom('labo', true)} de votre formule`
    : prevLabo > 0 ? `${voc.Nom('labo', prevLabo > 1)} de votre formule` : `${voc.Nom('activite', prevAct > 1)} de votre formule`;
  // Composants souscrits (activités / labos) : créés = unités portant le composant ; les unités
  // sans composant sont imputées au 1er composant actif de leur type (même règle que la fonction
  // SQL unites_op_composant_defaut). Repli par type technique si le compte n'a pas de composants.
  const composants = await capacitesParComposant(cfg.abonnement_id, entrepriseId);
  const capParts = [];
  const capQuestions = [];
  let capOk;
  if (composants.length > 0) {
    // Comptes « identité » (composants activite / labo uniquement) : libellés historiques conservés.
    const identite = composants.every((c) => c.code === 'activite' || c.code === 'labo');
    for (const c of composants) {
      // Liste toute en identité : terme du lexique ; liste mixte : libellé du composant (lexique
      // pour un composant identité au libellé du brouillon), accordé par entreeComposantVoc.
      const lib = identite
        ? (c.code === 'activite' ? voc.nom('activite', c.attendu > 1) : voc.nom('labo', c.attendu > 1))
        : libelleComposant(voc, c, c.attendu > 1);
      capParts.push(`${Math.min(c.crees, c.attendu)}/${c.attendu} ${lib}`);
      if (c.crees < c.attendu) {
        capQuestions.push(identite
          ? (c.code === 'activite' ? `Comment créer ${voc.mon('activite', c.attendu > 1)} ?` : `Comment créer ${voc.mon('labo', c.attendu > 1)} ?`)
          : `Comment créer ${voc.avec(entreeComposantVoc(voc, c)).mon('_', c.attendu > 1)} ?`);
      }
    }
    capOk = composants.every((c) => c.crees >= c.attendu) && actOk && laboOk;
  } else {
    if (prevAct > 0) capParts.push(`${Math.min(counts.activites, prevAct)}/${prevAct} ${voc.nom('activite', prevAct > 1)}`);
    if (prevLabo > 0) capParts.push(`${Math.min(counts.labos, prevLabo)}/${prevLabo} ${voc.nom('labo', prevLabo > 1)}`);
    if (prevAct > 0 && counts.activites < prevAct) capQuestions.push(`Comment créer ${voc.mon('activite', prevAct > 1)} ?`);
    if (prevLabo > 0 && counts.labos < prevLabo) capQuestions.push(`Comment créer ${voc.mon('labo', prevLabo > 1)} ?`);
    capOk = actOk && laboOk;
  }
  if (prevAct > 0 && prevLabo > 0) capQuestions.push(`Quelle est la différence entre ${voc.un('activite')} et ${voc.un('labo')} ?`);
  // Pastilles : même mot que le détail (libellé du composant, terme du lexique pour un composant identité)
  add('capacites', capTitre, capOk, capParts.join(' · ') || null, capQuestions,
    { composants: composants.map((c) => ({ code: c.code, libelle: libelleComposant(voc, c), attendu: c.attendu, crees: c.crees })) });

  // 4 : référentiel de base
  const refManque = [];
  if (!counts.unites) refManque.push('unités');
  if (!counts.familles) refManque.push('familles');
  if (!counts.categories) refManque.push('catégories');
  add('referentiel', `${voc.Nom('referentiel')} de base (unités, familles, catégories)`, refManque.length === 0,
    refManque.length ? `à créer : ${refManque.join(', ')}` : `${counts.unites} unités · ${counts.familles} familles · ${counts.categories} catégories`,
    [
      `Par quoi commencer pour ${voc.mon('referentiel')} ?`,
      'À quoi servent les familles et les catégories ?',
      'Comment créer mes unités ?',
    ]);

  // 5 : articles + affectation à chaque activité / labo créé
  const affOk = counts.articles > 0 && selAct.n >= counts.activites && selLabo.n >= counts.labos;
  const affParts = [`${counts.articles} ${voc.nom('article', counts.articles > 1)}`];
  if (counts.activites > 0) affParts.push(`${selAct.n}/${counts.activites} ${voc.nom('activite', counts.activites > 1)} ${voc.acc('activite', 'affecté', 'affectée', counts.activites > 1)}`);
  if (counts.labos > 0) affParts.push(`${selLabo.n}/${counts.labos} ${voc.nom('labo', counts.labos > 1)}`);
  const aAct = prevAct > 0 || counts.activites > 0;
  const aLabo = prevLabo > 0 || counts.labos > 0;
  const ciblesQuestions = [
    ...(aAct ? [voc.mon('activite', counts.activites > 1 || prevAct > 1)] : []),
    ...(aLabo ? [voc.mon('labo', counts.labos > 1 || prevLabo > 1)] : []),
  ].join(' et ') || 'mes espaces';
  const ciblesTitre = aAct && aLabo ? `${voc.au('activite', true)}/${voc.nom('labo', true)}` : aLabo ? voc.au('labo') : voc.au('activite', true);
  add('articles', `${voc.Nom('article', true)} + affectation ${ciblesTitre}`, affOk, affParts.join(' · '),
    [
      `Comment ajouter ${voc.mon('article', true)} ?`,
      `Comment importer ${voc.mon('article', true)} en masse ?`,
      `Comment affecter ${voc.le('article', true)} à ${ciblesQuestions} ?`,
    ]);

  // 6 : fournisseurs
  add('fournisseurs', voc.Pl('fournisseur'), counts.fournisseurs > 0,
    counts.fournisseurs ? `${counts.fournisseurs} ${voc.nom('fournisseur', counts.fournisseurs > 1)}` : null,
    [
      `Comment ajouter ${voc.mon('fournisseur', true)} ?`,
      `Comment importer ${voc.mon('fournisseur', true)} depuis Excel ?`,
      `À quoi servent les affectations d'${voc.un('fournisseur')} ?`,
    ]);

  // 7 : produits & fiches techniques (sauf Espace Produit verrouillé)
  if (espaceProduit) {
    add('produits', `${voc.Nom('produit', true)} & ${voc.nom('fiche_technique', true)}`, counts.produits > 0,
      counts.produits ? `${counts.produits} ${voc.nom('produit', counts.produits > 1)}` : null,
      [
        `Comment créer ${voc.un('produit')} et ${voc.son('fiche_technique')} ?`,
        `C'est quoi ${voc.un('produit_valorise')} ?`,
        `Comment est calculé le coût de revient d'${voc.un('recette')} ?`,
      ]);
  }

  // 8 : première saisie (appro, et vente si des activités existent)
  const saisieOk = saisies.appro_activite || saisies.appro_labo || saisies.vente;
  const saisieQuestions = [`Comment saisir ${voc.acc('appro', 'mon premier', 'ma première')} ${voc.nom('appro')} ?`];
  if (counts.activites > 0 || prevAct > 0) saisieQuestions.push(`Comment saisir ${voc.un('vente')} ?`);
  saisieQuestions.push(`Comment ${voc.mon('stock')} est-${voc.acc('stock', 'il', 'elle')} ${voc.acc('stock', 'calculé', 'calculée')} ?`);
  add('saisie', counts.activites > 0 || prevAct > 0 ? `Première saisie (${voc.court('appro')} / ${voc.nom('vente')})` : `${voc.acc('appro', 'Premier', 'Première')} ${voc.nom('appro')} ${voc.du('labo')}`, saisieOk,
    saisieOk ? null : `${voc.aucun('appro')} ni ${voc.nom('vente')} pour l'instant`, saisieQuestions,
    // Route : stock des activités s'il y en a, sinon stock labo.
    { route: counts.activites > 0 || prevAct > 0 ? '/client/stock' : '/client/labo/stock' });

  // 9 : base acheteurs (si le module est actif)
  if (moduleAcheteurs) {
    add('acheteurs', `Carnet ${voc.de('acheteur', true)}`, counts.acheteurs > 0,
      counts.acheteurs ? `${counts.acheteurs} ${voc.nom('acheteur', counts.acheteurs > 1)}` : null,
      [
        `Comment remplir mon carnet ${voc.de('acheteur', true)} ?`,
        `Comment importer ${voc.mon('acheteur', true)} depuis Excel ?`,
        `Comment configurer mes tarifs ${voc.court('acheteur', true)} ?`,
      ]);
  }

  const complet = etapes.every((e) => e.fait);
  const aFaire = etapes.find((e) => !e.fait)?.key || null;
  return { complet, etapes, aFaire };
}

// Routes de la checklist (OnboardingChecklist rend les étapes telles quelles).
const ROUTES = {
  capacites: '/client/activites',
  referentiel: '/client/referentiel/unites',
  articles: '/client/referentiel/articles',
  fournisseurs: '/client/fournisseurs',
  produits: '/client/products',
  saisie: '/client/stock',
  acheteurs: '/client/acheteurs/tarifs',
};

// Composants activités / labos souscrits (abonnement_config_composants) avec le nombre d'unités
// créées : composant_id = c.id, + unités à composant NULL imputées au 1er composant actif du type.
async function capacitesParComposant(abonnementId, entrepriseId) {
  if (!abonnementId) return [];
  const { rows: comps } = await pool.query(
    `SELECT dc.id, dc.code, dc.libelle, dc.libelle_pluriel, dc.genre, dc.elision, dc.type_technique, acc.nb
       FROM abonnement_config_composants acc
       JOIN domaine_composants dc ON dc.id = acc.composant_id
      WHERE acc.abonnement_id = $1 AND dc.type_technique IN ('activite', 'labo') AND acc.nb > 0
      ORDER BY dc.ordre, dc.id`,
    [abonnementId]
  );
  if (!comps.length) return [];
  const [{ rows: counts }, { rows: defauts }] = await Promise.all([
    pool.query(
      `SELECT type_technique, composant_id, COUNT(*)::int AS n
         FROM unites_operationnelles WHERE entreprise_id = $1 GROUP BY 1, 2`,
      [entrepriseId]
    ),
    pool.query(
      `SELECT unites_op_composant_defaut($1, 'activite') AS activite, unites_op_composant_defaut($1, 'labo') AS labo`,
      [entrepriseId]
    ),
  ]);
  const defaut = defauts[0] || {};
  return comps.map((c) => {
    let crees = 0;
    for (const r of counts) {
      if (r.type_technique !== c.type_technique) continue;
      if (r.composant_id === c.id) crees += r.n;
      else if (r.composant_id == null && defaut[c.type_technique] === c.id) crees += r.n;
    }
    return { id: c.id, code: c.code, libelle: c.libelle, libellePluriel: c.libelle_pluriel, genre: c.genre === 'f' ? 'f' : 'm', elision: typeof c.elision === 'boolean' ? c.elision : null, typeTechnique: c.type_technique, attendu: Number(c.nb) || 0, crees };
  });
}

// Bloc de contexte injecté dans le prompt du bot pendant la mise en route.
// voc : vocabulaire du compte (lot 2b §7.1), obligatoire.
function onboardingPromptBlock(etat, voc) {
  if (!etat || etat.complet) return '';
  const lignes = etat.etapes.map((e) => `- [${e.fait ? 'FAIT' : 'À FAIRE'}] ${e.titre}${e.detail ? ` (${e.detail})` : ''}`).join('\n');
  return `\n\n## MISSION PRIORITAIRE : guide de mise en route
Ce client est EN PHASE D'ONBOARDING. Ton rôle premier est de le guider pas à pas pour terminer sa mise en route. Son avancement réel :
${lignes}
Règles : concentre-toi sur la PREMIÈRE étape « À FAIRE » ; explique concrètement où cliquer et quoi faire dans LabFlow (appuie-toi sur search_knowledge_base pour les procédures) ; ne parle JAMAIS d'une capacité que ce compte n'a pas (pas ${voc.de('labo')} si ${voc.aucun('labo')} ci-dessus, pas ${voc.de('acheteur', true)} si l'étape n'existe pas) ; le client ne peut PAS taper de texte libre (il clique des questions proposées) : n'utilise JAMAIS ask_clarification, réponds toujours complètement ; propose l'étape suivante quand une étape semble terminée ; reste encourageant.

## FORMAT DES RÉPONSES DU GUIDE (obligatoire)
- Commence par un court titre en **gras** avec un emoji (ex. **${voc.ex('🧂', '📏')} Créer vos unités**)
- Actions en liste numérotée : 1. 2. 3. — UNE action par ligne, courte
- Chemins de navigation TOUJOURS au format : 📍 **Menu → Page** (ex. 📍 **${voc.Nom('referentiel')} → Unités**)
- Une ligne VIDE entre chaque bloc (titre, liste, remarque) — jamais de pavé de texte
- Termine par « ➡️ **Prochaine étape :** … » (la suite logique de sa mise en route)`;
}

module.exports = { computeOnboardingEtat, onboardingPromptBlock };
