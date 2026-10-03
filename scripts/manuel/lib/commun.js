/* Lot 2c — module partagé des outils du manuel (docs/lot-2c-spec.md §3).
 *
 * Chemins du dossier scripts/manuel/, lecture et écriture des fichiers en LF (un « \r » est refusé, §3.8),
 * instantané d'origine (§3.2), empreintes globales (requête (1) de scripts/controle-avant-2c.sql), lots.json,
 * parties.json, domaines.json. Aucune fonction de rendu ni de contrôle ici : elles sont dans
 * src/utils/manuelRendu.js et src/utils/vocab.js (le moteur du serveur), jamais copiées.
 *
 * CommonJS, syntaxe de Node 20 (l'image du serveur, Dockerfile:1) : retour-2c.js peut s'en servir dans le conteneur.
 * Un .mjs l'importe par createRequire(import.meta.url). */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const RACINE = path.resolve(__dirname, '..', '..', '..');
const DOSSIER = path.join(RACINE, 'scripts', 'manuel');

// Empreintes globales du 02/10 (DECISIONS-2c, spec §0.1), recalculées sur les fichiers par R3.2.2.
const EMPREINTES_ATTENDUES = Object.freeze({
  manuel: '67737956d92ba0e1d836c17747d66f5c',
  base: '8779fd652a4a4dd50531e9e3323aaad6',
});

/** Chemins sous une racine de sortie (par défaut scripts/manuel ; un test passe un dossier jetable). */
const chemins = (racine = DOSSIER) => ({
  racine,
  origineManuel: path.join(racine, 'origine', 'manuel'),
  origineBase: path.join(racine, 'origine', 'base'),
  baliseManuel: path.join(racine, 'balise', 'manuel'),
  baliseBase: path.join(racine, 'balise', 'base'),
  variantes: path.join(racine, 'variantes'),
  rendus: path.join(racine, 'rendus'),
  relectures: path.join(racine, 'relectures'),
  besoins: path.join(racine, 'besoins'),
});
const CHEMINS = chemins();

const md5 = (s) => crypto.createHash('md5').update(String(s), 'utf8').digest('hex');

/** Lit un fichier texte UTF-8 ; refuse un « \r » (les fichiers de scripts/manuel/ sont en LF, §3.8). */
function lireTexte(fichier) {
  const t = fs.readFileSync(fichier, 'utf8');
  if (t.includes('\r')) throw new Error(`${path.relative(RACINE, fichier)} : « \\r » trouvé (fichier attendu en LF, spec §3.8)`);
  return t.charCodeAt(0) === 0xfeff ? t.slice(1) : t;
}

/** Écrit un fichier texte en LF, sans BOM ; refuse un texte qui contient « \r ». Crée les dossiers. */
function ecrireTexte(fichier, texte) {
  if (typeof texte !== 'string') throw new Error(`${fichier} : texte attendu`);
  if (texte.includes('\r')) throw new Error(`${path.relative(RACINE, fichier)} : refus d'écrire un « \\r » (spec §3.8)`);
  fs.mkdirSync(path.dirname(fichier), { recursive: true });
  fs.writeFileSync(fichier, texte, 'utf8');
}

const lireJson = (fichier) => JSON.parse(lireTexte(fichier));
/** JSON d'un fichier HORS de scripts/manuel/ (test/vocab-lexiques-test.json, souvent en CRLF dans la copie de
 * travail) : un « \r » entre deux valeurs JSON est un blanc, il n'est pas refusé. */
const lireJsonExterne = (fichier) => {
  const t = fs.readFileSync(fichier, 'utf8');
  return JSON.parse(t.charCodeAt(0) === 0xfeff ? t.slice(1) : t);
};
const ecrireJson = (fichier, objet) => ecrireTexte(fichier, `${JSON.stringify(objet, null, 2)}\n`);

/** Nom de fichier d'une entrée de la base : titre translittéré, minuscules et tirets (« Labo central » →
 * « labo-central », R3.2.1). La vraie clé reste `cle` = lower(titre) d'origine. */
const nomFichierBase = (titre) => String(titre)
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/œ/g, 'oe').replace(/æ/g, 'ae')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

// Ordre de la requête (1) : ORDER BY slug (manuel), ORDER BY lower(titre) (base), en collation French_France.1252.
// Les 61 slugs et les 32 clés ont le même ordre en points de code (vérifié par extraire-origine.js contre la base,
// qui refuse d'écrire si l'ordre diffère) : les fichiers sont triés ainsi.
const parPointsDeCode = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Lignes d'empreinte du manuel, formule de la requête (1) de controle-avant-2c.sql :
 * slug|titre|partie|md5(garde)|md5(contenu)|mots_cles, triées par slug, jointes par « \n ». */
function empreinteManuel(fiches) {
  const lignes = [...fiches]
    .sort((a, b) => parPointsDeCode(a.slug, b.slug))
    .map((f) => [f.slug, f.titre, f.partie ?? '', f.md5Garde, f.md5Contenu, f.mots_cles ?? ''].join('|'));
  return md5(lignes.join('\n'));
}

/** Lignes d'empreinte de la base : lower(titre)|titre|md5(contenu)|mots_cles|actif, triées par lower(titre). */
function empreinteBase(entrees) {
  const lignes = [...entrees]
    .sort((a, b) => parPointsDeCode(a.cle, b.cle))
    .map((e) => [e.cle, e.titre, e.md5Contenu, e.mots_cles ?? '', String(e.actif)].join('|'));
  return md5(lignes.join('\n'));
}

const fichiersDe = (dossier, extension) => (fs.existsSync(dossier)
  ? fs.readdirSync(dossier).filter((n) => n.endsWith(extension)).map((n) => n.slice(0, -extension.length)).sort(parPointsDeCode)
  : []);

/** Instantané d'origine lu sur les fichiers (§3.2). Chaque md5 est RECALCULÉ sur le .md (md5Contenu) et comparé
 * à celui du .json : un écart lève une erreur. `md5Garde` vient du .json (le texte de contenu_defaut n'est pas
 * gardé : il vaut contenu pour les 56 fiches non modifiées, il est NULL pour les 5 autres, R3.2.1).
 * → { fiches: [{ ...json, contenu }], entrees: [{ ...json, contenu, fichier }] }, triés par slug / clé. */
function lireOrigine(racine = DOSSIER) {
  const c = chemins(racine);
  const fiches = fichiersDe(c.origineManuel, '.json').map((slug) => {
    const meta = lireJson(path.join(c.origineManuel, `${slug}.json`));
    const contenu = lireTexte(path.join(c.origineManuel, `${slug}.md`));
    if (meta.slug !== slug) throw new Error(`origine/manuel/${slug}.json : slug « ${meta.slug} » ≠ nom du fichier`);
    if (md5(contenu) !== meta.md5Contenu) throw new Error(`origine/manuel/${slug} : md5 du .md ≠ md5Contenu du .json`);
    if (meta.defautNull && meta.md5Garde !== meta.md5Contenu) throw new Error(`origine/manuel/${slug} : défaut NULL mais md5Garde ≠ md5Contenu`);
    return { ...meta, contenu };
  });
  const entrees = fichiersDe(c.origineBase, '.json').map((fichier) => {
    const meta = lireJson(path.join(c.origineBase, `${fichier}.json`));
    const contenu = lireTexte(path.join(c.origineBase, `${fichier}.md`));
    if (nomFichierBase(meta.titre) !== fichier) throw new Error(`origine/base/${fichier}.json : nom de fichier ≠ titre translittéré`);
    if (md5(contenu) !== meta.md5Contenu) throw new Error(`origine/base/${fichier} : md5 du .md ≠ md5Contenu du .json`);
    return { ...meta, contenu, fichier };
  });
  return { fiches, entrees };
}

/** Empreintes globales recalculées sur les fichiers (R3.2.2). */
function empreintesOrigine(racine = DOSSIER) {
  const { fiches, entrees } = lireOrigine(racine);
  return { manuel: empreinteManuel(fiches), base: empreinteBase(entrees), fiches: fiches.length, entrees: entrees.length };
}

const lireLots = (racine = DOSSIER) => lireJson(path.join(racine, 'lots.json'));
const lireParties = (racine = DOSSIER) => lireJson(path.join(racine, 'parties.json'));
const lireDomaines = (racine = DOSSIER) => lireJson(path.join(racine, 'domaines.json'));

/**
 * Exclusions d'une fiche (ou d'une entrée) appliquées à ses textes, DANS L'ORDRE DE LA LISTE, par la règle de
 * l'oracle (check-invariant-vocab.js, R2.4.2 : chaque `extrait` est retiré par split/join, remplacé par « ⟦x⟧ ») :
 * un extrait plus long doit donc précéder un extrait qu'il contient (« sous-produit transformé » avant
 * « sous-produit »). → { textes (extraits retirés), emplois : nombre de retraits par exclusion, tous textes réunis }.
 * « occurrences » d'une exclusion = son emploi sur le texte BALISÉ du contenu et du titre (spec §3.3, §3.5 point 3).
 */
function retirerExtraits(textes, exclusions) {
  let ts = (Array.isArray(textes) ? textes : [textes]).map((t) => (typeof t === 'string' ? t : ''));
  const emplois = (Array.isArray(exclusions) ? exclusions : []).map((x) => {
    const e = x && x.extrait;
    if (typeof e !== 'string' || !e) return 0;
    let n = 0;
    ts = ts.map((t) => {
      const morceaux = t.split(e);
      n += morceaux.length - 1;
      return morceaux.join('⟦x⟧');
    });
    return n;
  });
  return { textes: ts, emplois };
}

/** Partie balisée d'une partie d'origine (parties.json, §3.3) ; une partie inconnue lève une erreur. */
function partieBalisee(partie, parties = lireParties()) {
  const p = (parties.parties || []).find((x) => x.origine === partie);
  if (!p) throw new Error(`partie « ${partie} » absente de parties.json`);
  return p.balisee;
}

/** Lot d'une fiche (slug) ou d'une entrée de la base (nom de fichier) dans lots.json ; null si aucun. */
function lotDe(nom, { base = false } = {}, lots = lireLots()) {
  for (const [lot, l] of Object.entries(lots.lots || {})) {
    if (!base && Array.isArray(l.fiches) && l.fiches.includes(nom)) return lot;
    if (base && Array.isArray(l.base) && l.base.includes(nom)) return lot;
  }
  return null;
}

module.exports = {
  RACINE,
  DOSSIER,
  CHEMINS,
  EMPREINTES_ATTENDUES,
  chemins,
  md5,
  lireTexte,
  ecrireTexte,
  lireJson,
  lireJsonExterne,
  ecrireJson,
  nomFichierBase,
  parPointsDeCode,
  empreinteManuel,
  empreinteBase,
  lireOrigine,
  empreintesOrigine,
  lireLots,
  lireParties,
  lireDomaines,
  retirerExtraits,
  partieBalisee,
  lotDe,
};
