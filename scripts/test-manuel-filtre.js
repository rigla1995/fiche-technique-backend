/* Test E2E — manuel filtré selon la config du compte (backend démarré sur :3000,
 * migration 182 appliquée). S'appuie sur le jeu de démo (seed-demo-vitrine.js) :
 * client demo@dar-yasmine.tn (module acheteurs ON, ≥1 labo, ≥1 activité) + gérant.
 * Vérifie aussi le RAG (search_knowledge_base) directement via aiToolHandlers.
 * Auto-nettoyage : le flag module_acheteurs_actif est remis à sa valeur initiale. */
require('dotenv').config();
const pool = require('../src/config/database');
const { executeToolCall } = require('../src/services/aiToolHandlers');

const BASE = 'http://localhost:3000';
const EMAIL = process.env.E2E_EMAIL || 'demo@dar-yasmine.tn';
const PASSWORD = process.env.E2E_PASSWORD || 'DemoVitrine2026!';
const GERANT_EMAIL = process.env.E2E_GERANT_EMAIL || 'gerant@dar-yasmine.tn';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};
const login = async (email) => {
  const r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return (await r.json()).token;
};
const getManuel = async (token) => {
  const r = await fetch(`${BASE}/api/manuel`, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
};
const slugsOf = (sections) => new Set(sections.map((s) => s.slug));

(async () => {
  let moduleInitial = null;
  let clientId = null;
  try {
    // ── Client démo : config complète (module acheteurs ON, labo, activités)
    const T = await login(EMAIL);
    check('login client démo', !!T);
    const me = await (await fetch(`${BASE}/auth/me`, { headers: { Authorization: `Bearer ${T}` } })).json();
    clientId = me.user?.id || me.id;

    let slugs = slugsOf(await getManuel(T));
    check('module ON : fiches acheteurs visibles', slugs.has('acheteurs-carnet') && slugs.has('acheteurs-portail'));
    check('labo présent : stock-labo + transferts visibles', slugs.has('stock-labo') && slugs.has('transferts'));
    check('activités présentes : saisie-ventes + stock-activites visibles', slugs.has('saisie-ventes') && slugs.has('stock-activites'));
    check('fiche dashboard-gerant désactivée (écran supprimé)', !slugs.has('dashboard-gerant'));
    check('tronc commun visible (lexique, faq, calc-pmp)', slugs.has('lexique') && slugs.has('faq') && slugs.has('calc-pmp'));

    // Fiche fournisseurs réécrite (migration 182) : plus AUCUNE mention de l'écran supprimé
    const manuel = await getManuel(T);
    const fFiche = manuel.find((s) => s.slug === 'fournisseurs');
    check('fiche fournisseurs sans mention fournisseurs-labo',
      !!fFiche && !fFiche.contenu.includes('fournisseurs-labo') && !fFiche.contenu.includes('Écran Fournisseurs Labo'));
    check('fiche fournisseurs = page unique', !!fFiche && fFiche.contenu.includes('Un seul écran'));

    // ── Module acheteurs OFF : fiches d'utilisation masquées, VITRINE conservée
    const pe = await pool.query('SELECT module_acheteurs_actif FROM profil_entreprise WHERE client_id = $1', [clientId]);
    moduleInitial = pe.rows[0].module_acheteurs_actif;
    await pool.query('UPDATE profil_entreprise SET module_acheteurs_actif = false WHERE client_id = $1', [clientId]);
    slugs = slugsOf(await getManuel(T));
    check('module OFF : carnet/tarifs/ventes/portail masqués',
      !slugs.has('acheteurs-carnet') && !slugs.has('acheteurs-tarifs') && !slugs.has('acheteurs-ventes') && !slugs.has('acheteurs-portail'));
    check('module OFF : vitrine acheteurs-module conservée', slugs.has('acheteurs-module'));

    // ── RAG : l'IA ne voit pas les fiches d'un module inactif (vitrine exceptée)
    const rag = await executeToolCall(clientId, 'search_knowledge_base', { query: 'portail acheteur commande' });
    const titres = (rag.results || []).map((r) => r.titre).join(' | ');
    check('RAG module OFF : fiche portail absente des résultats', !titres.includes('Le portail acheteur'), titres || '(aucun résultat)');
    await pool.query('UPDATE profil_entreprise SET module_acheteurs_actif = true WHERE client_id = $1', [clientId]);
    const rag2 = await executeToolCall(clientId, 'search_knowledge_base', { query: 'portail acheteur commande' });
    const titres2 = (rag2.results || []).map((r) => r.titre).join(' | ');
    check('RAG module ON : fiche portail trouvée', titres2.includes('portail acheteur'), titres2);

    // ── Gérant : fiches réservées au client masquées
    const TG = await login(GERANT_EMAIL);
    check('login gérant démo', !!TG);
    if (TG) {
      const gSlugs = slugsOf(await getManuel(TG));
      check('gérant : abonnement/gerants/onboarding/dashboard masqués',
        !gSlugs.has('abonnement') && !gSlugs.has('gerants') && !gSlugs.has('onboarding-contrat') && !gSlugs.has('dashboard'));
      check('gérant : fiches opérationnelles visibles', gSlugs.has('stock-labo') && gSlugs.has('lexique'));
    }
  } catch (e) {
    check('exception', false, e.message);
  } finally {
    if (clientId != null && moduleInitial !== null) {
      await pool.query('UPDATE profil_entreprise SET module_acheteurs_actif = $2 WHERE client_id = $1', [clientId, moduleInitial]);
    }
    await pool.end();
    const ko = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - ko}/${results.length} checks verts${ko ? ` — ${ko} ÉCHEC(S)` : ''}`);
    process.exit(ko ? 1 : 0);
  }
})();
