/* Test de régression — transitions des étapes de mise en route (sans HTTP ni IA).
 * Construit un client de test VIERGE puis complète chaque étape en SQL et vérifie
 * que computeOnboardingEtat la coche au bon moment. Auto-nettoyage complet.
 * Lot 1b §3.5 : chaque étape porte `route` ; « capacités » porte `composants[]`
 * (détail par composant souscrit, repli par type technique sans composant). */
require('dotenv').config();
const pool = require('../src/config/database');
const { computeOnboardingEtat } = require('../src/services/onboardingEtat');

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

(async () => {
  let userId = null;
  try {
    // ── Compte de test : 1 activité souscrite, 0 labo, formule premium, module acheteurs OFF
    const u = await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-Onb', 'test-onboarding-etapes@example.com', 'x', 'client', true) RETURNING id`
    );
    userId = u.rows[0].id;
    const pe = await pool.query(
      `INSERT INTO profil_entreprise (client_id, nom, email) VALUES ($1, 'TEST-Onb SARL', 'test-onboarding-etapes@example.com') RETURNING id`,
      [userId]
    );
    const entrepriseId = pe.rows[0].id;
    const ab = await pool.query(`INSERT INTO abonnements (client_id) VALUES ($1) RETURNING id`, [userId]);
    await pool.query(
      `INSERT INTO abonnement_config (abonnement_id, nb_activites, nb_labos, nb_gerants, formule_activites) VALUES ($1, 1, 0, 0, 'premium')`,
      [ab.rows[0].id]
    );

    const etat = () => computeOnboardingEtat(userId);
    const etape = (e, key) => e.etapes.find((x) => x.key === key);

    let e = await etat();
    check('compte vierge → à faire = capacités', e.aFaire === 'capacites');
    check('lot 1b : chaque étape porte une route (capacités → /client/activites)',
      e.etapes.filter((x) => x.key !== 'activation').every((x) => typeof x.route === 'string' && x.route.startsWith('/client/'))
      && etape(e, 'capacites').route === '/client/activites' && etape(e, 'referentiel').route === '/client/referentiel/unites',
      e.etapes.map((x) => `${x.key}:${x.route}`).join(' | '));
    check('lot 1b : sans composant souscrit → composants = [] (repli par type technique)',
      Array.isArray(etape(e, 'capacites').composants) && etape(e, 'capacites').composants.length === 0, JSON.stringify(etape(e, 'capacites').composants));
    check('libellé sans labo (config 1 activité / 0 labo)', etape(e, 'capacites').titre.includes('Activité') && !etape(e, 'capacites').titre.toLowerCase().includes('labo'), etape(e, 'capacites').titre);
    check('questions sans « créer mon labo »', !etape(e, 'capacites').questions.some((q) => /labo/.test(q)), etape(e, 'capacites').questions.join(' | '));

    // ── Activité créée
    const act = await pool.query(`INSERT INTO activites (entreprise_id, nom) VALUES ($1, 'TEST-Resto') RETURNING id`, [entrepriseId]);
    const activiteId = act.rows[0].id;
    e = await etat();
    check('activité créée → capacités FAIT, à faire = référentiel', etape(e, 'capacites').fait && e.aFaire === 'referentiel');

    // ── Lot 1b : capacités PAR COMPOSANT (domaine hôtellerie : restaurant / bar…)
    const hot = await pool.query(
      `SELECT d.id AS domaine_id,
              (SELECT id FROM domaine_composants WHERE domaine_id = d.id AND code = 'restaurant') AS restaurant_id,
              (SELECT id FROM domaine_composants WHERE domaine_id = d.id AND code = 'bar') AS bar_id
         FROM domaines_activite d WHERE d.slug = 'hotellerie'`
    );
    if (hot.rows.length && hot.rows[0].restaurant_id && hot.rows[0].bar_id) {
      const { domaine_id, restaurant_id, bar_id } = hot.rows[0];
      await pool.query('UPDATE abonnement_config SET domaine_id = $1 WHERE abonnement_id = $2', [domaine_id, ab.rows[0].id]);
      await pool.query('INSERT INTO abonnement_config_composants (abonnement_id, composant_id, nb) VALUES ($1, $2, 1)', [ab.rows[0].id, restaurant_id]);
      e = await etat();
      let cap = etape(e, 'capacites');
      check('composant souscrit Restaurant ×1 : unité sans composant imputée au 1er composant du type → 1/1 Restaurant, FAIT',
        cap.fait && cap.detail === '1/1 Restaurant' && cap.composants.length === 1 && cap.composants[0].code === 'restaurant' && cap.composants[0].crees === 1 && cap.composants[0].attendu === 1,
        JSON.stringify({ detail: cap.detail, composants: cap.composants }));
      await pool.query('UPDATE unites_operationnelles SET composant_id = $1 WHERE activite_id = $2', [bar_id, activiteId]);
      e = await etat();
      cap = etape(e, 'capacites');
      check('activité passée en Bar → 0/1 Restaurant, PAS FAIT, question par composant',
        !cap.fait && cap.detail === '0/1 Restaurant' && cap.composants[0].crees === 0 && cap.questions.some((q) => /restaurant/i.test(q)),
        JSON.stringify({ detail: cap.detail, questions: cap.questions }));
      await pool.query('UPDATE unites_operationnelles SET composant_id = $1 WHERE activite_id = $2', [restaurant_id, activiteId]);
      e = await etat();
      check('activité Restaurant explicite → 1/1 Restaurant, FAIT', etape(e, 'capacites').fait && etape(e, 'capacites').detail === '1/1 Restaurant', etape(e, 'capacites').detail);
    } else {
      check('domaine hôtellerie (restaurant + bar) présent pour le scénario composants', false, 'domaine ou composants absents');
    }

    // ── Référentiel
    const un = await pool.query(`INSERT INTO unites (nom, client_id) VALUES ('TEST-kg', $1) RETURNING id`, [userId]);
    const fa = await pool.query(`INSERT INTO familles (nom, client_id) VALUES ('TEST-Fam', $1) RETURNING id`, [userId]);
    await pool.query(`INSERT INTO categories (nom, famille_id, client_id) VALUES ('TEST-Cat', $1, $2)`, [fa.rows[0].id, userId]);
    e = await etat();
    check('référentiel créé → FAIT, à faire = articles', etape(e, 'referentiel').fait && e.aFaire === 'articles');

    // ── Article + affectation
    const ar = await pool.query(`INSERT INTO articles (nom, unite_id, client_id) VALUES ('TEST-Farine', $1, $2) RETURNING id`, [un.rows[0].id, userId]);
    e = await etat();
    check('article SANS affectation → étape articles PAS faite', !etape(e, 'articles').fait);
    await pool.query(`INSERT INTO activite_ingredient_selections (activite_id, ingredient_id) VALUES ($1, $2)`, [activiteId, ar.rows[0].id]);
    e = await etat();
    check('affectation faite → FAIT, à faire = fournisseurs', etape(e, 'articles').fait && e.aFaire === 'fournisseurs');

    // ── Fournisseur
    await pool.query(`INSERT INTO fournisseurs (entreprise_id, nom) VALUES ($1, 'TEST-Fourn')`, [entrepriseId]);
    e = await etat();
    check('fournisseur créé → FAIT, à faire = produits', etape(e, 'fournisseurs').fait && e.aFaire === 'produits');

    // ── Produit (vendable, origine activité — le parcours réel de ProductForm)
    await pool.query(
      `INSERT INTO produits (nom, type, client_id, activite_id, origine, created_by) VALUES ('TEST-Pizza', 'vendable', $1, $2, 'activite', $1)`,
      [userId, activiteId]
    );
    e = await etat();
    check('produit créé → étape produits FAIT', etape(e, 'produits')?.fait === true,
      JSON.stringify(etape(e, 'produits')));
    check('à faire = première saisie', e.aFaire === 'saisie');

    // ── Première saisie : un appro d'activité
    await pool.query(
      `INSERT INTO stock_entreprise_daily (activite_id, ingredient_id, date_appro, quantite, prix_unitaire, type_appro) VALUES ($1, $2, CURRENT_DATE, 10, 2.5, 'manuel')`,
      [activiteId, ar.rows[0].id]
    );
    e = await etat();
    check('appro saisi → étape saisie FAIT', etape(e, 'saisie').fait === true, JSON.stringify(etape(e, 'saisie')));
    check('mise en route COMPLÈTE (module acheteurs off → pas d\'étape acheteurs)', e.complet === true && !etape(e, 'acheteurs'),
      e.etapes.filter((x) => !x.fait).map((x) => x.key).join(',') || 'tout fait');
  } catch (err) {
    check('exception', false, err.message);
  } finally {
    if (userId) {
      await pool.query('DELETE FROM utilisateurs WHERE id = $1', [userId]).catch((e) => console.error('cleanup:', e.message));
      console.log('🧹 compte de test supprimé (cascade)');
    }
    await pool.end();
    const ko = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - ko}/${results.length} checks verts${ko ? ` — ${ko} ÉCHEC(S)` : ''}`);
    process.exit(ko ? 1 : 0);
  }
})();
