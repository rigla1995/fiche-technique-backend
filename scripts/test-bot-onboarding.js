/* Test E2E — bot guide de mise en route (backend démarré sur :3000).
 * S'appuie sur le client démo (config COMPLÈTE → bot masqué), puis simule un
 * AVENANT (+1 activité souscrite) → le bot doit réapparaître avec l'étape
 * capacités incomplète, guider (1 vrai appel Gemini), puis re-disparaître au
 * retour à la config d'origine. Auto-nettoyage garanti (finally). */
require('dotenv').config();
const pool = require('../src/config/database');

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
const get = async (path, token) => {
  const r = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  return { s: r.status, d: await r.json() };
};

(async () => {
  let abonnementId = null;
  let nbInitial = null;
  try {
    const T = await login(EMAIL);
    check('login client démo', !!T);

    // ── Config complète : bot masqué, chat refusé
    let r = await get('/api/ai-assistant/onboarding', T);
    check('config complète → complet=true', r.s === 200 && r.d.complet === true,
      r.d.etapes?.filter((e) => !e.fait).map((e) => e.key).join(',') || 'tout fait');
    r = await get('/api/ai-assistant/status', T);
    check('status → enabled=false (bot masqué)', r.d.enabled === false);
    const chat = await fetch(`${BASE}/api/ai-assistant/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${T}` },
      body: JSON.stringify({ message: 'bonjour' }),
    });
    check('chat refusé (403) hors mise en route', chat.status === 403);

    // ── AVENANT simulé : +1 activité souscrite → le bot doit réapparaître
    const ab = await pool.query(
      `SELECT a.id, ac.nb_activites FROM abonnements a JOIN abonnement_config ac ON ac.abonnement_id = a.id
       WHERE a.client_id = (SELECT id FROM utilisateurs WHERE email = $1) ORDER BY a.id DESC LIMIT 1`,
      [EMAIL]
    );
    abonnementId = ab.rows[0].id;
    nbInitial = ab.rows[0].nb_activites;
    await pool.query('UPDATE abonnement_config SET nb_activites = $1 WHERE abonnement_id = $2', [nbInitial + 1, abonnementId]);

    r = await get('/api/ai-assistant/onboarding', T);
    check('avenant → complet=false (bot réapparaît)', r.d.complet === false);
    check('étape à faire = capacités', r.d.aFaire === 'capacites',
      r.d.etapes?.find((e) => e.key === 'capacites')?.detail);
    check('les étapes déjà faites restent cochées', r.d.etapes?.filter((e) => e.fait).length >= 6,
      `${r.d.etapes?.filter((e) => e.fait).length} faites / ${r.d.etapes?.length}`);
    check('étape acheteurs présente (module actif)', r.d.etapes?.some((e) => e.key === 'acheteurs'));
    // Questions suivant la CONFIG : il manque des activités (pas le labo, déjà créé)
    const capQ = r.d.etapes?.find((e) => e.key === 'capacites')?.questions || [];
    check('questions capacités : création d\'activités proposée', capQ.some((q) => /activités \?/.test(q)), capQ.join(' | '));
    check('questions capacités : PAS de création de labo (déjà créé)', !capQ.some((q) => /créer (mon|mes) labo/.test(q)));
    check('questions capacités : différence activité/labo (config mixte)', capQ.some((q) => /différence/.test(q)));
    r = await get('/api/ai-assistant/status', T);
    check('status → enabled=true pendant l\'avenant', r.d.enabled === true);

    // ── Le bot guide en connaissance de cause (1 vrai appel Gemini)
    const chat2 = await fetch(`${BASE}/api/ai-assistant/chat`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${T}` },
      body: JSON.stringify({ message: 'où en est ma mise en route ? que me reste-t-il à faire ?' }),
    });
    const rep = (await chat2.json()).reply || '';
    check('chat 200 pendant la mise en route', chat2.status === 200);
    check('le bot cite l\'étape manquante (activité)', /activit/i.test(rep), rep.slice(0, 160).replace(/\n/g, ' · '));

    // ── Retour config d'origine : disparition dynamique + PURGE de la conversation
    await pool.query('UPDATE abonnement_config SET nb_activites = $1 WHERE abonnement_id = $2', [nbInitial, abonnementId]);
    nbInitial = null;
    const convAvant = await pool.query(
      `SELECT COUNT(*)::int AS n FROM ai_conversations WHERE client_id = (SELECT id FROM utilisateurs WHERE email = $1) AND whatsapp_number LIKE 'web_%'`, [EMAIL]);
    r = await get('/api/ai-assistant/onboarding', T);
    check('retour config → complet=true (bot disparaît)', r.d.complet === true);
    const convApres = await pool.query(
      `SELECT COUNT(*)::int AS n FROM ai_conversations WHERE client_id = (SELECT id FROM utilisateurs WHERE email = $1) AND whatsapp_number LIKE 'web_%'`, [EMAIL]);
    check('conversation du guide PURGÉE à la complétion', convApres.rows[0].n === 0,
      `${convAvant.rows[0].n} conversation(s) avant → ${convApres.rows[0].n} après`);

    // ── Gérant : jamais de bot
    const TG = await login(GERANT_EMAIL);
    if (TG) {
      r = await get('/api/ai-assistant/onboarding', TG);
      check('gérant → complet=true (bot masqué)', r.d.complet === true && (r.d.etapes || []).length === 0);
    } else {
      check('login gérant démo', false);
    }
  } catch (e) {
    check('exception', false, e.message);
  } finally {
    if (abonnementId && nbInitial !== null) {
      await pool.query('UPDATE abonnement_config SET nb_activites = $1 WHERE abonnement_id = $2', [nbInitial, abonnementId]);
      console.log('🧹 config d\'abonnement restaurée');
    }
    await pool.end();
    const ko = results.filter((r) => !r.ok).length;
    console.log(`\n${results.length - ko}/${results.length} checks verts${ko ? ` — ${ko} ÉCHEC(S)` : ''}`);
    process.exit(ko ? 1 : 0);
  }
})();
