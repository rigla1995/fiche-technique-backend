/* Lot 2c — pré-baliseur du manuel (docs/lot-2c-spec.md §3.4, R3.4.1 à R3.4.4).
 *
 *   node scripts/manuel/prebaliser.mjs <slug>…            fiches données (leur lot est lu dans lots.json)
 *   node scripts/manuel/prebaliser.mjs --lot L3           toutes les fiches du lot (L9 : les 32 entrées de la base)
 *   node scripts/manuel/prebaliser.mjs --base <fichier>…  entrées de la base (nom de fichier de origine/base/)
 * Options :
 *   --remplacer         réécrit un brouillon qui existe déjà (sinon refus : il porte peut-être le travail du baliseur) ;
 *   --sortie <dossier>  racine de sortie à la place de scripts/manuel/ (essais, tests) : <dossier>/balise/…, <dossier>/rendus/….
 *
 * Il écrit un BROUILLON à partir de l'origine (jamais de la base) :
 *   balise/manuel/<slug>.md (contenu balisé) et .json { slug, titre balisé, exclusions, baliseur, relecteur } ;
 *   balise/base/<fichier>.md et .json { cle, titre balisé, exclusions, baliseur, relecteur } ;
 *   rendus/<lot>/a-baliser.json : ce qu'il n'a pas balisé (« nonBalisees ») et ce qu'il a balisé mais qu'il faut relire
 *   (« aVerifier ») ; une nouvelle passe sur une partie du lot remplace seulement les fiches passées.
 *
 * Règles (spec §3.4) :
 *   - formes : celles de formesParDefaut (src/utils/manuelRendu.js, motif de termesDans : mot entier, formes les plus
 *     longues d'abord, mot sans casse, sigle de 2 à 4 capitales avec casse) ; clé = première clé qui porte la forme ;
 *   - déterminant qui précède essayé en minuscules ET à majuscule (le, la, l', les, un, une, des, du, de la, de l', de,
 *     d', au, à la, à l', aux, ce, cet, cette, ces, aucun, aucune, votre, vos, mon, ma, mes, son, sa, ses, nouveau,
 *     nouvel, nouvelle, tous les, toutes les ; en plus, sans risque pour l'identité : nouveaux, nouvelles, tous / toutes
 *     vos, ces, mes), puis le nom seul. Déterminant séparé du nom par « ** », « * » ou « [ » (gras, italique, libellé
 *     de lien), ou nom en capitales : [[det:clé:…]] collé, puis la marque, puis la balise du nom (spec §7.4) ;
 *   - une balise n'est proposée QUE si son rendu par défaut reproduit exactement le passage (même casse, même
 *     déterminant, même élision) ; sinon le passage reste et va dans a-baliser.json (R3.4.2) ;
 *   - jamais touchés (R3.4.3) : la cible d'un lien « (#slug) », le mot-clé d'un bloc « :::astuce », un passage entre
 *     accents graves, une forme collée à un trait d'union, les locutions de la liste fermée du §7.2 (écrites comme
 *     exclusions « locution » dans le .json, dans l'ordre d'application de l'oracle, avec leur nombre d'occurrences) ;
 *   - jamais d'accord « acc » (R3.4.4) : les mots accordables restés en clair devant une balise sont listés ;
 *   - forme courte proposée seulement là où l'origine écrit la forme courte du défaut (« PT », « Appro », R7.1.5) ;
 *     « Titre » seulement si « Nom » ne reproduit pas, « MAJ » seulement si rien d'autre ne reproduit ;
 *   - deux balises possibles qui rendent différemment hors restauration (sigle « PT » : court / Court, sg / pl) : choix
 *     par le contexte (début de phrase, déterminant, « (PT) » après le même terme), signalé dans « aVerifier ».
 * Garde : avant d'écrire, chaque champ balisé est rendu avec le vocabulaire par défaut et comparé à l'origine OCTET
 * POUR OCTET (I10), et contrôlé par verifierBalises (I11) : un écart arrête l'outil (code 1), rien n'est écrit.
 *
 * Seul usage par un agent de balisage : sur SES fiches (spec §9.3). Aucune base, aucun réseau. */
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

// ── Déterminants (R3.4.1) ─────────────────────────────────────────────────────────────────────────────────────
// [surface en minuscules, méthode, déterminant de `tous`]. Les formes à majuscule sont dérivées (« L' » → `Le`).
const DETS_BASE = [
  ['le', 'le'], ['la', 'le'], ["l'", 'le'], ['les', 'le'],
  ['un', 'un'], ['une', 'un'], ['des', 'un'],
  ['du', 'du'], ['de la', 'du'], ["de l'", 'du'],
  ['de', 'de'], ["d'", 'de'],
  ['au', 'au'], ['à la', 'au'], ["à l'", 'au'], ['aux', 'au'],
  ['ce', 'ce'], ['cet', 'ce'], ['cette', 'ce'], ['ces', 'ce'],
  ['aucun', 'aucun'], ['aucune', 'aucun'],
  ['votre', 'votre'], ['vos', 'votre'],
  ['mon', 'mon'], ['ma', 'mon'], ['mes', 'mon'],
  ['son', 'son'], ['sa', 'son'], ['ses', 'son'],
  ['nouveau', 'nouveau'], ['nouvel', 'nouveau'], ['nouvelle', 'nouveau'], ['nouveaux', 'nouveau'], ['nouvelles', 'nouveau'],
  ['tous les', 'tous', 'les'], ['toutes les', 'tous', 'les'],
  ['tous vos', 'tous', 'vos'], ['toutes vos', 'tous', 'vos'],
  ['tous ces', 'tous', 'ces'], ['toutes ces', 'tous', 'ces'],
  ['tous mes', 'tous', 'mes'], ['toutes mes', 'tous', 'mes'],
];
const majuscule = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const DETERMINANTS = DETS_BASE
  .flatMap(([surface, methode, detTous]) => [
    { surface, methode, detTous, cap: false },
    { surface: majuscule(surface), methode: majuscule(methode), detTous, cap: true },
  ])
  .sort((a, b) => b.surface.length - a.surface.length);
// Marques admises entre le déterminant et le nom (gras, italique, libellé de lien) : [[det:…]] + marque + nom.
const MARQUES = ['**', '*', '['];
// Mots qui s'accordent (point 10 du contrôle, §3.5) : listés quand ils restent en clair devant une balise de nom.
const ACCORDABLES = new Set(['le', 'la', "l'", 'un', 'une', 'du', 'de', "d'", 'au', 'ce', 'cet', 'cette', 'mon', 'ma', 'son',
  'sa', 'aucun', 'aucune', 'quel', 'quelle', 'quels', 'quelles', 'nouveau', 'nouvel', 'nouvelle', 'premier', 'première',
  'premiers', 'premières', 'dernier', 'dernière', 'derniers', 'dernières', 'seul', 'seule', 'seuls', 'seules', 'tout', 'toute', 'tous', 'toutes',
  'propre', 'même']);

// ── Locutions de la liste fermée (spec §7.2, décision 2 du client) ────────────────────────────────────────────
// Ordre = ordre d'application (un extrait qui en contient un autre passe avant : « sous-produit transformé »).
const B = '(?<![\\p{L}\\p{N}_])';
const F = '(?![\\p{L}\\p{N}_])';
const LOCUTIONS = [
  { re: new RegExp(`${B}sous-produits? transformée?s?${F}`, 'giu'),
    justification: 'décision 2 du client : « sous-produit » exclu en locution, pas de nouvelle clé (spec 2c §1, §7.2)' },
  { re: new RegExp(`${B}sous-produits?${F}`, 'giu'),
    justification: 'décision 2 du client : « sous-produit » exclu en locution, pas de nouvelle clé (spec 2c §1, §7.2)' },
  { re: new RegExp(`${B}[Ss]ous-PT${F}`, 'gu'),
    justification: 'même notion que « sous-produit » (décision 2 du client, spec 2c §7.2)' },
  { re: new RegExp(`${B}(?:prix|types?|canal|canaux) de ventes?${F}`, 'giu'),
    justification: 'locution figée du métier (lot-2-spec §3 règle 4, spec 2c §7.2)' },
];

// ── Zones jamais touchées (R3.4.3) ────────────────────────────────────────────────────────────────────────────
function zonesProtegees(t) {
  const zones = [];
  for (const m of t.matchAll(/\]\(([^)\n]*)\)/g)) zones.push({ debut: m.index + 1, fin: m.index + m[0].length, raison: 'cible de lien' });
  for (const m of t.matchAll(/^:::[A-Za-z]+/gm)) zones.push({ debut: m.index, fin: m.index + m[0].length, raison: 'mot-clé de bloc' });
  for (const m of t.matchAll(/`[^`\n]+`/g)) zones.push({ debut: m.index, fin: m.index + m[0].length, raison: 'accents graves' });
  return zones;
}
const dans = (zones, debut, fin) => zones.find((z) => debut < z.fin && fin > z.debut) || null;

// ── Candidats de balise ───────────────────────────────────────────────────────────────────────────────────────
const VOC_ESSAI = V.vocabulairesEssai();
const signature = (balise) => V.DOMAINES_ESSAI.map((d) => rendre(VOC_ESSAI[d], balise, () => {})).join('\u0000');
const rendDefaut = (balise) => rendre(vocabDefaut, balise, () => {});
const aFormeCourte = (cle) => {
  const e = LEXIQUE_DEFAUT[cle];
  return Boolean(e && e.court && e.court.sg);
};
const estFormeCourte = (cle, texte) => {
  const e = LEXIQUE_DEFAUT[cle];
  return aFormeCourte(cle) && [e.court.sg, e.court.pl].some((f) => f && f.toLowerCase() === texte.toLowerCase());
};

/** Balises du nom seul qui reproduisent `texte` par défaut : [{ methode, pl, balise }], dans l'ordre de préférence. */
function candidatsNom(cle, texte) {
  const essai = (methode) => [false, true]
    .map((pl) => ({ methode, pl, balise: `[[${methode}:${cle}${pl ? ':pl' : ''}]]` }))
    .filter((c) => rendDefaut(c.balise) === texte);
  let c = [...essai('nom'), ...essai('Nom')];
  if (!c.length) c = essai('Titre');
  if (estFormeCourte(cle, texte)) c = [...c, ...essai('court'), ...essai('Court')];
  if (!c.length) c = essai('MAJ');
  return c;
}
const CASSE_DET = { nom: null, Nom: 'Nom', Titre: 'Titre', court: 'court', Court: 'Court' };
const args = (...a) => a.filter(Boolean).map((x) => `:${x}`).join('');

/** Balises « déterminant + nom » qui reproduisent `passage` par défaut. */
function candidatsDet(cle, det, marque, noms, passage) {
  const out = [];
  for (const n of noms) {
    let balise = null;
    if (!marque && n.methode !== 'MAJ') {
      const casse = CASSE_DET[n.methode];
      if (/^tous$/i.test(det.methode)) {
        if (n.pl || rendDefaut(`[[nom:${cle}]]`) === rendDefaut(`[[nom:${cle}:pl]]`)) balise = `[[${det.methode}:${cle}${args(det.detTous, casse)}]]`;
      } else if (/^aucun$/i.test(det.methode)) {
        if (!n.pl) balise = `[[${det.methode}:${cle}${args(casse)}]]`;
      } else {
        balise = `[[${det.methode}:${cle}${args(n.pl && 'pl', casse)}]]`;
      }
    } else if (!/^tous$/i.test(det.methode)) {
      const casseDet = n.methode === 'court' || n.methode === 'Court' ? 'court' : null;
      balise = `[[${det.cap ? 'Det' : 'det'}:${cle}${args(det.methode.toLowerCase(), n.pl && 'pl', casseDet)}]]${marque}${n.balise}`;
    }
    if (balise && rendDefaut(balise) === passage) out.push({ ...n, balise });
  }
  return out;
}

// Début de phrase (pour choisir « Court » plutôt que « court » quand les deux reproduisent un sigle).
function debutDePhrase(t, debut) {
  const ligne = t.slice(t.lastIndexOf('\n', debut - 1) + 1, debut)
    .replace(/[\p{Extended_Pictographic}️‍]/gu, '')
    .replace(/[\s*_[(«"“]+$/u, '');
  return /^\s*(?:#{1,6}|[-*+]|\d+[.)]|>|:::[A-Za-z]+)?\s*$/.test(ligne) || /[.!?…|]$/.test(ligne);
}

const numeroLigne = (t, i) => t.slice(0, i).split('\n').length;
const contexte = (t, debut, fin) => {
  const d = t.lastIndexOf('\n', debut - 1) + 1;
  const f0 = t.indexOf('\n', fin);
  const ligne = t.slice(d, f0 < 0 ? t.length : f0);
  if (ligne.length <= 160) return ligne;
  const a = Math.max(0, debut - d - 70);
  return `${a > 0 ? '…' : ''}${ligne.slice(a, a + 160)}${a + 160 < ligne.length ? '…' : ''}`;
};

/**
 * Pré-balise un texte d'origine (contenu ou titre). Fonction pure.
 * → { balise, locutions: [texte exact des locutions, dans l'ordre du texte], nonBalisees, aVerifier, stats }.
 */
export function prebaliserTexte(texte, champ = 'contenu') {
  const t = String(texte ?? '');
  const zones = zonesProtegees(t);
  const locs = [];
  LOCUTIONS.forEach((l, rang) => {
    for (const m of t.matchAll(l.re)) {
      const debut = m.index;
      const fin = debut + m[0].length;
      if (locs.some((x) => debut < x.fin && fin > x.debut) || dans(zones, debut, fin)) continue;
      locs.push({ debut, fin, texte: m[0], rang });
    }
  });
  locs.sort((a, b) => a.debut - b.debut);

  const stats = { formes: 0, balisees: 0, locutions: 0, ciblesDeLien: 0, nonBalisees: 0 };
  const nonBalisees = [];
  const aVerifier = [];
  const remplacements = [];
  let finPrecedente = 0;
  const noter = (liste, debut, fin, extra) => liste.push({ champ, ligne: numeroLigne(t, debut), ...extra, contexte: contexte(t, debut, fin) });

  for (const o of formesParDefaut(t)) {
    stats.formes += 1;
    const debut = o.index;
    const fin = debut + o.texte.length;
    const zone = dans(zones, debut, fin);
    if (zone) {
      if (zone.raison === 'cible de lien') stats.ciblesDeLien += 1;
      else { stats.nonBalisees += 1; noter(nonBalisees, debut, fin, { forme: o.texte, cle: o.cle, raison: zone.raison }); }
      continue;
    }
    if (locs.some((x) => debut < x.fin && fin > x.debut)) { stats.locutions += 1; continue; }
    if (t[debut - 1] === '-' || t[fin] === '-') {
      stats.nonBalisees += 1;
      noter(nonBalisees, debut, fin, { forme: o.texte, cle: o.cle, raison: 'collée à un trait d\'union (R3.4.3) : jamais de balise contre un tiret (point 3 de controler.mjs) ; locution de la liste fermée, exclusion justifiée, ou nom d\'écran (nom-fige), à la main' });
      continue;
    }
    const noms = candidatsNom(o.cle, o.texte);
    if (!noms.length) {
      stats.nonBalisees += 1;
      noter(nonBalisees, debut, fin, { forme: o.texte, cle: o.cle, raison: 'aucune balise ne reproduit la forme (casse ?)' });
      continue;
    }

    // Déterminant qui précède (le plus long d'abord), éventuellement séparé du nom par une marque.
    let det = null;
    for (const d of DETERMINANTS) {
      const sep = d.surface.endsWith("'") ? '' : ' ';
      for (const marque of ['', ...MARQUES]) {
        const avant = d.surface + sep + marque;
        const dd = debut - avant.length;
        if (dd < finPrecedente || t.slice(dd, debut) !== avant) continue;
        if (dd > 0 && /[\p{L}\p{N}_]/u.test(t[dd - 1])) continue;
        if (dans(zones, dd, debut) || locs.some((x) => dd < x.fin && debut > x.debut)) continue;
        det = { ...d, marque, debut: dd };
        break;
      }
      if (det) break;
    }
    // Nom en capitales sans déterminant devant : la balise MAJ seule est juste (« [[MAJ:labo]] »).
    let candidats;
    let debutPassage = debut;
    if (det) {
      const passage = t.slice(det.debut, fin);
      candidats = candidatsDet(o.cle, det, det.marque, noms, passage);
      if (!candidats.length) {
        stats.nonBalisees += 1;
        noter(nonBalisees, det.debut, fin, { forme: passage, cle: o.cle, raison: 'déterminant + forme : aucune balise ne reproduit le passage (R3.4.2)' });
        continue;
      }
      debutPassage = det.debut;
    } else {
      candidats = noms;
    }

    // Choix entre balises qui reproduisent toutes le passage par défaut mais rendent différemment hors restauration.
    let choix = candidats[0];
    const groupes = new Set(candidats.map((c) => signature(c.balise)));
    if (groupes.size > 1) {
      let restants = candidats;
      const raisons = [];
      if (new Set(restants.map((c) => c.pl)).size > 1) {
        const prec = remplacements[remplacements.length - 1];
        const apresParenthese = prec && prec.cle === o.cle && t.slice(prec.fin, debutPassage) === ' (';
        const pl = apresParenthese ? prec.pl : false;
        restants = restants.filter((c) => c.pl === pl);
        raisons.push(apresParenthese ? 'nombre repris du terme qui précède la parenthèse' : 'nombre ambigu (singulier choisi)');
      }
      if (new Set(restants.map((c) => signature(c.balise))).size > 1) {
        const cap = debutDePhrase(t, debutPassage);
        const parCasse = restants.filter((c) => /^[A-Z]/.test(c.methode) === cap);
        if (parCasse.length) restants = parCasse;
        raisons.push(cap ? 'casse ambiguë (début de phrase : majuscule choisie)' : 'casse ambiguë (minuscule choisie)');
      }
      choix = restants[0];
      noter(aVerifier, debutPassage, fin, {
        passage: t.slice(debutPassage, fin), balise: choix.balise, raison: raisons.join(' ; '),
        alternatives: candidats.filter((c) => c.balise !== choix.balise).map((c) => c.balise),
      });
    }

    // Nom seul (sans déterminant consommé) : mot accordable resté en clair devant lui (point 10), apposition (point 11).
    const avant = t.slice(Math.max(0, debutPassage - 40), debutPassage).replace(/[*[\s]+$/, '');
    const motAvant = (avant.match(/([\p{L}]+'?)$/u) || [])[1];
    if (debutPassage === debut && motAvant && ACCORDABLES.has(motAvant.toLowerCase())) {
      noter(aVerifier, debutPassage, fin, { passage: t.slice(debutPassage, fin), balise: choix.balise, raison: `« ${motAvant} » en clair devant la balise : accord à poser à la main (R7.3, §7.4 ; point 10)` });
    }
    const prec = remplacements[remplacements.length - 1];
    if (debutPassage === debut && prec && t.slice(prec.fin, debut) === ' ' && LEXIQUE_DEFAUT[o.cle] && LEXIQUE_DEFAUT[o.cle].appo) {
      noter(aVerifier, prec.debut, fin, { passage: t.slice(prec.debut, fin), balise: `${prec.balise} ${choix.balise}`, raison: 'deux noms collés, le second à apposition : [[compl:…]] dans une phrase, [[Court:…]] dans un nom d\'écran (R7.1.4 ; point 11)' });
    }

    remplacements.push({ debut: debutPassage, fin, balise: choix.balise, cle: o.cle, pl: choix.pl });
    finPrecedente = fin;
    stats.balisees += 1;
  }

  let balise = '';
  let curseur = 0;
  for (const r of remplacements) {
    balise += t.slice(curseur, r.debut) + r.balise;
    curseur = r.fin;
  }
  balise += t.slice(curseur);
  return { balise, locutions: locs.map((l) => ({ texte: l.texte, rang: l.rang })), nonBalisees, aVerifier, stats };
}

/** Exclusions « locution » d'un ensemble de textes balisés : une par texte exact, dans l'ordre d'application
 * (rang de la liste fermée, puis plus long d'abord), avec son nombre d'emplois (règle de l'oracle, retirerExtraits). */
function exclusionsLocutions(resultats) {
  const vus = new Map();
  for (const r of resultats) for (const l of r.locutions) if (!vus.has(l.texte)) vus.set(l.texte, l.rang);
  const liste = [...vus.entries()]
    .sort((a, b) => a[1] - b[1] || b[0].length - a[0].length || C.parPointsDeCode(a[0], b[0]))
    .map(([extrait, rang]) => {
      const f = formesParDefaut(extrait)[0];
      return { extrait, forme: f ? f.texte : extrait, type: 'locution', occurrences: 0, justification: LOCUTIONS[rang].justification };
    });
  const { emplois } = C.retirerExtraits(resultats.map((r) => r.balise), liste);
  liste.forEach((x, i) => { x.occurrences = emplois[i]; });
  return liste;
}

/** Garde I10 + I11 : le champ balisé rendu par défaut égale l'origine octet pour octet, balises valides. */
function garde(nom, origine, balise) {
  const rendu = rendre(vocabDefaut, balise, () => {});
  if (!Buffer.from(rendu, 'utf8').equals(Buffer.from(origine, 'utf8'))) throw new Error(`${nom} : rendu par défaut ≠ origine (I10)`);
  const fautes = verifierBalises(balise);
  if (fautes.length) throw new Error(`${nom} : balise invalide ${fautes[0].balise} (${fautes[0].raison})`);
}

/** Pré-balise une fiche d'origine ({ slug, titre, contenu }) → { md, json, rapport }. */
export function prebaliserFiche(fiche, { lot = null, relecteur = null } = {}) {
  const contenu = prebaliserTexte(fiche.contenu, 'contenu');
  const titre = prebaliserTexte(fiche.titre, 'titre');
  garde(`${fiche.slug} › contenu`, fiche.contenu, contenu.balise);
  garde(`${fiche.slug} › titre`, fiche.titre, titre.balise);
  const exclusions = exclusionsLocutions([contenu, titre]);
  return {
    md: contenu.balise,
    json: { slug: fiche.slug, titre: titre.balise, exclusions, baliseur: lot, relecteur },
    rapport: rapportDe([titre, contenu], exclusions),
  };
}

/** Pré-balise une entrée de la base ({ fichier, cle, titre, contenu }) → { md, json, rapport }. */
export function prebaliserEntree(entree, { lot = null, relecteur = null } = {}) {
  const contenu = prebaliserTexte(entree.contenu, 'contenu');
  const titre = prebaliserTexte(entree.titre, 'titre');
  garde(`base ${entree.fichier} › contenu`, entree.contenu, contenu.balise);
  garde(`base ${entree.fichier} › titre`, entree.titre, titre.balise);
  const exclusions = exclusionsLocutions([contenu, titre]);
  return {
    md: contenu.balise,
    json: { cle: entree.cle, titre: titre.balise, exclusions, baliseur: lot, relecteur },
    rapport: rapportDe([titre, contenu], exclusions),
  };
}

function rapportDe(resultats, exclusions) {
  const somme = (k) => resultats.reduce((s, r) => s + r.stats[k], 0);
  return {
    formes: somme('formes'),
    balisees: somme('balisees'),
    locutions: somme('locutions'),
    ciblesDeLien: somme('ciblesDeLien'),
    nonBalisees: resultats.flatMap((r) => r.nonBalisees),
    aVerifier: resultats.flatMap((r) => r.aVerifier),
    exclusions: exclusions.map((x) => `${x.extrait} ×${x.occurrences}`),
  };
}

// ── Ligne de commande ─────────────────────────────────────────────────────────────────────────────────────────
function lireArguments(argv) {
  const o = { slugs: [], base: [], lot: null, sortie: null, remplacer: false };
  let mode = 'slugs';
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--lot') o.lot = argv[++i];
    else if (a === '--sortie') o.sortie = argv[++i];
    else if (a === '--remplacer') o.remplacer = true;
    else if (a === '--base') mode = 'base';
    else if (a.startsWith('--')) throw new Error(`option inconnue « ${a} »`);
    else o[mode].push(a);
  }
  if (!o.lot && !o.slugs.length && !o.base.length) throw new Error('rien à faire : <slug>…, --lot <lot> ou --base <fichier>…');
  if (o.lot === undefined || o.sortie === undefined) throw new Error('--lot et --sortie attendent une valeur');
  return o;
}

export function principal(argv = process.argv.slice(2)) {
  const o = lireArguments(argv);
  const lots = C.lireLots();
  const { fiches, entrees } = C.lireOrigine();
  const parSlug = new Map(fiches.map((f) => [f.slug, f]));
  const parFichier = new Map(entrees.map((e) => [e.fichier, e]));
  let slugs = [...o.slugs];
  let base = [...o.base];
  if (o.lot) {
    const l = lots.lots[o.lot];
    if (!l) throw new Error(`lot « ${o.lot} » absent de lots.json`);
    if (l.variantes) throw new Error(`lot « ${o.lot} » : les variantes ne se pré-balisent pas (spec §8.2)`);
    slugs.push(...(l.fiches || []));
    base.push(...(l.base || []));
  }
  slugs = [...new Set(slugs)];
  base = [...new Set(base)];
  const travaux = [];
  for (const s of slugs) {
    if (!parSlug.has(s)) throw new Error(`fiche « ${s} » absente de origine/manuel/`);
    const lot = C.lotDe(s, {}, lots);
    if (!lot) throw new Error(`fiche « ${s} » : aucun lot dans lots.json`);
    travaux.push({ type: 'fiche', nom: s, lot });
  }
  for (const f of base) {
    if (!parFichier.has(f)) throw new Error(`entrée « ${f} » absente de origine/base/`);
    const lot = C.lotDe(f, { base: true }, lots);
    if (!lot) throw new Error(`entrée « ${f} » : aucun lot dans lots.json`);
    travaux.push({ type: 'base', nom: f, lot });
  }

  const ch = C.chemins(o.sortie ? path.resolve(o.sortie) : C.DOSSIER);
  const cible = (w) => (w.type === 'fiche' ? path.join(ch.baliseManuel, w.nom) : path.join(ch.baliseBase, w.nom));
  const existants = travaux.filter((w) => ['.md', '.json'].some((x) => fs.existsSync(cible(w) + x)));
  if (existants.length && !o.remplacer) {
    throw new Error(`brouillon déjà présent (travail du baliseur ?) : ${existants.map((w) => path.relative(C.RACINE, cible(w))).join(', ')} — --remplacer pour le réécrire`);
  }

  // Tout est calculé (et gardé : I10, I11) avant la première écriture.
  const resultats = travaux.map((w) => {
    const relecteur = lots.lots[w.lot].relecteur || null;
    const r = w.type === 'fiche'
      ? prebaliserFiche(parSlug.get(w.nom), { lot: w.lot, relecteur })
      : prebaliserEntree(parFichier.get(w.nom), { lot: w.lot, relecteur });
    return { ...w, ...r };
  });
  for (const r of resultats) {
    C.ecrireTexte(`${cible(r)}.md`, r.md);
    C.ecrireJson(`${cible(r)}.json`, r.json);
  }
  const parLot = new Map();
  for (const r of resultats) {
    if (!parLot.has(r.lot)) parLot.set(r.lot, []);
    parLot.get(r.lot).push(r);
  }
  for (const [lot, rs] of parLot) {
    const fichier = path.join(ch.rendus, lot, 'a-baliser.json');
    let rapport = { _lisezmoi: '', lot, fiches: {}, base: {} };
    if (fs.existsSync(fichier)) {
      try { rapport = { ...rapport, ...C.lireJson(fichier) }; } catch (_) { /* rapport illisible : réécrit */ }
    }
    rapport._lisezmoi = 'Pré-baliseur (spec §3.4) : « nonBalisees » = formes laissées telles quelles (à baliser, exclure ou '
      + 'justifier à la main) ; « aVerifier » = balises posées à relire (choix ambigu, accord, apposition). Non versionné.';
    for (const r of rs) rapport[r.type === 'fiche' ? 'fiches' : 'base'][r.nom] = r.rapport;
    C.ecrireJson(fichier, rapport);
  }
  return resultats;
}

const lanceDirectement = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (lanceDirectement) {
  try {
    const rs = principal();
    for (const r of rs) {
      const p = r.rapport;
      console.log(`[prebaliser] ${r.lot} ${r.type === 'fiche' ? r.nom : `base/${r.nom}`} : ${p.formes} forme(s), ${p.balisees} balisée(s), `
        + `${p.locutions} en locution, ${p.ciblesDeLien} en cible de lien, ${p.nonBalisees.length} non balisée(s), `
        + `${p.aVerifier.length} à vérifier${p.exclusions.length ? ` ; exclusions : ${p.exclusions.join(', ')}` : ''}`);
    }
    console.log(`[prebaliser] ${rs.length} fichier(s) écrit(s) ; rendu par défaut identique à l'origine (I10) et balises valides (I11) : OK`);
  } catch (err) {
    console.error(`[prebaliser] refus : ${err.message}`);
    process.exit(1);
  }
}
