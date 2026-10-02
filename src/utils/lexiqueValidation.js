// Validation et nettoyage des ÉCARTS de lexique d'un domaine avant enregistrement
// (lot 2, spec §1.4 — PUT /api/domaines/:id). Module PUR : ni base ni requête.
//
//   validerLexique(lex)  → null si valide, sinon { code, message, cle?, champ? }
//   nettoyerLexique(lex) → écarts prêts à stocker (champs vides retirés, textes rognés,
//                          entrées identiques au défaut retirées)
//
// Règles :
//   • une entrée est un objet { sg?, pl?, g?, el?, icon?, court?: { sg, pl?, el? }, appo? } ;
//   • si `sg` est surchargé : `pl`, `g` et `el` sont OBLIGATOIRES (plus de fusion bancale
//     « sg du domaine + pluriel et genre du défaut ») ;
//   • une clé inconnue du lexique par défaut n'a pas de défaut : `sg` y est obligatoire ;
//   • une clé DÉRIVÉE (derive_de) suit son parent tant qu'elle n'a pas son propre `sg` : sans
//     `sg`, elle ne peut porter qu'une icône (un pluriel ou un genre seuls seraient perdus en
//     silence dès que le parent est surchargé) ;
//   • `derive_de`, `mode`, `gabarit` viennent du lexique par défaut, jamais d'un domaine ;
//   • `sg`, `pl`, la forme courte et l'icône ne contiennent ni [ ] | * \ ` { } $ < > ni retour à
//     la ligne, tabulation ou autre caractère de contrôle (caractères des balises [[…]], du Markdown
//     du manuel, des noms d'onglets Excel, de l'interpolation i18next {{…}} / $t(…) et, lot 2b
//     §4.4, du HTML des emails : un terme y est écrit sans échappement — il ne va jamais dans un
//     attribut HTML ; « & » et « " » restent admis) ;
//   • longueurs : 60 caractères pour sg / pl, 20 pour la forme courte, 8 pour l'icône ;
//   • les noms d'Object.prototype (constructor, __proto__) et « prototype » ne sont pas des clés.
const { LEXIQUE_DEFAUT } = require('../config/lexiqueDefaut');

const CLE_RE = /^[a-z0-9_]{1,40}$/;
const CHAMPS = Object.freeze(['sg', 'pl', 'g', 'el', 'icon', 'court', 'appo']);
const CHAMPS_COURT = Object.freeze(['sg', 'pl', 'el']);
const CHAMPS_NON_SURCHARGEABLES = Object.freeze(['derive_de', 'mode', 'gabarit']);
// [ ] | * \ ` { } $ < >, caractères de contrôle (U+0000 à U+001F, U+007F, U+0085) et séparateurs de
// ligne Unicode (U+2028, U+2029). « < » et « > » : lot 2b, spec §4.4 (code LEXIQUE_CARACTERE_INTERDIT).
const INTERDITS_RE = /[[\]|*\\`{}$<>\u0000-\u001F\u007F\u0085\u{2028}\u{2029}]/u;
// Nom lisible d'un caractère refusé, par point de code (les autres sont cités tels quels, ou par « U+XXXX »).
const NOM_CARACTERE = new Map([
  [0x0a, 'retour à la ligne'], [0x0d, 'retour à la ligne'], [0x85, 'retour à la ligne'],
  [0x2028, 'retour à la ligne'], [0x2029, 'retour à la ligne'], [0x09, 'tabulation'],
]);
const REFUSES = '[ ] | * \\ ` { } $ < >, le retour à la ligne, la tabulation et les caractères de contrôle';
const LONGUEUR_MAX = Object.freeze({ sg: 60, pl: 60, 'court.sg': 20, 'court.pl': 20, icon: 8 });

const CODES = Object.freeze({
  INVALIDE: 'LEXIQUE_INVALIDE',
  INCOMPLET: 'LEXIQUE_ENTREE_INCOMPLETE',
  NON_SURCHARGEABLE: 'LEXIQUE_CHAMP_NON_SURCHARGEABLE',
  CARACTERE: 'LEXIQUE_CARACTERE_INTERDIT',
  LONGUEUR: 'LEXIQUE_TROP_LONG',
});

const estObjet = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const rempli = (v) => typeof v === 'string' && v.trim() !== '';
const connue = (cle) => Object.prototype.hasOwnProperty.call(LEXIQUE_DEFAUT, cle);
const erreur = (code, message, cle, champ) => ({ code, message, ...(cle ? { cle } : {}), ...(champ ? { champ } : {}) });

const LIBELLES = Object.freeze({
  sg: 'le singulier', pl: 'le pluriel',
  'court.sg': 'la forme courte (singulier)', 'court.pl': 'la forme courte (pluriel)',
  icon: "l'icône",
});

const caractereInterdit = (texte) => {
  const m = INTERDITS_RE.exec(texte);
  if (!m) return null;
  const code = m[0].codePointAt(0);
  if (NOM_CARACTERE.has(code)) return NOM_CARACTERE.get(code);
  return code < 0x20 || code === 0x7f ? `caractère de contrôle U+${code.toString(16).toUpperCase().padStart(4, '0')}` : `« ${m[0]} »`;
};

const validerTexte = (cle, champ, valeur) => {
  if (valeur == null) return null;
  if (typeof valeur !== 'string') return erreur(CODES.INVALIDE, `Lexique « ${cle} » : ${LIBELLES[champ]} doit être un texte.`, cle, champ);
  const interdit = caractereInterdit(valeur);
  if (interdit) {
    return erreur(
      CODES.CARACTERE,
      `Lexique « ${cle} » : ${LIBELLES[champ]} contient un caractère interdit (${interdit}). Caractères refusés : ${REFUSES}.`,
      cle, champ
    );
  }
  const longueur = valeur.trim().length;
  if (longueur > LONGUEUR_MAX[champ]) {
    return erreur(
      CODES.LONGUEUR,
      `Lexique « ${cle} » : ${LIBELLES[champ]} dépasse ${LONGUEUR_MAX[champ]} caractères (${longueur} saisis).`,
      cle, champ
    );
  }
  return null;
};

const validerEntree = (cle, v) => {
  if (!estObjet(v)) return erreur(CODES.INVALIDE, `Lexique « ${cle} » : objet { sg, pl, g, el, icon, court } attendu.`, cle);
  for (const champ of Object.keys(v)) {
    if (CHAMPS_NON_SURCHARGEABLES.includes(champ)) {
      return erreur(
        CODES.NON_SURCHARGEABLE,
        `Lexique « ${cle} » : « ${champ} » n'est pas modifiable par un domaine (il vient du lexique par défaut).`,
        cle, champ
      );
    }
    if (!CHAMPS.includes(champ)) return erreur(CODES.INVALIDE, `Lexique « ${cle} » : champ inconnu « ${champ} ».`, cle, champ);
  }
  for (const champ of ['sg', 'pl']) {
    const e = validerTexte(cle, champ, v[champ]);
    if (e) return e;
  }
  if (v.g != null && v.g !== 'm' && v.g !== 'f') return erreur(CODES.INVALIDE, `Lexique « ${cle} » : genre — 'm' ou 'f' attendu.`, cle, 'g');
  if (v.el != null && typeof v.el !== 'boolean') return erreur(CODES.INVALIDE, `Lexique « ${cle} » : élision — booléen attendu.`, cle, 'el');
  if (v.icon != null && typeof v.icon !== 'string') return erreur(CODES.INVALIDE, `Lexique « ${cle} » : icône — texte attendu.`, cle, 'icon');
  const eIcone = validerTexte(cle, 'icon', v.icon);
  if (eIcone) return eIcone;
  if (v.appo != null && typeof v.appo !== 'boolean') return erreur(CODES.INVALIDE, `Lexique « ${cle} » : apposition — booléen attendu.`, cle, 'appo');

  // Forme courte
  if (v.court != null) {
    if (!estObjet(v.court)) return erreur(CODES.INVALIDE, `Lexique « ${cle} » : forme courte — objet { sg, pl } attendu.`, cle, 'court');
    for (const champ of Object.keys(v.court)) {
      if (!CHAMPS_COURT.includes(champ)) return erreur(CODES.INVALIDE, `Lexique « ${cle} » : forme courte — champ inconnu « ${champ} ».`, cle, 'court');
    }
    for (const champ of ['sg', 'pl']) {
      const e = validerTexte(cle, `court.${champ}`, v.court[champ]);
      if (e) return e;
    }
    if (v.court.el != null && typeof v.court.el !== 'boolean') return erreur(CODES.INVALIDE, `Lexique « ${cle} » : forme courte — élision : booléen attendu.`, cle, 'court');
    if (rempli(v.court.pl) && !rempli(v.court.sg)) {
      return erreur(CODES.INCOMPLET, `Lexique « ${cle} » : la forme courte a un pluriel mais pas de singulier.`, cle, 'court');
    }
  }

  // Entrée sans singulier : que porte-t-elle d'autre qu'une icône ?
  const autreQuIcone = rempli(v.pl) || v.g != null || v.el != null || v.appo != null
    || (estObjet(v.court) && (rempli(v.court.sg) || rempli(v.court.pl)));

  // sg surchargé ⇒ pl, g, el obligatoires
  const manquants = [];
  if (!rempli(v.pl)) manquants.push('le pluriel');
  if (v.g !== 'm' && v.g !== 'f') manquants.push('le genre');
  if (typeof v.el !== 'boolean') manquants.push("l'élision");
  if (rempli(v.sg)) {
    if (manquants.length) {
      return erreur(
        CODES.INCOMPLET,
        `Lexique « ${cle} » : le singulier est modifié, il faut aussi renseigner ${manquants.join(', ')}.`,
        cle, 'sg'
      );
    }
  } else if (!connue(cle)) {
    // Clé ajoutée par l'admin : pas de défaut à compléter — une entrée sans singulier
    // serait inutilisable (le moteur rendrait « ‹clé› »). Une entrée VIDE reste admise
    // (elle est retirée au nettoyage).
    if (autreQuIcone || rempli(v.icon)) {
      return erreur(
        CODES.INCOMPLET,
        `Lexique « ${cle} » : cette clé n'existe pas dans le lexique par défaut, il faut renseigner le singulier, le pluriel, le genre et l'élision.`,
        cle, 'sg'
      );
    }
  } else if (LEXIQUE_DEFAUT[cle].derive_de && autreQuIcone) {
    // Clé dérivée sans singulier propre : elle suit son parent. Un pluriel, un genre, une élision
    // ou une forme courte posés seuls seraient ignorés dès que le parent est surchargé.
    return erreur(
      CODES.INCOMPLET,
      `Lexique « ${cle} » : cette clé suit « ${LEXIQUE_DEFAUT[cle].derive_de} » tant que son singulier est vide ; pour la modifier, renseignez le singulier, le pluriel, le genre et l'élision (seule l'icône se change à part).`,
      cle, 'sg'
    );
  }
  return null;
};

// null si valide ; sinon { code, message, cle?, champ? } (réponse 400).
const validerLexique = (lex) => {
  if (lex == null) return null;
  if (!estObjet(lex)) return erreur(CODES.INVALIDE, 'Lexique : objet attendu.');
  // Object.keys ne voit pas « __proto__ » quand l'objet vient d'un littéral ; JSON.parse en fait
  // une propriété propre : les deux lectures sont couvertes (getOwnPropertyNames).
  for (const cle of Object.getOwnPropertyNames(lex)) {
    const v = lex[cle];
    if (!CLE_RE.test(cle)) return erreur(CODES.INVALIDE, `Lexique : clé invalide « ${cle} » (lettres minuscules, chiffres et _ ; 40 caractères au plus).`, cle);
    if (cle === 'prototype' || cle in Object.prototype) return erreur(CODES.INVALIDE, `Lexique : clé réservée « ${cle} ».`, cle);
    if (v == null) continue; // ligne « vidée » côté admin : retour au défaut
    const e = validerEntree(cle, v);
    if (e) return e;
  }
  return null;
};

// Entrée redéclarée À L'IDENTIQUE du défaut (mêmes sg, pl, g, el ; rien d'autre, ou la même icône,
// la même forme courte, la même apposition) : elle ne dit rien, mais stockée elle ferait perdre à la
// clé la forme courte et l'apposition du défaut (« PT », « stock labo » : §1.3, sg surchargé).
const egaleAuDefaut = (cle, e) => {
  if (!connue(cle) || !e.sg) return false;
  const d = LEXIQUE_DEFAUT[cle];
  if (e.sg !== d.sg || e.pl !== (d.pl || d.sg) || e.g !== (d.g || 'm') || e.el !== (d.el === true)) return false;
  if (e.icon != null && e.icon !== (d.icon || '')) return false;
  if (e.appo != null && e.appo !== (d.appo === true)) return false;
  if (e.court != null) {
    const c = d.court;
    if (!c || e.court.sg !== c.sg || (e.court.pl ?? e.court.sg) !== (c.pl || c.sg) || (e.court.el != null && e.court.el !== c.el)) return false;
  }
  return true;
};

// Ne garde que les écarts non vides (une ligne « vidée » côté admin revient au défaut).
// À appeler sur un lexique VALIDÉ.
const nettoyerLexique = (lex) => {
  const out = {};
  if (!estObjet(lex)) return out;
  for (const [cle, v] of Object.entries(lex)) {
    if (!estObjet(v) || !CLE_RE.test(cle) || cle === 'prototype' || cle in Object.prototype) continue;
    const e = {};
    for (const champ of ['sg', 'pl', 'icon']) if (rempli(v[champ])) e[champ] = v[champ].trim();
    if (v.g === 'm' || v.g === 'f') e.g = v.g;
    if (typeof v.el === 'boolean') e.el = v.el;
    if (estObjet(v.court) && rempli(v.court.sg)) {
      e.court = { sg: v.court.sg.trim() };
      if (rempli(v.court.pl)) e.court.pl = v.court.pl.trim();
      if (typeof v.court.el === 'boolean') e.court.el = v.court.el;
    }
    if (typeof v.appo === 'boolean') e.appo = v.appo;
    if (Object.keys(e).length && !egaleAuDefaut(cle, e)) out[cle] = e;
  }
  return out;
};

module.exports = {
  validerLexique, nettoyerLexique,
  CODES_LEXIQUE: CODES, LEXIQUE_CARACTERES_INTERDITS: INTERDITS_RE, LEXIQUE_LONGUEUR_MAX: LONGUEUR_MAX,
};
