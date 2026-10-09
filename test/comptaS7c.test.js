// LabFlow Compta, étape S7c « Déclaration mensuelle » (labflow-reprise/achats-compta/PLAN-S7.md §1 ligne S7c, §2 « S7c »,
// §4 ; réponses du client du 09/10 — « ok pour les 9 » ; question 7 : pas de vente à l'export pour l'instant). Tests sans
// base : les données du paquet (échéances, TCL, compte de la TVA à payer, lignes saisies à la main) et leur contrôle ;
// l'échéance (15 / 20 / 28, report du week-end) ; la TCL ; l'écriture de liquidation de la TVA ; les lignes et le total de
// la déclaration ; la lecture des demandes ; la forme des requêtes ; la migration 220 et les gardes md5 du manuel ; les
// routes ; les refus avant toute requête ; la carte de la fiche ; le PDF.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const paquets = require('../src/compta/paquets');
const calcul = require('../src/compta/declarationCalcul');
const taxesCalcul = require('../src/compta/taxesCalcul');
const declarations = require('../src/compta/declarations');
const configDossier = require('../src/compta/configDossier');
const routes = require('../src/compta/routes');
const est400 = (e) => e.statusCode === 400;
const reponse = () => {
  const res = { statut: 200, corps: null };
  res.status = (s) => { res.statut = s; return res; };
  res.json = (c) => { res.corps = c; return res; };
  return res;
};
const ECHEANCES = { physique: 15, moraleTeledeclaration: 20, morale: 28 };

test('paquet Tunisie : déclaration (échéances 15 / 20 / 28, TCL 0,2 % / 0,1 % TTC sur les comptes 70, compte de la TVA à payer 43651, cinq lignes à la main) contrôlée ; un défaut est vu', () => {
  const p = paquets.PAQUETS.TN;
  assert.deepEqual(paquets.controlerPaquet(p), []);
  const f = paquets.fiscaliteDe('TN');
  assert.deepEqual(f.declaration.echeances, ECHEANCES);
  assert.deepEqual(f.declaration.tcl, { taux: '0.200', tauxExport: '0.100', comptes: ['70'], assiette: 'ttc' });
  assert.equal(f.tva.compteAPayer, '43651');
  assert.deepEqual(f.declaration.saisies.map((s) => s.cle), ['rs_salaires', 'css', 'tfp', 'foprolos', 'autres']);
  assert.ok(/non confirmé/.test(f.declaration.note), 'assiette de la TCL et report de l\'échéance : à valider');
  const casse = JSON.parse(JSON.stringify(p));
  casse.fiscalite.tva.compteAPayer = '99999';
  casse.fiscalite.declaration.echeances.morale = 31;
  casse.fiscalite.declaration.tcl.assiette = 'brut';
  casse.fiscalite.declaration.tcl.comptes.push('79999');
  casse.fiscalite.declaration.saisies.push({ cle: 'tfp', libelle: 'TFP' });
  const d = paquets.controlerPaquet(casse);
  for (const motif of [/TVA à payer/, /échéance « morale »/, /assiette/, /compte 79999/, /saisie tfp en double/]) assert.ok(d.some((x) => motif.test(x)), `${motif} — ${d.join(' | ')}`);
});

test('échéance : le 15 (personne physique), le 20 (personne morale télédéclarante), le 28 (autre personne morale) du mois suivant ; reportée au lundi un samedi ou un dimanche', () => {
  const e = (regime, fin) => calcul.echeanceDe(regime, fin, ECHEANCES);
  assert.deepEqual(e({ personne: 'morale', teledeclaration: true }, '2026-09-30'), { date: '2026-10-20', legale: '2026-10-20', jour: 20, reportee: false });
  assert.deepEqual(e({ personne: 'morale', teledeclaration: true }, '2026-05-31'), { date: '2026-06-22', legale: '2026-06-20', jour: 20, reportee: true }, 'samedi 20/06 → lundi 22/06');
  assert.equal(e({ personne: 'physique', teledeclaration: true }, '2026-07-31').date, '2026-08-17', 'samedi 15/08 → lundi 17/08');
  assert.equal(e({ personne: 'morale', teledeclaration: false }, '2026-01-31').date, '2026-03-02', 'samedi 28/02 → lundi 02/03');
  assert.equal(e({ personne: 'morale', teledeclaration: false }, '2026-12-31').date, '2027-01-28', 'décembre → janvier de l\'année suivante');
  assert.equal(calcul.echeanceDe({ personne: 'morale' }, '2026-09-30', null), null, 'sans données du paquet : pas d\'échéance');
  assert.equal(calcul.libelleMois('2026-08-31'), 'août 2026');
  assert.deepEqual([calcul.deMois('2026-10-31'), calcul.deMois('2026-09-30')], ['d\'octobre 2026', 'de septembre 2026']);
});

test('TCL : taux du paquet sur le chiffre d\'affaires du mois, TVA collectée comprise si l\'assiette est TTC ; exportateur total à 0,1 % ; arrondi au millime ; jamais négative', () => {
  const tcl = paquets.fiscaliteDe('TN').declaration.tcl;
  assert.deepEqual(calcul.tclDe({ ca: '10000.000', tvaCollectee: '1900.000', tcl }), { ca: '10000.000', tvaCollectee: '1900.000', base: '11900.000', assiette: 'ttc', taux: '0.200', exportateur: false, montant: '23.800' });
  assert.equal(calcul.tclDe({ ca: '10000.000', tvaCollectee: '1900.000', tcl: { ...tcl, assiette: 'ht' } }).montant, '20.000');
  assert.equal(calcul.tclDe({ ca: '10000.000', tvaCollectee: '1900.000', tcl, exportateur: true }).montant, '11.900');
  assert.equal(calcul.tclDe({ ca: '1234.567', tvaCollectee: '0', tcl }).montant, '2.469', '2,469134 → 2,469');
  assert.equal(calcul.tclDe({ ca: '-500.000', tvaCollectee: '0', tcl }).montant, '0.000', 'avoirs supérieurs aux ventes : pas de TCL négative');
  assert.equal(calcul.tclDe({ ca: '1', tvaCollectee: '0', tcl: null }), null);
});

test('écriture de liquidation : chaque compte de TVA du mois soldé, crédit reporté imputé, TVA à payer (43651) ou crédit à reporter (43667) ; équilibrée ; écart refusé', () => {
  const comptes = [{ compte_id: 1, numero: '43662', nature: 'tva_deductible', solde: '50.000' }, { compte_id: 2, numero: '43665', nature: 'tva_deductible', subie: true, solde: '47.500' }, { compte_id: 3, numero: '43666', nature: 'tva_deductible', solde: '634.000' }, { compte_id: 4, numero: '436711', nature: 'tva_collectee', solde: '-190.000' }];
  const K = { compteCredit: { id: 9, numero: '43667' }, compteAPayer: { id: 8, numero: '43651' } };
  // Retenue de TVA subie au 43665 (nature déductible) : collectée 190, déductible 684 (dont immobilisations 50), subie 47,5,
  // crédit reporté 152 → crédit à reporter 693,5.
  let l = calcul.lignesLiquidation({ comptes: comptes.map((c) => (c.numero === '43665' ? { ...c } : c)), collectee: '190.000', deductible: '684.000', retenuesSubies: '47.500', creditReporte: '152.000', resultat: '-693.500', ...K, mois: '2026-09-30' });
  assert.equal(l.ecart, false);
  assert.deepEqual(l.lignes.map((x) => [x.numero, String(x.debit), String(x.credit), x.libelle]), [
    ['43662', '0', '50000', 'TVA déductible de septembre 2026'], ['43665', '0', '47500', 'Retenue de TVA subie de septembre 2026'], ['43666', '0', '634000', 'TVA déductible de septembre 2026'],
    ['436711', '190000', '0', 'TVA collectée de septembre 2026'], ['43667', '0', '152000', 'Crédit de TVA reporté imputé de septembre 2026'], ['43667', '693500', '0', 'Crédit de TVA à reporter de septembre 2026'],
  ]);
  assert.equal(l.total, 883500n);
  // TVA à payer : collectée 1 000, déductible 300 → 700 au 43651.
  l = calcul.lignesLiquidation({ comptes: [{ compte_id: 4, numero: '436711', nature: 'tva_collectee', solde: '-1000.000' }, { compte_id: 3, numero: '43666', nature: 'tva_deductible', solde: '300.000' }], collectee: '1000.000', deductible: '300.000', retenuesSubies: '0', creditReporte: '0', resultat: '700.000', ...K, mois: '2026-10-31' });
  assert.deepEqual([l.ecart, l.lignes.map((x) => `${x.numero}:${x.debit}:${x.credit}`).join(' ')], [false, '436711:1000000:0 43666:0:300000 43651:0:700000']);
  // Un compte qui ne rejoint pas l'état : écart (refus de la proposition).
  l = calcul.lignesLiquidation({ comptes: [{ compte_id: 4, numero: '436711', nature: 'tva_collectee', solde: '-999.000' }], collectee: '1000.000', deductible: '0', retenuesSubies: '0', creditReporte: '0', resultat: '1000.000', ...K, mois: '2026-10-31' });
  assert.equal(l.ecart, true);
  assert.deepEqual(calcul.lignesLiquidation({ comptes: [], collectee: '0', deductible: '0', retenuesSubies: '0', creditReporte: '0', resultat: '0', ...K, mois: '2026-10-31' }).lignes, [], 'rien à liquider');
});

test('lignes de la déclaration (ordre du portail), total, comparaison avec l\'état figé', () => {
  const base = {
    tva: { aPayer: '700.000' },
    retenues: { natures: [{ cle: 'RS7_000001', codeTej: 'RS7_000001', libelle: 'Retenue achats 1,5 %', montant: '17.850' }], tva: [{ code: 'RSTVA100', libelle: 'Retenue de TVA de 100 %', montant: '190.000' }] },
    collectees: { timbre: { montant: '3.000', nb: 3 }, fodec: { montant: '0.000', nb: 0 }, avance: { montant: '0.000', nb: 0 } },
    tcl: { taux: '0.200', assiette: 'ttc', montant: '23.800' },
    declaration: null,
    saisiesDef: paquets.fiscaliteDe('TN').declaration.saisies,
  };
  let lignes = declarations.lignesDe(base);
  assert.deepEqual(lignes.map((l) => l.cle), ['tva', 'rs:RS7_000001', 'rstva:RSTVA100', 'timbre', 'tcl', 'saisie:rs_salaires', 'saisie:css', 'saisie:tfp', 'saisie:foprolos', 'saisie:autres']);
  assert.equal(calcul.totalDe(lignes), '934.650');
  assert.equal(lignes.find((l) => l.cle === 'timbre').libelle, 'Droit de timbre collecté (3 pièces)');
  lignes = declarations.lignesDe({ ...base, collectees: { ...base.collectees, fodec: { montant: '10.000', nb: 1 }, avance: { montant: '5.000', nb: 1 } }, declaration: { saisies: { tfp: '120.000' }, tcl: '50.000' } });
  assert.deepEqual(lignes.slice(3, 7).map((l) => l.cle), ['avances', 'timbre', 'fodec', 'tcl'], 'avances et FODEC seulement quand il y en a');
  assert.equal(lignes.find((l) => l.cle === 'tcl').montant, '50.000');
  assert.ok(lignes.find((l) => l.cle === 'tcl').corrigee && /montant corrigé/.test(lignes.find((l) => l.cle === 'tcl').libelle));
  assert.equal(lignes.find((l) => l.cle === 'saisie:tfp').montant, '120.000');
  assert.equal(calcul.memesLignes([{ cle: 'tva', montant: '700.000' }, { cle: 'tcl', montant: '0.000' }], [{ cle: 'tva', montant: '700' }]), true, 'les lignes à zéro ne comptent pas');
  assert.equal(calcul.memesLignes([{ cle: 'tva', montant: '700.000' }], [{ cle: 'tva', montant: '700.001' }]), false);
});

test('demandes : préparation (lignes du paquet, montants positifs, vide = rien ; TCL vide = calculée), marque (date après la fin de la période, jamais après aujourd\'hui) — refus avant toute requête', () => {
  const def = paquets.fiscaliteDe('TN').declaration.saisies;
  assert.deepEqual(declarations.lirePreparation({ saisies: { tfp: '1 234,5', foprolos: '', css: null }, tcl: '' }, def), { saisies: { tfp: '1234.500' }, tcl: null });
  assert.deepEqual(declarations.lirePreparation({ tcl: '12' }, def), { saisies: {}, tcl: '12.000' });
  for (const corps of [{ saisies: { inconnue: '1' } }, { saisies: { tfp: '-1' } }, { saisies: { tfp: 'abc' } }, { saisies: [] }, { tcl: '1.2345' }, null]) assert.throws(() => declarations.lirePreparation(corps, def), est400, JSON.stringify(corps));
  const p = { fin: '2026-09-30' };
  assert.deepEqual(declarations.lireMarque({ date: '2026-10-18', attendu: '934.650' }, p, '2026-10-20'), { date: '2026-10-18', attendu: '934.650' });
  for (const corps of [{ date: '2026-10-21' }, { date: '2026-09-30' }, { date: '18/10/2026' }, { date: '2026-02-30' }, {}]) assert.throws(() => declarations.lireMarque(corps, p, '2026-10-20'), (e) => est400(e) && e.code === 'DATE_DEPOT', JSON.stringify(corps));
  assert.deepEqual(declarations.lireParametres({ periode: '12' }), { periodeId: 12 });
  assert.throws(() => declarations.lireParametres({ periode: 'x' }), (e) => e.statusCode === 404);
  const ex = [{ id: 2, periodes: [{ id: 21, debut: '2027-01-01', fin: '2027-01-31' }] }, { id: 1, periodes: [{ id: 11, debut: '2026-09-01', fin: '2026-09-30' }, { id: 12, debut: '2026-10-01', fin: '2026-10-31' }, { id: 13, debut: '2026-11-01', fin: '2026-11-30' }] }];
  assert.equal(declarations.periodeParDefaut(ex, '2026-10-09').periode.id, 11, 'la dernière période finie');
  assert.equal(declarations.periodeParDefaut(ex, '2026-08-01').periode.id, 21, 'aucune finie : la première de la liste');
});

test('requêtes : chaque paramètre employé ; écritures validées hors à-nouveaux ; collectés hors côté achat ; liquidation comme l\'état ; l\'écriture de liquidation n\'est pas « TVA sans code »', () => {
  const tous = Object.fromEntries(Object.entries(declarations).filter(([k]) => k.startsWith('SQL_')));
  tous.SQL_A_DECLARER = configDossier.SQL_A_DECLARER;
  for (const [nom, sql] of Object.entries(tous)) {
    const n = Math.max(0, ...[...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
    for (let i = 1; i <= n; i += 1) assert.ok(sql.includes(`$${i}`), `${nom} : $${i} employé`);
  }
  for (const nom of ['SQL_CA', 'SQL_TAXES_COLLECTEES', 'SQL_COMPTES_TVA']) assert.ok(declarations[nom].includes("e.etat = 'validee'") && declarations[nom].includes("j.type <> 'an'"), nom);
  assert.ok(declarations.SQL_TAXES_COLLECTEES.includes("k.nature NOT IN ('charges', 'stocks', 'immobilisations', 'retenues_subies')"));
  assert.ok(declarations.SQL_COMPTES_TVA.includes("x.type = 'tva' AND k.nature = 'tva_deductible'") && declarations.SQL_COMPTES_TVA.includes("k.nature NOT IN ('tva_collectee', 'retenues_operees')"));
  assert.ok(declarations.SQL_CA.includes('k.numero LIKE ANY ($3::text[])'));
  assert.ok(taxesCalcul.SQL_TVA_SANS_CODE.includes('NOT EXISTS (SELECT 1 FROM compta.declarations dc WHERE dc.dossier_id = l.dossier_id AND dc.ecriture_id IN (e.id, e.origine_id))'));
  const src = lire('src', 'compta', 'declarations.js');
  assert.ok(!/parseFloat|toFixed/.test(src) && !/parseFloat|toFixed/.test(lire('src', 'compta', 'declarationCalcul.js')), 'jamais de flottant sur un montant');
  assert.ok(!/require\(/.test(lire('src', 'compta', 'declarationCalcul.js').replace("require('./taxesCalcul')", '')), 'calcul sans dépendance hors taxesCalcul (fiche du dossier sans cycle)');
  assert.ok(src.includes("if (!droits(acces).configurer) throw erreur(403, MSG_DECLARATION, 'NIVEAU_INSUFFISANT');") && src.includes("if (d.etat === 'archive')"));
  for (const t of ["'declaration_preparee'", "'ecriture_creee'", "'ecriture_tva_proposee'", "'declaration_marquee'", "'declaration_demarquee'"]) assert.ok(src.includes(t), `journal D16 : ${t}`);
  assert.ok(src.includes("throw erreur(409, 'Période introuvable : relisez la page', 'PERIODE_INTROUVABLE')"), 'dans la transaction, jamais de 404');
  assert.ok(src.includes("VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10, 'saisie', $11) RETURNING id") && src.includes('prochain_provisoire = prochain_provisoire + 1'), 'l\'écriture proposée est un brouillard comme une saisie');
  assert.ok((src.match(/await lectureDossier\(req\.user, req\.params\.dossierId\)/g) || []).length === 3, 'trois lectures');
});

test('migration 220 : déclarations (une par période, marque et état figé ensemble) ; manuel sous gardes md5 (219), fiche 1075', () => {
  const brut = fs.readFileSync(path.join(RACINE, 'migrations', '220_compta_declarations.sql'), 'utf8');
  assert.ok(!brut.includes('\r'), 'fins de ligne LF');
  const sql = brut;
  assert.ok(sql.includes('CREATE TABLE IF NOT EXISTS compta.declarations (') && sql.includes('UNIQUE (dossier_id, periode_id)') && sql.includes('CHECK ((declaree_le IS NULL) = (marquee_le IS NULL))') && sql.includes('CHECK ((declaree_le IS NULL) = (montants IS NULL))'));
  assert.ok(sql.includes('ecriture_id   INTEGER REFERENCES compta.ecritures(id) ON DELETE SET NULL') && sql.includes('tcl           NUMERIC(18,3) CHECK (tcl IS NULL OR tcl >= 0)'));
  assert.ok(!/DROP |DELETE FROM|TRUNCATE|UPDATE compta\./.test(sql), 'additive');
  assert.ok(!/\[\[/.test(sql), 'jamais de balise de vocabulaire dans une fiche Compta');
  const texteDe = (fichier, marque) => {
    const s = lire('migrations', fichier);
    const debut = s.indexOf(marque) + marque.length;
    return s.slice(debut, s.indexOf(marque, debut));
  };
  const md5 = (t) => crypto.createHash('md5').update(t, 'utf8').digest('hex');
  for (const [marque, slug, marqueOrigine, attendus] of [
    ['$f220a$', 'compta-dossier', '$f219b$', ['La ligne **Déclaration mensuelle** montre le mois à déclarer']],
    ['$f220b$', 'compta-taxes-mois', '$f219d$', ['proposée par la page **Déclaration mensuelle** ne l\'est pas', '(page **Déclaration mensuelle**)']],
  ]) {
    const avant = texteDe('219_compta_taxes_certificats.sql', marqueOrigine);
    assert.ok(sql.includes(`${marque}, '${slug}', '${md5(avant)}')`), `${slug} : garde = md5 du texte de la 219`);
    const t = texteDe('220_compta_declarations.sql', marque);
    for (const a of attendus) assert.ok(t.includes(a), `${slug} : « ${a} »`);
    assert.ok(t.length > avant.length);
  }
  assert.ok(sql.includes("('compta-declaration', 'Déclaration mensuelle', '🗓️', 1075, $f220c$## 🗓️ Déclaration mensuelle") && sql.includes("'/declaration')") && sql.includes('ON CONFLICT (slug) DO NOTHING'));
  const fiche = texteDe('220_compta_declarations.sql', '$f220c$');
  for (const a of ['impots.finances.gov.tn', '**TVA à payer**', '**retenues à la source par nature**', '**droit de timbre collecté**', '**TCL**', '**saisies à la main**', '**total à payer**', 'le 15 pour une personne physique, le 20', '**Proposer l\'écriture de TVA**', '**brouillard**', '**Marquer comme déclarée**', '**Retirer la marque**', 'Complet', 'à faire valider par un comptable']) assert.ok(fiche.includes(a), `fiche : « ${a} »`);
});

test('routes : la page, l\'export, le PDF (lecture) ; préparer, proposer l\'écriture de TVA, marquer, retirer la marque (sous la limite de la saisie, sous la garde)', () => {
  const src = lire('src', 'compta', 'routes.js');
  for (const r of [
    "router.get('/dossiers/:dossierId/declaration', authenticate, declarations.lire);",
    "router.get('/dossiers/:dossierId/declaration/export', authenticate, limiteLivres, declarations.exporter);",
    "router.get('/dossiers/:dossierId/declaration/pdf', authenticate, limiteDocuments, declarations.pdf);",
    "router.put('/dossiers/:dossierId/declaration/:periodeId', authenticate, limiteEcritures, declarations.preparer);",
    "router.post('/dossiers/:dossierId/declaration/:periodeId/ecriture-tva', authenticate, limiteEcritures, declarations.proposerEcriture);",
    "router.post('/dossiers/:dossierId/declaration/:periodeId/marquer', authenticate, limiteEcritures, declarations.marquer);",
    "router.post('/dossiers/:dossierId/declaration/:periodeId/demarquer', authenticate, limiteEcritures, declarations.demarquer);",
  ]) assert.ok(src.includes(r), r);
  assert.ok(!routes.ECRITURES_SANS_GARDE.some((r) => /declaration/.test(r)), 'les quatre écritures passent par la garde');
});

test('refus avant toute requête : période invalide (404), demandes illisibles (400)', async () => {
  const user = { id: 1 };
  for (const [fn, req, statut] of [
    [declarations.lire, { user, params: { dossierId: '1' }, query: { periode: 'x' } }, 404],
    [declarations.pdf, { user, params: { dossierId: '1' }, query: { periode: '-2' } }, 404],
    [declarations.preparer, { user, params: { dossierId: '1', periodeId: 'x' }, body: {} }, 404],
    [declarations.proposerEcriture, { user, params: { dossierId: '1', periodeId: '1.5' } }, 404],
    [declarations.marquer, { user, params: { dossierId: '1', periodeId: 'abc' }, body: { date: '2026-10-01' } }, 404],
    [declarations.demarquer, { user, params: { dossierId: '1', periodeId: '' } }, 404],
  ]) {
    const res = reponse();
    await fn(req, res);
    assert.equal(res.statut, statut, `${fn.name} ${JSON.stringify(req.params)} ${JSON.stringify(res.corps)}`);
  }
});

test('fiche du dossier : la déclaration à faire (dernière période finie, échéance, date de déclaration) dans la carte Taxes', () => {
  const src = lire('src', 'compta', 'configDossier.js');
  assert.ok(src.includes("const { echeanceDe } = require('./declarationCalcul');") && src.includes('WHERE x.dossier_id = $1 AND p.fin < $2::date') && src.includes('aProduire, certificatsMois: certificats.rows[0].n, declaration };'));
});

test('PDF de l\'état préparatoire : identité, lignes, total, TVA, retenues, mentions', async () => {
  const e = {
    periode: { id: 1, debut: '2026-09-01', fin: '2026-09-30', etat: 'close' }, echeance: { date: '2026-10-20' },
    lignes: [{ rubrique: 'TVA', libelle: 'TVA à payer', montant: '700.000' }, { rubrique: 'Retenues à la source', libelle: 'RS7_000001 — Retenue achats', montant: '17.850' }],
    total: '717.850', declaration: { marque: { date: '2026-10-18', par: 'Ali', total: '717.850' } },
    tva: { collectee: '1000.000', deductibleBs: '300.000', deductibleImmo: '0.000', retenuesSubies: '0.000', creditReporte: '0.000', resultat: '700.000', aPayer: '700.000', creditAReporter: '0.000' },
    retenues: { natures: [{ codeTej: 'RS7_000001', code: 'RS_MAR15', libelle: 'Retenue achats', base: '1190.000', aCertifier: '0.000', montant: '17.850' }], tva: [] },
    signalements: [{ gravite: 'attention', message: 'Période encore ouverte' }],
  };
  const pdf = await declarations.construirePdf({ nom: 'Hôtel Essai', raison_sociale: 'Hôtel Essai SARL', matricule_fiscal: '1234567A/A/M/000' }, e);
  assert.ok(Buffer.isBuffer(pdf) && pdf.slice(0, 5).toString() === '%PDF-');
});
