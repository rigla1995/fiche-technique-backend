// LabFlow Compta, étape X2 « La clôture de l'exercice » (labflow-reprise/achats-compta/PLAN-EXERCICES.md §2 ligne X2, §3,
// §5 ; réponses du client du 13/10 — « ok pour les 5 »). Tests sans base : les règles pures (montants, clôturable, compte
// du résultat, résultat, plan des deux écritures — bénéfice, perte, 131 déjà porté, détail par tiers —, contrôles,
// affectation), la migration 240, les routes, les exclusions du lettrage et de l'échéancier, la fiche du dossier, le
// paquet (comptes d'affectation), la migration 241 (manuel).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');
const lire = (...p) => fs.readFileSync(path.join(RACINE, ...p), 'utf8').replace(/\r\n/g, '\n');
const C = require('../src/compta/clotureCalcul');
const cloture = require('../src/compta/cloture');
const validation = require('../src/compta/validation');
const paquets = require('../src/compta/paquets');

const K = {
  capital: { compteId: 1, numero: '10131', libelle: 'Capital non amorti', nature: 'capitaux' },
  banque: { compteId: 2, numero: '5321', libelle: 'Banque', nature: 'tresorerie' },
  frs: { compteId: 3, numero: '4011', libelle: 'Fournisseurs', nature: 'fournisseurs' },
  achats: { compteId: 4, numero: '607', libelle: 'Achats de marchandises', nature: 'charges' },
  ventes: { compteId: 5, numero: '707', libelle: 'Ventes de marchandises', nature: 'produits' },
  r131: { id: 6, numero: '131', libelle: 'Résultat bénéficiaire', nature: 'capitaux' },
  r135: { id: 7, numero: '135', libelle: 'Résultat déficitaire', nature: 'capitaux' },
};
const row = (k, solde, tiers = null) => ({ ...k, tiersId: tiers ? tiers.id : null, tiersCode: tiers ? tiers.code : null, tiersNom: tiers ? tiers.nom : null, solde });
const F1 = { id: 11, code: 'F0001', nom: 'Boissons' };
const F2 = { id: 12, code: 'F0002', nom: 'Minoterie' };
const l = (numero, debit, credit, tiers = null) => ({ numero, debit, credit, tiers });
const resume = (lignes) => lignes.map((x) => l(x.compte.numero, C.texteMillimes(x.debit), C.texteMillimes(x.credit), x.tiers ? x.tiers.code : null));

test('montants : millimes entiers depuis un texte à 3 décimales, et retour', () => {
  assert.equal(C.versMillimes('650'), 650000n);
  assert.equal(C.versMillimes('-12.500'), -12500n);
  assert.equal(C.versMillimes('0.5'), 500n);
  assert.equal(C.versMillimes(42n), 42n);
  assert.equal(C.texteMillimes(-12500n), '-12.500');
  assert.equal(C.texteMillimes(0n), '0.000');
  assert.equal(C.fmtMillimes(1234500n), '1 234,500');
  assert.equal(C.fmtMillimes(-600000n), '-600,000');
  assert.throws(() => C.versMillimes('12,5'), /illisible/);
});

test('clôturable : ouvert et fini ; compte du résultat : 131 (bénéfice, nul), 135 (perte)', () => {
  const x = { etat: 'ouvert', debut: '2025-01-01', fin: '2025-12-31' };
  assert.equal(C.peutCloturer(x, '2026-10-14'), true);
  assert.equal(C.peutCloturer(x, '2025-12-31'), false, 'le dernier jour, pas encore');
  assert.equal(C.peutCloturer({ ...x, etat: 'clos' }, '2026-10-14'), false);
  const p = paquets.clotureDe('TN');
  assert.equal(C.numeroCompteResultat(p, 600000n), '131');
  assert.equal(C.numeroCompteResultat(p, 0n), '131');
  assert.equal(C.numeroCompteResultat(p, -1n), '135');
  assert.equal(C.numeroCompteResultat(null, -1n), '135', 'sans paquet : les comptes de la norme');
});

test('résultat : produits − charges sur les soldes (débit − crédit)', () => {
  const r = C.resultatDe([row(K.achats, '400.000'), row(K.ventes, '-1000.000'), row(K.banque, '600.000')]);
  assert.deepEqual(r, { charges: 400000n, produits: 1000000n, resultat: 600000n });
  assert.deepEqual(C.resultatDe([]), { charges: 0n, produits: 0n, resultat: 0n });
});

test('plan de clôture (bénéfice) : gestion soldée vers le 131, à-nouveaux du bilan par tiers, 131 porté', () => {
  // Partie double : capital 10 000 ; fournisseurs 500 ; ventes 1 000 ; achats 500 ; crédit de TVA 300 ; banque 10 700.
  const rows = [row(K.capital, '-10000.000'), row(K.banque, '10700.000'), row(K.frs, '-400.000', F1), row(K.frs, '-100.000', F2), row(K.achats, '500.000'), row(K.ventes, '-1000.000'), row({ ...K.banque, compteId: 8, numero: '43667', libelle: 'Crédit de TVA', nature: 'etat' }, '300.000')];
  assert.equal(rows.reduce((t, r) => t + C.versMillimes(r.solde), 0n), 0n, 'soldes équilibrés');
  const p = C.planCloture(rows, K.r131);
  assert.equal(p.resultat, 500000n);
  assert.equal(p.benefice, true);
  assert.deepEqual(resume(p.lignesResultat), [l('607', '0.000', '500.000'), l('707', '1000.000', '0.000'), l('131', '0.000', '500.000')], 'le 607 (débiteur) se crédite, le 707 se débite, le bénéfice au crédit du 131');
  assert.equal(p.totalResultat, 1000000n);
  assert.deepEqual(resume(p.lignesAN), [l('10131', '0.000', '10000.000'), l('131', '0.000', '500.000'), l('4011', '0.000', '400.000', 'F0001'), l('4011', '0.000', '100.000', 'F0002'), l('43667', '300.000', '0.000'), l('5321', '10700.000', '0.000')], 'bilan repris par tiers, résultat au 131, gestion absente');
  assert.equal(p.totalAN, 11000000n);
  assert.equal(p.lignesAN.reduce((t, x) => t + x.debit - x.credit, 0n), 0n, 'à-nouveaux équilibrés');
});

test('plan de clôture (perte) : contrepartie au débit du 135 ; 131 déjà porté par les à-nouveaux précédents : cumulé', () => {
  const perte = C.planCloture([row(K.frs, '-500.000', F1), row(K.achats, '500.000')], K.r135);
  assert.equal(perte.resultat, -500000n);
  assert.deepEqual(resume(perte.lignesResultat), [l('607', '0.000', '500.000'), l('135', '500.000', '0.000')], 'la contrepartie (perte au débit du 135) ferme l\'écriture');
  assert.deepEqual(resume(perte.lignesAN), [l('135', '500.000', '0.000'), l('4011', '0.000', '500.000', 'F0001')]);
  const cumul = C.planCloture([row({ ...K.r131, compteId: K.r131.id }, '-200.000'), row(K.banque, '500.000'), row(K.ventes, '-300.000')], K.r131);
  assert.deepEqual(resume(cumul.lignesAN), [l('131', '0.000', '500.000'), l('5321', '500.000', '0.000')], 'bénéfice d\'avant non affecté + bénéfice de l\'année');
  const nul = C.planCloture([row(K.achats, '100.000'), row(K.ventes, '-100.000'), row(K.banque, '0.000')], K.r131);
  assert.equal(nul.resultat, 0n);
  assert.deepEqual(resume(nul.lignesResultat), [l('607', '0.000', '100.000'), l('707', '100.000', '0.000')], 'résultat nul : pas de contrepartie');
  assert.deepEqual(nul.lignesAN, [], 'tout est soldé : aucun à-nouveaux');
  const sans = C.planCloture([row(K.achats, '100.000')], null);
  assert.deepEqual(resume(sans.lignesResultat), [l('607', '0.000', '100.000')], 'compte du résultat absent : la contrepartie manque (les contrôles refusent)');
});

test('contrôles : chacun échoue sur son fait, avec quoi faire', () => {
  const ok = { brouillard: 0, periodes: [{ debut: '2025-11-01', etat: 'close' }, { debut: '2025-12-01', etat: 'ouverte' }], desequilibre: 0n, lignesSansTiers: 0, precedent: null, suivant: { millesime: 2026, etat: 'ouvert' }, journalOD: { code: 'OD' }, journalAN: { code: 'AN' }, resultat: 600000n, numeroResultat: '131', compteResultat: { numero: '131', actif: true, feuille: true } };
  const tous = C.controlesDe(ok);
  assert.equal(tous.length, 9);
  assert.ok(tous.every((c) => c.ok && c.detail === ''), JSON.stringify(tous.filter((c) => !c.ok)));
  const ko = (f) => C.controlesDe({ ...ok, ...f }).filter((c) => !c.ok).map((c) => `${c.code}:${c.detail}`);
  assert.match(ko({ brouillard: 2 })[0], /^brouillard:2 écritures en brouillard : validez-les/);
  assert.match(ko({ periodes: [{ debut: '2025-10-01', etat: 'ouverte' }, { debut: '2025-11-01', etat: 'ouverte' }, { debut: '2025-12-01', etat: 'ouverte' }] })[0], /^periodes:2 périodes encore ouvertes : octobre 2025, novembre 2025/);
  assert.deepEqual(ko({ periodes: [{ debut: '2025-12-01', etat: 'ouverte' }] }), [], 'la dernière peut rester ouverte');
  assert.match(ko({ desequilibre: 500n })[0], /^equilibre:Écart de 0,500/);
  assert.match(ko({ lignesSansTiers: 1 })[0], /^tiers:1 ligne validée sur un compte collectif sans tiers/);
  assert.match(ko({ precedent: { millesime: 2024, etat: 'ouvert' } })[0], /^precedent:Clôturez d'abord l'exercice 2024/);
  assert.deepEqual(ko({ precedent: { millesime: 2024, etat: 'clos' } }), []);
  assert.match(ko({ suivant: null })[0], /^suivant:Ouvrez l'exercice suivant/);
  assert.match(ko({ suivant: { millesime: 2026, etat: 'clos' } })[0], /^suivant:L'exercice suivant \(2026\) est clos/);
  assert.match(ko({ journalOD: null })[0], /^journalOD:Créez ou réactivez un journal de type Opérations diverses/);
  assert.match(ko({ journalAN: null })[0], /^journalAN:/);
  assert.match(ko({ compteResultat: null })[0], /^compteResultat:Le compte 131 manque au plan/);
  assert.match(ko({ compteResultat: { numero: '131', actif: false, feuille: true } })[0], /est désactivé/);
  assert.match(ko({ compteResultat: { numero: '131', actif: true, feuille: false } })[0], /a des sous-comptes actifs/);
  assert.deepEqual(ko({ compteResultat: null, resultat: 0n }), [], 'résultat nul : pas de compte du résultat à imputer');
});

test('affectation : un bénéfice se débite au 131 vers les parts, une perte se crédite au 135 depuis les parts', () => {
  const parts = [{ compte: { id: 21, numero: '111', libelle: 'Réserve légale' }, montant: 30000n }, { compte: { id: 22, numero: '121', libelle: 'Résultats reportés' }, montant: 570000n }];
  assert.deepEqual(resume(C.lignesAffectation(600000n, K.r131, parts)), [l('131', '600.000', '0.000'), l('111', '0.000', '30.000'), l('121', '0.000', '570.000')]);
  assert.deepEqual(resume(C.lignesAffectation(-500000n, K.r135, [{ compte: parts[1].compte, montant: 500000n }])), [l('121', '500.000', '0.000'), l('135', '0.000', '500.000')]);
  // Le corps : parts positives, un compte une fois, date facultative.
  assert.deepEqual(cloture.lireAffectation({ lignes: [{ compteId: 21, montant: '30.000' }, { compteId: 22, montant: '570' }] }), { date: null, lignes: [{ compteId: 21, montant: 30000n }, { compteId: 22, montant: 570000n }] });
  assert.equal(cloture.lireAffectation({ date: '2026-06-30', lignes: [{ compteId: 21, montant: '1' }] }).date, '2026-06-30');
  assert.throws(() => cloture.lireAffectation({ lignes: [] }), (e) => e.code === 'PARTS_REQUISES');
  assert.throws(() => cloture.lireAffectation({ lignes: [{ compteId: 21, montant: '1' }, { compteId: 21, montant: '2' }] }), (e) => e.code === 'COMPTE_EN_DOUBLE');
  assert.throws(() => cloture.lireAffectation({ lignes: [{ compteId: 21, montant: '0' }] }), /indiquez un montant/);
  assert.throws(() => cloture.lireAffectation({ date: '30/06/2026', lignes: [{ compteId: 21, montant: '1' }] }), /date invalide/);
});

test('paquet tunisien : comptes d\'affectation présents (réserves, report, dividendes, exploitant), usages connus, paquet sans défaut', () => {
  const c = paquets.clotureDe('TN');
  assert.deepEqual(c.affectation.map((a) => `${a.numero}:${a.usage}`), ['111:benefice', '112:benefice', '118:benefice', '1181:benefice', '121:tous', '447:benefice', '108:tous']);
  assert.deepEqual(paquets.controlerPaquet(paquets.paquetDe('TN')), []);
  const src = lire('src', 'compta', 'paquets', 'index.js');
  assert.ok(src.includes("compte d'affectation ${a.numero} absent du paquet"), 'le contrôle du paquet lit la liste');
});

test('migration 240 : clôture de l\'exercice (qui, quand, résultat, écritures liées en SET NULL), origine « cloture » ; LF, rejouable', () => {
  const brut = fs.readFileSync(path.join(RACINE, 'migrations', '240_compta_cloture.sql'), 'utf8');
  assert.ok(!brut.includes('\r'), 'fins de ligne LF');
  for (const col of ['clos_par INTEGER REFERENCES utilisateurs(id) ON DELETE SET NULL', 'clos_le TIMESTAMPTZ', 'resultat NUMERIC(18,3)', 'ecriture_resultat_id INTEGER REFERENCES compta.ecritures(id) ON DELETE SET NULL', 'ecriture_an_id INTEGER REFERENCES compta.ecritures(id) ON DELETE SET NULL', 'ecriture_affectation_id INTEGER REFERENCES compta.ecritures(id) ON DELETE SET NULL']) {
    assert.ok(brut.includes(`ALTER TABLE compta.exercices ADD COLUMN IF NOT EXISTS ${col};`), col);
  }
  assert.ok(brut.includes('ALTER TABLE compta.ecritures DROP CONSTRAINT IF EXISTS ecritures_origine_check;'));
  assert.ok(brut.includes("CHECK (origine IN ('saisie', 'import', 'contrepassation', 'labflow', 'cloture'));"), 'la liste de la 228, étendue');
  assert.ok(brut.includes("CREATE INDEX IF NOT EXISTS idx_compta_ecritures_cloture ON compta.ecritures (dossier_id, exercice_id) WHERE origine = 'cloture';"));
});

test('migration 241 : manuel seul, trois fiches gardées par empreinte (textes de la 235), nouvelle fiche « Clôture de l\'exercice », sans balise, en LF', () => {
  const sql = fs.readFileSync(path.join(RACINE, 'migrations', '241_manuel_compta_cloture.sql'), 'utf8');
  assert.ok(!sql.includes('\r'), 'fins de ligne LF');
  for (const [slug, garde] of [['compta-dossier', '493ae903eba50e5ebc686e4b5cb6d8b9'], ['compta-periodes', '19a35c9f8320158efa4d23d20e99b71a'], ['compta-livres', '31b685c15ba1ca1eed1e3998f25d176f']]) {
    assert.match(sql, new RegExp(`'${slug}', '${garde}'\\)`), slug);
  }
  assert.match(sql, /md5\(replace\(manuel_sections\.contenu_defaut, chr\(13\), ''\)\) = f\.garde/);
  assert.ok(sql.includes("('compta-cloture', 'Clôture de l''exercice', '🔒', 1076,") && sql.includes("'/cloture')") && sql.includes('ON CONFLICT (slug) DO NOTHING;'), 'nouvelle fiche, ordre après la déclaration mensuelle');
  assert.ok(!/\[\[|\{\{/.test(sql), 'vocabulaire comptable fixe : aucune balise');
  for (const a of ['**Clôturer l\'exercice**', '**Voir la clôture**', 'le titulaire seul clôture', '**détermination du résultat**', '**à-nouveaux**', '**affectation du résultat**', 'compte 128', '**ne se lettrent pas**', 'Les périodes d\'un exercice clos ne rouvrent plus', 'le report provisoire disparaît et les soldes deviennent définitifs']) assert.ok(sql.includes(a), a);
  assert.ok(!sql.includes('arrive à une étape ultérieure). Tant que'), 'la fiche du dossier ne renvoie plus la clôture à plus tard');
});

test('routes X2 : lire (tout accès), clôturer (titulaire seul, sous la limite des dossiers), affecter (droit « configurer ») ; transaction du dossier', () => {
  const routes = lire('src', 'compta', 'routes.js');
  assert.ok(routes.includes("const cloture = require('./cloture');"));
  assert.ok(routes.includes("router.get('/dossiers/:dossierId/exercices/:exerciceId/cloture', authenticate, cloture.lire);"));
  assert.ok(routes.includes("router.post('/dossiers/:dossierId/exercices/:exerciceId/cloturer', authenticate, limiteDossiers, cloture.cloturer);"));
  assert.ok(routes.includes("router.post('/dossiers/:dossierId/exercices/:exerciceId/affectation', authenticate, limiteDossiers, cloture.affecter);"));
  const src = lire('src', 'compta', 'cloture.js');
  assert.ok(src.includes("await transaction(req, 'archiver', MSG_CLOTURER,") && src.includes("await transaction(req, 'configurer', MSG_AFFECTER,"), 'clôturer = titulaire (droit « archiver »), affecter = titulaire ou Complet');
  assert.ok(src.includes("if (d.etat === 'archive') throw erreur(409, 'Dossier archivé : désarchivez-le d\\'abord', 'DOSSIER_ARCHIVE');"));
  assert.ok(src.includes("'DEJA_CLOS'") && src.includes("'EXERCICE_EN_COURS'") && src.includes("'CONTROLES'") && src.includes("'AFFECTATION_EXISTANTE'") && src.includes("'AFFECTATION_INEGALE'") && src.includes("'RESULTAT_NUL'"));
  assert.ok(src.includes("'validee', $10, $10, 'cloture', $11, $11, NOW()) RETURNING id"), 'écritures de clôture validées d\'office, origine « cloture »');
  assert.ok(src.includes("$9, $9, 'saisie', $10) RETURNING id"), 'affectation en brouillard, origine « saisie »');
  assert.ok(src.includes("UPDATE compta.periodes SET etat = 'close', clos_par = $2, clos_le = NOW(), rouvert_par = NULL, rouvert_le = NULL WHERE exercice_id = $1 AND etat = 'ouverte' RETURNING id"), 'la dernière période est close par la clôture');
  assert.ok(src.includes("UPDATE compta.exercices SET etat = 'clos', clos_par = $2, clos_le = NOW(), resultat = $3, ecriture_resultat_id = $4, ecriture_an_id = $5 WHERE id = $1"));
  assert.ok(src.includes("'exercice_clos'") && src.includes("'resultat_affecte'"), 'journal D16');
  assert.equal(typeof validation.prochainRang, 'function', 'numéros définitifs des écritures de clôture : le MAX sous verrou de la validation');
  // Les à-nouveaux vont dans la période du premier jour de l'exercice suivant, close ou non (la seule écriture admise dans une
  // période close) ; la détermination du résultat dans la dernière période de l'exercice clos.
  assert.ok(src.includes("SELECT id FROM compta.periodes WHERE exercice_id = $1 AND $2::date BETWEEN debut AND fin', [b.suivant.id, b.suivant.debut]") && src.includes('periodeId: derniere.id'));
});

test('lettrage, échéancier, carte Tenue : les à-nouveaux de la clôture n\'y comptent pas (ceux d\'une balance importée, si)', () => {
  const lettrage = lire('src', 'compta', 'lettrage.js');
  assert.equal((lettrage.match(/l\.lettrage_id IS NULL AND e\.origine <> 'cloture'/g) || []).length, 2, 'lignes non lettrées et leurs sommes');
  assert.ok(lettrage.includes("e.etat = 'validee' AND e.origine <> 'cloture')::int AS nb_a_lettrer") && lettrage.includes("e.etat = 'brouillard' AND e.origine <> 'cloture')::int AS nb_brouillard"));
  assert.ok(lettrage.includes("if (l.origine === 'cloture') throw erreur(409,") && lettrage.includes("'LIGNE_CLOTURE'"), 'lettrer une ligne de clôture : refusé');
  assert.ok(lire('src', 'compta', 'echeancier.js').includes("l.lettrage_id IS NULL AND e.origine <> 'cloture' AND t.type = $3"));
  assert.ok(lire('src', 'compta', 'configDossier.js').includes("l.tiers_id IS NOT NULL AND l.lettrage_id IS NULL AND e.origine <> 'cloture'"));
  assert.ok(!lettrage.includes("e.origine <> 'import'") && !lire('src', 'compta', 'echeancier.js').includes("e.origine <> 'import'"), 'une balance importée reste lettrable');
});

test('fiche du dossier : chaque exercice dit s\'il est clôturable (ouvert et fini) et, clos, qui, quand, résultat, affectation', () => {
  const src = lire('src', 'compta', 'dossiers.js');
  assert.ok(src.includes("cloturable: x.etat === 'ouvert' && x.fin < aujourdhui,"));
  assert.ok(src.includes("clos: x.etat === 'clos' ? { le: x.clos_le, par: x.clos_par_nom || null, resultat: x.resultat, affectee: x.ecriture_affectation_id != null } : null,"));
  assert.ok(src.includes('FROM compta.exercices x LEFT JOIN utilisateurs u ON u.id = x.clos_par') && src.includes('exercices: ex.rows.map(presenterExercice),'));
});
