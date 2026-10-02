// Lot 2b, B1 — guide de mise en route, ligne de contexte, accueil Messenger, rapport Excel de l'assistant
// (spec docs/lot-2b-spec.md §6.2, §6.3, §7.3 à §7.5).
// Sans base de données ni email : le pool est un faux ; emailService.sendRapportWithAttachment est capté.
//  - lexique par défaut : textes IDENTIQUES à l'existant ;
//  - Hôtellerie : « Comment créer ma cuisine ? », aucune forme « activité » ni « labo » dans le guide ;
//  - rapport : onglets, titres, en-têtes et marqueur « (labo) » dans le vocabulaire du compte.
//   node --test test/B1-guide-rapport.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');

let sc = {};
const requetes = [];
const fauxPool = {
  query: async (sql, params = []) => {
    const t = String(sql).replace(/\s+/g, ' ').trim();
    requetes.push({ texte: t, params });
    if (t.startsWith('SELECT id, module_acheteurs_actif')) return { rows: [{ id: 1, module_acheteurs_actif: true }] };
    if (t.includes('FROM abonnement_config ac JOIN abonnements a')) return { rows: [{ abonnement_id: 9, nb_activites: sc.prevAct, nb_labos: sc.prevLabo, formule_activites: 'premium', domaine_id: 5 }] };
    if (t.includes('AS fournisseurs')) return { rows: [sc.counts] };
    if (t.includes('_ingredient_selections')) return { rows: [{ n: 0 }] };
    if (t.includes('AS appro_activite')) return { rows: [{ appro_activite: false, appro_labo: false, vente: false }] };
    if (t.includes('FROM abonnement_config_composants acc')) return { rows: sc.comps };
    if (t.includes('unites_op_composant_defaut')) return { rows: [{ activite: null, labo: null }] };
    if (t.includes('SELECT context_json, context_updated_at')) return { rows: [{ context_json: sc.snap, context_updated_at: new Date() }] };
    if (t.includes('FROM labo_transfers lt')) return { rows: sc.transferts || [] };
    if (t.includes('FROM stock_entreprise_daily sed')) return { rows: [{ ingredient: 'Tomate', quantite: '3', date_appro: '2026-09-01', prix_unitaire: '2' }] };
    if (t.includes('FROM pertes p')) return { rows: [{ ingredient: 'Tomate', quantite: '1', type_perte: 'avarie', date_perte: '2026-09-02' }] };
    if (t.includes('FROM inventaires inv')) return { rows: [{ ingredient: 'Tomate', quantite_reelle: '4', date_inventaire: '2026-09-03' }] };
    if (t.startsWith('SELECT u.nom FROM utilisateurs')) return { rows: [{ nom: 'Hôtel Oracle' }] };
    return { rows: [] };
  },
};
const cheminPool = require.resolve('../src/config/database');
require.cache[cheminPool] = { id: cheminPool, filename: cheminPool, loaded: true, exports: fauxPool, children: [], paths: [] };
const envois = [];
const cheminEmail = require.resolve('../src/services/emailService');
require.cache[cheminEmail] = { id: cheminEmail, filename: cheminEmail, loaded: true, exports: { sendRapportWithAttachment: async (o) => { envois.push(o); } }, children: [], paths: [] };

const { computeOnboardingEtat, onboardingPromptBlock } = require('../src/services/onboardingEtat');
const domaineProfil = require('../src/services/domaineProfilService');
const clientConfig = require('../src/services/clientConfigService');
const { texteAccueilMessenger } = require('../src/services/messengerService');
const { generateAndSendReport } = require('../src/services/reportService');
const { vocabDefaut, creerVocab, resoudreLexique } = require('../src/utils/vocab');
const { LEXIQUE_DEFAUT } = require('../src/config/lexiqueDefaut');

const ESSAIS = JSON.parse(fs.readFileSync(path.join(__dirname, 'vocab-lexiques-test.json'), 'utf8'));
const LEX = { hotellerie: resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.hotellerie), ceramique: resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.ceramique) };
const V = { hotellerie: creerVocab(LEX.hotellerie), ceramique: creerVocab(LEX.ceramique) };
const REF = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'vocab-baseline', 'restauration.json'), 'utf8')).captures;

let profil = { id: 5, lexique: LEXIQUE_DEFAUT, regles: {}, composants: [] };
domaineProfil.getProfil = async () => profil;

const comp = (id, code, type, libelle, pl, genre = 'm', nb = 1) => ({ id, code, libelle, libelle_pluriel: pl, genre, elision: null, type_technique: type, nb });
const COUNTS0 = { activites: 0, labos: 0, unites: 0, familles: 0, categories: 0, articles: 0, fournisseurs: 0, produits: 0, acheteurs: 0 };
const etape = (etat, key) => etat.etapes.find((e) => e.key === key);
const textesGuide = (etat) => etat.etapes.flatMap((e) => [e.titre, e.detail || '', ...e.questions, ...(e.composants || []).map((c) => c.libelle)]);

test('guide, lexique par défaut : textes de l\'existant (composants identité, puis repli sans composants)', async () => {
  profil = { id: 5, lexique: LEXIQUE_DEFAUT, regles: {}, composants: [] };
  sc = { prevAct: 2, prevLabo: 1, counts: { ...COUNTS0, articles: 1 }, comps: [comp(1, 'activite', 'activite', 'Activité', 'Activités', 'f', 2), comp(2, 'labo', 'labo', 'Labo', 'Labos', 'm', 1)] };
  const e = await computeOnboardingEtat(7);
  const cap = etape(e, 'capacites');
  assert.equal(cap.titre, 'Activités & labos de votre formule');
  assert.equal(cap.detail, '0/2 activités · 0/1 labo');
  assert.deepEqual(cap.questions, ['Comment créer mes activités ?', 'Comment créer mon labo ?', 'Quelle est la différence entre une activité et un labo ?']);
  assert.deepEqual(cap.composants.map((c) => c.libelle), ['Activité', 'Labo']);
  assert.equal(etape(e, 'referentiel').titre, 'Référentiel de base (unités, familles, catégories)');
  assert.equal(etape(e, 'articles').titre, 'Articles + affectation aux activités/labos');
  assert.equal(etape(e, 'articles').detail, '1 article');
  assert.deepEqual(etape(e, 'articles').questions, ['Comment ajouter mes articles ?', 'Comment importer mes articles en masse ?', 'Comment affecter les articles à mes activités et mon labo ?']);
  assert.deepEqual(etape(e, 'fournisseurs').questions, ['Comment ajouter mes fournisseurs ?', 'Comment importer mes fournisseurs depuis Excel ?', "À quoi servent les affectations d'un fournisseur ?"]);
  assert.deepEqual(etape(e, 'produits').questions, ['Comment créer un produit et sa fiche technique ?', "C'est quoi un produit valorisé ?", "Comment est calculé le coût de revient d'une recette ?"]);
  assert.equal(etape(e, 'saisie').titre, 'Première saisie (appro / vente)');
  assert.equal(etape(e, 'saisie').detail, "aucun approvisionnement ni vente pour l'instant");
  assert.deepEqual(etape(e, 'saisie').questions, ['Comment saisir mon premier approvisionnement ?', 'Comment saisir une vente ?', 'Comment mon stock est-il calculé ?']);
  assert.equal(etape(e, 'acheteurs').titre, "Carnet d'acheteurs");
  assert.deepEqual(etape(e, 'acheteurs').questions, ["Comment remplir mon carnet d'acheteurs ?", 'Comment importer mes acheteurs depuis Excel ?', 'Comment configurer mes tarifs acheteurs ?']);
  const bloc = onboardingPromptBlock(e, vocabDefaut);
  assert.ok(bloc.includes("(pas de labo si aucun labo ci-dessus, pas d'acheteurs si l'étape n'existe pas)"));
  assert.ok(bloc.includes('(ex. **🧂 Créer vos unités**)') && bloc.includes('(ex. 📍 **Référentiel → Unités**)'));
  // repli sans composants, un seul labo
  sc = { prevAct: 0, prevLabo: 2, counts: { ...COUNTS0, labos: 1 }, comps: [] };
  const r = await computeOnboardingEtat(7);
  assert.equal(etape(r, 'capacites').titre, 'Labos de votre formule');
  assert.equal(etape(r, 'capacites').detail, '1/2 labos');
  assert.deepEqual(etape(r, 'capacites').questions, ['Comment créer mes labos ?']);
  assert.equal(etape(r, 'articles').titre, 'Articles + affectation au labo');
  assert.equal(etape(r, 'saisie').titre, 'Premier approvisionnement du labo');
});

test('guide Hôtellerie : composants du domaine, « Comment créer ma cuisine ? », aucune forme activité / labo', async () => {
  profil = { id: 5, lexique: LEX.hotellerie, regles: {}, composants: [] };
  sc = {
    prevAct: 3, prevLabo: 1, counts: { ...COUNTS0, activites: 1, labos: 0, articles: 2 },
    comps: [comp(3, 'restaurant', 'activite', 'Restaurant', 'Restaurants', 'm', 2), comp(5, 'spa', 'activite', 'Spa', 'Spas', 'm', 1), comp(4, 'cuisine', 'labo', 'Cuisine', 'Cuisines', 'f', 1)],
  };
  const e = await computeOnboardingEtat(7);
  const cap = etape(e, 'capacites');
  assert.equal(cap.titre, 'Services & cuisines centrales de votre formule');
  assert.equal(cap.detail, '0/2 Restaurants · 0/1 Spa · 0/1 Cuisine');
  assert.deepEqual(cap.questions, ['Comment créer mes restaurants ?', 'Comment créer mon spa ?', 'Comment créer ma cuisine ?', 'Quelle est la différence entre un service et une cuisine centrale ?']);
  assert.equal(etape(e, 'articles').titre, 'Fournitures + affectation aux services/cuisines centrales');
  assert.equal(etape(e, 'articles').detail, '2 fournitures · 0/1 service affecté');
  assert.equal(etape(e, 'saisie').titre, 'Première saisie (appro / vente)');
  assert.deepEqual(etape(e, 'produits').questions, ['Comment créer un produit et sa fiche technique ?', "C'est quoi une prestation catalogue ?", "Comment est calculé le coût de revient d'une fiche de préparation ?"]);
  assert.deepEqual(etape(e, 'acheteurs').questions, ['Comment remplir mon carnet de clients professionnels ?', 'Comment importer mes clients professionnels depuis Excel ?', 'Comment configurer mes tarifs clients professionnels ?']);
  for (const t of textesGuide(e)) assert.ok(!/\b(activité|activités|labo|labos|article|articles|acheteur|acheteurs)\b/i.test(t), t);
  const bloc = onboardingPromptBlock(e, V.hotellerie);
  assert.ok(bloc.includes("(pas de cuisine centrale si aucune cuisine centrale ci-dessus, pas de clients professionnels si l'étape n'existe pas)"));
  assert.ok(bloc.includes('(ex. **📏 Créer vos unités**)'));
  // liste mixte : composant identité « Activité » au libellé du brouillon → terme du lexique
  sc = { prevAct: 2, prevLabo: 0, counts: COUNTS0, comps: [comp(1, 'activite', 'activite', 'Activité', 'Activités', 'f', 1), comp(3, 'restaurant', 'activite', 'Restaurant', 'Restaurants', 'm', 1), comp(2, 'labo', 'labo', 'Labo', 'Labos', 'm', 1)] };
  const m = await computeOnboardingEtat(7);
  assert.equal(etape(m, 'capacites').detail, '0/1 Service · 0/1 Restaurant · 0/1 Cuisine centrale');
  assert.deepEqual(etape(m, 'capacites').questions, ['Comment créer mon service ?', 'Comment créer mon restaurant ?', 'Comment créer ma cuisine centrale ?']);
  assert.deepEqual(etape(m, 'capacites').composants.map((c) => c.libelle), ['Service', 'Restaurant', 'Cuisine centrale']);
});

test('ligne de contexte : identique par défaut, vocabulaire du compte sinon', async () => {
  sc = { snap: { v: 3, nom: 'Oracle', mode_compte: 'actif', activites: [], labos: [], abonnement: { nb_activites: 2, nb_labos: 1, nb_gerants: 0, mensuel_effectif_tnd: 90, onboarding_effectif_tnd: 700, promotion_active: false }, domaine: { id: 5, slug: 'restauration', nom: 'Restauration' }, nb_fournisseurs: 1, nb_gerants: 2, nb_produits: 3, module_vente_actif: true } };
  clientConfig.invalidate(301);
  const d = await clientConfig.getContextLine(301, vocabDefaut);
  assert.equal(d.line, [
    'Client: Oracle | Mode du compte: actif | Activités: aucune | Labos: aucun',
    "Domaine d'activité : Restauration",
    'Abonnement: mensualité ~90 TND, onboarding 700 TND | Capacité souscrite: 2 activité(s), 1 labo(s), 0 gérant(s)',
    'Référentiel client: 1 fournisseur(s), 2 gérant(s), 3 produit(s) | Module vente: actif',
  ].join('\n'));
  const h = await clientConfig.getContextLine(301, V.hotellerie);
  assert.equal(h.line, [
    'Client: Oracle | Mode du compte: actif | Services: aucun | Cuisines centrales: aucune',
    "Domaine d'activité : Restauration",
    'Abonnement: mensualité ~90 TND, onboarding 700 TND | Capacité souscrite: 2 service(s), 1 cuisine(s) centrale(s), 0 responsable(s) de service',
    'Référentiel client: 1 fournisseur(s), 2 responsable(s) de service, 3 produit(s) | Module vente: actif',
  ].join('\n'));
});

test('accueil Messenger : identique à la référence par défaut, vocabulaire du compte sinon', () => {
  const nom = REF.accueilMessenger.texte.match(/^👋 Bonjour (.*) !/)[1];
  assert.equal(texteAccueilMessenger(nom, vocabDefaut), REF.accueilMessenger.texte);
  const c = texteAccueilMessenger('X', V.ceramique);
  assert.ok(c.includes('🏪 Points de vente & 🏭 sites de production'));
  assert.ok(c.includes('📦 Stock, seuils & 🛒 réceptions'));
  assert.ok(c.includes('🔄 Livraisons internes site de production → points de vente'));
  assert.ok(c.includes('« les livraisons internes du mois actuel » ou « mon taux de coût matière de septembre »'));
});

const lireClasseur = async (buffer) => {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.map((ws) => ({ nom: ws.name, valeurs: ws.getSheetValues().filter(Array.isArray).map((l) => l.filter((x) => x !== undefined && x !== null).map((x) => (x && typeof x === 'object' && x.richText ? x.richText.map((r) => r.text).join('') : x))) }));
};
const TRANSFERTS = [
  { ingredient: 'Tomate', quantite: '2', date_transfert: '2026-09-01', activite: 'Terrasse', labo_destinataire: null, destination_labo: false },
  { ingredient: 'Sauce', quantite: '1', date_transfert: '2026-09-02', activite: null, labo_destinataire: 'Pâtisserie', destination_labo: true },
];

test('rapport Excel de l\'assistant : défaut identique, Hôtellerie dans le vocabulaire du compte ; requête sans libellé', async () => {
  const sauve = domaineProfil.getDomaineIdForClient;
  try {
    for (const [lexique, attendu] of [
      [LEXIQUE_DEFAUT, { onglets: ['Stock', 'Pertes', 'Inventaires', 'Transferts Labo'], titres: ['Rapport LabFlow — Stock actuel', 'Rapport LabFlow — Pertes récentes', 'Rapport LabFlow — Inventaires récents', 'Rapport LabFlow — Transferts depuis les labos'],
        entetes: [['Ingrédient', 'Quantité', 'Date appro', 'Prix unitaire (TND)'], ['Ingrédient', 'Quantité', 'Type', 'Date'], ['Ingrédient', 'Quantité réelle', 'Date inventaire'], ['Ingrédient', 'Quantité', 'Date transfert', 'Destination']], dest: 'Pâtisserie (labo)' }],
      [LEX.hotellerie, { onglets: ['Stock', 'Pertes', 'Inventaires', 'Livraisons internes Cuisine'], titres: ['Rapport LabFlow — Stock actuel', 'Rapport LabFlow — Pertes récentes', 'Rapport LabFlow — Inventaires récents', 'Rapport LabFlow — Livraisons internes depuis les cuisines centrales'],
        entetes: [['Fourniture', 'Quantité', 'Date appro', 'Prix unitaire (TND)'], ['Fourniture', 'Quantité', 'Type', 'Date'], ['Fourniture', 'Quantité réelle', 'Date inventaire'], ['Fourniture', 'Quantité', 'Date livraison interne', 'Destination']], dest: 'Pâtisserie (cuisine)' }],
      [LEX.ceramique, { onglets: ['Stock', 'Pertes', 'Inventaires', 'Livraisons internes Site'], titres: ['Rapport LabFlow — Stock actuel', 'Rapport LabFlow — Pertes récentes', 'Rapport LabFlow — Inventaires récents', 'Rapport LabFlow — Livraisons internes depuis les sites de production'],
        entetes: [['Matière première', 'Quantité', 'Date réception', 'Prix unitaire (TND)'], ['Matière première', 'Quantité', 'Type', 'Date'], ['Matière première', 'Quantité réelle', 'Date inventaire'], ['Matière première', 'Quantité', 'Date livraison interne', 'Destination']], dest: 'Pâtisserie (site)' }],
    ]) {
      // vocabForClient(7) : domaine 5 → profil du domaine (faux), lexique de l'essai
      domaineProfil.getDomaineIdForClient = async () => 5;
      profil = { id: 5, lexique, regles: {}, composants: [] };
      sc = { transferts: TRANSFERTS.map((r) => ({ ...r })) };
      envois.length = 0; requetes.length = 0;
      const nomFichier = await generateAndSendReport(7, 'destinataire@oracle.invalid', 'Oracle');
      assert.equal(envois.length, 1);
      assert.equal(envois[0].voc.Nom('article_ingredient'), attendu.entetes[0][0], "voc du compte transmis à l'email");
      assert.match(nomFichier, /^rapport-labflow-.*\.xlsx$/);
      const feuilles = await lireClasseur(envois[0].buffer);
      assert.deepEqual(feuilles.map((f) => f.nom), attendu.onglets);
      feuilles.forEach((f, i) => {
        assert.ok(f.valeurs.some((l) => l.includes(attendu.titres[i])), `${f.nom} : titre`);
        assert.ok(f.valeurs.some((l) => JSON.stringify(l) === JSON.stringify(attendu.entetes[i])), `${f.nom} : en-têtes ${JSON.stringify(f.valeurs)}`);
      });
      const dest = feuilles[3].valeurs.map((l) => l[l.length - 1]);
      assert.ok(dest.includes('Terrasse') && dest.includes(attendu.dest), JSON.stringify(dest));
      const sql = requetes.find((r) => r.texte.includes('FROM labo_transfers lt'));
      assert.ok(!sql.texte.includes('(labo)') && sql.texte.includes('lt.labo_dest_id IS NOT NULL AS destination_labo'));
      assert.deepEqual(sql.params, [7]);
    }
  } finally {
    domaineProfil.getDomaineIdForClient = sauve;
  }
});
