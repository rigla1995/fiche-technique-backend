/* Test E2E local — module « Livreurs », étape L4 « suivi des livraisons » (labflow-reprise/livreurs/PLAN-LIVREURS.md).
 *   GET /api/livreurs/livraisons : lignes (passages, du plus récent au plus ancien, champs complets), bilan (total, livrées,
 *     non livrées, taux d'échec, délai moyen, encaissé, par livreur, motifs), filtres from / to / livreurId / resultat /
 *     acheteurId (invalides ignorés), périmètre du gérant (labos) ;
 *   tableau de bord v2, onglet Acheteurs : bloc livraisons de la période (+ état livraison_echouee dans par_statut) ;
 *   manuel : fiche « livreurs-suivi », renvoi depuis « livreurs » ; migration 255 rejouable.
 * Crée un super_admin, un client (2 labos, option Acheteurs, 1 gérant sur le labo B), 2 livreurs, 1 acheteur, 4 ventes
 * livrées ou non par les livreurs, puis nettoie. Données fictives. ⚠️ Backend de test : « node scripts/start-test-backend.js ». */
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
const envoyer = async (chemin, jeton, champs = {}, fichiers = []) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(champs)) if (v != null) fd.append(k, String(v));
  for (const f of fichiers) fd.append(f.nom, new Blob([f.octets], { type: f.type }), f.fichier);
  const r = await fetch(`${BASE}${chemin}`, { method: 'POST', headers: jeton ? { Authorization: `Bearer ${jeton}` } : {}, body: fd });
  let body = null;
  try { body = await r.json(); } catch (_) { /* corps vide */ }
  return { status: r.status, body };
};
const login = async (identifiant, mdp = MDP) => appel('POST', '/auth/login', null, { email: identifiant, password: mdp });
const jour = (decalage = 0) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + decalage); return d.toISOString().slice(0, 10); };
const aujourdhui = jour(0);
const rejouer = async (nom) => {
  try { await pool.query(fs.readFileSync(path.join(__dirname, '..', 'migrations', nom), 'utf8')); return true; } catch (e) { console.error(e.message); return false; }
};
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]), Buffer.alloc(300, 0x22), Buffer.from([0xff, 0xd9])]);
const egal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-l4@example.com';
  const CLIENT = 'test-l4-client@example.com';
  const GERANT = 'test-l4-gerant@example.com';
  const ACHETEUR = 'test-l4-acheteur@example.com';
  const TELS = ['22345678', '98765432'];
  let adminTok = null;
  let clientId = null;
  const wipe = async () => {
    if (adminTok && clientId) await appel('DELETE', `/admin/clients/${clientId}`, adminTok);
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [[ADMIN, CLIENT, GERANT, ACHETEUR, ...TELS.map((t) => `livreur-${t}@livreurs.labflow.local`)]])).rows.map((r) => r.id);
    const livIds = (await pool.query('SELECT user_id FROM livreurs WHERE telephone_norm = ANY($1)', [TELS])).rows.map((r) => r.user_id);
    const tous = [...new Set([...ids, ...livIds])];
    if (tous.length) {
      await pool.query('DELETE FROM notifications WHERE user_id = ANY($1)', [tous]);
      await pool.query('DELETE FROM profil_entreprise WHERE client_id = ANY($1)', [tous]);
      await pool.query('DELETE FROM utilisateurs WHERE id = ANY($1)', [tous]);
    }
  };
  const activer = async (email) => {
    const u = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = $1', [email])).rows[0];
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, u.id]);
    return { id: u.id, tok: (await login(email)).body?.token };
  };

  try {
    // ── 0. Repartir propre ──
    const restes = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [[ADMIN, CLIENT, GERANT, ACHETEUR]])).rows;
    if (restes.length) {
      await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at) VALUES ('TEST Admin L4', $1, $2, 'super_admin', true, 0, NOW()) ON CONFLICT DO NOTHING`, [ADMIN, hash]);
      adminTok = (await login(ADMIN)).body?.token;
      const c = (await pool.query(`SELECT id FROM utilisateurs WHERE LOWER(email) = $1 AND role = 'client'`, [CLIENT])).rows[0];
      if (c) await appel('DELETE', `/admin/clients/${c.id}`, adminTok);
      await wipe();
      adminTok = null;
    } else {
      await wipe();
    }
    await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at) VALUES ('TEST Admin L4', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);
    check('migration 255 rejouable', await rejouer('255_livreurs_suivi.sql'));

    // ── Client : 2 labos, 1 gérant (labo B), article en stock au labo A, offre, 2 livreurs, acheteur, encaissement actif ──
    let r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST L4 Traiteur', email: CLIENT, telephone: '20 555 921', nbActivites: 1, nbLabos: 2, nbGerants: 1, nbAcheteurs: 20, montantOnboarding: 0 });
    check('client créé (2 labos, option Acheteurs, 1 gérant)', r.status === 201, `${r.status} ${JSON.stringify(r.body)}`);
    const cli = await activer(CLIENT);
    clientId = cli.id;
    const tok = cli.tok;
    r = await appel('GET', '/api/unites', tok);
    let kg = (r.body || []).find((u) => (u.name || u.nom) === 'kg');
    if (!kg) kg = (await appel('POST', '/api/unites', tok, { name: 'kg' })).body;
    const fam = (await appel('POST', '/api/familles', tok, { name: 'Famille L4', consommable: true, vendable: true })).body;
    const cat = (await appel('POST', '/api/categories', tok, { name: 'Catégorie L4', familleId: fam?.id })).body;
    const art = (await appel('POST', '/api/articles', tok, { name: 'Semoule L4', unitId: kg?.id, categorieId: cat?.id })).body;
    await appel('PUT', `/api/articles/${art?.id}`, tok, { name: 'Semoule L4', unitId: kg?.id, categorieId: cat?.id, commandable: true });
    const laboA = (await appel('POST', '/api/labo', tok, { nom: 'Dépôt A', refLabo: 'DLA' })).body;
    const laboB = (await appel('POST', '/api/labo', tok, { nom: 'Dépôt B', refLabo: 'DLB' })).body;
    await appel('POST', `/api/labo/${laboA?.id}/ingredients/${art?.id}/select`, tok, {});
    r = await appel('PUT', `/api/labo/${laboA?.id}/stock/${art?.id}`, tok, { quantite: 500, prixUnitaire: 1.8, tauxTva: 7, dateAppro: aujourdhui });
    const offre = await appel('POST', '/api/acheteurs/offres', tok, { articleType: 'ingredient', articleId: art?.id, prixUnitaireHt: 2.4, tauxTva: 7, actif: true });
    const livA = (await appel('POST', '/api/livreurs', tok, { nom: 'Livreur A', telephone: TELS[0] })).body;
    const livB = (await appel('POST', '/api/livreurs', tok, { nom: 'Livreur B', telephone: TELS[1] })).body;
    const rOpt = await appel('PUT', '/api/livreurs/options', tok, { encaissement: true });
    r = await appel('POST', '/api/acheteurs', tok, { acheteurs: [{ type: 'b2c', nom: 'Leïla Fictive', telephone: '20 555 922', adresse: '12 avenue des Tests, La Marsa', email: ACHETEUR }] });
    const ach = r.body?.acheteurs?.[0];
    r = await appel('POST', '/api/abonnements/gerants', tok, { nom: 'Gérant B', telephone: '20 555 923', email: GERANT, laboIds: [laboB.id], accesAcheteurs: true });
    const ger = await activer(GERANT);
    check('préparation : labos, stock, offre, 2 livreurs, encaissement actif, acheteur, gérant du labo B', offre.status === 200 && !!livA?.id && !!livB?.id && rOpt.status === 200 && !!ach?.id && r.status === 201 && !!ger.tok, `${offre.status} ${rOpt.status} ${r.status}`);
    const tokA = (await login(TELS[0], livA.motDePasseInitial)).body?.token;
    const tokB = (await login(TELS[1], livB.motDePasseInitial)).body?.token;
    const especes = (await appel('GET', '/api/livreur/moi', tokA)).body?.modesPaiement?.find((m) => m.code === 'especes');
    const vendre = async (livreurId) => (await appel('POST', '/api/acheteurs/ventes', tok, { acheteurId: ach.id, laboId: laboA.id, dateCommande: aujourdhui, dateExpedition: aujourdhui, lignes: [{ articleType: 'ingredient', articleId: art.id, quantite: 2 }], livreurId })).body?.commande?.id;
    const photo = [{ nom: 'facture', octets: JPEG, type: 'image/jpeg', fichier: 'facture.jpg' }];

    // ── 1. Quatre passages : A livre deux fois (10 DT en espèces, puis rien), B échoue deux fois (absent rapporté, refus non rapporté puis annulée) ──
    const cmd1 = await vendre(livA.id);
    const cmd2 = await vendre(livA.id);
    const cmd3 = await vendre(livB.id);
    const cmd4 = await vendre(livB.id);
    const p1 = await envoyer(`/api/livreur/commandes/${cmd1}/livree`, tokA, { receptionnaire: 'Mme Fictive', montantPercu: '10', modePaiementId: String(especes?.id) }, photo);
    const p2 = await envoyer(`/api/livreur/commandes/${cmd2}/livree`, tokA, { montantPercu: '0' }, photo);
    const p3 = await appel('POST', `/api/livreur/commandes/${cmd3}/echec`, tokB, { motif: 'absent', note: 'Personne au local', rapporteeDepot: true });
    const p4 = await appel('POST', `/api/livreur/commandes/${cmd4}/echec`, tokB, { motif: 'refus', note: 'Le client refuse la commande', rapporteeDepot: false });
    const p5 = await appel('POST', `/api/acheteurs/commandes/${cmd4}/annuler`, tok, { motif: 'Refus (test)' });
    check('préparation : 2 livraisons validées, 2 échecs, dernière commande annulée', [p1, p2, p3, p4, p5].every((p) => p.status === 200), [p1, p2, p3, p4, p5].map((p) => p.status).join(' '));

    // ── 2. Suivi : lignes et bilan ──
    r = await appel('GET', '/api/livreurs/livraisons', tok);
    const s = r.body?.stats;
    const lignes = r.body?.lignes || [];
    const l4 = lignes.find((x) => x.commandeId === cmd4);
    const l1 = lignes.find((x) => x.commandeId === cmd1);
    check('GET /api/livreurs/livraisons : 4 passages du plus récent au plus ancien ; bilan total 4, livrées 2, non livrées 2, taux 50 %, délai moyen 0 j, encaissé 10,000',
      r.status === 200 && lignes.length === 4 && lignes[0].commandeId === cmd4 && lignes[3].commandeId === cmd1
      && s?.total === 4 && s.livrees === 2 && s.echecs === 2 && s.tauxEchecPct === 50 && s.delaiMoyenJours === 0 && s.encaisse === 10,
      `${r.status} ${JSON.stringify(s)}`);
    check('lignes : livraison validée (facture signée, réceptionnaire, 10 DT Espèces, délai 0, facture FA-, montant TTC) ; échec (motif « Refus du client », note, non rapportée, commande annulée)',
      l1?.resultat === 'livree' && l1.factureSignee === true && l1.receptionnaire === 'Mme Fictive' && l1.montantPercu === 10 && l1.modePaiement === 'Espèces' && l1.delaiJours === 0 && /^FA-/.test(l1.factureNumero || '') && l1.montantTtc > 0 && l1.livreurNom === 'Livreur A' && l1.acheteurNom === 'Leïla Fictive' && l1.laboNom === 'Dépôt A'
      && l4?.resultat === 'echec' && l4.motifLibelle === 'Refus du client' && /refuse/.test(l4.note || '') && l4.rapporteeDepot === false && l4.commandeStatut === 'annulee' && l4.factureSignee === false && l4.delaiJours === null,
      `${JSON.stringify(l1)} / ${JSON.stringify(l4)}`);
    const pA = s?.parLivreur?.find((x) => x.livreurNom === 'Livreur A');
    const pB = s?.parLivreur?.find((x) => x.livreurNom === 'Livreur B');
    check('par livreur : A 2 livrées / 0 échec / 0 % / délai 0 / 10,000 ; B 0 / 2 / 100 % / délai — ; motifs : absent 1, refus 1',
      pA?.total === 2 && pA.livrees === 2 && pA.echecs === 0 && pA.tauxEchecPct === 0 && pA.delaiMoyenJours === 0 && pA.encaisse === 10
      && pB?.total === 2 && pB.livrees === 0 && pB.echecs === 2 && pB.tauxEchecPct === 100 && pB.delaiMoyenJours === null && pB.encaisse === 0
      && egal(s.motifs.map((m) => [m.motif, m.nb]).sort(), [['absent', 1], ['refus', 1]]),
      `${JSON.stringify(s?.parLivreur)} ${JSON.stringify(s?.motifs)}`);

    // ── 3. Filtres ──
    const fA = await appel('GET', `/api/livreurs/livraisons?livreurId=${livA.id}`, tok);
    const fE = await appel('GET', '/api/livreurs/livraisons?resultat=echec', tok);
    const fAch = await appel('GET', `/api/livreurs/livraisons?acheteurId=${ach.id}`, tok);
    const fDemain = await appel('GET', `/api/livreurs/livraisons?from=${jour(1)}`, tok);
    const fHier = await appel('GET', `/api/livreurs/livraisons?to=${jour(-1)}`, tok);
    const fJour = await appel('GET', `/api/livreurs/livraisons?from=${aujourdhui}&to=${aujourdhui}`, tok);
    const fFaux = await appel('GET', '/api/livreurs/livraisons?livreurId=abc&resultat=autre&from=hier', tok);
    check('filtres : livreur A → 2 (bilan sur ces 2) ; résultat échec → 2 ; acheteur → 4 ; à partir de demain → 0 (bilan vide) ; jusqu\'à hier → 0 ; aujourd\'hui → 4 ; valeurs invalides ignorées → 4',
      fA.body?.lignes?.length === 2 && fA.body.stats.total === 2 && fA.body.stats.livrees === 2 && fE.body?.lignes?.length === 2 && fE.body.stats.echecs === 2 && fAch.body?.lignes?.length === 4
      && fDemain.body?.lignes?.length === 0 && fDemain.body.stats.total === 0 && fDemain.body.stats.tauxEchecPct === null && fDemain.body.stats.parLivreur.length === 0 && fHier.body?.lignes?.length === 0 && fJour.body?.lignes?.length === 4 && fFaux.body?.lignes?.length === 4,
      `${fA.body?.lignes?.length} ${fE.body?.lignes?.length} ${fAch.body?.lignes?.length} ${fDemain.body?.lignes?.length} ${fHier.body?.lignes?.length} ${fJour.body?.lignes?.length} ${fFaux.body?.lignes?.length}`);
    const fG = await appel('GET', '/api/livreurs/livraisons', ger.tok);
    const fL = await appel('GET', '/api/livreurs/livraisons', tokA);
    check('gérant du labo B : aucun passage (commandes du labo A) ; livreur → 403', fG.status === 200 && fG.body?.lignes?.length === 0 && fL.status === 403, `${fG.status} ${fG.body?.lignes?.length} ${fL.status}`);

    // ── 4. Tableau de bord, onglet Acheteurs : bloc livraisons ──
    r = await appel('GET', `/api/dashboard/v2?tab=acheteurs&from=${aujourdhui}&to=${aujourdhui}`, tok);
    const d = r.body?.data || r.body || {};
    const lv = d.livraisons;
    check('tableau de bord (onglet Acheteurs, aujourd\'hui) : bloc livraisons — 4 passages, 2 livrées, 2 non livrées, 50 %, délai 0, encaissé 10 ; par livreur (2) ; motifs (2) ; par_statut avec livraison_echouee',
      r.status === 200 && lv?.total === 4 && lv.livrees === 2 && lv.echecs === 2 && lv.taux_echec_pct === 50 && lv.delai_moyen_jours === 0 && lv.encaisse === 10
      && lv.par_livreur?.length === 2 && lv.par_livreur[0].livreur && lv.motifs?.length === 2 && lv.motifs.every((m) => m.libelle && m.nb === 1)
      && (d.par_statut || []).some((x) => x.statut === 'livraison_echouee' && x.nb === 1),
      `${r.status} ${JSON.stringify(lv)} ${JSON.stringify(d.par_statut)}`);
    r = await appel('GET', `/api/dashboard/v2?tab=acheteurs&from=${jour(-10)}&to=${jour(-1)}`, tok);
    const d2 = r.body?.data || r.body || {};
    check('tableau de bord sur une période sans passage : livraisons = null', r.status === 200 && d2.livraisons === null, `${r.status} ${JSON.stringify(d2.livraisons)}`);

    // ── 5. Manuel ──
    r = await appel('GET', '/api/manuel', tok);
    const texte = JSON.stringify(r.body || '');
    check('manuel du client : fiche « livreurs-suivi » présente ; fiche « livreurs » renvoie vers le suivi', r.status === 200 && /"slug":"livreurs-suivi"/.test(texte) && /#livreurs-suivi/.test(texte), `${r.status}`);
  } catch (e) {
    console.error('💥', e);
    results.push({ name: 'exception', ok: false });
  } finally {
    await wipe().catch((e) => console.error('nettoyage :', e.message));
    await pool.end().catch(() => {});
  }

  const ok = results.filter((r) => r.ok).length;
  console.log(`\n${ok}/${results.length} contrôles passés`);
  process.exit(ok === results.length ? 0 : 1);
})();
