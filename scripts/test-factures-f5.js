/* Test E2E local — factures fournisseur, étape F5 « Scans et photos mieux lus » (labflow-reprise/achats-compta/
 * PLAN-FACTURES.md, ETAPE-F5.md) : la MISE EN PAGE apprise d'un fournisseur, partagée entre les comptes.
 *   GET  /api/factures/mise-en-page?matricule=…        la mise en page connue (client, gérant, autre compte)
 *   POST /api/appros/facture/validee  { lecture: { source, miseEnPage } }   apprise à la validation d'une facture lue
 * Règles : forme contrôlée ; fournisseur sans matricule → rien d'appris ; une mise en page vue sur une image ne remplace
 * jamais celle d'un PDF ; journal de la facture ; un compte supprimé n'emporte pas la mise en page (appris_par vidé).
 * Crée un super_admin + 2 clients (le 1er avec 1 activité et 1 gérant) temporaires, puis nettoie. Données fictives.
 * ⚠️ Serveur d'essai : « node scripts/start-test-backend.js » (BASE_URL). */
require('./lib/bouchons-test').installer();
require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../src/config/database');
const BASE = process.env.BASE_URL || 'http://localhost:3100';
const MDP = crypto.randomBytes(18).toString('base64url');
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail && !ok ? ` — ${detail}` : ''}`);
};
const aujourdhui = new Date().toISOString().slice(0, 10);
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
const envoi = async (methode, chemin, jeton, donnees, fichiers = []) => {
  const fd = new FormData();
  if (donnees !== undefined) fd.append('donnees', JSON.stringify(donnees));
  for (const f of fichiers) fd.append('pieces', new Blob([f.octets], { type: f.type }), f.nom);
  const r = await fetch(`${BASE}${chemin}`, { method: methode, headers: { Authorization: `Bearer ${jeton}` }, body: fd });
  let body = null;
  try { body = await r.json(); } catch (_) { /* corps vide */ }
  return { status: r.status, body };
};
const login = async (email) => (await appel('POST', '/auth/login', null, { email, password: MDP })).body?.token;
const PDF = () => Buffer.concat([Buffer.from('%PDF-1.4\n% facture fictive F5\n'), crypto.randomBytes(1500), Buffer.from('\n%%EOF\n')]);
const piece = () => [{ octets: PDF(), nom: 'facture.pdf', type: 'application/pdf' }];
const MF = '1384297X/A/M/000';
const IDENT = '1384297';
const mep = (decalage = 0) => ({ colonnes: [
  { genre: 'des', x0: 0.07 + decalage, x1: 0.2 + decalage }, { genre: 'qte', x0: 0.55, x1: 0.6 },
  { genre: 'pu', x0: 0.66, x1: 0.74 }, { genre: 'montant', x0: 0.86, x1: 0.95 },
] });

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-f5@example.com';
  const CLIENT = 'test-f5-client@example.com';
  const CLIENT2 = 'test-f5-client2@example.com';
  const GERANT = 'test-f5-gerant@example.com';
  let adminTok = null;
  const avant = (await pool.query('SELECT colonnes, source, apprentissages FROM factures_mises_en_page WHERE identifiant = $1', [IDENT])).rows[0] || null;
  const nettoyer = async () => {
    for (const email of [CLIENT, CLIENT2]) {
      const c = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [email])).rows[0];
      if (c && adminTok) await appel('DELETE', `/admin/clients/${c.id}`, adminTok);
    }
    await pool.query('DELETE FROM utilisateurs WHERE email = ANY($1)', [[GERANT, CLIENT, CLIENT2, ADMIN]]);
  };
  try {
    // ── 0. Préparation ─────────────────────────────────────────────────────────────────────────────────────────────
    await nettoyer();
    await pool.query('DELETE FROM factures_mises_en_page WHERE identifiant = $1', [IDENT]);
    await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminF5', $1, $2, 'super_admin', true)`, [ADMIN, hash]);
    adminTok = await login(ADMIN);
    let r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST-F5 Contact', email: CLIENT, telephone: '20778893', nbActivites: 1, nbLabos: 0, nbGerants: 1, montantOnboarding: 0 });
    const r2 = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST-F5 Autre', email: CLIENT2, telephone: '20778895', nbActivites: 1, nbLabos: 0, nbGerants: 0, montantOnboarding: 0 });
    check('0. création des deux clients', r.status === 201 && r2.status === 201, `${r.status} ${r2.status} ${r.body?.message || ''} ${r2.body?.message || ''}`);
    const ids = (await pool.query('SELECT id, email FROM utilisateurs WHERE email = ANY($1)', [[CLIENT, CLIENT2]])).rows;
    for (const u of ids) await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, u.id]);
    const tok = await login(CLIENT);
    const tok2 = await login(CLIENT2);
    const unites = (await appel('GET', '/api/unites', tok)).body || [];
    const kg = unites.find((u) => (u.name || u.nom) === 'kg') || (await appel('POST', '/api/unites', tok, { name: 'kg' })).body;
    const farine = (await appel('POST', '/api/articles', tok, { name: 'Farine F5', unitId: kg?.id })).body;
    const act = (await appel('POST', '/api/entreprise/activites', tok, { nom: 'Restaurant F5' })).body;
    await appel('POST', `/api/entreprise/activites/${act?.id}/ingredients/${farine?.id}/select`, tok, {});
    const f1 = (await appel('POST', '/api/entreprise/fournisseurs', tok, { nom: 'SMDA F5', matriculeFiscal: MF, activiteIds: [act.id] })).body?.id;
    const f2 = (await appel('POST', '/api/entreprise/fournisseurs', tok, { nom: 'Sans matricule F5', activiteIds: [act.id] })).body?.id;
    r = await appel('POST', '/api/abonnements/gerants', tok, { nom: 'TEST-Gérant F5', telephone: '20778894', email: GERANT, activiteIds: [act.id] });
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL WHERE id = $2', [hash, r.body?.id]);
    const gTok = await login(GERANT);
    check('0. article, activité, 2 fournisseurs (avec et sans matricule), gérant, 2e compte', !!farine?.id && !!act?.id && !!f1 && !!f2 && !!gTok && !!tok2);

    // ── 1. Lecture : rien de connu ; matricule illisible ──────────────────────────────────────────────────────────
    r = await appel('GET', `/api/factures/mise-en-page?matricule=${encodeURIComponent(MF)}`, tok);
    check('1. mise en page inconnue → { miseEnPage: null }', r.status === 200 && r.body?.miseEnPage === null, `${r.status} ${JSON.stringify(r.body)}`);
    r = await appel('GET', '/api/factures/mise-en-page?matricule=abc', tok);
    const rSans = await appel('GET', `/api/factures/mise-en-page?matricule=${encodeURIComponent(MF)}`, null);
    check('1. matricule illisible → 400 ; sans connexion → 401', r.status === 400 && r.body?.code === 'MATRICULE_INVALIDE' && rSans.status === 401, `${r.status} ${rSans.status}`);

    // ── 2. Apprise à la validation d'une facture lue ──────────────────────────────────────────────────────────────
    const validation = (ref, lecture, fournisseurId = f1) => ({
      cible: { type: 'activite', id: act.id }, dateAppro: aujourdhui, fournisseurId, refFacture: ref, timbreFiscal: false,
      lignes: [{ designation: 'Farine T45 sac 25 kg', quantite: 2, prixUnitaire: 41.5, tauxTva: 7, montant: 83, articleId: farine.id, conversion: 25 }],
      ...(lecture ? { lecture } : {}),
    });
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation('FV-F5-001', { source: 'ocr', miseEnPage: mep() }), piece());
    let ligne = (await pool.query('SELECT colonnes, source, apprentissages, appris_par FROM factures_mises_en_page WHERE identifiant = $1', [IDENT])).rows[0];
    const journal = (await pool.query(`SELECT details FROM factures_journal WHERE facture_id = $1 AND action = 'facture_validee'`, [r.body?.factureId])).rows[0];
    check('2. facture lue sur une image validée → mise en page apprise (identifiant du matricule, source ocr), au journal',
      r.status === 201 && ligne?.source === 'ocr' && ligne?.apprentissages === 1 && ligne?.colonnes?.colonnes?.length === 4 && journal?.details?.miseEnPage === true,
      `${r.status} ${JSON.stringify(r.body)} ${JSON.stringify(ligne)} ${JSON.stringify(journal)}`);
    r = await appel('GET', `/api/factures/mise-en-page?matricule=${encodeURIComponent('1384297 x')}`, gTok);
    check('2. lue par le gérant, matricule écrit autrement : colonnes seulement (ni source, ni auteur)',
      r.status === 200 && r.body?.miseEnPage?.colonnes?.length === 4 && Object.keys(r.body.miseEnPage).join() === 'colonnes', `${r.status} ${JSON.stringify(r.body)}`);
    r = await appel('GET', `/api/factures/mise-en-page?matricule=${encodeURIComponent(MF)}`, tok2);
    check('2. partagée : un autre compte la lit', r.status === 200 && r.body?.miseEnPage?.colonnes?.length === 4, `${r.status} ${JSON.stringify(r.body)}`);

    // ── 3. Règles de remplacement ─────────────────────────────────────────────────────────────────────────────────
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation('FV-F5-002', { source: 'pdf', miseEnPage: mep(0.01) }), piece());
    ligne = (await pool.query('SELECT colonnes, source, apprentissages FROM factures_mises_en_page WHERE identifiant = $1', [IDENT])).rows[0];
    check('3. vue sur un PDF : remplace celle d\'une image (source pdf)', r.status === 201 && ligne?.source === 'pdf' && ligne?.apprentissages === 2 && ligne?.colonnes?.colonnes?.[0]?.x0 === 0.08, JSON.stringify(ligne));
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation('FV-F5-003', { source: 'ocr', miseEnPage: mep(0.05) }), piece());
    ligne = (await pool.query('SELECT colonnes, source, apprentissages FROM factures_mises_en_page WHERE identifiant = $1', [IDENT])).rows[0];
    const j3 = (await pool.query(`SELECT details FROM factures_journal WHERE facture_id = $1 AND action = 'facture_validee'`, [r.body?.factureId])).rows[0];
    check('3. vue ensuite sur une image : ne remplace PAS celle du PDF (comptée, pas au journal)',
      r.status === 201 && ligne?.source === 'pdf' && ligne?.apprentissages === 3 && ligne?.colonnes?.colonnes?.[0]?.x0 === 0.08 && !j3?.details?.miseEnPage, `${JSON.stringify(ligne)} ${JSON.stringify(j3)}`);

    // ── 4. Refus silencieux : forme fausse, fournisseur sans matricule, lecture sans mise en page ─────────────────
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation('FV-F5-004', { source: 'pdf', miseEnPage: { colonnes: [{ genre: 'pirate', x0: 0, x1: 2 }] } }), piece());
    const lecture4 = (await pool.query('SELECT lecture FROM factures WHERE id = $1', [r.body?.factureId])).rows[0]?.lecture;
    ligne = (await pool.query('SELECT apprentissages FROM factures_mises_en_page WHERE identifiant = $1', [IDENT])).rows[0];
    check('4. forme fausse : facture validée (201), rien appris, gardée null sur la facture', r.status === 201 && ligne?.apprentissages === 3 && lecture4?.miseEnPage === null, `${r.status} ${JSON.stringify(lecture4)} ${JSON.stringify(ligne)}`);
    const nbAvant = (await pool.query('SELECT COUNT(*)::int AS n FROM factures_mises_en_page')).rows[0].n;
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation('FV-F5-005', { source: 'pdf', miseEnPage: mep() }, f2), piece());
    const nbApres = (await pool.query('SELECT COUNT(*)::int AS n FROM factures_mises_en_page')).rows[0].n;
    check('4. fournisseur sans matricule : facture validée, rien appris (rien à partager)', r.status === 201 && nbApres === nbAvant, `${r.status} ${nbAvant} → ${nbApres}`);
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation('FV-F5-006', null), piece());
    ligne = (await pool.query('SELECT apprentissages FROM factures_mises_en_page WHERE identifiant = $1', [IDENT])).rows[0];
    check('4. validation sans lecture : rien appris', r.status === 201 && ligne?.apprentissages === 3, `${r.status} ${JSON.stringify(ligne)}`);

    // ── 5. Compte supprimé : la mise en page reste (elle ne contient rien du compte) ──────────────────────────────
    const c1 = ids.find((u) => u.email === CLIENT).id;
    r = await appel('DELETE', `/admin/clients/${c1}`, adminTok);
    ligne = (await pool.query('SELECT source, appris_par FROM factures_mises_en_page WHERE identifiant = $1', [IDENT])).rows[0];
    check('5. le compte qui l\'a apprise est supprimé (purge admin) : la mise en page reste, son auteur est vidé',
      [200, 204].includes(r.status) && ligne?.source === 'pdf' && ligne?.appris_par === null, `${r.status} ${JSON.stringify(r.body)} ${JSON.stringify(ligne)}`);
  } catch (e) {
    console.error(e);
    check('exécution sans exception', false, e.message);
  } finally {
    await nettoyer().catch((e) => console.error('nettoyage :', e.message));
    await pool.query('DELETE FROM factures_mises_en_page WHERE identifiant = $1', [IDENT]);
    if (avant) {
      await pool.query('INSERT INTO factures_mises_en_page (identifiant, colonnes, source, apprentissages) VALUES ($1, $2, $3, $4)', [IDENT, JSON.stringify(avant.colonnes), avant.source, avant.apprentissages]);
    }
    const ok = results.filter((x) => x.ok).length;
    console.log(`\n${ok}/${results.length} contrôles réussis`);
    await pool.end();
    process.exit(ok === results.length ? 0 : 1);
  }
})();
