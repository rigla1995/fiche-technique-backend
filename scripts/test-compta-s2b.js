/* Test E2E local — LabFlow Compta, étape S2b (labflow-reprise/achats-compta/PLAN-S2.md) : le cabinet comptable.
 *   POST /admin/comptables (refus tant que le tarif vaut 0 ; création en une transaction ; doublon d'email sans casse)
 *   activation, connexion sans casse, périmètre du rôle « comptable » (D5), pages du cabinet sur /api/compta,
 *   mensualité avec postes figés, promotion, facture « LabFlow Compta » à N lignes, gérants, identité, suppression.
 * Crée un super_admin et un cabinet temporaires, règle les 5 tarifs de LabFlow Compta le temps de l'essai, puis
 * restaure les tarifs et nettoie (le journal compta.evenements de l'essai est retiré aussi).
 * ⚠️ Backend de test : « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué). */
require('dotenv').config();
const zlib = require('zlib');
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const MDP = 'TestComptaS2b2026!';
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
  const type = r.headers.get('content-type') || '';
  let body = null;
  if (type.includes('application/pdf')) body = Buffer.from(await r.arrayBuffer());
  else { try { body = await r.json(); } catch (_) { /* corps vide */ } }
  return { status: r.status, body };
};
const login = async (email, mdp = MDP) => appel('POST', '/auth/login', null, { email, password: mdp });

// Texte d'un PDF de pdfkit : flux décompressés, chaînes hexadécimales des tableaux TJ (Windows-1252), une par ligne.
const textePdf = (buf) => {
  const brut = buf.toString('latin1');
  const lignes = [];
  const re = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m;
  while ((m = re.exec(brut))) {
    let flux;
    try { flux = zlib.inflateSync(Buffer.from(m[1], 'latin1')).toString('latin1'); } catch (_) { continue; }
    for (const tj of flux.match(/\[([^\]]*)\]\s*TJ/g) || []) {
      lignes.push((tj.match(/<([0-9a-fA-F]*)>/g) || []).map((h) => Buffer.from(h.slice(1, -1), 'hex').toString('latin1')).join(''));
    }
  }
  return lignes.join('\n').replace(/\x97/g, '—');
};

const CLES = ['compta_cabinet_mensuel', 'compta_gerant_cabinet_mensuel', 'compta_mise_en_route', 'compta_module_mensuel', 'compta_gerant_client_mensuel'];

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-compta-s2b@example.com';
  const CABINET = 'test-cabinet-s2b@example.com';
  const CABINET2 = 'test-cabinet2-s2b@example.com';
  const avant = Object.fromEntries((await pool.query('SELECT cle, valeur_dt FROM tarifs_config WHERE cle = ANY($1)', [CLES])).rows.map((r) => [r.cle, r.valeur_dt]));
  const wipe = async () => {
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [[ADMIN, CABINET, CABINET2]])).rows.map((r) => r.id);
    if (ids.length) {
      await pool.query(`DELETE FROM compta.evenements WHERE auteur_id = ANY($1) OR (details->>'titulaire')::int = ANY($1)`, [ids]);
      await pool.query('DELETE FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM utilisateurs WHERE id = ANY($1)', [ids]);
    }
  };
  await wipe();
  check('les 5 tarifs de LabFlow Compta existent (migration 202)', Object.keys(avant).length === 5, Object.keys(avant).join(', '));

  try {
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin S2b', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    const admin = (await login(ADMIN)).body?.token;
    check('connexion admin', !!admin);

    // ── Tarifs ──
    await appel('PUT', '/api/abonnements/tarifs/compta_cabinet_mensuel', admin, { valeur: 0 });
    const corps = {
      name: 'Samia Ben Salah', email: 'Test-Cabinet-S2b@Example.com', telephone: '20 555 019',
      raisonSociale: 'Cabinet Essai S2b', formeJuridique: 'SARL', adresse: '12 rue de Marseille', ville: 'Tunis',
      representantNom: 'Samia Ben Salah', representantQualite: 'Gérante',
      nbGerants: 2,
    };
    let r = await appel('POST', '/admin/comptables', admin, corps);
    check('création refusée tant que le tarif « LabFlow Compta seul » vaut 0', r.status === 400 && r.body?.code === 'TARIF_COMPTA_MANQUANT', `${r.status} ${r.body?.message}`);
    for (const [cle, valeur] of [['compta_cabinet_mensuel', 120], ['compta_gerant_cabinet_mensuel', 30], ['compta_mise_en_route', 250]]) {
      r = await appel('PUT', `/api/abonnements/tarifs/${cle}`, admin, { valeur });
      check(`tarif ${cle} enregistré par l'admin`, r.status === 200, String(r.status));
    }
    r = await appel('PUT', '/api/abonnements/tarifs/compta_cabinet_mensuel', admin, { valeur: 99, domaineId: 1 });
    check('tarif Compta jamais surchargé par domaine', r.status === 400, String(r.status));
    r = await appel('GET', '/admin/comptables/apercu-prix?nbGerants=2', admin);
    check('aperçu du prix : 120 + 2 × 30 = 180 DT, mise en route 250', r.status === 200 && r.body?.totalMensuel === 180 && r.body?.miseEnRoute === 250 && r.body?.postes?.length === 2, JSON.stringify(r.body));

    // ── Création ──
    const moisCourant = `${new Date().toISOString().slice(0, 7)}-01`;
    r = await appel('POST', '/admin/comptables', admin, {
      ...corps,
      promotions: [{ type: 'percent_off', appliesTo: 'mensualite', discountMensualite: 50, dateDebut: moisCourant, monthsDuration: 3 }],
    });
    check('création du cabinet (201)', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const id = r.body?.id;
    check('réponse : totalMensuel 180, 2 gérants, invitation envoyée', r.body?.abonnement?.totalMensuel === 180 && r.body?.abonnement?.nbGerants === 2 && r.body?.abonnement?.inviteSent === true, JSON.stringify(r.body?.abonnement));
    const u = (await pool.query('SELECT * FROM utilisateurs WHERE id = $1', [id])).rows[0];
    check('personne de rôle « comptable », adresse en minuscules, jeton d\'activation', u?.role === 'comptable' && u?.email === CABINET && !!u?.invite_token && !u?.mot_de_passe);
    const pe = (await pool.query('SELECT * FROM profil_entreprise WHERE client_id = $1', [id])).rows[0];
    check('fiche d\'identité (profil_entreprise)', pe?.raison_sociale === 'Cabinet Essai S2b' && pe?.ville === 'Tunis' && pe?.forme_juridique === 'SARL');
    const abo = (await pool.query('SELECT * FROM abonnements WHERE client_id = $1', [id])).rows;
    check('un seul abonnement, produit « compta », mise en route 250 en attente', abo.length === 1 && abo[0].produit === 'compta' && Number(abo[0].montant_onboarding) === 250 && abo[0].statut_onboarding === 'en_attente');
    const cfg = (await pool.query('SELECT * FROM abonnement_config WHERE abonnement_id = $1', [abo[0]?.id])).rows[0];
    check('configuration sans poste LabFlow, 2 gérants comptables, sans domaine', cfg && cfg.nb_activites === 0 && cfg.nb_labos === 0 && cfg.nb_acheteurs === 0 && cfg.domaine_id == null && cfg.nb_gerants_compta === 2);
    let p = (await pool.query('SELECT * FROM paiements WHERE abonnement_id = $1', [abo[0]?.id])).rows;
    check('mensualité du mois : 180 − 50 % = 90 DT, en attente', p.length === 1 && Number(p[0].montant_dt) === 90 && p[0].statut === 'en_attente', JSON.stringify(p.map((x) => [x.mois, x.montant_dt, x.statut])));
    const lignes = p[0]?.lignes || [];
    check('postes figés : abonnement 120, gérants 60, remise −90 (somme = montant)',
      lignes.length === 3 && lignes[0].libelle === 'LabFlow Compta — abonnement mensuel' && lignes[0].montant === 120
      && lignes[1].montant === 60 && lignes[2].montant === -90 && lignes.reduce((s, l) => s + l.montant, 0) === 90, JSON.stringify(lignes));
    const promo = (await pool.query('SELECT type, is_system FROM promotions WHERE abonnement_id = $1', [abo[0]?.id])).rows;
    check('promotion de l\'assistant posée, pas de « 1er mois offert »', promo.length === 1 && promo[0].type === 'percent_off' && !promo[0].is_system);
    const esp = (await pool.query(`SELECT * FROM compta.espaces WHERE titulaire_id = $1`, [id])).rows;
    check('espace « cabinet » au nom du cabinet', esp.length === 1 && esp[0].type === 'cabinet' && esp[0].nom === 'Cabinet Essai S2b');
    const acc = (await pool.query(`SELECT * FROM compta.acces WHERE espace_id = $1`, [esp[0]?.id])).rows;
    check('accès du titulaire, actif et complet', acc.length === 1 && acc[0].personne_id === id && acc[0].role === 'titulaire' && acc[0].etat === 'actif' && acc[0].niveau === 'complet');
    const ev = (await pool.query(`SELECT type FROM compta.evenements WHERE espace_id = $1`, [esp[0]?.id])).rows;
    check('journal : « cabinet_cree »', ev.some((e) => e.type === 'cabinet_cree'));

    r = await appel('POST', '/admin/comptables', admin, { ...corps, telephone: '20 555 020', email: 'TEST-cabinet-s2b@example.COM' });
    check('doublon d\'adresse (casse différente) refusé : 409', r.status === 409, String(r.status));
    r = await appel('GET', '/admin/comptables', admin);
    check('liste admin : le cabinet, 180 DT/mois', r.status === 200 && r.body.some((c) => c.id === id && c.abonnement?.totalMensuel === 180));
    r = await appel('GET', `/api/abonnements/client/${id}?withPricing=1`, admin);
    check('fiche d\'abonnement admin : produit « compta », postes du cabinet', r.status === 200 && r.body?.produit === 'compta' && r.body?.pricing?.compta?.postes?.length === 2 && r.body?.pricing?.baseMensuel === 180, JSON.stringify(r.body?.pricing?.compta));
    r = await appel('GET', '/api/abonnements', admin);
    const cabinetsBase = new Set((await pool.query("SELECT client_id FROM abonnements WHERE produit = 'compta'")).rows.map((x) => x.client_id));
    check('liste des abonnements : le cabinet marqué « compta », les comptes LabFlow sans champ produit', r.status === 200 && r.body.some((a) => a.clientId === id && a.produit === 'compta') && r.body.filter((a) => !cabinetsBase.has(a.clientId)).every((a) => !('produit' in a)));

    // ── Activation, connexion, périmètre ──
    r = await login(CABINET);
    check('connexion avant activation : 403 invite_pending', r.status === 403 && r.body?.message === 'invite_pending');
    r = await appel('POST', '/auth/invite/accept', null, { token: u.invite_token, password: MDP });
    check('activation par le lien de l\'email', r.status === 200, String(r.status));
    r = await login('Test-Cabinet-S2B@example.com');
    check('connexion sans la casse de l\'adresse', r.status === 200 && r.body?.user?.role === 'comptable', `${r.status} ${r.body?.user?.role}`);
    const jeton = r.body?.token;
    r = await appel('GET', '/api/unites', jeton);
    check('D5 : GET /api/unites → 403', r.status === 403, String(r.status));
    r = await appel('POST', '/api/unites', jeton, { nom: 'Essai' });
    check('D5 : POST /api/unites → 403', r.status === 403, String(r.status));
    r = await appel('GET', '/api/abonnements/mon-abonnement', jeton);
    check('D5 : GET /api/abonnements/mon-abonnement → 403', r.status === 403, String(r.status));
    r = await appel('GET', '/api/notifications', jeton);
    check('D5 : notifications ouvertes', r.status === 200, String(r.status));
    r = await appel('GET', '/api/manuel?produit=labflow', jeton);
    check('manuel : les seules fiches de LabFlow Compta, même en demandant LabFlow',
      r.status === 200 && r.body.length >= 3 && r.body.every((f) => ['compta-bienvenue', 'compta-cabinet', 'compta-abonnement'].includes(f.slug)), (r.body || []).map((f) => f.slug).join(', '));
    r = await appel('GET', '/auth/me', jeton);
    check('/auth/me : rôle comptable', r.status === 200 && (r.body?.role === 'comptable' || r.body?.user?.role === 'comptable'));
    r = await appel('GET', '/api/compta/acces', jeton);
    check('accueil : « Mon cabinet » (lien /cabinet), aucun autre groupe',
      r.status === 200 && r.body.cabinets.length === 1 && r.body.cabinets[0].lien === '/cabinet' && !r.body.maComptabilite.length && !r.body.confiees.length, JSON.stringify(r.body));
    r = await appel('GET', '/api/compta/cabinet', jeton);
    check('page « Mon cabinet » : identité, contact, 2 gérants', r.status === 200 && r.body?.identite?.raisonSociale === 'Cabinet Essai S2b' && r.body?.contact?.email === CABINET && r.body?.nbGerants === 2, JSON.stringify(r.body));
    r = await appel('GET', '/api/compta/abonnement', jeton);
    check('page « Abonnement et factures » : 180 DT, 90 DT avec la promotion, mise en route 250, 1 mensualité',
      r.status === 200 && r.body?.totalMensuel === 180 && r.body?.effectifMensuel === 90 && r.body?.miseEnRoute?.montant === 250 && r.body?.paiements?.length === 1 && r.body?.promotion?.pourcentage === 50, JSON.stringify(r.body));
    const paiementId = r.body?.paiements?.[0]?.id;
    r = await appel('GET', `/api/compta/abonnement/paiements/${paiementId}/facture`, jeton);
    check('facture d\'une mensualité non réglée : 400', r.status === 400, String(r.status));

    // ── Règlement et facture ──
    // Comme l'écran Abonnements : le montant affiché est envoyé avec le statut.
    r = await appel('POST', `/api/abonnements/client/${id}/paiements`, admin, { mois: moisCourant, statut: 'payé', montant: 90 });
    check('admin (comme l\'écran, montant 90 envoyé) : mensualité réglée, postes figés', r.status === 200 && Number(r.body?.montantDt) === 90, `${r.status} ${r.body?.montantDt}`);
    p = (await pool.query('SELECT * FROM paiements WHERE id = $1', [paiementId])).rows[0];
    check('identité copiée sur le paiement, postes toujours 3', !!p?.client_fige_le && p?.client_raison_sociale === 'Cabinet Essai S2b' && p?.lignes?.length === 3);
    r = await appel('GET', `/api/compta/abonnement/paiements/${paiementId}/facture`, jeton);
    const pdf = Buffer.isBuffer(r.body) ? r.body : null;
    check('le cabinet télécharge sa facture (PDF)', r.status === 200 && !!pdf && pdf.slice(0, 4).toString() === '%PDF', String(r.status));
    const texte = pdf ? textePdf(pdf) : '';
    check('facture : sous-titre, objet et pied « LabFlow Compta »', /LabFlow Compta — abonnement mensuel au service en ligne/.test(texte) && /Abonnement mensuel à LabFlow Compta/.test(texte) && /émise électroniquement par LabFlow Compta/.test(texte), texte.slice(0, 200).replace(/\n/g, ' | '));
    check('facture : 3 lignes (abonnement, gérants, remise) et total 90 DT', /Gérants supplémentaires × 2/.test(texte) && /Remise \(promotion\)/.test(texte) && /90\.000 DT/.test(texte));
    check('facture : identité du cabinet', /Cabinet Essai S2b/.test(texte));
    const admPdf = await appel('GET', `/api/abonnements/paiements/${paiementId}/facture`, admin);
    check('même facture côté admin, à l\'octet', Buffer.isBuffer(admPdf.body) && pdf && admPdf.body.equals(pdf));

    // ── Gérants, identité, invitation, statistiques ──
    r = await appel('PUT', `/admin/comptables/${id}/gerants`, admin, { nbGerants: 3 });
    check('gérants achetés : 3 (210 DT/mois)', r.status === 200 && r.body?.abonnement?.nbGerants === 3 && r.body?.abonnement?.totalMensuel === 210, JSON.stringify(r.body?.abonnement));
    r = await appel('POST', `/api/abonnements/client/${id}/paiements`, admin, { mois: moisCourant, statut: 'payé', montant: 90, datePaiement: moisCourant });
    p = (await pool.query('SELECT lignes, montant_dt FROM paiements WHERE id = $1', [paiementId])).rows[0];
    check('mensualité réglée ré-enregistrée après le changement de gérants : ses 3 postes restent (facture émise)',
      r.status === 200 && p?.lignes?.length === 3 && p.lignes.reduce((s, l) => s + l.montant, 0) === 90, JSON.stringify(p?.lignes));
    r = await appel('PUT', `/admin/comptables/${id}/gerants`, admin, { nbGerants: -1 });
    check('nombre de gérants invalide : 400', r.status === 400);
    r = await appel('PUT', `/admin/comptables/${id}/identite`, admin, { ville: 'Sfax' });
    check('identité modifiée par l\'admin', r.status === 200 && r.body?.entreprise?.ville === 'Sfax');
    r = await appel('POST', `/admin/comptables/${id}/invitation`, admin);
    check('renvoi d\'invitation d\'un compte activé : 409', r.status === 409);
    r = await appel('GET', '/admin/comptables/999999999', admin);
    check('cabinet inconnu : 404', r.status === 404);
    r = await appel('GET', '/admin/comptables', jeton);
    check('routes admin refusées au comptable', r.status === 403, String(r.status));
    const stats = await appel('GET', '/admin/rapports/stats', admin);
    const nbLabflow = Number((await pool.query(`SELECT COUNT(*) FROM abonnements WHERE produit = 'labflow'`)).rows[0].count);
    check('statistiques : abonnements LabFlow seulement', stats.status === 200 && Number(stats.body?.abonnements?.total ?? stats.body?.abonnementsTotal ?? nbLabflow) === nbLabflow, JSON.stringify(stats.body?.abonnements));

    // ── Suppression ──
    r = await appel('DELETE', `/admin/comptables/${id}`, admin);
    check('suppression refusée : une mensualité est réglée (409)', r.status === 409 && /factures émises/.test(r.body?.message || ''), `${r.status} ${r.body?.message}`);

    // Second cabinet, jamais réglé : promotions contrôlées, renvoi d'invitation, puis suppression.
    const corps2 = { ...corps, email: CABINET2, telephone: '20 555 021', raisonSociale: 'Cabinet Essai S2b bis', nbGerants: 0 };
    r = await appel('POST', '/admin/comptables', admin, { ...corps2, promotions: [{ type: 'percent_off', appliesTo: 'mensualite', discountMensualite: 150, dateDebut: moisCourant }] });
    check('promotion à 150 % refusée : 400', r.status === 400, `${r.status} ${r.body?.message}`);
    r = await appel('POST', '/admin/comptables', admin, { ...corps2, promotions: [{ type: 'fixed_price', appliesTo: 'mensualite', fixedMensualite: 100, dateDebut: moisCourant, isSystem: true }] });
    const id2 = r.body?.id;
    const promo2 = id2 ? (await pool.query('SELECT pr.is_system FROM promotions pr JOIN abonnements a ON a.id = pr.abonnement_id WHERE a.client_id = $1', [id2])).rows : [];
    check('second cabinet créé ; une promotion « système » envoyée par l\'API reste ordinaire', r.status === 201 && promo2.length === 1 && promo2[0].is_system === false, `${r.status} ${JSON.stringify(promo2)}`);
    r = await appel('POST', `/auth/invite/resend/${id2}`, admin);
    check('renvoi d\'invitation par la route générale : 200', r.status === 200, String(r.status));
    r = await appel('DELETE', `/admin/comptables/${id2}`, admin);
    check('suppression d\'un cabinet jamais réglé (aucun dossier) : 204', r.status === 204, String(r.status));
    const reste = (await pool.query('SELECT (SELECT COUNT(*) FROM utilisateurs WHERE id = $1)::int AS u, (SELECT COUNT(*) FROM compta.espaces WHERE titulaire_id = $1)::int AS e, (SELECT COUNT(*) FROM abonnements WHERE client_id = $1)::int AS a', [id2])).rows[0];
    check('compte, espace et abonnement retirés', reste.u === 0 && reste.e === 0 && reste.a === 0, JSON.stringify(reste));
    const journal = (await pool.query(`SELECT type, espace_id FROM compta.evenements WHERE (details->>'titulaire')::int = $1 ORDER BY id`, [id2])).rows;
    check('le journal reste (cabinet_cree … cabinet_supprime, espace vidé)', journal.length >= 2 && journal.some((j) => j.type === 'cabinet_supprime') && journal.every((j) => j.espace_id == null), JSON.stringify(journal));
  } catch (e) {
    console.error(e);
    check('exécution sans erreur', false, e.message);
  } finally {
    for (const [cle, valeur] of Object.entries(avant)) await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    await wipe();
    await pool.end();
  }
  const ko = results.filter((x) => !x.ok).length;
  console.log(`\n${results.length - ko}/${results.length} vérifications passées`);
  process.exit(ko ? 1 : 0);
})();
