// Lot 2c (spec docs/lot-2c-spec.md §5.1, §5.2) — le manuel et la base de connaissances dans les mots du domaine.
//
// Le manuel (`manuel_sections` : titre, partie, contenu, contenu_defaut) et la base de connaissances
// (`ai_knowledge_base` : titre, contenu) portent des balises `[[méthode:clé:args]]` (I7 révisée). Ce module les
// rend, les contrôle et lit les variantes par domaine (`manuel_sections_domaine`, migration 193).
//
// Fonctions pures, sauf `refuserBalises` (elle répond) et `controlerBalisesAuDemarrage` (elle lit la base qu'on
// lui passe ; jamais d'import du pool ici). Ordre d'emploi par un lecteur (R5.3.1, R5.3.2) :
//   1. résolution : `requeteManuel(slugVariantes(voc, profil), …)` (variante `valide` du domaine, sinon texte commun) ;
//   2. filtre de visibilité (`manuelSectionVisible`, src/utils/manuelVisibilite.js) ;
//   3. rendu : `rendreFiche` / `rendreEntreeBase` avec le vocabulaire du lecteur.
// Le rendu par défaut est l'identité : `rendre(vocabDefaut, x)` rend `x` pour un texte sans balise, et le texte
// d'origine pour un texte balisé (I10) ; `enrichirMotsCles` ne fait rien quand `voc.estDefaut` est vrai (R5.4).
// I12 : aucune variante n'est lue pour un domaine sans écart (`slugVariantes` rend null, la jointure ne répond pas).
// I8 : le slug du domaine est un paramètre `$1`, jamais un terme écrit dans le SQL.
const crypto = require('crypto');
const { LEXIQUE_DEFAUT, LEXIQUE_CLES } = require('../config/lexiqueDefaut');
const { vocabDefaut, rendre, balisesInvalides } = require('./vocab');

// ── Formes par défaut (motif de termesDans, frontend scripts/vocab-check.mjs) ─────────────────────────────────
// Mot entier (une lettre, un chiffre ou « _ » ne peut ni précéder ni suivre), formes les plus longues d'abord ;
// un mot sans tenir compte de la casse ; un sigle (2 à 4 capitales ou chiffres : « PT », « FT », « PU ») avec sa
// casse. Une forme portée par plusieurs clés est rattachée à la première (ordre de LEXIQUE_DEFAUT, spec §9.1).
const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SIGLE = /^[\p{Lu}\d]{2,4}$/u;
const motEntier = (formes, drapeaux) =>
  new RegExp(`(?<![\\p{L}\\p{N}_])(?:${[...formes].sort((a, b) => b.length - a.length).map(echapper).join('|')})(?![\\p{L}\\p{N}_])`, drapeaux);

const formesDuDefaut = (e) => [...new Set([e.sg, e.pl, e.court && e.court.sg, e.court && e.court.pl].filter(Boolean))];

const CLE_DE_FORME = new Map(); // forme (telle qu'écrite dans le lexique) → première clé qui la porte
for (const [cle, e] of Object.entries(LEXIQUE_DEFAUT)) {
  for (const f of formesDuDefaut(e)) if (!CLE_DE_FORME.has(f)) CLE_DE_FORME.set(f, cle);
}
const TOUTES_FORMES = [...CLE_DE_FORME.keys()];
const FORMES_MOTS = TOUTES_FORMES.filter((f) => !SIGLE.test(f));
const FORMES_SIGLES = TOUTES_FORMES.filter((f) => SIGLE.test(f));
const RE_MOTS = motEntier(FORMES_MOTS, 'giu');
const RE_SIGLES = FORMES_SIGLES.length ? motEntier(FORMES_SIGLES, 'gu') : null;
const MOT_EN_MINUSCULES = new Map(FORMES_MOTS.map((f) => [f.toLowerCase(), f]));

// Tout ce qui ressemble à une balise (même motif que `rendre`, src/utils/vocab.js) : candidats à contrôler, et
// passages masqués avant la recherche des formes (une clé écrite dans une balise n'est pas une forme du texte).
const CANDIDATE = /\[\[([^[\]\n]*)\]\]/g;
const masquerBalises = (texte) => texte.replace(CANDIDATE, (b) => ' '.repeat(b.length));
const A_BALISE = /\[\[/; // le texte porte-t-il « [[ » ?

/**
 * Formes par défaut du lexique présentes dans `texte`, HORS balises (une balise est masquée avant la recherche).
 * → occurrences dans l'ordre du texte : `[{ forme, cle, index, texte }]` (`forme` telle qu'écrite dans le lexique
 * par défaut, `texte` tel que trouvé). Liste vide pour un texte vide ou qui n'est pas une chaîne.
 */
function formesParDefaut(texte) {
  if (typeof texte !== 'string' || !texte) return [];
  const t = A_BALISE.test(texte) ? masquerBalises(texte) : texte;
  const trouvees = [];
  const parcourir = (re, sigle) => {
    if (!re) return;
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t)) !== null) {
      let forme = sigle ? m[0] : MOT_EN_MINUSCULES.get(m[0].toLowerCase());
      if (!forme) forme = FORMES_MOTS.find((f) => motEntier([f], 'iu').test(m[0])) || m[0];
      trouvees.push({ forme, cle: CLE_DE_FORME.get(forme) || null, index: m.index, texte: m[0] });
    }
  };
  parcourir(RE_MOTS, false);
  parcourir(RE_SIGLES, true);
  trouvees.sort((a, b) => a.index - b.index || b.texte.length - a.texte.length);
  // Deux recherches (mots, sigles) : un chevauchement garde la première occurrence, la plus longue à index égal.
  const sortie = [];
  let fin = -1;
  for (const o of trouvees) {
    if (o.index < fin) continue;
    sortie.push(o);
    fin = o.index + o.texte.length;
  }
  return sortie;
}

// ── Balises : grammaire ET clé connue (I11) ───────────────────────────────────────────────────────────────────
const CLES_CONNUES = new Set(LEXIQUE_CLES);
// Clé d'une balise de grammaire valide : `rendre` appelle voc[méthode](clé, …) ; un vocabulaire muet note la clé
// du PREMIER appel (pour `ex`, `Nom(clé)` est appelé avant `ex(texte…)`). Aucune copie de la grammaire ici.
const cleDeBalise = (balise) => {
  let cle = null;
  const espion = new Proxy({}, { get: () => (k) => { if (cle === null) cle = k; return ''; } });
  rendre(espion, balise, () => {});
  return cle;
};

/**
 * Balises fautives d'un texte : `balisesInvalides` (grammaire, src/utils/vocab.js), plus « clé inconnue » pour une
 * balise de grammaire valide dont la clé n'est pas dans LEXIQUE_CLES (`[[nom:labbo]]`, que `balisesInvalides` ne
 * voit pas et que `rendre` afficherait « ‹labbo› »). → `[{ balise, raison }]`, dans l'ordre du texte.
 */
function verifierBalises(texte) {
  if (typeof texte !== 'string' || !A_BALISE.test(texte)) return [];
  const fautives = [];
  for (const m of texte.matchAll(CANDIDATE)) {
    const balise = m[0];
    const grammaire = balisesInvalides(balise);
    if (grammaire.length) { fautives.push(...grammaire); continue; }
    const cle = cleDeBalise(balise);
    if (!CLES_CONNUES.has(cle)) fautives.push({ balise, raison: `clé inconnue « ${cle} »` });
  }
  return fautives;
}

/**
 * Refus d'une écriture admin (R5.7.1) : pose `res.locals.vocabBrut = true` (le message cite une donnée saisie, il
 * n'est jamais rendu par rendreMessages) et répond 400.
 *   erreurs : `[{ champ, balise, raison }]` → `{ code: 'BALISE_INVALIDE', message, balises }` ;
 *             une entrée `{ champ, interdite: true }` (balise dans mots_cles, slug, icone, ecran, categorie)
 *             → `{ code: 'BALISE_INTERDITE', message }`.
 */
function refuserBalises(res, erreurs) {
  const liste = Array.isArray(erreurs) ? erreurs : [];
  res.locals = res.locals || {};
  res.locals.vocabBrut = true;
  const interdites = liste.filter((e) => e && e.interdite);
  if (interdites.length) {
    const champs = [...new Set(interdites.map((e) => e.champ))].join(', ');
    return res.status(400).json({
      code: 'BALISE_INTERDITE',
      message: `Aucune balise « [[ » n'est permise dans ce champ : ${champs}`,
    });
  }
  const balises = liste.map((e) => ({ champ: e.champ, balise: e.balise, raison: e.raison }));
  const premiere = balises[0];
  const message = premiere
    ? `Balise invalide dans le champ « ${premiere.champ} » : ${premiere.balise} (${premiere.raison})${balises.length > 1 ? ` — ${balises.length} balise(s) fautive(s)` : ''}`
    : 'Balise invalide';
  return res.status(400).json({ code: 'BALISE_INVALIDE', message, balises });
}

// ── Variantes (I12) et requête commune (§5.2) ─────────────────────────────────────────────────────────────────
/** Slug du domaine dont les variantes sont lues : null pour un vocabulaire par défaut (admin, restauration, café,
 * boulangerie, domaine sans lexique) ou sans profil. */
const slugVariantes = (voc, profil) => (!voc || voc.estDefaut ? null : ((profil && profil.slug) ?? null));

// Colonnes de manuelController.listPublic (I9 : mêmes noms, même ordre).
const COLONNES_LECTURE = `s.id, s.slug, COALESCE(d.titre, s.titre) AS titre, s.icone, s.partie, s.ordre,
       COALESCE(d.contenu, s.contenu) AS contenu, COALESCE(d.mots_cles, s.mots_cles) AS mots_cles,
       s.ecran, s.visible_gerant, s.actif, s.updated_at`;
// Colonnes de la recherche de l'assistant (R5.3.2 : slug, titre, partie, contenu, mots_cles).
const COLONNES_RECHERCHE = `s.slug, COALESCE(d.titre, s.titre) AS titre, s.partie,
       COALESCE(d.contenu, s.contenu) AS contenu, COALESCE(d.mots_cles, s.mots_cles) AS mots_cles`;

/**
 * Requête du §5.2 et ses paramètres : fiches actives, variante `valide` du domaine `slug` si elle existe, sinon
 * texte commun ; ordre de lecture du manuel (`s.ordre, s.id`).
 *   slug    : `slugVariantes(voc, profil)` ; null (ou vide) → aucune jointure ne répond, texte commun ;
 *   gerant  : ajoute `AND s.visible_gerant = true` (comme listPublic pour un gérant) ;
 *   recherche : colonnes de la recherche de l'assistant seulement.
 * → `{ text, values }`, prêt pour `pool.query(text, values)`.
 */
function requeteManuel(slug, { gerant = false, recherche = false } = {}) {
  const text = `SELECT ${recherche ? COLONNES_RECHERCHE : COLONNES_LECTURE}
  FROM manuel_sections s
  LEFT JOIN manuel_sections_domaine d
         ON d.section_id = s.id AND d.domaine_slug = $1 AND d.statut = 'valide'
 WHERE s.actif = true${gerant ? ' AND s.visible_gerant = true' : ''}
 ORDER BY s.ordre, s.id`;
  return { text, values: [typeof slug === 'string' && slug ? slug : null] };
}

// ── Mots-clés enrichis (R5.4, décision 3) ─────────────────────────────────────────────────────────────────────
const CLES_ENRICHIES = LEXIQUE_CLES.filter((k) => !/_abr$/.test(k));
const RE_CLE_SANS_CASSE = new Map(CLES_ENRICHIES.map((k) => [k, motEntier(formesDuDefaut(LEXIQUE_DEFAUT[k]), 'iu')]));
const formesRendues = (v, k) => [v.nom(k), v.nom(k, true), v.court(k), v.court(k, true)].map(String);
// Type technique d'un composant → clé du lexique (R5.4, point 3) : activite → activite, labo → labo,
// gerant → gerant, acheteurs → acheteur (les 4 types de domaineProfilService.TYPES_TECHNIQUES ; le « s » final
// retiré, la clé doit exister dans le lexique).
const cleDuType = (type) => {
  const k = String(type || '').replace(/s$/, '');
  return Object.prototype.hasOwnProperty.call(LEXIQUE_DEFAUT, k) ? k : null;
};
const lettres = (s) => (String(s).match(/\p{L}/gu) || []).length;
const entreesDe = (motsCles) => String(motsCles).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);

/**
 * Mots-clés enrichis au rendu (R5.4) :
 *   1. `motsCles` vide ou `voc.estDefaut` → `motsCles` tel quel (restauration, café, boulangerie) ;
 *   2. clé (hors *_abr) dont une forme par défaut (sg, pl, formes courtes) est dans `motsCles` (mot entier, sans
 *      casse, sigles compris) et dont le rendu diffère dans `voc` → `voc.nom(k)`, `voc.nom(k, true)`,
 *      `voc.court(k)`, `voc.court(k, true)` ;
 *   3. composant actif dont le type technique correspond à une telle clé, quand une forme par défaut de la clé est
 *      une ENTRÉE entière de `motsCles` → son libellé et son pluriel, en minuscules ; un composant dont le libellé
 *      a moins de 4 lettres (« Bar », « Spa ») n'ajoute rien ;
 *   4. sans doublon ni mot déjà présent (entrée entière, sans casse) → `${motsCles}, ${ajouts.join(', ')}`.
 */
function enrichirMotsCles(voc, motsCles, composants) {
  if (!motsCles || typeof motsCles !== 'string' || !voc || voc.estDefaut) return motsCles;
  const presents = new Set(entreesDe(motsCles));
  const ajouts = [];
  const ajouter = (mot) => {
    const m = String(mot || '').trim();
    if (!m || presents.has(m.toLowerCase())) return;
    presents.add(m.toLowerCase());
    ajouts.push(m);
  };
  const entrees = entreesDe(motsCles);
  const clesRetenues = new Set();
  for (const k of CLES_ENRICHIES) {
    const re = RE_CLE_SANS_CASSE.get(k);
    re.lastIndex = 0;
    if (!re.test(motsCles)) continue;
    const rendues = formesRendues(voc, k);
    const parDefaut = formesRendues(vocabDefaut, k);
    if (rendues.every((f, i) => f === parDefaut[i])) continue;
    clesRetenues.add(k);
    rendues.forEach(ajouter);
  }
  for (const c of Array.isArray(composants) ? composants : []) {
    if (!c || c.actif === false) continue;
    const k = cleDuType(c.typeTechnique);
    if (!k || !clesRetenues.has(k)) continue;
    const formes = formesDuDefaut(LEXIQUE_DEFAUT[k]).map((f) => f.toLowerCase());
    if (!formes.some((f) => entrees.includes(f))) continue;
    if (!c.libelle || lettres(c.libelle) < 4) continue;
    ajouter(String(c.libelle).toLowerCase());
    if (c.libellePluriel) ajouter(String(c.libellePluriel).toLowerCase());
  }
  return ajouts.length ? `${motsCles}, ${ajouts.join(', ')}` : motsCles;
}

// ── Rendu d'une ligne ─────────────────────────────────────────────────────────────────────────────────────────
const rendreChamps = (voc, ligne, champs, composants) => {
  const v = voc || vocabDefaut;
  const copie = { ...ligne };
  for (const champ of champs) if (champ in copie) copie[champ] = rendre(v, copie[champ]);
  if ('mots_cles' in copie) copie.mots_cles = enrichirMotsCles(v, copie.mots_cles, composants);
  return copie;
};

/** Copie d'une fiche du manuel : `titre`, `partie`, `contenu` rendus avec `voc`, `mots_cles` enrichis (R5.4).
 * Les autres champs sont repris tels quels, dans le même ordre. */
const rendreFiche = (voc, ligne, composants) => rendreChamps(voc, ligne, ['titre', 'partie', 'contenu'], composants);

/** Copie d'une entrée de la base de connaissances : `titre`, `contenu` rendus, `mots_cles` enrichis. */
const rendreEntreeBase = (voc, ligne, composants) => rendreChamps(voc, ligne, ['titre', 'contenu'], composants);

// ── Champs sans balises (R5.7.2, R5.8) ────────────────────────────────────────────────────────────────────────
const CHAMPS_BALISES = Object.freeze({
  manuel_sections: ['titre', 'partie', 'contenu'],
  ai_knowledge_base: ['titre', 'contenu'],
});
// Champs admis sans balise (toutes leurs formes sont exclues au balisage) : écrit par
// scripts/manuel/generer-migrations.mjs (R3.6.5) ; absent ou illisible → liste vide.
const lireAdmis = () => {
  try {
    const liste = require('../config/manuelSansBaliseAdmis.json');
    return Array.isArray(liste) ? liste : [];
  } catch (err) {
    if (err instanceof SyntaxError) console.warn(`[manuel] manuelSansBaliseAdmis.json illisible : ${err.message}`);
    return [];
  }
};
const ADMIS = lireAdmis();
const md5 = (s) => crypto.createHash('md5').update(String(s)).digest('hex');

/**
 * Champs d'une ligne qui ne portent aucune balise (« [[ ») mais au moins une forme par défaut, et dont le md5 n'est
 * pas admis pour cette table et ce champ. Champ par champ : un titre resté brut à côté d'un contenu balisé est
 * signalé. `table` : 'manuel_sections' (titre, partie, contenu) ou 'ai_knowledge_base' (titre, contenu).
 * `admis` : liste `{ table, champ, md5 }` (par défaut, src/config/manuelSansBaliseAdmis.json).
 */
function champsSansBalises(ligne, table, admis = ADMIS) {
  const champs = CHAMPS_BALISES[table];
  if (!champs || !ligne) return [];
  return champs.filter((champ) => {
    const texte = ligne[champ];
    if (typeof texte !== 'string' || A_BALISE.test(texte)) return false;
    if (!formesParDefaut(texte).length) return false;
    const h = md5(texte);
    return !(admis || []).some((a) => a && a.table === table && a.champ === champ && a.md5 === h);
  });
}

// Une ligne porte-t-elle au moins une balise dans un champ balisable (contenu_defaut compris pour le manuel) ?
const porteBalise = (ligne, table) =>
  [...(CHAMPS_BALISES[table] || []), ...(table === 'manuel_sections' ? ['contenu_defaut'] : [])]
    .some((c) => typeof ligne[c] === 'string' && A_BALISE.test(ligne[c]));

/**
 * `champsSansBalises` de chaque ligne d'une table, avec la règle commune de R5.7.2 et R5.8 : quand AUCUNE ligne de
 * la table ne porte de balise (manuel pas encore balisé : base locale avant la consolidation, production entre D1
 * et D2), aucun champ n'est signalé. → tableau parallèle à `lignes` (listes de champs, vides si rien à signaler).
 */
function sansBalisesDesLignes(lignes, table, admis = ADMIS) {
  const liste = Array.isArray(lignes) ? lignes : [];
  if (!liste.some((l) => l && porteBalise(l, table))) return liste.map(() => []);
  return liste.map((l) => champsSansBalises(l, table, admis));
}

/**
 * Avertissement au démarrage (R5.8), jamais bloquant : lit les fiches et entrées actives de `pool` et écrit
 *   - « [manuel] manuel non balisé (aucune balise en base) » quand aucune fiche ne porte de balise ;
 *   - sinon « [manuel] N fiche(s) sans balises : slug (champs), … » quand N > 0 ;
 *   - « [manuel] base de connaissances : N entrée(s) sans balises : titre (champs), … » quand N > 0 ;
 *   - rien quand tout est balisé.
 * Ne lève jamais (une erreur de lecture est écrite et avalée). → le nombre de lignes écrites (console.warn).
 */
async function controlerBalisesAuDemarrage(pool, admis = ADMIS) {
  let lignes = 0;
  try {
    const [manuel, base] = await Promise.all([
      pool.query(`SELECT slug, titre, partie, contenu, contenu_defaut
                    FROM manuel_sections WHERE actif = true ORDER BY ordre, id`),
      pool.query('SELECT id, titre, contenu FROM ai_knowledge_base WHERE actif = true ORDER BY id'),
    ]);
    const fiches = manuel.rows || [];
    if (!fiches.some((f) => porteBalise(f, 'manuel_sections'))) {
      console.warn('[manuel] manuel non balisé (aucune balise en base)');
      lignes += 1;
    } else {
      const sans = sansBalisesDesLignes(fiches, 'manuel_sections', admis)
        .map((champs, i) => ({ champs, f: fiches[i] })).filter((x) => x.champs.length);
      if (sans.length) {
        console.warn(`[manuel] ${sans.length} fiche(s) sans balises : ${sans.map((x) => `${x.f.slug} (${x.champs.join(', ')})`).join(', ')}`);
        lignes += 1;
      }
    }
    const entrees = base.rows || [];
    const sansBase = sansBalisesDesLignes(entrees, 'ai_knowledge_base', admis)
      .map((champs, i) => ({ champs, e: entrees[i] })).filter((x) => x.champs.length);
    if (sansBase.length) {
      console.warn(`[manuel] base de connaissances : ${sansBase.length} entrée(s) sans balises : ${sansBase.map((x) => `${rendre(vocabDefaut, x.e.titre)} (${x.champs.join(', ')})`).join(', ')}`);
      lignes += 1;
    }
  } catch (err) {
    console.warn(`[manuel] contrôle des balises impossible : ${err && err.message ? err.message : err}`);
    lignes += 1;
  }
  return lignes;
}

module.exports = {
  formesParDefaut,
  verifierBalises,
  refuserBalises,
  slugVariantes,
  enrichirMotsCles,
  rendreFiche,
  rendreEntreeBase,
  champsSansBalises,
  sansBalisesDesLignes,
  requeteManuel,
  controlerBalisesAuDemarrage,
  CHAMPS_BALISES,
};
