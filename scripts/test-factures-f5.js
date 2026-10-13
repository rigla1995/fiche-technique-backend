/* Test E2E local — factures fournisseur, étape F5 « Scans et photos mieux lus » (labflow-reprise/achats-compta/
 * PLAN-FACTURES.md, ETAPE-F5.md) : la MISE EN PAGE d'un fournisseur, propre à chaque compte, partagée quand deux comptes
 * l'ont vue.
 *   GET  /api/factures/mise-en-page?matricule=…        la mise en page (du compte, sinon partagée)
 *   POST /api/appros/facture/validee  { lecture: { source, matricule, miseEnPage } }   apprise à la validation
 * Règles : forme contrôlée ; matricule lu = matricule de la fiche ; un compte seul n'impose rien aux autres ; facture
 * supprimée → ce qu'elle avait appris part ; compte supprimé → ses mises en page partent.
 * Crée un super_admin + 3 clients (le 1er avec un gérant) temporaires, puis nettoie. Données fictives.
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
const mep = (d = 0) => ({ colonnes: [
  { genre: 'des', x0: 0.07 + d, x1: 0.2 + d }, { genre: 'qte', x0: 0.55 + d, x1: 0.6 + d },
  { genre: 'pu', x0: 0.66 + d, x1: 0.74 + d }, { genre: 'montant', x0: 0.86 + d, x1: 0.95 + d },
] });
// Mise en page « empoisonnée » : quantité et montant permutés.
const fausse = { colonnes: [{ genre: 'des', x0: 0, x1: 0.1 }, { genre: 'montant', x0: 0.55, x1: 0.6 }, { genre: 'qte', x0: 0.85, x1: 0.95 }] };

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-f5@example.com';
  const CLIENTS = ['test-f5-client@example.com', 'test-f5-client2@example.com', 'test-f5-client3@example.com'];
  const GERANT = 'test-f5-gerant@example.com';
  let adminTok = null;
  const nettoyer = async () => {
    for (const email of CLIENTS) {
      const c = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [email])).rows[0];
      if (c && adminTok) await appel('DELETE', `/admin/clients/${c.id}`, adminTok);
    }
    await pool.query('DELETE FROM utilisateurs WHERE email = ANY($1)', [[GERANT, ...CLIENTS, ADMIN]]);
  };
  const mepDe = async (jeton, mf = MF) => appel('GET', `/api/factures/mise-en-page?matricule=${encodeURIComponent(mf)}`, jeton);
  const vues = async () => (await pool.query('SELECT client_id, facture_id, source, colonnes FROM factures_mises_en_page WHERE identifiant = $1', [IDENT])).rows;
  try {
    // ── 0. Préparation : 3 comptes, chacun le même fournisseur (même matricule) ────────────────────────────────────
    await nettoyer();
    await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminF5', $1, $2, 'super_admin', true)`, [ADMIN, hash]);
    adminTok = await login(ADMIN);
    const comptes = [];
    for (const [k, email] of CLIENTS.entries()) {
      const r = await appel('POST', '/admin/clients', adminTok, { nom: `TEST-F5 Compte ${k + 1}`, email, telephone: `2077889${3 + k}`, nbActivites: 1, nbLabos: 0, nbGerants: k === 0 ? 1 : 0, montantOnboarding: 0 });
      const id = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [email])).rows[0]?.id;
      await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, id]);
      const tok = await login(email);
      const unites = (await appel('GET', '/api/unites', tok)).body || [];
      const kg = unites.find((u) => (u.name || u.nom) === 'kg') || (await appel('POST', '/api/unites', tok, { name: 'kg' })).body;
      const article = (await appel('POST', '/api/articles', tok, { name: `Farine F5 ${k + 1}`, unitId: kg?.id })).body;
      const act = (await appel('POST', '/api/entreprise/activites', tok, { nom: `Restaurant F5 ${k + 1}` })).body;
      await appel('POST', `/api/entreprise/activites/${act?.id}/ingredients/${article?.id}/select`, tok, {});
      const four = (await appel('POST', '/api/entreprise/fournisseurs', tok, { nom: `SMDA F5 ${k + 1}`, matriculeFiscal: MF, activiteIds: [act.id] })).body?.id;
      comptes.push({ id, tok, article, act, four, cree: r.status === 201 });
    }
    const [A, B, C] = comptes;
    const sansMf = (await appel('POST', '/api/entreprise/fournisseurs', A.tok, { nom: 'Sans matricule F5', activiteIds: [A.act.id] })).body?.id;
    let r = await appel('POST', '/api/abonnements/gerants', A.tok, { nom: 'TEST-Gérant F5', telephone: '20778899', email: GERANT, activiteIds: [A.act.id] });
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL WHERE id = $2', [hash, r.body?.id]);
    const gTok = await login(GERANT);
    check('0. trois comptes, chacun avec le fournisseur au même matricule ; un fournisseur sans matricule ; un gérant',
      comptes.every((c) => c.cree && c.tok && c.article?.id && c.act?.id && c.four) && !!sansMf && !!gTok);

    // ── 1. Lecture : inconnue, matricule illisible, sans connexion ─────────────────────────────────────────────────
    r = await mepDe(A.tok);
    const r1 = await mepDe(A.tok, 'abc');
    const r2 = await mepDe(A.tok, '12345678');
    const r3 = await appel('GET', `/api/factures/mise-en-page?matricule=${encodeURIComponent(MF)}`, null);
    check('1. inconnue → null ; matricule illisible ou à 8 chiffres → 400 ; sans connexion → 401',
      r.status === 200 && r.body?.miseEnPage === null && r1.status === 400 && r2.status === 400 && r3.status === 401, `${r.status} ${r1.status} ${r2.status} ${r3.status}`);

    // ── 2. Apprise pour le compte qui valide ; pas encore partagée ─────────────────────────────────────────────────
    const valider = (c, ref, lecture, fournisseurId = c.four) => envoi('POST', '/api/appros/facture/validee', c.tok, {
      cible: { type: 'activite', id: c.act.id }, dateAppro: aujourdhui, fournisseurId, refFacture: ref, timbreFiscal: false,
      lignes: [{ designation: 'Farine T45 sac 25 kg', quantite: 2, prixUnitaire: 41.5, tauxTva: 7, montant: 83, articleId: c.article.id, conversion: 25 }],
      ...(lecture ? { lecture } : {}),
    }, piece());
    r = await valider(A, 'FV-F5-A1', { source: 'ocr', matricule: '1384297 X', miseEnPage: mep() });
    const facA1 = r.body?.factureId;
    let v = await vues();
    const journal = (await pool.query(`SELECT details FROM factures_journal WHERE facture_id = $1 AND action = 'facture_validee'`, [facA1])).rows[0];
    check('2. validation d\'une facture lue → mise en page apprise pour CE compte (facture, source), au journal',
      r.status === 201 && v.length === 1 && v[0].client_id === A.id && v[0].facture_id === facA1 && v[0].source === 'ocr' && journal?.details?.miseEnPage === true,
      `${r.status} ${JSON.stringify(r.body)} ${JSON.stringify(v)}`);
    const rA = await mepDe(A.tok), rG = await mepDe(gTok), rB = await mepDe(B.tok);
    check('2. le compte et son gérant la lisent (colonnes seulement) ; un autre compte, pas encore (vue par un seul compte)',
      rA.body?.miseEnPage?.colonnes?.length === 4 && Object.keys(rA.body.miseEnPage).join() === 'colonnes' && rG.body?.miseEnPage?.colonnes?.length === 4 && rB.body?.miseEnPage === null,
      `${JSON.stringify(rA.body)} ${JSON.stringify(rG.body)} ${JSON.stringify(rB.body)}`);

    // ── 3. Matricule lu ≠ matricule de la fiche : rien d'appris ───────────────────────────────────────────────────
    r = await valider(A, 'FV-F5-A2', { source: 'ocr', matricule: '1103587T/A/M/000', miseEnPage: mep(0.02) });
    v = await vues();
    check('3. matricule lu sur la facture différent de celui de la fiche : facture validée, rien d\'appris',
      r.status === 201 && v.length === 1 && v[0].facture_id === facA1, `${r.status} ${JSON.stringify(v)}`);

    // ── 4. Un deuxième compte voit la même : partagée ─────────────────────────────────────────────────────────────
    r = await valider(B, 'FV-F5-B1', { source: 'pdf', matricule: MF, miseEnPage: mep(0.02) });
    const rC = await mepDe(C.tok);
    const rB2 = await mepDe(B.tok);
    check('4. vue (à 2 % près) par un deuxième compte : servie à un troisième compte ; chaque compte garde la sienne',
      r.status === 201 && rC.body?.miseEnPage?.colonnes?.length === 4 && rB2.body?.miseEnPage?.colonnes?.[0]?.x0 === 0.09,
      `${r.status} ${JSON.stringify(rC.body)} ${JSON.stringify(rB2.body)}`);

    // ── 5. Un compte seul ne l'impose pas aux autres ──────────────────────────────────────────────────────────────
    r = await valider(A, 'FV-F5-A3', { source: 'pdf', matricule: MF, miseEnPage: fausse });
    const facA3 = r.body?.factureId;
    const rA5 = await mepDe(A.tok), rC5 = await mepDe(C.tok);
    check('5. un compte qui valide une autre mise en page (même « PDF ») ne change que la sienne : le 3e compte ne la reçoit pas',
      r.status === 201 && rA5.body?.miseEnPage?.colonnes?.[1]?.genre === 'montant' && rC5.body?.miseEnPage?.colonnes?.[1]?.genre !== 'montant',
      `${JSON.stringify(rA5.body)} ${JSON.stringify(rC5.body)}`);

    // ── 6. La facture supprimée emporte ce qu'elle avait appris ────────────────────────────────────────────────────
    r = await appel('DELETE', `/api/factures/${facA3}`, A.tok);
    v = await vues();
    check('6. facture supprimée → la mise en page qu\'elle avait fixée pour ce compte part', r.status === 200 && !v.some((x) => x.client_id === A.id), `${r.status} ${JSON.stringify(v)}`);

    // ── 7. Refus silencieux : forme fausse, fournisseur sans matricule, lecture sans mise en page ─────────────────
    const avant = (await vues()).length;
    r = await valider(C, 'FV-F5-C1', { source: 'pdf', matricule: MF, miseEnPage: { colonnes: [{ genre: 'des', x0: 0, x1: 1 }, { genre: 'des', x0: 0.2, x1: 0.3 }] } });
    const lecture7 = (await pool.query('SELECT lecture FROM factures WHERE id = $1', [r.body?.factureId])).rows[0]?.lecture;
    const r7b = await valider(A, 'FV-F5-A4', { source: 'pdf', matricule: MF, miseEnPage: mep() }, sansMf);
    const r7c = await valider(C, 'FV-F5-C2', null);
    check('7. forme fausse, fournisseur sans matricule, validation sans lecture : factures validées, rien d\'appris',
      r.status === 201 && lecture7?.miseEnPage === null && r7b.status === 201 && r7c.status === 201 && (await vues()).length === avant,
      `${r.status} ${r7b.status} ${r7c.status} ${JSON.stringify(lecture7)}`);

    // ── 8. Compte supprimé : ses mises en page partent ─────────────────────────────────────────────────────────────
    r = await appel('DELETE', `/admin/clients/${B.id}`, adminTok);
    v = await vues();
    check('8. compte supprimé (purge admin) : sa mise en page part', [200, 204].includes(r.status) && !v.some((x) => x.client_id === B.id), `${r.status} ${JSON.stringify(v)}`);
  } catch (e) {
    console.error(e);
    check('exécution sans exception', false, e.message);
  } finally {
    await nettoyer().catch((e) => console.error('nettoyage :', e.message));
    const ok = results.filter((x) => x.ok).length;
    console.log(`\n${ok}/${results.length} contrôles réussis`);
    await pool.end();
    process.exit(ok === results.length ? 0 : 1);
  }
})();
