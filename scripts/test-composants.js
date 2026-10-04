/* Test E2E local — lot 1a : domaines (profil), composants, tarifs par domaine, wizard étape 2.
 * Backend démarré sur :3000 (migrations au boot). Crée un super_admin, un domaine et des
 * clients de test temporaires, puis nettoie TOUT (clients → DELETE /admin/clients/:id,
 * domaine → DELETE /api/domaines/:id, admin → SQL). */
// ⚠️ Ce script crée des comptes par POST /admin/clients (email de bienvenue). Démarrer le backend de test par
//    « node scripts/start-test-backend.js » (clés externes vidées, resend bouchonné, réseau sortant bloqué) —
//    jamais par « npm start » avec le .env d'un poste de développement, qui contient de vraies clés.
require('dotenv').config();
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');

const BASE = 'http://localhost:3000';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};
const approx = (a, b, eps = 0.01) => Math.abs(Number(a) - Number(b)) <= eps;
const r2 = (v) => Math.round(v * 100) / 100;

const ADMIN_EMAIL = 'test-admin-composants@example.com';
const CLIENT_EMAILS = ['test-composants-hotel@example.com', 'test-composants-legacy@example.com'];
const DOM_SLUG = 'test-composants';
const PWD = 'TestCompo2026!';

(async () => {
  const hash = await bcrypt.hash(PWD, 10);
  const wipe = async () => {
    await pool.query(`DELETE FROM utilisateurs WHERE email = ANY($1)`, [[ADMIN_EMAIL, ...CLIENT_EMAILS]]);
    await pool.query(`DELETE FROM domaines_activite WHERE slug = $1 OR nom = 'TEST-Domaine Composants'`, [DOM_SLUG]).catch(() => {});
  };
  await wipe();
  await pool.query(
    `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminCompo', $1, $2, 'super_admin', true)`,
    [ADMIN_EMAIL, hash]
  );
  let r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: PWD }),
  });
  const tok = (await r.json()).token;
  const HA = { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` };
  check('login super_admin temporaire', !!tok);
  const J = async (url, opts = {}) => {
    const res = await fetch(`${BASE}${url}`, { headers: HA, ...opts });
    let body = null;
    try { body = await res.json(); } catch (_) { body = null; }
    return { status: res.status, body };
  };

  const createdClients = [];
  let domId = null;
  try {
    // ── 1. Domaines : liste admin (profil résolu) ───────────────────────────────
    let { status, body } = await J('/api/domaines');
    check('GET /api/domaines → 200 liste', status === 200 && Array.isArray(body) && body.length >= 1, String(status));
    const restau = body.find((d) => d.slug === 'restauration');
    check('domaine restauration présent avec composants identité + lexique + regles + nbClients',
      !!restau && restau.composants.some((c) => c.code === 'activite' && c.typeTechnique === 'activite')
      && restau.lexique?.activite?.sg === 'Activité' && restau.regles?.acheteurs_requiert_labo === true && typeof restau.nbClients === 'number',
      JSON.stringify({ comps: restau?.composants?.map((c) => c.code), nb: restau?.nbClients }));
    check('hasIngredients disparu / lexique résolu v2 (≥ 32 clés)', restau && Object.keys(restau.lexique).length >= 32, String(restau && Object.keys(restau.lexique).length));

    // ── 2. POST /api/domaines → 4 composants identité ───────────────────────────
    ({ status, body } = await J('/api/domaines', { method: 'POST', body: JSON.stringify({ nom: 'TEST-Domaine Composants', slug: DOM_SLUG, description: 'Domaine de test' }) }));
    check('POST /api/domaines → 201 + 4 composants identité', status === 201 && body?.composants?.length === 4 && body.slug === DOM_SLUG,
      `${status} ${JSON.stringify(body?.composants?.map((c) => c.code))}`);
    domId = body?.id;
    ({ status } = await J('/api/domaines', { method: 'POST', body: JSON.stringify({ nom: 'TEST-Domaine Composants' }) }));
    check('POST domaine en double → 409', status === 409, String(status));

    // ── 3. PUT profil : composants (rename + ajout labo « atelier »), lexique, règles
    ({ status, body } = await J(`/api/domaines/${domId}`, {
      method: 'PUT',
      body: JSON.stringify({
        description: 'Boutiques + atelier',
        // lot 2 (spec §1.4) : un singulier surchargé exige pluriel, genre et élision
        lexique: { activite: { sg: 'Boutique', pl: 'Boutiques', g: 'f', el: false }, labo: { sg: 'Atelier', pl: 'Ateliers', g: 'm', el: true } },
        regles: { seuil_cout_matiere_pct: 35 },
        composants: [
          { code: 'activite', libelle: 'Boutique', libellePluriel: 'Boutiques', icone: '🏪', typeTechnique: 'activite', ordre: 1 },
          { code: 'atelier', libelle: 'Atelier', libellePluriel: 'Ateliers', icone: '🔧', aide: 'Produit et livre', typeTechnique: 'labo', ordre: 2, nbMax: 3 },
          { code: 'gerant', libelle: 'Responsable', libellePluriel: 'Responsables', icone: '👤', typeTechnique: 'gerant', ordre: 3 },
          { code: 'acheteurs', libelle: 'Revendeur', libellePluriel: 'Revendeurs', icone: '🤝', typeTechnique: 'acheteurs', ordre: 4 },
        ],
      }),
    }));
    check('PUT /api/domaines/:id → 200 profil (composants upsert par code, labo supprimé)',
      status === 200 && body?.composants?.length === 4 && body.composants.some((c) => c.code === 'atelier' && c.typeTechnique === 'labo' && c.nbMax === 3)
      && !body.composants.some((c) => c.code === 'labo'),
      `${status} ${JSON.stringify(body?.composants?.map((c) => c.code))}`);
    check('lexique résolu (écarts + défaut conservé + clés dérivées) et règle surchargée',
      body?.lexique?.activite?.sg === 'Boutique' && body.lexique.activite.g === 'f' && body.lexique.labo.sg === 'Atelier' && body.lexique.labo.pl === 'Ateliers'
      && body.lexique.article.sg === 'Article' && body.lexique.espace_labo.sg === 'Espace Atelier' && body.lexique.espace_activites.sg === 'Espace Boutiques'
      && body.regles?.seuil_cout_matiere_pct === 35 && body.regles.acheteurs_requiert_labo === true,
      JSON.stringify({ act: body?.lexique?.activite, labo: body?.lexique?.labo, espace: body?.lexique?.espace_labo?.sg, seuil: body?.regles?.seuil_cout_matiere_pct }));
    ({ status, body } = await J(`/api/domaines/${domId}`, { method: 'PUT', body: JSON.stringify({ lexique: { labo: { sg: 'Atelier' } } }) }));
    check('PUT lexique incomplet (sg sans pl, g, el) → 400 LEXIQUE_ENTREE_INCOMPLETE', status === 400 && body?.code === 'LEXIQUE_ENTREE_INCOMPLETE', `${status} ${body?.code}`);
    ({ status, body } = await J(`/api/domaines/${domId}`, { method: 'PUT', body: JSON.stringify({ regles: { inconnue: 1 } }) }));
    check('PUT règle inconnue → 400', status === 400, String(status));
    ({ status } = await J(`/api/domaines/${domId}`, { method: 'PUT', body: JSON.stringify({ composants: [{ code: 'Bad Code', libelle: 'x', typeTechnique: 'labo' }] }) }));
    check('PUT composant code invalide → 400', status === 400, String(status));

    // GET /:id → profil + tarifs
    ({ status, body } = await J(`/api/domaines/${domId}`));
    check('GET /api/domaines/:id → profil + tarifs (13 clés surchargeables, surcharge null)',
      status === 200 && body?.tarifs?.prix_base_activite_premium && body.tarifs.prix_base_activite_premium.surcharge === null
      && typeof body.tarifs.prix_base_activite_premium.valeurGenerale === 'number',
      `${status} ${JSON.stringify(body?.tarifs?.prix_base_activite_premium)}`);
    const T = body.tarifs;
    const tv = (k, d) => parseFloat(T[k]?.valeur ?? d);
    const pP = tv('prix_base_activite_premium', 200), rl = tv('remise_avec_labo', 30) / 100;
    const pLabo = tv('labo_sup_mensuel', 160), pGer = tv('gerant_sup_mensuel', 80), p10 = tv('acheteurs_palier_10', 50);
    const attendu2111 = r2(2 * pP * (1 - rl) + pLabo + pGer + p10);

    // ── 4. pricing-preview avec composants ──────────────────────────────────────
    const compos = [{ code: 'activite', nb: 2 }, { code: 'atelier', nb: 1 }, { code: 'gerant', nb: 1 }, { code: 'acheteurs', nb: 10 }];
    ({ status, body } = await J(`/api/abonnements/pricing-preview?domaineId=${domId}&formuleActivites=premium&composants=${encodeURIComponent(JSON.stringify(compos))}`));
    check(`pricing-preview composants → total ${attendu2111} + composants[] + regles + domaine`,
      status === 200 && approx(body?.totalMensuel, attendu2111) && body.composants?.length === 4
      && body.composants[0].libelle === 'Boutique' && body.regles?.seuil_cout_matiere_pct === 35 && body.domaine?.id === domId
      && body.activite?.nb === 2 && body.labo?.nb === 1 && body.acheteurs?.palier === 10,
      `${status} total=${body?.totalMensuel} comps=${JSON.stringify(body?.composants?.map((c) => `${c.code}:${c.nb}`))}`);
    ({ status, body } = await J(`/api/abonnements/pricing-preview?domaineId=${domId}&composants=${encodeURIComponent(JSON.stringify([{ code: 'inconnu', nb: 1 }]))}`));
    check('pricing-preview composant inconnu → 400 COMPOSANT_INCONNU', status === 400 && body?.code === 'COMPOSANT_INCONNU', `${status} ${body?.code}`);

    // ── 5. POST /admin/clients avec domaineId + composants ──────────────────────
    ({ status, body } = await J('/admin/clients', {
      method: 'POST',
      body: JSON.stringify({ nom: 'TEST-Compo Hotel', email: CLIENT_EMAILS[0], telephone: '20123457', domaineId: domId, composants: compos, formuleActivites: 'premium', montantOnboarding: 700 }),
    }));
    check('POST /admin/clients (domaineId + composants) → 201 + domaineId/domaineNom', status === 201 && body?.domaineId === domId && body.domaineNom === 'TEST-Domaine Composants' && JSON.stringify(body.domaineIds) === JSON.stringify([domId]),
      `${status} ${JSON.stringify({ d: body?.domaineId, n: body?.domaineNom, ids: body?.domaineIds })}`);
    const c1 = body?.id;
    if (c1) createdClients.push(c1);
    ({ status, body } = await J(`/api/abonnements/client/${c1}?withPricing=1`));
    const cfg = body?.config;
    check('config dérivée exacte (2/1/1/10) + composants[] + domaine', status === 200 && cfg?.nbActivites === 2 && cfg.nbLabos === 1 && cfg.nbGerants === 1 && cfg.nbAcheteurs === 10
      && cfg.domaineId === domId && cfg.domaineSlug === DOM_SLUG && cfg.domaineNom === 'TEST-Domaine Composants'
      && cfg.composants?.length === 4 && cfg.composants.find((c) => c.code === 'atelier')?.nb === 1 && cfg.formuleActivites === 'premium',
      JSON.stringify({ a: cfg?.nbActivites, l: cfg?.nbLabos, g: cfg?.nbGerants, ac: cfg?.nbAcheteurs, d: cfg?.domaineId, comps: cfg?.composants?.map((c) => `${c.code}:${c.nb}`) }));
    check(`withPricing baseMensuel = ${attendu2111}`, approx(body?.pricing?.baseMensuel, attendu2111), String(body?.pricing?.baseMensuel));
    const sqlInv = (await pool.query(
      `SELECT ac.nb_activites, ac.nb_labos, ac.nb_gerants, ac.nb_acheteurs,
              (SELECT COUNT(*)::int FROM client_domaines cd WHERE cd.client_id = a.client_id) AS nb_cd,
              (SELECT domaine_id FROM client_domaines cd WHERE cd.client_id = a.client_id LIMIT 1) AS cd_dom,
              (SELECT module_acheteurs_actif FROM profil_entreprise pe WHERE pe.client_id = a.client_id) AS mod_ach
         FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id WHERE a.client_id = $1`, [c1])).rows[0];
    check('SQL : client_domaines = [domaineId], module acheteurs actif', sqlInv?.nb_cd === 1 && sqlInv.cd_dom === domId && sqlInv.mod_ach === true, JSON.stringify(sqlInv));
    const paie = (await pool.query(`SELECT montant_dt, statut FROM paiements p JOIN abonnements a ON a.id = p.abonnement_id WHERE a.client_id = $1`, [c1])).rows[0];
    check('paiement du mois créé (promo système 1er mois offert → 0 / gratuit)', !!paie && (approx(paie.montant_dt, 0) || approx(paie.montant_dt, attendu2111)), JSON.stringify(paie));

    // Composition invalide à la création → 400 + code
    ({ status, body } = await J('/admin/clients', {
      method: 'POST',
      body: JSON.stringify({ nom: 'TEST-Compo KO', email: 'test-compo-ko@example.com', domaineId: domId, composants: [{ code: 'activite', nb: 1 }, { code: 'acheteurs', nb: 10 }] }),
    }));
    check('POST client acheteurs sans labo → 400 ACHETEURS_SANS_LABO', status === 400 && body?.code === 'ACHETEURS_SANS_LABO', `${status} ${body?.code}`);
    ({ status, body } = await J('/admin/clients', {
      method: 'POST',
      body: JSON.stringify({ nom: 'TEST-Compo KO', email: 'test-compo-ko@example.com', domaineId: domId, composants: [{ code: 'atelier', nb: 1 }] }),
    }));
    check('POST client labo seul → 400 DEPOT_SANS_ACHETEURS', status === 400 && body?.code === 'DEPOT_SANS_ACHETEURS', `${status} ${body?.code}`);
    ({ status, body } = await J('/admin/clients', {
      method: 'POST',
      body: JSON.stringify({ nom: 'TEST-Compo KO', email: 'test-compo-ko@example.com', domaineId: domId, composants: [{ code: 'activite', nb: 1 }, { code: 'atelier', nb: 4 }] }),
    }));
    check('POST client atelier > nbMax(3) → 400 COMPOSANT_MAX', status === 400 && body?.code === 'COMPOSANT_MAX', `${status} ${body?.code}`);
    ({ status, body } = await J('/admin/clients', {
      method: 'POST',
      body: JSON.stringify({ nom: 'TEST-Compo KO', email: 'test-compo-ko@example.com', domaineId: 999999, nbActivites: 1 }),
    }));
    check('POST client domaine inconnu → 400', status === 400, `${status} ${body?.message}`);

    // ── 6. POST legacy (nbActivites…) → composants identité (restauration) ──────
    ({ status, body } = await J('/admin/clients', {
      method: 'POST',
      body: JSON.stringify({ nom: 'TEST-Compo Legacy', email: CLIENT_EMAILS[1], nbActivites: 1, nbLabos: 1, nbGerants: 0, nbAcheteurs: 10, montantOnboarding: 500 }),
    }));
    check('POST legacy → 201 (domaine par défaut restauration)', status === 201 && body?.domaineId === restau.id, `${status} ${body?.domaineId}/${restau?.id}`);
    const c2 = body?.id;
    if (c2) createdClients.push(c2);
    ({ status, body } = await J(`/api/abonnements/client/${c2}/config`));
    check('legacy : composants identité activite/labo/acheteurs (1/1/10)', status === 200 && body?.domaineSlug === 'restauration'
      && JSON.stringify(body.composants?.map((c) => `${c.code}:${c.nb}`)) === JSON.stringify(['activite:1', 'labo:1', 'acheteurs:10']),
      JSON.stringify(body?.composants?.map((c) => `${c.code}:${c.nb}`)));

    // ── 7. PUT config composants / legacy / erreurs ─────────────────────────────
    ({ status, body } = await J(`/api/abonnements/client/${c1}/config`, {
      method: 'PUT', body: JSON.stringify({ composants: [{ code: 'activite', nb: 3 }, { code: 'atelier', nb: 1 }], formuleActivites: 'basique' }),
    }));
    check('PUT config composants → 3/1/0/0 basique, domaine préservé, onboarding préservé (700)',
      status === 200 && body?.nbActivites === 3 && body.nbLabos === 1 && body.nbGerants === 0 && body.nbAcheteurs === 0 && body.formuleActivites === 'basique'
      && body.domaineId === domId && approx(body.montantOnboarding, 700) && body.composants?.length === 2,
      `${status} ${JSON.stringify({ a: body?.nbActivites, l: body?.nbLabos, g: body?.nbGerants, ac: body?.nbAcheteurs, f: body?.formuleActivites, o: body?.montantOnboarding })}`);
    ({ status, body } = await J(`/api/abonnements/client/${c1}/config`, {
      method: 'PUT', body: JSON.stringify({ nbActivites: 2, nbLabos: 1, nbGerants: 1, nbAcheteurs: 20, montantOnboarding: 700, formuleActivites: 'premium' }),
    }));
    check('PUT config legacy → composants du domaine (Boutique/Atelier/Responsable/Revendeur)',
      status === 200 && body?.nbActivites === 2 && body.nbAcheteurs === 20
      && JSON.stringify(body.composants?.map((c) => `${c.code}:${c.nb}`)) === JSON.stringify(['activite:2', 'atelier:1', 'gerant:1', 'acheteurs:20']),
      `${status} ${JSON.stringify(body?.composants?.map((c) => `${c.code}:${c.nb}`))}`);
    ({ status, body } = await J(`/api/abonnements/client/${c1}/config`, { method: 'PUT', body: JSON.stringify({ composants: [{ code: 'atelier', nb: 1 }] }) }));
    check('PUT config labo seul → 400 DEPOT_SANS_ACHETEURS', status === 400 && body?.code === 'DEPOT_SANS_ACHETEURS', `${status} ${body?.code}`);
    ({ status, body } = await J(`/api/abonnements/client/${c1}/config`, { method: 'PUT', body: JSON.stringify({ composants: [{ code: 'activite', nb: 1 }, { code: 'acheteurs', nb: 10 }] }) }));
    check('PUT config acheteurs sans labo → 400 ACHETEURS_SANS_LABO', status === 400 && body?.code === 'ACHETEURS_SANS_LABO', `${status} ${body?.code}`);
    ({ status, body } = await J(`/api/abonnements/client/${c1}/config`, { method: 'PUT', body: JSON.stringify({ composants: [{ code: 'labo', nb: 1 }, { code: 'activite', nb: 1 }] }) }));
    check('PUT config code hors domaine → 400 COMPOSANT_INCONNU', status === 400 && body?.code === 'COMPOSANT_INCONNU', `${status} ${body?.code}`);
    ({ status, body } = await J(`/api/abonnements/client/${c1}/config`, { method: 'PUT', body: JSON.stringify({ nbActivites: 2, nbLabos: 1, nbGerants: 1, montantOnboarding: 700, nbAcheteurs: 150 }) }));
    check('PUT config legacy quota > 100 → 400', status === 400, String(status));

    // ── 7b. Compte MULTI-composants : payload legacy = delta (jamais un remplacement) ──
    ({ status, body } = await J(`/api/domaines/${domId}`, {
      method: 'PUT',
      body: JSON.stringify({ composants: [
        { code: 'activite', libelle: 'Boutique', libellePluriel: 'Boutiques', icone: '🏪', typeTechnique: 'activite', ordre: 1 },
        { code: 'bar', libelle: 'Bar', libellePluriel: 'Bars', icone: '🍸', typeTechnique: 'activite', ordre: 2 },
        { code: 'atelier', libelle: 'Atelier', libellePluriel: 'Ateliers', icone: '🔧', aide: 'Produit et livre', typeTechnique: 'labo', ordre: 3, nbMax: 3 },
        { code: 'gerant', libelle: 'Responsable', libellePluriel: 'Responsables', icone: '👤', typeTechnique: 'gerant', ordre: 4 },
        { code: 'acheteurs', libelle: 'Revendeur', libellePluriel: 'Revendeurs', icone: '🤝', typeTechnique: 'acheteurs', ordre: 5 },
      ] }),
    }));
    check('PUT profil + composant « bar » (2e activité) → 200', status === 200 && body?.composants?.some((c) => c.code === 'bar'), String(status));
    ({ status, body } = await J(`/api/abonnements/client/${c1}/config`, {
      method: 'PUT', body: JSON.stringify({ composants: [{ code: 'activite', nb: 1 }, { code: 'bar', nb: 1 }, { code: 'atelier', nb: 1 }, { code: 'gerant', nb: 1 }, { code: 'acheteurs', nb: 20 }] }),
    }));
    const codesNb = (b) => JSON.stringify(b?.composants?.map((c) => `${c.code}:${c.nb}`));
    check('PUT config activite×1 + bar×1 → 2/1/1/20', status === 200 && body?.nbActivites === 2 && codesNb(body) === JSON.stringify(['activite:1', 'bar:1', 'atelier:1', 'gerant:1', 'acheteurs:20']), `${status} ${codesNb(body)}`);
    ({ status, body } = await J(`/api/abonnements/client/${c1}/config`, {
      method: 'PUT', body: JSON.stringify({ nbActivites: 2, nbLabos: 1, nbGerants: 1, nbAcheteurs: 20, montantOnboarding: 700, formuleActivites: 'basique' }),
    }));
    check('PUT legacy compteurs INCHANGÉS (changement de formule) → détail conservé (activite×1 + bar×1), formule basique',
      status === 200 && body?.formuleActivites === 'basique' && codesNb(body) === JSON.stringify(['activite:1', 'bar:1', 'atelier:1', 'gerant:1', 'acheteurs:20']), `${status} ${codesNb(body)}`);
    ({ status, body } = await J(`/api/abonnements/client/${c1}/config`, { method: 'PUT', body: JSON.stringify({ formuleActivites: 'premium' }) }));
    check('PUT { formuleActivites } seul → détail conservé, formule premium', status === 200 && body?.formuleActivites === 'premium' && codesNb(body) === JSON.stringify(['activite:1', 'bar:1', 'atelier:1', 'gerant:1', 'acheteurs:20']), `${status} ${codesNb(body)}`);
    ({ status, body } = await J(`/api/abonnements/client/${c1}/config`, {
      method: 'PUT', body: JSON.stringify({ nbActivites: 3, nbLabos: 1, nbGerants: 1, nbAcheteurs: 20, montantOnboarding: 700 }),
    }));
    check('PUT legacy nbActivites 2→3 → delta +1 sur le 1er composant souscrit (activite×2 + bar×1)',
      status === 200 && body?.nbActivites === 3 && codesNb(body) === JSON.stringify(['activite:2', 'bar:1', 'atelier:1', 'gerant:1', 'acheteurs:20']), `${status} ${codesNb(body)}`);
    // Retypage d'un composant utilisé → 409 ; désactivation → 200 (toléré pour les comptes qui l'utilisent)
    const profilBar = (actif, type = 'activite') => ({ composants: [
      { code: 'activite', libelle: 'Boutique', libellePluriel: 'Boutiques', icone: '🏪', typeTechnique: 'activite', ordre: 1 },
      { code: 'bar', libelle: 'Bar', libellePluriel: 'Bars', icone: '🍸', typeTechnique: type, ordre: 2, actif },
      { code: 'atelier', libelle: 'Atelier', libellePluriel: 'Ateliers', icone: '🔧', aide: 'Produit et livre', typeTechnique: 'labo', ordre: 3, nbMax: 3 },
      { code: 'gerant', libelle: 'Responsable', libellePluriel: 'Responsables', icone: '👤', typeTechnique: 'gerant', ordre: 4 },
      { code: 'acheteurs', libelle: 'Revendeur', libellePluriel: 'Revendeurs', icone: '🤝', typeTechnique: 'acheteurs', ordre: 5 },
    ] });
    ({ status, body } = await J(`/api/domaines/${domId}`, { method: 'PUT', body: JSON.stringify(profilBar(true, 'labo')) }));
    check('PUT profil : retypage de « bar » (utilisé) activite→labo → 409 COMPOSANT_UTILISE', status === 409 && body?.code === 'COMPOSANT_UTILISE' && body.composants?.[0]?.code === 'bar', `${status} ${body?.code}`);
    ({ status, body } = await J(`/api/domaines/${domId}`, { method: 'PUT', body: JSON.stringify(profilBar(false)) }));
    check('PUT profil : désactivation de « bar » (utilisé) → 200', status === 200 && body?.composants?.find((c) => c.code === 'bar')?.actif === false, String(status));
    ({ status, body } = await J(`/api/abonnements/client/${c1}/config`, {
      method: 'PUT', body: JSON.stringify({ composants: [{ code: 'activite', nb: 2 }, { code: 'bar', nb: 1 }, { code: 'atelier', nb: 1 }, { code: 'gerant', nb: 1 }, { code: 'acheteurs', nb: 20 }] }),
    }));
    check('PUT config avec « bar » inactif souscrit (nb inchangé) → 200 toléré', status === 200 && codesNb(body) === JSON.stringify(['activite:2', 'bar:1', 'atelier:1', 'gerant:1', 'acheteurs:20']), `${status} ${codesNb(body)}`);
    ({ status, body } = await J(`/api/abonnements/client/${c1}/config`, {
      method: 'PUT', body: JSON.stringify({ composants: [{ code: 'activite', nb: 2 }, { code: 'bar', nb: 2 }, { code: 'atelier', nb: 1 }, { code: 'gerant', nb: 1 }, { code: 'acheteurs', nb: 20 }] }),
    }));
    check('PUT config « bar » inactif nb 1→2 → 400 COMPOSANT_INACTIF', status === 400 && body?.code === 'COMPOSANT_INACTIF', `${status} ${body?.code}`);
    ({ status, body } = await J(`/api/abonnements/client/${c1}/config`, {
      method: 'PUT', body: JSON.stringify({ nbActivites: 2, nbLabos: 1, nbGerants: 1, nbAcheteurs: 20, montantOnboarding: 700 }),
    }));
    check('PUT legacy nbActivites 3→2 → delta −1 retiré du DERNIER composant souscrit (bar 1→0)',
      status === 200 && body?.nbActivites === 2 && codesNb(body) === JSON.stringify(['activite:2', 'atelier:1', 'gerant:1', 'acheteurs:20']), `${status} ${codesNb(body)}`);
    ({ status, body } = await J(`/api/domaines/${domId}`, { method: 'PUT', body: JSON.stringify(profilBar(true)) }));
    check('PUT profil : réactivation de « bar » → 200', status === 200, String(status));

    // ── 7c. Gardes : domaine par défaut protégé, preview domaine inconnu, tarifs number ──
    ({ status, body } = await J(`/api/domaines/${restau.id}`, { method: 'PUT', body: JSON.stringify({ slug: 'resto-x' }) }));
    check('PUT slug du domaine par défaut « restauration » → 400', status === 400, `${status} ${body?.message}`);
    ({ status, body } = await J(`/api/domaines/${restau.id}`, { method: 'DELETE' }));
    check('DELETE domaine par défaut « restauration » → 409 DOMAINE_DEFAUT', status === 409 && body?.code === 'DOMAINE_DEFAUT', `${status} ${body?.code}`);
    ({ status } = await J('/api/abonnements/pricing-preview?domaineId=999999&nbActivites=1'));
    check('pricing-preview domaineId inconnu → 404', status === 404, String(status));
    ({ status, body } = await J('/api/abonnements/tarifs'));
    check('GET tarifs : valeur numérique (number) sans surcharge', status === 200 && typeof body?.prix_base_activite_premium?.valeur === 'number', typeof body?.prix_base_activite_premium?.valeur);
    const attendu2112x20 = r2(2 * pP * (1 - rl) + pLabo + pGer + tv('acheteurs_palier_20', 90));

    // ── 8. Surcharge tarifaire du domaine → preview, withPricing, mon-abonnement ; DELETE → retour
    ({ status, body } = await J(`/api/abonnements/tarifs/prix_base_activite_premium`, { method: 'PUT', body: JSON.stringify({ valeur: 300, domaineId: domId }) }));
    check('PUT tarifs surcharge premium=300 domaine → clientsImpactes 1', status === 200 && approx(body?.valeur, 300) && body.clientsImpactes === 1, `${status} ${JSON.stringify(body)}`);
    const attenduSurch = r2(2 * 300 * (1 - rl) + pLabo + pGer + tv('acheteurs_palier_20', 90));
    ({ status, body } = await J(`/api/abonnements/pricing-preview?domaineId=${domId}&nbActivites=2&nbLabos=1&nbGerants=1&nbAcheteurs=20`));
    check(`preview domaine surchargé = ${attenduSurch}`, approx(body?.totalMensuel, attenduSurch), String(body?.totalMensuel));
    ({ status, body } = await J(`/api/abonnements/pricing-preview?nbActivites=2&nbLabos=1&nbGerants=1&nbAcheteurs=20`));
    check(`preview grille générale inchangée = ${attendu2112x20}`, approx(body?.totalMensuel, attendu2112x20), String(body?.totalMensuel));
    ({ status, body } = await J(`/api/abonnements/client/${c1}?withPricing=1`));
    check(`withPricing client surchargé = ${attenduSurch}`, approx(body?.pricing?.baseMensuel, attenduSurch), String(body?.pricing?.baseMensuel));
    ({ status, body } = await J(`/api/abonnements/client/${c2}?withPricing=1`));
    const attenduLegacy = r2(pP * (1 - rl) + pLabo + p10);
    check(`client restauration non impacté = ${attenduLegacy}`, approx(body?.pricing?.baseMensuel, attenduLegacy), String(body?.pricing?.baseMensuel));
    // mon-abonnement (login client : mot de passe posé en SQL) + /auth/me.domaine
    await pool.query(`UPDATE utilisateurs SET mot_de_passe = $1, actif = true WHERE id = $2`, [hash, c1]);
    r = await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: CLIENT_EMAILS[0], password: PWD }) });
    const cliTok = (await r.json()).token;
    const HC = { 'Content-Type': 'application/json', Authorization: `Bearer ${cliTok}` };
    r = await fetch(`${BASE}/api/abonnements/mon-abonnement`, { headers: HC });
    body = await r.json();
    check(`mon-abonnement client surchargé = ${attenduSurch} + config.composants`, r.status === 200 && approx(body?.pricing?.baseMensuel, attenduSurch) && body.config?.composants?.length === 4,
      `${r.status} ${body?.pricing?.baseMensuel}`);
    r = await fetch(`${BASE}/auth/me`, { headers: HC });
    body = await r.json();
    check('/auth/me.domaine présent (id, slug, nom, lexique, composants, regles)',
      r.status === 200 && body?.domaine?.id === domId && body.domaine.slug === DOM_SLUG && body.domaine.lexique?.activite?.sg === 'Boutique'
      && Array.isArray(body.domaine.composants) && body.domaine.regles?.seuil_cout_matiere_pct === 35,
      JSON.stringify({ id: body?.domaine?.id, slug: body?.domaine?.slug, act: body?.domaine?.lexique?.activite?.sg }));
    r = await fetch(`${BASE}/api/domaines`, { headers: HC });
    body = await r.json();
    check('GET /api/domaines (client) → son seul domaine', r.status === 200 && Array.isArray(body) && body.length === 1 && body[0].id === domId, `${r.status} ${JSON.stringify(body?.map?.((d) => d.id))}`);
    r = await fetch(`${BASE}/api/entreprise`, { headers: HC });
    body = await r.json();
    check('GET /api/entreprise.domaine présent', r.status === 200 && body?.domaine?.id === domId, `${r.status} ${body?.domaine?.id}`);
    ({ status, body } = await J(`/api/abonnements/tarifs/prix_base_activite_premium?domaineId=${domId}`, { method: 'DELETE' }));
    check('DELETE surcharge → supprimee', status === 200 && body?.supprimee === true, `${status} ${JSON.stringify(body)}`);
    ({ status, body } = await J(`/api/abonnements/client/${c1}?withPricing=1`));
    check(`withPricing après DELETE = ${attendu2112x20} (retour grille générale)`, approx(body?.pricing?.baseMensuel, attendu2112x20), String(body?.pricing?.baseMensuel));

    // ── 9. Lot 3, étape 3 : plus de contrat (sans engagement) — aperçu et contrat client retirés ──────────────
    ({ status, body } = await J('/api/abonnements/contrat-preview', {
      method: 'POST',
      body: JSON.stringify({ nom: 'TEST-Compo', email: 'x@example.com', telephone: '20123456', domaineId: domId, composants: compos, formuleActivites: 'premium', montantOnboarding: 700, promotions: [] }),
    }));
    check('contrat-preview retiré (lot 3) → 404', status === 404, String(status));
    r = await fetch(`${BASE}/api/abonnements/client/${c1}/contrat-pdf`, { headers: HA });
    check('contrat-pdf client retiré (lot 3) → 404', r.status === 404, String(r.status));

    // ── 10. Domaine utilisé : composant utilisé → 409 ; DELETE → 409 ────────────
    ({ status, body } = await J(`/api/domaines/${domId}`, {
      method: 'PUT',
      body: JSON.stringify({ composants: [
        { code: 'activite', libelle: 'Boutique', typeTechnique: 'activite', ordre: 1 },
        { code: 'gerant', libelle: 'Responsable', typeTechnique: 'gerant', ordre: 3 },
        { code: 'acheteurs', libelle: 'Revendeur', typeTechnique: 'acheteurs', ordre: 4 },
      ] }),
    }));
    check('PUT profil sans « atelier » (utilisé) → 409 COMPOSANT_UTILISE', status === 409 && body?.code === 'COMPOSANT_UTILISE' && body.composants?.[0]?.code === 'atelier', `${status} ${body?.code}`);
    ({ status, body } = await J(`/api/domaines/${domId}`, { method: 'DELETE' }));
    check('DELETE domaine utilisé → 409 DOMAINE_UTILISE nbClients=1', status === 409 && body?.code === 'DOMAINE_UTILISE' && body.nbClients === 1, `${status} ${JSON.stringify(body)}`);

    // ── 11. PUT /admin/clients/:id { domaineId } → re-mapping par type + recalc ──
    ({ status, body } = await J(`/admin/clients/${c1}`, { method: 'PUT', body: JSON.stringify({ domaineId: restau.id }) }));
    check('PUT /admin/clients domaineId → 200 domaineId/domaineNom restauration', status === 200 && body?.domaineId === restau.id && body.domaineNom === 'Restauration' && JSON.stringify(body.domaineIds) === JSON.stringify([restau.id]),
      `${status} ${JSON.stringify({ d: body?.domaineId, n: body?.domaineNom, ids: body?.domaineIds })}`);
    ({ status, body } = await J(`/api/abonnements/client/${c1}/config`));
    check('re-mapping : compteurs conservés (2/1/1/20), composants restauration',
      status === 200 && body?.nbActivites === 2 && body.nbLabos === 1 && body.nbGerants === 1 && body.nbAcheteurs === 20 && body.domaineId === restau.id
      && JSON.stringify(body.composants?.map((c) => `${c.code}:${c.nb}`)) === JSON.stringify(['activite:2', 'labo:1', 'gerant:1', 'acheteurs:20']),
      JSON.stringify(body?.composants?.map((c) => `${c.code}:${c.nb}`)));
    ({ status, body } = await J(`/admin/clients/${c1}`, { method: 'PUT', body: JSON.stringify({ domaineId: 999999 }) }));
    check('PUT /admin/clients domaineId inconnu → 400', status === 400, String(status));
    ({ status, body } = await J('/admin/clients'));
    const c1row = Array.isArray(body) ? body.find((c) => c.id === c1) : null;
    check('GET /admin/clients expose domaineId/domaineNom', !!c1row && c1row.domaineId === restau.id && c1row.domaineNom === 'Restauration', JSON.stringify({ d: c1row?.domaineId, n: c1row?.domaineNom }));

    // ── 12. module-acheteurs (applyComposants) ──────────────────────────────────
    ({ status, body } = await J(`/api/abonnements/client/${c1}/module-acheteurs`, { method: 'PUT', body: JSON.stringify({ actif: false }) }));
    check('module-acheteurs OFF → quota 0', status === 200 && body?.nbAcheteurs === 0, `${status} ${JSON.stringify(body)}`);
    ({ status, body } = await J(`/api/abonnements/client/${c1}/config`));
    check('config après OFF : plus de composant acheteurs, 2/1/1/0', body?.nbAcheteurs === 0 && !body.composants?.some((c) => c.typeTechnique === 'acheteurs') && body.nbActivites === 2, JSON.stringify(body?.composants?.map((c) => `${c.code}:${c.nb}`)));
    ({ status, body } = await J(`/api/abonnements/client/${c1}/module-acheteurs`, { method: 'PUT', body: JSON.stringify({ actif: true, nbAcheteurs: 50 }) }));
    check('module-acheteurs ON 50 → palier 50', status === 200 && body?.nbAcheteurs === 50 && body.palierAcheteurs === 50, `${status} ${JSON.stringify(body)}`);

    // ── 13. Invariant SQL sur les clients de test ───────────────────────────────
    const inv = (await pool.query(
      `SELECT ac.abonnement_id, ac.nb_activites, ac.nb_labos, ac.nb_gerants, ac.nb_acheteurs,
              COALESCE(SUM(CASE WHEN dc.type_technique='activite' THEN acc.nb END),0)::int AS s_a,
              COALESCE(SUM(CASE WHEN dc.type_technique='labo' THEN acc.nb END),0)::int AS s_l,
              COALESCE(SUM(CASE WHEN dc.type_technique='gerant' THEN acc.nb END),0)::int AS s_g,
              COALESCE(MAX(CASE WHEN dc.type_technique='acheteurs' THEN acc.nb END),0)::int AS s_ac
         FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id
         LEFT JOIN abonnement_config_composants acc ON acc.abonnement_id = ac.abonnement_id
         LEFT JOIN domaine_composants dc ON dc.id = acc.composant_id
        WHERE a.client_id = ANY($1) GROUP BY ac.id`, [createdClients])).rows;
    check('invariant Σ composants = compteurs (clients de test)', inv.length === createdClients.length && inv.every((x) => x.nb_activites === x.s_a && x.nb_labos === x.s_l && x.nb_gerants === x.s_g && x.nb_acheteurs === x.s_ac), JSON.stringify(inv));
  } finally {
    // ── Nettoyage ─────────────────────────────────────────────────────────────
    for (const id of createdClients) {
      const res = await fetch(`${BASE}/admin/clients/${id}`, { method: 'DELETE', headers: HA });
      check(`nettoyage client ${id} (DELETE 204)`, res.status === 204, String(res.status));
    }
    if (domId) {
      const res = await fetch(`${BASE}/api/domaines/${domId}`, { method: 'DELETE', headers: HA });
      check('nettoyage domaine (DELETE 200 après suppression des clients)', res.status === 200, String(res.status));
    }
    await wipe().catch(() => {});
  }

  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} tests OK${failed.length ? ' — ÉCHECS : ' + failed.map((f) => f.name).join(', ') : ''}`);
  await pool.end().catch(() => {});
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('ERREUR FATALE', e); process.exit(1); });
