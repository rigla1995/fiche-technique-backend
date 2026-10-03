/* Lot 2c — contrôle par fiche du manuel balisé (docs/lot-2c-spec.md §3.5).
 *
 *   node scripts/manuel/controler.mjs <slug>…                   fiches données (rendus dans rendus/<lot de la fiche>/)
 *   node scripts/manuel/controler.mjs --lot L3                  toutes les fiches du lot (L9 : les 32 entrées ; V-* : ses variantes)
 *   node scripts/manuel/controler.mjs --base <fichier>…         entrées de la base (nom de fichier de origine/base/)
 *   node scripts/manuel/controler.mjs --variante <domaine> <slug>…   variantes rédigées (§3.5, dernier paragraphe)
 *   node scripts/manuel/controler.mjs --tout                    61 fiches, 32 entrées, variantes présentes, contrôles
 *                                                               d'ensemble, rapport « mots du métier » → rendus/tout.json
 * Options :
 *   --lexique <fichier>  rejoue le contrôle avec le lexique Hôtellerie de la lecture de production (§12.1, (7)) : une
 *                        liste d'ÉCARTS (objet, ou { lexique } / { ecarts }), toujours résolue (R3.1.1) ; elle remplace
 *                        le lexique H d'essai pour les rendus et les signalements. Refus (code 2) d'un fichier dont une
 *                        clé n'est pas du lexique (fichier enveloppé) ou dont les écarts donnent le lexique par défaut ;
 *                        le md5 de lexique::text est affiché et comparé au champ hotellerie.md5Lexique de la lecture de
 *                        production (refus s'il diffère) ;
 *   --lecture <fichier>  lecture de production pour cette comparaison (défaut : scripts/manuel/lecture-production.json,
 *                        celle du générateur ; absente : md5 affiché, non comparé) ;
 *   --racine <dossier>   racine des fichiers de travail (balise/, variantes/, relectures/, rendus/) à la place de
 *                        scripts/manuel/ (tests, essais) ; origine/, parties.json, lots.json, domaines.json restent ceux
 *                        de scripts/manuel/.
 *
 * Une fiche PASSE si les points 1 à 6 passent (code de sortie 0). Les points 7 à 12 sont des SIGNALEMENTS : chacun est
 * corrigé, ou accepté avec sa raison dans relectures/<lot>.auto.json (format : GUIDE-BALISAGE §15 ; une ligne
 * { fiche, point, domaine, texte, decision: "accepté", raison } ; « domaine » absent = tous les domaines ; pour le
 * point 12 « texte » = le mot, une ligne par mot et par fiche). « --tout » n'est vert que si, en plus, les contrôles
 * d'ensemble passent, aucun signalement ne reste « à traiter », aucune acceptation n'est sans objet et chaque variante
 * présente passe (P1, P2).
 *
 * Les 12 points (§3.5), pour chaque fiche, dans cet ordre :
 *   1. identité (I10) : rendu par défaut = origine en octets (Buffer.equals) pour le contenu, contenu_defaut (md5 du
 *      rendu = md5Garde de l'origine : pour les 5 fiches à défaut NULL, l'origine est le contenu), le titre et la partie
 *      (forme balisée de parties.json) ;
 *   2. balises valides (I11) : verifierBalises (src/utils/manuelRendu.js) vide sur chaque champ balisé ;
 *   3. résiduels : aucune forme par défaut (formesParDefaut) hors balises, une fois retirés les extraits exclus (dans
 *      l'ordre de la liste, retirerExtraits de lib/commun.js, règle de l'oracle) puis MASQUÉES les cibles de liens
 *      « (#slug) » (jamais balisées ni exclues : GUIDE §4, 200 formes dans 185 cibles) ; chaque exclusion employée
 *      exactement « occurrences » fois (contenu et titre balisés réunis), de type admis, justifiée, contenant une forme
 *      par défaut, présente telle quelle dans chaque rendu ; aucune balise (hors acc, accN, ex) collée à un trait d'union
 *      (« sous-[[nom:pt]] » rend « sous-préparation » en H, R3.4.3 : on n'y balise jamais) ;
 *   4. liens : même suite de cibles que l'origine dans chaque rendu ; chaque cible « #x » est un slug existant ; aucun
 *      libellé de lien rendu vide ;
 *   5. blocs et tableaux : même suite de mots-clés « ::: » que l'origine (texte balisé et chaque rendu) ; même nombre de
 *      lignes ; chaque ligne de tableau garde son nombre de « | » dans chaque rendu ;
 *   6. rendus Hôtellerie, Céramique, miroir écrits dans rendus/<lot>/<domaine>/ ; aucun rendu (défaut compris) ne
 *      contient « [[ », « ]] » ni « ‹clé› » ;
 *   7. mots répétés (rendus H, C, miroir ; absents du rendu par défaut) : mot ou groupe de deux mots répété à la suite ;
 *      rendu d'une balise de deux mots ou plus (déterminant ôté) qui revient dans la même phrase à moins de 12 mots ;
 *      rendu d'une balise suivi d'un mot de même racine que son dernier mot (« cuisine centrale central ») ;
 *   8. gloses identiques « X (X) » et définitions circulaires « | **X** | X … » (absentes du rendu par défaut) ;
 *   9. élisions fautives (« d' », « l' », « qu' » + consonne ; « de », « le », « la », « que », « du », « au », « ce »,
 *      « ma », « ta », « sa » + voyelle ou h ; absentes du rendu par défaut) ;
 *  10. déterminant en clair devant une balise nom, Nom, court, Court, Titre ou MAJ (sur le texte BALISÉ), collé à la
 *      balise ou séparé d'elle par un adjectif (« un autre [[nom:labo]] », « le même [[nom:labo]] ») ;
 *  11. appositions : deux balises collées dont la seconde est en nom / Nom sur une clé à apposition (appo du lexique) ;
 *  12. collisions de sens (H et C) : forme du lexique du domaine (sg, pl, formes courtes) qui diffère du défaut et se
 *      trouve EN CLAIR dans la fiche (balises et cibles de liens masquées). Le tableau du §10.3 compte aussi des
 *      fragments de formes (« fabriqué », « livraison ») : l'outil s'en tient aux formes, comme le point 12.
 * Contrôles d'ensemble (--tout) : 12 parties rendues distinctes, 61 titres rendus distincts, 32 titres de la base rendus
 * distincts sans casse, dans chaque domaine (défaut, H, C, miroir) ; titres balisés de la base uniques sans casse
 * (R4.3.2) ; longueurs brutes titre ≤ 200, partie ≤ 60 ; baseMd5 de chaque variante = md5 du balise/manuel/<slug>.md.
 * Rapport « mots du métier » (--tout, et pour chaque variante) : MOTS_METIER_MANUEL (R2.4.3) comptés sur le texte
 * d'origine, mot entier, sans casse ; un mot qui fait partie d'une forme du lexique (« food » de « food cost ») ne compte
 * pas. Jamais un échec.
 *
 * Démarrage : verifierLexiques() (lib/vocabulaires.js, §3.1) doit être vide, sinon refus (code 2).
 * Lexiques : H, C et miroir de test/vocab-lexiques-test.json, RÉSOLUS (R3.1.1) ; moteur du serveur, aucune copie.
 * Aucune base, aucun réseau. Écrit seulement dans rendus/ (non versionné).
 * Codes de sortie : 0 tout passe ; 1 au moins un échec ; 2 refus (usage, lexiques incohérents). */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { pathToFileURL } from 'url';

const require = createRequire(import.meta.url);
const C = require('./lib/commun.js');
const V = require('./lib/vocabulaires.js');
const { formesParDefaut, verifierBalises } = require('../../src/utils/manuelRendu.js');
const { rendre, vocabDefaut } = require('../../src/utils/vocab.js');
const { LEXIQUE_DEFAUT } = require('../../src/config/lexiqueDefaut.js');

export const TYPES_EXCLUSION = Object.freeze(['homonyme', 'locution', 'nom-fige', 'capitales', 'exemple', 'glose']);
const DOMAINES_RENDUS = V.DOMAINES_ESSAI; // hotellerie, ceramique, miroir
const DOMAINES_COLLISIONS = ['hotellerie', 'ceramique'];
const TITRE_MAX = 200;
const PARTIE_MAX = 60;
const FRONT = path.resolve(C.RACINE, '..', 'fiche-technique-frontend');

const muet = () => {};
export const rendu = (voc, t) => (typeof t === 'string' ? rendre(voc, t, muet) : t);
const memesOctets = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.from(a, 'utf8').equals(Buffer.from(b, 'utf8'));
const longueur = (s) => [...String(s ?? '')].length; // varchar compte des caractères (points de code)

// Motifs. CANDIDATE = celui de `rendre` (src/utils/vocab.js:38) : ce que le moteur prend pour une balise.
const CANDIDATE = /\[\[([^[\]\n]*)\]\]/g;
const BALISE_BRUTE = /\[\[|\]\]|‹[a-z0-9_]+›/;
const CIBLE_LIEN = /\]\(([^)\s]*)\)/g;
const LIBELLE_VIDE = /\[\s*\]\(/;
const masquerBalises = (t) => String(t).replace(CANDIDATE, (b) => ' '.repeat(b.length));
const masquerCibles = (t) => String(t).replace(/\]\([^)\n]*\)/g, ']()');
const L = '\\p{L}\\p{N}_';
const echapper = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const SIGLE = /^[\p{Lu}\d]{2,4}$/u;

// ── Mots du métier (R2.4.3) ───────────────────────────────────────────────────────────────────────────────────
// MOTS_HORS_LEXIQUE de scripts/check-invariant-vocab.js (copiée : ce script lance l'oracle quand on le charge), plus la
// liste propre au manuel.
const MOTS_HORS_LEXIQUE = ['restaurant', 'restaurants', 'restauration', 'plat', 'plats', 'menu', 'menus', 'chef', 'chefs', 'couverts', 'carte', 'cartes', 'métiers de bouche', 'food'];
export const MOTS_METIER_MANUEL = Object.freeze([
  ...MOTS_HORS_LEXIQUE,
  'cuisine', 'cuisines', 'pâtisserie', 'pâtisseries', 'pâtissier', 'pâtissiers', 'pâtissière', 'pâtissières',
  'boulangerie', 'boulangeries', 'traiteur', 'traiteurs', 'boutique', 'boutiques', 'kiosque', 'kiosques', 'farine',
  'beurre', 'sucre', 'crème', 'crèmes', 'œuf', 'œufs', 'lait', 'sauce', 'sauces', 'pâte', 'pâtes', 'tarte', 'tartes',
  'dessert', 'desserts', 'boisson', 'boissons', 'viande', 'viandes', 'volaille', 'volailles', 'entremets',
  'viennoiserie', 'viennoiseries', 'pizza', 'pizzas', 'économat', 'économats',
]);
const RE_METIER = new RegExp(`(?<![${L}])(?:${[...MOTS_METIER_MANUEL].sort((a, b) => b.length - a.length).map(echapper).join('|')})(?![${L}])`, 'giu');

/** Mots du métier d'un texte (balises masquées, formes du lexique par défaut masquées) → { total, mots: { mot: n } }. */
export function motsMetier(texte) {
  let t = masquerCibles(masquerBalises(texte || ''));
  for (const f of [...formesParDefaut(t)].reverse()) t = t.slice(0, f.index) + ' '.repeat(f.texte.length) + t.slice(f.index + f.texte.length);
  const mots = {};
  let total = 0;
  for (const m of t.matchAll(RE_METIER)) {
    const k = m[0].toLowerCase();
    mots[k] = (mots[k] || 0) + 1;
    total += 1;
  }
  return { total, mots };
}

// ── Petits outils de texte ────────────────────────────────────────────────────────────────────────────────────
const contexte = (t, index, longueurMot = 0) => {
  const d = t.lastIndexOf('\n', index - 1) + 1;
  const f0 = t.indexOf('\n', index + longueurMot);
  const ligne = t.slice(d, f0 < 0 ? t.length : f0);
  if (ligne.length <= 160) return ligne;
  const a = Math.max(0, index - d - 70);
  return `${a > 0 ? '…' : ''}${ligne.slice(a, a + 160)}${a + 160 < ligne.length ? '…' : ''}`;
};
const compter = (liste) => {
  const m = new Map();
  for (const x of liste) m.set(x.cle, (m.get(x.cle) || 0) + 1);
  return m;
};
/** Occurrences du rendu d'un domaine en plus de celles du rendu par défaut (même clé), dans l'ordre du texte. */
const enPlus = (domaine, defaut) => {
  const reste = compter(defaut);
  const out = [];
  for (const x of domaine) {
    const n = reste.get(x.cle) || 0;
    if (n > 0) reste.set(x.cle, n - 1);
    else out.push(x);
  }
  return out;
};

// ── Point 7 : mots répétés ────────────────────────────────────────────────────────────────────────────────────
const MOT = `\\p{L}[\\p{L}\\p{N}'’-]*`;
const RE_REPET_1 = new RegExp(`(?<![${L}])(${MOT})[^\\S\\n]+\\1(?![${L}])`, 'giu');
const RE_REPET_2 = new RegExp(`(?<![${L}])(${MOT}[^\\S\\n]+${MOT})[^\\S\\n]+\\1(?![${L}])`, 'giu');
const repetitions = (t) => {
  const out = [];
  for (const re of [RE_REPET_2, RE_REPET_1]) {
    for (const m of t.matchAll(re)) out.push({ cle: m[0].toLowerCase().replace(/\s+/g, ' '), texte: m[0], index: m.index });
  }
  return out;
};
/** Point 7, première moitié : répétitions à la suite présentes dans `r` et pas dans le rendu par défaut `rd`. */
export function motsRepetes(r, rd) {
  return enPlus(repetitions(r), repetitions(rd)).map((x) => ({ texte: x.texte, contexte: contexte(r, x.index, x.texte.length) }));
}

const DETERMINANTS_TETE = ['de la ', "de l'", 'de l’', 'à la ', "à l'", 'à l’', 'tous les ', 'toutes les ', 'le ', 'la ', "l'", 'l’',
  'les ', 'un ', 'une ', 'des ', 'du ', 'de ', "d'", 'd’', 'au ', 'aux ', 'ce ', 'cet ', 'cette ', 'ces ', 'votre ', 'vos ', 'mon ',
  'ma ', 'mes ', 'son ', 'sa ', 'ses ', 'aucun ', 'aucune ', 'nouveau ', 'nouvel ', 'nouvelle ', 'nouveaux ', 'nouvelles '];
const coeur = (s) => {
  const t = String(s).trim();
  const bas = t.toLowerCase();
  const d = DETERMINANTS_TETE.find((x) => bas.startsWith(x));
  return d ? t.slice(d.length).trim() : t;
};
const nbMots = (s) => (String(s).match(/\p{L}+/gu) || []).length;

/** Morceaux d'un texte balisé rendu balise par balise : { texte rendu, balises: [{ debut, fin, rendu }] }. */
export function rendreParMorceaux(voc, balise) {
  const t = String(balise ?? '');
  const balises = [];
  let sortie = '';
  let curseur = 0;
  for (const m of t.matchAll(CANDIDATE)) {
    sortie += t.slice(curseur, m.index);
    const r = rendu(voc, m[0]);
    balises.push({ debut: sortie.length, fin: sortie.length + r.length, rendu: r, balise: m[0] });
    sortie += r;
    curseur = m.index + m[0].length;
  }
  sortie += t.slice(curseur);
  return { texte: sortie, balises };
}

const finDePhrase = (t, i) => {
  const m = /[.!?\n]/.exec(t.slice(i));
  return m ? i + m.index : t.length;
};
const fenetre12 = (t, debut) => {
  const fin = finDePhrase(t, debut);
  const mots = [...t.slice(debut, fin).matchAll(/\p{L}[\p{L}\p{N}'’-]*/gu)];
  return mots.length > 12 ? t.slice(debut, debut + mots[12].index) : t.slice(debut, fin);
};
const contientMot = (texte, mot) => new RegExp(`(?<![${L}])${echapper(mot)}(?![${L}])`, 'iu').test(texte);

/** Point 7, seconde moitié : rendu d'une balise de deux mots ou plus (déterminant ôté) qui revient dans la même phrase
 * à moins de 12 mots, dans le rendu de `voc` et pas dans le rendu par défaut à la même place. */
export function balisesRepetees(balise, voc) {
  const r = rendreParMorceaux(voc, balise);
  const d = rendreParMorceaux(vocabDefaut, balise);
  const out = [];
  r.balises.forEach((b, i) => {
    const c = coeur(b.rendu);
    if (nbMots(c) < 2) return;
    if (!contientMot(fenetre12(r.texte, b.fin), c)) return;
    const bd = d.balises[i];
    const cd = coeur(bd.rendu);
    // Absent du rendu par défaut : la même balise y rend-elle aussi deux mots ou plus, répétés à moins de 12 mots ?
    // (« Les labos (0 à N) : vos labos » ne compte pas : un seul mot.)
    if (nbMots(cd) >= 2 && contientMot(fenetre12(d.texte, bd.fin), cd)) return;
    out.push({ texte: c, contexte: contexte(r.texte, b.debut, b.rendu.length) });
  });
  return out;
}

/** Point 7, suite : le rendu d'une balise suivi d'un mot de même racine que son dernier mot (« cuisine centrale
 * central », de « [[votre:labo_long]] central »), dans le rendu de `voc` et pas dans le rendu par défaut à la même place.
 * Même racine : deux mots différents (sans casse) égaux une fois ôtés un « e », un « s » ou un « es » final, d'au moins
 * 4 lettres. Le mot identique (« centrale centrale ») est déjà la première moitié du point 7. */
const RACINE_FIN = /(?:es|e|s)$/u;
const racineMot = (m) => m.toLowerCase().replace(RACINE_FIN, '');
const memeRacine = (a, b) => a.toLowerCase() !== b.toLowerCase() && racineMot(a).length >= 4 && racineMot(a) === racineMot(b);
const dernierMot = (s) => (String(s).match(/\p{L}[\p{L}\p{N}'’-]*(?=[^\p{L}]*$)/u) || [''])[0];
const motSuivant = (t, i) => (/^[^\S\n]+(\p{L}[\p{L}\p{N}'’-]*)/u.exec(t.slice(i)) || [])[1] || '';
export function racinesRepetees(balise, voc) {
  const r = rendreParMorceaux(voc, balise);
  const d = rendreParMorceaux(vocabDefaut, balise);
  const out = [];
  r.balises.forEach((b, i) => {
    const a = dernierMot(b.rendu);
    const s = motSuivant(r.texte, b.fin);
    if (!a || !s || !memeRacine(a, s)) return;
    const bd = d.balises[i];
    const ad = dernierMot(bd.rendu);
    const sd = motSuivant(d.texte, bd.fin);
    if (ad && sd && memeRacine(ad, sd)) return;
    out.push({ texte: `${a} ${s}`, contexte: contexte(r.texte, b.debut, b.rendu.length) });
  });
  return out;
}

// ── Point 8 : gloses identiques, définitions circulaires ──────────────────────────────────────────────────────
const gloses = (t) => {
  const out = [];
  for (const m of t.matchAll(/\(([^()\n]{1,80})\)/g)) {
    const inner = m[1].trim();
    if (!/\p{L}/u.test(inner)) continue;
    const avant = t.slice(0, m.index).replace(/[^\S\n]+$/, '');
    if (avant.length < inner.length || avant.slice(-inner.length).toLowerCase() !== inner.toLowerCase()) continue;
    const prec = avant[avant.length - inner.length - 1];
    if (prec && new RegExp(`[${L}]`, 'u').test(prec)) continue;
    const texte = `${avant.slice(-inner.length)} (${inner})`;
    out.push({ cle: texte.toLowerCase(), texte, index: avant.length - inner.length });
  }
  return out;
};
export function glosesIdentiques(r, rd) {
  return enPlus(gloses(r), gloses(rd)).map((x) => ({ texte: x.texte, contexte: contexte(r, x.index, x.texte.length) }));
}
const premierMot = (s) => ((String(s).replace(/^[\s*_«"“(]+/u, '').match(/^\p{L}[\p{L}\p{N}'’-]*/u) || [''])[0]).toLowerCase().replace(/[sx]$/, '');
const circulaires = (t) => {
  const out = [];
  t.split('\n').forEach((ligne, n) => {
    const m = /^\s*\|\s*\*\*(.+?)\*\*\s*\|\s*(.*)$/.exec(ligne);
    if (!m) return;
    const terme = m[1].trim();
    const pt = premierMot(terme);
    if (pt && pt === premierMot(m[2])) out.push({ ligne: n, texte: `| **${terme}** | ${(m[2].match(/^[^\s|]+(?:\s+[^\s|]+)?/) || [''])[0]}` });
  });
  return out;
};
export function definitionsCirculaires(r, rd) {
  const parDefaut = new Set(circulaires(rd).map((x) => x.ligne));
  const lignes = r.split('\n');
  return circulaires(r).filter((x) => !parDefaut.has(x.ligne)).map((x) => ({ texte: x.texte, contexte: lignes[x.ligne].slice(0, 160) }));
}

// ── Point 9 : élisions fautives ───────────────────────────────────────────────────────────────────────────────
const RE_ELISION_CONSONNE = new RegExp(`(?<![${L}])(?:d|l|qu)['’][bcdfgjklmnpqrstvwxzç][\\p{L}'’-]*`, 'giu');
const RE_SANS_ELISION = new RegExp(`(?<![${L}'’])(?:de|le|la|que|du|au|ce|ma|ta|sa)[^\\S\\n]+[aeiouàâäéèêëîïôöùûüœæh][\\p{L}'’-]*`, 'giu');
const elisions = (t) => {
  const out = [];
  for (const re of [RE_ELISION_CONSONNE, RE_SANS_ELISION]) {
    for (const m of t.matchAll(re)) out.push({ cle: m[0].toLowerCase().replace(/\s+/g, ' '), texte: m[0], index: m.index });
  }
  return out.sort((a, b) => a.index - b.index);
};
export function elisionsFautives(r, rd) {
  return enPlus(elisions(r), elisions(rd)).map((x) => ({ texte: x.texte, contexte: contexte(r, x.index, x.texte.length) }));
}

// ── Point 10 : déterminant en clair devant une balise de nom (texte balisé) ──────────────────────────────────
const ACCORDABLES = ['de la', "de l'", 'de l’', 'à la', "à l'", 'à l’', 'le', 'la', "l'", 'l’', 'un', 'une', 'du', 'de', "d'", 'd’', 'au',
  'ce', 'cet', 'cette', 'mon', 'ma', 'son', 'sa', 'aucun', 'aucune', 'quels', 'quelles', 'quel', 'quelle', 'nouveau', 'nouvel',
  'nouvelle', 'première', 'premier', 'seule', 'seul', 'toutes', 'tous', 'toute', 'tout'];
const METHODES_NOM = new Set(['nom', 'Nom', 'court', 'Court', 'Titre', 'MAJ']);
const RE_DET_CLAIR = new RegExp(
  `(?<![${L}'’])(${ACCORDABLES.sort((a, b) => b.length - a.length).map(echapper).join('|')})((?<=['’])|[^\\S\\n]+)(\\*\\*|\\*|\\[)?(\\[\\[([A-Za-z]+):[^[\\]\\n]*\\]\\])`,
  'giu');
// À distance : déterminant à genre + un adjectif + balise de nom (« un autre [[nom:labo]] » rend en H « un autre cuisine
// centrale »). L'adjectif lui-même peut être épicène (autre, même, propre) : c'est le déterminant qui s'accorde. On ne
// prend que les déterminants qui changent avec le genre devant un adjectif (pas « l' », « de », « les »).
const GENRES_DISTANCE = ['de la', 'à la', 'le', 'la', 'un', 'une', 'du', 'au', 'ce', 'cet', 'cette', 'mon', 'ma', 'ton', 'ta', 'son',
  'sa', 'aucun', 'aucune', 'quel', 'quelle', 'tout', 'toute'];
const ADJECTIFS_DISTANCE = ['autre', 'même', 'seul', 'seule', 'propre', 'premier', 'première', 'dernier', 'dernière', 'nouveau',
  'nouvel', 'nouvelle', 'second', 'seconde', 'deuxième', 'troisième', 'unique', 'principal', 'principale'];
const RE_DET_DISTANCE = new RegExp(
  `(?<![${L}'’])(${GENRES_DISTANCE.sort((a, b) => b.length - a.length).map(echapper).join('|')})[^\\S\\n]+(${ADJECTIFS_DISTANCE.map(echapper).join('|')})[^\\S\\n]+(\\*\\*|\\*|\\[)?(\\[\\[([A-Za-z]+):[^[\\]\\n]*\\]\\])`,
  'giu');
export function determinantsEnClair(balise) {
  const t = String(balise ?? '');
  const out = [];
  for (const m of t.matchAll(RE_DET_CLAIR)) {
    if (!METHODES_NOM.has(m[5])) continue;
    out.push({ index: m.index, texte: m[0], contexte: contexte(t, m.index, m[0].length) });
  }
  for (const m of t.matchAll(RE_DET_DISTANCE)) {
    if (!METHODES_NOM.has(m[5])) continue;
    if (out.some((x) => x.index < m.index + m[0].length && m.index < x.index + x.texte.length)) continue; // déjà vu collé
    out.push({ index: m.index, texte: m[0], contexte: contexte(t, m.index, m[0].length) });
  }
  return out.sort((a, b) => a.index - b.index).map(({ texte, contexte: c }) => ({ texte, contexte: c }));
}

// ── Point 11 : appositions ────────────────────────────────────────────────────────────────────────────────────
const CLES_APPO = new Set(Object.entries(LEXIQUE_DEFAUT).filter(([, e]) => e && e.appo).map(([k]) => k));
const RE_DEUX_BALISES = /(\[\[([A-Za-z]+):[^[\]\n]*\]\])[^\S\n](\[\[(nom|Nom):([a-z0-9_]+)(?::[^[\]\n]*)?\]\])/g;
const PREMIERE_EXCLUE = new Set(['acc', 'accN', 'ex', 'det', 'Det']);
export function appositions(balise) {
  const t = String(balise ?? '');
  const out = [];
  RE_DEUX_BALISES.lastIndex = 0;
  let m;
  while ((m = RE_DEUX_BALISES.exec(t)) !== null) {
    if (!PREMIERE_EXCLUE.has(m[2]) && CLES_APPO.has(m[5])) out.push({ texte: `${m[1]} ${m[3]}`, contexte: contexte(t, m.index, m[0].length) });
    RE_DEUX_BALISES.lastIndex = m.index + m[1].length + 1; // la seconde balise peut ouvrir une autre paire
  }
  return out;
}

// ── Point 12 : collisions de sens ─────────────────────────────────────────────────────────────────────────────
const formesEntree = (e) => (e && typeof e === 'object'
  ? [['sg', e.sg], ['pl', e.pl], ['csg', e.court && e.court.sg], ['cpl', e.court && e.court.pl]] : []);
/** Formes du lexique RÉSOLU d'un domaine qui diffèrent du défaut (même clé, même place) : Map forme → { cle, mot }
 * (« mot » = forme au singulier en minuscules, pour une ligne par mot et par fiche). */
export function formesDuDomaine(lexique) {
  const m = new Map();
  for (const [k, e] of Object.entries(lexique || {})) {
    const d = Object.fromEntries(formesEntree(LEXIQUE_DEFAUT[k]).map(([p, f]) => [p, String(f || '').toLowerCase()]));
    const f = Object.fromEntries(formesEntree(e));
    for (const [p, forme] of Object.entries(f)) {
      if (!forme || !String(forme).trim() || String(forme).toLowerCase() === d[p]) continue;
      if ((p === 'csg' || p === 'cpl') && !(e.court && e.court.sg)) continue;
      const mot = String(p === 'pl' ? f.sg || forme : p === 'cpl' ? f.csg || forme : forme).toLowerCase();
      if (!m.has(forme)) m.set(forme, { cle: k, mot });
    }
  }
  return m;
}
const motifFormes = (formes) => {
  const liste = [...formes].sort((a, b) => b.length - a.length);
  const mots = liste.filter((f) => !SIGLE.test(f));
  const sigles = liste.filter((f) => SIGLE.test(f));
  return {
    mots: mots.length ? new RegExp(`(?<![${L}])(?:${mots.map(echapper).join('|')})(?![${L}])`, 'giu') : null,
    sigles: sigles.length ? new RegExp(`(?<![${L}])(?:${sigles.map(echapper).join('|')})(?![${L}])`, 'gu') : null,
  };
};
/** Formes d'un domaine trouvées EN CLAIR dans un texte balisé (balises et cibles de liens masquées), les plus longues
 * d'abord, sans chevauchement → [{ forme, cle, mot, index }]. */
export function formesEnClair(balise, formes) {
  const t = masquerCibles(masquerBalises(balise || ''));
  const re = motifFormes(formes.keys());
  const bas = new Map([...formes.entries()].map(([f, v]) => [f.toLowerCase(), { forme: f, ...v }]));
  const trouvees = [];
  for (const [r, sigle] of [[re.mots, false], [re.sigles, true]]) {
    if (!r) continue;
    for (const m of t.matchAll(r)) {
      const info = sigle ? { forme: m[0], ...formes.get(m[0]) } : bas.get(m[0].toLowerCase());
      if (info) trouvees.push({ ...info, texte: m[0], index: m.index });
    }
  }
  trouvees.sort((a, b) => a.index - b.index || b.texte.length - a.texte.length);
  const out = [];
  let fin = -1;
  for (const x of trouvees) {
    if (x.index < fin) continue;
    out.push(x);
    fin = x.index + x.texte.length;
  }
  return out;
}

// ── Domaines (lexiques résolus, R3.1.1) ───────────────────────────────────────────────────────────────────────
export const LECTURE_DEFAUT = path.join(C.DOSSIER, 'lecture-production.json');

/** Comparaison du md5 d'un lexique --lexique à la lecture (7) de production (hotellerie.md5Lexique) : texte affiché, ou
 * refus (Error) si les deux diffèrent. */
function comparerLecture(f, lecture) {
  if (f.md5Fichier && f.md5Fichier !== f.md5) throw new Error(`md5Lexique du fichier (${f.md5Fichier}) ≠ md5 de ses écarts (${f.md5}) : fichier retouché ou mal tiré`);
  const rel = lecture ? (path.relative(C.RACINE, lecture) || lecture) : '-';
  if (!lecture || !fs.existsSync(lecture)) return `lecture de production absente (${rel}) : md5 non comparé`;
  let j;
  try { j = C.lireJsonExterne(lecture); } catch (err) { throw new Error(`lecture de production illisible (${rel}) : ${err.message}`); }
  const h = j && j.hotellerie;
  if (!h || typeof h.md5Lexique !== 'string') return `lecture de production sans hotellerie.md5Lexique (${rel}) : md5 non comparé`;
  if (h.md5Lexique !== f.md5) throw new Error(`md5 du lexique lu ${f.md5} ≠ lecture (7) ${h.md5Lexique} (${rel}) : ce fichier n'est pas le lexique Hôtellerie de production`);
  return `égal à la lecture (7) (${rel})`;
}

function domainesEssai(lexiqueH = null, lecture = LECTURE_DEFAUT) {
  const ecarts = V.lexiquesEssai();
  const out = {};
  for (const d of DOMAINES_RENDUS) {
    let e = ecarts[d];
    let source = 'test/vocab-lexiques-test.json';
    let fichier = null;
    if (d === 'hotellerie' && lexiqueH) {
      const f = V.ecartsDuFichier(lexiqueH);
      e = f.ecarts;
      source = path.resolve(lexiqueH);
      fichier = { md5: f.md5, cles: Object.keys(f.ecarts).length, avertissements: f.avertissements, lecture: comparerLecture(f, lecture ? path.resolve(lecture) : null) };
    }
    const lexique = V.resoudre(e);
    out[d] = { voc: V.vocabDesEcarts(e), lexique, source, fichier };
  }
  for (const d of DOMAINES_COLLISIONS) out[d].formes = formesDuDomaine(out[d].lexique);
  return out;
}

// ── Contexte d'un passage ─────────────────────────────────────────────────────────────────────────────────────
/** Charge l'origine, parties.json, lots.json et les vocabulaires. `racine` = racine des fichiers de travail. */
export function creerContexte({ racine = C.DOSSIER, lexique = null, lecture = LECTURE_DEFAUT } = {}) {
  const problemes = V.verifierLexiques();
  if (problemes.length) {
    const e = new Error(`lexiques incohérents (spec §3.1) : ${problemes.join(' ; ')}`);
    e.code = 2;
    throw e;
  }
  const { fiches, entrees } = C.lireOrigine();
  return {
    racine: path.resolve(racine),
    ch: C.chemins(path.resolve(racine)),
    fiches: new Map(fiches.map((f) => [f.slug, f])),
    entrees: new Map(entrees.map((e) => [e.fichier, e])),
    parties: C.lireParties(),
    lots: C.lireLots(),
    domaines: domainesEssai(lexique, lecture),
    relectures: new Map(),
  };
}

const lotVariante = (ctx, domaine, slug) => Object.entries(ctx.lots.lots || {})
  .find(([, l]) => l.domaine === domaine && Array.isArray(l.variantes) && l.variantes.includes(slug))?.[0] || null;

/** Acceptations de relectures/<lot>.auto.json (lues une fois par lot). */
function acceptations(ctx, lot) {
  if (!lot) return [];
  if (ctx.relectures.has(lot)) return ctx.relectures.get(lot);
  const f = path.join(ctx.ch.relectures, `${lot}.auto.json`);
  let liste = [];
  if (fs.existsSync(f)) {
    const j = C.lireJson(f);
    if (!Array.isArray(j)) throw new Error(`relectures/${lot}.auto.json : tableau attendu`);
    liste = j.map((x, i) => ({ ...x, rang: i, employee: false }));
  }
  ctx.relectures.set(lot, liste);
  return liste;
}

/** Regroupe les signalements bruts (une ligne par fiche, point, domaine, texte) et applique les acceptations. */
function regrouper(ctx, lot, nom, bruts) {
  const groupes = new Map();
  for (const s of bruts) {
    const k = `${s.point}\u0000${s.domaine || ''}\u0000${s.texte}`;
    if (!groupes.has(k)) groupes.set(k, { point: s.point, domaine: s.domaine || null, texte: s.texte, occurrences: 0, contexte: s.contexte });
    groupes.get(k).occurrences += 1;
  }
  const acc = acceptations(ctx, lot);
  return [...groupes.values()].map((g) => {
    const a = acc.find((x) => x && x.fiche === nom && Number(x.point) === g.point && x.texte === g.texte
      && (!x.domaine || x.domaine === '*' || x.domaine === g.domaine));
    if (a && a.decision === 'accepté' && typeof a.raison === 'string' && a.raison.trim()) {
      a.employee = true;
      return { ...g, etat: 'accepté', raison: a.raison };
    }
    return { ...g, etat: 'à traiter' };
  });
}

// ── Contrôles communs à une fiche, une entrée, une variante ──────────────────────────────────────────────────
function lireBalise(dossier, nom) {
  const md = path.join(dossier, `${nom}.md`);
  const json = path.join(dossier, `${nom}.json`);
  if (!fs.existsSync(md) || !fs.existsSync(json)) return { absent: true };
  return { md: C.lireTexte(md), json: C.lireJson(json) };
}

function verifierExclusions(exclusions, echecs) {
  if (!Array.isArray(exclusions)) { echecs.push({ point: 3, message: '« exclusions » doit être un tableau' }); return []; }
  exclusions.forEach((x, i) => {
    const n = `exclusion ${i + 1}${x && x.extrait ? ` « ${x.extrait} »` : ''}`;
    if (!x || typeof x !== 'object') { echecs.push({ point: 3, message: `${n} : objet attendu` }); return; }
    if (typeof x.extrait !== 'string' || !x.extrait) echecs.push({ point: 3, message: `${n} : extrait absent` });
    else if (/\[\[|\]\]/.test(x.extrait)) echecs.push({ point: 3, message: `${n} : un extrait ne contient jamais de balise` });
    else {
      const f = formesParDefaut(x.extrait);
      if (!f.length) echecs.push({ point: 3, message: `${n} : sans emploi (l'extrait ne contient aucune forme par défaut)` });
      else if (x.forme !== undefined && !f.some((o) => o.texte.toLowerCase() === String(x.forme).toLowerCase())) {
        echecs.push({ point: 3, message: `${n} : « forme » ${JSON.stringify(x.forme)} absente de l'extrait (formes : ${f.map((o) => o.texte).join(', ')})` });
      }
    }
    if (!TYPES_EXCLUSION.includes(x.type)) echecs.push({ point: 3, message: `${n} : type « ${x.type} » hors liste (${TYPES_EXCLUSION.join(', ')})` });
    if (!Number.isInteger(x.occurrences) || x.occurrences < 1) echecs.push({ point: 3, message: `${n} : « occurrences » entier ≥ 1 attendu` });
    if (typeof x.justification !== 'string' || !x.justification.trim()) echecs.push({ point: 3, message: `${n} : justification absente` });
  });
  return exclusions.filter((x) => x && typeof x.extrait === 'string' && x.extrait);
}

// Balise collée à un trait d'union (R3.4.3, relecture de M0 ∥ S ∥ A) : « sous-[[nom:pt]] » rend « sous-préparation »
// en H, « sous-[[nom:produit]] » rend « sous-invention » en miroir, alors que les points 1, 2 et 3 passent. Le motif de
// termesDans prend « - » pour une limite de mot ; on ne balise donc jamais une forme collée à un tiret (locution,
// exclusion ou phrase réécrite). Seules les balises d'accord et d'exemple y sont admises : « peut-[[acc:labo:il:elle]] »,
// « [[acc:labo:lui:elle]]-même ».
const METHODES_TIRET_ADMISES = new Set(['acc', 'accN', 'ex']);
export function balisesCollees(balise) {
  const t = String(balise ?? '');
  const out = [];
  for (const m of t.matchAll(CANDIDATE)) {
    const methode = (/^([A-Za-z]+):/.exec(m[1]) || [])[1];
    if (!methode || METHODES_TIRET_ADMISES.has(methode)) continue;
    const fin = m.index + m[0].length;
    const avant = (/(\p{L}+-)$/u.exec(t.slice(Math.max(0, m.index - 30), m.index)) || [])[1];
    const apres = (/^(-\p{L}+)/u.exec(t.slice(fin, fin + 30)) || [])[1];
    if (avant || apres) out.push({ texte: `${avant || ''}${m[0]}${apres || ''}`, contexte: contexte(t, m.index, m[0].length) });
  }
  return out;
}

/** Point 3 : formes par défaut hors balises (extraits retirés, cibles masquées), emplois des exclusions, balises collées
 * à un trait d'union. */
function pointResiduels(textes, exclusions, echecs, champs) {
  textes.forEach((t, i) => {
    for (const x of balisesCollees(t)) {
      echecs.push({ point: 3, message: `${champs[i]} : balise collée à un trait d'union « ${x.texte} » (R3.4.3 : jamais de balise contre un tiret ; locution, exclusion ou phrase réécrite) — ${x.contexte}` });
    }
  });
  const excl = verifierExclusions(exclusions, echecs);
  const { textes: restes, emplois } = C.retirerExtraits(textes, excl);
  restes.forEach((t, i) => {
    for (const f of formesParDefaut(masquerCibles(t))) {
      echecs.push({ point: 3, message: `${champs[i]} : forme « ${f.texte} » hors balise et hors extrait exclu — ${contexte(t, f.index, f.texte.length)}` });
    }
  });
  excl.forEach((x, i) => {
    if (emplois[i] === 0) echecs.push({ point: 3, message: `exclusion « ${x.extrait} » sans emploi` });
    else if (Number.isInteger(x.occurrences) && emplois[i] !== x.occurrences) {
      echecs.push({ point: 3, message: `exclusion « ${x.extrait} » : ${emplois[i]} emploi(s), ${x.occurrences} déclaré(s)` });
    }
  });
  return { excl, emplois };
}

/** Point 3, suite : chaque extrait se retrouve tel quel dans chaque rendu (autant de fois qu'au texte balisé). */
function extraitsDansRendus(excl, emplois, rendusParDomaine, echecs) {
  for (const [d, textes] of Object.entries(rendusParDomaine)) {
    const r = C.retirerExtraits(textes, excl).emplois;
    excl.forEach((x, i) => {
      if (emplois[i] > 0 && r[i] < emplois[i]) echecs.push({ point: 3, message: `exclusion « ${x.extrait} » : ${r[i]} fois dans le rendu ${d} (attendu ${emplois[i]}) : l'extrait doit se retrouver tel quel dans tous les rendus` });
    });
  }
}

const cibles = (t) => [...String(t || '').matchAll(CIBLE_LIEN)].map((m) => m[1]);
/** Point 4 : cibles de liens (suite identique à la référence), slugs existants, libellés non vides. */
function pointLiens(ctx, reference, rendus, echecs) {
  const attendues = cibles(reference);
  for (const c of attendues) if (c.startsWith('#') && !ctx.fiches.has(c.slice(1))) echecs.push({ point: 4, message: `cible « ${c} » : aucun slug de ce nom` });
  for (const [d, t] of Object.entries(rendus)) {
    const lues = cibles(t);
    if (JSON.stringify(lues) !== JSON.stringify(attendues)) {
      const i = lues.findIndex((c, k) => c !== attendues[k]);
      echecs.push({ point: 4, message: `rendu ${d} : suite des cibles différente (${lues.length} contre ${attendues.length} ; 1re différence : ${JSON.stringify(lues[i < 0 ? attendues.length : i])} au lieu de ${JSON.stringify(attendues[i < 0 ? lues.length : i])})` });
    }
    const v = LIBELLE_VIDE.exec(t);
    if (v) echecs.push({ point: 4, message: `rendu ${d} : libellé de lien vide — ${contexte(t, v.index, 3)}` });
  }
}

const motsClesBlocs = (t) => [...String(t || '').matchAll(/^:::(\S*)/gm)].map((m) => m[1]);
const nbBarres = (l) => (l.match(/\|/g) || []).length;
/** Point 5 : mots-clés des blocs, nombre de lignes, « | » par ligne de tableau (référence ligne à ligne). */
function pointBlocs(referenceBlocs, referenceLignes, balise, rendus, echecs) {
  const attendus = motsClesBlocs(referenceBlocs);
  const comparer = (nom, t) => {
    const lus = motsClesBlocs(t);
    if (JSON.stringify(lus) !== JSON.stringify(attendus)) echecs.push({ point: 5, message: `${nom} : suite des blocs « ::: » différente (${JSON.stringify(lus.slice(0, 8))}… contre ${JSON.stringify(attendus.slice(0, 8))}…)` });
  };
  comparer('texte balisé', balise);
  const ref = String(referenceLignes || '').split('\n');
  for (const [d, t] of Object.entries(rendus)) {
    comparer(`rendu ${d}`, t);
    const lignes = String(t || '').split('\n');
    if (lignes.length !== ref.length) { echecs.push({ point: 5, message: `rendu ${d} : ${lignes.length} lignes au lieu de ${ref.length}` }); continue; }
    ref.forEach((l, i) => {
      if (/^\s*\|/.test(l) && nbBarres(lignes[i]) !== nbBarres(l)) echecs.push({ point: 5, message: `rendu ${d}, ligne ${i + 1} : ${nbBarres(lignes[i])} « | » au lieu de ${nbBarres(l)}` });
    });
  }
}

/** Point 6 : aucun rendu ne contient « [[ », « ]] » ni « ‹clé› ». */
function pointRendusPropres(rendusParChamp, echecs) {
  for (const [d, champs] of Object.entries(rendusParChamp)) {
    for (const [champ, t] of Object.entries(champs)) {
      const m = typeof t === 'string' ? BALISE_BRUTE.exec(t) : null;
      if (m) echecs.push({ point: 6, message: `rendu ${d} › ${champ} : « ${m[0]} » — ${contexte(t, m.index, m[0].length)}` });
    }
  }
}

/** Signalements 7 à 11 d'un champ balisé, dans les domaines donnés. */
function signalements7a11(champ, balise, domaines) {
  const out = [];
  const rd = rendu(vocabDefaut, balise);
  for (const [d, dom] of Object.entries(domaines)) {
    const r = rendu(dom.voc, balise);
    for (const s of motsRepetes(r, rd)) out.push({ point: 7, domaine: d, champ, ...s });
    for (const s of balisesRepetees(balise, dom.voc)) out.push({ point: 7, domaine: d, champ, ...s });
    for (const s of racinesRepetees(balise, dom.voc)) out.push({ point: 7, domaine: d, champ, ...s });
    for (const s of glosesIdentiques(r, rd)) out.push({ point: 8, domaine: d, champ, ...s });
    for (const s of definitionsCirculaires(r, rd)) out.push({ point: 8, domaine: d, champ, ...s });
    for (const s of elisionsFautives(r, rd)) out.push({ point: 9, domaine: d, champ, ...s });
  }
  for (const s of determinantsEnClair(balise)) out.push({ point: 10, domaine: null, champ, ...s });
  for (const s of appositions(balise)) out.push({ point: 11, domaine: null, champ, ...s });
  return out;
}

function ecrireRendu(ctx, lot, domaine, nom, entete, contenu) {
  const lignes = ['---', ...Object.entries(entete).map(([k, v]) => `${k}: ${v === null || v === undefined ? '' : String(v).replace(/\n/g, ' ')}`), '---', ''];
  C.ecrireTexte(path.join(ctx.ch.rendus, lot || 'sans-lot', domaine, `${nom}.md`), `${lignes.join('\n')}${contenu ?? ''}`);
}

const nbBalises = (t) => (String(t || '').match(CANDIDATE) || []).length;

// ── Une fiche du manuel ───────────────────────────────────────────────────────────────────────────────────────
export function controlerFiche(ctx, slug, { ecrire = true } = {}) {
  const o = ctx.fiches.get(slug);
  const lot = C.lotDe(slug, {}, ctx.lots);
  const res = { type: 'fiche', nom: slug, lot, passe: false, echecs: [], signalements: [], infos: {} };
  if (!o) { res.echecs.push({ point: 0, message: `fiche « ${slug} » absente de origine/manuel/` }); return res; }
  const b = lireBalise(ctx.ch.baliseManuel, slug);
  if (b.absent) { res.echecs.push({ point: 0, message: `balise/manuel/${slug}.md ou .json absent` }); return res; }
  const { md, json } = b;
  const e = res.echecs;
  if (!json || typeof json !== 'object' || json.slug !== slug) e.push({ point: 0, message: `balise/manuel/${slug}.json : « slug » ≠ ${slug}` });
  if (typeof json.titre !== 'string') { e.push({ point: 0, message: `balise/manuel/${slug}.json : « titre » absent` }); return res; }
  let partie;
  try { partie = C.partieBalisee(o.partie, ctx.parties); } catch (err) { e.push({ point: 0, message: err.message }); return res; }
  const champs = { contenu: md, titre: json.titre, partie };

  // 1. Identité (I10).
  const d = { contenu: rendu(vocabDefaut, md), titre: rendu(vocabDefaut, json.titre), partie: rendu(vocabDefaut, partie) };
  if (!memesOctets(d.contenu, o.contenu)) e.push({ point: 1, message: `contenu : rendu par défaut ≠ origine${premiereDifference(d.contenu, o.contenu)}` });
  if (C.md5(d.contenu) !== o.md5Garde) e.push({ point: 1, message: `contenu_defaut : md5 du rendu par défaut ≠ md5Garde de l'origine${o.defautNull ? ' (défaut NULL : l\'origine est le contenu)' : ''}` });
  if (!memesOctets(d.titre, o.titre)) e.push({ point: 1, message: `titre : rendu par défaut « ${d.titre} » ≠ origine « ${o.titre} »` });
  if (!memesOctets(d.partie, o.partie)) e.push({ point: 1, message: `partie : rendu par défaut « ${d.partie} » ≠ origine « ${o.partie} »` });
  // 2. Balises valides (I11).
  for (const [champ, t] of Object.entries(champs)) {
    for (const f of verifierBalises(t)) e.push({ point: 2, message: `${champ} : ${f.balise} (${f.raison})` });
  }
  // Rendus.
  const rendus = Object.fromEntries(DOMAINES_RENDUS.map((dm) => [dm, {
    contenu: rendu(ctx.domaines[dm].voc, md), titre: rendu(ctx.domaines[dm].voc, json.titre), partie: rendu(ctx.domaines[dm].voc, partie),
  }]));
  // 3. Résiduels et exclusions.
  const { excl, emplois } = pointResiduels([md, json.titre], json.exclusions, e, ['contenu', 'titre']);
  if (formesParDefaut(partie).length) e.push({ point: 3, message: `partie « ${partie} » : forme par défaut hors balise (parties.json)` });
  extraitsDansRendus(excl, emplois, { defaut: [d.contenu, d.titre], ...Object.fromEntries(DOMAINES_RENDUS.map((dm) => [dm, [rendus[dm].contenu, rendus[dm].titre]])) }, e);
  // 4. Liens ; 5. blocs et tableaux.
  const contenus = { defaut: d.contenu, ...Object.fromEntries(DOMAINES_RENDUS.map((dm) => [dm, rendus[dm].contenu])) };
  pointLiens(ctx, o.contenu, contenus, e);
  pointBlocs(o.contenu, o.contenu, md, contenus, e);
  // 6. Rendus écrits, propres.
  pointRendusPropres({ defaut: d, ...rendus }, e);
  if (ecrire) {
    for (const dm of DOMAINES_RENDUS) {
      ecrireRendu(ctx, lot, dm, slug, { fiche: slug, domaine: dm, lexique: ctx.domaines[dm].source, titre: rendus[dm].titre, partie: rendus[dm].partie }, rendus[dm].contenu);
    }
  }
  // 7 à 12. Signalements.
  const bruts = [
    ...signalements7a11('contenu', md, ctx.domaines),
    ...signalements7a11('titre', json.titre, ctx.domaines),
  ];
  for (const dm of DOMAINES_COLLISIONS) {
    for (const [champ, t] of [['contenu', md], ['titre', json.titre]]) {
      for (const x of formesEnClair(t, ctx.domaines[dm].formes)) bruts.push({ point: 12, domaine: dm, champ, texte: x.mot, contexte: contexte(t, x.index, x.texte.length) });
    }
  }
  res.signalements = regrouper(ctx, lot, slug, bruts);
  res.infos = {
    balises: nbBalises(md) + nbBalises(json.titre),
    exclusions: excl.length,
    defautNull: Boolean(o.defautNull),
    champsSansBaliseAvecForme: ['contenu', 'titre'].filter((c) => !/\[\[/.test(champs[c]) && formesParDefaut(champs[c]).length),
  };
  res.passe = e.length === 0;
  return res;
}

function premiereDifference(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return '';
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  return ` (1re différence au caractère ${i} : ${JSON.stringify(a.slice(Math.max(0, i - 20), i + 20))} contre ${JSON.stringify(b.slice(Math.max(0, i - 20), i + 20))})`;
}

// ── Une entrée de la base de connaissances ────────────────────────────────────────────────────────────────────
export function controlerEntree(ctx, fichier, { ecrire = true } = {}) {
  const o = ctx.entrees.get(fichier);
  const lot = C.lotDe(fichier, { base: true }, ctx.lots);
  const res = { type: 'base', nom: fichier, lot, passe: false, echecs: [], signalements: [], infos: {} };
  if (!o) { res.echecs.push({ point: 0, message: `entrée « ${fichier} » absente de origine/base/` }); return res; }
  const b = lireBalise(ctx.ch.baliseBase, fichier);
  if (b.absent) { res.echecs.push({ point: 0, message: `balise/base/${fichier}.md ou .json absent` }); return res; }
  const { md, json } = b;
  const e = res.echecs;
  if (!json || json.cle !== o.cle) e.push({ point: 0, message: `balise/base/${fichier}.json : « cle » ≠ ${JSON.stringify(o.cle)}` });
  if (typeof json.titre !== 'string') { e.push({ point: 0, message: `balise/base/${fichier}.json : « titre » absent` }); return res; }
  const d = { contenu: rendu(vocabDefaut, md), titre: rendu(vocabDefaut, json.titre) };
  if (!memesOctets(d.contenu, o.contenu)) e.push({ point: 1, message: `contenu : rendu par défaut ≠ origine${premiereDifference(d.contenu, o.contenu)}` });
  if (!memesOctets(d.titre, o.titre)) e.push({ point: 1, message: `titre : rendu par défaut « ${d.titre} » ≠ origine « ${o.titre} »` });
  for (const [champ, t] of [['contenu', md], ['titre', json.titre]]) {
    for (const f of verifierBalises(t)) e.push({ point: 2, message: `${champ} : ${f.balise} (${f.raison})` });
  }
  const rendus = Object.fromEntries(DOMAINES_RENDUS.map((dm) => [dm, { contenu: rendu(ctx.domaines[dm].voc, md), titre: rendu(ctx.domaines[dm].voc, json.titre) }]));
  const { excl, emplois } = pointResiduels([md, json.titre], json.exclusions, e, ['contenu', 'titre']);
  extraitsDansRendus(excl, emplois, { defaut: [d.contenu, d.titre], ...Object.fromEntries(DOMAINES_RENDUS.map((dm) => [dm, [rendus[dm].contenu, rendus[dm].titre]])) }, e);
  const contenus = { defaut: d.contenu, ...Object.fromEntries(DOMAINES_RENDUS.map((dm) => [dm, rendus[dm].contenu])) };
  pointLiens(ctx, o.contenu, contenus, e);
  pointBlocs(o.contenu, o.contenu, md, contenus, e);
  pointRendusPropres({ defaut: d, ...rendus }, e);
  if (ecrire) {
    for (const dm of DOMAINES_RENDUS) ecrireRendu(ctx, lot, dm, fichier, { entree: o.cle, domaine: dm, lexique: ctx.domaines[dm].source, titre: rendus[dm].titre }, rendus[dm].contenu);
  }
  const bruts = [...signalements7a11('contenu', md, ctx.domaines), ...signalements7a11('titre', json.titre, ctx.domaines)];
  for (const dm of DOMAINES_COLLISIONS) {
    for (const [champ, t] of [['contenu', md], ['titre', json.titre]]) {
      for (const x of formesEnClair(t, ctx.domaines[dm].formes)) bruts.push({ point: 12, domaine: dm, champ, texte: x.mot, contexte: contexte(t, x.index, x.texte.length) });
    }
  }
  res.signalements = regrouper(ctx, lot, fichier, bruts);
  res.infos = { balises: nbBalises(md) + nbBalises(json.titre), exclusions: excl.length,
    champsSansBaliseAvecForme: [['contenu', md], ['titre', json.titre]].filter(([, t]) => !/\[\[/.test(t) && formesParDefaut(t).length).map(([c]) => c) };
  res.passe = e.length === 0;
  return res;
}

// ── Une variante (§3.5, dernier paragraphe) ───────────────────────────────────────────────────────────────────
let POLICE = null;
/** Motif HORS_POLICE et table EQUIVALENTS de src/utils/pdfTexte.ts du front (lus, jamais recopiés). */
export function policePdf() {
  if (POLICE) return POLICE;
  const f = path.join(FRONT, 'src', 'utils', 'pdfTexte.ts');
  const t = fs.readFileSync(f, 'utf8');
  const m1 = /const HORS_POLICE = \/(.+)\/([a-z]*);/.exec(t);
  const m2 = /const EQUIVALENTS[^=]*=\s*(\{[\s\S]*?\n\});/.exec(t);
  if (!m1 || !m2) throw new Error(`${f} : HORS_POLICE ou EQUIVALENTS introuvable`);
  const corps = m2[1].replace(/\/\/[^\n]*/g, '');
  const equivalents = Function(`"use strict"; return (${corps});`)(); // littéral d'objet du fichier du front
  POLICE = { horsPolice: new RegExp(m1[1], m1[2].includes('g') ? m1[2] : `${m1[2]}g`), equivalents };
  return POLICE;
}
/** Caractères qu'écrirait « ? » le PDF du manuel (stripEmoji de manuelPdf.ts, puis pdfTexte). */
export function caracteresHorsPdf(texte) {
  const { horsPolice, equivalents } = policePdf();
  const t = String(texte || '').replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu, '');
  const out = new Set();
  horsPolice.lastIndex = 0;
  for (const m of t.matchAll(horsPolice)) if (!(m[0] in equivalents)) out.add(m[0]);
  return [...out];
}

export function controlerVariante(ctx, domaine, slug, { ecrire = true } = {}) {
  const lot = lotVariante(ctx, domaine, slug);
  const res = { type: 'variante', nom: slug, domaine, lot, passe: false, echecs: [], signalements: [], infos: {} };
  const e = res.echecs;
  if (!DOMAINES_COLLISIONS.includes(domaine)) { e.push({ point: 0, message: `domaine « ${domaine} » : hotellerie ou ceramique attendu` }); return res; }
  const o = ctx.fiches.get(slug);
  if (!o) { e.push({ point: 0, message: `fiche « ${slug} » absente de origine/manuel/` }); return res; }
  if (!lot) e.push({ point: 0, message: `variante ${domaine}/${slug} absente de lots.json (lots V-*)` });
  const b = lireBalise(path.join(ctx.ch.variantes, domaine), slug);
  if (b.absent) { e.push({ point: 0, message: `variantes/${domaine}/${slug}.md ou .json absent` }); return res; }
  const { md, json } = b;
  const dom = ctx.domaines[domaine];
  if (json.titre !== null && typeof json.titre !== 'string') e.push({ point: 0, message: '« titre » : null (titre commun) ou texte balisé attendu' });
  // baseMd5 : md5 du texte commun balisé courant (§3.3, §8.5).
  const commun = lireBalise(ctx.ch.baliseManuel, slug);
  if (commun.absent) e.push({ point: 0, message: `balise/manuel/${slug}.md absent : pas de texte commun balisé pour baseMd5` });
  else if (json.baseMd5 !== C.md5(commun.md)) e.push({ point: 0, message: `baseMd5 ${json.baseMd5} ≠ md5 du balise/manuel/${slug}.md courant (${C.md5(commun.md)}) : relire la variante et mettre baseMd5 à jour` });
  const titre = typeof json.titre === 'string' ? json.titre : null;
  // 2. Balises valides.
  for (const [champ, t] of [['contenu', md], ['titre', titre]]) {
    if (t !== null) for (const f of verifierBalises(t)) e.push({ point: 2, message: `${champ} : ${f.balise} (${f.raison})` });
  }
  const r = { contenu: rendu(dom.voc, md), titre: titre === null ? null : rendu(dom.voc, titre) };
  // 3. Résiduels (forme par défaut) et formes du domaine en clair (R8.2.3), hors extraits.
  const textes = titre === null ? [md] : [md, titre];
  const nomsChamps = titre === null ? ['contenu'] : ['contenu', 'titre'];
  const { excl, emplois } = pointResiduels(textes, json.exclusions, e, nomsChamps);
  const { textes: restes } = C.retirerExtraits(textes, excl);
  restes.forEach((t, i) => {
    for (const x of formesEnClair(t, dom.formes)) e.push({ point: 3, message: `${nomsChamps[i]} : forme du domaine « ${x.texte} » écrite en clair hors balise (R8.2.3) — ${contexte(t, x.index, x.texte.length)}` });
  });
  extraitsDansRendus(excl, emplois, { [domaine]: titre === null ? [r.contenu] : [r.contenu, r.titre] }, e);
  // 4. Liens (ceux de la fiche commune) ; 5. blocs (ceux de la fiche commune), tableaux (le texte de la variante).
  pointLiens(ctx, o.contenu, { [domaine]: r.contenu }, e);
  pointBlocs(o.contenu, masquerBalises(md), md, { [domaine]: r.contenu }, e);
  // 6. Rendu propre et écrit.
  pointRendusPropres({ [domaine]: r }, e);
  if (ecrire) ecrireRendu(ctx, lot, domaine, slug, { variante: `${domaine}/${slug}`, domaine, lexique: dom.source, titre: r.titre === null ? '(titre commun)' : r.titre }, r.contenu);
  // PDF : aucun caractère changé en « ? ».
  const hors = caracteresHorsPdf(`${r.titre || ''}\n${r.contenu}`);
  if (hors.length) e.push({ point: 6, message: `caractère(s) que le PDF écrirait « ? » : ${hors.map((c) => `${c} (U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`).join(', ')}` });
  // Titre de variante distinct des autres titres rendus du manuel dans ce domaine.
  if (r.titre !== null) {
    for (const [s, f] of ctx.fiches) {
      if (s === slug) continue;
      const bt = lireBalise(ctx.ch.baliseManuel, s);
      const autre = rendu(dom.voc, bt.absent ? f.titre : bt.json.titre);
      if (autre === r.titre) e.push({ point: 6, message: `titre rendu « ${r.titre} » égal à celui de la fiche ${s}` });
    }
  }
  // 7 à 11 (dans son domaine).
  const bruts = [];
  for (const [champ, t] of [['contenu', md], ['titre', titre]]) {
    if (t === null) continue;
    const rr = rendu(dom.voc, t);
    const rrd = rendu(vocabDefaut, t);
    for (const s of motsRepetes(rr, rrd)) bruts.push({ point: 7, domaine, champ, ...s });
    for (const s of balisesRepetees(t, dom.voc)) bruts.push({ point: 7, domaine, champ, ...s });
    for (const s of racinesRepetees(t, dom.voc)) bruts.push({ point: 7, domaine, champ, ...s });
    for (const s of glosesIdentiques(rr, rrd)) bruts.push({ point: 8, domaine, champ, ...s });
    for (const s of definitionsCirculaires(rr, rrd)) bruts.push({ point: 8, domaine, champ, ...s });
    for (const s of elisionsFautives(rr, rrd)) bruts.push({ point: 9, domaine, champ, ...s });
    for (const s of determinantsEnClair(t)) bruts.push({ point: 10, domaine: null, champ, ...s });
    for (const s of appositions(t)) bruts.push({ point: 11, domaine: null, champ, ...s });
  }
  res.signalements = regrouper(ctx, lot, slug, bruts);
  const mmV = motsMetier(md);
  const mmC = motsMetier(o.contenu);
  res.infos = { balises: nbBalises(md) + nbBalises(titre), exclusions: excl.length, motsMetier: { variante: mmV, commun: mmC } };
  res.passe = e.length === 0;
  return res;
}

// ── Contrôles d'ensemble (--tout) ─────────────────────────────────────────────────────────────────────────────
export function controlesEnsemble(ctx) {
  const echecs = [];
  const vocs = { defaut: vocabDefaut, ...Object.fromEntries(DOMAINES_RENDUS.map((d) => [d, ctx.domaines[d].voc])) };
  const titresManuel = [...ctx.fiches.values()].map((f) => {
    const b = lireBalise(ctx.ch.baliseManuel, f.slug);
    return { nom: f.slug, titre: b.absent ? f.titre : b.json.titre };
  });
  const titresBase = [...ctx.entrees.values()].map((x) => {
    const b = lireBalise(ctx.ch.baliseBase, x.fichier);
    return { nom: x.fichier, titre: b.absent ? x.titre : b.json.titre };
  });
  const distincts = (quoi, liste, sansCasse) => {
    for (const [d, voc] of Object.entries(vocs)) {
      const vus = new Map();
      for (const x of liste) {
        const r = rendu(voc, x.titre);
        const k = sansCasse ? String(r).toLowerCase() : r;
        if (vus.has(k)) echecs.push({ point: 'ensemble', message: `${quoi} : « ${r} » rendu deux fois en ${d} (${vus.get(k)}, ${x.nom})` });
        else vus.set(k, x.nom);
      }
    }
  };
  distincts('parties', ctx.parties.parties.map((p) => ({ nom: p.origine, titre: p.balisee })), false);
  distincts('titres du manuel', titresManuel, false);
  distincts('titres de la base', titresBase, true);
  const brutsBase = new Map();
  for (const x of titresBase) {
    const k = String(x.titre).toLowerCase();
    if (brutsBase.has(k)) echecs.push({ point: 'ensemble', message: `titres balisés de la base : « ${x.titre} » deux fois sans casse (R4.3.2)` });
    brutsBase.set(k, x.nom);
  }
  for (const x of titresManuel) if (longueur(x.titre) > TITRE_MAX) echecs.push({ point: 'ensemble', message: `${x.nom} : titre brut de ${longueur(x.titre)} caractères (> ${TITRE_MAX})` });
  for (const x of titresBase) if (longueur(x.titre) > TITRE_MAX) echecs.push({ point: 'ensemble', message: `base ${x.nom} : titre brut de ${longueur(x.titre)} caractères (> ${TITRE_MAX})` });
  for (const p of ctx.parties.parties) if (longueur(p.balisee) > PARTIE_MAX) echecs.push({ point: 'ensemble', message: `partie « ${p.origine} » : ${longueur(p.balisee)} caractères bruts (> ${PARTIE_MAX})` });
  for (const v of variantesPresentes(ctx)) {
    const b = lireBalise(path.join(ctx.ch.variantes, v.domaine), v.slug);
    const commun = lireBalise(ctx.ch.baliseManuel, v.slug);
    if (b.absent) continue;
    if (b.json.titre && longueur(b.json.titre) > TITRE_MAX) echecs.push({ point: 'ensemble', message: `variante ${v.domaine}/${v.slug} : titre brut > ${TITRE_MAX}` });
    if (commun.absent || b.json.baseMd5 !== C.md5(commun.md)) echecs.push({ point: 'ensemble', message: `variante ${v.domaine}/${v.slug} : baseMd5 ≠ md5 du balise/manuel/${v.slug}.md courant` });
  }
  return echecs;
}

/** Variantes présentes dans variantes/<domaine>/ → [{ domaine, slug }]. */
export function variantesPresentes(ctx) {
  const out = [];
  if (!fs.existsSync(ctx.ch.variantes)) return out;
  for (const d of fs.readdirSync(ctx.ch.variantes).sort()) {
    const dir = path.join(ctx.ch.variantes, d);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const n of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) out.push({ domaine: d, slug: n.slice(0, -5) });
  }
  return out;
}

/** Acceptations de relectures/*.auto.json qui ne correspondent à aucun signalement des éléments contrôlés. */
function acceptationsSansObjet(ctx, controles) {
  const noms = new Map();
  for (const r of controles) {
    if (!noms.has(r.lot)) noms.set(r.lot, new Set());
    noms.get(r.lot).add(r.nom);
  }
  const out = [];
  for (const [lot, liste] of ctx.relectures) {
    for (const a of liste) {
      if (a.employee || !noms.get(lot) || !noms.get(lot).has(a.fiche)) continue;
      out.push({ lot, rang: a.rang + 1, fiche: a.fiche, point: a.point, texte: a.texte, raison: a.decision !== 'accepté' || !a.raison ? 'decision ≠ « accepté » ou raison absente' : 'aucun signalement de ce texte' });
    }
  }
  return out;
}

// ── Passage complet ───────────────────────────────────────────────────────────────────────────────────────────
/** Contrôle de toutes les fiches, entrées et variantes présentes, et contrôles d'ensemble. */
export function controlerTout(ctx, { ecrire = true } = {}) {
  const fiches = [...ctx.fiches.keys()].map((s) => controlerFiche(ctx, s, { ecrire }));
  const base = [...ctx.entrees.keys()].map((f) => controlerEntree(ctx, f, { ecrire }));
  const variantes = variantesPresentes(ctx).map((v) => controlerVariante(ctx, v.domaine, v.slug, { ecrire }));
  const ensemble = controlesEnsemble(ctx);
  const tous = [...fiches, ...base, ...variantes];
  const sansObjet = acceptationsSansObjet(ctx, tous);
  const aTraiter = tous.reduce((n, r) => n + r.signalements.filter((s) => s.etat === 'à traiter').length, 0);
  const vert = tous.every((r) => r.passe) && ensemble.length === 0 && aTraiter === 0 && sansObjet.length === 0;
  const motsMetierParFiche = Object.fromEntries([...ctx.fiches.values()].map((f) => [f.slug, motsMetier(f.contenu)]));
  return { vert, fiches, base, variantes, ensemble, sansObjet, aTraiter, motsMetier: motsMetierParFiche };
}

const resumeDe = (r) => ({
  passe: r.passe,
  echecs: r.echecs,
  signalements: r.signalements,
  infos: r.infos,
});

function ecrireRapport(ctx, fichier, contenu) {
  const f = path.join(ctx.ch.rendus, fichier);
  let ancien = {};
  if (fs.existsSync(f) && fichier !== 'tout.json') {
    try { ancien = C.lireJson(f); } catch (_) { ancien = {}; }
  }
  const fusion = { ...ancien, ...contenu, elements: { ...(ancien.elements || {}), ...(contenu.elements || {}) } };
  C.ecrireJson(f, fusion);
}

// ── Ligne de commande ─────────────────────────────────────────────────────────────────────────────────────────
function lireArguments(argv) {
  const o = { slugs: [], base: [], variante: null, lot: null, tout: false, lexique: null, lecture: null, racine: null };
  let mode = 'slugs';
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--lot') o.lot = argv[++i];
    else if (a === '--tout') o.tout = true;
    else if (a === '--lexique') o.lexique = argv[++i];
    else if (a === '--lecture') o.lecture = argv[++i];
    else if (a === '--racine') o.racine = argv[++i];
    else if (a === '--base') mode = 'base';
    else if (a === '--variante') { o.variante = argv[++i]; mode = 'slugs'; }
    else if (a.startsWith('--')) throw new Error(`option inconnue « ${a} »`);
    else o[mode].push(a);
  }
  for (const k of ['lot', 'lexique', 'lecture', 'racine', 'variante']) if (o[k] === undefined) throw new Error(`--${k} attend une valeur`);
  if (o.lecture && !o.lexique) throw new Error('--lecture ne sert qu\'avec --lexique');
  if (!o.tout && !o.lot && !o.slugs.length && !o.base.length) throw new Error('rien à faire : <slug>…, --lot <lot>, --base <fichier>…, --variante <domaine> <slug>… ou --tout');
  if (o.variante && !o.slugs.length) throw new Error('--variante <domaine> <slug>… : slug attendu');
  return o;
}

const ligneResultat = (r) => {
  const sig = r.signalements;
  const n = (etat) => sig.filter((s) => s.etat === etat).length;
  const nom = r.type === 'base' ? `base/${r.nom}` : r.type === 'variante' ? `variante ${r.domaine}/${r.nom}` : r.nom;
  const points = [...new Set(r.echecs.map((x) => x.point))].sort();
  return `[controler] ${r.lot || '-'} ${nom} : ${r.passe ? (r.type === 'variante' ? 'OK (points 2 à 6 et contrôles des variantes)' : 'OK (points 1 à 6)') : `ÉCHEC (point(s) ${points.join(', ')})`} ; `
    + `signalements : ${n('à traiter')} à traiter, ${n('accepté')} accepté(s)`;
};

export function principal(argv = process.argv.slice(2)) {
  let o;
  let ctx;
  try {
    o = lireArguments(argv);
    ctx = creerContexte({ racine: o.racine || C.DOSSIER, lexique: o.lexique, lecture: o.lecture || LECTURE_DEFAUT });
  } catch (err) {
    err.code = 2; // refus avant tout contrôle : usage, lexiques incohérents, fichier --lexique illisible
    throw err;
  }
  const sorties = [];
  const log = (s) => { sorties.push(s); console.log(s); };
  if (o.lexique) {
    const f = ctx.domaines.hotellerie.fichier;
    log(`[controler] lexique Hôtellerie : ${ctx.domaines.hotellerie.source} (lecture de production, résolu) ; ${f.cles} clé(s) ; md5 de lexique::text ${f.md5} ; ${f.lecture}`);
    for (const a of f.avertissements) log(`[controler] ! lexique Hôtellerie : ${a}`);
  }

  if (o.tout) {
    const t = controlerTout(ctx);
    const tous = [...t.fiches, ...t.base, ...t.variantes];
    for (const r of tous.filter((x) => !x.passe)) log(ligneResultat(r));
    const nb = (l) => `${l.filter((r) => r.passe).length}/${l.length}`;
    log(`[controler] --tout : fiches ${nb(t.fiches)}, entrées ${nb(t.base)}, variantes ${nb(t.variantes)} passent ; `
      + `ensemble : ${t.ensemble.length} échec(s) ; signalements à traiter : ${t.aTraiter} ; acceptations sans objet : ${t.sansObjet.length}`);
    for (const x of t.ensemble.slice(0, 20)) log(`  ✗ ${x.message}`);
    for (const x of t.sansObjet.slice(0, 20)) log(`  ✗ relectures/${x.lot}.auto.json ligne ${x.rang} (${x.fiche}, point ${x.point}, « ${x.texte} ») : ${x.raison}`);
    C.ecrireJson(path.join(ctx.ch.rendus, 'tout.json'), {
      _lisezmoi: 'controler.mjs --tout (spec §3.5, P1) : non versionné. « vert » = toutes les fiches, entrées et variantes passent '
        + '(points 1 à 6), contrôles d\'ensemble passés, aucun signalement à traiter, aucune acceptation sans objet.',
      le: new Date().toISOString(),
      lexiques: Object.fromEntries(DOMAINES_RENDUS.map((d) => [d, ctx.domaines[d].source])),
      vert: t.vert,
      resume: {
        fiches: nb(t.fiches), base: nb(t.base), variantes: nb(t.variantes), ensemble: t.ensemble.length, aTraiter: t.aTraiter, sansObjet: t.sansObjet.length,
        motsMetier: Object.values(t.motsMetier).reduce((s, m) => s + m.total, 0),
      },
      ensemble: t.ensemble,
      acceptationsSansObjet: t.sansObjet,
      fiches: Object.fromEntries(t.fiches.map((r) => [r.nom, resumeDe(r)])),
      base: Object.fromEntries(t.base.map((r) => [r.nom, resumeDe(r)])),
      variantes: Object.fromEntries(t.variantes.map((r) => [`${r.domaine}/${r.nom}`, resumeDe(r)])),
      motsMetier: t.motsMetier,
    });
    log(`[controler] ${t.vert ? 'VERT' : 'ROUGE'} — rapport : ${path.relative(C.RACINE, path.join(ctx.ch.rendus, 'tout.json'))}`);
    return { code: t.vert ? 0 : 1, resultat: t, sorties };
  }

  // Éléments à contrôler.
  const travaux = [];
  if (o.lot) {
    const l = ctx.lots.lots[o.lot];
    if (!l) throw Object.assign(new Error(`lot « ${o.lot} » absent de lots.json`), { code: 2 });
    for (const s of l.fiches || []) travaux.push({ type: 'fiche', nom: s });
    for (const f of l.base || []) travaux.push({ type: 'base', nom: f });
    for (const s of l.variantes || []) travaux.push({ type: 'variante', nom: s, domaine: l.domaine });
  }
  if (o.variante) for (const s of o.slugs) travaux.push({ type: 'variante', nom: s, domaine: o.variante });
  else for (const s of o.slugs) travaux.push({ type: 'fiche', nom: s });
  for (const f of o.base) travaux.push({ type: 'base', nom: f });
  const resultats = travaux.map((w) => (w.type === 'fiche' ? controlerFiche(ctx, w.nom)
    : w.type === 'base' ? controlerEntree(ctx, w.nom) : controlerVariante(ctx, w.domaine, w.nom)));
  for (const r of resultats) {
    log(ligneResultat(r));
    for (const x of r.echecs.slice(0, 12)) log(`  ✗ point ${x.point} : ${x.message}`);
    if (r.echecs.length > 12) log(`  … ${r.echecs.length - 12} autre(s) échec(s) (rapport)`);
  }
  const sansObjet = acceptationsSansObjet(ctx, resultats);
  for (const x of sansObjet) log(`  ! relectures/${x.lot}.auto.json ligne ${x.rang} (${x.fiche}, point ${x.point}, « ${x.texte} ») : ${x.raison}`);
  const parLot = new Map();
  for (const r of resultats) {
    const lot = r.lot || 'sans-lot';
    if (!parLot.has(lot)) parLot.set(lot, []);
    parLot.get(lot).push(r);
  }
  for (const [lot, rs] of parLot) {
    ecrireRapport(ctx, path.join(lot, 'controle.json'), {
      _lisezmoi: 'controler.mjs (spec §3.5) : résultat par élément (non versionné). Une fiche passe si les points 1 à 6 passent ; '
        + 'les signalements 7 à 12 « à traiter » sont corrigés ou acceptés dans relectures/<lot>.auto.json.',
      lot,
      lexiques: Object.fromEntries(DOMAINES_RENDUS.map((d) => [d, ctx.domaines[d].source])),
      elements: Object.fromEntries(rs.map((r) => [r.type === 'variante' ? `${r.domaine}/${r.nom}` : r.nom, { ...resumeDe(r), le: new Date().toISOString() }])),
    });
  }
  const passe = resultats.every((r) => r.passe);
  log(`[controler] ${resultats.filter((r) => r.passe).length}/${resultats.length} élément(s) passent (points 1 à 6) ; rendus et rapports dans ${path.relative(C.RACINE, ctx.ch.rendus) || '.'}`);
  return { code: passe ? 0 : 1, resultats, sansObjet, sorties };
}

const lanceDirectement = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (lanceDirectement) {
  try {
    const { code } = principal();
    process.exitCode = code;
  } catch (err) {
    console.error(`[controler] refus : ${err.message}`);
    process.exitCode = err.code === 2 ? 2 : 1;
  }
}
