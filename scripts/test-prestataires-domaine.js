/* Test E2E local — D1 « Prestataires de livraison par domaine et par compte » (labflow-reprise/PLAN-DOMAINES-ACHETEURS-CODES.md
 * §2 ligne D1 ; réponses du client du 15/10).
 *   client restauration (règle du domaine : oui) créé par l'admin avec l'interrupteur décoché → /auth/me et GET /api/entreprise
 *   disent prestataires: false ; activer un prestataire : 409 ; vente via prestataire : 409 ; l'admin remet l'interrupteur
 *   (PUT config) → true, activation 201, vente directe toujours permise ; booléen contrôlé (400) ; config lue (prestatairesActifs) ;
 *   client hôtellerie (règle du domaine : non, migration 245) créé avec l'interrupteur coché → false quand même, 409 ;
 *   l'admin règle la règle du domaine (PUT /api/domaines/:id) : texte refusé (400), booléen accepté, remis ensuite ;
 *   gérant : même réponse que son compte ; rejeu de la migration 245.
 * Crée un super_admin, deux clients et un gérant temporaires, puis nettoie. Données fictives.
 * ⚠️ Backend de test : « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué). */
require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const MDP = `${crypto.randomBytes(12).toString('base64url')}Aa1!`;
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};
const appel = async (methode, chemin, jeton, corps) => {
  const r = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  let body = null;
  try { body = await r.json(); } catch (_) { /* corps vide */ }
  return { status: r.status, body };
};
const login = async (email) => appel('POST', '/auth/login', null, { email, password: MDP });

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-d1@example.com';
  const RESTO = 'test-d1-resto@example.com';
  const HOTEL = 'test-d1-hotel@example.com';
  const GERANT = 'test-d1-gerant@example.com';
  const TOUS = [ADMIN, RESTO, HOTEL, GERANT];
  const wipe = async () => {
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [TOUS])).rows.map((r) => r.id);
    if (ids.length) {
      await pool.query('UPDATE ventes SET created_by = NULL WHERE created_by = ANY($1)', [ids]);
      await pool.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM profil_entreprise WHERE client_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM utilisateurs WHERE id = ANY($1)', [ids]);
    }
    await pool.query(`DELETE FROM prestataires_livraison WHERE nom = 'TEST Livreur D1'`);
  };
  const activer = async (email) => {
    const u = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = $1', [email])).rows[0];
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, u.id]);
    return { id: u.id, tok: (await login(email)).body?.token };
  };
  const domaineId = async (slug) => (await pool.query('SELECT id, regles FROM domaines_activite WHERE slug = $1', [slug])).rows[0];
  const hotelRegles = (await pool.query(`SELECT regles FROM domaines_activite WHERE slug = 'hotellerie'`)).rows[0]?.regles;

  try {
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin D1', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    const adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);
    const resta = await domaineId('restauration');
    const hotel = await domaineId('hotellerie');
    check('domaines : restauration sans règle (prestataires proposés), hôtellerie à non depuis la migration 245', !!resta && resta.regles?.prestataires === undefined && hotel?.regles?.prestataires === false, JSON.stringify({ r: resta?.regles, h: hotel?.regles }));

    // ── Client restauration, interrupteur décoché par l'admin à la création ──
    let r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST Resto D1', email: RESTO, telephone: '20 555 601', domaineId: resta.id, nbActivites: 1, nbLabos: 0, nbGerants: 1, montantOnboarding: 0, prestatairesActifs: false });
    check('client restauration créé, prestataires décochés', r.status === 201, `${r.status} ${JSON.stringify(r.body)}`);
    const resto = await activer(RESTO);
    const cfg = (await pool.query('SELECT ac.prestataires_actifs FROM abonnements a JOIN abonnement_config ac ON ac.abonnement_id = a.id WHERE a.client_id = $1 ORDER BY a.id DESC LIMIT 1', [resto.id])).rows[0];
    r = await appel('GET', '/auth/me', resto.tok);
    let r2 = await appel('GET', '/api/entreprise', resto.tok);
    check('base : prestataires_actifs = false ; /auth/me et GET /api/entreprise : domaine.prestataires = false', cfg?.prestataires_actifs === false && r.body?.domaine?.prestataires === false && r2.body?.domaine?.prestataires === false, `${JSON.stringify(cfg)} ${r.body?.domaine?.prestataires} ${r2.body?.domaine?.prestataires}`);
    const act = (await appel('POST', '/api/entreprise/activites', resto.tok, { nom: 'Restaurant D1' })).body;
    let pl = await pool.query(`SELECT id FROM prestataires_livraison WHERE nom = 'TEST Livreur D1' LIMIT 1`);
    const prestId = pl.rows.length ? pl.rows[0].id : (await pool.query(`INSERT INTO prestataires_livraison (nom, actif) VALUES ('TEST Livreur D1', true) RETURNING id`)).rows[0].id;
    const modeVirement = (await pool.query(`SELECT id FROM modes_paiement WHERE code = 'virement'`)).rows[0]?.id;
    r = await appel('POST', '/api/activite-prestataires', resto.tok, { activite_id: act?.id, prestataire_id: prestId, taux_commission: 20, taux_tva: 19, mode_paiement_id: modeVirement });
    r2 = await appel('POST', '/api/ventes', resto.tok, { activite_id: act?.id, date_vente: '2026-10-01', type_vente: 'prestataire', prestataire_id: prestId, lignes: [] });
    check('interrupteur coupé : activer un prestataire 409, vente via prestataire 409 (PRESTATAIRES_DESACTIVES, message au vocabulaire)', !!act?.id && r.status === 409 && r.body?.code === 'PRESTATAIRES_DESACTIVES' && r2.status === 409 && r2.body?.code === 'PRESTATAIRES_DESACTIVES' && /prestataires de livraison ne sont pas proposés/.test(r.body?.message || ''), `${r.status} ${r.body?.code} ${r2.status} ${r2.body?.code} ${r.body?.message}`);
    r = await appel('PUT', `/api/abonnements/client/${resto.id}/config`, adminTok, { prestatairesActifs: 'oui' });
    check('PUT config : prestatairesActifs non booléen → 400', r.status === 400, `${r.status}`);
    r = await appel('PUT', `/api/abonnements/client/${resto.id}/config`, adminTok, { prestatairesActifs: true });
    r2 = await appel('GET', `/api/abonnements/client/${resto.id}?withPricing=1`, adminTok);
    const me = await appel('GET', '/auth/me', resto.tok);
    check('l\'admin remet l\'interrupteur : config lue prestatairesActifs = true, /auth/me = true', r.status === 200 && r2.body?.config?.prestatairesActifs === true && me.body?.domaine?.prestataires === true, `${r.status} ${JSON.stringify(r2.body?.config?.prestatairesActifs)} ${me.body?.domaine?.prestataires}`);
    r = await appel('POST', '/api/activite-prestataires', resto.tok, { activite_id: act.id, prestataire_id: prestId, taux_commission: 20, taux_tva: 19, mode_paiement_id: modeVirement });
    check('prestataire activé (201) une fois l\'interrupteur remis', r.status === 201, `${r.status} ${JSON.stringify(r.body)}`);
    r = await appel('PUT', `/api/abonnements/client/${resto.id}/config`, adminTok, { prestatairesActifs: false });
    r2 = await appel('GET', `/api/abonnements/client/${resto.id}?withPricing=1`, adminTok);
    check('coupé de nouveau après création : config prestatairesActifs = false, breakdown aussi', r.status === 200 && r2.body?.config?.prestatairesActifs === false && r2.body?.pricing?.configBreakdown?.prestatairesActifs === false, JSON.stringify(r2.body?.pricing?.configBreakdown?.prestatairesActifs));
    // Le gérant du compte voit la même chose.
    r = await appel('POST', '/api/abonnements/gerants', resto.tok, { nom: 'TEST Gérant D1', telephone: '20 555 602', email: GERANT, activiteIds: [act.id] });
    const gerant = await activer(GERANT);
    r2 = await appel('GET', '/auth/me', gerant.tok);
    const rv = await appel('POST', '/api/ventes', gerant.tok, { activite_id: act.id, date_vente: '2026-10-01', type_vente: 'prestataire', prestataire_id: prestId, lignes: [] });
    check('gérant : domaine.prestataires = false comme son compte, vente via prestataire 409', r.status === 201 && r2.body?.domaine?.prestataires === false && rv.status === 409 && rv.body?.code === 'PRESTATAIRES_DESACTIVES', `${r.status} ${r2.body?.domaine?.prestataires} ${rv.status}`);

    // ── Client hôtellerie : la règle du domaine l'emporte sur l'interrupteur ──
    r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST Hôtel D1', email: HOTEL, telephone: '20 555 603', domaineId: hotel.id, composants: [{ code: 'restaurant', nb: 1 }, { code: 'cuisine', nb: 1 }], montantOnboarding: 0, prestatairesActifs: true });
    const hot = await activer(HOTEL);
    r2 = await appel('GET', '/auth/me', hot.tok);
    const cfgH = (await pool.query('SELECT ac.prestataires_actifs FROM abonnements a JOIN abonnement_config ac ON ac.abonnement_id = a.id WHERE a.client_id = $1 ORDER BY a.id DESC LIMIT 1', [hot.id])).rows[0];
    check('hôtel : interrupteur coché (base true) mais règle du domaine non → domaine.prestataires = false', r.status === 201 && cfgH?.prestataires_actifs === true && r2.body?.domaine?.prestataires === false, `${r.status} ${JSON.stringify(cfgH)} ${r2.body?.domaine?.prestataires}`);
    const actH = (await appel('POST', '/api/entreprise/activites', hot.tok, { nom: 'Restaurant Hôtel D1' })).body;
    r = await appel('POST', '/api/activite-prestataires', hot.tok, { activite_id: actH?.id, prestataire_id: prestId, taux_commission: 20, taux_tva: 19, mode_paiement_id: modeVirement });
    check('hôtel : activer un prestataire 409', r.status === 409 && r.body?.code === 'PRESTATAIRES_DESACTIVES', `${r.status}`);
    // La règle du domaine se règle dans la page Domaines (booléen).
    r = await appel('PUT', `/api/domaines/${hotel.id}`, adminTok, { regles: { ...(hotelRegles || {}), prestataires: 'non' } });
    r2 = await appel('PUT', `/api/domaines/${hotel.id}`, adminTok, { regles: { ...(hotelRegles || {}), prestataires: true } });
    const me2 = await appel('GET', '/auth/me', hot.tok);
    const r3 = await appel('PUT', `/api/domaines/${hotel.id}`, adminTok, { regles: hotelRegles || {} });
    const me3 = await appel('GET', '/auth/me', hot.tok);
    check('page Domaines : règle en texte refusée (400), règle à oui acceptée (l\'hôtel passe à true), remise à non (false)', r.status === 400 && r2.status === 200 && me2.body?.domaine?.prestataires === true && r3.status === 200 && me3.body?.domaine?.prestataires === false, `${r.status} ${r2.status} ${me2.body?.domaine?.prestataires} ${r3.status} ${me3.body?.domaine?.prestataires}`);

    // ── Rejeu de la migration ──
    const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations', '245_prestataires_par_domaine.sql'), 'utf8');
    let rejeu = true;
    try { await pool.query(sql); } catch (e) { rejeu = false; console.log(e.message); }
    const encore = (await pool.query(`SELECT regles FROM domaines_activite WHERE slug = 'hotellerie'`)).rows[0]?.regles;
    check('migration 245 rejouable, la règle de l\'hôtellerie inchangée', rejeu && encore?.prestataires === false, JSON.stringify(encore));
  } catch (err) {
    console.error(err);
    check('aucune exception', false, err.message);
  } finally {
    await pool.query(`UPDATE domaines_activite SET regles = $1 WHERE slug = 'hotellerie'`, [hotelRegles || {}]).catch(() => null);
    await wipe();
    const ko = results.filter((x) => !x.ok).length;
    console.log(`\n${results.length - ko}/${results.length} vérifications passées`);
    await pool.end();
    process.exit(ko ? 1 : 0);
  }
})();
