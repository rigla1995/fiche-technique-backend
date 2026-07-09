/* Test E2E local de la tarification en formules (backend démarré sur :3000).
 * Basique/Premium + paliers acheteurs + gating Espace Produit + demande d'upgrade.
 * Restaure la config du compte client 38 à la fin. */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const pool = require('../src/config/database');

const BASE = 'http://localhost:3000';
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};
const approx = (a, b, eps = 0.01) => Math.abs(Number(a) - Number(b)) <= eps;

(async () => {
  const hash = bcrypt.hashSync('TestFormules2026!', 10);
  const wipe = async () => {
    await pool.query(`DELETE FROM utilisateurs WHERE email IN ('test-formules-client@example.com', 'test-admin-formules@example.com')`);
  };
  await wipe();

  // ── Super admin temporaire + login client 38
  await pool.query(
    `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminF', 'test-admin-formules@example.com', $1, 'super_admin', true)`,
    [hash]
  );
  let r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'test-admin-formules@example.com', password: 'TestFormules2026!' }),
  });
  const HA = { 'Content-Type': 'application/json', Authorization: `Bearer ${(await r.json()).token}` };
  r = await fetch(`${BASE}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'm.khelil.prof@gmail.com', password: 'TestDash2026!' }),
  });
  const cliLogin = await r.json();
  const HC = { 'Content-Type': 'application/json', Authorization: `Bearer ${cliLogin.token}` };
  const clientId = cliLogin.user.id;
  check('logins admin + client', !!HA.Authorization && !!HC.Authorization);

  // Sauvegarde de la config du client 38 (restaurée à la fin)
  const cfgBackup = (await pool.query(
    `SELECT ac.* FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id WHERE a.client_id = $1`,
    [clientId]
  )).rows[0];
  check('config client 38 sauvegardée', !!cfgBackup);

  // ── 1. Clés tarifaires seedées / purgées (migration 164)
  r = await fetch(`${BASE}/api/abonnements/tarifs`, { headers: HA });
  const tarifs = await r.json();
  check('clé premium héritée du prix actuel (200)', approx(tarifs.prix_base_activite_premium?.valeur, 200), String(tarifs.prix_base_activite_premium?.valeur));
  check('clé basique seedée (150)', approx(tarifs.prix_base_activite_basique?.valeur, 150));
  check('4 paliers acheteurs seedés', ['10', '20', '50', '100'].every(p => tarifs[`acheteurs_palier_${p}`] != null),
    JSON.stringify([10, 20, 50, 100].map(p => tarifs[`acheteurs_palier_${p}`]?.valeur)));
  check('clés legacy purgées (module_vente, entreprise_*)', tarifs.module_vente == null && tarifs.entreprise_mensuel == null && tarifs.entreprise_onboarding == null);

  // Grille dynamique (les valeurs locales peuvent différer des seeds)
  const T = (cle, def) => parseFloat(tarifs[cle]?.valeur ?? def);
  const pB = T('prix_base_activite_basique', 150), pP = T('prix_base_activite_premium', 200);
  const rl = T('remise_avec_labo', 30) / 100, r2 = T('remise_2eme_sans_labo', 20) / 100, r3 = T('remise_3eme_plus_sans_labo', 40) / 100;
  const pLabo = T('labo_sup_mensuel', 160), pGer = T('gerant_sup_mensuel', 80), p20 = T('acheteurs_palier_20', 90), p50 = T('acheteurs_palier_50', 150);
  const r2d = (v) => Math.round(v * 100) / 100;
  const basique2LaboTotal = r2d(2 * pB * (1 - rl) + pLabo + pGer + p20);
  const premium2LaboTotal = r2d(2 * pP * (1 - rl) + pLabo + pGer + p20);
  const premium2LaboSansAch = r2d(2 * pP * (1 - rl) + pLabo + pGer);

  // ── 2. Pricing preview par formule + palier
  // Premium 3 activités sans labo : base + base(1-r2) + base(1-r3)
  const deg3 = (base) => r2d(base + base * (1 - r2) + base * (1 - r3));
  r = await fetch(`${BASE}/api/abonnements/pricing-preview?nbActivites=3&nbLabos=0&nbGerants=0&formuleActivites=premium`, { headers: HA });
  let body = await r.json();
  check(`preview premium 3 act. sans labo = ${deg3(pP)}`, approx(body.totalMensuel, deg3(pP)), String(body.totalMensuel));
  r = await fetch(`${BASE}/api/abonnements/pricing-preview?nbActivites=3&nbLabos=0&nbGerants=0&formuleActivites=basique`, { headers: HA });
  body = await r.json();
  check(`preview basique 3 act. sans labo = ${deg3(pB)}`, approx(body.totalMensuel, deg3(pB)), String(body.totalMensuel));
  check('preview expose la formule', body.formuleActivites === 'basique');
  // Basique 2 act. + 1 labo (remise avec labo conservée) + palier 20 + 1 gérant
  r = await fetch(`${BASE}/api/abonnements/pricing-preview?nbActivites=2&nbLabos=1&nbGerants=1&nbAcheteurs=20&formuleActivites=basique`, { headers: HA });
  body = await r.json();
  check(`preview basique 2 act. + labo + gérant + palier 20 = ${basique2LaboTotal}`, approx(body.totalMensuel, basique2LaboTotal), String(body.totalMensuel));
  check('preview ligne acheteurs (palier 20)', body.acheteurs?.palier === 20 && approx(body.acheteurs?.total, p20), JSON.stringify(body.acheteurs));
  // Palier couvrant : 35 acheteurs → palier 50
  r = await fetch(`${BASE}/api/abonnements/pricing-preview?nbActivites=1&nbLabos=1&nbAcheteurs=35&formuleActivites=premium`, { headers: HA });
  body = await r.json();
  check('35 acheteurs → palier 50', body.acheteurs?.palier === 50 && approx(body.acheteurs?.total, p50), JSON.stringify(body.acheteurs));

  // ── 3. Création client avec formule + palier
  r = await fetch(`${BASE}/admin/clients`, {
    method: 'POST', headers: HA,
    body: JSON.stringify({
      nom: 'TEST-Formules Sarl', email: 'test-formules-client@example.com',
      nbActivites: 2, nbLabos: 1, nbGerants: 1, nbAcheteurs: 20,
      formuleActivites: 'basique', montantOnboarding: 700,
    }),
  });
  body = await r.json();
  check('création client basique + palier 20 (201)', r.status === 201, JSON.stringify(body).slice(0, 120));
  const newClientId = body.id;
  const cfgNew = (await pool.query(
    `SELECT ac.*, pe.module_acheteurs_actif FROM abonnement_config ac
     JOIN abonnements a ON a.id = ac.abonnement_id
     LEFT JOIN profil_entreprise pe ON pe.client_id = a.client_id
     WHERE a.client_id = $1`, [newClientId]
  )).rows[0];
  check('config persistée (basique, 20 acheteurs)', cfgNew?.formule_activites === 'basique' && Number(cfgNew?.nb_acheteurs) === 20, JSON.stringify({ f: cfgNew?.formule_activites, n: cfgNew?.nb_acheteurs }));
  check('module acheteurs activé à la création', cfgNew?.module_acheteurs_actif === true);
  const paie = (await pool.query(
    `SELECT montant_dt FROM paiements p JOIN abonnements a ON a.id = p.abonnement_id WHERE a.client_id = $1`, [newClientId]
  )).rows[0];
  check(`1er paiement du mois = ${basique2LaboTotal} (formule + palier facturés)`, approx(paie?.montant_dt, basique2LaboTotal), String(paie?.montant_dt));

  // Validations de création
  r = await fetch(`${BASE}/admin/clients`, {
    method: 'POST', headers: HA,
    body: JSON.stringify({ nom: 'X', email: 'x-formules@example.com', nbActivites: 1, nbLabos: 0, nbAcheteurs: 10 }),
  });
  check('acheteurs sans labo refusé 400', r.status === 400);
  r = await fetch(`${BASE}/admin/clients`, {
    method: 'POST', headers: HA,
    body: JSON.stringify({ nom: 'X', email: 'x-formules@example.com', nbActivites: 1, nbLabos: 1, nbAcheteurs: 150 }),
  });
  check('quota > 100 refusé 400', r.status === 400);

  // ── 4. withPricing : breakdown formule + acheteurs
  r = await fetch(`${BASE}/api/abonnements/client/${newClientId}?withPricing=1`, { headers: HA });
  body = await r.json();
  const bd = body.pricing?.configBreakdown;
  check('breakdown : formule basique + palier 20', bd?.formuleActivites === 'basique' && bd?.acheteurs?.palier === 20 && approx(bd?.acheteurs?.total, p20), JSON.stringify(bd?.acheteurs));
  check(`baseMensuel withPricing = ${basique2LaboTotal}`, approx(body.pricing?.baseMensuel, basique2LaboTotal), String(body.pricing?.baseMensuel));

  // ── 5. montant-mois : composante acheteurs
  const mois = new Date().toISOString().slice(0, 7);
  r = await fetch(`${BASE}/api/abonnements/client/${newClientId}/montant-mois?mois=${mois}`, { headers: HA });
  body = await r.json();
  check(`montant-mois : optionAcheteurs ${p20} + total ${basique2LaboTotal}`, approx(body.breakdown?.optionAcheteurs?.base, p20) && approx(body.total, basique2LaboTotal),
    JSON.stringify({ a: body.breakdown?.optionAcheteurs, t: body.total, s: body.message }));

  // ── 6. Changement de formule (update config) : basique → premium
  r = await fetch(`${BASE}/api/abonnements/client/${newClientId}/config`, {
    method: 'PUT', headers: HA,
    body: JSON.stringify({ nbActivites: 2, nbLabos: 1, nbGerants: 1, montantOnboarding: 700, formuleActivites: 'premium' }),
  });
  body = await r.json();
  check('passage premium (config)', r.status === 200 && body.formuleActivites === 'premium' && body.nbAcheteurs === 20, JSON.stringify({ f: body.formuleActivites, n: body.nbAcheteurs }));
  r = await fetch(`${BASE}/api/abonnements/client/${newClientId}?withPricing=1`, { headers: HA });
  body = await r.json();
  check(`nouveau mensuel premium = ${premium2LaboTotal}`, approx(body.pricing?.baseMensuel, premium2LaboTotal), String(body.pricing?.baseMensuel));

  // ── 7. Désactivation module acheteurs → quota 0 → facturation stoppée
  r = await fetch(`${BASE}/api/abonnements/client/${newClientId}/module-acheteurs`, {
    method: 'PUT', headers: HA, body: JSON.stringify({ actif: false }),
  });
  body = await r.json();
  check('désactivation → quota remis à 0', body.moduleAcheteursActif === false && body.nbAcheteurs === 0, JSON.stringify(body));
  r = await fetch(`${BASE}/api/abonnements/client/${newClientId}?withPricing=1`, { headers: HA });
  body = await r.json();
  check(`mensuel sans option acheteurs = ${premium2LaboSansAch}`, approx(body.pricing?.baseMensuel, premium2LaboSansAch), String(body.pricing?.baseMensuel));

  // ── 8. Gating Espace Produit (formule basique) sur le client 38
  r = await fetch(`${BASE}/api/abonnements/client/${clientId}/config`, {
    method: 'PUT', headers: HA,
    body: JSON.stringify({
      nbActivites: cfgBackup.nb_activites, nbLabos: cfgBackup.nb_labos, nbGerants: cfgBackup.nb_gerants,
      montantOnboarding: cfgBackup.montant_onboarding, formuleActivites: 'basique',
    }),
  });
  check('client 38 passé en basique', r.status === 200);
  r = await fetch(`${BASE}/api/entreprise`, { headers: HC });
  body = await r.json();
  check('/api/entreprise expose formule basique', body?.formule_activites === 'basique', String(body?.formule_activites));
  r = await fetch(`${BASE}/api/produits`, { method: 'POST', headers: HC, body: JSON.stringify({}) });
  body = await r.json();
  check('write produit en basique → 403 FORMULE_BASIQUE', r.status === 403 && body.code === 'FORMULE_BASIQUE', `${r.status} ${body.code}`);
  r = await fetch(`${BASE}/api/produits`, { headers: HC });
  check('lecture produits reste ouverte en basique (200)', r.status === 200);

  // ── 9. Demande de passage en Premium (client) + validation admin
  r = await fetch(`${BASE}/api/abonnements/demandes`, {
    method: 'POST', headers: HC, body: JSON.stringify({ typeDemande: 'passer_formule_premium' }),
  });
  body = await r.json();
  check('demande passer_formule_premium créée', r.status === 201, JSON.stringify(body).slice(0, 100));
  const demandeId = body.id;
  r = await fetch(`${BASE}/api/abonnements/admin/demandes/${demandeId}`, {
    method: 'PUT', headers: HA, body: JSON.stringify({ statut: 'validée' }),
  });
  check('validation admin de la demande', r.status === 200);
  const cfg38 = (await pool.query(
    `SELECT ac.formule_activites FROM abonnement_config ac JOIN abonnements a ON a.id = ac.abonnement_id WHERE a.client_id = $1`,
    [clientId]
  )).rows[0];
  check('client 38 repassé premium par la demande', cfg38?.formule_activites === 'premium', String(cfg38?.formule_activites));
  r = await fetch(`${BASE}/api/produits`, { method: 'POST', headers: HC, body: JSON.stringify({}) });
  check('write produit en premium → 400 (validation, plus de 403)', r.status === 400, String(r.status));

  // ── Restauration + nettoyage
  await pool.query(
    `UPDATE abonnement_config SET nb_activites=$1, nb_labos=$2, nb_gerants=$3, nb_acheteurs=$4, formule_activites=$5, montant_onboarding=$6
     WHERE abonnement_id = (SELECT id FROM abonnements WHERE client_id = $7)`,
    [cfgBackup.nb_activites, cfgBackup.nb_labos, cfgBackup.nb_gerants, cfgBackup.nb_acheteurs,
     cfgBackup.formule_activites || 'premium', cfgBackup.montant_onboarding, clientId]
  );
  await pool.query(`DELETE FROM demandes WHERE demandeur_id = $1 AND type_demande = 'passer_formule_premium'`, [clientId]);
  await wipe();

  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} tests OK${failed.length ? ' — ÉCHECS : ' + failed.map((f) => f.name).join(', ') : ''}`);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error('ERREUR FATALE', e); process.exit(1); });
