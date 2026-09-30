// FICHIER GÉNÉRÉ — ne pas éditer, source : frontend src/vocab
// (src/vocab/vocab.ts + src/vocab/rendre.ts). Pour modifier le moteur : éditer la source dans le
// dépôt frontend, puis lancer `node scripts/sync-vocab-back.mjs` depuis ce dépôt frontend.
// Exports : vocabDefaut, creerVocab, resoudreLexique, completerLexique, vocabDuLexique, rendre, rendreTout, balisesInvalides.
'use strict';

const __modules = {
  './rendre.ts': function (exports, require) {
"use strict";
// Balises de vocabulaire (lot 2, spec §2.2) : `[[méthode:clé(:arg)*]]`.
// `rendre(voc, texte)` remplace chaque balise par l'appel `voc.méthode('clé', …)`, en UNE
// seule passe (le texte rendu n'est jamais relu). Usages : gabarits du lexique, fr.json,
// messages du serveur, manuel.
//
// Grammaire stricte : \[\[([A-Za-z]+):([a-z0-9_]+)((?::[^\[\]|:\n]*)*)\]\]
// Arguments :
//   - `pl` ou un nombre entier → n ;
//   - `Nom`, `Titre` (et `nom`, `court`, `Court`) → casse du nom, pour les méthodes à déterminant ;
//   - `les`, `vos`, `ces`, `mes` → déterminant de `tous` / `Tous` ; `nu` → sans déterminant
//     (« [[Tous:prestataire:nu]] » = « Tous prestataires », comme `voc.Tous('prestataire', '')`) ;
//   - `acc` : [[acc:clé:masc:fem]] ou [[acc:clé:masc:fem:pl]] (masc et fem peuvent être vides) ;
//   - `n` : [[n:clé:3]] ;
//   - `det` / `Det` : [[det:clé:du]], [[det:clé:le:pl]], [[det:clé:le:court]] — le déterminant seul, suivi de
//     son séparateur (« du␣ », « de l' ») : « [[det:stock:du]]**[[nom:stock]]** » ;
//   - `ex` : [[ex:clé:texte par défaut]] — exemple de saisie : le texte par défaut (l'exemple d'origine) si le
//     lexique du compte est le lexique par défaut, sinon « Nom(clé) A » ; c'est l'appel
//     voc.ex('texte par défaut', `${voc.Nom('clé')} A`). Un seul argument, non vide (sans « : », « | » ni crochet).
// Balise invalide (méthode inconnue, argument non reconnu, en double ou en trop, texte entre
// [[ ]] hors grammaire) → laissée telle quelle et signalée.
//
// SOURCE UNIQUE : recopié dans le backend (`src/utils/vocab.js`). Module PUR.
Object.defineProperty(exports, "__esModule", { value: true });
exports.rendre = rendre;
exports.rendreTout = rendreTout;
exports.balisesInvalides = balisesInvalides;
// Tout ce qui ressemble à une balise (pour signaler aussi ce qui sort de la grammaire).
const CANDIDATE = /\[\[([^[\]\n]*)\]\]/g;
const STRICTE = /^([A-Za-z]+):([a-z0-9_]+)((?::[^[\]|:\n]*)*)$/;
// Méthodes appelables par balise, par forme d'arguments.
const SANS_ARGUMENT = new Set(['pl', 'Pl', 'nomS', 'NomS', 'icon']);
const AVEC_NOMBRE = new Set(['nom', 'Nom', 'Titre', 'MAJ', 'court', 'Court', 'compl', 'avecCourt']);
const AVEC_NOMBRE_ET_CASSE = new Set([
    'le', 'Le', 'un', 'Un', 'du', 'Du', 'de', 'De', 'au', 'Au', 'ce', 'Ce',
    'votre', 'Votre', 'mon', 'Mon', 'son', 'Son', 'nouveau', 'Nouveau',
]);
const AVEC_CASSE = new Set(['aucun', 'Aucun']);
const TOUS = new Set(['tous', 'Tous']);
const DET_SEUL = new Set(['det', 'Det']);
const CASSES = new Set(['nom', 'Nom', 'Titre', 'court', 'Court']);
const DETS_TOUS = new Set(['les', 'vos', 'ces', 'mes', 'nu']);
// Mot-clé de balise pour le déterminant vide de `tous` (un argument vide n'est pas admis par la grammaire).
const DET_NU = 'nu';
const NOMS_DETERMINANTS = new Set(['le', 'un', 'du', 'de', 'au', 'ce', 'aucun', 'votre', 'mon', 'son', 'nouveau']);
const ENTIER = /^\d+$/;
const nombre = (arg) => arg === 'pl' ? true : ENTIER.test(arg) ? Number(arg) : undefined;
// Rend une balise ; renvoie la raison du refus si elle est invalide.
const rendreBalise = (voc, contenu) => {
    const m = STRICTE.exec(contenu);
    if (!m)
        return { raison: 'hors grammaire' };
    const [, methode, cle, suite] = m;
    const args = suite ? suite.slice(1).split(':') : [];
    const appel = (...a) => ({ texte: String(voc[methode](cle, ...a)) });
    if (SANS_ARGUMENT.has(methode)) {
        return args.length ? { raison: `« ${methode} » ne prend pas d'argument` } : appel();
    }
    if (methode === 'acc') {
        if (args.length < 2 || args.length > 3)
            return { raison: '« acc » attend masc:fem ou masc:fem:pl' };
        if (args.length === 2)
            return appel(args[0], args[1]);
        const n = nombre(args[2]);
        return n === undefined ? { raison: `nombre non reconnu « ${args[2]} »` } : appel(args[0], args[1], n);
    }
    if (methode === 'ex') {
        if (args.length !== 1 || !args[0].trim())
            return { raison: '« ex » attend le texte par défaut (un seul argument, non vide)' };
        const v = voc;
        return { texte: String(v.ex(args[0], `${String(v.Nom(cle))} A`)) };
    }
    if (methode === 'n') {
        return args.length === 1 && ENTIER.test(args[0]) ? appel(Number(args[0])) : { raison: '« n » attend un nombre entier' };
    }
    if (DET_SEUL.has(methode)) {
        if (!args.length || !NOMS_DETERMINANTS.has(args[0])) {
            return { raison: `« ${methode} » attend un déterminant (${[...NOMS_DETERMINANTS].join(', ')})` };
        }
        let nDet;
        let cDet;
        for (const arg of args.slice(1)) {
            const valeur = nombre(arg);
            if (valeur !== undefined && nDet === undefined)
                nDet = valeur;
            else if (CASSES.has(arg) && cDet === undefined)
                cDet = arg;
            else
                return { raison: `argument non reconnu « ${arg} »` };
        }
        return appel(args[0], nDet, cDet);
    }
    const prendNombre = AVEC_NOMBRE.has(methode) || AVEC_NOMBRE_ET_CASSE.has(methode);
    const prendCasse = AVEC_NOMBRE_ET_CASSE.has(methode) || AVEC_CASSE.has(methode) || TOUS.has(methode);
    const prendDet = TOUS.has(methode);
    if (!prendNombre && !prendCasse)
        return { raison: `méthode inconnue « ${methode} »` };
    let n;
    let c;
    let d;
    for (const arg of args) {
        const valeur = nombre(arg);
        if (prendNombre && valeur !== undefined && n === undefined)
            n = valeur;
        else if (prendCasse && CASSES.has(arg) && c === undefined)
            c = arg;
        else if (prendDet && DETS_TOUS.has(arg) && d === undefined)
            d = arg === DET_NU ? '' : arg;
        else
            return { raison: `argument non reconnu « ${arg} »` };
    }
    if (TOUS.has(methode))
        return appel(d, c);
    if (AVEC_CASSE.has(methode))
        return appel(c);
    return appel(n, c);
};
const signalParDefaut = (balise, raison) => {
    console.warn(`[vocab] balise invalide ${balise} : ${raison}`);
};
/**
 * Rend les balises `[[…]]` de `texte` avec le vocabulaire `voc`. Une seule passe.
 * Une balise invalide reste telle quelle et est signalée (`signaler`, par défaut console.warn).
 * Une valeur qui n'est pas une chaîne est renvoyée inchangée.
 */
function rendre(voc, texte, signaler = signalParDefaut) {
    if (typeof texte !== 'string' || texte.indexOf('[[') === -1)
        return texte;
    return texte.replace(CANDIDATE, (balise, contenu) => {
        const r = rendreBalise(voc, contenu);
        if ('texte' in r)
            return r.texte;
        signaler(balise, r.raison);
        return balise;
    });
}
/** Rend toutes les chaînes d'un arbre (objets, tableaux) : le paquet de ressources `fr.json`. */
function rendreTout(objet, voc, signaler = signalParDefaut) {
    const parcours = (v) => {
        if (typeof v === 'string')
            return rendre(voc, v, signaler);
        if (Array.isArray(v))
            return v.map(parcours);
        if (v && typeof v === 'object') {
            const out = {};
            for (const [k, x] of Object.entries(v))
                out[k] = parcours(x);
            return out;
        }
        return v;
    };
    return parcours(objet);
}
/** Balises invalides d'un texte (validation avant enregistrement) : `[{ balise, raison }]`. */
function balisesInvalides(texte) {
    const invalides = [];
    if (typeof texte !== 'string')
        return invalides;
    const muet = new Proxy({}, { get: () => () => '' });
    rendre(muet, texte, (balise, raison) => invalides.push({ balise, raison }));
    return invalides;
}
  },
  './vocab.ts': function (exports, require) {
"use strict";
// Moteur de vocabulaire (lot 2, spec §2.1) — UNE seule grammaire pour tout le produit.
// `creerVocab(lexique)` rend les termes du domaine du compte avec leurs accords
// (article, élision, genre, nombre, casse). Avec le lexique par défaut, chaque forme
// rendue est celle de l'application d'origine (restauration).
//
// SOURCE UNIQUE : ce fichier est recopié dans le backend (`src/utils/vocab.js`) par
// `node scripts/sync-vocab-back.mjs`. Module PUR : aucun import d'exécution hors `./`,
// syntaxe TypeScript effaçable uniquement (Node l'exécute tel quel).
//
// Arguments communs :
//   k : clé du lexique (littérale) ;
//   n : nombre (pluriel si n >= 2) ou booléen (true = pluriel) ou absent (singulier) ;
//   c : casse du nom — 'nom' (défaut, minuscules) | 'Nom' (forme stockée) | 'Titre' ;
//       'court' | 'Court' : même chose sur la forme courte (« d'appro », « l'Appro »).
// Exemples de saisie : `voc.ex(parDefaut, sinon)` rend l'exemple d'origine tant que le lexique du compte est
// le lexique par défaut (`voc.estDefaut`), et l'exemple neutre construit pour les autres domaines.
// Apostrophe droite. Clé inconnue → « ‹clé› » + console.warn, jamais d'exception.
Object.defineProperty(exports, "__esModule", { value: true });
exports.vocabDefaut = void 0;
exports.creerVocab = creerVocab;
exports.resoudreLexique = resoudreLexique;
exports.completerLexique = completerLexique;
exports.vocabDuLexique = vocabDuLexique;
const lexiqueDefaut_ts_1 = require("./lexiqueDefaut.ts");
const rendre_ts_1 = require("./rendre.ts");
// ── Casse ────────────────────────────────────────────────────────────────────
// Mot-sigle : 2 majuscules en tête, ou majuscule + chiffre (« PT », « B2B », « FCR »).
const SIGLE = /^(?:\p{Lu}{2}|\p{Lu}\d)/u;
// Un « mot » pour la mise en minuscules : tout ce qui n'est ni blanc, ni tiret, ni apostrophe, ni barre.
const MOT = /[^\s\-'’/]+/g;
// Mots-outils laissés en minuscules par Titre (sauf en tête).
const MOTS_OUTILS = new Set([
    'de', 'du', 'des', 'la', 'le', 'les', 'et', 'à', 'au', 'aux', 'en',
    'par', 'pour', 'sur', 'sans', 'avec', 'ou', 'un', 'une',
]);
const ELIDE = /^([dl])(['’])(.+)$/i;
const majuscule = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const minuscules = (forme) => forme.replace(MOT, (mot) => (SIGLE.test(mot) ? mot : mot.charAt(0).toLowerCase() + mot.slice(1)));
const titre = (forme) => forme
    .split(' ')
    .map((mot, i) => {
    if (!mot)
        return mot;
    const bas = mot.toLowerCase();
    if (i > 0 && MOTS_OUTILS.has(bas))
        return bas;
    const elide = ELIDE.exec(mot);
    if (elide) {
        const tete = i > 0 ? elide[1].toLowerCase() : elide[1].toUpperCase();
        return tete + elide[2] + majuscule(elide[3]);
    }
    return majuscule(mot);
})
    .join(' ');
const objet = (v) => v && typeof v === 'object' && !Array.isArray(v) ? v : {};
const texte = (v) => (typeof v === 'string' ? v : '');
const aUnSg = (v) => texte(objet(v).sg).trim() !== '';
// Copie d'une entrée (forme courte comprise) : jamais d'objet partagé avec le défaut gelé.
const copier = (e) => (e.court && typeof e.court === 'object' ? { ...e, court: { ...e.court } } : { ...e });
// Entrée incomplète tolérée : pl = sg, g = 'm', el = false ; forme courte absente → sg / pl.
const normaliser = (brut) => {
    const e = objet(brut);
    const sg = texte(e.sg);
    if (!sg.trim())
        return null;
    const pl = texte(e.pl) || sg;
    const el = e.el === true;
    const c = objet(e.court);
    const courtSg = texte(c.sg);
    return {
        sg,
        pl,
        g: e.g === 'f' ? 'f' : 'm',
        el,
        icon: texte(e.icon),
        appo: e.appo === true,
        courtSg: courtSg || sg,
        courtPl: courtSg ? texte(c.pl) || courtSg : pl,
        courtEl: courtSg && typeof c.el === 'boolean' ? c.el : el,
        inconnue: false,
    };
};
const entreeInconnue = (k) => {
    const forme = `‹${k}›`;
    return { sg: forme, pl: forme, g: 'm', el: false, icon: '', appo: false, courtSg: forme, courtPl: forme, courtEl: false, inconnue: true };
};
const estPluriel = (n) => (typeof n === 'boolean' ? n : Number(n) >= 2);
const estCourte = (c) => c === 'court' || c === 'Court';
// Forme du nom dans la casse demandée.
const forme = (e, pluriel, c) => {
    const base = estCourte(c) ? (pluriel ? e.courtPl : e.courtSg) : pluriel ? e.pl : e.sg;
    if (e.inconnue)
        return base;
    if (c === 'Nom' || c === 'Court')
        return base;
    if (c === 'Titre')
        return titre(base);
    return minuscules(base);
};
const det = (m, f, me, fe, pm, pf = pm, pe) => ({ m, f, me, fe, pm, pf, pe });
const DETERMINANTS = {
    le: det('le', 'la', "l'", "l'", 'les'),
    un: det('un', 'une', 'un', 'une', 'des'),
    du: det('du', 'de la', "de l'", "de l'", 'des'),
    de: det('de', 'de', "d'", "d'", 'de', 'de', "d'"),
    au: det('au', 'à la', "à l'", "à l'", 'aux'),
    ce: det('ce', 'cette', 'cet', 'cette', 'ces'),
    aucun: det('aucun', 'aucune', 'aucun', 'aucune', 'aucun', 'aucune'),
    votre: det('votre', 'votre', 'votre', 'votre', 'vos'),
    mon: det('mon', 'ma', 'mon', 'mon', 'mes'),
    son: det('son', 'sa', 'son', 'son', 'ses'),
    nouveau: det('nouveau', 'nouvelle', 'nouvel', 'nouvelle', 'nouveaux', 'nouvelles'),
};
const coller = (d, nom) => (d.endsWith("'") ? d + nom : `${d} ${nom}`);
// Forme du déterminant devant le nom de l'entrée (genre, nombre, élision de la forme longue ou courte).
const formeDeterminant = (d, e, pluriel, c) => {
    const el = estCourte(c) ? e.courtEl : e.el;
    if (pluriel)
        return (el && d.pe) || (e.g === 'f' ? d.pf : d.pm);
    if (e.g === 'f')
        return el ? d.fe : d.f;
    return el ? d.me : d.m;
};
const avecDeterminant = (d, e, pluriel, c) => coller(formeDeterminant(d, e, pluriel, c), forme(e, pluriel, c));
// Déterminant seul, prêt à recevoir le nom : une espace le suit, sauf après une apostrophe.
const determinantSeul = (d, e, pluriel, c) => {
    const f = formeDeterminant(d, e, pluriel, c);
    return f.endsWith("'") ? f : `${f} `;
};
// Forme accordée (masculin ou féminin) ; au pluriel ajoute « s » sauf finale s, x, z.
const accorder = (feminin, masc, fem, n) => {
    const accorde = String((feminin ? fem : masc) ?? '');
    return estPluriel(n) && !/[sxz]$/i.test(accorde) ? `${accorde}s` : accorde;
};
// Pluriel typographique mot à mot (« produit(s) vendable(s) ») ; irrégulier → « sg/pl ».
const plurielTypographique = (sg, pl) => {
    if (sg === pl)
        return sg;
    const ms = sg.split(' ');
    const mp = pl.split(' ');
    if (ms.length !== mp.length)
        return `${sg}/${pl}`;
    const mots = [];
    for (let i = 0; i < ms.length; i += 1) {
        if (mp[i] === ms[i])
            mots.push(ms[i]);
        else if (ms[i] && mp[i].startsWith(ms[i]))
            mots.push(`${ms[i]}(${mp[i].slice(ms[i].length)})`);
        else
            return `${sg}/${pl}`;
    }
    return mots.join(' ');
};
// ── Le moteur ────────────────────────────────────────────────────────────────
// `estDefaut` : le lexique est-il celui par défaut ? Décidé par l'appelant (creerVocab) ; un mini-vocabulaire
// (voc.avec) hérite de celui du vocabulaire qui le crée.
function construire(lexique, estDefaut = false) {
    const source = objet(lexique);
    const table = new Map();
    for (const k of Object.keys(source)) {
        const e = normaliser(source[k]);
        if (e)
            table.set(k, e);
    }
    const signalees = new Set();
    const entree = (k) => {
        const cle = String(k);
        const e = table.get(cle);
        if (e)
            return e;
        if (!signalees.has(cle)) {
            signalees.add(cle);
            console.warn(`[vocab] clé de lexique inconnue : « ${cle} »`);
        }
        return entreeInconnue(cle);
    };
    const determine = (d) => (k, n, c) => avecDeterminant(d, entree(k), estPluriel(n), c);
    const Determine = (d) => (k, n, c) => majuscule(avecDeterminant(d, entree(k), estPluriel(n), c));
    const tous = (k, d = 'les', c) => {
        const e = entree(k);
        const quantifieur = e.g === 'f' ? 'toutes' : 'tous';
        const nom = forme(e, true, c);
        return d ? `${quantifieur} ${d} ${nom}` : `${quantifieur} ${nom}`;
    };
    const seul = (k, d, n, c) => {
        const nomDet = String(d);
        if (!Object.prototype.hasOwnProperty.call(DETERMINANTS, nomDet)) {
            if (!signalees.has(`det:${nomDet}`)) {
                signalees.add(`det:${nomDet}`);
                console.warn(`[vocab] déterminant inconnu : « ${nomDet} »`);
            }
            return '';
        }
        return determinantSeul(DETERMINANTS[nomDet], entree(k), estPluriel(n), c);
    };
    const voc = {
        nom: (k, n) => forme(entree(k), estPluriel(n), 'nom'),
        Nom: (k, n) => forme(entree(k), estPluriel(n), 'Nom'),
        Titre: (k, n) => forme(entree(k), estPluriel(n), 'Titre'),
        MAJ: (k, n, c) => {
            const e = entree(k);
            const stockee = forme(e, estPluriel(n), estCourte(c) ? 'Court' : 'Nom');
            return e.inconnue ? stockee : stockee.toUpperCase();
        },
        pl: (k) => forme(entree(k), true, 'nom'),
        Pl: (k) => forme(entree(k), true, 'Nom'),
        court: (k, n) => forme(entree(k), estPluriel(n), 'court'),
        Court: (k, n) => forme(entree(k), estPluriel(n), 'Court'),
        nomS: (k, c) => {
            const e = entree(k);
            if (e.inconnue)
                return e.sg;
            return minuscules(estCourte(c) ? plurielTypographique(e.courtSg, e.courtPl) : plurielTypographique(e.sg, e.pl));
        },
        NomS: (k, c) => {
            const e = entree(k);
            return estCourte(c) ? plurielTypographique(e.courtSg, e.courtPl) : plurielTypographique(e.sg, e.pl);
        },
        n: (k, n) => `${String(n)} ${forme(entree(k), estPluriel(n), 'nom')}`,
        compl: (k, n) => {
            const e = entree(k);
            const pluriel = estPluriel(n);
            return e.appo ? forme(e, pluriel, 'nom') : avecDeterminant(DETERMINANTS.du, e, pluriel, 'nom');
        },
        avecCourt: (k, n) => {
            const e = entree(k);
            const pluriel = estPluriel(n);
            const long = forme(e, pluriel, 'nom');
            const court = forme(e, pluriel, 'court');
            return (pluriel ? e.pl === e.courtPl : e.sg === e.courtSg) ? long : `${long} (${court})`;
        },
        le: determine(DETERMINANTS.le),
        Le: Determine(DETERMINANTS.le),
        un: determine(DETERMINANTS.un),
        Un: Determine(DETERMINANTS.un),
        du: determine(DETERMINANTS.du),
        Du: Determine(DETERMINANTS.du),
        de: determine(DETERMINANTS.de),
        De: Determine(DETERMINANTS.de),
        au: determine(DETERMINANTS.au),
        Au: Determine(DETERMINANTS.au),
        ce: determine(DETERMINANTS.ce),
        Ce: Determine(DETERMINANTS.ce),
        aucun: (k, c) => avecDeterminant(DETERMINANTS.aucun, entree(k), false, c),
        Aucun: (k, c) => majuscule(avecDeterminant(DETERMINANTS.aucun, entree(k), false, c)),
        votre: determine(DETERMINANTS.votre),
        Votre: Determine(DETERMINANTS.votre),
        mon: determine(DETERMINANTS.mon),
        Mon: Determine(DETERMINANTS.mon),
        son: determine(DETERMINANTS.son),
        Son: Determine(DETERMINANTS.son),
        nouveau: determine(DETERMINANTS.nouveau),
        Nouveau: Determine(DETERMINANTS.nouveau),
        tous,
        Tous: (k, d, c) => majuscule(tous(k, d, c)),
        det: seul,
        Det: (k, d, n, c) => majuscule(seul(k, d, n, c)),
        acc: (k, masc, fem, n) => accorder(entree(k).g === 'f', masc, fem, n),
        accN: (cles, masc, fem, n) => {
            const liste = Array.isArray(cles) ? cles : [cles];
            return accorder(liste.length > 0 && liste.every((k) => entree(k).g === 'f'), masc, fem, n);
        },
        g: (k) => entree(k).g,
        icon: (k) => entree(k).icon,
        estDefaut,
        ex: (parDefaut, sinon) => String((estDefaut ? parDefaut : sinon) ?? ''),
        avec: (e) => construire({ _: e }, estDefaut),
    };
    return Object.freeze(voc);
}
// Deux lexiques donnent-ils les mêmes rendus ? (formes, genre, élision, icône, forme courte, apposition)
const memesRendus = (a, b) => {
    const ka = Object.keys(a);
    if (ka.length !== Object.keys(b).length)
        return false;
    return ka.every((k) => JSON.stringify(normaliser(a[k])) === JSON.stringify(normaliser(b[k])));
};
/**
 * Vocabulaire d'un lexique RÉSOLU (toutes les clés présentes ; entrées incomplètes tolérées).
 * `voc.estDefaut` est vrai si ce lexique donne les mêmes rendus que le lexique par défaut.
 */
function creerVocab(lexique) {
    return construire(lexique, memesRendus(objet(lexique), lexiqueDefaut_ts_1.LEXIQUE_DEFAUT));
}
/** Vocabulaire du lexique par défaut (restauration) : admin, boss, non connecté. */
exports.vocabDefaut = creerVocab(lexiqueDefaut_ts_1.LEXIQUE_DEFAUT);
// ── Résolution d'un lexique de domaine (spec §1.3) ───────────────────────────
const CHAMPS_LIBRES = ['pl', 'g', 'el', 'icon', 'court', 'appo'];
const formeCourte = (v) => {
    const c = objet(v);
    const sg = texte(c.sg);
    if (!sg.trim())
        return undefined;
    const court = { sg, pl: texte(c.pl) || sg };
    if (typeof c.el === 'boolean')
        court.el = c.el;
    return court;
};
// Pluriel d'une entrée rendue par gabarit : les mots littéraux de tête prennent le pluriel
// du défaut (« Espace Services » → « Espaces Services », comme « Espace Activités » → « Espaces Activités »).
const plurielGabarit = (rendu, sgDefaut, plDefaut) => {
    let commun = 0;
    while (commun < sgDefaut.length && commun < plDefaut.length
        && sgDefaut[sgDefaut.length - 1 - commun] === plDefaut[plDefaut.length - 1 - commun])
        commun += 1;
    const teteSg = sgDefaut.slice(0, sgDefaut.length - commun);
    const tetePl = plDefaut.slice(0, plDefaut.length - commun);
    return teteSg && rendu.startsWith(teteSg) ? tetePl + rendu.slice(teteSg.length) : rendu;
};
/**
 * Lexique résolu d'un domaine = défaut + écarts du domaine.
 * - Clé simple : si le domaine surcharge `sg`, l'entrée est celle du domaine (pl = sg, g = 'm',
 *   el = false à défaut ; ni `court` ni `appo` hérités du défaut) ; sinon fusion champ par champ.
 * - Clé dérivée K de parent P : (1) le domaine surcharge K → entrée de K ; (2) sinon, si le
 *   domaine surcharge P : 'copie' → entrée entière de P ; 'pluriel_titre' → sg = pl = Titre(P.pl),
 *   genre et élision de P ; 'gabarit' → gabarit rendu avec le lexique résolu, genre 'm' ;
 *   (3) sinon défaut de K.
 *   « Le domaine surcharge P » = les formes RÉSOLUES de P diffèrent de celles du défaut (formes
 *   longues sg / pl pour 'copie' et 'pluriel_titre' ; longues ou courtes pour 'gabarit') : une
 *   entrée redéclarée à l'identique du défaut ne détache pas ses clés dérivées.
 * - `derive_de`, `mode`, `gabarit` viennent toujours du défaut.
 * - Clés inconnues du défaut : conservées telles quelles.
 */
function resoudreLexique(defaut, ecarts) {
    const ov = objet(ecarts);
    const out = {};
    const meta = (d) => {
        const m = {};
        if (d.derive_de)
            m.derive_de = d.derive_de;
        if (d.mode)
            m.mode = d.mode;
        if (d.gabarit)
            m.gabarit = d.gabarit;
        return m;
    };
    // Entrée d'une clé d'après le défaut et l'écart du domaine (sans dérivation).
    const fusion = (k) => {
        const d = defaut[k];
        const e = objet(ov[k]);
        if (aUnSg(e)) {
            const sg = texte(e.sg);
            const r = { sg, pl: texte(e.pl) || sg, g: e.g === 'f' ? 'f' : 'm', el: e.el === true };
            const icon = texte(e.icon) || d.icon;
            if (icon)
                r.icon = icon;
            const court = formeCourte(e.court);
            if (court)
                r.court = court;
            if (e.appo === true)
                r.appo = true;
            return { ...r, ...meta(d) };
        }
        const r = copier(d);
        for (const champ of CHAMPS_LIBRES) {
            if (e[champ] == null)
                continue;
            if (champ === 'court') {
                const court = formeCourte(e.court);
                if (court)
                    r.court = court;
            }
            else if (champ === 'g') {
                if (e.g === 'm' || e.g === 'f')
                    r.g = e.g;
            }
            else if (champ === 'el' || champ === 'appo') {
                if (typeof e[champ] === 'boolean')
                    r[champ] = e[champ];
            }
            else if (typeof e[champ] === 'string' && e[champ]) {
                r[champ] = e[champ];
            }
        }
        return r;
    };
    const cles = Object.keys(defaut);
    // 1. Clés simples.
    for (const k of cles)
        if (!defaut[k].derive_de)
            out[k] = fusion(k);
    // Formes d'une entrée : longues (sg, pl), et courtes en plus pour les gabarits.
    const longues = (e) => (e ? `${e.sg}\n${e.pl || e.sg}` : '');
    const formes = (e) => e ? [e.sg, e.pl, e.court?.sg, e.court?.pl].map((f) => f ?? '').join('\n') : '';
    // 2. Clés dérivées par copie ou pluriel_titre (leur parent est une clé simple).
    const iconDe = (k) => texte(objet(ov[k]).icon) || texte(defaut[k].icon);
    for (const k of cles) {
        const d = defaut[k];
        if (!d.derive_de || d.mode === 'gabarit')
            continue;
        const p = out[d.derive_de];
        if (aUnSg(ov[k]) || !p || longues(p) === longues(defaut[d.derive_de])) {
            out[k] = fusion(k);
            continue;
        }
        const icon = iconDe(k) || texte(p.icon);
        if (d.mode === 'pluriel_titre') {
            const t = titre(p.pl || p.sg);
            out[k] = { sg: t, pl: t, g: p.g === 'f' ? 'f' : 'm', el: p.el === true, ...(icon ? { icon } : {}), ...meta(d) };
        }
        else {
            out[k] = { ...copier(p), ...(icon ? { icon } : {}), ...meta(d) };
        }
    }
    // 3. Clés dérivées par gabarit : rendues avec le lexique résolu du domaine.
    const gabarits = cles.filter((k) => defaut[k].derive_de && defaut[k].mode === 'gabarit');
    for (const k of gabarits)
        out[k] = fusion(k);
    const vocDomaine = construire(out);
    for (const k of gabarits) {
        const d = defaut[k];
        const parent = d.derive_de;
        if (aUnSg(ov[k]) || !d.gabarit || formes(out[parent]) === formes(defaut[parent]))
            continue;
        const sg = (0, rendre_ts_1.rendre)(vocDomaine, d.gabarit);
        const icon = iconDe(k);
        out[k] = {
            sg,
            pl: plurielGabarit(sg, d.sg, d.pl || d.sg),
            g: 'm',
            el: d.el === true,
            ...(icon ? { icon } : {}),
            ...meta(d),
        };
    }
    // 4. Ordre des clés du défaut, puis clés inconnues (ajoutées par l'admin), conservées telles quelles.
    const resolu = {};
    for (const k of cles)
        resolu[k] = out[k];
    for (const k of Object.keys(ov)) {
        if (!(k in resolu) && ov[k] && typeof ov[k] === 'object')
            resolu[k] = copier(ov[k]);
    }
    return resolu;
}
// ── Lexique reçu du serveur ──────────────────────────────────────────────────
/**
 * Lexique reçu du serveur, prêt pour `creerVocab`.
 * - Lexique COMPLET (toutes les clés du défaut, chacune avec son `sg`) : il a été résolu par un
 *   serveur du lot 2 — chaque entrée est gardée TELLE QUELLE, pour que l'écran rende exactement
 *   ce que rend le serveur (une entrée redéclarée avec le `sg` du défaut mais sans forme courte
 *   n'a pas de forme courte, d'un côté comme de l'autre).
 * - Lexique INCOMPLET (serveur d'avant le lot 2 pendant un déploiement, lexique partiel) : complété
 *   clé par clé avec le défaut local — clé absente ou sans `sg` → entrée par défaut ; entrée dont
 *   le `sg` est celui du défaut → ses champs manquants (court, appo, …) viennent du défaut ; une
 *   entrée surchargée est gardée telle quelle.
 */
function completerLexique(defaut, recu) {
    const src = objet(recu);
    const out = {};
    const complet = Object.keys(defaut).every((k) => aUnSg(src[k]));
    for (const k of Object.keys(defaut)) {
        const e = src[k];
        if (!aUnSg(e))
            out[k] = copier(defaut[k]);
        else if (!complet && texte(objet(e).sg) === defaut[k].sg)
            out[k] = copier({ ...defaut[k], ...e });
        else
            out[k] = copier(e);
    }
    for (const k of Object.keys(src)) {
        if (!(k in out) && aUnSg(src[k]))
            out[k] = copier(src[k]);
    }
    return out;
}
/**
 * Vocabulaire du lexique reçu du serveur (`user.domaine.lexique`), complété par le défaut.
 * Absent, ou équivalent au défaut → `vocabDefaut` lui-même (même objet : rien ne se re-rend).
 */
function vocabDuLexique(recu) {
    if (!recu || typeof recu !== 'object')
        return exports.vocabDefaut;
    const complet = completerLexique(lexiqueDefaut_ts_1.LEXIQUE_DEFAUT, recu);
    return memesRendus(complet, lexiqueDefaut_ts_1.LEXIQUE_DEFAUT) ? exports.vocabDefaut : creerVocab(complet);
}
  },
};

const __cache = {};
function __require(id) {
  if (id === './lexiqueDefaut.ts') return require('../config/lexiqueDefaut');
  if (__cache[id]) return __cache[id];
  if (!__modules[id]) throw new Error('vocab.js : module inconnu ' + id);
  const exports = {};
  __cache[id] = exports;
  __modules[id](exports, __require);
  return exports;
}

module.exports = { ...__require('./vocab.ts'), ...__require('./rendre.ts') };
