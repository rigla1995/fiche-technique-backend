// Lot 2b, B5 — messages et textes écrits en base des comptes et tiers (spec docs/lot-2b-spec.md §6.6, §6.7, §9).
// Sans base de données : le pool, l'envoi d'emails et le SSE sont remplacés par des faux.
//   node --test test/B5-messages.test.js
//
// 1. quotaService : LIBELLES balisés ; message rendu par défaut identique à l'existant, terme du domaine sinon.
// 2. configComposantsService.validerComposition : les 4 messages balisés, rendus par défaut à l'identique.
// 3. Motif « Acheteur supprimé du carnet » (acheteursController.remove) : rendu À L'ÉCRITURE avec req.voc,
//    jamais de balise en base (I7), accord du participe.
// 4. Repli clientNom « Acheteur » de la notification de commande du portail : rendu à l'écriture (I7).
// 5. (vérification du lot) « Au moins un X ou un Y doit être affecté » : participe au féminin seulement si les
//    deux noms le sont ; restauration identique.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const RACINE = path.resolve(__dirname, '..');
const ESSAIS = JSON.parse(fs.readFileSync(path.join(RACINE, 'test/vocab-lexiques-test.json'), 'utf8'));

// ── Faux modules ────────────────────────────────────────────────────────────────────────────────
const requetes = [];
let repondreA = () => ({ rows: [] });
const normal = (sql) => String(sql).replace(/\s+/g, ' ').trim();
const repondre = async (sql, params = []) => {
  const texte = normal(sql);
  requetes.push({ texte, params });
  return repondreA(texte, params);
};
const fauxPool = { query: repondre, connect: async () => ({ query: repondre, release: () => {} }) };
const notifications = [];
const pousses = [];
const remplacer = (relatif, exports) => {
  const chemin = require.resolve(path.join(RACINE, relatif));
  require.cache[chemin] = { id: chemin, filename: chemin, loaded: true, exports, children: [], paths: [] };
};
remplacer('src/config/database', fauxPool);
remplacer('src/services/emailService', { sendInviteEmail: async () => {}, generateInviteToken: () => 'jeton' });
remplacer('src/services/sseService', { pushTo: (id, ev, charge) => pousses.push({ id, ev, charge }), pushToAdmins: () => {} });
remplacer('src/controllers/notificationController', { saveNotification: async (id, charge) => { notifications.push({ id, charge }); } });

const { vocabDefaut, vocabDuLexique, rendre } = require('../src/utils/vocab');
const { checkQuota } = require('../src/services/quotaService');
const { validerComposition } = require('../src/services/configComposantsService');
const acheteurs = require('../src/controllers/acheteursController');
const portail = require('../src/controllers/portailController');

const VOC = { defaut: vocabDefaut, hotellerie: vocabDuLexique(ESSAIS.hotellerie), ceramique: vocabDuLexique(ESSAIS.ceramique), miroir: vocabDuLexique(ESSAIS.miroir) };
const aucuneBalise = (valeur) => assert.ok(!JSON.stringify(valeur).includes('[['), `balise hors point de rendu : ${JSON.stringify(valeur)}`);

const placeholdersCoherents = () => {
  for (const { texte, params } of requetes) {
    const indices = [...texte.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    const max = indices.length ? Math.max(...indices) : 0;
    assert.equal(params.length, max, `paramètres (${params.length}) ≠ placeholders ($${max}) : ${texte.slice(0, 120)}`);
  }
};

const fauxRes = () => ({
  statusCode: 200,
  corps: null,
  status(code) { this.statusCode = code; return this; },
  json(corps) { this.corps = corps; return this; },
  send() { return this; },
});

// ── 1. quotaService ─────────────────────────────────────────────────────────────────────────────
const quota = async (type, max, actuel) => {
  repondreA = (texte) => (texte.includes('FROM abonnements')
    ? { rows: [{ nb_activites: max, nb_labos: max, nb_gerants: max }] }
    : { rows: [{ n: actuel }] });
  requetes.length = 0;
  const r = await checkQuota(fauxPool, 1, type);
  placeholdersCoherents();
  return r;
};

test('quota : message par défaut identique à l\'existant (pluriel > 1 inchangé)', async () => {
  const attendus = [
    ['labo', 2, 'Limite atteinte : votre formule comprend 2 labos — quota entièrement utilisé (2/2). Demandez un avenant pour en ajouter.'],
    ['activite', 1, 'Limite atteinte : votre formule comprend 1 activité — quota entièrement utilisé (1/1). Demandez un avenant pour en ajouter.'],
    ['gerant', 3, 'Limite atteinte : votre formule comprend 3 gérants — quota entièrement utilisé (3/3). Demandez un avenant pour en ajouter.'],
  ];
  for (const [type, max, texte] of attendus) {
    const r = await quota(type, max, max);
    assert.equal(r.code, 'LIMITE_ATTEINTE');
    assert.equal(r.type, type);
    assert.equal(rendre(vocabDefaut, r.message), texte);
  }
});

test('quota : terme du domaine au rendu (Hôtellerie, Céramique, miroir)', async () => {
  const r = await quota('labo', 2, 2);
  assert.match(rendre(VOC.hotellerie, r.message), /comprend 2 cuisines centrales —/);
  assert.match(rendre(VOC.ceramique, r.message), /comprend 2 sites de production —/);
  const g = await quota('gerant', 1, 1);
  assert.match(rendre(VOC.miroir, g.message), /comprend 1 animatrice —/);
  assert.equal(await quota('labo', 3, 2), null);
});

// ── 2. validerComposition ───────────────────────────────────────────────────────────────────────
test('composition : 4 messages balisés, rendus par défaut à l\'identique', () => {
  const messages = (compteurs) => validerComposition({ compteurs }).map((e) => [e.code, rendre(vocabDefaut, e.message)]);
  assert.deepEqual(messages({ nb_activites: 1, nb_labos: 0, nb_gerants: 0, nb_acheteurs: 101 }),
    [['ACHETEURS_QUOTA', 'Quota acheteurs invalide (paliers de 1 à 100)'], ['ACHETEURS_SANS_LABO', "L'option Acheteurs nécessite au moins un labo"]]);
  assert.deepEqual(messages({ nb_activites: 0, nb_labos: 0, nb_gerants: 0, nb_acheteurs: 0 }),
    [['DEPOT_SANS_LABO', 'Un compte sans activité doit avoir au moins un labo (compte dépôt)']]);
  assert.deepEqual(messages({ nb_activites: 0, nb_labos: 1, nb_gerants: 0, nb_acheteurs: 0 }),
    [['DEPOT_SANS_ACHETEURS', "Un labo sans activité nécessite l'option Acheteurs (compte dépôt = labo + acheteurs)"]]);
  const h = validerComposition({ compteurs: { nb_activites: 0, nb_labos: 1, nb_gerants: 0, nb_acheteurs: 0 } });
  assert.equal(rendre(VOC.hotellerie, h[0].message),
    "Une cuisine centrale sans service nécessite l'option Clients professionnels (compte dépôt = cuisine centrale + clients professionnels)");
});

// ── 3. Motif de suppression d'un acheteur, écrit en base ────────────────────────────────────────
const supprimerAcheteur = async (voc) => {
  repondreA = (texte) => {
    if (texte.startsWith('SELECT user_id FROM acheteurs')) return { rows: [{ user_id: null }] };
    if (texte.startsWith('UPDATE commandes_acheteur SET statut')) return { rows: [{ id: 41 }] };
    return { rows: [] };
  };
  requetes.length = 0;
  const res = fauxRes();
  await acheteurs.remove({ params: { id: 9 }, user: { id: 2 }, voc }, res);
  placeholdersCoherents();
  const annulation = requetes.find((r) => r.texte.startsWith('UPDATE commandes_acheteur SET statut'));
  const statut = requetes.find((r) => r.texte.startsWith('INSERT INTO commande_acheteur_statuts'));
  return { res, motifAnnulation: annulation.params[2], motifStatut: statut.params[1] };
};

test('motif « Acheteur supprimé du carnet » : rendu à l\'écriture, sans balise en base', async () => {
  const attendus = {
    defaut: 'Acheteur supprimé du carnet',
    hotellerie: 'Client professionnel supprimé du carnet',
    ceramique: 'Revendeur supprimé du carnet',
    miroir: 'Cliente supprimée du carnet',
  };
  for (const [nom, voc] of Object.entries(VOC)) {
    const { res, motifAnnulation, motifStatut } = await supprimerAcheteur(nom === 'defaut' ? undefined : voc);
    assert.equal(res.statusCode, 200);
    assert.equal(motifAnnulation, attendus[nom], nom);
    assert.equal(motifStatut, attendus[nom], nom);
    assert.equal(res.corps.commandesAnnulees, 1);
  }
});

// ── 4. Repli clientNom de la notification de commande du portail ────────────────────────────────
const commanderAuPortail = async (voc, nomFiche) => {
  repondreA = (texte) => {
    if (texte.startsWith('SELECT * FROM acheteur_offres')) return { rows: [{ article_type: 'ingredient', article_id: 5, prix_unitaire_ht: '10', taux_tva: '19', actif: true, promo_pct: 0, promo_active: false }] };
    if (texte.startsWith('SELECT id, nom FROM articles')) return { rows: [{ id: 5, nom: 'Farine' }] };
    if (texte.startsWith('SELECT nom, entreprise FROM acheteurs')) return { rows: [{ nom: nomFiche, entreprise: null }] };
    if (texte.startsWith('INSERT INTO commandes_acheteur')) return { rows: [{ id: 77 }] };
    return { rows: [] };
  };
  requetes.length = 0;
  notifications.length = 0;
  pousses.length = 0;
  const res = fauxRes();
  await portail.createCommande({ user: { id: 30, acheteurClientId: 2, acheteurId: 9 }, body: { lignes: [{ articleType: 'ingredient', articleId: 5, quantite: 2 }] }, voc }, res);
  await new Promise((ok) => setImmediate(ok));
  placeholdersCoherents();
  return res;
};

test('portail : repli clientNom rendu à l\'écriture (même charge en base et en SSE)', async () => {
  const attendus = { defaut: 'Acheteur', hotellerie: 'Client professionnel', ceramique: 'Revendeur', miroir: 'Cliente' };
  for (const [nom, voc] of Object.entries(VOC)) {
    const res = await commanderAuPortail(nom === 'defaut' ? undefined : voc, null);
    assert.equal(res.statusCode, 201, JSON.stringify(res.corps));
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0].charge.clientNom, attendus[nom], nom);
    assert.equal(pousses[0].charge, notifications[0].charge);
    aucuneBalise(notifications[0].charge);
  }
  await commanderAuPortail(VOC.hotellerie, 'Épicerie Nour');
  assert.equal(notifications[0].charge.clientNom, 'Épicerie Nour');
});

// ── 5. Vérification du lot 2b : « Au moins un X ou un Y doit être affecté » (gerantController create / update) ──
// Deux noms : participe au féminin seulement si les deux le sont. Restauration : identique à l'existant.
test('gérant sans affectation : accord du participe avec deux noms (masculin dès que l\'un l\'est)', async () => {
  const gerants = require('../src/controllers/gerantController');
  const attendus = {
    defaut: 'Au moins une activité ou un labo doit être affecté',
    hotellerie: 'Au moins un service ou une cuisine centrale doit être affecté',
    ceramique: 'Au moins un point de vente ou un site de production doit être affecté',
    miroir: 'Au moins un local ou une usine doit être affecté',
  };
  // deux noms féminins : « affectée »
  const deuxFeminins = vocabDuLexique({ ...ESSAIS.miroir, activite: { ...(ESSAIS.miroir.activite || {}), sg: 'Boutique', pl: 'Boutiques', g: 'f', el: false } });
  for (const [nom, voc, attendu] of [...Object.entries(attendus).map(([d, a]) => [d, VOC[d], a]),
    ['deux féminins', deuxFeminins, 'Au moins une boutique ou une usine doit être affectée']]) {
    const res = fauxRes();
    await gerants.create({ body: { nom: 'G', telephone: '1', email: 'g@test.invalid', activiteIds: [], laboIds: [] }, user: { id: 1 }, voc }, res);
    assert.equal(res.statusCode, 400, nom);
    assert.equal(rendre(voc, res.corps.message), attendu, `create, ${nom}`);
    const res2 = fauxRes();
    repondreA = () => ({ rows: [{ id: 5, gerant_acces_acheteurs: false }] });
    await gerants.update({ params: { id: '5' }, body: { activiteIds: [], laboIds: [] }, user: { id: 1 }, voc }, res2);
    assert.equal(res2.statusCode, 400, `update, ${nom}`);
    assert.equal(rendre(voc, res2.corps.message), attendu, `update, ${nom}`);
  }
  // sans req.voc : branche du labo (texte de l'existant, rendu par défaut au bord)
  const res = fauxRes();
  await gerants.create({ body: { nom: 'G', telephone: '1', email: 'g@test.invalid' }, user: { id: 1 } }, res);
  assert.equal(rendre(vocabDefaut, res.corps.message), attendus.defaut);
});
