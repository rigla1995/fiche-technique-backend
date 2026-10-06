/* Test E2E local — LabFlow Compta, étape S2c (labflow-reprise/achats-compta/PLAN-S2.md §4) : le module Comptabilité chez
 * un client Stock / Vente.
 *   tarif à 0 ⇒ module non proposé, demande et activation refusées ; demande du client + notification aux admins ;
 *   validation (une seule fois) = activation : comptabilité client_labflow, accès titulaire, accès obligatoire « à
 *   attribuer », journal ; facturation à plein tarif, hors promotion, à partir du mois qui suit l'activation ; postes
 *   figés et facture à N lignes ; gérants comptables ; « Ma comptabilité » sur /api/compta ; désactivation (comptabilité
 *   fermée, rien d'effacé) et réactivation ; suppression du client (comptabilité retirée avant, journal conservé).
 * Crée un super_admin et un client temporaires, règle les tarifs du module le temps de l'essai, puis restaure les
 * tarifs et nettoie (le journal compta.evenements de l'essai est retiré aussi).
 * ⚠️ Backend de test : « node scripts/start-test-backend.js » (emails bouchonnés, réseau sortant bloqué). */
require('dotenv').config();
const crypto = require('crypto');
const zlib = require('zlib');
const pool = require('../src/config/database');
const bcrypt = require('bcryptjs');

const BASE = process.env.BASE_URL || 'http://localhost:3000';
// Mot de passe des comptes temporaires : tiré au hasard à chaque essai (jamais écrit dans le dépôt).
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
  const type = r.headers.get('content-type') || '';
  let body = null;
  if (type.includes('application/pdf')) body = Buffer.from(await r.arrayBuffer());
  else { try { body = await r.json(); } catch (_) { /* corps vide */ } }
  return { status: r.status, body };
};
const login = async (email) => (await appel('POST', '/auth/login', null, { email, password: MDP })).body?.token;

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

const CLES = ['compta_module_mensuel', 'compta_gerant_client_mensuel'];
const moisSuivant = (m) => {
  const [a, mo] = m.split('-').map(Number);
  return mo === 12 ? `${a + 1}-01-01` : `${a}-${String(mo + 1).padStart(2, '0')}-01`;
};
const somme = (l) => Math.round((l || []).reduce((s, x) => s + Number(x.montant), 0) * 100) / 100;

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-compta-s2c@example.com';
  const CLIENT = 'test-client-compta-s2c@example.com';
  const avant = Object.fromEntries((await pool.query('SELECT cle, valeur_dt FROM tarifs_config WHERE cle = ANY($1)', [CLES])).rows.map((r) => [r.cle, r.valeur_dt]));
  let adminTok = null;
  let clientId = null;
  const wipe = async () => {
    const client = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [CLIENT])).rows[0];
    if (client && adminTok) await appel('DELETE', `/admin/clients/${client.id}`, adminTok);
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE email = ANY($1)', [[ADMIN, CLIENT]])).rows.map((r) => r.id);
    const tous = [...new Set([...ids, ...(clientId ? [clientId] : [])])];
    if (tous.length) {
      await pool.query(`DELETE FROM compta.evenements WHERE auteur_id = ANY($1) OR (details->>'titulaire')::int = ANY($1)`, [tous]);
      await pool.query('DELETE FROM compta.espaces WHERE titulaire_id = ANY($1)', [tous]);
      await pool.query('DELETE FROM notifications WHERE user_id = ANY($1)', [tous]);
      await pool.query('DELETE FROM demandes WHERE demandeur_id = ANY($1)', [tous]);
      await pool.query('DELETE FROM utilisateurs WHERE id = ANY($1)', [tous]);
    }
  };

  try {
    // Restes d'un essai interrompu (sans jeton admin : retrait direct), puis super_admin temporaire.
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin S2c', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = await login(ADMIN);
    check('connexion admin', !!adminTok);
    const adminId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [ADMIN])).rows[0].id;

    // ── Client LabFlow (1 activité) ──
    let r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST Client S2c', email: CLIENT, telephone: '20 555 031', nbActivites: 1, nbLabos: 0, nbGerants: 0, montantOnboarding: 0 });
    check('création du client LabFlow', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    clientId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [CLIENT])).rows[0]?.id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, clientId]);
    const clientTok = await login(CLIENT);
    check('connexion du client', !!clientTok);
    const abo = (await pool.query('SELECT id FROM abonnements WHERE client_id = $1', [clientId])).rows[0];
    const moisCourant = `${new Date().toISOString().slice(0, 7)}-01`;
    const suivant = moisSuivant(moisCourant);
    const paiementCourantAvant = (await pool.query('SELECT montant_dt, statut, lignes FROM paiements WHERE abonnement_id = $1 AND mois = $2', [abo.id, moisCourant])).rows[0];

    // ── Tarif à 0 : module non proposé ──
    await pool.query('UPDATE tarifs_config SET valeur_dt = 0 WHERE cle = ANY($1)', [CLES]);
    r = await appel('GET', '/api/abonnements/module-compta', clientTok);
    check('tarif à 0 : module non proposé au client (carte cachée)', r.status === 200 && r.body?.disponible === false && r.body?.actif === false, JSON.stringify(r.body));
    r = await appel('POST', '/api/abonnements/demandes', clientTok, { typeDemande: 'activer_module_compta' });
    check('tarif à 0 : demande refusée (400)', r.status === 400, `${r.status} ${r.body?.message}`);
    r = await appel('PUT', `/api/abonnements/client/${clientId}/module-compta`, adminTok, { actif: true });
    check('tarif à 0 : activation admin refusée (TARIF_COMPTA_MANQUANT)', r.status === 400 && r.body?.code === 'TARIF_COMPTA_MANQUANT', `${r.status} ${r.body?.code}`);

    for (const [cle, valeur] of [['compta_module_mensuel', 60], ['compta_gerant_client_mensuel', 20]]) {
      r = await appel('PUT', `/api/abonnements/tarifs/${cle}`, adminTok, { valeur });
      check(`tarif ${cle} = ${valeur} (admin)`, r.status === 200, String(r.status));
    }
    r = await appel('GET', '/api/abonnements/module-compta', clientTok);
    check('module proposé au client : 60 DT/mois, inactif', r.status === 200 && r.body?.disponible === true && r.body?.prixModule === 60 && !r.body?.actif, JSON.stringify(r.body));

    // ── Demande du client ──
    r = await appel('POST', '/api/abonnements/demandes', clientTok, { typeDemande: 'activer_module_compta' });
    check('demande d\'activation du client : 201, montant 60', r.status === 201 && Number(r.body?.montantMensuelDt) === 60, `${r.status} ${JSON.stringify(r.body)}`);
    const demandeId = r.body?.id;
    // La notification est enregistrée après la réponse (sans l'attendre, comme les demandes de support) : courte attente.
    let notif = null;
    for (let i = 0; i < 30 && !notif; i++) {
      notif = (await pool.query(`SELECT * FROM notifications WHERE user_id = $1 AND ref_kind = 'demande' AND ref_id = $2`, [adminId, demandeId])).rows[0] || null;
      if (!notif) await new Promise((ok) => setTimeout(ok, 100));
    }
    check('notification enregistrée pour l\'admin (new_demande, type activer_module_compta, sans demande_id)',
      notif?.event_type === 'new_demande' && notif?.type === 'activer_module_compta' && notif?.demande_id == null && notif?.client_nom === 'TEST Client S2c', JSON.stringify(notif));
    r = await appel('POST', '/api/abonnements/demandes', clientTok, { typeDemande: 'activer_module_compta' });
    check('seconde demande : 409', r.status === 409, String(r.status));
    r = await appel('GET', `/api/abonnements/client/${clientId}/module-compta`, adminTok);
    check('carte admin : demande en cours signalée', r.status === 200 && r.body?.demandeEnCours === true, JSON.stringify(r.body));

    // ── Validation = activation ──
    r = await appel('PUT', `/api/abonnements/admin/demandes/${demandeId}`, adminTok, { statut: 'validée' });
    check('validation de la demande : 200', r.status === 200 && r.body?.statut === 'validée', `${r.status} ${r.body?.message || ''}`);
    r = await appel('PUT', `/api/abonnements/admin/demandes/${demandeId}`, adminTok, { statut: 'validée' });
    check('seconde validation : 409 (traitée une seule fois)', r.status === 409, String(r.status));
    const cfg = (await pool.query('SELECT module_compta_actif, module_compta_active_le, nb_gerants_compta FROM abonnement_config WHERE abonnement_id = $1', [abo.id])).rows[0];
    check('module actif, date d\'activation posée, 0 gérant comptable', cfg?.module_compta_actif === true && !!cfg?.module_compta_active_le && cfg?.nb_gerants_compta === 0);
    const esp = (await pool.query(`SELECT * FROM compta.espaces WHERE titulaire_id = $1 AND type = 'client_labflow'`, [clientId])).rows;
    check('comptabilité client_labflow ouverte', esp.length === 1 && esp[0].etat === 'actif', JSON.stringify(esp));
    const acc = (await pool.query('SELECT * FROM compta.acces WHERE espace_id = $1 ORDER BY id', [esp[0]?.id])).rows;
    check('accès titulaire du client + accès obligatoire « à attribuer » sans personne',
      acc.length === 2 && acc[0].personne_id === clientId && acc[0].role === 'titulaire' && acc[0].etat === 'actif'
      && acc[1].personne_id == null && acc[1].obligatoire === true && acc[1].etat === 'a_attribuer' && acc[1].role === 'gerant', JSON.stringify(acc));
    let ev = (await pool.query('SELECT type FROM compta.evenements WHERE espace_id = $1 ORDER BY id', [esp[0]?.id])).rows.map((x) => x.type);
    check('journal : espace_cree, module_active', ev.includes('espace_cree') && ev.includes('module_active'), ev.join(', '));

    // ── Facturation : à partir du mois suivant, à plein tarif ──
    const paiementCourant = (await pool.query('SELECT montant_dt, statut, lignes FROM paiements WHERE abonnement_id = $1 AND mois = $2', [abo.id, moisCourant])).rows[0];
    check('mois d\'activation : mensualité inchangée, sans postes', Number(paiementCourant?.montant_dt) === Number(paiementCourantAvant?.montant_dt) && paiementCourant?.lignes == null,
      `${paiementCourantAvant?.montant_dt} → ${paiementCourant?.montant_dt}`);
    r = await appel('GET', `/api/abonnements/client/${clientId}/montant-mois?mois=${moisCourant.slice(0, 7)}`, adminTok);
    check('écran Paiement, mois d\'activation : pas de module dans le total', r.status === 200 && !r.body?.breakdown?.compta && Number(r.body?.total) === Number(paiementCourantAvant?.montant_dt) || (r.body?.isGratuit && !r.body?.breakdown?.compta), JSON.stringify(r.body?.breakdown?.compta || null));
    r = await appel('GET', `/api/abonnements/client/${clientId}/montant-mois?mois=${suivant.slice(0, 7)}`, adminTok);
    const labflowSuivant = Number(r.body?.breakdown?.mensualite?.base ?? 0) + Number(r.body?.breakdown?.supplementGerant?.effectif ?? 0) + Number(r.body?.breakdown?.supplementLabo?.effectif ?? 0);
    check('écran Paiement, mois suivant : module ajouté (60 DT)', r.status === 200 && r.body?.breakdown?.compta?.postes?.length === 1 && Math.abs(Number(r.body?.total) - (labflowSuivant + 60)) < 0.01,
      `${r.body?.total} = ${labflowSuivant} + 60 ?`);
    // La mensualité du mois suivant, comme la tâche de 01:00 la créera (saisie automatique), puis recalculée par le
    // réglage des gérants comptables (les mensualités saisies par l'admin, elles, ne sont pas recalculées).
    await pool.query(`INSERT INTO paiements (abonnement_id, mois, montant_dt, statut) VALUES ($1, $2, 0, 'en_attente') ON CONFLICT DO NOTHING`, [abo.id, suivant]);

    // ── Gérants comptables ──
    r = await appel('PUT', `/api/abonnements/client/${clientId}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 2 });
    check('gérants comptables : 2 (module 60 + 2 × 20 = 100 DT/mois)', r.status === 200 && r.body?.nbGerants === 2 && r.body?.totalMensuel === 100, JSON.stringify(r.body));
    let ps = (await pool.query('SELECT id, montant_dt, lignes FROM paiements WHERE abonnement_id = $1 AND mois = $2', [abo.id, suivant])).rows[0];
    check('mensualité du mois suivant : Abonnement LabFlow + Module Comptabilité + « Gérants comptables supplémentaires × 2 »',
      ps?.lignes?.map((l) => l.libelle).join(' | ') === 'Abonnement LabFlow | Module Comptabilité | Gérants comptables supplémentaires × 2'
      && ps.lignes[1].montant === 60 && ps.lignes[2].montant === 40 && somme(ps.lignes) === Number(ps.montant_dt)
      && Math.abs(Number(ps.montant_dt) - (labflowSuivant + 100)) < 0.01, JSON.stringify(ps?.lignes));
    r = await appel('GET', `/api/abonnements/client/${clientId}/montant-mois?mois=${suivant.slice(0, 7)}`, adminTok);
    check('écran Paiement, mois suivant = mensualité enregistrée', r.status === 200 && Math.abs(Number(r.body?.total) - Number(ps?.montant_dt)) < 0.01, `${r.body?.total} / ${ps?.montant_dt}`);

    // ── Promotion : la partie Stock / Vente seulement ──
    r = await appel('POST', `/api/abonnements/client/${clientId}/promotions`, adminTok, { type: 'percent_off', appliesTo: 'mensualite', discountMensualite: 50, dateDebut: suivant, monthsDuration: 1 });
    check('promotion −50 % sur le mois suivant (201)', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    ps = (await pool.query('SELECT id, montant_dt, lignes FROM paiements WHERE abonnement_id = $1 AND mois = $2', [abo.id, suivant])).rows[0];
    const lf = ps?.lignes?.[0]?.montant;
    check('−50 % sur la partie Stock / Vente, module et gérants à plein tarif',
      ps?.lignes?.map((l) => l.libelle).join(' | ') === 'Abonnement LabFlow | Remise (promotion) | Module Comptabilité | Gérants comptables supplémentaires × 2'
      && ps.lignes[1].montant === -Math.round(lf / 2 * 100) / 100 && ps.lignes[2].montant === 60 && ps.lignes[3].montant === 40
      && somme(ps.lignes) === Number(ps.montant_dt), JSON.stringify(ps?.lignes));
    r = await appel('GET', `/api/abonnements/client/${clientId}/montant-mois?mois=${suivant.slice(0, 7)}`, adminTok);
    check('écran Paiement avec la promotion = mensualité enregistrée', r.status === 200 && Math.abs(Number(r.body?.total) - Number(ps?.montant_dt)) < 0.01, `${r.body?.total} / ${ps?.montant_dt}`);

    r = await appel('PUT', `/api/abonnements/client/${clientId}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 99 });
    check('gérants comptables invalides : 400', r.status === 400, String(r.status));
    r = await appel('PUT', `/api/abonnements/client/${clientId}/module-compta`, adminTok, {});
    const sansActif = r.status;
    r = await appel('PUT', `/api/abonnements/client/${clientId}/module-compta`, adminTok, { actif: 'true' });
    check('corps sans « actif » booléen : 400 (jamais une désactivation par défaut)', sansActif === 400 && r.status === 400, `${sansActif} ${r.status}`);
    r = await appel('PUT', `/api/abonnements/client/${clientId}/module-compta`, adminTok, { actif: true });
    check('{ actif: true } sans nombre de gérants : les 2 gérants comptables sont gardés', r.status === 200 && r.body?.nbGerants === 2, JSON.stringify(r.body?.nbGerants));
    r = await appel('GET', '/api/abonnements/client/abc/module-compta', adminTok);
    check('identifiant de client invalide : 404 (pas d\'erreur serveur)', r.status === 404, String(r.status));
    const cfg2 = (await pool.query('SELECT module_compta_active_le FROM abonnement_config WHERE abonnement_id = $1', [abo.id])).rows[0];
    check('date d\'activation inchangée par le réglage des gérants', String(cfg2?.module_compta_active_le) === String(cfg?.module_compta_active_le));

    // ── Vu par le client ──
    r = await appel('GET', '/api/abonnements/mon-abonnement', clientTok);
    check('« Mon abonnement » : postes du module dans la tarification', r.status === 200 && r.body?.pricing?.compta?.postes?.length === 2, JSON.stringify(r.body?.pricing?.compta));
    // Mois d'activation couvert par le « 1er mois offert » du client : le prix affiché pour ce mois ne compte pas le
    // module (facturé à partir du mois suivant) — il égale la mensualité du mois.
    check('« Mon abonnement », promotion du mois en cours : prix effectif = mensualité du mois (module pas encore facturé)',
      !r.body?.pricing?.activePromoMensuel || Number(r.body.pricing.effectifMensuel) === Number(paiementCourantAvant?.montant_dt),
      `${r.body?.pricing?.effectifMensuel} / ${paiementCourantAvant?.montant_dt}`);
    r = await appel('GET', '/api/compta/acces', clientTok);
    check('LabFlow Compta, accueil : « Ma comptabilité » (lien /ma-comptabilite)',
      r.status === 200 && r.body?.maComptabilite?.length === 1 && r.body.maComptabilite[0].lien === '/ma-comptabilite' && !r.body.cabinets.length, JSON.stringify(r.body));
    r = await appel('GET', '/api/compta/ma-comptabilite', clientTok);
    check('« Ma comptabilité » : module actif, 2 gérants comptables, comptable « à attribuer »',
      r.status === 200 && r.body?.module?.actif === true && r.body?.module?.nbGerants === 2 && r.body?.module?.factureAPartirDe === suivant
      && r.body?.comptables?.length === 1 && r.body.comptables[0].obligatoire === true && r.body.comptables[0].etat === 'a_attribuer', JSON.stringify(r.body));
    r = await appel('GET', '/api/compta/ma-comptabilite', adminTok);
    check('« Ma comptabilité » d\'une personne sans comptabilité : 404', r.status === 404, String(r.status));
    r = await appel('GET', `/api/abonnements/client/${clientId}/module-compta`, clientTok);
    check('route admin du module refusée au client', r.status === 403, String(r.status));

    // ── Facture à N lignes (mois suivant réglé, comme l'écran : montant envoyé) ──
    r = await appel('POST', `/api/abonnements/client/${clientId}/paiements`, adminTok, { mois: suivant, statut: 'payé', montant: Number(ps.montant_dt) });
    check('mensualité du mois suivant réglée (montant de l\'écran), postes gardés', r.status === 200 && (await pool.query('SELECT lignes FROM paiements WHERE id = $1', [ps.id])).rows[0].lignes?.length === 4, String(r.status));
    r = await appel('GET', `/api/abonnements/paiements/${ps.id}/facture`, adminTok);
    const texte = Buffer.isBuffer(r.body) ? textePdf(r.body) : '';
    check('facture : abonnement LabFlow, remise, module, gérants comptables ; sous-titre LabFlow',
      /Abonnement LabFlow/.test(texte) && /Remise \(promotion\)/.test(texte) && /Module Comptabilit/.test(texte) && /Gérants comptables supplémentaires × 2/.test(texte) && !/LabFlow Compta — abonnement mensuel/.test(texte),
      texte.slice(0, 300).replace(/\n/g, ' | '));

    // ── Désactivation, réactivation ──
    r = await appel('PUT', `/api/abonnements/client/${clientId}/module-compta`, adminTok, { actif: false });
    check('désactivation : module inactif, 0 gérant', r.status === 200 && r.body?.actif === false && r.body?.nbGerants === 0 && r.body?.espace?.etat === 'ferme', JSON.stringify(r.body));
    const cfgD = (await pool.query('SELECT module_compta_active_le, module_compta_desactive_le, nb_gerants_compta FROM abonnement_config WHERE abonnement_id = $1', [abo.id])).rows[0];
    check('désactivation datée : date d\'activation gardée, date de désactivation posée, gérants gardés',
      String(cfgD?.module_compta_active_le) === String(cfg?.module_compta_active_le) && !!cfgD?.module_compta_desactive_le && cfgD?.nb_gerants_compta === 2, JSON.stringify(cfgD));
    const paye = (await pool.query('SELECT lignes FROM paiements WHERE id = $1', [ps.id])).rows[0];
    check('la mensualité réglée garde ses 4 postes', paye?.lignes?.length === 4);
    r = await appel('GET', '/api/compta/acces', clientTok);
    check('comptabilité fermée : absente de l\'accueil de LabFlow Compta', r.status === 200 && r.body?.maComptabilite?.length === 0, JSON.stringify(r.body));
    r = await appel('GET', '/api/compta/ma-comptabilite', clientTok);
    check('« Ma comptabilité » fermée : 404', r.status === 404, String(r.status));
    r = await appel('POST', '/api/abonnements/demandes', clientTok, { typeDemande: 'activer_module_compta' });
    const demande2 = r.body?.id;
    check('module désactivé : le client peut le redemander (201)', r.status === 201, String(r.status));
    r = await appel('PUT', `/api/abonnements/client/${clientId}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 1 });
    const d2 = (await pool.query('SELECT statut, traite_par FROM demandes WHERE id = $1', [demande2])).rows[0];
    check('réactivation directe par l\'admin : la demande en attente est validée du même coup', d2?.statut === 'validée' && d2?.traite_par === adminId, JSON.stringify(d2));
    const esp2 = (await pool.query(`SELECT id, etat FROM compta.espaces WHERE titulaire_id = $1 AND type = 'client_labflow'`, [clientId])).rows;
    const acc2 = (await pool.query('SELECT COUNT(*)::int AS n FROM compta.acces WHERE espace_id = $1', [esp2[0]?.id])).rows[0];
    check('réactivation : la même comptabilité rouverte, mêmes accès', r.status === 200 && esp2.length === 1 && esp2[0].id === esp[0].id && esp2[0].etat === 'actif' && acc2.n === 2, JSON.stringify({ esp2, acc2 }));
    const cfgR = (await pool.query('SELECT module_compta_active_le, module_compta_desactive_le FROM abonnement_config WHERE abonnement_id = $1', [abo.id])).rows[0];
    check('réactivation dans le mois de la désactivation : la période continue (date d\'activation gardée, facturé à partir du mois suivant)',
      String(cfgR?.module_compta_active_le) === String(cfg?.module_compta_active_le) && cfgR?.module_compta_desactive_le == null && r.body?.factureAPartirDe === suivant, JSON.stringify({ cfgR, f: r.body?.factureAPartirDe }));

    // Module actif depuis deux mois, désactivé aujourd'hui : le mois en cours reste dû (sa mensualité contenait le
    // module), les suivants non.
    await pool.query(`UPDATE abonnement_config SET module_compta_active_le = NOW() - interval '2 months' WHERE abonnement_id = $1`, [abo.id]);
    r = await appel('PUT', `/api/abonnements/client/${clientId}/module-compta`, adminTok, { actif: false });
    const moisEnCours = await appel('GET', `/api/abonnements/client/${clientId}/montant-mois?mois=${moisCourant.slice(0, 7)}`, adminTok);
    const moisApres = await appel('GET', `/api/abonnements/client/${clientId}/montant-mois?mois=${suivant.slice(0, 7)}`, adminTok);
    check('désactivation en cours de mois : le mois de la désactivation compte encore le module, le suivant non',
      r.status === 200 && (moisEnCours.body?.breakdown?.compta?.postes?.length ?? 0) === 2 && !moisApres.body?.breakdown?.compta,
      `${JSON.stringify(moisEnCours.body?.breakdown?.compta)} / ${JSON.stringify(moisApres.body?.breakdown?.compta || null)}`);

    // ── Mois offert avec le module dû (tâche de nuit) : le « 1er mois offert » du client couvre le mois en cours, où le
    // module est encore dû (période de facturation ci-dessus) ──
    await pool.query('DELETE FROM paiements WHERE abonnement_id = $1 AND mois = $2', [abo.id, moisCourant]);
    r = await appel('POST', '/api/abonnements/admin/sync-promo-statuts', adminTok);
    let po = (await pool.query('SELECT id, montant_dt, statut, lignes FROM paiements WHERE abonnement_id = $1 AND mois = $2', [abo.id, moisCourant])).rows[0];
    check('tâche des mois offerts : mois créé avec le module seul dû (80 DT, en attente), la partie Stock / Vente offerte',
      r.status === 200 && Number(po?.montant_dt) === 80 && po?.statut === 'en_attente' && somme(po?.lignes) === 80
      && po.lignes.map((l) => l.libelle).join(' | ') === 'Abonnement LabFlow | Remise (promotion) | Module Comptabilité | Gérant comptable supplémentaire × 1', JSON.stringify(po));
    await pool.query(`UPDATE paiements SET statut = 'impayé' WHERE id = $1`, [po?.id]);
    await appel('POST', '/api/abonnements/admin/sync-promo-statuts', adminTok);
    po = (await pool.query('SELECT montant_dt, statut, lignes FROM paiements WHERE id = $1', [po?.id])).rows[0];
    check('tâche des mois offerts : un « impayé » du module n\'est ni réécrit ni remis à 0', po?.statut === 'impayé' && Number(po?.montant_dt) === 80 && po?.lignes?.length === 4, JSON.stringify(po));
    ev = (await pool.query('SELECT type FROM compta.evenements WHERE espace_id = $1 ORDER BY id', [esp[0]?.id])).rows.map((x) => x.type);
    check('journal : module_gerants, module_desactive, espace_ferme, espace_rouvert', ['module_gerants', 'module_desactive', 'espace_ferme', 'espace_rouvert'].every((t) => ev.includes(t)), ev.join(', '));

    // ── Suppression du client ──
    r = await appel('DELETE', `/admin/clients/${clientId}`, adminTok);
    check('suppression du client : 204 (comptabilité sans dossier retirée avant)', r.status === 204, `${r.status} ${r.body?.message || ''}`);
    const reste = (await pool.query(`SELECT (SELECT COUNT(*) FROM compta.espaces WHERE titulaire_id = $1)::int AS e, (SELECT COUNT(*) FROM utilisateurs WHERE id = $1)::int AS u`, [clientId])).rows[0];
    check('compte et comptabilité retirés', reste.e === 0 && reste.u === 0, JSON.stringify(reste));
    const journal = (await pool.query(`SELECT type, espace_id FROM compta.evenements WHERE (details->>'titulaire')::int = $1 ORDER BY id`, [clientId])).rows;
    check('le journal reste (… espace_supprime, espace vidé)', journal.some((j) => j.type === 'espace_supprime') && journal.every((j) => j.espace_id == null), JSON.stringify(journal.map((j) => j.type)));
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
