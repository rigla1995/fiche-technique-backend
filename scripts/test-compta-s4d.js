/* Test E2E local — LabFlow Compta, étape S4d « Grands cabinets » (labflow-reprise/achats-compta/ETAPE-S5.md §2 ;
 * remarque du client du 07/10 ; réponses : 25 par page, « Afficher plus », archivés présents et marqués).
 *   un cabinet de 1 200 dossiers (100 archivés) : liste par pages (défauts, dernière page, au-delà), recherche côté
 *   serveur (nom, raison sociale, matricule ; % et _ pris au pied de la lettre), archivés sur demande, relecture par
 *   identifiants (liste à cocher), recherche par identifiant de matricule (assistant), paramètres invalides (400) ;
 *   un collaborateur à liste voit ses dossiers par pages et ses comptes rendus ; les réponses des accès portent le nombre
 *   et les trois premiers noms, plus le catalogue ; une liste de 1 150 dossiers s'enregistre ; temps de réponse ;
 *   migration 211 (index, manuel).
 * Crée un super_admin, un cabinet (3 gérants achetés) et un collaborateur temporaires ; les dossiers sont insérés en
 * base (pas d'exercice : la liste dit « aucun exercice ouvert ») ; règle les tarifs Compta, puis restaure et nettoie.
 * ⚠️ Backend de test : « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué). */
require('dotenv').config();
const crypto = require('crypto');
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
const CLES = ['compta_cabinet_mensuel', 'compta_gerant_cabinet_mensuel', 'compta_mise_en_route', 'compta_module_mensuel', 'compta_gerant_client_mensuel'];
const memes = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const N = 1200;
const ARCHIVES = 100;

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-compta-s4d@example.com';
  const CABINET = 'test-cabinet-compta-s4d@example.com';
  const G1 = 'test-g1-compta-s4d@example.com';
  const CLIENT = 'test-client-compta-s4d@example.com';
  const COMPTABLE = 'test-comptable-compta-s4d@example.com';
  const TOUS = [ADMIN, CABINET, G1, CLIENT, COMPTABLE];
  const avant = Object.fromEntries((await pool.query('SELECT cle, valeur_dt FROM tarifs_config WHERE cle = ANY($1)', [CLES])).rows.map((r) => [r.cle, r.valeur_dt]));
  let adminTok = null;
  const wipe = async () => {
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [TOUS])).rows.map((r) => r.id);
    if (ids.length) {
      const espaces = (await pool.query('SELECT id FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids])).rows.map((r) => r.id);
      await pool.query('DELETE FROM compta.dossiers WHERE espace_id = ANY($1)', [espaces]);
      const client = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [CLIENT])).rows[0];
      if (client && adminTok) await appel('DELETE', `/admin/clients/${client.id}`, adminTok);
      await pool.query(`DELETE FROM compta.evenements WHERE auteur_id = ANY($1) OR (details->>'titulaire')::int = ANY($1) OR espace_id = ANY($2)`, [ids, espaces]);
      await pool.query('DELETE FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM support_demandes WHERE client_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM utilisateurs WHERE id = ANY($1)', [ids]);
    }
  };
  const activer = async (email) => {
    const u = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = $1', [email])).rows[0];
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, u.id]);
    return { id: u.id, tok: (await login(email)).body?.token };
  };
  const noms = (r) => (r.body?.dossiers || []).map((d) => d.nom);
  const chrono = async (f) => { const t = Date.now(); const r = await f(); return { r, ms: Date.now() - t }; };

  try {
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin S4d', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);
    for (const [cle, valeur] of [['compta_cabinet_mensuel', 120], ['compta_gerant_cabinet_mensuel', 30], ['compta_mise_en_route', 0], ['compta_module_mensuel', 60], ['compta_gerant_client_mensuel', 15]]) {
      await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    }
    let r = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Cabinet S4d', email: CABINET, telephone: '20 555 301', raisonSociale: 'Cabinet Essai S4d', formeJuridique: 'SARL',
      adresse: '1 rue de Rome', ville: 'Tunis', representantNom: 'TEST Cabinet S4d', representantQualite: 'Gérant', nbGerants: 3,
    });
    check('création du cabinet', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const cabinet = await activer(CABINET);
    const espaceId = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'cabinet' AND titulaire_id = $1`, [cabinet.id])).rows[0]?.id;
    check('connexion du titulaire', !!cabinet.tok && !!espaceId);

    // ── 1 200 dossiers insérés en base : « Dossier 0001 » … ; un sur cent porte le même identifiant de matricule ──
    await pool.query(
      `INSERT INTO compta.dossiers (espace_id, nom, raison_sociale, matricule_fiscal, personne, impot, tva, etat, cree_par)
       SELECT $1, 'Dossier ' || lpad(i::text, 4, '0'), 'Société ' || lpad(i::text, 4, '0'),
              CASE WHEN i % 100 = 0 THEN '1234567A/A/M/000' ELSE lpad((2000000 + i)::text, 7, '0') || 'B/A/M/000' END,
              'morale', 'IS', 'reel', CASE WHEN i > $2 THEN 'archive' ELSE 'actif' END, $3
         FROM generate_series(1, $4) i`,
      [espaceId, N - ARCHIVES, cabinet.id, N]
    );
    const tousIds = (await pool.query('SELECT id FROM compta.dossiers WHERE espace_id = $1 ORDER BY id', [espaceId])).rows.map((x) => x.id);
    check(`${N} dossiers en base (${ARCHIVES} archivés)`, tousIds.length === N);

    // ── La liste par pages (titulaire) ──
    let { r: l1, ms } = await chrono(() => appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok));
    check('page 1 par défaut : 25 dossiers actifs, triés par nom, comptes rendus', l1.status === 200 && l1.body?.dossiers?.length === 25 && l1.body.dossiers[0].nom === 'Dossier 0001'
      && l1.body.dossiers[24].nom === 'Dossier 0025' && l1.body.total === N - ARCHIVES && l1.body.page === 1 && l1.body.limite === 25
      && l1.body.nbActifs === N - ARCHIVES && l1.body.nbArchives === ARCHIVES && l1.body.droits?.creer === true, JSON.stringify({ n: l1.body?.dossiers?.length, total: l1.body?.total, actifs: l1.body?.nbActifs, archives: l1.body?.nbArchives }));
    check(`… en ${ms} ms (moins de 1 500 ms)`, ms < 1500, `${ms} ms`);
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?page=44`, cabinet.tok);
    check('page 44 : les 25 derniers actifs (1076 à 1100)', r.body?.dossiers?.length === 25 && r.body.dossiers[0].nom === 'Dossier 1076' && r.body.dossiers[24].nom === 'Dossier 1100', JSON.stringify(noms(r).slice(0, 2)));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?page=45`, cabinet.tok);
    check('page 45 : vide, total inchangé', r.status === 200 && r.body?.dossiers?.length === 0 && r.body?.total === N - ARCHIVES, String(r.body?.dossiers?.length));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?limite=200&page=6`, cabinet.tok);
    check('limite 200, page 6 : 100 dossiers (1001 à 1100)', r.body?.dossiers?.length === 100 && r.body.dossiers[0].nom === 'Dossier 1001', String(r.body?.dossiers?.length));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?archives=1`, cabinet.tok);
    check('archivés demandés : total 1200, actifs d\'abord', r.body?.total === N && r.body.dossiers[0].etat === 'actif', String(r.body?.total));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?archives=1&page=48`, cabinet.tok);
    check('… page 48 : les 25 derniers archivés', r.body?.dossiers?.length === 25 && r.body.dossiers.every((d) => d.etat === 'archive') && r.body.dossiers[24].nom === 'Dossier 1200', JSON.stringify(noms(r).slice(-1)));

    // ── Recherche côté serveur ──
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?q=${encodeURIComponent('Société 0042')}`, cabinet.tok);
    check('recherche par raison sociale : 1 résultat', r.body?.total === 1 && r.body.dossiers[0].nom === 'Dossier 0042', JSON.stringify(noms(r)));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?q=${encodeURIComponent('2000777B')}`, cabinet.tok);
    check('recherche par matricule : 1 résultat', r.body?.total === 1 && r.body.dossiers[0].nom === 'Dossier 0777', JSON.stringify(noms(r)));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?q=${encodeURIComponent('dossier 11')}`, cabinet.tok);
    check('recherche sans casse « dossier 11 » : 1100 à 1199 → 1 actif (1100) sans les archivés', r.body?.total === 1 && r.body.dossiers[0].nom === 'Dossier 1100', String(r.body?.total));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?q=${encodeURIComponent('dossier 11')}&archives=1`, cabinet.tok);
    check('… avec les archivés : 100 résultats, 25 par page', r.body?.total === 100 && r.body.dossiers.length === 25, String(r.body?.total));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?q=%25`, cabinet.tok);
    check('« % » pris au pied de la lettre : 0 résultat', r.status === 200 && r.body?.total === 0, String(r.body?.total));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?q=_`, cabinet.tok);
    check('« _ » pris au pied de la lettre : 0 résultat', r.status === 200 && r.body?.total === 0, String(r.body?.total));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?q=zzz`, cabinet.tok);
    check('aucun résultat : total 0, comptes rendus de l\'en-tête inchangés', r.body?.total === 0 && r.body?.nbActifs === N - ARCHIVES, String(r.body?.nbActifs));

    // ── Relecture par identifiants (liste à cocher) et par matricule (assistant) ──
    const choisis = [tousIds[9], tousIds[1], tousIds[N - 1], 999999999];
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?ids=${choisis.join(',')}&archives=1`, cabinet.tok);
    check('ids : les dossiers demandés (3, inconnu ignoré), archivé compris', r.body?.total === 3 && memes(noms(r), ['Dossier 0002', 'Dossier 0010', 'Dossier 1200']), JSON.stringify(noms(r)));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?ids=${choisis.join(',')}`, cabinet.tok);
    check('ids sans les archivés : 2', r.body?.total === 2, String(r.body?.total));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?ids=`, cabinet.tok);
    check('ids vide : rien', r.status === 200 && r.body?.total === 0 && r.body?.dossiers?.length === 0, String(r.body?.total));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?matricule=1234567`, cabinet.tok);
    check('matricule 1234567 : 11 dossiers actifs le portent (un sur cent)', r.body?.total === 11 && r.body.dossiers.every((d) => d.matriculeFiscal === '1234567A/A/M/000'), String(r.body?.total));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?matricule=1234567&archives=1&limite=3`, cabinet.tok);
    check('… avec les archivés : 12, page de 3 pour l\'assistant', r.body?.total === 12 && r.body.dossiers.length === 3, String(r.body?.total));
    for (const [param, attendu] of [['page=0', 400], ['page=x', 400], ['page=1e2', 400], ['limite=201', 400], ['ids=a', 400], [`ids=${tousIds.slice(0, 201).join(',')}`, 400], ['matricule=12', 400], ['limite=200', 200], ['archives=true', 200]]) {
      r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?${param}`, cabinet.tok);
      check(`paramètre ${param.slice(0, 24)}${param.length > 24 ? '…' : ''} : ${attendu}`, r.status === attendu, String(r.status));
    }
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?archives=true`, cabinet.tok);
    check('archives=true vaut archives=1', r.body?.total === N, String(r.body?.total));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?ids=${tousIds.slice(0, 30).join(',')}&page=2`, cabinet.tok);
    check('ids (30) avec page 2 : 5 dossiers, total 30 (paginés comme le reste)', r.body?.dossiers?.length === 5 && r.body?.total === 30, JSON.stringify([r.body?.dossiers?.length, r.body?.total]));

    // ── Une deuxième comptabilité (client LabFlow, module) : rien ne passe d'une comptabilité à l'autre ──
    r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST Client S4d', email: CLIENT, telephone: '20 555 302', nbActivites: 1, nbLabos: 0, nbGerants: 0, montantOnboarding: 0 });
    const client = await activer(CLIENT);
    r = await appel('PUT', `/api/abonnements/client/${client.id}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 0 });
    const espaceClient = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'client_labflow' AND titulaire_id = $1`, [client.id])).rows[0]?.id;
    await pool.query(
      `INSERT INTO compta.dossiers (espace_id, nom, raison_sociale, matricule_fiscal, personne, impot, tva, etat, cree_par)
       SELECT $1, 'Client ' || lpad(i::text, 3, '0'), 'Client ' || lpad(i::text, 3, '0'), CASE WHEN i = 1 THEN '1234567A/A/M/000' ELSE lpad((4000000 + i)::text, 7, '0') || 'C/A/M/000' END,
              'morale', 'IS', 'reel', 'actif', $2 FROM generate_series(1, 30) i`,
      [espaceClient, client.id]
    );
    const idsClient = (await pool.query(`SELECT id FROM compta.dossiers WHERE espace_id = $1 AND source = 'saisi' ORDER BY id`, [espaceClient])).rows.map((x) => x.id);
    check('client LabFlow avec le module : « Mon entreprise » + 30 dossiers', !!client.tok && !!espaceClient && idsClient.length === 30);
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?ids=${idsClient.slice(0, 3).join(',')}&archives=1`, cabinet.tok);
    check('le cabinet relit par identifiants des dossiers du client : aucun', r.status === 200 && r.body?.total === 0, String(r.body?.total));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?matricule=4000002`, cabinet.tok);
    check('… ni par matricule', r.body?.total === 0, String(r.body?.total));
    r = await appel('GET', `/api/compta/espaces/${espaceClient}/dossiers?matricule=1234567`, cabinet.tok);
    check('… ni en visant la comptabilité du client (404)', r.status === 404, String(r.status));
    const accesClient = (await pool.query('SELECT id FROM compta.acces WHERE obligatoire AND espace_id = $1', [espaceClient])).rows[0]?.id;
    await appel('PUT', `/api/compta/mes-comptables/${accesClient}`, client.tok, { nom: 'Comptable S4d', email: COMPTABLE, niveau: 'saisie' });
    const comptable = await activer(COMPTABLE);
    r = await appel('GET', `/api/compta/espaces/${espaceClient}/dossiers`, comptable.tok);
    check('le comptable du client (tous) : page 1 = 25 sur 31 (« Mon entreprise » compris)', r.status === 200 && r.body?.dossiers?.length === 25 && r.body?.total === 31 && r.body?.espace?.type === 'client_labflow', JSON.stringify([r.body?.dossiers?.length, r.body?.total]));
    r = await appel('GET', `/api/compta/espaces/${espaceClient}/dossiers?page=2`, comptable.tok);
    check('… page 2 = 6', r.body?.dossiers?.length === 6, String(r.body?.dossiers?.length));
    await appel('PUT', `/api/compta/mes-comptables/${accesClient}`, client.tok, { dossiers: idsClient.slice(0, 2) });
    r = await appel('GET', `/api/compta/espaces/${espaceClient}/dossiers?matricule=1234567`, comptable.tok);
    check('comptable restreint à deux dossiers : le matricule partagé avec le cabinet ne révèle que les siens (1)', r.body?.total === 1 && r.body.dossiers[0].nom === 'Client 001', String(r.body?.total));
    r = await appel('GET', `/api/compta/espaces/${espaceClient}/dossiers?q=Client`, comptable.tok);
    check('… et la recherche aussi (2)', r.body?.total === 2 && r.body?.nbActifs === 2, String(r.body?.total));

    // ── Collaborateur à liste : ses pages, ses comptes rendus ; carte avec le nombre et les premiers noms ──
    r = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'G1 Liste', email: G1, niveau: 'saisie', dossiers: tousIds.slice(0, 30) });
    const g1 = r.body?.gerants?.find((g) => g.email === G1);
    check('collaborateur ajouté avec 30 dossiers : la carte porte le nombre et 3 premiers noms, la réponse ne porte plus le catalogue',
      r.status === 201 && g1?.dossiers?.length === 30 && memes(g1?.dossiersNoms, ['Dossier 0001', 'Dossier 0002', 'Dossier 0003']) && !('dossiers' in r.body), `${r.status} ${JSON.stringify(g1?.dossiersNoms)} ${Object.keys(r.body || {}).join(',')}`);
    const p1 = await activer(G1);
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers`, p1.tok);
    check('G1 : page 1 = 25 de ses 30 dossiers, comptes rendus des siens seulement', r.status === 200 && r.body?.dossiers?.length === 25 && r.body.total === 30 && r.body.nbActifs === 30 && r.body.nbArchives === 0, JSON.stringify({ total: r.body?.total, actifs: r.body?.nbActifs }));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?page=2`, p1.tok);
    check('G1 : page 2 = 5', r.body?.dossiers?.length === 5, String(r.body?.dossiers?.length));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?q=${encodeURIComponent('Dossier 0042')}`, p1.tok);
    check('G1 : un dossier caché ne se trouve pas par la recherche', r.body?.total === 0, String(r.body?.total));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?ids=${tousIds[99]},${tousIds[0]}`, p1.tok);
    check('G1 : relecture par identifiants limitée aux siens', r.body?.total === 1 && r.body.dossiers[0].nom === 'Dossier 0001', JSON.stringify(noms(r)));
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?matricule=1234567`, p1.tok);
    check('G1 : le matricule ne révèle que les siens (aucun)', r.body?.total === 0, String(r.body?.total));
    const grande = tousIds.slice(0, 1150);
    ({ r, ms } = await chrono(() => appel('PUT', `/api/compta/cabinet/gerants/${g1.id}`, cabinet.tok, { dossiers: grande })));
    check(`liste de 1 150 dossiers enregistrée en ${ms} ms`, r.status === 200 && r.body?.gerants?.find((g) => g.id === g1.id)?.dossiers?.length === 1150, `${r.status} ${r.body?.message || ''}`);
    r = await appel('GET', `/api/compta/espaces/${espaceId}/dossiers?archives=1`, p1.tok);
    check('G1 : 1 100 actifs et 50 archivés', r.body?.nbActifs === 1100 && r.body?.nbArchives === 50 && r.body?.total === 1150, JSON.stringify({ a: r.body?.nbActifs, z: r.body?.nbArchives }));
    r = await appel('GET', '/api/compta/cabinet/gerants', cabinet.tok);
    check('« Mes gérants » : réponse sans catalogue, G1 avec 1 150 identifiants et 3 noms', !('dossiers' in r.body) && r.body?.gerants?.find((g) => g.id === g1.id)?.dossiersNoms?.length === 3, Object.keys(r.body || {}).join(','));

    // ── Migration 211 : index et manuel ──
    const idx = (await pool.query(`SELECT 1 FROM pg_indexes WHERE schemaname = 'compta' AND indexname = 'idx_compta_acces_dossiers_dossier'`)).rows.length;
    check('index acces_dossiers (dossier_id) en place', idx === 1);
    const manuel = (await pool.query(`SELECT slug, position('Afficher plus' in contenu_defaut) > 0 AS s4d, contenu = contenu_defaut AS suit FROM manuel_sections WHERE produit = 'compta' AND slug IN ('compta-dossiers', 'compta-gerants', 'compta-ma-comptabilite') ORDER BY slug`)).rows;
    check('manuel : les 3 fiches parlent des pages et de la recherche, le texte servi suit', manuel.length === 3 && manuel.every((f) => f.s4d && f.suit), JSON.stringify(manuel));
    ({ ms } = await chrono(() => pool.query('DELETE FROM compta.dossiers WHERE id = $1', [tousIds[0]])));
    check(`suppression d'un dossier ouvert à un accès (cascade indexée) en ${ms} ms`, ms < 500, `${ms} ms`);
  } catch (e) {
    console.error(e);
    check('exécution sans erreur', false, e.message);
  } finally {
    for (const [cle, valeur] of Object.entries(avant)) await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    await wipe().catch((e) => console.error('[nettoyage]', e.message));
    await pool.end();
  }
  const ko = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - ko}/${results.length} vérifications passées`);
  process.exit(ko ? 1 : 0);
})();
