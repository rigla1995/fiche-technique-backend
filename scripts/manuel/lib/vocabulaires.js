/* Lot 2c — vocabulaires des outils du manuel (docs/lot-2c-spec.md §3.1, R3.1.1).
 *
 * R3.1.1 : un lexique LU (test/vocab-lexiques-test.json, domaines.json, fichier --lexique de la lecture de
 * production, domaines_activite.lexique) est une liste d'ÉCARTS au défaut. Tout outil construit donc son
 * vocabulaire par vocabDuLexique(resoudreLexique(LEXIQUE_DEFAUT, ecarts)) — jamais vocabDuLexique(ecarts) : les
 * clés dérivées sortiraient fausses sans erreur (« Espace Labo » au lieu de « Espace Cuisine »).
 *
 * Moteur : celui du serveur (src/utils/vocab.js, généré depuis le front), aucune copie. */
'use strict';
const path = require('path');
const { RACINE, lireJsonExterne, lireDomaines } = require('./commun');

const { LEXIQUE_DEFAUT } = require(path.join(RACINE, 'src', 'config', 'lexiqueDefaut'));
const { vocabDefaut, vocabDuLexique, resoudreLexique } = require(path.join(RACINE, 'src', 'utils', 'vocab'));

const FICHIER_ESSAIS = path.join(RACINE, 'test', 'vocab-lexiques-test.json');
const DOMAINES_ESSAI = Object.freeze(['hotellerie', 'ceramique', 'miroir']);

/** Lexique RÉSOLU d'une liste d'écarts (R3.1.1). */
const resoudre = (ecarts) => resoudreLexique(LEXIQUE_DEFAUT, ecarts && typeof ecarts === 'object' ? ecarts : {});

/** Vocabulaire d'une liste d'écarts, toujours résolue avant usage (R3.1.1). */
const vocabDesEcarts = (ecarts) => vocabDuLexique(resoudre(ecarts));

// JSON canonique (clés triées) : deux lexiques sont égaux s'ils ont les mêmes entrées, dans n'importe quel ordre.
const canonique = (v) => {
  if (Array.isArray(v)) return `[${v.map(canonique).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonique(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
};
const memeLexique = (a, b) => canonique(a) === canonique(b);

/** Écarts des lexiques d'essai (copie du front) : { hotellerie, ceramique, miroir }. */
function lexiquesEssai() {
  const j = lireJsonExterne(FICHIER_ESSAIS);
  const out = {};
  for (const d of DOMAINES_ESSAI) {
    if (!j[d] || typeof j[d] !== 'object') throw new Error(`test/vocab-lexiques-test.json : lexique « ${d} » absent`);
    out[d] = j[d];
  }
  return out;
}

/** Vocabulaires des 3 lexiques d'essai (H, C, miroir), résolus : rendus de contrôle du §3.5, point 6. */
function vocabulairesEssai() {
  const l = lexiquesEssai();
  return Object.fromEntries(DOMAINES_ESSAI.map((d) => [d, vocabDesEcarts(l[d])]));
}

/** Entrée d'un domaine de domaines.json ; un slug absent lève une erreur. */
function domaine(slug, domaines = lireDomaines()) {
  const d = domaines.domaines && domaines.domaines[slug];
  if (!d) throw new Error(`domaines.json : domaine « ${slug} » absent`);
  return d;
}

/** Vocabulaire d'un domaine de domaines.json, construit sur ses ÉCARTS résolus (R3.1.1). */
const vocabDuDomaine = (slug, domaines) => vocabDesEcarts(domaine(slug, domaines).ecarts);

/** Composants actifs d'un domaine de domaines.json (forme de mapComposant : libelle, libellePluriel,
 * typeTechnique, genre, elision, actif…), pour enrichirMotsCles et les variantes. */
const composantsDuDomaine = (slug, domaines) => domaine(slug, domaines).composants.slice();

/**
 * Cohérence des lexiques lus (contrôle de démarrage de controler.mjs, §3.1) → liste de problèmes (vide si tout va) :
 *   1. pour chaque domaine de domaines.json, le lexique résolu gardé égale resoudreLexique(écarts) du moteur
 *      courant (un écart : le moteur a changé depuis l'extraction, ou le fichier a été retouché) ;
 *   2. les lexiques H et C de test/vocab-lexiques-test.json, résolus, égalent ceux de domaines.json.
 */
function verifierLexiques(domaines = lireDomaines()) {
  const problemes = [];
  for (const [slug, d] of Object.entries(domaines.domaines || {})) {
    if (!memeLexique(resoudre(d.ecarts), d.lexique)) problemes.push(`domaines.json › ${slug} : lexique résolu ≠ resoudreLexique(ecarts) du moteur courant`);
    if (vocabDesEcarts(d.ecarts).estDefaut) problemes.push(`domaines.json › ${slug} : lexique sans écart (estDefaut vrai)`);
  }
  const essais = lexiquesEssai();
  for (const slug of ['hotellerie', 'ceramique']) {
    const d = domaines.domaines && domaines.domaines[slug];
    if (!d) { problemes.push(`domaines.json : domaine « ${slug} » absent`); continue; }
    if (!memeLexique(resoudre(essais[slug]), resoudre(d.ecarts))) {
      problemes.push(`test/vocab-lexiques-test.json › ${slug} ≠ domaines.json › ${slug} (lexiques résolus)`);
    }
  }
  return problemes;
}

/** Vocabulaire d'un fichier --lexique (lecture de production, §12.1) : un objet d'écarts, ou { lexique: écarts },
 * ou { ecarts: … } ; toujours résolu (R3.1.1). */
function vocabDuFichier(fichier) {
  const j = lireJsonExterne(path.resolve(fichier));
  const ecarts = j && typeof j === 'object' ? (j.ecarts || j.lexique || j) : null;
  if (!ecarts || typeof ecarts !== 'object' || Array.isArray(ecarts)) throw new Error(`${fichier} : objet d'écarts attendu`);
  return vocabDesEcarts(ecarts);
}

module.exports = {
  LEXIQUE_DEFAUT,
  vocabDefaut,
  DOMAINES_ESSAI,
  resoudre,
  vocabDesEcarts,
  memeLexique,
  lexiquesEssai,
  vocabulairesEssai,
  domaine,
  vocabDuDomaine,
  composantsDuDomaine,
  verifierLexiques,
  vocabDuFichier,
};
