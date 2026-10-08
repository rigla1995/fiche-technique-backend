/* Test E2E local — LabFlow Compta, étape S6b « La validation et les périodes » (labflow-reprise/achats-compta/PLAN-S6.md
 * §1 ligne S6b, §2, §4 ; réponses du client du 08/10 — « ok pour les 8 »).
 *   la page des périodes (droits, exercice, 12 périodes ouvertes, comptes rendus) ; valider une écriture (numéro définitif
 *   VT-2026-000001, auteur, heure ; Saisie refusée ; validée = ni modifiée ni supprimée ni revalidée) ; valider la période
 *   (ordre des dates, numéros continus par journal, rien à valider ensuite) ; série sans trou (un brouillard supprimé ne
 *   compte pas) ; contre-passer (écriture inverse validée, liée des deux côtés ; une seule fois ; jamais un brouillard ;
 *   jamais avant l'origine ; Saisie refusée) ; clore (tout validé ; brouillard restant refusé ; Saisie refusée) ; saisir
 *   dans une période close refusé, vraie date acceptée (NC 01 §61), contre-passation datée dedans refusée ; rouvrir
 *   (titulaire seul) puis clore à nouveau ; journal général PDF (validées seulement) ; centralisation ; hooks inchangés ;
 *   dossier archivé ; lecture seule ; journal D16 ; rejeu de la migration 216 ; manuel ; pages d'avant.
 * Crée un super_admin, un cabinet (2 gérants achetés) et deux collaborateurs temporaires ; règle les tarifs Compta le
 * temps de l'essai, puis restaure et nettoie.
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
const brut = async (chemin, jeton) => {
  const r = await fetch(`${BASE}${chemin}`, { headers: { Authorization: `Bearer ${jeton}` } });
  return { status: r.status, type: r.headers.get('content-type'), disposition: r.headers.get('content-disposition'), octets: Buffer.from(await r.arrayBuffer()) };
};
const login = async (email) => appel('POST', '/auth/login', null, { email, password: MDP });
const CLES = ['compta_cabinet_mensuel', 'compta_gerant_cabinet_mensuel', 'compta_mise_en_route', 'compta_module_mensuel', 'compta_gerant_client_mensuel'];

(async () => {
  const hash = await bcrypt.hash(MDP, 10);
  const ADMIN = 'test-admin-compta-s6b@example.com';
  const CABINET = 'test-cabinet-compta-s6b@example.com';
  const SAISIE = 'test-saisie-compta-s6b@example.com';
  const COMPLET = 'test-complet-compta-s6b@example.com';
  const TOUS = [ADMIN, CABINET, SAISIE, COMPLET];
  const avant = Object.fromEntries((await pool.query('SELECT cle, valeur_dt FROM tarifs_config WHERE cle = ANY($1)', [CLES])).rows.map((r) => [r.cle, r.valeur_dt]));
  const wipe = async () => {
    const ids = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = ANY($1)', [TOUS])).rows.map((r) => r.id);
    if (ids.length) {
      const espaces = (await pool.query('SELECT id FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids])).rows.map((r) => r.id);
      await pool.query('DELETE FROM compta.dossiers WHERE espace_id = ANY($1)', [espaces]);
      await pool.query(`DELETE FROM compta.evenements WHERE auteur_id = ANY($1) OR (details->>'titulaire')::int = ANY($1) OR espace_id = ANY($2)`, [ids, espaces]);
      await pool.query('DELETE FROM compta.espaces WHERE titulaire_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM notifications WHERE user_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM support_demandes WHERE client_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM profil_entreprise WHERE client_id = ANY($1)', [ids]);
      await pool.query('DELETE FROM utilisateurs WHERE id = ANY($1)', [ids]);
    }
  };
  const journal = async (espaceId, type) => (await pool.query('SELECT * FROM compta.evenements WHERE espace_id = $1 AND type = $2 ORDER BY id DESC LIMIT 1', [espaceId, type])).rows[0];
  const mode = (id, m) => pool.query('UPDATE abonnements SET mode_compte = $2 WHERE client_id = $1', [id, m]);
  const activer = async (email) => {
    const u = (await pool.query('SELECT id FROM utilisateurs WHERE LOWER(email) = $1', [email])).rows[0];
    await pool.query('UPDATE utilisateurs SET mot_de_passe = $1, activated_at = NOW(), invite_token = NULL, onboarding_step = 0 WHERE id = $2', [hash, u.id]);
    return { id: u.id, tok: (await login(email)).body?.token };
  };
  const IDENTITE_A = { raisonSociale: 'Hôtel Essai S6b', formeJuridique: 'SARL', matriculeFiscal: '1234567A/A/M/000', adresse: '5 rue des Jasmins', ville: '1002 Tunis', representantNom: 'Ali Essai', representantQualite: 'Gérant' };
  const REEL = { personne: 'morale', impot: 'IS', tva: 'reel', exportateurTotal: false, teledeclaration: true, debutActivite: '2020-01-15' };
  const CIVIL = { debut: '2026-01-01', fin: '2026-12-31' };
  const compte = (plan, numero) => plan?.comptes?.find((c) => c.numero === numero);

  try {
    await wipe();
    await pool.query(
      `INSERT INTO utilisateurs (nom, email, mot_de_passe, role, actif, onboarding_step, activated_at)
       VALUES ('TEST Admin S6b', $1, $2, 'super_admin', true, 0, NOW())`, [ADMIN, hash]);
    const adminTok = (await login(ADMIN)).body?.token;
    check('connexion admin', !!adminTok);
    for (const [cle, valeur] of [['compta_cabinet_mensuel', 120], ['compta_gerant_cabinet_mensuel', 30], ['compta_mise_en_route', 0], ['compta_module_mensuel', 60], ['compta_gerant_client_mensuel', 15]]) {
      await pool.query('UPDATE tarifs_config SET valeur_dt = $2 WHERE cle = $1', [cle, valeur]);
    }

    // ── Comptes : un cabinet (2 gérants achetés) avec deux collaborateurs ──
    let r2 = null;
    let r3 = null;
    let r = await appel('POST', '/admin/comptables', adminTok, {
      name: 'TEST Cabinet S6b', email: CABINET, telephone: '20 555 099', raisonSociale: 'Cabinet Essai S6b', formeJuridique: 'SARL',
      adresse: '1 rue de Rome', ville: 'Tunis', representantNom: 'TEST Cabinet S6b', representantQualite: 'Gérant', nbGerants: 2,
    });
    check('création du cabinet (2 gérants achetés)', r.status === 201, `${r.status} ${r.body?.message || ''}`);
    const cabinet = await activer(CABINET);
    const espaceId = (await pool.query(`SELECT id FROM compta.espaces WHERE type = 'cabinet' AND titulaire_id = $1`, [cabinet.id])).rows[0]?.id;
    check('connexion du titulaire', !!cabinet.tok && !!espaceId);
    r = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaboratrice Saisie', email: SAISIE, niveau: 'saisie', dossiers: 'tous' });
    r2 = await appel('POST', '/api/compta/cabinet/gerants', cabinet.tok, { nom: 'Collaborateur Complet', email: COMPLET, niveau: 'complet', dossiers: 'tous' });
    const saisie = await activer(SAISIE);
    const complet = await activer(COMPLET);
    check('collaborateurs Saisie et Complet créés et connectés', r.status === 201 && r2.status === 201 && !!saisie.tok && !!complet.tok, `${r.status} ${r2.status}`);

    // ── Dossier A (réel) : plan, journaux, taxes, tiers ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: IDENTITE_A, regime: REEL, exercice: CIVIL });
    const A = r.body;
    check('dossier A créé (exercice 2026)', r.status === 201 && A?.exercice?.periodes?.length === 12, `${r.status}`);
    const planA = (await appel('GET', `/api/compta/dossiers/${A.id}/plan`, cabinet.tok)).body;
    const K = Object.fromEntries(['607', '6654', '43666', '436711', '4011', '4111', '5321', '432', '707', '622', '5411'].map((n) => [n, compte(planA, n)]));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/taxes`, cabinet.tok);
    const X = Object.fromEntries(['TVA19', 'TIMBRE', 'RS_MAR15'].map((c) => [c, r.body?.taxes?.find((t) => t.code === c)]));
    r = await appel('GET', `/api/compta/dossiers/${A.id}/journaux`, cabinet.tok);
    const J = Object.fromEntries(['AC', 'VT', 'BQ', 'OD'].map((c) => [c, r.body?.journaux?.find((j) => j.code === c)]));
    r = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'fournisseur', nom: 'Société Tunisienne de Boissons', retenueId: X.RS_MAR15?.id, delaiPaiement: 30 });
    const F1 = r.body?.tiers;
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/tiers`, cabinet.tok, { type: 'client', nom: 'Voyages Méditerranée', delaiPaiement: 45 });
    const C1 = r2.body?.tiers;
    check('plan, taxes, journaux et tiers de A', Object.values(K).every(Boolean) && Object.values(X).every(Boolean) && Object.values(J).every(Boolean) && F1?.code === 'F0001' && C1?.code === 'C0001');

    // ── La page des périodes, vide ──
    // Les actions (valider, clore, rouvrir) partent en POST, le reste en GET.
    const periodes = (chemin, jeton) => appel(/\/(valider|clore|rouvrir)$/.test(chemin) ? 'POST' : 'GET', `/api/compta/dossiers/${A.id}/periodes${chemin}`, jeton);
    r = await periodes('', cabinet.tok);
    const P = Object.fromEntries((r.body?.exercice?.periodes || []).map((p) => [p.debut.slice(5, 7), p]));
    check('page des périodes (titulaire) : droits configurer et archiver, exercice 2026, 12 périodes ouvertes, rien en brouillard ni validé',
      r.status === 200 && r.body?.droits?.configurer === true && r.body?.droits?.archiver === true && r.body?.exercice?.etat === 'ouvert' && Object.keys(P).length === 12
      && r.body.exercice.periodes.every((p) => p.etat === 'ouverte' && p.nbBrouillard === 0 && p.nbValidees === 0 && p.totalValidees === '0.000' && p.closLe === null) && r.body?.nb?.brouillard === 0 && r.body?.etatAbonnement === 'actif', `${r.status} ${JSON.stringify(r.body?.droits)} ${r.body?.exercice?.periodes?.[0]?.totalValidees}`);
    r = await periodes('', saisie.tok);
    r2 = await periodes('', complet.tok);
    r3 = await appel('GET', `/api/compta/dossiers/${A.id}/periodes`, adminTok);
    check('Saisie lit (ni configurer ni archiver) ; Complet lit (configurer, pas archiver) ; un étranger : 404', r.status === 200 && r.body?.droits?.configurer === false && r.body?.droits?.archiver === false && r2.status === 200 && r2.body?.droits?.configurer === true && r2.body?.droits?.archiver === false && r3.status === 404, `${r.status} ${r2.status} ${r3.status}`);

    // ── Saisie : trois écritures en mars, une en avril (brouillard) ──
    const ec = (chemin, jeton, corps) => appel('POST', `/api/compta/dossiers/${A.id}/ecritures${chemin}`, jeton, corps);
    const ACHAT = (date, ref) => ({ journalId: J.AC.id, date, reference: ref, libelle: `Facture STB ${ref}`, lignes: [
      { compteId: K['607'].id, debit: '1000', taxeId: X.TVA19.id }, { compteId: K['43666'].id, debit: '190', taxeId: X.TVA19.id }, { compteId: K['6654'].id, debit: '1', taxeId: X.TIMBRE.id },
      { compteId: K['432'].id, credit: '17.850', taxeId: X.RS_MAR15.id }, { compteId: K['4011'].id, tiersId: F1.id, credit: '1173.150', echeance: '2026-04-30' },
    ] });
    r = await ec('', saisie.tok, ACHAT('2026-03-05', 'F-0305'));
    const achat1 = r.body?.ecriture;
    r2 = await ec('', saisie.tok, { journalId: J.VT.id, date: '2026-03-10', reference: 'FV-0310', libelle: 'Séjour Voyages Méditerranée', lignes: [{ compteId: K['4111'].id, tiersId: C1.id, debit: '1190' }, { compteId: K['707'].id, credit: '1000', taxeId: X.TVA19.id }, { compteId: K['436711'].id, credit: '190', taxeId: X.TVA19.id }] });
    const vente = r2.body?.ecriture;
    r3 = await ec('', saisie.tok, { journalId: J.BQ.id, date: '2026-03-20', reference: 'RLV-03', libelle: 'Règlement STB', lignes: [{ compteId: K['4011'].id, tiersId: F1.id, debit: '1173.150' }, { compteId: K['5321'].id, credit: '1173.150' }] });
    const banque = r3.body?.ecriture;
    const r4 = await ec('', saisie.tok, { journalId: J.OD.id, date: '2026-04-10', reference: 'OD-04', libelle: 'Régularisation', lignes: [{ compteId: K['622'].id, debit: '50' }, { compteId: K['5411'].id, credit: '50' }] });
    const od = r4.body?.ecriture;
    check('Saisie : achat (05/03), vente (10/03), banque (20/03), OD (10/04) en brouillard', [r, r2, r3, r4].every((x) => x.status === 201) && achat1?.numeroProvisoire === 'B-000001' && od?.numeroProvisoire === 'B-000004' && achat1?.numero === null && achat1?.validePar === null && achat1?.contrepasseePar === null, `${r.status} ${r2.status} ${r3.status} ${r4.status}`);
    r = await periodes('', cabinet.tok);
    const mars = r.body?.exercice?.periodes?.find((p) => p.debut === '2026-03-01');
    const avril = r.body?.exercice?.periodes?.find((p) => p.debut === '2026-04-01');
    check('périodes : mars 3 en brouillard, avril 1, total validé 0', mars?.nbBrouillard === 3 && mars?.nbValidees === 0 && avril?.nbBrouillard === 1, `${JSON.stringify(mars)}`);

    // ── Valider une écriture ──
    r = await ec(`/${vente.id}/valider`, saisie.tok);
    check('Saisie ne valide pas : 403 NIVEAU_INSUFFISANT (réponse 4 du 08/10)', r.status === 403 && r.body?.code === 'NIVEAU_INSUFFISANT', `${r.status} ${r.body?.code}`);
    r = await ec(`/${vente.id}/valider`, cabinet.tok);
    const venteV = r.body?.ecriture;
    check('titulaire valide la vente : VT-2026-000001, état validée, auteur et heure, lignes rendues, nb validées 1', r.status === 200 && venteV?.numero === 'VT-2026-000001' && venteV?.etat === 'validee' && venteV?.validePar === 'TEST Cabinet S6b' && !!venteV?.valideLe && venteV?.lignes?.length === 3 && r.body?.nb?.validees === 1 && r.body?.nb?.brouillard === 3, `${r.status} ${JSON.stringify(r.body?.ecriture?.numero)} ${r.body?.message || ''}`);
    let ev = await journal(espaceId, 'ecriture_validee');
    check('journal D16 ecriture_validee (numéro provisoire et définitif, journal, date, total)', ev?.details?.numero === 'VT-2026-000001' && ev?.details?.numeroProvisoire === 'B-000002' && ev?.details?.journal === 'VT' && ev?.details?.date === '2026-03-10' && ev?.details?.total === '1190.000' && ev?.auteur_id === cabinet.id, JSON.stringify(ev?.details));
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/ecritures/${vente.id}`, cabinet.tok, { journalId: J.VT.id, date: '2026-03-10', reference: 'FV-0310', libelle: 'Changé', lignes: [{ compteId: K['4111'].id, tiersId: C1.id, debit: '1190' }, { compteId: K['707'].id, credit: '1190' }] });
    r2 = await appel('DELETE', `/api/compta/dossiers/${A.id}/ecritures/${vente.id}`, cabinet.tok);
    r3 = await ec(`/${vente.id}/valider`, cabinet.tok);
    check('validée = définitif : modifier, supprimer, revalider → 409 ECRITURE_VALIDEE', r.status === 409 && r.body?.code === 'ECRITURE_VALIDEE' && r2.status === 409 && r2.body?.code === 'ECRITURE_VALIDEE' && r3.status === 409 && r3.body?.code === 'ECRITURE_VALIDEE', `${r.status} ${r2.status} ${r3.status}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures?periode=${mars.id}`, saisie.tok);
    check('liste filtrée sur mars : période rendue (2 en brouillard, 1 validée), la validée porte son numéro et son auteur', r.status === 200 && r.body?.periode?.id === mars.id && r.body?.periode?.nbBrouillard === 2 && r.body?.periode?.nbValidees === 1 && r.body?.ecritures?.find((e) => e.id === vente.id)?.numero === 'VT-2026-000001' && r.body?.ecritures?.find((e) => e.id === vente.id)?.validePar === 'TEST Cabinet S6b', `${r.status} ${JSON.stringify(r.body?.periode)}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures`, saisie.tok);
    check('liste sans filtre de période : periode null', r.status === 200 && r.body?.periode === null);

    // ── Valider la période ──
    r = await periodes(`/${mars.id}/valider`, saisie.tok);
    check('Saisie ne valide pas la période : 403', r.status === 403, String(r.status));
    r = await periodes(`/${mars.id}/valider`, complet.tok);
    check('Complet valide la période de mars : 2 validées, plus rien en brouillard dans la période', r.status === 200 && r.body?.validees === 2 && r.body?.periode?.nbBrouillard === 0 && r.body?.periode?.nbValidees === 3 && r.body?.nb?.validees === 3 && r.body?.nb?.brouillard === 1, `${r.status} ${JSON.stringify(r.body)}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures/${achat1.id}`, cabinet.tok);
    r2 = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures/${banque.id}`, cabinet.tok);
    check('numéros continus par journal : achat AC-2026-000001 (05/03), banque BQ-2026-000001 ; validées par le collaborateur Complet', r.body?.ecriture?.numero === 'AC-2026-000001' && r2.body?.ecriture?.numero === 'BQ-2026-000001' && r.body?.ecriture?.validePar === 'Collaborateur Complet', `${r.body?.ecriture?.numero} ${r2.body?.ecriture?.numero}`);
    ev = await journal(espaceId, 'periode_validee');
    check('journal D16 periode_validee (nombre, séries par journal, chaque écriture : provisoire → définitif)', ev?.details?.nombre === 2 && ev?.details?.series?.AC?.de === 'AC-2026-000001' && ev?.details?.series?.BQ?.nombre === 1 && ev?.details?.periode === mars.id
      && ev?.details?.ecritures?.length === 2 && ev?.details?.ecritures?.[0]?.id === achat1.id && ev?.details?.ecritures?.[0]?.numeroProvisoire === 'B-000001' && ev?.details?.ecritures?.[0]?.numero === 'AC-2026-000001', JSON.stringify(ev?.details));
    r = await periodes(`/${mars.id}/valider`, cabinet.tok);
    check('valider la période à nouveau : 409 RIEN_A_VALIDER', r.status === 409 && r.body?.code === 'RIEN_A_VALIDER', `${r.status} ${r.body?.code}`);
    // Série sans trou : un achat de mars saisi puis validé → 000002 ; un brouillard d'avril supprimé ne compte pas → le suivant validé → 000003.
    r = await ec('', cabinet.tok, ACHAT('2026-03-25', 'F-0325'));
    const achat2 = r.body?.ecriture;
    r2 = await ec(`/${achat2?.id}/valider`, cabinet.tok);
    r3 = await ec('', cabinet.tok, ACHAT('2026-04-03', 'F-0403-X'));
    const achatX = r3.body?.ecriture;
    await appel('DELETE', `/api/compta/dossiers/${A.id}/ecritures/${achatX?.id}`, cabinet.tok);
    const r5 = await ec('', cabinet.tok, ACHAT('2026-04-06', 'F-0406'));
    const achat3 = r5.body?.ecriture;
    const r6 = await ec(`/${achat3?.id}/valider`, cabinet.tok);
    check('série continue : AC-2026-000002 (25/03) puis, un brouillard d\'avril supprimé entre-temps, AC-2026-000003 (06/04) — aucun trou', r2.body?.ecriture?.numero === 'AC-2026-000002' && r6.body?.ecriture?.numero === 'AC-2026-000003' && achatX?.numeroProvisoire === 'B-000006' && achat3?.numeroProvisoire === 'B-000007', `${r2.body?.ecriture?.numero} ${r6.body?.ecriture?.numero} ${achatX?.numeroProvisoire} ${achat3?.numeroProvisoire}`);

    // ── Contre-passer ──
    r = await ec(`/${achat1.id}/contrepasser`, saisie.tok, {});
    r2 = await ec(`/${od.id}/contrepasser`, cabinet.tok, {});
    r3 = await ec(`/${achat1.id}/contrepasser`, cabinet.tok, { date: '2026-03-04' });
    check('contre-passer refusé : Saisie (403), un brouillard (409 ECRITURE_BROUILLARD), daté avant l\'origine (400 DATE_AVANT_ORIGINE)', r.status === 403 && r2.status === 409 && r2.body?.code === 'ECRITURE_BROUILLARD' && r3.status === 400 && r3.body?.code === 'DATE_AVANT_ORIGINE', `${r.status} ${r2.status} ${r2.body?.code} ${r3.status} ${r3.body?.code}`);
    r = await ec(`/${achat1.id}/contrepasser`, cabinet.tok, { date: '2026-04-02' });
    const inv = r.body?.ecriture;
    const l = (ecr, numero) => ecr?.lignes?.find((x) => x.compte.numero === numero);
    check('titulaire contre-passe AC-2026-000001 au 02/04 : inverse AC-2026-000004 validée, même journal et pièce, libellé « Contre-passation de … », origine liée',
      r.status === 201 && inv?.numero === 'AC-2026-000004' && inv?.etat === 'validee' && inv?.origine === 'contrepassation' && inv?.origineId === achat1.id && inv?.origineNumero === 'AC-2026-000001' && inv?.journal?.code === 'AC' && inv?.reference === 'F-0305' && inv?.libelle === 'Contre-passation de AC-2026-000001 : Facture STB F-0305' && inv?.date === '2026-04-02' && inv?.total === '1191.000' && inv?.numeroProvisoire === 'B-000008', `${r.status} ${JSON.stringify(r.body?.ecriture?.numero)} ${r.body?.message || ''}`);
    check('… lignes inverses : 607 au crédit de 1 000,000, 4011 (F0001) au débit de 1 173,150, 432 (RS_MAR15) au débit de 17,850, sans échéance',
      l(inv, '607')?.credit === '1000.000' && l(inv, '607')?.debit === '0.000' && l(inv, '4011')?.debit === '1173.150' && l(inv, '4011')?.tiers?.code === 'F0001' && l(inv, '4011')?.echeance === null && l(inv, '432')?.debit === '17.850' && l(inv, '432')?.taxe?.code === 'RS_MAR15' && inv?.lignes?.length === 5, JSON.stringify(inv?.lignes?.map((x) => [x.compte.numero, x.debit, x.credit])));
    check('… l\'origine relue porte le lien « annulée par AC-2026-000004 » ; comptes rendus', r.body?.origine?.id === achat1.id && r.body?.origine?.contrepasseePar?.numero === 'AC-2026-000004' && r.body?.origine?.contrepasseePar?.id === inv?.id && r.body?.nb?.validees === 6, JSON.stringify(r.body?.origine?.contrepasseePar));
    ev = await journal(espaceId, 'ecriture_contrepassee');
    check('journal D16 ecriture_contrepassee (origine, contre-passation)', ev?.details?.numero === 'AC-2026-000001' && ev?.details?.contrepassation?.numero === 'AC-2026-000004' && ev?.details?.contrepassation?.date === '2026-04-02', JSON.stringify(ev?.details));
    r = await ec(`/${achat1.id}/contrepasser`, cabinet.tok, {});
    check('contre-passer deux fois : 409 DEJA_CONTREPASSEE', r.status === 409 && r.body?.code === 'DEJA_CONTREPASSEE', `${r.status} ${r.body?.code}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures?journal=${J.AC.id}&etat=validee`, cabinet.tok);
    check('liste des achats validés : 4 (dont la contre-passation, avec son origine, et l\'origine avec son lien)', r.status === 200 && r.body?.total === 4 && r.body?.ecritures?.find((e) => e.id === inv.id)?.origineNumero === 'AC-2026-000001' && r.body?.ecritures?.find((e) => e.id === achat1.id)?.contrepasseePar?.numero === 'AC-2026-000004', `${r.body?.total}`);

    // ── Clore ──
    r = await periodes(`/${avril.id}/clore`, cabinet.tok);
    check('clore avril (1 brouillard) : 409 BROUILLARD_RESTANT', r.status === 409 && r.body?.code === 'BROUILLARD_RESTANT' && /1 écriture en brouillard/.test(r.body?.message || ''), `${r.status} ${r.body?.code} ${r.body?.message || ''}`);
    r = await periodes(`/${mars.id}/clore`, saisie.tok);
    check('Saisie ne clôt pas : 403', r.status === 403, String(r.status));
    r = await periodes(`/${mars.id}/clore`, complet.tok);
    const marsClose = r.body?.exercice?.periodes?.find((p) => p.id === mars.id);
    check('Complet clôt mars (tout validé) : période close, par qui et quand ; la page rendue', r.status === 200 && marsClose?.etat === 'close' && marsClose?.closPar === 'Collaborateur Complet' && !!marsClose?.closLe && marsClose?.rouvertLe === null && marsClose?.nbValidees === 4, `${r.status} ${JSON.stringify(marsClose)}`);
    ev = await journal(espaceId, 'periode_close');
    check('journal D16 periode_close', ev?.details?.periode === mars.id && ev?.details?.nbEcritures === 4 && ev?.auteur_id === complet.id, JSON.stringify(ev?.details));
    r = await periodes(`/${mars.id}/clore`, cabinet.tok);
    check('clore à nouveau : 409 DEJA_FAIT', r.status === 409 && r.body?.code === 'DEJA_FAIT', `${r.status} ${r.body?.code}`);
    r = await ec('', cabinet.tok, ACHAT('2026-03-15', 'F-0315'));
    r2 = await ec(`/${vente.id}/contrepasser`, cabinet.tok, { date: '2026-03-20' });
    check('période close : saisir dedans (409 PERIODE_CLOSE) et contre-passer dedans (409 PERIODE_CLOSE) refusés', r.status === 409 && r.body?.code === 'PERIODE_CLOSE' && r2.status === 409 && r2.body?.code === 'PERIODE_CLOSE', `${r.status} ${r.body?.code} ${r2.status} ${r2.body?.code}`);
    // Vraie date (NC 01 §61) : l'opération du 15/03 s'enregistre au 01/04 avec sa vraie date ; l'échéance se juge sur la vraie date.
    r = await ec('', cabinet.tok, { ...ACHAT('2026-04-01', 'F-0315'), dateReelle: '2026-03-15', lignes: ACHAT('2026-04-01', 'F-0315').lignes.map((x) => (x.echeance ? { ...x, echeance: '2026-03-25' } : x)) });
    const tardive = r.body?.ecriture;
    r2 = await ec('', cabinet.tok, { ...ACHAT('2026-04-01', 'F-0316'), dateReelle: '2026-04-01' });
    r3 = await ec('', cabinet.tok, { ...ACHAT('2026-04-01', 'F-0316'), dateReelle: '2026-04-05' });
    check('vraie date : écriture au 01/04 avec vraie date 15/03 acceptée (échéance 25/03 jugée sur la vraie date) ; vraie date égale ou après la date : 400 DATE_REELLE', r.status === 201 && tardive?.date === '2026-04-01' && tardive?.dateReelle === '2026-03-15' && r2.status === 400 && r2.body?.code === 'DATE_REELLE' && r3.status === 400 && r3.body?.code === 'DATE_REELLE', `${r.status} ${r.body?.message || ''} ${r2.status} ${r3.status}`);
    r = await appel('PUT', `/api/compta/dossiers/${A.id}/ecritures/${tardive?.id}`, cabinet.tok, { ...ACHAT('2026-04-01', 'F-0315'), dateReelle: '' });
    check('modifier : la vraie date se retire (vide)', r.status === 200 && r.body?.ecriture?.dateReelle === null, `${r.status} ${r.body?.ecriture?.dateReelle}`);
    ev = await journal(espaceId, 'ecriture_modifiee');
    check('journal D16 : la vraie date figure dans l\'avant / après', ev?.details?.avant?.dateReelle === '2026-03-15' && ev?.details?.apres?.dateReelle === null, JSON.stringify(ev?.details?.avant?.dateReelle));
    r = await ec(`/${vente.id}/contrepasser`, cabinet.tok, { date: '2026-04-05', libelle: 'Annulation séjour', reference: 'AV-0405' });
    check('contre-passer la vente au 05/04 (période ouverte) : VT-2026-000002, libellé et pièce choisis', r.status === 201 && r.body?.ecriture?.numero === 'VT-2026-000002' && r.body?.ecriture?.libelle === 'Annulation séjour' && r.body?.ecriture?.reference === 'AV-0405' && l(r.body?.ecriture, '4111')?.credit === '1190.000', `${r.status} ${r.body?.ecriture?.numero}`);

    // ── Rouvrir (titulaire seul), puis clore à nouveau ──
    r = await periodes(`/${mars.id}/rouvrir`, complet.tok);
    check('Complet ne rouvre pas : 403 (réponse 5 du 08/10 : titulaire seul)', r.status === 403 && /titulaire/.test(r.body?.message || ''), `${r.status} ${r.body?.message || ''}`);
    r = await periodes(`/${mars.id}/rouvrir`, cabinet.tok);
    let marsR = r.body?.exercice?.periodes?.find((p) => p.id === mars.id);
    check('titulaire rouvre mars : ouverte, réouverture datée et signée, clôture gardée', r.status === 200 && marsR?.etat === 'ouverte' && marsR?.rouvertPar === 'TEST Cabinet S6b' && !!marsR?.rouvertLe && marsR?.closPar === 'Collaborateur Complet', `${r.status} ${JSON.stringify(marsR)}`);
    ev = await journal(espaceId, 'periode_rouverte');
    check('journal D16 periode_rouverte', ev?.details?.periode === mars.id && !!ev?.details?.closeLe && ev?.auteur_id === cabinet.id, JSON.stringify(ev?.details));
    r = await periodes(`/${mars.id}/rouvrir`, cabinet.tok);
    check('rouvrir une période ouverte : 409 DEJA_FAIT', r.status === 409 && r.body?.code === 'DEJA_FAIT', `${r.status} ${r.body?.code}`);
    r = await ec('', saisie.tok, ACHAT('2026-03-28', 'F-0328'));
    const achat4 = r.body?.ecriture;
    check('mars rouvert : une saisie datée dedans passe (brouillard)', r.status === 201 && achat4?.etat === 'brouillard', `${r.status}`);
    r = await periodes(`/${mars.id}/clore`, cabinet.tok);
    r2 = await periodes(`/${mars.id}/valider`, cabinet.tok);
    r3 = await periodes(`/${mars.id}/clore`, cabinet.tok);
    marsR = r3.body?.exercice?.periodes?.find((p) => p.id === mars.id);
    check('clore mars : refusé tant que le brouillard reste (409), puis valider la période (AC-2026-000005) et clore : close par le titulaire, réouverture effacée', r.status === 409 && r2.status === 200 && r2.body?.validees === 1 && r3.status === 200 && marsR?.etat === 'close' && marsR?.closPar === 'TEST Cabinet S6b' && marsR?.rouvertLe === null && marsR?.nbValidees === 5, `${r.status} ${r2.status} ${r3.status} ${JSON.stringify(marsR)}`);
    r = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures/${achat4?.id}`, cabinet.tok);
    check('… l\'achat du 28/03 porte AC-2026-000005', r.body?.ecriture?.numero === 'AC-2026-000005', r.body?.ecriture?.numero);

    // ── Relecture : cloisonnement croisé, Saisie sur rouvrir, vraie date d'une période ouverte, série pleine, chaîne de
    //    contre-passations, PDF de plusieurs pages ──
    r = await appel('POST', `/api/compta/espaces/${espaceId}/dossiers`, cabinet.tok, { identite: { raisonSociale: 'Second dossier S6b', formeJuridique: 'SARL' }, regime: REEL, exercice: CIVIL });
    const B2 = r.body;
    r = await appel('POST', `/api/compta/dossiers/${B2?.id}/periodes/${mars.id}/valider`, cabinet.tok);
    r2 = await appel('POST', `/api/compta/dossiers/${B2?.id}/periodes/${mars.id}/clore`, cabinet.tok);
    r3 = await appel('POST', `/api/compta/dossiers/${B2?.id}/ecritures/${od.id}/valider`, cabinet.tok);
    const r7 = await appel('POST', `/api/compta/dossiers/${B2?.id}/ecritures/${achat1.id}/contrepasser`, cabinet.tok, {});
    const r8 = await appel('GET', `/api/compta/dossiers/${B2?.id}/periodes/${mars.id}`, cabinet.tok);
    const r9 = await brut(`/api/compta/dossiers/${B2?.id}/periodes/${mars.id}/journal-general.pdf`, cabinet.tok);
    check('cloisonnement croisé : une période ou une écriture d\'un AUTRE dossier → 404 sur valider, clore, valider une écriture, contre-passer, centralisation, PDF', [r, r2, r3, r7, r8].every((x) => x.status === 404) && r9.status === 404, `${r.status} ${r2.status} ${r3.status} ${r7.status} ${r8.status} ${r9.status}`);
    r = await periodes(`/${mars.id}/rouvrir`, saisie.tok);
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/periodes/${mars.id}/rouvrir`, adminTok);
    check('Saisie ne rouvre pas (403) ; un étranger : 404', r.status === 403 && r2.status === 404, `${r.status} ${r2.status}`);
    r = await ec('', cabinet.tok, { ...ACHAT('2026-04-10', 'F-0410'), dateReelle: '2026-04-02', lignes: ACHAT('2026-04-10', 'F-0410').lignes.map((x) => (x.echeance ? { ...x, echeance: '2026-05-02' } : x)) });
    check('vraie date dans une période OUVERTE (avril) : 400 DATE_REELLE_OUVERTE (datez l\'écriture à sa vraie date)', r.status === 400 && r.body?.code === 'DATE_REELLE_OUVERTE', `${r.status} ${r.body?.code} ${r.body?.message || ''}`);
    r = await ec('', cabinet.tok, { journalId: J.OD.id, date: '2026-05-05', reference: 'OD-05', libelle: 'OD mai', lignes: [{ compteId: K['622'].id, debit: '10' }, { compteId: K['5411'].id, credit: '10' }] });
    r2 = await ec(`/${r.body?.ecriture?.id}/valider`, cabinet.tok);
    await pool.query(`UPDATE compta.ecritures SET numero = 'OD-2026-999999' WHERE id = $1`, [r.body?.ecriture?.id]);
    r3 = await ec('', cabinet.tok, { journalId: J.OD.id, date: '2026-05-06', reference: 'OD-06', libelle: 'OD mai 2', lignes: [{ compteId: K['622'].id, debit: '10' }, { compteId: K['5411'].id, credit: '10' }] });
    const r10 = await ec(`/${r3.body?.ecriture?.id}/valider`, cabinet.tok);
    await pool.query(`UPDATE compta.ecritures SET numero = 'OD-2026-000001' WHERE id = $1`, [r.body?.ecriture?.id]);
    const r11 = await ec(`/${r3.body?.ecriture?.id}/valider`, cabinet.tok);
    check('série pleine : OD-2026-000001, puis (numéro forcé à 999999 en base) la suivante refusée 409 SERIE_PLEINE, puis OD-2026-000002 une fois la série rétablie', r2.body?.ecriture?.numero === 'OD-2026-000001' && r10.status === 409 && r10.body?.code === 'SERIE_PLEINE' && r11.status === 200 && r11.body?.ecriture?.numero === 'OD-2026-000002', `${r2.body?.ecriture?.numero} ${r10.status} ${r10.body?.code} ${r11.status} ${r11.body?.ecriture?.numero}`);
    r = await ec(`/${inv.id}/contrepasser`, cabinet.tok, { date: '2026-04-20', libelle: 'Rétablissement de la facture' });
    r2 = await appel('GET', `/api/compta/dossiers/${A.id}/ecritures/${inv.id}`, cabinet.tok);
    check('contre-passer une contre-passation (rétablir l\'origine) : permis, AC-2026-000006 annule AC-2026-000004 qui reste « annule AC-2026-000001 »', r.status === 201 && r.body?.ecriture?.numero === 'AC-2026-000006' && r.body?.ecriture?.origineNumero === 'AC-2026-000004' && l(r.body?.ecriture, '607')?.debit === '1000.000' && r2.body?.ecriture?.contrepasseePar?.numero === 'AC-2026-000006' && r2.body?.ecriture?.origineNumero === 'AC-2026-000001', `${r.status} ${r.body?.ecriture?.numero} ${r.body?.message || ''}`);
    const grosses = Array.from({ length: 70 }, (_, i) => ({ compteId: K['622'].id, debit: '1', libelle: `Ligne ${i + 1}` }));
    r = await ec('', cabinet.tok, { journalId: J.OD.id, date: '2026-06-15', reference: 'OD-06-15', libelle: 'Écriture longue', lignes: [...grosses, { compteId: K['5411'].id, credit: '70' }] });
    r2 = await ec(`/${r.body?.ecriture?.id}/valider`, cabinet.tok);
    const pdfJuin = await brut(`/api/compta/dossiers/${A.id}/periodes/${P['06']?.id}/journal-general.pdf`, cabinet.tok);
    const nbPages = (pdfJuin.octets.toString('latin1').match(/\/Type\s*\/Page\b(?!s)/g) || []).length;
    check('journal général de juin (une écriture de 71 lignes validée) : plusieurs pages, numérotées', r.status === 201 && r2.status === 200 && pdfJuin.status === 200 && nbPages >= 2 && new RegExp(`/Count\\s+${nbPages}\\b`).test(pdfJuin.octets.toString('latin1')), `${r.status} ${r2.status} ${pdfJuin.status} ${nbPages} page(s)`);

    // ── Centralisation et journal général ──
    r = await periodes(`/${mars.id}`, saisie.tok);
    const cAC = r.body?.journaux?.find((j) => j.code === 'AC');
    check('centralisation de mars (Saisie lit) : AC 3 écritures (3 573,000 des deux côtés), VT 1, BQ 1 ; totaux égaux ; 0 brouillard', r.status === 200 && r.body?.periode?.id === mars.id && cAC?.nbEcritures === 3 && cAC?.debit === '3573.000' && cAC?.credit === '3573.000' && r.body?.journaux?.find((j) => j.code === 'VT')?.nbEcritures === 1 && r.body?.journaux?.find((j) => j.code === 'BQ')?.nbEcritures === 1
      && r.body?.totaux?.debit === r.body?.totaux?.credit && r.body?.totaux?.nbEcritures === 5 && r.body?.nbBrouillard === 0, `${r.status} ${JSON.stringify(r.body?.journaux)} ${JSON.stringify(r.body?.totaux)}`);
    r = await periodes(`/${avril.id}`, cabinet.tok);
    check('centralisation d\'avril : AC (achat du 06/04, contre-passation, rétablissement), VT (contre-passation) ; brouillards non compris (OD, achat tardif)', r.status === 200 && r.body?.journaux?.find((j) => j.code === 'AC')?.nbEcritures === 3 && r.body?.journaux?.find((j) => j.code === 'VT')?.nbEcritures === 1 && !r.body?.journaux?.some((j) => j.code === 'OD') && r.body?.nbBrouillard === 2, `${JSON.stringify(r.body?.journaux)} ${r.body?.nbBrouillard}`);
    let pdf = await brut(`/api/compta/dossiers/${A.id}/periodes/${mars.id}/journal-general.pdf`, saisie.tok);
    check('journal général de mars (PDF, Saisie lit) : 200, application/pdf, fichier nommé, document PDF de plusieurs Ko', pdf.status === 200 && /application\/pdf/.test(pdf.type || '') && /journal-general-Hotel-Essai-S6b-2026-03\.pdf/.test(pdf.disposition || '') && pdf.octets.subarray(0, 4).toString() === '%PDF' && pdf.octets.length > 3000, `${pdf.status} ${pdf.type} ${pdf.disposition} ${pdf.octets.length}`);
    // Relecture : le pied de page (écrit dans la marge) ne doit pas faire naître de page supplémentaire — une seule page ici.
    check('… le PDF nomme ses pages (/Count, /Page) et n\'en compte qu\'une (le pied de page ne fait pas naître de page)', /\/Count\s+1\b/.test(pdf.octets.toString('latin1')) && (pdf.octets.toString('latin1').match(/\/Type\s*\/Page\b(?!s)/g) || []).length === 1, `${(pdf.octets.toString('latin1').match(/\/Type\s*\/Page\b(?!s)/g) || []).length} page(s)`);
    pdf = await brut(`/api/compta/dossiers/${A.id}/periodes/${avril.id}/journal-general.pdf`, cabinet.tok);
    const pdf2 = await brut(`/api/compta/dossiers/${A.id}/periodes/${P['11']?.id}/journal-general.pdf`, cabinet.tok);
    const pdf3 = await brut(`/api/compta/dossiers/${A.id}/periodes/999999/journal-general.pdf`, cabinet.tok);
    const pdf4 = await brut(`/api/compta/dossiers/${A.id}/periodes/${mars.id}/journal-general.pdf`, adminTok);
    check('journal général d\'avril (période ouverte, brouillards exclus) et de novembre (vide) : 200 ; période inconnue : 404 ; étranger : 404', pdf.status === 200 && pdf2.status === 200 && pdf2.octets.subarray(0, 4).toString() === '%PDF' && pdf3.status === 404 && pdf4.status === 404, `${pdf.status} ${pdf2.status} ${pdf3.status} ${pdf4.status}`);

    // ── Hooks inchangés, dossier archivé, lecture seule ──
    r = await appel('POST', `/api/compta/dossiers/${A.id}/plan/comptes/${K['4011'].id}/desactiver`, cabinet.tok);
    r2 = await appel('POST', `/api/compta/dossiers/${A.id}/journaux/${J.AC.id}/desactiver`, cabinet.tok);
    r3 = await appel('DELETE', `/api/compta/dossiers/${A.id}`, cabinet.tok);
    check('hooks « mouvementé » inchangés : 4011, journal AC, dossier → 409', r.status === 409 && r2.status === 409 && r3.status === 409, `${r.status} ${r2.status} ${r3.status}`);
    await appel('POST', `/api/compta/dossiers/${A.id}/archiver`, cabinet.tok);
    r = await ec(`/${od.id}/valider`, cabinet.tok);
    r2 = await periodes(`/${avril.id}/clore`, cabinet.tok);
    r3 = await periodes('', cabinet.tok);
    check('dossier archivé : valider et clore → 409 DOSSIER_ARCHIVE ; la page des périodes se lit', r.status === 409 && r.body?.code === 'DOSSIER_ARCHIVE' && r2.status === 409 && r2.body?.code === 'DOSSIER_ARCHIVE' && r3.status === 200 && r3.body?.dossier?.etat === 'archive', `${r.status} ${r2.status} ${r3.status}`);
    await appel('POST', `/api/compta/dossiers/${A.id}/desarchiver`, cabinet.tok);
    await mode(cabinet.id, 'read_only');
    r = await ec(`/${od.id}/valider`, cabinet.tok);
    r2 = await periodes(`/${mars.id}/rouvrir`, cabinet.tok);
    r3 = await periodes('', cabinet.tok);
    check('comptabilité en lecture seule : valider, rouvrir → 403 READ_ONLY ; la page se lit (lecture_seule)', r.status === 403 && r.body?.code === 'READ_ONLY' && r2.status === 403 && r3.status === 200 && r3.body?.etatAbonnement === 'lecture_seule', `${r.status} ${r.body?.code} ${r2.status} ${r3.status}`);
    await mode(cabinet.id, 'actif');

    // ── Rejeu de la migration 216 ; manuel ──
    await pool.query(`DELETE FROM _migrations WHERE filename = '216_compta_validation_periodes.sql'`);
    await require('../src/config/migrate')();
    const manuel = (await pool.query(`SELECT slug, contenu_defaut FROM manuel_sections WHERE slug IN ('compta-periodes', 'compta-ecritures', 'compta-dossier') AND produit = 'compta'`)).rows;
    const texte = (slug) => manuel.find((m) => m.slug === slug)?.contenu_defaut || '';
    const marsApres = (await pool.query('SELECT etat, clos_par, clos_le FROM compta.periodes WHERE id = $1', [mars.id])).rows[0];
    check('migration 216 rejouée sans erreur ; mars toujours close et signée ; 14 écritures de A intactes', (await pool.query(`SELECT 1 FROM _migrations WHERE filename = '216_compta_validation_periodes.sql'`)).rows.length === 1 && marsApres?.etat === 'close' && marsApres?.clos_par === cabinet.id
      && (await pool.query('SELECT COUNT(*)::int AS n FROM compta.ecritures WHERE dossier_id = $1', [A.id])).rows[0].n === 14, JSON.stringify(marsApres));
    check('manuel : fiche « Validation et périodes » présente ; « Écritures » (Valider, Contre-passer) et « Fiche du dossier » (Périodes) retouchées, plus d\'« étape suivante »', /## 🔏 Validation et périodes/.test(texte('compta-periodes')) && /\*\*Valider la période\*\*/.test(texte('compta-ecritures')) && /\*\*Contre-passer\*\*/.test(texte('compta-ecritures')) && /page \*\*Périodes\*\*/.test(texte('compta-dossier')) && !manuel.some((m) => /étape suivante/.test(m.contenu_defaut)), manuel.map((m) => m.slug).join(','));

    // ── Les pages d'avant ne changent pas ──
    r = await appel('GET', `/api/compta/dossiers/${A.id}`, cabinet.tok);
    r2 = await appel('GET', `/api/compta/dossiers/${A.id}/journaux`, saisie.tok);
    r3 = await appel('GET', `/api/compta/dossiers/${A.id}/tiers`, saisie.tok);
    check('fiche du dossier (périodes : mars close, 11 ouvertes ; écritures 2 en brouillard, 12 validées), journaux et tiers inchangés', r.status === 200 && r.body?.exercice?.periodes?.filter((p) => p.etat === 'close').length === 1 && r.body?.ecritures?.nbValidees === 12 && r.body?.ecritures?.nbBrouillard === 2 && r2.status === 200 && r2.body?.journaux?.length === 6 && r3.status === 200 && r3.body?.nb?.fournisseur?.total === 1, `${r.status} ${JSON.stringify(r.body?.ecritures)} ${r2.status} ${r3.status}`);
    r = await appel('GET', '/api/compta/acces', complet.tok);
    check('accueil du collaborateur inchangé', r.status === 200 && r.body?.cabinets?.length === 1, JSON.stringify(r.body));
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
