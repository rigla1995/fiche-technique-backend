// Lot 2b, B1 — assistant : outils, prompt, glossaire, requêtes des outils get_ventes / get_transferts
// (spec docs/lot-2b-spec.md §6.1, §6.2, §7.1 à §7.3).
// Sans base de données ni réseau : le pool est remplacé par un faux qui enregistre chaque requête.
//  - lexique par défaut : JSON des outils et prompt IDENTIQUES à la référence de sortie (restauration) ;
//  - glossaire : absent par défaut ; en Hôtellerie, une seule ligne « « ingrédient » … », et « Spa » ;
//  - get_ventes : le repli « Prestataire » est un paramètre PROPRE à la requête des canaux ;
//  - get_transferts : marqueur « (labo) » assemblé en JS, mêmes clés dans le même ordre.
//   node --test test/B1-assistant.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const requetes = [];
let lignesTransferts = [];
const fauxPool = {
  query: async (sql, params = []) => {
    const texte = String(sql).replace(/\s+/g, ' ').trim();
    requetes.push({ texte, params });
    if (texte.includes('FROM labo_transfers lt')) return { rows: lignesTransferts.map((r) => ({ ...r })) };
    if (texte.includes('AS canal')) return { rows: [{ canal: 'Direct', nb_ventes: '1', ca_ttc: '5' }] };
    return { rows: [] };
  },
};
const cheminPool = require.resolve('../src/config/database');
require.cache[cheminPool] = { id: cheminPool, filename: cheminPool, loaded: true, exports: fauxPool, children: [], paths: [] };

const outilsIA = require('../src/services/aiToolHandlers');
const { buildSystemPrompt, glossaireVocabulaire } = require('../src/services/aiService');
const { vocabDefaut, creerVocab, resoudreLexique } = require('../src/utils/vocab');
const { LEXIQUE_DEFAUT } = require('../src/config/lexiqueDefaut');

const ESSAIS = JSON.parse(fs.readFileSync(path.join(__dirname, 'vocab-lexiques-test.json'), 'utf8'));
const lexiques = {
  hotellerie: resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.hotellerie),
  ceramique: resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.ceramique),
  miroir: resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.miroir),
};
const V = Object.fromEntries(Object.entries(lexiques).map(([d, l]) => [d, creerVocab(l)]));
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'vocab-baseline', 'restauration.json'), 'utf8')).captures;
// Masques de la capture (scripts/capture-vocab-baseline.js) : dates (AAAA-MM-JJ, « 2 octobre 2026 ») et ids « n= ».
const masquer = (s) => s.replace(/(?<!\d)\d{4}-\d{2}-\d{2}(?!\d)/g, '⟨date⟩').replace(/Aujourd'hui : [^.\n]+\./, "Aujourd'hui : ⟨date⟩.")
  .replace(/(?<![\w.])\d+=(?=\S)/g, '⟨id⟩=');

const composant = (code, type, libelle, pl, genre = 'm') => ({ code, typeTechnique: type, libelle, libellePluriel: pl, genre, elision: null, actif: true });
const COMPOSANTS_HOTEL = [
  composant('restaurant', 'activite', 'Restaurant', 'Restaurants'), composant('bar', 'activite', 'Bar', 'Bars'),
  composant('room_service', 'activite', 'Room service', 'Room services'), composant('housekeeping', 'activite', 'Housekeeping', 'Housekeeping'),
  composant('spa', 'activite', 'Spa', 'Spas'), composant('cuisine', 'labo', 'Cuisine', 'Cuisines', 'f'),
  composant('economat', 'labo', 'Économat / Logistique', 'Économats / Logistique'),
  composant('responsable', 'gerant', 'Responsable de service', 'Responsables de service'),
  composant('client_pro', 'acheteurs', 'Client professionnel', 'Clients professionnels'),
];
const COMPOSANTS_RESTAU = [
  composant('activite', 'activite', 'Activité', 'Activités', 'f'), composant('labo', 'labo', 'Labo', 'Labos'),
  composant('gerant', 'gerant', 'Gérant', 'Gérants'), composant('acheteurs', 'acheteurs', 'Base acheteurs', 'Base acheteurs', 'f'),
];
const LIGNE_FIXE = 'Client: Oracle | Mode du compte: actif | Activités: 1=Alpha, 2=Beta | Labos: 3=Gamma';

// Chaque $n employé a sa valeur, et aucune valeur n'est en trop (sinon Postgres refuse la requête).
const placeholdersCoherents = (liste) => {
  for (const { texte, params } of liste) {
    const indices = [...texte.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
    const max = indices.length ? Math.max(...indices) : 0;
    assert.equal(params.length, max, `paramètres (${params.length}) ≠ placeholders ($${max}) : ${texte.slice(0, 120)}`);
  }
};

test('toolsFor(vocabDefaut) : JSON identique à la référence de sortie (ancien TOOLS_OPENAI), mémoïsé', () => {
  assert.equal(masquer(JSON.stringify(outilsIA.toolsFor(vocabDefaut))), JSON.stringify(REF.outils.json));
  // les exemples de date (masqués dans la référence) sont restés ceux d'origine
  const brut = JSON.stringify(outilsIA.toolsFor(vocabDefaut));
  assert.ok(brut.includes('Date de début ISO 8601 (ex: 2025-01-01)') && brut.includes('Date de fin ISO 8601 (ex: 2025-12-31)'));
  assert.equal(outilsIA.toolsFor(vocabDefaut), outilsIA.toolsFor(vocabDefaut));
  assert.equal(outilsIA.toolsFor(V.hotellerie), outilsIA.toolsFor(V.hotellerie));
  assert.notEqual(outilsIA.toolsFor(V.hotellerie), outilsIA.toolsFor(vocabDefaut));
  assert.equal(outilsIA.TOOLS_OPENAI, undefined);
  assert.equal(outilsIA.TOOLS_ANTHROPIC, undefined);
});

test('toolsFor : vocabulaire du compte, codes et recherche (2c) inchangés', () => {
  const parNom = (voc) => Object.fromEntries(outilsIA.toolsFor(voc).map((t) => [t.function.name, t.function]));
  const d = parNom(vocabDefaut);
  for (const [dom, voc] of Object.entries(V)) {
    const o = parNom(voc);
    assert.deepEqual(Object.keys(o), Object.keys(d), dom);
    // noms de paramètres, types, enum et required identiques
    for (const n of Object.keys(d)) {
      assert.deepEqual(Object.keys(o[n].parameters.properties), Object.keys(d[n].parameters.properties));
      assert.deepEqual(o[n].parameters.required, d[n].parameters.required);
    }
    assert.deepEqual(o.get_ventes.parameters.properties.canal.enum, ['directe', 'prestataire']);
    assert.ok(o.get_ventes.description.includes('répartition par canal (direct / prestataire)'), dom);
    assert.ok(o.get_pertes.description.includes('ex. avarie / dechet'), dom);
    assert.equal(o.search_knowledge_base.description, d.search_knowledge_base.description, `${dom} : recherche reportée au 2c`);
    assert.equal(o.search_knowledge_base.parameters.properties.query.description, d.search_knowledge_base.parameters.properties.query.description);
  }
  const h = parNom(V.hotellerie);
  assert.equal(h.get_stock.description, 'Récupère le stock de fournitures. Sans filtre = tous services et cuisines centrales. Supporte filtrage par service, cuisine centrale, fourniture, et période.');
  assert.equal(h.get_referentiel.description.slice(0, 66), 'Récupère le référentiel des fournitures/composants du client : nom');
  assert.equal(h.ask_clarification.description, "Envoie une question de clarification au client avant de requêter les données. OBLIGATOIRE si le client a plusieurs services et n'a pas précisé lequel.");
  const m = parNom(V.miroir);
  assert.ok(m.get_ventes.description.includes('écart brut,'), 'accord de « marge brute »');
  assert.ok(m.get_config_vente.description.includes('agences de livraison actives par local'));
  // aucune forme par défaut d'activité ou de labo hors recherche (Hôtellerie)
  for (const [n, f] of Object.entries(h)) {
    if (n === 'search_knowledge_base') continue;
    const textes = [f.description, ...Object.values(f.parameters.properties).map((p) => p.description || '')].join(' ');
    assert.ok(!/\b(activité|activités|labo|labos|ingrédient|ingrédients|article|articles)\b/i.test(textes.replace(/articles vendables/g, '')), `${n} : ${textes}`);
  }
});

test('prompt par défaut : identique à la référence de sortie, sans glossaire', () => {
  assert.equal(masquer(buildSystemPrompt(LIGNE_FIXE, vocabDefaut)), REF.prompt.avecContexte);
  assert.equal(masquer(buildSystemPrompt(null, vocabDefaut)), REF.prompt.sansContexte);
  // profil restauration complet : toujours identique (glossaire absent)
  const restau = { lexique: LEXIQUE_DEFAUT, composants: COMPOSANTS_RESTAU };
  assert.equal(masquer(buildSystemPrompt(LIGNE_FIXE, vocabDefaut, restau)), REF.prompt.avecContexte);
  assert.equal(glossaireVocabulaire(vocabDefaut, restau), '');
  assert.equal(glossaireVocabulaire(vocabDefaut, { lexique: LEXIQUE_DEFAUT, composants: COMPOSANTS_HOTEL }), '');
});

test('glossaire Hôtellerie : une ligne « ingrédient » (deux sens), unités du domaine, trois règles', () => {
  const g = glossaireVocabulaire(V.hotellerie, { lexique: lexiques.hotellerie, composants: COMPOSANTS_HOTEL });
  const lignes = g.split('\n');
  assert.equal(lignes.filter((l) => l.startsWith('« ingrédient »')).length, 1);
  assert.ok(g.includes("« ingrédient » (ligne de stock, champ `ingredient` des données) → « fourniture » ; « ingrédient » d'une fiche de préparation → « composant »"));
  assert.ok(g.includes('« labo » / « labos » → « cuisine centrale » / « cuisines centrales » (forme courte « cuisine ») — dans les données : `labo_id`, `labos`, `labo`, `labo_destinataire`'));
  assert.ok(g.includes('Restaurant, Bar, Room service, Housekeeping, Spa = des « services » (activités dans LabFlow)'));
  assert.ok(g.includes('Cuisine, Économat / Logistique = des « cuisines centrales » (labos dans LabFlow)'));
  assert.ok(!g.includes('Responsable de service ='), 'composant au libellé du lexique : pas de ligne');
  assert.ok(!/laboratoire/.test(g), 'labo_long / labo_desc : la ligne de labo suffit');
  assert.ok(!/abr|P\. Vendable|Prod\. Transformé/.test(g), 'abréviations *_abr exclues');
  assert.ok(!/point de vente/.test(g), 'activite_desc exclue');
  assert.ok(g.includes('1. Réponds au client avec les mots du compte'));
  assert.ok(g.includes('3. La base de connaissances et le manuel sont rédigés avec les mots de LabFlow'));
  // placé juste après le bloc de contexte, dans le prompt
  const p = buildSystemPrompt(LIGNE_FIXE, V.hotellerie, { lexique: lexiques.hotellerie, composants: COMPOSANTS_HOTEL });
  assert.ok(p.indexOf('## Vocabulaire du compte') > p.indexOf('## Contexte du client'));
  assert.ok(p.indexOf('## Vocabulaire du compte') < p.indexOf('## Règles de communication'));
  // sans profil : pas de glossaire (le prompt reste dans le vocabulaire du compte)
  assert.ok(!buildSystemPrompt(LIGNE_FIXE, V.hotellerie).includes('## Vocabulaire du compte'));
  // mesure (spec §7.3) : lignes et caractères du bloc
  const c = glossaireVocabulaire(V.ceramique, { lexique: lexiques.ceramique, composants: [composant('showroom', 'activite', 'Showroom / Boutique', 'Showrooms / Boutiques'), composant('atelier', 'labo', 'Atelier', 'Ateliers')] });
  console.log(`  mesure du glossaire : Hôtellerie ${g.trim().split('\n').length} lignes, ${g.trim().length} caractères ; Céramique ${c.trim().split('\n').length} lignes, ${c.trim().length} caractères`);
  assert.ok(c.includes('« fiche technique » / « fiches techniques » (forme courte « FT ») → « fiche de coût de revient » / « fiches de coût de revient » (forme courte « FCR »)'));
});

test('prompt Hôtellerie : aucun mot « activité » ni « labo » hors glossaire et noms d\'outils', () => {
  const p = buildSystemPrompt('Client: X', V.hotellerie);
  assert.ok(p.includes('Utilise directement ces IDs de services/cuisines centrales dès que le client nomme un service ou une cuisine centrale.'));
  assert.ok(p.includes("S'il n'a qu'un service, procède directement"));
  assert.ok(p.includes('Si le client dit "tous" ou n\'a qu\'un seul service'));
  assert.ok(p.includes('« mon ratio matière est-il bon ? »'));
  assert.ok(!/\b(activité|activités|labo|labos|ingrédient)\b/.test(p.replace(/`[^`]*`/g, '')), 'forme par défaut restée');
  const m = buildSystemPrompt('Client: X', V.miroir);
  assert.ok(m.includes('« mon incidence matière est-elle bonne ? »'));
  assert.ok(m.includes('Si abandons élevés détectés'));
  assert.ok(m.includes('📦 armoire'));
});

const appeler = async (nom, args, voc) => {
  requetes.length = 0;
  const r = await outilsIA.executeToolCall(42, nom, args, voc);
  assert.ok(!(r && r.error), `${nom} : ${r && r.error}`);
  return r;
};

for (const args of [{}, { canal: 'directe' }, { canal: 'prestataire' }, { activite_id: 1 }, { labo_id: 2 },
  { date_from: '2026-01-01', date_to: '2026-02-01' }, { activite_id: 1, labo_id: 2, date_from: '2026-01-01', date_to: '2026-02-01', canal: 'prestataire' }]) {
  test(`get_ventes ${JSON.stringify(args)} : repli du canal en paramètre propre, paramètres cohérents`, async () => {
    for (const [voc, attendu] of [[vocabDefaut, 'Prestataire'], [V.ceramique, 'Intermédiaire'], [V.miroir, 'Agence']]) {
      await appeler('get_ventes', args, voc);
      const ventes = requetes.filter((r) => r.texte.includes('FROM ventes v'));
      assert.equal(ventes.length, 2);
      const [tot, canal] = ventes;
      assert.ok(!tot.params.includes(attendu), 'totRes sans le libellé');
      assert.deepEqual(canal.params, [...tot.params, attendu]);
      assert.ok(canal.texte.includes(`COALESCE(pl.nom, $${canal.params.length})`));
      assert.ok(!/'Prestataire'/.test(canal.texte), 'plus de libellé en SQL');
      assert.ok(canal.texte.includes('GROUP BY 1 ORDER BY ca_ttc DESC'));
      placeholdersCoherents(ventes);
    }
  });
}

test('get_transferts : marqueur « (labo) » en JS, mêmes clés dans le même ordre ; sans voc, repli sur le compte', async () => {
  lignesTransferts = [
    { ingredient: 'Tomate', quantite: '2', date_transfert: '2026-09-01', activite: 'Terrasse', labo: 'Bloc chaud', labo_destinataire: null },
    { ingredient: 'Sauce', quantite: '1', date_transfert: '2026-09-02', activite: null, labo: 'Bloc chaud', labo_destinataire: 'Pâtisserie' },
  ];
  const cles = ['ingredient', 'quantite', 'date_transfert', 'activite', 'labo', 'labo_destinataire', 'destination'];
  const d = await appeler('get_transferts', { labo_id: 3, ingredient: 'to' }, vocabDefaut);
  for (const r of d) assert.deepEqual(Object.keys(r), cles);
  assert.deepEqual(d.map((r) => r.destination), ['Terrasse', 'Pâtisserie (labo)']);
  const sql = requetes.find((r) => r.texte.includes('FROM labo_transfers lt'));
  assert.ok(!sql.texte.includes('(labo)') && !sql.texte.includes('CASE WHEN'), 'plus de libellé en SQL');
  placeholdersCoherents(requetes);
  const h = await appeler('get_transferts', {}, V.hotellerie);
  assert.deepEqual(h.map((r) => r.destination), ['Terrasse', 'Pâtisserie (cuisine)']);
  // sans voc (oracle, scripts) : vocabForClient(42) — faux pool sans abonnement → défaut
  const s = await appeler('get_transferts', {});
  assert.deepEqual(s.map((r) => r.destination), ['Terrasse', 'Pâtisserie (labo)']);
});

test('executeToolCall : le message d\'erreur est rendu avec le vocabulaire du compte', async () => {
  const sauve = fauxPool.query;
  fauxPool.query = async () => { throw new Error('[[Nom:labo]] introuvable'); };
  try {
    assert.deepEqual(await outilsIA.executeToolCall(42, 'get_referentiel', {}, V.hotellerie), { error: 'Cuisine centrale introuvable' });
    assert.deepEqual(await outilsIA.executeToolCall(42, 'get_referentiel', {}, vocabDefaut), { error: 'Labo introuvable' });
  } finally {
    fauxPool.query = sauve;
  }
  // outil inconnu : texte inchangé
  assert.deepEqual(await outilsIA.executeToolCall(42, 'xyz', {}, vocabDefaut), { error: 'Outil inconnu: xyz' });
});
