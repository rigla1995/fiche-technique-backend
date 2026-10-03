// Lot 2c, étape S — le serveur du manuel et de la base de connaissances dans les mots du domaine
// (spec docs/lot-2c-spec.md §5, tests du §5.11). Aucune écriture en base, aucun réseau :
//   - un FAUX POOL tient une petite base en mémoire (fiches, variantes, base de connaissances, domaines, composants)
//     et répond aux requêtes des contrôleurs, de la recherche de l'assistant et du renommage de slug ;
//   - partie « vraies fiches » : les 61 fiches et les 32 entrées de la base LOCALE, lues une fois dans une transaction
//     READ ONLY (connexion pg à part, hôte local seulement ; test sauté si la base est injoignable), servies par le
//     faux pool : en restauration, listPublic et la recherche rendent au caractère près ce que rendait le code d'avant
//     le lot (copié ci-dessous), et, base dans l'état de la référence de l'oracle, les empreintes NON masquées de
//     scripts/vocab-baseline/restauration.json (meta.empreintesManuel, meta.empreintesBase).
//   node --test test/2c-manuel.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const RACINE = path.resolve(__dirname, '..');
const remplacer = (relatif, exports) => {
  const chemin = require.resolve(path.join(RACINE, relatif));
  require.cache[chemin] = { id: chemin, filename: chemin, loaded: true, exports, children: [], paths: [] };
};
const md5 = (s) => crypto.createHash('md5').update(String(s), 'utf8').digest('hex');
const sansCR = (s) => String(s).replace(/\r/g, '');
const copie = (x) => structuredClone(x);
const parOrdre = (a, b) => (a.ordre - b.ordre) || (a.id - b.id);

// ── Base en mémoire et faux pool ──────────────────────────────────────────────────────────────────────────────
const B = { fiches: [], variantes: [], kb: [], domaines: [], composants: [], domaineDuClient: new Map(), panne: null, id: 5000 };
const requetes = [];
const inconnues = [];
let instantane = null; // BEGIN … ROLLBACK des transactions de domainesController

const COLONNES_RECHERCHE = ['slug', 'titre', 'partie', 'contenu', 'mots_cles'];
const COLONNES_LECTURE = ['id', 'slug', 'titre', 'icone', 'partie', 'ordre', 'contenu', 'mots_cles', 'ecran', 'visible_gerant', 'actif', 'updated_at'];
const garder = (o, cles) => Object.fromEntries(cles.map((k) => [k, o[k]]));
const domaineParSlug = (slug) => B.domaines.find((d) => d.slug === slug) || null;
const ligneVariante = (v) => {
  const s = B.fiches.find((f) => f.id === v.section_id);
  const d = domaineParSlug(v.domaine_slug);
  return {
    id: v.id, section_id: v.section_id, slug: s.slug, domaine_slug: v.domaine_slug, titre: v.titre, contenu: v.contenu,
    mots_cles: v.mots_cles, statut: v.statut, updated_at: v.updated_at,
    a_revoir: md5(sansCR(s.contenu)) !== v.base_md5, // IS DISTINCT FROM : base_md5 NULL → vrai
    domaine_id: d ? d.id : null, domaine_lexique: d ? d.lexique : null,
  };
};

const repondre = async (sql, params = []) => {
  const t = String(sql).replace(/\s+/g, ' ').trim();
  requetes.push({ t, params });
  if (B.panne && B.panne(t, params)) throw new Error('lecture impossible (panne simulée)');
  if (t === 'BEGIN') { instantane = copie({ domaines: B.domaines, variantes: B.variantes }); return { rows: [] }; }
  if (t === 'COMMIT') { instantane = null; return { rows: [] }; }
  if (t === 'ROLLBACK') { if (instantane) Object.assign(B, instantane); instantane = null; return { rows: [] }; }
  // Variantes (lecture admin) — avant la requête commune
  if (t.startsWith('SELECT d.id, d.section_id, s.slug, d.domaine_slug')) {
    let vs = B.variantes;
    if (t.includes('WHERE d.id = $1')) vs = vs.filter((v) => v.id === params[0]);
    const lignes = vs.map(ligneVariante);
    const ordre = (l) => B.fiches.find((f) => f.id === l.section_id);
    lignes.sort((a, b) => parOrdre(ordre(a), ordre(b)) || a.domaine_slug.localeCompare(b.domaine_slug));
    return { rows: lignes };
  }
  // Requête commune du §5.2 (listPublic, recherche) : jointure sur la variante « valide » du slug $1
  if (t.includes('LEFT JOIN manuel_sections_domaine d ON d.section_id = s.id')) {
    const slug = params[0];
    const gerant = t.includes('AND s.visible_gerant = true');
    const cles = t.startsWith('SELECT s.id,') ? COLONNES_LECTURE : COLONNES_RECHERCHE;
    return {
      rows: B.fiches.filter((f) => f.actif && (!gerant || f.visible_gerant)).sort(parOrdre).map((f) => {
        const d = slug == null ? null : B.variantes.find((v) => v.section_id === f.id && v.domaine_slug === slug && v.statut === 'valide');
        const l = { ...f, titre: d && d.titre != null ? d.titre : f.titre, contenu: d ? d.contenu : f.contenu, mots_cles: d && d.mots_cles != null ? d.mots_cles : f.mots_cles };
        return garder(l, cles);
      }),
    };
  }
  if (t === 'SELECT titre, contenu, mots_cles FROM ai_knowledge_base WHERE actif = true ORDER BY id') {
    return { rows: B.kb.filter((e) => e.actif).sort((a, b) => a.id - b.id).map((e) => garder(e, ['titre', 'contenu', 'mots_cles'])) };
  }
  // Profils de domaine (getProfil, getProfilForClient, getDomaineDefautId)
  if (t === 'SELECT * FROM domaines_activite WHERE id = $1') return { rows: B.domaines.filter((d) => d.id === Number(params[0])).map(copie) };
  if (t === 'SELECT * FROM domaine_composants WHERE domaine_id = $1 ORDER BY ordre, id') return { rows: B.composants.filter((c) => c.domaine_id === Number(params[0])).map(copie) };
  if (t.includes('SELECT ac.domaine_id FROM abonnements a JOIN abonnement_config ac')) {
    const d = B.domaineDuClient.get(Number(params[0]));
    return { rows: d === undefined ? [] : [{ domaine_id: d }] };
  }
  if (t.includes("FROM domaines_activite WHERE slug = 'restauration' LIMIT 1")) return { rows: [{ id: domaineParSlug('restauration').id }] };
  // Manuel (admin)
  if (t.startsWith('SELECT *, (contenu_defaut IS NOT NULL AND contenu <> contenu_defaut) AS modifie FROM manuel_sections')) {
    return { rows: [...B.fiches].sort(parOrdre).map((f) => ({ ...f, modifie: f.contenu_defaut != null && f.contenu !== f.contenu_defaut })) };
  }
  if (t.startsWith('UPDATE manuel_sections SET') && t.endsWith('RETURNING *')) {
    const f = B.fiches.find((x) => x.id === params[params.length - 1]);
    if (!f) return { rows: [] };
    for (const [, col, n] of t.matchAll(/(\w+) = \$(\d+)/g)) if (col !== 'id') f[col] = params[Number(n) - 1];
    f.updated_at = new Date('2026-10-03T12:00:00Z');
    return { rows: [{ ...f }] };
  }
  if (t.startsWith('INSERT INTO manuel_sections (slug, titre, icone, partie, ordre, contenu, contenu_defaut,')) {
    const [slug, titre, icone, partie, ordre, contenu, motsCles, ecran, visibleGerant, actif] = params;
    const f = { id: (B.id += 1), slug, titre, icone, partie, ordre: ordre ?? 0, contenu, contenu_defaut: contenu, mots_cles: motsCles, ecran, visible_gerant: visibleGerant ?? true, actif: actif ?? true, updated_at: new Date() };
    B.fiches.push(f);
    return { rows: [{ ...f }] };
  }
  if (t === 'SELECT id FROM manuel_sections WHERE id = $1') return { rows: B.fiches.filter((f) => f.id === params[0]).map((f) => ({ id: f.id })) };
  if (t === 'SELECT id, lexique FROM domaines_activite WHERE slug = $1') return { rows: B.domaines.filter((d) => d.slug === params[0]).map((d) => ({ id: d.id, lexique: d.lexique })) };
  if (t === 'SELECT * FROM manuel_sections_domaine WHERE section_id = $1 AND domaine_slug = $2') {
    return { rows: B.variantes.filter((v) => v.section_id === params[0] && v.domaine_slug === params[1]).map(copie) };
  }
  if (t.startsWith('INSERT INTO manuel_sections_domaine')) {
    const [sectionId, slug, titre, contenu, motsCles, statut] = params;
    const s = B.fiches.find((f) => f.id === sectionId);
    if (!s) return { rows: [] };
    let v = B.variantes.find((x) => x.section_id === sectionId && x.domaine_slug === slug);
    if (!v) { v = { id: (B.id += 1), section_id: sectionId, domaine_slug: slug }; B.variantes.push(v); }
    Object.assign(v, { titre, contenu, mots_cles: motsCles, statut, base_md5: md5(sansCR(s.contenu)), updated_at: new Date('2026-10-03T12:00:00Z') });
    return { rows: [{ id: v.id }] };
  }
  if (t === 'DELETE FROM manuel_sections_domaine WHERE section_id = $1 AND domaine_slug = $2') {
    const avant = B.variantes.length;
    B.variantes = B.variantes.filter((v) => !(v.section_id === params[0] && v.domaine_slug === params[1]));
    return { rows: [], rowCount: avant - B.variantes.length };
  }
  // Base de connaissances (admin)
  if (t === 'SELECT * FROM ai_knowledge_base ORDER BY categorie NULLS LAST, titre') {
    return { rows: [...B.kb].sort((a, b) => ((a.categorie == null) - (b.categorie == null)) || String(a.categorie).localeCompare(String(b.categorie)) || a.titre.localeCompare(b.titre)).map(copie) };
  }
  if (t === 'SELECT id, titre FROM ai_knowledge_base') return { rows: B.kb.map((e) => ({ id: e.id, titre: e.titre })) };
  if (t.startsWith('INSERT INTO ai_knowledge_base')) {
    const [titre, contenu, motsCles, categorie, actif] = params;
    if (B.kb.some((e) => e.titre.toLowerCase() === titre.toLowerCase())) throw Object.assign(new Error('doublon'), { code: '23505' });
    const e = { id: (B.id += 1), titre, contenu, mots_cles: motsCles, categorie, actif: actif ?? true, updated_at: new Date() };
    B.kb.push(e);
    return { rows: [copie(e)] };
  }
  if (t.startsWith('UPDATE ai_knowledge_base SET titre = COALESCE($1, titre)')) {
    const [titre, contenu, motsCles, categorie, actif, id, ecrireMc, ecrireCat] = params;
    const e = B.kb.find((x) => String(x.id) === String(id));
    if (!e) return { rows: [] };
    if (titre != null) e.titre = titre;
    if (contenu != null) e.contenu = contenu;
    if (ecrireMc) e.mots_cles = motsCles;
    if (ecrireCat) e.categorie = categorie;
    if (actif != null) e.actif = actif;
    return { rows: [copie(e)] };
  }
  // Démarrage (R5.8)
  if (t === 'SELECT slug, titre, partie, contenu, contenu_defaut FROM manuel_sections WHERE actif = true ORDER BY ordre, id') {
    return { rows: B.fiches.filter((f) => f.actif).sort(parOrdre).map((f) => garder(f, ['slug', 'titre', 'partie', 'contenu', 'contenu_defaut'])) };
  }
  if (t === 'SELECT id, titre, contenu FROM ai_knowledge_base WHERE actif = true ORDER BY id') {
    return { rows: B.kb.filter((e) => e.actif).sort((a, b) => a.id - b.id).map((e) => garder(e, ['id', 'titre', 'contenu'])) };
  }
  // Domaines (renommage de slug, R5.9)
  if (t === 'SELECT * FROM domaines_activite WHERE id = $1 FOR UPDATE') return { rows: B.domaines.filter((d) => d.id === params[0]).map(copie) };
  if (t.startsWith('UPDATE domaines_activite SET nom = COALESCE($2, nom), slug = COALESCE($3, slug)')) {
    const d = B.domaines.find((x) => x.id === params[0]);
    if (params[2] != null && B.domaines.some((x) => x.slug === params[2] && x.id !== d.id)) throw Object.assign(new Error('doublon'), { code: '23505' });
    if (params[1] != null) d.nom = params[1];
    if (params[2] != null) d.slug = params[2];
    return { rows: [] };
  }
  if (t.startsWith('WITH deja AS (SELECT 1 FROM manuel_sections_domaine WHERE domaine_slug = $1 LIMIT 1)')) {
    const deja = B.variantes.some((v) => v.domaine_slug === params[0]);
    let suivies = 0;
    if (!deja) for (const v of B.variantes) if (v.domaine_slug === params[1]) { v.domaine_slug = params[0]; suivies += 1; }
    return { rows: [{ deja, suivies }] };
  }
  if (t.startsWith('SELECT COUNT(DISTINCT a.client_id)::int AS n FROM abonnement_config ac')) return { rows: [{ n: 0 }] };
  inconnues.push(t);
  return { rows: [] };
};
remplacer('src/config/database', { query: repondre, connect: async () => ({ query: repondre, release: () => {} }), on: () => {} });
// Aucun email : resend remplacé (domainesController charge abonnementController, qui charge emailService).
const cheminResend = require.resolve('resend', { paths: [RACINE] });
require.cache[cheminResend] = {
  id: cheminResend, filename: cheminResend, loaded: true, children: [], paths: [],
  exports: { Resend: class { constructor() { this.emails = { send: async () => { throw new Error('aucun envoi dans ce test'); } }; } } },
};
// Visibilité : la vraie, sauf contexte imposé par le test (null = manuel complet ; Set = slugs visibles).
const vraieVisibilite = require('../src/utils/manuelVisibilite');
let contexteImpose;
const visible = (slug, ctx) => (ctx instanceof Set ? ctx.has(slug) : vraieVisibilite.manuelSectionVisible(slug, ctx));
remplacer('src/utils/manuelVisibilite', {
  ...vraieVisibilite,
  buildManuelContexte: async (u) => (contexteImpose !== undefined ? contexteImpose : vraieVisibilite.buildManuelContexte(u)),
  manuelSectionVisible: visible,
});

const { LEXIQUE_DEFAUT } = require('../src/config/lexiqueDefaut');
const { vocabDefaut, vocabDuLexique, resoudreLexique, rendre } = require('../src/utils/vocab');
const M = require('../src/utils/manuelRendu');
const manuel = require('../src/controllers/manuelController');
const kbCtrl = require('../src/controllers/aiKnowledgeController');
const domaines = require('../src/controllers/domainesController');
const outils = require('../src/services/aiToolHandlers');
const { invalidate } = require('../src/services/domaineProfilService');

const ESSAIS = JSON.parse(fs.readFileSync(path.join(__dirname, 'vocab-lexiques-test.json'), 'utf8'));
const vH = vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, ESSAIS.hotellerie));
const vCafe = vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, {}));

const fauxRes = () => {
  const r = { locals: {}, statusCode: 200, corps: undefined, fini: false };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (c) => { r.corps = c; r.fini = true; return r; };
  r.send = () => { r.fini = true; return r; };
  return r;
};
const appeler = async (fn, req) => { const res = fauxRes(); await fn({ params: {}, body: {}, ...req }, res); return res; };

// ── Jeu d'essai ───────────────────────────────────────────────────────────────────────────────────────────────
// Fiche d'origine et sa forme balisée (exemples 1, 5, 6 et 8 du §7.7, comme test/2c-manuelRendu.test.js).
const ORIGINE = {
  id: 7, slug: 'stock-labo', titre: 'Stock Labo', icone: '🏭', partie: 'Stock & Appro', ordre: 3,
  contenu: 'Cet écran envoie les articles et les produits transformés (PT) du labo vers vos activités.\n\n'
    + '| Espace Labo | Stock du labo, production, transferts vers les activités |',
  contenu_defaut: null,
  mots_cles: 'stock labo, laboratoire, labo, produit transformé, pt', ecran: '/client/stock-labo',
  visible_gerant: true, actif: true, updated_at: new Date('2026-07-01T10:00:00Z'),
};
const BALISES = {
  titre: '[[Nom:stock]] [[Court:labo]]',
  partie: '[[Nom:stock]] & [[Court:appro]]',
  contenu: 'Cet écran envoie [[le:article:pl]] et [[le:pt:pl]] ([[court:pt:pl]]) [[du:labo]] vers [[votre:activite:pl]].\n\n'
    + '| [[Nom:espace_labo]] | [[Nom:stock]] [[du:labo]], production, [[nom:transfert:pl]] vers [[le:activite:pl]] |',
};
const BALISEE = { ...ORIGINE, ...BALISES, contenu_defaut: BALISES.contenu };
// Contenu de plus de 6 000 caractères : une balise chevauche la coupe de la recherche.
const LONG_ORIGINE = `${'x'.repeat(5990)} les transferts fin`;
const LONG_BALISE = `${'x'.repeat(5990)} [[le:transfert:pl]] fin`;
const fiche = (id, slug, ordre, champs = {}) => ({
  id, slug, titre: slug, icone: '📄', partie: 'Compte', ordre, contenu: `Fiche ${slug}.`, contenu_defaut: `Fiche ${slug}.`,
  mots_cles: slug, ecran: null, visible_gerant: true, actif: true, updated_at: new Date('2026-07-02T10:00:00Z'), ...champs,
});
const ENTREES = [
  { id: 1, titre: '[[Nom:transfert:pl]]', contenu: '[[Un:transfert]] déplace [[du:stock]] [[du:labo]] vers [[un:activite]].', mots_cles: 'transfert, labo, activité', categorie: 'stock', actif: true, updated_at: new Date('2026-07-03T10:00:00Z') },
  { id: 2, titre: 'Timbre fiscal', contenu: 'Le timbre fiscal (1 DT) s\'ajoute à chaque facture.', mots_cles: 'timbre, facture', categorie: 'fiscal', actif: true, updated_at: new Date('2026-07-03T10:00:00Z') },
];
const ID_RESTAU = 1585; const ID_CAFE = 1587; const ID_HOTEL = 1589; const ID_CERAM = 1590; const ID_PANNE = 1599;
const composant = (id, code, type, libelle, pl, genre = 'm') => ({ id, domaine_id: ID_HOTEL, code, libelle, libelle_pluriel: pl, type_technique: type, genre, elision: null, icone: null, aide: null, vente_active: true, production_active: true, nb_min: 0, nb_max: null, ordre: id, actif: true });
const reinitialiser = () => {
  B.fiches = [
    copie(BALISEE),
    fiche(8, 'support', 4, { titre: 'Demandes & support', contenu: 'Écrivez-nous depuis l\'écran Support.', contenu_defaut: 'Écrivez-nous depuis l\'écran Support.', mots_cles: 'support, aide' }),
    fiche(9, 'transferts', 5, { titre: '[[Nom:transfert:pl]]', partie: BALISES.partie, contenu: LONG_BALISE, contenu_defaut: LONG_BALISE, mots_cles: 'transfert, labo, activité' }),
    fiche(10, 'gerants', 6, { titre: 'Comptes gérants', visible_gerant: false }),
    fiche(11, 'dashboard-gerant', 7, { actif: false }),
  ];
  B.variantes = [];
  B.kb = copie(ENTREES);
  B.domaines = [
    { id: ID_RESTAU, slug: 'restauration', nom: 'Restauration', description: null, lexique: {}, regles: {} },
    { id: ID_CAFE, slug: 'cafe', nom: 'Café', description: null, lexique: {}, regles: {} },
    { id: ID_HOTEL, slug: 'hotellerie', nom: 'Hôtellerie', description: null, lexique: copie(ESSAIS.hotellerie), regles: {} },
    { id: ID_CERAM, slug: 'ceramique', nom: 'Céramique', description: null, lexique: copie(ESSAIS.ceramique), regles: {} },
  ];
  B.composants = [
    composant(1, 'restaurant', 'activite', 'Restaurant', 'Restaurants'), composant(2, 'bar', 'activite', 'Bar', 'Bars'),
    composant(3, 'room_service', 'activite', 'Room service', 'Room services'), composant(4, 'cuisine', 'labo', 'Cuisine', 'Cuisines', 'f'),
  ];
  B.domaineDuClient = new Map([[42, ID_HOTEL], [43, ID_RESTAU], [44, ID_CAFE], [45, ID_HOTEL]]);
  B.panne = null;
  contexteImpose = null;
  requetes.length = 0;
  invalidate();
};
const variante = (sectionId, slug, champs = {}) => {
  const s = B.fiches.find((f) => f.id === sectionId);
  const v = { id: (B.id += 1), section_id: sectionId, domaine_slug: slug, titre: null, mots_cles: null, statut: 'valide', base_md5: md5(sansCR(s.contenu)), updated_at: new Date(), ...champs };
  B.variantes.push(v);
  return v;
};

// Code d'AVANT le lot (develop + R2.2), recopié pour comparer au caractère près.
const ancienMapSection = (r) => ({
  id: r.id, slug: r.slug, titre: r.titre, icone: r.icone, partie: r.partie, ordre: r.ordre, contenu: r.contenu, motsCles: r.mots_cles,
  ecran: r.ecran, visibleGerant: r.visible_gerant, actif: r.actif, updatedAt: r.updated_at, ...(r.modifie !== undefined ? { modifie: r.modifie } : {}),
});
const ancienListPublic = (fiches, ctx, gerant) => fiches.filter((f) => f.actif && (!gerant || f.visible_gerant)).sort(parOrdre)
  .map((f) => garder(f, COLONNES_LECTURE)).filter((r) => visible(r.slug, ctx)).map(ancienMapSection);
const normalizeKb = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const ancienneRecherche = (kb, fiches, ctx, q) => {
  const query = (q || '').trim();
  const TRUNC = 6000;
  const kbRows = kb.filter((e) => e.actif).sort((a, b) => a.id - b.id).map((e) => garder(e, ['titre', 'contenu', 'mots_cles']));
  const manuelRows = fiches.filter((f) => f.actif).sort(parOrdre).map((f) => garder(f, COLONNES_RECHERCHE));
  const rows = [...kbRows, ...manuelRows.filter((r) => visible(r.slug, ctx)).map((r) => ({
    titre: `Manuel — ${r.partie} › ${r.titre}`, contenu: r.contenu.length > TRUNC ? `${r.contenu.slice(0, TRUNC)}…` : r.contenu, mots_cles: r.mots_cles,
  }))];
  if (rows.length === 0) return { results: [], note: 'Base de connaissances vide.' };
  const terms = normalizeKb(query).split(/[^a-z0-9]+/).filter((w) => w.length > 2);
  const scored = rows.map((r) => {
    const titreN = normalizeKb(r.titre);
    const hay = normalizeKb(`${r.titre} ${r.mots_cles || ''} ${r.contenu}`);
    let score = 0;
    for (const t of terms) { if (hay.includes(t)) score += 1; if (titreN.includes(t)) score += 2; }
    return { titre: r.titre, contenu: r.contenu, score };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
  if (scored.length === 0) return { results: [], disponibles: rows.map((r) => r.titre).slice(0, 25) };
  return { results: scored.map(({ titre, contenu }) => ({ titre, contenu })) };
};
// Fiches et entrées « d'origine » : chaque champ balisé rendu par défaut (I10).
const origineDe = (lignes, champs) => lignes.map((l) => ({ ...l, ...Object.fromEntries(champs.filter((c) => c in l).map((c) => [c, rendre(vocabDefaut, l[c])])) }));
const req = (role, extra = {}) => ({ user: { id: 42, role, domaine_id: null, ...extra.user }, voc: extra.voc });

// ── 1. listPublic ─────────────────────────────────────────────────────────────────────────────────────────────
test('listPublic par défaut (admin, restauration) : une fiche balisée rend exactement l\'origine, une fiche sans balise passe intacte', async () => {
  reinitialiser();
  const admin = await appeler(manuel.listPublic, req('super_admin', { voc: vocabDefaut }));
  assert.equal(admin.statusCode, 200);
  assert.deepEqual(admin.corps.map((s) => s.slug), ['stock-labo', 'support', 'transferts', 'gerants']);
  const s = admin.corps[0];
  assert.deepEqual(Object.keys(s), ['id', 'slug', 'titre', 'icone', 'partie', 'ordre', 'contenu', 'motsCles', 'ecran', 'visibleGerant', 'actif', 'updatedAt']);
  assert.ok(Buffer.from(s.contenu).equals(Buffer.from(ORIGINE.contenu)), 'contenu octet pour octet');
  assert.equal(s.titre, 'Stock Labo');
  assert.equal(s.partie, 'Stock & Appro');
  assert.equal(s.motsCles, ORIGINE.mots_cles, 'aucun mot-clé ajouté par défaut');
  assert.equal(admin.corps[1].contenu, 'Écrivez-nous depuis l\'écran Support.');
  assert.equal(admin.corps[2].contenu, LONG_ORIGINE);
  // Au caractère près : le code d'avant le lot, sur les textes d'origine.
  const attendu = JSON.stringify(ancienListPublic(origineDe(B.fiches, ['titre', 'partie', 'contenu']), null, false));
  assert.equal(JSON.stringify(admin.corps), attendu);
  // Compte restauration (req.voc par défaut, domaine restauration), et req.voc absent : même réponse, aucun profil lu.
  for (const r of [req('client', { voc: vocabDefaut, user: { domaine_id: ID_RESTAU } }), req('client', { user: { domaine_id: ID_RESTAU } })]) {
    requetes.length = 0;
    const res = await appeler(manuel.listPublic, r);
    assert.equal(JSON.stringify(res.corps), attendu);
    assert.ok(!requetes.some((q) => q.t.includes('FROM domaines_activite')), 'vocabulaire par défaut : aucun profil lu');
    const commune = requetes.find((q) => q.t.includes('LEFT JOIN manuel_sections_domaine'));
    assert.deepEqual(commune.params, [null], 'aucune variante cherchée');
  }
});

test('listPublic Hôtellerie : titres, parties, contenus rendus, mots-clés enrichis ; variante « valide » servie, « brouillon » non', async () => {
  reinitialiser();
  const lecteur = req('client', { voc: vH, user: { domaine_id: ID_HOTEL } });
  let res = await appeler(manuel.listPublic, lecteur);
  assert.equal(res.statusCode, 200);
  const s = res.corps[0];
  assert.equal(s.titre, 'Stock Cuisine');
  assert.equal(s.partie, 'Stock & Appro');
  assert.equal(s.contenu, 'Cet écran envoie les fournitures et les préparations (prépas) de la cuisine centrale vers vos services.\n\n'
    + '| Espace Cuisine | Stock de la cuisine centrale, production, livraisons internes vers les services |');
  assert.ok(s.motsCles.startsWith(`${ORIGINE.mots_cles}, `), s.motsCles);
  for (const mot of ['cuisine centrale', 'préparation', 'prépa', 'cuisine']) assert.ok(s.motsCles.split(', ').includes(mot), mot);
  assert.ok(!s.motsCles.split(', ').includes('bar'), 'libellé de moins de 4 lettres non ajouté');
  assert.equal(res.corps[2].titre, 'Livraisons internes');
  assert.ok(res.corps.every((x) => !/\[\[|\]\]/.test(`${x.titre} ${x.partie} ${x.contenu}`)), 'aucune balise servie');
  // Requête commune : variante du domaine (slug en paramètre), jamais dans le texte.
  const commune = requetes.find((q) => q.t.includes('LEFT JOIN manuel_sections_domaine'));
  assert.deepEqual(commune.params, ['hotellerie']);
  assert.ok(commune.t.includes("d.domaine_slug = $1 AND d.statut = 'valide'") && commune.t.endsWith('ORDER BY s.ordre, s.id'));
  // Variante validée : servie (contenu et titre propres, rendus) ; en brouillon : texte commun.
  const v = variante(8, 'hotellerie', { titre: '[[Nom:espace_labo]] : aide', contenu: 'Variante : écrivez à [[votre:labo]].', statut: 'brouillon' });
  res = await appeler(manuel.listPublic, lecteur);
  assert.equal(res.corps[1].contenu, 'Écrivez-nous depuis l\'écran Support.', 'brouillon : jamais servi');
  v.statut = 'valide';
  res = await appeler(manuel.listPublic, lecteur);
  assert.equal(res.corps[1].contenu, 'Variante : écrivez à votre cuisine centrale.');
  assert.equal(res.corps[1].titre, 'Espace Cuisine : aide');
  assert.equal(res.corps[1].partie, 'Compte', 'la partie reste commune');
  assert.equal(res.corps[1].id, 8, 'id de la fiche commune (I9)');
});

test('listPublic : restauration, admin et café ne lisent jamais de variante, même validée (I12) ; gérant : visible_gerant', async () => {
  reinitialiser();
  // Lignes que la contrainte de la 193 refuse (restauration) ou que l'admin ne peut créer (café) : posées ici pour la preuve.
  variante(8, 'restauration', { contenu: 'NE PAS SERVIR restauration' });
  variante(8, 'cafe', { contenu: 'NE PAS SERVIR cafe' });
  variante(8, 'hotellerie', { contenu: 'NE PAS SERVIR hors Hôtellerie' });
  const lecteurs = [
    req('client', { voc: vocabDefaut, user: { domaine_id: ID_RESTAU } }),
    req('super_admin', { voc: vocabDefaut }),
    req('boss', { voc: vocabDefaut, user: { domaine_id: ID_HOTEL } }),
    req('client', { voc: vCafe, user: { domaine_id: ID_CAFE } }),
  ];
  assert.equal(vCafe.estDefaut, true);
  for (const l of lecteurs) {
    requetes.length = 0;
    const res = await appeler(manuel.listPublic, l);
    assert.ok(res.corps.every((x) => !x.contenu.startsWith('NE PAS SERVIR')), l.user.role);
    assert.deepEqual(requetes.find((q) => q.t.includes('LEFT JOIN manuel_sections_domaine')).params, [null]);
  }
  const g = await appeler(manuel.listPublic, req('gerant', { voc: vocabDefaut, user: { domaine_id: ID_RESTAU } }));
  assert.deepEqual(g.corps.map((x) => x.slug), ['stock-labo', 'support', 'transferts'], 'fiche gerants (visible_gerant faux) absente');
  assert.ok(requetes.some((q) => q.t.includes('AND s.visible_gerant = true')));
});

test('listPublic : profil illisible → texte commun dans les mots du compte, jamais une erreur 500', async () => {
  reinitialiser();
  variante(8, 'hotellerie', { contenu: 'Variante.' });
  B.panne = (t, p) => t.startsWith('SELECT * FROM domaines_activite WHERE id') && Number(p[0]) === ID_PANNE;
  const res = await appeler(manuel.listPublic, req('client', { voc: vH, user: { domaine_id: ID_PANNE } }));
  assert.equal(res.statusCode, 200);
  assert.equal(res.corps[0].titre, 'Stock Cuisine', 'rendu avec req.voc');
  assert.equal(res.corps[1].contenu, 'Écrivez-nous depuis l\'écran Support.', 'aucune variante sans profil');
  assert.ok(res.corps[0].motsCles.includes('cuisine centrale') && !res.corps[0].motsCles.includes('restaurant'), 'formes du domaine, pas de composants');
});

// ── 2. Recherche de l'assistant ───────────────────────────────────────────────────────────────────────────────
test('toolSearchKnowledge : rendu AVANT la troncature (balise à cheval sur la coupe), citation rendue, ORDER BY dans les deux requêtes', async () => {
  reinitialiser();
  const profilH = { slug: 'hotellerie', composants: [] };
  const r = await outils.executeToolCall(42, 'search_knowledge_base', { query: 'livraisons internes' }, vH, profilH);
  assert.ok(!r.error, r.error);
  const long = r.results.find((x) => x.titre === 'Manuel — Stock & Appro › Livraisons internes');
  assert.ok(long, JSON.stringify(r.results.map((x) => x.titre)));
  const rendu = rendre(vH, LONG_BALISE);
  assert.ok(rendu.length > 6000);
  assert.equal(long.contenu, `${rendu.slice(0, 6000)}…`);
  assert.ok(!/\[\[|\]\]/.test(JSON.stringify(r)), 'aucune balise envoyée au modèle');
  assert.ok(r.results.some((x) => x.titre === 'Livraisons internes' && x.contenu === 'Une livraison interne déplace du stock de la cuisine centrale vers un service.'), 'entrée de la base rendue');
  const lectures = requetes.filter((q) => / FROM (ai_knowledge_base|manuel_sections s) /.test(q.t));
  assert.equal(lectures.length, 2);
  assert.ok(lectures[0].t.endsWith('WHERE actif = true ORDER BY id'), lectures[0].t);
  assert.ok(lectures[1].t.endsWith('ORDER BY s.ordre, s.id'), lectures[1].t);
  // Par défaut : la coupe est celle du texte d'origine.
  const d = await outils.executeToolCall(43, 'search_knowledge_base', { query: 'transferts' }, vocabDefaut);
  assert.equal(d.results.find((x) => x.titre === 'Manuel — Stock & Appro › Transferts').contenu, `${LONG_ORIGINE.slice(0, 6000)}…`);
});

test('executeToolCall transmet voc et profil à la recherche ; sans profil, il est relu ; sans voc, celui du compte', async () => {
  reinitialiser();
  variante(8, 'hotellerie', { contenu: 'Variante hôtelière : écrivez à [[votre:labo]].' });
  // Profil transmis : aucune relecture, variante du domaine servie, composants passés à l'enrichissement.
  const profilH = { slug: 'hotellerie', composants: [{ libelle: 'Room service', libellePluriel: 'Room services', typeTechnique: 'activite', actif: true }] };
  let r = await outils.executeToolCall(42, 'search_knowledge_base', { query: 'variante hôtelière' }, vH, profilH);
  assert.equal(r.results[0].contenu, 'Variante hôtelière : écrivez à votre cuisine centrale.');
  assert.ok(!requetes.some((q) => q.t.includes('abonnement_config') || q.t.includes('FROM domaines_activite')), 'profil transmis : pas relu');
  // « room service » (composant du profil transmis, mot-clé enrichi de la fiche transferts) fait remonter la fiche.
  r = await outils.executeToolCall(42, 'search_knowledge_base', { query: 'room service' }, vH, profilH);
  assert.ok(r.results.some((x) => x.titre.endsWith('› Livraisons internes')), JSON.stringify(r.results.map((x) => x.titre)));
  // Sans profil : relu par getProfilForClient (compte 42 → Hôtellerie).
  requetes.length = 0;
  r = await outils.executeToolCall(42, 'search_knowledge_base', { query: 'variante hôtelière' }, vH);
  assert.equal(r.results[0].contenu, 'Variante hôtelière : écrivez à votre cuisine centrale.');
  assert.ok(requetes.some((q) => q.t.includes('SELECT ac.domaine_id FROM abonnements a JOIN abonnement_config ac')));
  // Sans voc ni profil (oracle, scripts) : vocabulaire et domaine du compte.
  invalidate();
  r = await outils.executeToolCall(42, 'search_knowledge_base', { query: 'variante hôtelière' });
  assert.equal(r.results[0].contenu, 'Variante hôtelière : écrivez à votre cuisine centrale.');
  // Prospect sans compte : défaut, manuel complet, aucune variante.
  r = await outils.executeToolCall(null, 'search_knowledge_base', { query: 'support' });
  assert.ok(r.results.some((x) => x.contenu === 'Écrivez-nous depuis l\'écran Support.'));
  // Un vocabulaire par défaut ignore un profil transmis (I12).
  r = await outils.executeToolCall(43, 'search_knowledge_base', { query: 'support écrivez' }, vocabDefaut, { slug: 'hotellerie' });
  assert.equal(r.results.find((x) => x.titre.endsWith('› Demandes & support')).contenu, 'Écrivez-nous depuis l\'écran Support.');
});

test('toolSearchKnowledge : profil illisible → texte commun, aucune erreur d\'outil', async () => {
  reinitialiser();
  variante(8, 'hotellerie', { contenu: 'Variante.' });
  B.panne = (t, p) => t.includes('abonnement_config') && Number(p[0]) === 45;
  const r = await outils.executeToolCall(45, 'search_knowledge_base', { query: 'support écrivez' }, vH);
  assert.ok(!r.error, r.error);
  assert.equal(r.results.find((x) => x.titre.endsWith('› Demandes & support')).contenu, 'Écrivez-nous depuis l\'écran Support.');
  assert.ok(r.results.every((x) => !/\[\[/.test(x.titre + x.contenu)));
});

test('toolSearchKnowledge restauration : résultats et liste « disponibles » identiques au code d\'avant le lot, sur les textes d\'origine', async () => {
  reinitialiser();
  const kbO = origineDe(B.kb, ['titre', 'contenu']);
  const fichesO = origineDe(B.fiches, ['titre', 'partie', 'contenu']);
  for (const q of ['transferts', 'stock labo', 'timbre', 'zzz qwerty', 'comment créer un labo', '']) {
    for (const [clientId, ctx] of [[43, null], [43, new Set(['support', 'transferts'])], [null, null]]) {
      contexteImpose = ctx;
      const nouveau = await outils.executeToolCall(clientId, 'search_knowledge_base', { query: q });
      assert.deepEqual(nouveau, ancienneRecherche(kbO, fichesO, clientId ? ctx : null, q), `${q} / ${clientId}`);
    }
  }
});

// ── 3. Mots-clés enrichis (R5.4) ──────────────────────────────────────────────────────────────────────────────
test('enrichirMotsCles : rien par défaut (même avec des composants) ; Hôtellerie : formes et libellés, sans doublon, « pt » minuscule, < 4 lettres exclu, composants si entrée entière', () => {
  const comps = [{ libelle: 'Bar', libellePluriel: 'Bars', typeTechnique: 'activite', actif: true }, { libelle: 'Cuisine', libellePluriel: 'Cuisines', typeTechnique: 'labo', actif: true },
    { libelle: 'Room service', libellePluriel: 'Room services', typeTechnique: 'activite', actif: true }];
  assert.equal(M.enrichirMotsCles(vocabDefaut, 'labo, activité, pt', comps), 'labo, activité, pt');
  assert.equal(M.enrichirMotsCles(vCafe, 'labo, activité, pt', comps), 'labo, activité, pt');
  const h = M.enrichirMotsCles(vH, 'labo, activité, pt', comps).split(', ');
  assert.equal(new Set(h).size, h.length, 'sans doublon');
  for (const m of ['cuisine centrale', 'cuisines centrales', 'service', 'services', 'préparation', 'prépa', 'room service', 'room services']) assert.ok(h.includes(m), m);
  assert.ok(!h.includes('bar') && !h.includes('bars'));
  assert.ok(!M.enrichirMotsCles(vH, 'stock labo', comps).includes('room service'), 'composants seulement si le terme est une entrée entière');
});

// ── 4. Balises et validation admin (R5.7.1) ───────────────────────────────────────────────────────────────────
test('verifierBalises : [[nom:labbo]] refusé (clé inconnue), [[nom:labo:xx]] refusé, [[Nom:labo]] admis', () => {
  assert.deepEqual(M.verifierBalises('[[nom:labbo]]').map((e) => e.raison), ['clé inconnue « labbo »']);
  assert.equal(M.verifierBalises('[[nom:labo:xx]]').length, 1);
  assert.deepEqual(M.verifierBalises('[[Nom:labo]]'), []);
});

test('manuel create / update : 400 BALISE_INVALIDE (vocabBrut posé), 400 BALISE_INTERDITE, longueurs ; rien n\'est écrit', async () => {
  reinitialiser();
  const avant = copie(B.fiches);
  let res = await appeler(manuel.update, { params: { id: '8' }, body: { contenu: 'Voir [[nom:labbo]] et [[Nom:labo]].' } });
  assert.equal(res.statusCode, 400);
  assert.equal(res.corps.code, 'BALISE_INVALIDE');
  assert.deepEqual(res.corps.balises, [{ champ: 'contenu', balise: '[[nom:labbo]]', raison: 'clé inconnue « labbo »' }]);
  assert.equal(res.locals.vocabBrut, true, 'le message cite la saisie : jamais rendu');
  res = await appeler(manuel.update, { params: { id: '8' }, body: { titre: 'Le [[Nom:labo] central' } });
  assert.equal(res.corps.code, 'BALISE_INVALIDE');
  assert.equal(res.corps.balises[0].raison, 'balise non fermée');
  for (const [champ, colonne] of [['motsCles', 'mots_cles'], ['slug', 'slug'], ['icone', 'icone'], ['ecran', 'ecran']]) {
    res = await appeler(manuel.update, { params: { id: '8' }, body: { [champ]: '[[nom:labo]]' } });
    assert.equal(res.statusCode, 400, champ);
    assert.equal(res.corps.code, 'BALISE_INTERDITE', champ);
    assert.ok(res.corps.message.includes(colonne), res.corps.message);
    assert.equal(res.locals.vocabBrut, true);
  }
  res = await appeler(manuel.create, { body: { slug: 'nouvelle', titre: 'T', partie: 'P', contenu: '[[du:labbo]]' } });
  assert.equal(res.corps.code, 'BALISE_INVALIDE');
  res = await appeler(manuel.create, { body: { slug: 'nouvelle', titre: 'T', partie: 'P', contenu: 'C', motsCles: 'a, [[nom:labo]]' } });
  assert.equal(res.corps.code, 'BALISE_INTERDITE');
  res = await appeler(manuel.update, { params: { id: '8' }, body: { titre: 'x'.repeat(201) } });
  assert.equal(res.statusCode, 400);
  assert.match(res.corps.message, /200/);
  res = await appeler(manuel.update, { params: { id: '8' }, body: { partie: 'x'.repeat(61) } });
  assert.equal(res.statusCode, 400);
  assert.match(res.corps.message, /60/);
  res = await appeler(manuel.create, { body: { slug: 'nouvelle', titre: `  ${'x'.repeat(200)}  `, partie: 'P', contenu: 'C' } });
  assert.notEqual(res.statusCode, 400, 'titre rogné à 200 caractères : admis');
  assert.deepEqual(B.fiches.filter((f) => f.id !== undefined).slice(0, avant.length), avant, 'aucun refus n\'a écrit');
  assert.ok(!requetes.some((q) => q.t.startsWith('UPDATE manuel_sections')), 'aucune mise à jour envoyée');
});

test('manuel update { actif } seul : passe, seule la colonne actif est écrite ; une balise valide est admise', async () => {
  reinitialiser();
  let res = await appeler(manuel.update, { params: { id: '7' }, body: { actif: false } });
  assert.equal(res.statusCode, 200);
  const maj = requetes.find((q) => q.t.startsWith('UPDATE manuel_sections'));
  assert.equal(maj.t, 'UPDATE manuel_sections SET actif = $1, updated_at = NOW() WHERE id = $2 RETURNING *');
  assert.equal(res.corps.titre, BALISES.titre, 'réponse admin : texte brut');
  res = await appeler(manuel.update, { params: { id: '7' }, body: { titre: '[[Nom:stock]] [[Court:labo]] (aide)', motsCles: 'stock' } });
  assert.equal(res.statusCode, 200);
});

test('base de connaissances : balises refusées, 409 sur deux titres de même rendu, { actif } seul garde mots-clés et catégorie (Q6)', async () => {
  reinitialiser();
  let res = await appeler(kbCtrl.create, { body: { titre: 'Transferts', contenu: 'Doublon par le rendu.' } });
  assert.equal(res.statusCode, 409, 'Transferts = rendu par défaut de [[Nom:transfert:pl]]');
  assert.equal(res.corps.message, 'Un article avec ce titre existe déjà');
  res = await appeler(kbCtrl.create, { body: { titre: 'TRANSFERTS', contenu: 'x' } });
  assert.equal(res.statusCode, 409, 'sans tenir compte de la casse');
  res = await appeler(kbCtrl.create, { body: { titre: '[[Nom:transfert]]', contenu: 'x' } });
  assert.equal(res.statusCode, 201, 'Transfert ≠ Transferts');
  res = await appeler(kbCtrl.update, { params: { id: '2' }, body: { titre: 'transferts' } });
  assert.equal(res.statusCode, 409);
  res = await appeler(kbCtrl.update, { params: { id: '1' }, body: { titre: 'Transferts' } });
  assert.equal(res.statusCode, 200, 'son propre titre : admis');
  res = await appeler(kbCtrl.create, { body: { titre: 'T', contenu: '[[un:labbo]]' } });
  assert.equal(res.corps.code, 'BALISE_INVALIDE');
  assert.equal(res.locals.vocabBrut, true);
  res = await appeler(kbCtrl.update, { params: { id: '2' }, body: { categorie: '[[nom:labo]]' } });
  assert.equal(res.corps.code, 'BALISE_INTERDITE');
  res = await appeler(kbCtrl.update, { params: { id: '2' }, body: { motsCles: 'timbre, [[nom:labo]]' } });
  assert.equal(res.corps.code, 'BALISE_INTERDITE');
  res = await appeler(kbCtrl.create, { body: { titre: 'x'.repeat(201), contenu: 'C' } });
  assert.equal(res.statusCode, 400);
  // Q6 : l'écran envoie { actif } seul → mots-clés et catégorie gardés.
  res = await appeler(kbCtrl.update, { params: { id: '2' }, body: { actif: false } });
  assert.equal(res.statusCode, 200);
  assert.equal(res.corps.motsCles, 'timbre, facture');
  assert.equal(res.corps.categorie, 'fiscal');
  assert.equal(res.corps.actif, false);
  const sql = requetes.filter((q) => q.t.startsWith('UPDATE ai_knowledge_base')).pop();
  assert.ok(sql.t.includes('mots_cles = CASE WHEN $7::boolean THEN $3 ELSE mots_cles END') && sql.t.includes('categorie = CASE WHEN $8::boolean THEN $4 ELSE categorie END'));
  assert.deepEqual(sql.params.slice(6), [false, false]);
  // Présents dans le corps : écrits (null efface, comme avant).
  res = await appeler(kbCtrl.update, { params: { id: '2' }, body: { motsCles: null, categorie: 'taxes' } });
  assert.equal(res.corps.motsCles, null);
  assert.equal(res.corps.categorie, 'taxes');
});

// ── 5. Badge « sans balises » (R5.7.2) ────────────────────────────────────────────────────────────────────────
test('sansBalises : faux partout quand aucune balise n\'est en base ; sinon champ par champ (manuel et base)', async () => {
  reinitialiser();
  // Base locale avant la consolidation / production entre D1 et D2 : textes bruts.
  B.fiches = origineDe(B.fiches, ['titre', 'partie', 'contenu', 'contenu_defaut']);
  B.kb = origineDe(B.kb, ['titre', 'contenu']);
  let res = await appeler(manuel.adminList, {});
  assert.ok(res.corps.length === 5 && res.corps.every((s) => s.sansBalises === false));
  let kb = await appeler(kbCtrl.list, {});
  assert.ok(kb.corps.every((e) => e.sansBalises === false));
  // Manuel balisé, une fiche restée brute (titre « Comptes gérants »), une entrée brute (« Timbre fiscal » : sans terme).
  reinitialiser();
  res = await appeler(manuel.adminList, {});
  const par = Object.fromEntries(res.corps.map((s) => [s.slug, s]));
  assert.equal(par['stock-labo'].sansBalises, false);
  assert.equal(par.gerants.sansBalises, true, '« gérants » en clair, sans balise');
  assert.equal(par.support.sansBalises, false, 'aucune forme par défaut');
  assert.deepEqual(Object.keys(par['stock-labo']).slice(-2), ['modifie', 'sansBalises'], 'champ ajouté en fin (admin seulement, §10.2)');
  B.kb.push({ id: 3, titre: 'Labo central', contenu: 'Le labo central.', mots_cles: null, categorie: null, actif: true });
  kb = await appeler(kbCtrl.list, {});
  assert.deepEqual(kb.corps.map((e) => [e.id, e.sansBalises]).sort((a, b) => a[0] - b[0]), [[1, false], [2, false], [3, true]]);
  assert.deepEqual(Object.keys(kb.corps[0]), ['id', 'titre', 'contenu', 'motsCles', 'categorie', 'actif', 'updatedAt', 'sansBalises']);
  // champsSansBalises : titre brut à côté d'un contenu balisé ; champ admis par md5.
  const titreBrut = { ...BALISEE, titre: 'Stock Labo' };
  assert.deepEqual(M.champsSansBalises(titreBrut, 'manuel_sections', []), ['titre']);
  assert.deepEqual(M.champsSansBalises(titreBrut, 'manuel_sections', [{ table: 'manuel_sections', champ: 'titre', md5: md5('Stock Labo') }]), []);
});

test('controlerBalisesAuDemarrage : manuel non balisé, restes champ par champ, tout balisé (R5.8) ; branché après app.listen sans attendre', async () => {
  const capter = async () => {
    const warn = console.warn; const lignes = [];
    console.warn = (...a) => lignes.push(a.join(' '));
    try { await M.controlerBalisesAuDemarrage({ query: repondre }, []); } finally { console.warn = warn; }
    return lignes;
  };
  reinitialiser();
  B.fiches = origineDe(B.fiches, ['titre', 'partie', 'contenu', 'contenu_defaut']);
  B.kb = origineDe(B.kb, ['titre', 'contenu']);
  // Aucune balise en base (fiches ni entrées) : une seule ligne, rien pour la base (même règle que le badge).
  assert.deepEqual(await capter(), ['[manuel] manuel non balisé (aucune balise en base)']);
  // Base balisée, une entrée restée brute : signalée champ par champ.
  B.kb.push({ id: 3, titre: 'Labo central', contenu: 'Le labo central.', mots_cles: null, categorie: null, actif: true });
  B.kb[0] = copie(ENTREES[0]);
  assert.deepEqual(await capter(), ['[manuel] manuel non balisé (aucune balise en base)', '[manuel] base de connaissances : 1 entrée(s) sans balises : Labo central (titre, contenu)']);
  reinitialiser();
  assert.deepEqual(await capter(), ['[manuel] 1 fiche(s) sans balises : gerants (titre)']);
  B.fiches = B.fiches.filter((f) => f.slug !== 'gerants');
  assert.deepEqual(await capter(), []);
  const app = fs.readFileSync(path.join(RACINE, 'src/app.js'), 'utf8').replace(/\r\n/g, '\n');
  const ecoute = app.slice(app.indexOf('const server = app.listen(PORT, () => {'), app.indexOf('    });', app.indexOf('const server = app.listen(PORT')));
  assert.match(ecoute, /console\.log\(`Serveur démarré sur le port \$\{PORT\}`\);\n\s+require\('\.\/utils\/manuelRendu'\)\.controlerBalisesAuDemarrage\(require\('\.\/config\/database'\)\)\.catch\(\(\) => \{\}\);/);
  assert.ok(!/await\s+require\('\.\/utils\/manuelRendu'\)/.test(app), 'sans attendre');
});

// ── 6. Variantes (R5.7.3) ─────────────────────────────────────────────────────────────────────────────────────
test('variantes : 404 fiche inconnue, slug invalide ou restauration, VARIANTE_DOMAINE_SANS_ECART, DOMAINE_INCONNU, balises', async () => {
  reinitialiser();
  const put = (id, slug, body) => appeler(manuel.putVariante, { params: { id: String(id), domaineSlug: slug }, body });
  let res = await put(999, 'hotellerie', { contenu: 'x', statut: 'valide' });
  assert.equal(res.statusCode, 404);
  for (const slug of ['restauration', 'Hotel', 'hôtel', 'a'.repeat(51), '']) {
    res = await put(8, slug, { contenu: 'x' });
    assert.equal(res.statusCode, 400, slug);
  }
  res = await put(8, 'cafe', { contenu: 'x', statut: 'valide' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.corps.code, 'VARIANTE_DOMAINE_SANS_ECART');
  res = await put(8, 'inconnu', { contenu: 'x' });
  assert.equal(res.statusCode, 400);
  assert.equal(res.corps.code, 'DOMAINE_INCONNU');
  res = await put(8, 'hotellerie', { contenu: 'Voir [[du:labbo]].' });
  assert.equal(res.corps.code, 'BALISE_INVALIDE');
  assert.equal(res.locals.vocabBrut, true);
  res = await put(8, 'hotellerie', { contenu: 'x', motsCles: '[[nom:labo]]' });
  assert.equal(res.corps.code, 'BALISE_INTERDITE');
  res = await put(8, 'hotellerie', { contenu: 'x', statut: 'publiee' });
  assert.equal(res.statusCode, 400);
  res = await put(8, 'hotellerie', { titre: 'x'.repeat(201), contenu: 'x' });
  assert.equal(res.statusCode, 400);
  res = await put(8, 'hotellerie', { statut: 'valide' });
  assert.equal(res.statusCode, 400, 'création sans contenu');
  assert.equal(B.variantes.length, 0, 'aucun refus n\'a écrit');
  // Variante existante d'un domaine absent (brouillons Céramique en production) ou sans lexique : modifiable.
  variante(8, 'ceram-prod', { statut: 'brouillon', contenu: 'Brouillon.' });
  res = await put(8, 'ceram-prod', { contenu: 'Brouillon relu.' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.corps.domaineExiste, false);
  assert.equal(res.corps.statut, 'brouillon', 'statut gardé');
  variante(8, 'cafe', { statut: 'brouillon', contenu: 'Brouillon café.' });
  res = await put(8, 'cafe', { contenu: 'Brouillon café relu.' });
  assert.equal(res.statusCode, 200);
  assert.deepEqual([res.corps.domaineExiste, res.corps.domaineAvecEcart], [true, false], '« domaine sans lexique »');
});

test('variantes : création, liste, « à revoir » après une retouche du texte commun, relecture, suppression', async () => {
  reinitialiser();
  const put = (body) => appeler(manuel.putVariante, { params: { id: '8', domaineSlug: 'hotellerie' }, body });
  let res = await put({ contenu: 'Écrivez à [[votre:labo]].', motsCles: '' });
  assert.equal(res.statusCode, 201);
  assert.deepEqual(Object.keys(res.corps), ['id', 'sectionId', 'slug', 'domaineSlug', 'domaineExiste', 'domaineAvecEcart', 'titre', 'contenu', 'motsCles', 'statut', 'aRevoir', 'updatedAt']);
  assert.deepEqual([res.corps.sectionId, res.corps.slug, res.corps.domaineSlug, res.corps.statut, res.corps.titre, res.corps.motsCles],
    [8, 'support', 'hotellerie', 'brouillon', null, null]);
  assert.equal(res.corps.contenu, 'Écrivez à [[votre:labo]].', 'texte brut (édition)');
  assert.deepEqual([res.corps.domaineExiste, res.corps.domaineAvecEcart, res.corps.aRevoir], [true, true, false]);
  const ins = requetes.find((q) => q.t.startsWith('INSERT INTO manuel_sections_domaine'));
  assert.ok(ins.t.includes("md5(replace(s.contenu, E'\\r', ''))") && ins.t.includes('ON CONFLICT (section_id, domaine_slug) DO UPDATE'), ins.t);
  // Retouche du texte commun dans l'admin → « à revoir ».
  await appeler(manuel.update, { params: { id: '8' }, body: { contenu: 'Écrivez-nous depuis l\'écran Support, ou par téléphone.' } });
  let liste = await appeler(manuel.listVariantes, {});
  assert.equal(liste.statusCode, 200);
  assert.equal(liste.corps.length, 1);
  assert.equal(liste.corps[0].aRevoir, true);
  const lecture = requetes.filter((q) => q.t.startsWith('SELECT d.id, d.section_id')).pop();
  assert.ok(lecture.t.includes("md5(replace(s.contenu, E'\\r', '')) IS DISTINCT FROM d.base_md5 AS a_revoir"), lecture.t);
  // Enregistrer vaut relecture ; validation : servie au compte Hôtellerie.
  res = await put({ statut: 'valide', titre: 'Aide [[Court:labo]]' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.corps.contenu, 'Écrivez à [[votre:labo]].', 'contenu gardé');
  liste = await appeler(manuel.listVariantes, {});
  assert.equal(liste.corps[0].aRevoir, false);
  const h = await appeler(manuel.listPublic, req('client', { voc: vH, user: { domaine_id: ID_HOTEL } }));
  assert.equal(h.corps[1].titre, 'Aide Cuisine');
  assert.equal(h.corps[1].contenu, 'Écrivez à votre cuisine centrale.');
  // Suppression.
  res = await appeler(manuel.removeVariante, { params: { id: '8', domaineSlug: 'hotellerie' } });
  assert.equal(res.statusCode, 204);
  res = await appeler(manuel.removeVariante, { params: { id: '8', domaineSlug: 'hotellerie' } });
  assert.equal(res.statusCode, 404);
  res = await appeler(manuel.removeVariante, { params: { id: '8', domaineSlug: 'restauration' } });
  assert.equal(res.statusCode, 400);
});

test('routes des variantes : déclarées avant /manuel/:id, garde requireSuperAdmin', () => {
  const src = fs.readFileSync(path.join(RACINE, 'src/routes/admin.js'), 'utf8');
  for (const ligne of ["router.get('/manuel/variantes', authenticate, requireSuperAdmin, manuel.listVariantes);",
    "router.put('/manuel/:id/variantes/:domaineSlug', authenticate, requireSuperAdmin, manuel.putVariante);",
    "router.delete('/manuel/:id/variantes/:domaineSlug', authenticate, requireSuperAdmin, manuel.removeVariante);"]) assert.ok(src.includes(ligne), ligne);
  assert.ok(src.indexOf("'/manuel/variantes'") < src.indexOf("'/manuel/:id'"));
});

// ── 7. Renommage du slug d'un domaine (R5.9) ──────────────────────────────────────────────────────────────────
test('renommage du slug : les variantes suivent ; 409 VARIANTES_EXISTANTES si le nouveau slug en a déjà (rien n\'est écrit)', async () => {
  reinitialiser();
  variante(7, 'hotellerie', { contenu: 'A' });
  variante(8, 'hotellerie', { contenu: 'B' });
  const maj = (id, body) => appeler(domaines.update, { params: { id: String(id) }, body, user: { role: 'super_admin' } });
  let res = await maj(ID_HOTEL, { slug: 'hotel' });
  assert.equal(res.statusCode, 200, JSON.stringify(res.corps));
  assert.equal(res.corps.slug, 'hotel');
  assert.deepEqual(B.variantes.map((v) => v.domaine_slug), ['hotel', 'hotel']);
  // Domaine supprimé puis recréé : des variantes orphelines portent déjà le slug visé.
  variante(9, 'ancien', { contenu: 'C' });
  res = await maj(ID_HOTEL, { slug: 'ancien', nom: 'Hôtel' });
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.corps, { code: 'VARIANTES_EXISTANTES', message: 'Des variantes du manuel existent déjà pour ce slug' });
  assert.equal(domaineParSlug('hotel').nom, 'Hôtellerie', 'transaction annulée : nom et slug inchangés');
  assert.deepEqual(B.variantes.map((v) => v.domaine_slug), ['hotel', 'hotel', 'ancien']);
  // Slug pris par un autre domaine : le refus d'avant (« existe déjà »), variantes intactes.
  res = await maj(ID_HOTEL, { slug: 'ceramique' });
  assert.equal(res.statusCode, 409);
  assert.equal(res.corps.message, 'Ce domaine (nom ou slug) existe déjà');
  assert.deepEqual(B.variantes.map((v) => v.domaine_slug), ['hotel', 'hotel', 'ancien']);
  // Slug inchangé (ou absent) : aucune requête sur les variantes.
  requetes.length = 0;
  res = await maj(ID_HOTEL, { slug: 'hotel', description: 'x' });
  assert.equal(res.statusCode, 200);
  assert.ok(!requetes.some((q) => q.t.includes('manuel_sections_domaine')));
  // Le slug « restauration » ne change jamais (garde existante).
  res = await maj(ID_RESTAU, { slug: 'resto' });
  assert.equal(res.statusCode, 400);
});

test('faux pool : aucune requête inattendue', () => {
  assert.deepEqual(inconnues, []);
});

// ── 8. Vraies fiches et entrées de la base locale (lecture seule) : restauration au caractère près ────────────
const REFERENCE = JSON.parse(fs.readFileSync(path.join(RACINE, 'scripts/vocab-baseline/restauration.json'), 'utf8'));
const EMPREINTES_REFERENCE = { manuel: '67737956d92ba0e1d836c17747d66f5c', base: '8779fd652a4a4dd50531e9e3323aaad6' };
// Requête (1) de scripts/controle-avant-2c.sql : empreintes globales du manuel et de la base.
const EMPREINTES_SQL = `SELECT
  (SELECT md5(string_agg(slug || '|' || titre || '|' || COALESCE(partie, '') || '|'
                         || md5(replace(COALESCE(contenu_defaut, contenu), E'\\r', '')) || '|'
                         || md5(replace(contenu, E'\\r', '')) || '|' || COALESCE(mots_cles, ''),
                         E'\\n' ORDER BY slug)) FROM manuel_sections) AS manuel,
  (SELECT md5(string_agg(lower(titre) || '|' || titre || '|' || md5(replace(contenu, E'\\r', '')) || '|'
                         || COALESCE(mots_cles, '') || '|' || actif::text, E'\\n' ORDER BY lower(titre))) FROM ai_knowledge_base) AS base`;
// Variables DB_* : celles de l'environnement (DB_NAME d'une copie, R2.8.2), sinon celles du .env (lues sans être
// chargées dans process.env ; aucune autre variable du .env n'est lue).
const configBase = () => {
  const fichier = {};
  try {
    for (const ligne of fs.readFileSync(path.join(RACINE, '.env'), 'utf8').split(/\r?\n/)) {
      const m = /^\s*(DB_(?:HOST|PORT|NAME|USER|PASSWORD|SSL))\s*=\s*(.*)\s*$/.exec(ligne);
      if (m) fichier[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  } catch (_) { /* pas de .env */ }
  const v = (k) => process.env[k] ?? fichier[k];
  return { host: v('DB_HOST') || 'localhost', port: parseInt(v('DB_PORT'), 10) || 5432, database: v('DB_NAME') || 'fiche_technique', user: v('DB_USER') || 'postgres', password: v('DB_PASSWORD') };
};
let vraies = null;
const lireVraies = () => {
  if (!vraies) {
    vraies = (async () => {
      const cfg = configBase();
      if (!['localhost', '127.0.0.1', '::1'].includes(cfg.host)) return { raison: `hôte de base non local : lecture refusée` };
      const { Client } = require('pg');
      const c = new Client({ ...cfg, connectionTimeoutMillis: 3000 });
      try { await c.connect(); } catch (e) { return { raison: `base locale injoignable (${e.code || e.message})` }; }
      try {
        await c.query('BEGIN TRANSACTION READ ONLY');
        const fiches = (await c.query(`SELECT id, slug, titre, icone, partie, ordre, contenu, contenu_defaut, mots_cles, ecran, visible_gerant, actif, updated_at
                                         FROM manuel_sections ORDER BY ordre, id`)).rows;
        const kb = (await c.query('SELECT id, titre, contenu, mots_cles, categorie, actif, updated_at FROM ai_knowledge_base ORDER BY id')).rows;
        const empreintes = (await c.query(EMPREINTES_SQL)).rows[0];
        return { fiches, kb, empreintes, base: cfg.database };
      } catch (e) {
        return { raison: `lecture impossible (${e.message})` };
      } finally {
        await c.query('ROLLBACK').catch(() => {});
        await c.end().catch(() => {});
      }
    })();
  }
  return vraies;
};
const chargerVraies = (d) => {
  reinitialiser();
  B.fiches = copie(d.fiches);
  B.kb = copie(d.kb);
};
const estReference = (d) => d.empreintes.manuel === EMPREINTES_REFERENCE.manuel && d.empreintes.base === EMPREINTES_REFERENCE.base;
const LECTEURS = {
  'client.A': req('client', { voc: vocabDefaut, user: { domaine_id: ID_RESTAU } }),
  'client.B': req('client', { voc: vocabDefaut, user: { domaine_id: ID_RESTAU } }),
  'gerant.B': req('gerant', { voc: vocabDefaut, user: { domaine_id: ID_RESTAU } }),
  'client.C': req('client', { voc: vocabDefaut, user: { domaine_id: ID_RESTAU } }),
  'acheteur.C': req('acheteur', { voc: vocabDefaut, user: { domaine_id: ID_RESTAU } }),
  admin: req('super_admin', { voc: vocabDefaut }),
};
const sansId = (s) => Object.fromEntries(Object.entries(JSON.parse(JSON.stringify(s))).filter(([k]) => k !== 'id'));

test('vraies fiches (lecture seule) : listPublic restauration identique au code d\'avant le lot pour 6 lecteurs ; empreintes de la référence de l\'oracle', async (t) => {
  const d = await lireVraies();
  if (d.raison) { t.skip(d.raison); return; }
  chargerVraies(d);
  assert.ok(d.fiches.length >= 60 && d.kb.length >= 30, `${d.fiches.length} fiches, ${d.kb.length} entrées`);
  const balisees = d.fiches.some((f) => ['titre', 'partie', 'contenu', 'contenu_defaut'].some((c) => /\[\[/.test(f[c] || '')));
  const fichesO = origineDe(d.fiches, ['titre', 'partie', 'contenu']);
  if (!balisees) assert.deepEqual(fichesO, d.fiches, 'sans balise, le rendu par défaut est l\'identité');
  const ref = estReference(d);
  const comparees = [];
  for (const [l, r] of Object.entries(LECTEURS)) {
    const slugsRef = REFERENCE.captures.manuel.lecteurs[l];
    // Contexte de visibilité du lecteur de la référence (comptes éphémères de l'oracle) ; admin et acheteur : le vrai (null).
    const ctx = ['admin', 'acheteur.C'].includes(l) ? undefined : new Set(slugsRef);
    contexteImpose = ctx;
    const res = await appeler(manuel.listPublic, r);
    assert.equal(res.statusCode, 200, l);
    assert.equal(JSON.stringify(res.corps), JSON.stringify(ancienListPublic(fichesO, ctx ?? null, r.user.role === 'gerant')), `${l} : au caractère près`);
    if (ref) {
      assert.deepEqual(res.corps.map((s) => s.slug), slugsRef, `${l} : slugs et ordre de la référence`);
      for (const s of res.corps) {
        assert.equal(md5(JSON.stringify(sansId(s))), REFERENCE.meta.empreintesManuel[l][s.slug], `${l} › ${s.slug} : empreinte NON masquée de la référence`);
      }
      comparees.push(`${l} ${res.corps.length}`);
    }
  }
  console.log(`  base ${d.base} : ${d.fiches.length} fiches, ${d.kb.length} entrées${balisees ? ', balisées' : ''} ; empreintes de la référence ${ref ? `comparées (${comparees.join(', ')})` : 'NON comparées (base différente de la référence)'}`);
});

test('vraies entrées et fiches (lecture seule) : recherche restauration identique au code d\'avant le lot ; empreintes de la base de la référence', async (t) => {
  const d = await lireVraies();
  if (d.raison) { t.skip(d.raison); return; }
  chargerVraies(d);
  const kbO = origineDe(d.kb, ['titre', 'contenu']);
  const fichesO = origineDe(d.fiches, ['titre', 'partie', 'contenu']);
  const questions = new Set(Object.keys(REFERENCE.captures.recherches));
  for (const [k, v] of Object.entries(REFERENCE.captures.recherchesDomaine)) questions.add(k.startsWith('fixe|') ? v.query : k.slice(k.indexOf('|') + 1));
  for (const e of kbO) questions.add(e.titre);
  for (const f of fichesO) questions.add(f.titre);
  for (const q of ['comment calculer le coût de revient', 'portail acheteur commande', 'perte casse', '']) questions.add(q);
  const contextes = [null, new Set(REFERENCE.captures.manuel.lecteurs['client.B']), new Set(REFERENCE.captures.manuel.lecteurs['client.C'])];
  let n = 0;
  for (const q of questions) {
    for (const ctx of contextes) {
      contexteImpose = ctx;
      const attendu = ancienneRecherche(kbO, fichesO, ctx, q);
      assert.deepEqual(await outils.executeToolCall(43, 'search_knowledge_base', { query: q }), attendu, `${q} (repli voc du compte)`);
      assert.deepEqual(await outils.executeToolCall(43, 'search_knowledge_base', { query: q }, vocabDefaut), attendu, `${q} (voc par défaut)`);
      n += 2;
    }
    contexteImpose = undefined;
    assert.deepEqual(await outils.executeToolCall(null, 'search_knowledge_base', { query: q }), ancienneRecherche(kbO, fichesO, null, q), `${q} (prospect)`);
    n += 1;
  }
  let empreintes = 0;
  if (estReference(d)) {
    // meta.empreintesBase : chaque entrée active cherchée par son titre, contexte du compte B (capture de l'oracle).
    contexteImpose = new Set(REFERENCE.captures.manuel.lecteurs['client.B']);
    for (const e of kbO.filter((x) => x.actif)) {
      const r = await outils.executeToolCall(43, 'search_knowledge_base', { query: e.titre });
      const trouve = r.results.find((x) => x.titre === e.titre && !x.titre.startsWith('Manuel — '));
      assert.ok(trouve, e.titre);
      assert.equal(md5(JSON.stringify({ titre: trouve.titre, contenu: trouve.contenu })), REFERENCE.meta.empreintesBase[e.titre], `${e.titre} : empreinte de la référence`);
      empreintes += 1;
    }
    assert.equal(empreintes, Object.keys(REFERENCE.meta.empreintesBase).length);
  }
  console.log(`  ${questions.size} questions, ${n} recherches comparées au code d'avant le lot ; ${empreintes} empreinte(s) de la base comparée(s) à la référence`);
});
