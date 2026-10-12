/* Test E2E local — factures fournisseur, étape F4 « Vers la comptabilité » (labflow-reprise/achats-compta/PLAN-FACTURES.md,
 * ETAPE-F4.md) : une facture d'appro part dans le dossier « Mon entreprise » du client (module Compta actif), en
 * écriture d'achat EN BROUILLARD.
 *   GET  /api/factures/compta                              module actif ? (client, gérant)
 *   POST /api/appros/facture/validee   { envoyerCompta }   facture validée, puis envoi (sa propre transaction)
 *   POST /api/appros/facture           { envoyerCompta }   saisie à la main avec sa pièce, puis envoi
 *   POST /api/factures/:id/pieces      { envoyerCompta }   pièce jointe plus tard, puis envoi
 *   POST /api/factures/:id/compta                          « Envoyer à la comptabilité » (page Factures)
 *   GET  /api/factures                                     état de chaque facture (brouillard / validée)
 *   GET|PUT /api/compta/dossiers/:id/comptes-achat         comptes d'achat (catégories, articles, natures)
 *   GET  /api/compta/dossiers/:id/ecritures/:eid/pieces[/:pid/fichier]   la pièce depuis l'écriture
 *   verrous : facture en comptabilité (lignes, pièces, ajout de lignes), suppression (brouillard emporté, validée refusée)
 *   relecture : écriture = TTC de la facture (saisie à la main, montants répartis ; ligne sans prix HT), garde sous verrou,
 *   dossier au forfait (TVA dans les achats), tiers reconnu par matricule fiscal, facture après l'exercice ouvert ;
 *   contre-relecture : tiers désactivé de même matricule (refus), comptabilité figée (suppression refusée), recalcul
 *   noté au journal, pièce jointe refusée sur une facture en comptabilité
 * Crée un super_admin + 1 client (1 activité, 1 labo, 1 gérant) temporaires, active le module Compta (tarifs remis en
 * l'état), puis nettoie. Données fictives. ⚠️ Serveur d'essai : « node scripts/start-test-backend.js » (BASE_URL). */
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
const approx = (a, b, eps = 0.0005) => Math.abs(Number(a) - Number(b)) <= eps;
const aujourdhui = new Date().toISOString().slice(0, 10);
const annee = aujourdhui.slice(0, 4);
const appel = async (methode, chemin, jeton, corps) => {
  const r = await fetch(`${BASE}${chemin}`, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  let body = null;
  try { body = await r.json(); } catch (_) { /* corps vide ou fichier */ }
  return { status: r.status, body, type: r.headers.get('content-type') };
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
const PDF = () => Buffer.concat([Buffer.from('%PDF-1.4\n% facture fictive F4\n'), crypto.randomBytes(1500), Buffer.from('\n%%EOF\n')]);
const piece = () => [{ octets: PDF(), nom: 'facture.pdf', type: 'application/pdf' }];
const CLES_TARIFS = ['compta_module_mensuel', 'compta_gerant_client_mensuel', 'compta_mise_en_route'];

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-f4@example.com';
  const CLIENT = 'test-f4-client@example.com';
  const GERANT = 'test-f4-gerant@example.com';
  let adminTok = null;
  const tarifsAvant = Object.fromEntries((await pool.query('SELECT cle, valeur_dt FROM tarifs_config WHERE cle = ANY($1)', [CLES_TARIFS])).rows.map((x) => [x.cle, x.valeur_dt]));
  const nettoyer = async () => {
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE email = ANY($1)', [[CLIENT, GERANT]])).rows.map((x) => x.id);
    if (ids.length) {
      const espaces = (await pool.query('SELECT id FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids])).rows.map((x) => x.id);
      await pool.query('DELETE FROM compta.dossiers WHERE espace_id = ANY($1)', [espaces]);
      const client = (await pool.query(`SELECT id FROM utilisateurs WHERE email = $1 AND role = 'client'`, [CLIENT])).rows[0];
      if (client && adminTok) await appel('DELETE', `/admin/clients/${client.id}`, adminTok);
      await pool.query(`DELETE FROM compta.evenements WHERE auteur_id = ANY($1) OR espace_id = ANY($2)`, [ids, espaces]);
      await pool.query('DELETE FROM compta.acces WHERE espace_id = ANY($1)', [espaces]).catch(() => {});
      await pool.query('DELETE FROM compta.espaces WHERE id = ANY($1)', [espaces]);
    }
    await pool.query('DELETE FROM utilisateurs WHERE email = ANY($1)', [[GERANT, CLIENT, ADMIN]]);
  };
  try {
    // ── 0. Préparation ─────────────────────────────────────────────────────────────────────────────────────────────
    await nettoyer();
    await pool.query(`INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif) VALUES ('TEST-AdminF4', $1, $2, 'super_admin', true)`, [ADMIN, hash]);
    adminTok = await login(ADMIN);
    for (const [cle, valeur] of [['compta_module_mensuel', 60], ['compta_gerant_client_mensuel', 15], ['compta_mise_en_route', 0]]) {
      await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    }
    let r = await appel('POST', '/admin/clients', adminTok, { nom: 'TEST-F4 Contact', email: CLIENT, telephone: '20778891', nbActivites: 1, nbLabos: 1, nbGerants: 1, montantOnboarding: 0 });
    check('0. création du client (1 activité, 1 labo, 1 gérant)', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const clientId = (await pool.query('SELECT id FROM utilisateurs WHERE email = $1', [CLIENT])).rows[0].id;
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, clientId]);
    const tok = await login(CLIENT);
    r = await appel('GET', '/api/factures/compta', tok);
    check('0. module Compta inactif → actif: false', r.status === 200 && r.body?.actif === false, JSON.stringify(r.body));
    r = await appel('PUT', `/api/abonnements/client/${clientId}/module-compta`, adminTok, { actif: true, nbGerantsCompta: 0 });
    const espaceId = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'client_labflow' AND titulaire_id = $1`, [clientId])).rows[0]?.id;
    const dossier = (await pool.query(`SELECT id FROM compta.dossiers WHERE espace_id = $1 AND source = 'labflow'`, [espaceId])).rows[0];
    check('0. module Compta activé : comptabilité et dossier « Mon entreprise »', r.status === 200 && !!espaceId && !!dossier, `${r.status} ${r.body?.message || ''}`);

    const unites = (await appel('GET', '/api/unites', tok)).body || [];
    const unite = async (nom) => unites.find((u) => (u.name || u.nom) === nom) || (await appel('POST', '/api/unites', tok, { name: nom })).body;
    const kg = await unite('kg');
    const piece1 = await unite('pièce');
    const famIngr = (await appel('POST', '/api/familles', tok, { name: 'Ingrédients F4' })).body;
    const famRevente = (await appel('POST', '/api/familles', tok, { name: 'Boissons F4', consommable: false, vendable: true })).body;
    const famFourn = (await appel('POST', '/api/familles', tok, { name: 'Emballages F4', consommable: false, vendable: false })).body;
    const catIngr = (await appel('POST', '/api/categories', tok, { name: 'Farines F4', familleId: famIngr?.id })).body;
    const catRevente = (await appel('POST', '/api/categories', tok, { name: 'Sodas F4', familleId: famRevente?.id })).body;
    const catFourn = (await appel('POST', '/api/categories', tok, { name: 'Barquettes F4', familleId: famFourn?.id })).body;
    const farine = (await appel('POST', '/api/articles', tok, { name: 'Farine F4', unitId: kg?.id, categorieId: catIngr?.id })).body;
    const soda = (await appel('POST', '/api/articles', tok, { name: 'Soda F4', unitId: piece1?.id, categorieId: catRevente?.id })).body;
    const barquette = (await appel('POST', '/api/articles', tok, { name: 'Barquette F4', unitId: piece1?.id, categorieId: catFourn?.id })).body;
    const act = (await appel('POST', '/api/entreprise/activites', tok, { nom: 'Restaurant F4' })).body;
    const labo = (await appel('POST', '/api/labo', tok, { nom: 'Cuisine F4', refLabo: 'CF4' })).body;
    for (const a of [farine, soda, barquette]) await appel('POST', `/api/entreprise/activites/${act?.id}/ingredients/${a?.id}/select`, tok, {});
    await appel('POST', `/api/labo/${labo?.id}/ingredients/${farine?.id}/select`, tok, {});
    const f1 = (await appel('POST', '/api/entreprise/fournisseurs', tok, { nom: 'SMDA F4', matriculeFiscal: '1384297X/A/M/000', activiteIds: [act.id], laboIds: [labo.id] })).body?.id;
    const f2 = (await appel('POST', '/api/entreprise/fournisseurs', tok, { nom: 'IPS F4', matriculeFiscal: '1103587T/A/M/000', activiteIds: [act.id] })).body?.id;
    const f3 = (await appel('POST', '/api/entreprise/fournisseurs', tok, { nom: 'Grossiste F4', matriculeFiscal: '9876543Z/A/M/000', activiteIds: [act.id] })).body?.id;
    const f4 = (await appel('POST', '/api/entreprise/fournisseurs', tok, { nom: 'Ancien F4', matriculeFiscal: '5555555Q/A/M/000', activiteIds: [act.id] })).body?.id;
    r = await appel('POST', '/api/abonnements/gerants', tok, { nom: 'TEST-Gérant F4', telephone: '20778892', email: GERANT, activiteIds: [act.id] });
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL WHERE id = $2', [hash, r.body?.id]);
    const gTok = await login(GERANT);
    check('0. référentiel, activité, labo, 4 fournisseurs (matricule), gérant', !!farine?.id && !!soda?.id && !!barquette?.id && !!act?.id && !!labo?.id && !!f1 && !!f2 && !!f3 && !!f4 && !!gTok);
    r = await appel('GET', '/api/factures/compta', tok);
    const rg = await appel('GET', '/api/factures/compta', gTok);
    check('1. module actif : le client et le gérant le voient (la case s\'affiche)', r.body?.actif === true && rg.body?.actif === true, `${JSON.stringify(r.body)} ${JSON.stringify(rg.body)}`);

    // ── 2. Facture validée, envoyée ────────────────────────────────────────────────────────────────────────────────
    const validation = (m = {}) => ({
      cible: { type: 'activite', id: act.id }, dateAppro: aujourdhui, fournisseurId: f1, refFacture: 'FV-F4-001', timbreFiscal: true, timbreMontant: 1,
      fodec: 1.2, remiseGlobale: 10, envoyerCompta: true,
      lignes: [
        { designation: 'Farine T45 sac 25 kg', unite: 'sac', quantite: 2, prixUnitaire: 41.5, tauxTva: 7, montant: 83, articleId: farine.id, conversion: 25 },
        { designation: 'Soda 33 cl', quantite: 24, prixUnitaire: 0.75, tauxTva: 19, montant: 18, articleId: soda.id, conversion: 1 },
        { designation: 'Barquette alu', quantite: 100, prixUnitaire: 0.12, tauxTva: 19, montant: 12, articleId: barquette.id, conversion: 1 },
        { designation: 'Transport', quantite: 1, prixUnitaire: 7, tauxTva: 19, montant: 7, horsStock: 'transport' },
        { designation: 'Consigne casiers', quantite: 2, prixUnitaire: 5, tauxTva: 0, montant: 10, horsStock: 'consigne' },
        { designation: 'Déconsigne casiers', quantite: 1, prixUnitaire: -5, tauxTva: 0, montant: -5, horsStock: 'consigne' },
      ],
      ...m,
    });
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation(), piece());
    const fac1 = r.body?.factureId;
    check('2. facture validée + envoyée → 201, compta : brouillard (n° provisoire)', r.status === 201 && r.body?.compta?.etat === 'brouillard' && /^B-\d{6}$/.test(r.body?.compta?.numeroProvisoire || '') && !r.body?.comptaRefus, `${r.status} ${JSON.stringify(r.body)}`);
    const ec1 = (await pool.query(
      `SELECT e.*, j.code AS journal FROM compta.ecritures e JOIN compta.journaux j ON j.id = e.journal_id WHERE e.facture_id = $1`, [fac1]
    )).rows[0];
    const f1Row = (await pool.query('SELECT montant_ht, montant_tva, montant_ttc, montant_fodec FROM factures WHERE id = $1', [fac1])).rows[0];
    check('2. écriture : brouillard, journal AC, origine labflow, référence = n° de facture, datée de la facture',
      ec1?.etat === 'brouillard' && ec1?.journal === 'AC' && ec1?.origine === 'labflow' && ec1?.reference === 'FV-F4-001' && ec1?.date === aujourdhui && ec1?.date_reelle == null,
      JSON.stringify(ec1));
    // Le total d'une écriture = ses débits : TTC (crédit du fournisseur) + la déconsigne (crédit en plus, 5 D).
    check('2. total de l\'écriture = TTC + déconsigne : montants exacts', approx(ec1?.total_debit, Number(f1Row?.montant_ttc) + 5) && approx(ec1?.total_credit, Number(f1Row?.montant_ttc) + 5), `${ec1?.total_debit} / ${f1Row?.montant_ttc}`);
    const lignes1 = (await pool.query(
      `SELECT l.debit::numeric AS debit, l.credit::numeric AS credit, k.numero, t.code AS tiers, x.code AS taxe FROM compta.lignes l
         JOIN compta.comptes k ON k.id = l.compte_id LEFT JOIN compta.tiers t ON t.id = l.tiers_id LEFT JOIN compta.taxes x ON x.id = l.taxe_id
        WHERE l.ecriture_id = $1 ORDER BY l.rang`, [ec1?.id]
    )).rows;
    const comptes1 = lignes1.map((l) => l.numero);
    check('2. comptes : 601 ingrédients, 607 revendu, 6022 fournitures, 6241 transport, 4096 consigne et déconsigne, 6651 FODEC, 43666 TVA, 6654 timbre, 4011 fournisseur',
      ['601', '607', '6022', '6241', '4096', '6651', '43666', '6654', '4011'].every((n) => comptes1.includes(n)), JSON.stringify(lignes1));
    const debit = lignes1.reduce((s, l) => s + Number(l.debit), 0);
    const credit = lignes1.reduce((s, l) => s + Number(l.credit), 0);
    const deconsigne = lignes1.find((l) => l.numero === '4096' && Number(l.credit) > 0);
    const four = lignes1.find((l) => l.numero === '4011');
    check('2. équilibrée ; déconsigne au crédit du 4096 avec le tiers ; fournisseur (tiers) au crédit du TTC', approx(debit, credit) && approx(deconsigne?.credit, 5) && !!deconsigne?.tiers && approx(four?.credit, f1Row?.montant_ttc) && four?.tiers === 'F0001', JSON.stringify(lignes1));
    check('2. codes de taxe : lignes HT et TVA en TVA7 / TVA19, consigne en TVA0, FODEC, TIMBRE',
      lignes1.find((l) => l.numero === '601')?.taxe === 'TVA7' && lignes1.find((l) => l.numero === '607')?.taxe === 'TVA19' && lignes1.find((l) => l.numero === '6651')?.taxe === 'FODEC'
        && lignes1.find((l) => l.numero === '6654')?.taxe === 'TIMBRE' && lignes1.filter((l) => l.numero === '43666').map((l) => l.taxe).sort().join() === 'TVA19,TVA7'
        && lignes1.filter((l) => l.numero === '4096').every((l) => l.taxe === 'TVA0'), JSON.stringify(lignes1));
    const tiers1 = (await pool.query('SELECT code, origine, fournisseur_id, matricule_fiscal FROM compta.tiers WHERE dossier_id = $1 AND type = \'fournisseur\'', [dossier.id])).rows;
    check('2. tiers créé : F0001, origine labflow, relié au fournisseur, matricule', tiers1.length === 1 && tiers1[0].code === 'F0001' && tiers1[0].origine === 'labflow' && tiers1[0].fournisseur_id === f1 && !!tiers1[0].matricule_fiscal, JSON.stringify(tiers1));
    const evts = (await pool.query(`SELECT type FROM compta.evenements WHERE espace_id = $1 AND type IN ('tiers_cree', 'ecriture_creee')`, [espaceId])).rows.map((x) => x.type).sort();
    const jf = (await pool.query(`SELECT 1 FROM factures_journal WHERE facture_id = $1 AND action = 'envoi_compta'`, [fac1])).rows.length;
    check('2. journaux : Compta (tiers créé, écriture créée) et facture (envoi_compta)', evts.join() === 'ecriture_creee,tiers_cree' && jf === 1, `${evts} ${jf}`);

    // ── 3. Page Factures, envoi idempotent, même fournisseur ────────────────────────────────────────────────────────
    r = await appel('GET', '/api/factures?activiteId=' + act.id, tok);
    const ligneF1 = (r.body || []).find((x) => x.id === fac1);
    check('3. GET /api/factures : compta { etat brouillard, numeroProvisoire }', ligneF1?.compta?.etat === 'brouillard' && /^B-\d{6}$/.test(ligneF1?.compta?.numeroProvisoire || '') && ligneF1?.compta?.ecritureId === ec1?.id, JSON.stringify(ligneF1?.compta));
    r = await appel('POST', `/api/factures/${fac1}/compta`, tok);
    const nb1 = (await pool.query('SELECT COUNT(*)::int AS n FROM compta.ecritures WHERE facture_id = $1', [fac1])).rows[0].n;
    check('3. renvoyer : 200 deja, toujours une seule écriture', r.status === 200 && r.body?.deja === true && nb1 === 1, `${r.status} ${JSON.stringify(r.body)} n=${nb1}`);
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'FV-F4-002', fodec: 0, remiseGlobale: 0, lignes: [validation().lignes[0]] }), piece());
    const fac2 = r.body?.factureId;
    const nbTiers = (await pool.query('SELECT COUNT(*)::int AS n FROM compta.tiers WHERE dossier_id = $1', [dossier.id])).rows[0].n;
    check('3. 2ᵉ facture du même fournisseur : tiers F0001 repris (pas de doublon)', r.status === 201 && r.body?.compta?.etat === 'brouillard' && nbTiers === 1, `${r.status} ${JSON.stringify(r.body?.comptaRefus)} tiers=${nbTiers}`);

    // ── 4. Saisie à la main : avec pièce (envoyée), sans pièce (refusée, puis jointe) ─────────────────────────────
    r = await envoi('POST', '/api/appros/facture', tok, {
      cible: { type: 'activite', id: act.id }, dateAppro: aujourdhui, fournisseurId: f2, refFacture: 'MAIN-F4-1', timbreFiscal: true, envoyerCompta: true,
      lignes: [{ articleId: barquette.id, quantite: 500, prixUnitaire: 0.1, tauxTva: 19 }, { articleId: farine.id, quantite: 10, prixUnitaire: 1.6, tauxTva: 7 }],
    }, piece());
    const main1 = r.body?.factureId;
    const ecMain = (await pool.query('SELECT total_debit FROM compta.ecritures WHERE facture_id = $1', [main1])).rows[0];
    // 50 + 16 = 66 HT ; TVA 9,5 + 1,12 = 10,62 ; timbre 1 → 77,620.
    check('4. saisie à la main avec pièce + envoyer → écriture 77,620 (HT × TVA par taux + timbre), tiers F0002', r.status === 201 && r.body?.compta?.etat === 'brouillard' && approx(ecMain?.total_debit, 77.62), `${r.status} ${JSON.stringify(r.body)} ${ecMain?.total_debit}`);
    r = await envoi('POST', '/api/appros/facture', tok, {
      cible: { type: 'activite', id: act.id }, dateAppro: aujourdhui, fournisseurId: f2, refFacture: 'MAIN-F4-2', timbreFiscal: false, envoyerCompta: true,
      lignes: [{ articleId: farine.id, quantite: 5, prixUnitaire: 1.6, tauxTva: 7 }],
    });
    const main2 = r.body?.factureId;
    check('4. sans pièce : enregistrée, envoi refusé PIECE_REQUISE (question 19)', r.status === 201 && r.body?.comptaRefus?.code === 'PIECE_REQUISE' && !r.body?.compta, `${r.status} ${JSON.stringify(r.body)}`);
    r = await appel('POST', `/api/factures/${main2}/compta`, tok);
    check('4. « Envoyer à la comptabilité » sans pièce → 409 PIECE_REQUISE', r.status === 409 && r.body?.code === 'PIECE_REQUISE', `${r.status} ${JSON.stringify(r.body)}`);
    r = await envoi('POST', `/api/factures/${main2}/pieces`, tok, { envoyerCompta: true }, piece());
    check('4. pièce jointe plus tard + envoyer → 201, compta brouillard', r.status === 201 && r.body?.compta?.etat === 'brouillard', `${r.status} ${JSON.stringify(r.body)}`);
    // L'écriture d'une facture : le fournisseur au crédit de son TTC, au millime (relecture : montants exacts).
    const ecart = async (factureId) => {
      const x = (await pool.query(
        `SELECT f.montant_ht::text AS ht, f.montant_ttc::text AS ttc,
                (SELECT SUM(l.credit)::text FROM compta.lignes l JOIN compta.comptes k ON k.id = l.compte_id WHERE l.ecriture_id = e.id AND k.numero = '4011') AS fournisseur
           FROM factures f JOIN compta.ecritures e ON e.facture_id = f.id WHERE f.id = $1`, [factureId]
      )).rows[0];
      return x ? { ...x, egal: Number(x.fournisseur) === Number(x.ttc) } : { egal: false };
    };
    r = await envoi('POST', '/api/appros/facture', tok, {
      cible: { type: 'activite', id: act.id }, dateAppro: aujourdhui, fournisseurId: f2, refFacture: 'MAIN-F4-3', timbreFiscal: true, envoyerCompta: true,
      lignes: [{ articleId: barquette.id, quantite: 3, prixUnitaire: 0.333, tauxTva: 19 }, { articleId: farine.id, quantite: 7, prixUnitaire: 1.111, tauxTva: 7 }, { articleId: soda.id, quantite: 13, prixUnitaire: 0.777, tauxTva: 19 }],
    }, piece());
    const e43 = await ecart(r.body?.factureId);
    check('4. saisie à la main aux arrondis serrés : fournisseur au crédit du TTC exact', r.status === 201 && r.body?.compta?.etat === 'brouillard' && e43.egal, `${r.status} ${JSON.stringify(r.body?.comptaRefus)} ${JSON.stringify(e43)}`);
    const e1 = await ecart(fac1);
    check('4. facture validée : fournisseur au crédit du TTC exact', e1.egal, JSON.stringify(e1));
    r = await envoi('POST', '/api/appros/facture', tok, {
      cible: { type: 'activite', id: act.id }, dateAppro: aujourdhui, fournisseurId: f2, refFacture: 'MAIN-F4-4', timbreFiscal: true,
      lignes: [{ articleId: farine.id, quantite: 2, prixUnitaire: 1.6, tauxTva: 7 }, { articleId: soda.id, quantite: 2, prixUnitaire: 1, tauxTva: 19 }],
    }, piece());
    const main4 = r.body?.factureId;
    // Une ligne sans prix HT (ancienne saisie : prix TTC seul) ; les montants enregistrés ne sont plus à jour.
    await pool.query('UPDATE stock_entreprise_daily SET prix_unitaire = NULL, prix_unitaire_tva = 1.19 WHERE facture_id = $1 AND ingredient_id = $2', [main4, soda.id]);
    await pool.query('UPDATE factures SET montant_ttc = 6.9 WHERE id = $1', [main4]);
    r = await appel('POST', `/api/factures/${main4}/compta`, tok);
    const e44 = await ecart(main4);
    const sansCode = (await pool.query(
      `SELECT l.debit::text AS debit, l.taxe_id FROM compta.lignes l JOIN compta.comptes k ON k.id = l.compte_id JOIN compta.ecritures e ON e.id = l.ecriture_id
        WHERE e.facture_id = $1 AND k.numero = '607'`, [main4]
    )).rows;
    // 3,2 HT + 0,224 TVA + 2,38 (TTC sans prix HT) + 1 timbre = 6,804 : la facture est recalculée (règle F1) avant l'envoi.
    check('4. ligne sans prix HT : TTC au compte, sans code de TVA ; facture recalculée, fournisseur = TTC (6,804)',
      r.status === 201 && e44.egal && approx(e44.ttc, 6.804) && sansCode.length === 1 && approx(sansCode[0].debit, 2.38) && sansCode[0].taxe_id == null, `${r.status} ${JSON.stringify(r.body)} ${JSON.stringify(e44)} ${JSON.stringify(sansCode)}`);
    const jRecalc = (await pool.query("SELECT details->'recalcul' AS r FROM factures_journal WHERE facture_id = $1 AND action = 'envoi_compta'", [main4])).rows[0]?.r;
    check('4. montants enregistrés périmés : recalculés à l\'envoi, écart noté au journal de la facture (6,900 → 6,804)', approx(jRecalc?.avant, 6.9) && approx(jRecalc?.apres, 6.804), JSON.stringify(jRecalc));

    // ── 5. Verrous d'une facture saisie à la main, en comptabilité ─────────────────────────────────────────────────
    const ligneMain = (await pool.query('SELECT id FROM stock_entreprise_daily WHERE facture_id = $1 ORDER BY id LIMIT 1', [main1])).rows[0].id;
    r = await appel('PUT', `/api/stock/historique/${ligneMain}`, tok, { quantite: 1, prixUnitaire: 1, fournisseurId: f2, refFacture: 'MAIN-F4-1', isEntreprise: true });
    const r5b = await appel('DELETE', `/api/stock/historique/${ligneMain}?isEntreprise=true&confirmerFacture=1`, tok);
    check('5. historique : modifier, supprimer une ligne → 409 FACTURE_EN_COMPTA', r.status === 409 && r.body?.code === 'FACTURE_EN_COMPTA' && r5b.status === 409 && r5b.body?.code === 'FACTURE_EN_COMPTA', `${r.status} ${r5b.status}`);
    const Fa = require('../src/services/facturesAppro');
    const cx = await pool.connect();
    let garde = null;
    try { await cx.query('BEGIN'); await Fa.recalculerFacture(cx, main1); } catch (e) { garde = e; } finally { await cx.query('ROLLBACK'); cx.release(); }
    check('5. garde sous verrou : recalculer une facture en comptabilité → FactureEnCompta (409 FACTURE_EN_COMPTA)', garde instanceof Fa.FactureEnCompta && garde.status === 409 && garde.corps?.code === 'FACTURE_EN_COMPTA', String(garde));
    r = await appel('GET', `/api/stock/historique?activiteId=${act.id}`, tok);
    const hMain = (r.body?.data || r.body?.rows || r.body || []).filter?.((h) => h.id === ligneMain) || [];
    check('5. historique : la ligne porte factureEnCompta', hMain[0]?.factureEnCompta === true, JSON.stringify(hMain));
    r = await envoi('POST', '/api/appros/facture', tok, {
      cible: { type: 'activite', id: act.id }, dateAppro: aujourdhui, fournisseurId: f2, refFacture: 'MAIN-F4-1', timbreFiscal: true, confirmerDoublon: true,
      lignes: [{ articleId: farine.id, quantite: 1, prixUnitaire: 1.6, tauxTva: 7 }],
    });
    check('5. ajouter des lignes au même n° (doublon confirmé) → 409 FACTURE_EN_COMPTA', r.status === 409 && r.body?.code === 'FACTURE_EN_COMPTA', `${r.status} ${JSON.stringify(r.body)}`);
    const pid = (await pool.query('SELECT id FROM factures_pieces WHERE facture_id = $1 LIMIT 1', [main1])).rows[0].id;
    r = await appel('DELETE', `/api/factures/${main1}/pieces/${pid}`, tok);
    const r5r = await envoi('PUT', `/api/factures/${main1}/pieces/${pid}`, tok, {}, piece());
    const r5j = await envoi('POST', `/api/factures/${main1}/pieces`, tok, {}, piece());
    check('5. pièce : supprimer, remplacer, joindre → 409 FACTURE_EN_COMPTA', r.status === 409 && r.body?.code === 'FACTURE_EN_COMPTA' && r5r.status === 409 && r5r.body?.code === 'FACTURE_EN_COMPTA' && r5j.status === 409 && r5j.body?.code === 'FACTURE_EN_COMPTA', `${r.status} ${r5r.status} ${r5j.status}`);
    r = await appel('GET', `/api/factures/${main1}/pieces`, tok);
    check('5. liste des pièces : état compta', r.body?.compta?.etat === 'brouillard', JSON.stringify(r.body?.compta));

    // ── 6. La Compta : pièce depuis l'écriture, comptes d'achat ───────────────────────────────────────────────────
    r = await appel('GET', `/api/compta/dossiers/${dossier.id}/ecritures/${ec1.id}`, tok);
    const unePres = r.body?.ecriture || r.body;
    check('6. écriture présentée : origine labflow, factureId', unePres?.origine === 'labflow' && unePres?.factureId === fac1, JSON.stringify({ origine: unePres?.origine, factureId: unePres?.factureId }));
    r = await appel('GET', `/api/compta/dossiers/${dossier.id}/ecritures/${ec1.id}/pieces`, tok);
    const p1 = r.body?.pieces?.[0];
    const rf = p1 ? await fetch(`${BASE}/api/compta/dossiers/${dossier.id}/ecritures/${ec1.id}/pieces/${p1.id}/fichier`, { headers: { Authorization: `Bearer ${tok}` } }) : null;
    check('6. pièce depuis l\'écriture : liste (1) et fichier PDF', r.status === 200 && r.body?.pieces?.length === 1 && rf?.status === 200 && /application\/pdf/.test(rf?.headers.get('content-type') || ''), `${r.status} ${rf?.status}`);
    r = await appel('GET', `/api/compta/dossiers/${dossier.id}/ecritures/${ec1.id}/pieces`, gTok);
    check('6. gérant LabFlow sans accès Compta : 404 (dossier introuvable)', r.status === 404, `${r.status}`);
    r = await appel('GET', `/api/compta/dossiers/${dossier.id}/comptes-achat`, tok);
    const catF = r.body?.categories?.find((c) => c.id === catIngr.id);
    const catS = r.body?.categories?.find((c) => c.id === catRevente.id);
    const catB = r.body?.categories?.find((c) => c.id === catFourn.id);
    check('6. comptes d\'achat : défauts 601 / 607 / 6022, natures (transport 6241, consigne 4096), comptes proposés',
      r.status === 200 && catF?.defaut?.numero === '601' && catS?.defaut?.numero === '607' && catB?.defaut?.numero === '6022'
        && r.body.natures.find((n) => n.valeur === 'transport')?.defaut?.numero === '6241' && r.body.natures.find((n) => n.valeur === 'consigne')?.defaut?.numero === '4096'
        && r.body.comptes.some((k) => k.numero === '6026') && r.body.sansCategorie?.defaut?.numero === '601', `${r.status} ${JSON.stringify(r.body?.categories)} ${JSON.stringify(r.body?.sansCategorie)}`);
    const k6026 = r.body?.comptes?.find((k) => k.numero === '6026');
    const k4011 = (await pool.query(`SELECT id FROM compta.comptes WHERE dossier_id = $1 AND numero = '4011'`, [dossier.id])).rows[0].id;
    r = await appel('PUT', `/api/compta/dossiers/${dossier.id}/comptes-achat`, tok, { type: 'article', id: barquette.id, compteId: k6026?.id });
    const r6b = await appel('PUT', `/api/compta/dossiers/${dossier.id}/comptes-achat`, tok, { type: 'categorie', id: catIngr.id, compteId: k4011 });
    check('6. régler : article → 6026 (200, état à jour) ; compte fournisseurs sur une catégorie → 400 COMPTE_INADAPTE',
      r.status === 200 && r.body?.articles?.find((a) => a.id === barquette.id)?.compte?.numero === '6026' && r6b.status === 400 && r6b.body?.code === 'COMPTE_INADAPTE', `${r.status} ${r6b.status} ${JSON.stringify(r6b.body)}`);
    const nbReglages = async () => (await pool.query(`SELECT COUNT(*)::int AS n FROM compta.evenements WHERE espace_id = $1 AND type = 'compte_achat_regle'`, [espaceId])).rows[0].n;
    const avantRegl = await nbReglages();
    r = await appel('PUT', `/api/compta/dossiers/${dossier.id}/comptes-achat`, tok, { type: 'article', id: barquette.id, compteId: k6026?.id });
    const r6n = await appel('PUT', `/api/compta/dossiers/${dossier.id}/comptes-achat`, tok, { type: 'article', id: farine.id, compteId: null });
    check('6. même compte, ou retour au défaut sans réglage : 200, rien au journal', r.status === 200 && r6n.status === 200 && (await nbReglages()) === avantRegl, `${r.status} ${r6n.status} ${avantRegl}`);
    r = await appel('PUT', `/api/compta/dossiers/${dossier.id}/comptes-achat`, tok, { type: 'nature', valeur: 'consigne', compteId: k4011 });
    const r6t = await appel('PUT', `/api/compta/dossiers/${dossier.id}/comptes-achat`, tok, { type: 'nature', valeur: 'transport', compteId: k4011 });
    await appel('PUT', `/api/compta/dossiers/${dossier.id}/comptes-achat`, tok, { type: 'nature', valeur: 'consigne', compteId: null });
    check('6. consigne → compte fournisseurs accepté ; transport → refusé (COMPTE_INADAPTE)', r.status === 200 && r6t.status === 400 && r6t.body?.code === 'COMPTE_INADAPTE', `${r.status} ${r6t.status}`);
    r = await appel('PUT', `/api/compta/dossiers/${dossier.id}/comptes-achat`, gTok, { type: 'article', id: farine.id, compteId: k6026?.id });
    check('6. gérant LabFlow : régler refusé (404)', r.status === 404, `${r.status}`);
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'FV-F4-003', fodec: 0, remiseGlobale: 0, lignes: [validation().lignes[2]] }), piece());
    const n6026 = (await pool.query(`SELECT k.numero FROM compta.lignes l JOIN compta.comptes k ON k.id = l.compte_id JOIN compta.ecritures e ON e.id = l.ecriture_id WHERE e.facture_id = $1 AND l.debit > 0 ORDER BY l.rang LIMIT 1`, [r.body?.factureId])).rows[0]?.numero;
    check('6. facture suivante : la barquette au compte réglé 6026', r.status === 201 && n6026 === '6026', `${r.status} ${n6026}`);
    r = await appel('PUT', `/api/compta/dossiers/${dossier.id}/comptes-achat`, tok, { type: 'article', id: barquette.id, compteId: null });
    check('6. revenir au compte par défaut (compteId null)', r.status === 200 && r.body?.articles?.find((a) => a.id === barquette.id)?.compte === null, `${r.status}`);

    // ── 7. Refus : taux sans code, module inactif ─────────────────────────────────────────────────────────────────
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'FV-F4-012', fodec: 0, remiseGlobale: 0, lignes: [{ ...validation().lignes[0], tauxTva: 12 }] }), piece());
    const fac12 = r.body?.factureId;
    check('7. taux 12 % sans code : facture validée (201), envoi refusé TAUX_SANS_CODE, rien en comptabilité',
      r.status === 201 && r.body?.comptaRefus?.code === 'TAUX_SANS_CODE' && !(await pool.query('SELECT 1 FROM compta.ecritures WHERE facture_id = $1', [fac12])).rows.length, `${r.status} ${JSON.stringify(r.body)}`);

    await pool.query(`UPDATE compta.dossiers SET tva = 'forfaitaire' WHERE id = $1`, [dossier.id]);
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'FV-F4-FOR', fodec: 0, remiseGlobale: 0, timbreFiscal: false, lignes: [validation().lignes[0]] }), piece());
    await pool.query(`UPDATE compta.dossiers SET tva = 'reel' WHERE id = $1`, [dossier.id]);
    const lFor = (await pool.query(
      `SELECT k.numero, l.debit::text AS debit, l.credit::text AS credit, l.taxe_id FROM compta.lignes l JOIN compta.comptes k ON k.id = l.compte_id
         JOIN compta.ecritures e ON e.id = l.ecriture_id WHERE e.facture_id = $1 ORDER BY l.rang`, [r.body?.factureId]
    )).rows;
    // 83 HT + 7 % = 88,810 : au 601, sans code ; pas de TVA déductible.
    check('7. dossier au forfait : TVA dans l\'achat (601 = 88,810, sans code), pas de 43666, fournisseur = TTC',
      r.status === 201 && lFor.length === 2 && lFor[0].numero === '601' && approx(lFor[0].debit, 88.81) && lFor[0].taxe_id == null && lFor[1].numero === '4011' && approx(lFor[1].credit, 88.81),
      `${r.status} ${JSON.stringify(r.body?.comptaRefus)} ${JSON.stringify(lFor)}`);
    const k4011b = (await pool.query(`SELECT id FROM compta.comptes WHERE dossier_id = $1 AND numero = '4011'`, [dossier.id])).rows[0].id;
    await pool.query(`INSERT INTO compta.tiers (dossier_id, type, code, nom, matricule_fiscal, compte_id) VALUES ($1, 'fournisseur', 'F0900', 'GROSSISTE (saisi par le comptable)', '9876543 z', $2)`, [dossier.id, k4011b]);
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'FV-F4-MF', fournisseurId: f3, fodec: 0, remiseGlobale: 0, lignes: [validation().lignes[0]] }), piece());
    const tMF = (await pool.query(`SELECT fournisseur_id FROM compta.tiers WHERE dossier_id = $1 AND code = 'F0900'`, [dossier.id])).rows[0];
    const lMF = (await pool.query(
      `SELECT t.code FROM compta.lignes l JOIN compta.tiers t ON t.id = l.tiers_id JOIN compta.ecritures e ON e.id = l.ecriture_id WHERE e.facture_id = $1`, [r.body?.factureId]
    )).rows.map((x) => x.code);
    const evMF = (await pool.query(`SELECT 1 FROM compta.evenements WHERE espace_id = $1 AND type = 'tiers_modifie' AND details->>'origine' = 'labflow'`, [espaceId])).rows.length;
    check('7. tiers saisi par le comptable, même matricule écrit autrement : repris (F0900), relié au fournisseur, lien au journal',
      r.status === 201 && tMF?.fournisseur_id === f3 && lMF.length > 0 && lMF.every((c) => c === 'F0900') && evMF === 1, `${r.status} ${JSON.stringify(r.body?.comptaRefus)} ${JSON.stringify(tMF)} ${lMF} ev=${evMF}`);
    await pool.query("INSERT INTO compta.tiers (dossier_id, type, code, nom, matricule_fiscal, compte_id, actif) VALUES ($1, 'fournisseur', 'F0901', 'ANCIEN (désactivé)', '5555555Q', $2, false)", [dossier.id, k4011b]);
    const nbTiersAvant = (await pool.query('SELECT COUNT(*)::int AS n FROM compta.tiers WHERE dossier_id = $1', [dossier.id])).rows[0].n;
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'FV-F4-DES', fournisseurId: f4, fodec: 0, remiseGlobale: 0, lignes: [validation().lignes[0]] }), piece());
    const nbTiersApres = (await pool.query('SELECT COUNT(*)::int AS n FROM compta.tiers WHERE dossier_id = $1', [dossier.id])).rows[0].n;
    check('7. matricule porté seulement par un tiers désactivé : envoi refusé TIERS_DESACTIVE (F0901), aucun tiers créé', r.status === 201 && r.body?.comptaRefus?.code === 'TIERS_DESACTIVE' && /F0901/.test(r.body?.comptaRefus?.message || '') && nbTiersApres === nbTiersAvant, `${r.status} ${JSON.stringify(r.body?.comptaRefus)} ${nbTiersAvant}→${nbTiersApres}`);
    // Une date future est refusée à la saisie : la facture est datée de janvier prochain en base (passage d'année).
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'FV-F4-APRES', envoyerCompta: false, fodec: 0, remiseGlobale: 0, lignes: [validation().lignes[0]] }), piece());
    await pool.query('UPDATE factures SET date_facture = $2::date WHERE id = $1', [r.body?.factureId, `${Number(annee) + 1}-01-10`]);
    r = await appel('POST', `/api/factures/${r.body?.factureId}/compta`, tok);
    check('7. facture après l\'exercice ouvert : envoi refusé DATE_APRES_EXERCICE, sans promesse d\'ouvrir l\'exercice', r.status === 409 && r.body?.code === 'DATE_APRES_EXERCICE' && !/ouvrir/.test(r.body?.message || ''), `${r.status} ${JSON.stringify(r.body)}`);

    // ── 8. Suppression (question 18) ───────────────────────────────────────────────────────────────────────────────
    const ec2 = (await pool.query('SELECT id FROM compta.ecritures WHERE facture_id = $1', [fac2])).rows[0].id;
    r = await appel('POST', `/api/compta/dossiers/${dossier.id}/ecritures/${ec2}/valider`, tok);
    check('8. le comptable valide l\'écriture de la 2ᵉ facture', r.status === 200, `${r.status} ${JSON.stringify(r.body)}`);
    r = await appel('DELETE', `/api/factures/${fac2}`, tok);
    check('8. supprimer une facture dont l\'écriture est validée → 409 ECRITURE_VALIDEE (rien ne part)', r.status === 409 && r.body?.code === 'ECRITURE_VALIDEE' && (await pool.query('SELECT 1 FROM factures WHERE id = $1', [fac2])).rows.length === 1, `${r.status} ${JSON.stringify(r.body)}`);
    await pool.query("UPDATE compta.dossiers SET etat = 'archive' WHERE id = $1", [dossier.id]);
    r = await appel('DELETE', `/api/factures/${fac1}`, tok);
    await pool.query("UPDATE compta.dossiers SET etat = 'actif' WHERE id = $1", [dossier.id]);
    const figee = (await pool.query('SELECT (SELECT COUNT(*)::int FROM factures WHERE id = $1) AS f, (SELECT COUNT(*)::int FROM compta.ecritures WHERE id = $2) AS e', [fac1, ec1.id])).rows[0];
    check('8. dossier archivé : supprimer la facture → 409 COMPTA_FIGEE, facture et brouillard restent', r.status === 409 && r.body?.code === 'COMPTA_FIGEE' && figee.f === 1 && figee.e === 1, `${r.status} ${JSON.stringify(r.body)} ${JSON.stringify(figee)}`);
    r = await appel('DELETE', `/api/factures/${fac1}`, tok);
    const reste = (await pool.query('SELECT 1 FROM compta.ecritures WHERE id = $1', [ec1.id])).rows.length;
    const evSup = (await pool.query(`SELECT jsonb_array_length(details->'contenu'->'lignes') AS n FROM compta.evenements WHERE espace_id = $1 AND type = 'ecriture_supprimee' AND (details->>'ecriture')::int = $2`, [espaceId, ec1.id])).rows;
    check('8. supprimer une facture validée en brouillard → 200, son écriture part avec (journal de la Compta, contenu compris)', r.status === 200 && reste === 0 && evSup.length === 1 && evSup[0].n === lignes1.length, `${r.status} reste=${reste} ev=${JSON.stringify(evSup)}`);

    // ── 9. Le comptable supprime le brouillard : la facture redevient « à envoyer » ───────────────────────────────
    const ecM2 = (await pool.query('SELECT id FROM compta.ecritures WHERE facture_id = $1', [main2])).rows[0].id;
    r = await appel('DELETE', `/api/compta/dossiers/${dossier.id}/ecritures/${ecM2}`, tok);
    const liste = (await appel('GET', '/api/factures?activiteId=' + act.id, tok)).body || [];
    check('9. brouillard supprimé dans la Compta → la facture n\'a plus d\'écriture (à envoyer)', r.status === 200 && liste.find((x) => x.id === main2)?.compta === null, `${r.status} ${JSON.stringify(liste.find((x) => x.id === main2)?.compta)}`);
    r = await appel('POST', `/api/factures/${main2}/compta`, gTok);
    check('9. le gérant la renvoie (facture de son activité) → 201', r.status === 201 && r.body?.compta?.etat === 'brouillard', `${r.status} ${JSON.stringify(r.body)}`);

    // ── 10. Période close : vraie date ──────────────────────────────────────────────────────────────────────────────
    const janvier = `${annee}-01-15`;
    const pJanv = (await pool.query(`SELECT p.id FROM compta.periodes p JOIN compta.exercices x ON x.id = p.exercice_id WHERE x.dossier_id = $1 AND p.debut = $2::date`, [dossier.id, `${annee}-01-01`])).rows[0]?.id;
    r = await appel('POST', `/api/compta/dossiers/${dossier.id}/periodes/${pJanv}/clore`, tok);
    const close = r.status === 200;
    r = await envoi('POST', '/api/appros/facture/validee', tok, validation({ refFacture: 'FV-F4-JAN', dateAppro: janvier, fodec: 0, remiseGlobale: 0, lignes: [validation().lignes[0]] }), piece());
    const ecJ = (await pool.query('SELECT date::text AS date, date_reelle::text AS date_reelle FROM compta.ecritures WHERE facture_id = $1', [r.body?.factureId])).rows[0];
    check('10. période de janvier close : écriture au 1ᵉʳ jour de la période ouverte suivante, vraie date = date de la facture',
      close && r.status === 201 && ecJ?.date === `${annee}-02-01` && ecJ?.date_reelle === janvier, `clos=${close} ${r.status} ${JSON.stringify(ecJ)} ${JSON.stringify(r.body?.comptaRefus)}`);

    // ── 11. Module désactivé ───────────────────────────────────────────────────────────────────────────────────────
    await appel('PUT', `/api/abonnements/client/${clientId}/module-compta`, adminTok, { actif: false });
    r = await appel('GET', '/api/factures/compta', tok);
    const r11 = await appel('POST', `/api/factures/${fac12}/compta`, tok);
    check('11. module désactivé : actif false ; envoyer → 409 MODULE_INACTIF', r.body?.actif === false && r11.status === 409 && r11.body?.code === 'MODULE_INACTIF', `${JSON.stringify(r.body)} ${r11.status} ${JSON.stringify(r11.body)}`);
  } catch (e) {
    console.error(e);
    check('exécution sans exception', false, e.message);
  } finally {
    for (const [cle, valeur] of Object.entries(tarifsAvant)) await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    await nettoyer().catch((e) => console.error('nettoyage :', e.message));
    const ok = results.filter((x) => x.ok).length;
    console.log(`\n${ok}/${results.length} contrôles réussis`);
    await pool.end();
    process.exit(ok === results.length ? 0 : 1);
  }
})();
